"use server";

// ============================================================================
// 학생 상세 "응시 이력" 탭 — 이력 조회 서버 액션 (유닛 V5, 설계문서 §5-V5)
//
// 집계 정본은 src/lib/exam-scoring/trend.ts 의 aggregateStudentExamHistory
// (INTERNAL ExamSubmission GRADED + EXTERNAL ExamReportStudent 통합 시계열,
// AI 0콜 결정론)를 그대로 재사용한다. 이 액션은 그 위에 인증·테넌트 가드와
// UI 요약(응시 수·평균 점수율·최근 추세 방향)만 얹는다.
//
// 계약:
//  - requireStaffAuth + student.academyId 교차검증(다른 학원 studentId 는
//    존재 여부도 노출하지 않는다 — "학생을 찾을 수 없습니다").
//  - 반환 봉투는 assignments 관례({ success, error?, data? }) 미러.
//  - 추세 방향은 점수율 확정(scorePct≠null) 회차만으로 판정 — 미확정 회차를
//    0점으로 취급하는 오판을 금지한다. 확정 2회 미만이면 null(판단 불가).
// ============================================================================

import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  aggregateStudentExamHistory,
  type TrendSitting,
} from "@/lib/exam-scoring/trend";
import {
  summarize,
  type ExamHistorySummary,
} from "@/lib/exam-scoring/summarize";

// ── 타입 계약 ────────────────────────────────────────────────────────────────
// 요약 계산·타입 정본은 lib/exam-scoring/summarize.ts (v3 N-18 — 시험 탭
// 클라 복제와의 드리프트 차단). ⚠ "use server" 모듈에서 `export type` 재수출은
// Turbopack 서버 액션 변환이 런타임 바인딩을 만들어 ReferenceError 500 을
// 던진다(실측) — 타입 소비처는 반드시 lib 에서 직접 import 한다.

export interface ExamHistoryActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

export interface StudentExamHistoryData {
  /** 날짜 오름차순 시계열 — 차트/히트맵의 회차 축 정본 */
  sittings: TrendSitting[];
  summary: ExamHistorySummary;
}

// ── 공개 액션 ────────────────────────────────────────────────────────────────

/**
 * 학생 1명의 채점 완료 응시 이력(통합 시계열) + UI 요약.
 * 이력 0건은 오류가 아니라 정상 빈 상태(sittings: []) — UI 가 빈 상태를 그린다.
 */
export async function getStudentExamHistory(
  studentId: string,
): Promise<ExamHistoryActionResult<StudentExamHistoryData>> {
  try {
    const staff = await requireStaffAuth();

    const student = await prisma.student.findFirst({
      where: { id: studentId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!student) {
      return { success: false, error: "학생을 찾을 수 없습니다." };
    }

    const sittings = await aggregateStudentExamHistory(studentId, staff.academyId);
    return { success: true, data: { sittings, summary: summarize(sittings) } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error && error.message
          ? error.message
          : "응시 기록을 불러오는 중 오류가 발생했습니다.",
    };
  }
}
