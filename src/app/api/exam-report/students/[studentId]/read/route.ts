// ============================================================================
// [은퇴 — 26-07-08 플로우 개편] POST .../read — E2 답안 판독(vision)
//
// 사진 채점(E2) 기능 폐기 결정으로 UI 진입점(read-step 사진 판독 타일,
// use-verdict-state.runRead 배선)이 전부 제거되어 이 라우트를 호출하는 화면은
// 없습니다. 롤백 안전을 위해 라우트 본체는 삭제하지 않고 유지합니다.
// 기존 판독 데이터(readState/sourceFiles)의 열람은 이 라우트와 무관합니다.
// ============================================================================
//
// (원 사양) POST /api/exam-report/students/[studentId]/read — E2 답안 판독(vision)
//
// 학생 마킹 사진(sourceFiles)을 부모 examMap 기준으로 판독해 StudentResponse 를
// 프리필한다. 무과금. 남용 가드 = 학생당 readRuns 3회 캡(선증가). 동시실행 차단은
// readState.status(READING) + version CAS. 결과 responses 는 mergeReadIntoResponses
// 로 기존 강사 확정분(reviewed:true)을 보존해 병합 저장하고, readState 를 갱신한다.
// gradingConfirmed 여부와 무관하게 확정분은 병합으로만 보존(해제하지 않음).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { requireStaff } from "@/lib/extraction/api-utils";
import { prisma } from "@/lib/prisma";
import { downloadAsBuffer } from "@/lib/supabase-storage";
import type { AtlasChatImageInput } from "@/lib/atlas-chat-rest";
import { prepareLlmImages } from "@/lib/exam-report/llm-images";
import { getExamReportAiConfig } from "@/lib/exam-report/model-config";
import { readStudentPaper } from "@/lib/exam-report/student-read";
import {
  carryStudentAnswers,
  clampEarnedPoints,
  computeScoreSummary,
  mergeReadIntoResponses,
} from "@/lib/exam-report/grading";
import { reconcileStudentRead } from "@/lib/exam-report/reconcile";
import {
  parseExamMap,
  parseReadState,
  parseScoreSummary,
  parseStudentResponses,
} from "@/lib/exam-report/schemas";
import { EXAM_READ_MAX_RUNS, type ReadState } from "@/lib/exam-report/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEADLINE_MS = 270_000;

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/**
 * readState 를 version CAS 없이 갱신하되 readRuns 를 현재 저장값 아래로 되돌리지
 * 않는다(단조 증가 보장) — 폴백/실패 경로가 나중 예약의 높은 readRuns 를 되감아
 * 캡을 우회시키는 것을 막는다. read-before-write 라 완전 원자적이진 않지만,
 * reconcileStudentRead(readStartedAt 기준 좀비 정리)로 동시 진입이 차단된 위에
 * 얹는 심층 방어다.
 */
async function writeReadStateMonotonic(
  studentId: string,
  academyId: string,
  next: ReadState,
): Promise<void> {
  const cur = await prisma.examReportStudent
    .findFirst({
      where: { id: studentId, academyId, deletedAt: null },
      select: { readState: true },
    })
    .catch(() => null);
  const curRuns = parseReadState(cur?.readState).readRuns;
  const readState: ReadState = { ...next, readRuns: Math.max(curRuns, next.readRuns) };
  await prisma.examReportStudent
    .updateMany({
      where: { id: studentId, academyId, deletedAt: null },
      data: { readState: toJson(readState), version: { increment: 1 } },
    })
    .catch(() => {});
}

