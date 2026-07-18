"use client";

// ============================================================================
// 시험지 총평 패널 — 편집 가능한 총평 필드 + 읽기전용 집계(난이도/유형 분포).
//
// 원래 우측 문항 패널의 "총평" 탭 안에 있었으나, 총평은 **문항이 아니라 시험지
// 전체** 단위라 per-문항 패널과 축이 다르다. 그래서 워크스페이스 헤더의
// 「시험지 총평」 시트로 분리했다(「시험지 원본」과 동일 패턴). 편집 저장은
// analysis-step 의 저장 파이프라인(handleEditExamLevel → updateAnalysisEdits)을
// 그대로 타므로 여기선 값·핸들러만 받는다.
// ============================================================================

import type { ExamLevelAnalysis } from "@/lib/exam-report/types";
import { EditableAnalysisField } from "./analysis-edit-panel";
import { ExamSynthesisPanel } from "./exam-synthesis-panel";

export function ExamOverviewPanel({
  examLevel,
  disabled,
  onEdit,
}: {
  examLevel: ExamLevelAnalysis | null;
  disabled: boolean;
  onEdit: (patch: Partial<ExamLevelAnalysis>) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* 총평 편집 — 읽기전용이던 유일한 AI 산출물을 손댈 수 있게 한다 */}
      {examLevel ? (
        <>
          <EditableAnalysisField
            label="시험지 총평"
            value={examLevel.overview}
            onCommit={(next) => onEdit({ overview: next })}
            disabled={disabled}
            minRows={5}
          />
          {examLevel.trapOverview && (
            <EditableAnalysisField
              label="함정 총평"
              value={examLevel.trapOverview}
              onCommit={(next) => onEdit({ trapOverview: next })}
              disabled={disabled}
              minRows={3}
            />
          )}
          {examLevel.scopeInference && (
            <EditableAnalysisField
              label="출제 범위 추정"
              value={examLevel.scopeInference}
              onCommit={(next) => onEdit({ scopeInference: next })}
              disabled={disabled}
            />
          )}
          <p className="text-[10.5px] text-slate-400">
            총평은 학생 리포트에 그대로 실려요 — 고치면 바로 반영됩니다.
          </p>
        </>
      ) : (
        <p className="py-6 text-center text-[12px] text-slate-400">
          모든 문항 분석이 끝나면 시험지 전체 총평이 생성됩니다.
        </p>
      )}
      {/* 난이도 프로필·유형 분포만 남긴다 — 집계라 편집 대상이 아니다(읽기 전용).
          총평·함정 총평·범위 추정은 위에서 편집 필드로 그리므로 hideNarrative 로
          읽기전용 사본을 끈다(같은 문구가 두 번 쌓이던 문제 — 유저 피드백). */}
      <ExamSynthesisPanel examLevel={examLevel} hideOverview hideNarrative />
    </div>
  );
}
