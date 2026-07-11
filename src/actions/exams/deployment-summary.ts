"use server";

// ============================================================================
// 시험지 목록 — 배포 현황 요약 (26-07-09 시험지 배포·OMR 대개편, 설계 §5 V6)
//
// 목록 카드의 미니 배지("N/M 응시" · "채점 완료") 전용 읽기 액션. 카드 목록
// 렌더를 블로킹하지 않도록 클라이언트가 마운트 후 현재 페이지 id 배열로만
// 호출한다(exam-list-client.tsx).
//
// 집계 규약:
//  - assignedAt IS NOT NULL 행만 = 배포 할당분. 레거시 exam-taking(CBT) 행은
//    assignedAt 이 없어 자연히 제외된다(무회귀, assignments.ts §46-48 미러).
//  - assigned  = 할당 전체(상태 무관)
//  - submitted = SUBMITTED + GRADED (제출을 마친 학생)
//  - graded    = GRADED (채점까지 확정)
//  - 테넌트 가드: exam 릴레이션 경유 academyId 교차검증 — 타 학원 시험지 id 를
//    섞어 보내도 그 행은 집계에서 빠질 뿐 어떤 정보도 새지 않는다.
// ============================================================================

import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isMissingColumnError } from "./_exam-subject-where";
import {
  toErrorMessage,
  type AssignmentActionResult,
} from "./_assignments-shared";

/** 목록 카드 미니 배지용 요약 — 행이 없으면(할당 0) 맵에 키 자체가 없다. */
export interface ExamDeploymentSummary {
  examId: string;
  /** 할당된 학생 수(상태 무관 전체) */
  assigned: number;
  /** 제출을 마친 학생 수(SUBMITTED + GRADED) */
  submitted: number;
  /** 채점 완료 학생 수(GRADED) */
  graded: number;
}

/** IN 절 상한 — 목록 화면은 페이지 단위 호출이라 통상 수십 개, 방어적 캡만 둔다. */
const MAX_SUMMARY_IDS = 500;

/**
 * 시험지 id 배열 → { examId: 요약 } 맵. groupBy(examId×status) 1쿼리 집계.
 * 읽기 전용(revalidate 없음) — 배지 외 어떤 상태도 바꾸지 않는다.
 */
export async function getExamDeploymentSummaries(
  examIds: string[],
): Promise<AssignmentActionResult<Record<string, ExamDeploymentSummary>>> {
  try {
    const staff = await requireStaffAuth();
    const ids = [...new Set(examIds)]
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .slice(0, MAX_SUMMARY_IDS);
    if (ids.length === 0) return { success: true, data: {} };

    const rows = await prisma.examSubmission.groupBy({
      by: ["examId", "status"],
      where: {
        examId: { in: ids },
        assignedAt: { not: null }, // 배포 할당분만 — 레거시 CBT 행 제외
        exam: { academyId: staff.academyId },
      },
      _count: { _all: true },
    });

    const data: Record<string, ExamDeploymentSummary> = {};
    for (const row of rows) {
      const entry = (data[row.examId] ??= {
        examId: row.examId,
        assigned: 0,
        submitted: 0,
        graded: 0,
      });
      const count = row._count._all;
      entry.assigned += count;
      if (row.status === "SUBMITTED" || row.status === "GRADED") {
        entry.submitted += count;
      }
      if (row.status === "GRADED") entry.graded += count;
    }
    return { success: true, data };
  } catch (error) {
    // 배포 컬럼(assignedAt) 미ALTER DB(P2022) — 배지만 미표시, 목록은 그대로.
    if (isMissingColumnError(error)) return { success: true, data: {} };
    return {
      success: false,
      error: toErrorMessage(error, "배포 현황 조회 중 오류가 발생했습니다."),
    };
  }
}
