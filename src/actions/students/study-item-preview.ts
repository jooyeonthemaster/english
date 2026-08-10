"use server";

// ============================================================================
// 학습 문항 원형 복원 — 디렉터 "학습 분석" 문항 상세 팝업용
//
// 로그에는 itemKey 만 남는다(문항 본문은 저장하지 않음 — 지문 원본이 정본).
// 스터디 컴파일러가 taskId 시드로 결정론적이므로, 같은 리포트·같은 모드로 다시
// 컴파일하면 학생이 본 문항이 그대로 복원된다(선지 순서·디코이까지 동일).
// 계약: docs/director-console-spec.md §4.2.2.
// ============================================================================

import { PRIME_REPORT_MARKER } from "@/actions/workbench/passage-constants";
import { toErrorMessage, type StudyActionResult } from "@/actions/study-assignments/_shared";
import { requireStaffAuth } from "@/lib/auth";
import { parseAnalysisReportForPreview } from "@/lib/passage-report/analysis-report/preview-parse";
import { prisma } from "@/lib/prisma";
import { compileStudyPlan } from "@/lib/worksheet-study/compile";
import { resolveStudyConfig, type StudyItem } from "@/lib/worksheet-study/types";

export interface StudyItemPreview {
  /** 복원된 문항 — null 이면 학습지가 편집돼 이 문항이 더는 존재하지 않음 */
  item: StudyItem | null;
  /** 현재 컴파일 결과가 학생이 풀 때와 다른 구성인지(학습지 편집 후) */
  planStale: boolean;
}

/**
 * 문항 원형 복원. academyId 스코프 필수 — state·assignment·report 3중 교차검증.
 * 학습지가 편집돼 itemKey 가 사라졌으면 item=null(호출부가 안내를 렌더).
 */
export async function getStudyItemPreview(input: {
  studentId: string;
  assignmentId: string;
  stageId: string;
  itemKey: string;
  /** 학생이 풀 때의 planHash — 다르면 planStale 로 알린다 */
  planHash?: string | null;
}): Promise<StudyActionResult<StudyItemPreview>> {
  try {
    const staff = await requireStaffAuth();

    const state = await prisma.worksheetStudyState.findFirst({
      where: {
        academyId: staff.academyId,
        studentId: input.studentId,
        assignmentId: input.assignmentId,
      },
      select: { taskId: true, reportId: true, planHash: true },
    });
    if (!state) return { success: true, data: { item: null, planStale: false } };

    const assignment = await prisma.studyAssignment.findFirst({
      where: { id: input.assignmentId, academyId: staff.academyId },
      select: { title: true, payload: true },
    });
    if (!assignment) return { success: true, data: { item: null, planStale: false } };

    const report = await prisma.passageReport.findFirst({
      where: { id: state.reportId, academyId: staff.academyId, deletedAt: null },
      select: { title: true, pages: true, generationPlan: true },
    });
    // 영어 PRIME 문서만 스터디 대상 — 그 외는 애초에 문항이 없다
    if (!report || report.generationPlan !== PRIME_REPORT_MARKER) {
      return { success: true, data: { item: null, planStale: false } };
    }

    const parsed = parseAnalysisReportForPreview(report.pages);
    if (!parsed) return { success: true, data: { item: null, planStale: false } };

    const config = resolveStudyConfig(assignment.payload);
    if (config.mode === "off") return { success: true, data: { item: null, planStale: false } };

    const plan = compileStudyPlan({
      report: parsed,
      mode: config.mode,
      taskId: state.taskId,
      reportTitle: report.title || assignment.title,
    });

    const stage = plan.stages.find((s) => s.id === input.stageId);
    const item = stage?.items.find((i) => i.key === input.itemKey) ?? null;
    const planStale = Boolean(input.planHash && input.planHash !== plan.planHash);

    return { success: true, data: { item, planStale } };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, "문항을 불러오는 중 오류가 발생했습니다."),
    };
  }
}
