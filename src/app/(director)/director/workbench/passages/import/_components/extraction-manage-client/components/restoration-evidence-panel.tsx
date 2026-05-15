"use client";

// NOTE: 현재 어디서도 import되지 않는 컴포넌트지만, 분리 작업 시점에 원본
// 단일 파일에 남아 있던 코드를 그대로 보존한다. 추후 검수 흐름이 부활할 때
// 다시 mount할 수 있도록 위치만 옮긴 상태.

import { CheckCircle2, Database, Layers } from "lucide-react";

import type {
  DraftProblemEvidenceAction,
  M1PassageDraftWithJob,
} from "../types";
import { formatPercent } from "../utils/format";
import {
  getDraftProblemEvidence,
  getEvidenceActions,
  getEvidenceQuestions,
  labelActionType,
  labelQuestionType,
} from "../utils/problem-evidence";
import { inferKnownSourceFromRaw } from "../utils/source-match";
import { SourceMatchSummary } from "./source-match-panel";

export function RestorationEvidencePanel({ draft }: { draft: M1PassageDraftWithJob }) {
  const problemEvidence = getDraftProblemEvidence(draft);
  const evidence = problemEvidence?.evidence ?? null;
  const questions = getEvidenceQuestions(draft);
  const actions = getEvidenceActions(draft);
  const topSource = draft.sourceMatches[0] ?? null;
  const selectedSource =
    draft.sourceMatches.find((match) => match.selected) ?? topSource;
  const inferredSource = selectedSource ? null : inferKnownSourceFromRaw(draft.rawText);
  const displaySource = selectedSource ?? inferredSource;
  const sourceHints = Array.isArray(evidence?.sourceHints) ? evidence.sourceHints : [];
  const unresolved = Array.isArray(evidence?.unresolved) ? evidence.unresolved : [];

  return (
    <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-blue-600" aria-hidden="true" />
            <span className="text-[13px] font-bold text-slate-950">
              문제 단서
            </span>
          </div>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
            {problemEvidence?.status ?? "SKIPPED"}
          </span>
        </div>
        <div className="space-y-3 px-4 py-3">
          {questions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {questions.slice(0, 6).map((question, index) => (
                <div
                  key={`${question.questionNumber ?? index}-${question.questionType ?? "UNKNOWN"}`}
                  className="min-w-[150px] flex-1 rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] font-bold text-blue-900">
                      {labelQuestionType(question.questionType, question.typeLabel)}
                    </span>
                    <span className="shrink-0 text-[11px] font-bold text-blue-600">
                      {formatPercent(question.confidence)}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[12px] text-slate-600">
                    {question.answer ? `정답 ${question.answer}` : "정답 단서 없음"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
              문제형 단서가 없거나 원문형 자료로 판단했습니다.
            </div>
          )}

          <EvidenceActionList actions={actions} unresolved={unresolved} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-emerald-600" aria-hidden="true" />
            <span className="text-[13px] font-bold text-slate-950">
              출처 활용
            </span>
          </div>
          <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
            {displaySource ? formatPercent(displaySource.confidence) : "NO MATCH"}
          </span>
        </div>
        <div className="space-y-3 px-4 py-3">
          {displaySource ? (
            <SourceMatchSummary match={displaySource} />
          ) : (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
              아직 확정 가능한 출처 후보가 없습니다. 문제 단서 기반 복원과 교사 검수를 우선합니다.
            </div>
          )}
          {sourceHints.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {sourceHints.slice(0, 5).map((hint) => (
                <span
                  key={hint}
                  className="rounded bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100"
                >
                  {hint}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function EvidenceActionList({
  actions,
  unresolved,
}: {
  actions: DraftProblemEvidenceAction[];
  unresolved: string[];
}) {
  const uniqueActions = actions
    .filter((action) => action.type)
    .filter((action, index, arr) => {
      const key = `${action.type}:${action.target ?? ""}:${action.value ?? ""}`;
      return (
        arr.findIndex(
          (candidate) =>
            `${candidate.type}:${candidate.target ?? ""}:${candidate.value ?? ""}` === key,
        ) === index
      );
    })
    .slice(0, 8);

  if (uniqueActions.length === 0 && unresolved.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-slate-500">
        <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" />
        추가 복원 액션 없이 원문/출처 매칭 중심으로 처리합니다.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {uniqueActions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {uniqueActions.map((action, index) => (
            <span
              key={`${action.type}-${index}`}
              className="rounded bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700"
              title={action.reason ?? undefined}
            >
              {labelActionType(action.type)}
            </span>
          ))}
        </div>
      ) : null}
      {unresolved.length > 0 ? (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-800 ring-1 ring-amber-100">
          {unresolved.slice(0, 2).join(" / ")}
        </div>
      ) : null}
    </div>
  );
}
