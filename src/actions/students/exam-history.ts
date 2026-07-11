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

// ── 타입 계약(전부 컴파일 시 소거 — "use server" 검증과 무관) ────────────────

export interface ExamHistoryActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

export type ExamHistoryTrendDirection = "UP" | "FLAT" | "DOWN";

export interface ExamHistorySummary {
  /** 채점 완료 응시 수(INTERNAL+EXTERNAL) */
  totalSittings: number;
  /** 점수율 확정(scorePct≠null) 회차 평균(소수 1자리) — 확정 0회면 null */
  avgScorePct: number | null;
  /** 최근 3회(점수 확정분) 방향 — 확정 2회 미만이면 null(판단 불가) */
  trend: ExamHistoryTrendDirection | null;
  /** 가장 최근 확정 점수율 — 없으면 null */
  latestScorePct: number | null;
}

export interface StudentExamHistoryData {
  /** 날짜 오름차순 시계열 — 차트/히트맵의 회차 축 정본 */
  sittings: TrendSitting[];
  summary: ExamHistorySummary;
}

// ── 내부 헬퍼(비export — "use server" 제약) ──────────────────────────────────

/** 추세 방향 판정 임계(±3%p) — 미세 등락은 "유지(FLAT)"로 흡수한다 */
const TREND_THRESHOLD_PCT = 3;

function summarize(sittings: TrendSitting[]): ExamHistorySummary {
  const scored = sittings
    .map((s) => s.scorePct)
    .filter((pct): pct is number => pct != null);

  const avgScorePct =
    scored.length > 0
      ? Math.round((scored.reduce((sum, pct) => sum + pct, 0) / scored.length) * 10) / 10
      : null;

  // 최근 3회(확정분) 창에서 첫 회차 대비 마지막 회차의 변화량으로 방향 판정.
  const window = scored.slice(-3);
  let trend: ExamHistoryTrendDirection | null = null;
  if (window.length >= 2) {
    const delta = window[window.length - 1] - window[0];
    trend =
      delta >= TREND_THRESHOLD_PCT ? "UP" : delta <= -TREND_THRESHOLD_PCT ? "DOWN" : "FLAT";
  }

  return {
    totalSittings: sittings.length,
    avgScorePct,
    trend,
    latestScorePct: scored.length > 0 ? scored[scored.length - 1] : null,
  };
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
          : "응시 이력을 불러오는 중 오류가 발생했습니다.",
    };
  }
}