function parsePages(value: unknown): { path: string; page: number }[] {
  if (!Array.isArray(value)) return [];
  const pages: { path: string; page: number }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const path = (item as Record<string, unknown>).path;
    const page = (item as Record<string, unknown>).page;
    if (typeof path !== "string" || path.length === 0) continue;
    pages.push({ path, page: typeof page === "number" ? page : pages.length });
  }
  return pages;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { studentId } = await params;

  // ── 소유 검증 + 부모 examMap 로드(테넌트 가드, 존재 비노출 404) ──────────────
  const student = await prisma.examReportStudent.findFirst({
    where: { id: studentId, academyId: auth.academyId, deletedAt: null },
    select: {
      id: true,
      examAnalysisId: true,
      version: true,
      updatedAt: true,
      readState: true,
      sourceFiles: true,
      responses: true,
      scoreSummary: true,
      examAnalysis: { select: { structure: true, deletedAt: true } },
    },
  });
  if (!student || student.examAnalysis.deletedAt) {
    return NextResponse.json(
      { error: "학생 리포트를 찾을 수 없습니다.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const examMap = parseExamMap(student.examAnalysis.structure);
  if (!examMap || examMap.questions.length === 0) {
    return NextResponse.json(
      { error: "시험 문항 분석이 완료된 후에 답안을 판독할 수 있습니다.", code: "MAP_MISSING" },
      { status: 400 },
    );
  }

  const pages = parsePages(student.sourceFiles);
  if (pages.length === 0) {
    return NextResponse.json(
      { error: "판독할 학생 시험지 사진이 없습니다. 먼저 사진을 업로드하세요.", code: "NO_SOURCE" },
      { status: 400 },
    );
  }

  const prevRead = parseReadState(student.readState);
  // 좀비 자기치유: READING 이 readStartedAt 기준 stale 면 FAILED 로 정리(version 미변경).
  // 무관한 쓰기로 갱신되는 updatedAt 대신 readStartedAt 을 기준으로 신선도를 판정한다.
  const healedReadStatus = await reconcileStudentRead({
    id: studentId,
    academyId: auth.academyId,
    readState: student.readState,
    updatedAt: student.updatedAt,
  });
  if (healedReadStatus === "READING") {
    return NextResponse.json(
      { error: "이미 답안을 판독 중입니다.", code: "ALREADY_READING" },
      { status: 409 },
    );
  }
  if (prevRead.readRuns >= EXAM_READ_MAX_RUNS) {
    return NextResponse.json(
      { error: `답안 판독 재실행 한도(${EXAM_READ_MAX_RUNS}회)를 초과했습니다.`, code: "READ_LIMIT" },
      { status: 429 },
    );
  }

  // ── 예약 CAS: readRuns 선증가(남용 가드) + READING 마킹(동시실행 차단) ──────
  const reservedRuns = prevRead.readRuns + 1;
  const reservingState: ReadState = {
    ...prevRead,
    status: "READING",
    readRuns: reservedRuns,
    // 좀비 판정 기준 — 예약(판독 시작) 시각. 무관한 쓰기로 갱신되지 않는다.
    readStartedAt: Date.now(),
    error: undefined,
  };
  const reserve = await prisma.examReportStudent.updateMany({
    where: { id: studentId, academyId: auth.academyId, version: student.version, deletedAt: null },
    data: { readState: toJson(reservingState), version: { increment: 1 } },
  });
  if (reserve.count !== 1) {
    return NextResponse.json(
      { error: "상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요.", code: "CONFLICT" },
      { status: 409 },
    );
  }
  const reservedVersion = student.version + 1;
  const model = getExamReportAiConfig("studentRead").model;

  try {
    // ── 이미지 로드 ─────────────────────────────────────────────────────────
    const sorted = [...pages].sort((a, b) => a.page - b.page);
    let images: AtlasChatImageInput[];
    try {
      const buffers = await Promise.all(sorted.map((p) => downloadAsBuffer(p.path)));
      // 총량 예산 재압축 — 전 페이지 1콜 페이로드의 게이트웨이 502 방지
      images = await prepareLlmImages(buffers);
    } catch {
      await failRead(studentId, auth.academyId, reservingState, "이미지 로드 실패");
      return NextResponse.json(
        { error: "학생 시험지 사진을 불러오지 못했습니다.", code: "IMAGE_LOAD_FAILED" },
        { status: 500 },
      );
    }

    // ── E2 판독(내부 폴백 — throw 없음) ──────────────────────────────────────
    const result = await readStudentPaper(images, examMap, {
      deadlineAt: Date.now() + DEADLINE_MS,
    });
    if (result.failed) {
      // LLM 콜 실패 — 전량 UNKNOWN 폴백을 READ 로 저장하면 기존 프리필이 파괴되고
      // '판독 완료' 로 오인된다. responses 는 건드리지 않고 FAILED 로만 마킹한다.
      // readRuns 는 선증가분 유지(단조 증가) — 캡의 abuse 가드 성격을 지킨다.
      await failRead(studentId, auth.academyId, reservingState, "판독 실패");
      return NextResponse.json(
        { error: "학생 답안을 판독하지 못했습니다. 사진이 선명한지 확인 후 다시 시도해 주세요.", code: "READ_FAILED" },
        { status: 500 },
      );
    }
    // 결함 수리: 판독행(fresh)은 studentAnswer 필드를 만들지 않아, 학생 링크 제출분
    // (reviewed:false MANUAL)의 서답형 답 원문이 병합 교체로 통째 소실됐다 —
    // prior 동번호 행의 studentAnswer 를 승계한다(판독 writtenAnswer 와 대조 공존).
    const priorResponses = parseStudentResponses(student.responses);
    const merged = carryStudentAnswers(
      priorResponses,
      mergeReadIntoResponses(priorResponses, result.responses),
    );
    const readState: ReadState = {
      status: "READ",
      readRuns: reservedRuns,
      readAt: new Date().toISOString(),
      model,
      uncertainties: result.uncertainties,
      aiMeta: { ...result.aiMeta, model },
    };

    // 결함 수리: 판독 커밋이 정오 status 를 갱신하면서 scoreSummary 를 재계산하지 않아
    // detail GET/students-tab 점수가 판독 전 stale 값으로 남았다 — answer 라우트와
    // 동일하게 clamp→computeScoreSummary(기존 classAverage/gradeBand 승계)를 함께 기록.
    const clamped = clampEarnedPoints(examMap, merged);
    const priorSummary = parseScoreSummary(student.scoreSummary);
    const scoreSummary = computeScoreSummary(examMap, clamped, {
      classAverage: priorSummary?.classAverage ?? null,
      gradeBand: priorSummary?.gradeBand ?? null,
    });

    // ── 최종 커밋(예약 버전 CAS) — 병렬 편집 시 responses 클로버 방지 폴백 ──────
    const write = await prisma.examReportStudent.updateMany({
      where: { id: studentId, academyId: auth.academyId, version: reservedVersion, deletedAt: null },
      data: {
        responses: toJson(clamped),
        scoreSummary: toJson(scoreSummary),
        readState: toJson(readState),
        version: { increment: 1 },
      },
    });
    if (write.count !== 1) {
      // 예약 후 다른 쓰기(채점 저장 등)가 끼어듦 — responses 는 건드리지 않고 readState 만
      // 갱신해 기존 편집을 보존한다. 판독 결과는 응답 페이로드로 반환(클라가 병합 저장).
      // readRuns 는 단조 증가(monotonic)로 써 낮은 값으로 되감지 않는다.
      await writeReadStateMonotonic(studentId, auth.academyId, readState);
      return NextResponse.json({
        responses: merged,
        readState,
        uncertainties: result.uncertainties,
        persisted: false,
      });
    }

    return NextResponse.json({
      // DB 에 커밋된 값(clamped)과 응답을 일치시킨다.
      responses: clamped,
      readState,
      uncertainties: result.uncertainties,
      persisted: true,
    });
  } catch (err) {
    await failRead(
      studentId,
      auth.academyId,
      reservingState,
      err instanceof Error ? err.message.slice(0, 300) : "판독 실패",
    );
    return NextResponse.json(
      { error: "답안 판독 중 오류가 발생했습니다.", code: "READ_FAILED" },
      { status: 500 },
    );
  }
}

/** 판독 실패 마킹 — readRuns 는 선증가분 유지(재실행 캡 계산 일관·단조 증가). */
async function failRead(
  studentId: string,
  academyId: string,
  reservingState: ReadState,
  error: string,
): Promise<void> {
  await writeReadStateMonotonic(studentId, academyId, {
    ...reservingState,
    status: "FAILED",
    error,
  });
}
