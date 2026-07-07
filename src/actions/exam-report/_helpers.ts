// ============================================================================
// 학생 시험 리포트 — 서버 레이어 공용 헬퍼
//
// "use server" 파일(crud/students/share)은 async 함수만 export 할 수 있으므로,
// 서버액션이 공유하는 입력 타입·결과 타입·순수 헬퍼는 (directive 없는) 이 모듈에
// 모아 둔다. 테넌트 가드는 exams/_helpers.ts 관례를 답습한다.
// ============================================================================

import { Prisma } from "@prisma/client";
import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ExamSourceType, ExamType } from "@/lib/exam-report/types";

// ── 인증 게이트 ─────────────────────────────────────────────────────────────

/** 세션 없으면 throw — 호출부(서버액션)의 try/catch 가 표준 에러로 변환한다. */
export async function requireAuth() {
  const staff = await getStaffSession();
  if (!staff) throw new Error("인증이 필요합니다.");
  return staff;
}

// ── 낙관적 락(CAS) 결과 ─────────────────────────────────────────────────────
// updateMany count 0 → throw 아닌 판별 유니온 반환(청사진 계약).

export type CasResult<E extends string = "VERSION_CONFLICT"> =
  | { ok: true }
  | { ok: false; error: E };

// ── 테넌트 격리 가드 (soft-delete 제외) ─────────────────────────────────────

/** 시험 분석이 이 학원 소유인지 확인. 미존재/타테넌트/삭제 시 throw. */
export async function assertExamAnalysisBelongsToAcademy(
  id: string,
  academyId: string,
): Promise<void> {
  const row = await prisma.examAnalysis.findFirst({
    where: { id, academyId, deletedAt: null },
    select: { id: true },
  });
  if (!row) throw new Error("시험 분석을 찾을 수 없습니다.");
}

/** 학생 리포트 행이 이 학원 소유인지 확인. 미존재/타테넌트/삭제 시 throw. */
export async function assertExamStudentBelongsToAcademy(
  id: string,
  academyId: string,
): Promise<void> {
  const row = await prisma.examReportStudent.findFirst({
    where: { id, academyId, deletedAt: null },
    select: { id: true },
  });
  if (!row) throw new Error("학생 리포트를 찾을 수 없습니다.");
}

// ── Json 저장 경계 ──────────────────────────────────────────────────────────
// 도메인 타입(zod 파스 결과)은 optional 필드 때문에 Prisma InputJsonValue 에
// 직접 대입되지 않는다. 저장 직전 이 경계 함수로만 단언한다.
export function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

// ── 서버액션 입력 타입 ──────────────────────────────────────────────────────

export interface CreateExamAnalysisInput {
  title: string;
  schoolName?: string;
  grade?: string;
  examType: ExamType;
  examYear?: number;
  semester?: string;
  sourceType: ExamSourceType;
}

export interface UpdateExamMetaInput {
  title?: string;
  schoolName?: string | null;
  grade?: string | null;
  examType?: ExamType;
  examYear?: number | null;
  semester?: string | null;
}

/** 업로드 완료된 시험지 페이지 경로. page 미지정 시 배열 순서로 부여. */
export interface ExamSourcePage {
  path: string;
  page?: number;
}

export interface AttachExamSourcesInput {
  pages: ExamSourcePage[];
  /** 지정 시 같은 사진으로 학생1 동시 생성('학생 답안지' 흐름). */
  firstStudentName?: string;
}

export interface UpdateStudentGradingInput {
  responses: unknown;
  classAverage?: number | null;
  gradeBand?: string | null;
  /** true 면 정오표 확정 — 전 응답 reviewed:true 로 마킹. */
  gradingConfirmed?: boolean;
}
