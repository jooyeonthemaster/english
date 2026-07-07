// ============================================================================
// 학생 시험 리포트 — 상태 리컨실(자기치유) — 서버 전용
//
// 상세 GET·워크스페이스 로드 시, 진행 상태로 멈춘(라우트 프로세스가 죽은) 레코드를
// 되돌린다. CAS(updateMany where 상태 고정)로 동시 진행 중인 실제 작업을 침범하지 않는다.
// 체크포인트(examMap/analysis JSON)는 보존되므로 DRAFT 로 되돌려도 진행분은 남는다.
//
// 좀비 판정 기준(A8): ANALYZING 은 행 updatedAt 이 아니라 aiMeta.runStartedAt —
// analyze 라우트가 진입 시 기록하고 배치 커밋마다 갱신한다. 행 updatedAt 은 편집 등
// 무관한 쓰기로도 갱신되어 좀비를 연명시키기 때문. runStartedAt 이 없으면(구 데이터)
// updatedAt 폴백. 학생 리포트(GENERATING) 쪽은 generate 라우트가 별도 진행
// 타임스탬프를 기록하지 않아 현행(updatedAt) 유지 — 무관 쓰기(채점 저장 등)가
// GENERATING 좀비를 연명시킬 수 있는 알려진 한계.
// ============================================================================

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { parseReadState } from "./schemas";
import type { ReadState, ReadStatus } from "./types";

/** 진행 상태가 이 시간을 넘겨 갱신되지 않으면 좀비로 간주 */
export const EXAM_ANALYSIS_STALE_MS = 10 * 60 * 1000;

/** READING 이 이 시간을 넘겨 시작되지 않으면 좀비로 간주(read 라우트 maxDuration 여유) */
export const EXAM_READ_STALE_MS = 6 * 60 * 1000;

function isStale(updatedAt: Date): boolean {
  return Date.now() - updatedAt.getTime() > EXAM_ANALYSIS_STALE_MS;
}

/** aiMeta JSON(raw)에서 runStartedAt(epoch ms) 추출 — 없거나 손상 시 null */
function readRunStartedAt(aiMeta: unknown): number | null {
  if (!aiMeta || typeof aiMeta !== "object" || Array.isArray(aiMeta)) return null;
  const value = (aiMeta as Record<string, unknown>).runStartedAt;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** 분석 상태 리컨실(v3: 상태는 DRAFT|ANALYZING|ANALYZED|FAILED).
 *  - ANALYZING + stale(aiMeta.runStartedAt 기준) → DRAFT (체크포인트=examMap/analysis JSON 보존)
 *    라우트 재개 루프가 DRAFT+sourceFiles 에서 examMap 존재 여부로 E1a 재실행/이어가기를 판단.
 *  - 그 외 → 현 status 유지 */
export async function reconcileExamAnalysis(analysis: {
  id: string;
  status: string;
  updatedAt: Date;
  /** 선택 — 미제공(목록 라우트 등) 시 ANALYZING 판정에 한해 지연 조회한다 */
  aiMeta?: unknown;
}): Promise<string> {
  if (analysis.status === "ANALYZING") {
    let aiMetaRaw = analysis.aiMeta;
    if (aiMetaRaw === undefined) {
      const row = await prisma.examAnalysis.findUnique({
        where: { id: analysis.id },
        select: { aiMeta: true },
      });
      aiMetaRaw = row?.aiMeta ?? null;
    }
    const runStartedAt = readRunStartedAt(aiMetaRaw);
    const basisMs = runStartedAt ?? analysis.updatedAt.getTime();
    if (Date.now() - basisMs <= EXAM_ANALYSIS_STALE_MS) return analysis.status;

    await prisma.examAnalysis.updateMany({
      where: { id: analysis.id, status: "ANALYZING" },
      data: { status: "DRAFT" },
    });
    return "DRAFT";
  }
  return analysis.status;
}

/** readState JSON(raw)에서 readStartedAt(epoch ms) 추출 — 없거나 손상 시 null.
 *  parseReadState 는 스키마상 이 키를 흘리므로(스트립) raw 에서 직접 읽는다. */
function readReadStartedAt(raw: unknown): number | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = (raw as Record<string, unknown>).readStartedAt;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** 답안 판독(readState) 리컨실 — READING 좀비 자기치유.
 *  - READING + stale(readStartedAt 기준, 없으면 updatedAt 폴백) → FAILED
 *    (readState JSON status 경로 CAS 로 동시 진행 중인 실제 판독을 침범하지 않는다.
 *     version 은 건드리지 않아 병렬 예약 CAS 를 깨지 않는다.)
 *  - 그 외 → 현 readState.status 유지
 *  GET 상세/read 라우트 진입 시 호출(reconcileStudentReport 와 동일 패턴). */
export async function reconcileStudentRead(student: {
  id: string;
  academyId: string;
  /** raw JSONB — parseReadState 로 파싱하고 readStartedAt 만 raw 에서 읽는다 */
  readState: unknown;
  updatedAt: Date;
}): Promise<ReadStatus> {
  const prev = parseReadState(student.readState);
  if (prev.status !== "READING") return prev.status;

  const startedAt = readReadStartedAt(student.readState) ?? student.updatedAt.getTime();
  if (Date.now() - startedAt <= EXAM_READ_STALE_MS) return "READING";

  const failed: ReadState = { ...prev, status: "FAILED", error: "판독 시간 초과(자동 정리)" };
  await prisma.examReportStudent.updateMany({
    where: {
      id: student.id,
      academyId: student.academyId,
      deletedAt: null,
      readState: { path: ["status"], equals: "READING" },
    },
    data: { readState: failed as unknown as Prisma.InputJsonValue },
  });
  return "FAILED";
}

/** 학생 리포트 상태 리컨실.
 *  - GENERATING + stale → FAILED
 *  - 그 외 → 현 reportStatus 유지 */
export async function reconcileStudentReport(student: {
  id: string;
  reportStatus: string;
  updatedAt: Date;
}): Promise<string> {
  if (!isStale(student.updatedAt)) return student.reportStatus;

  if (student.reportStatus === "GENERATING") {
    await prisma.examReportStudent.updateMany({
      where: { id: student.id, reportStatus: "GENERATING" },
      data: { reportStatus: "FAILED" },
    });
    return "FAILED";
  }
  return student.reportStatus;
}
