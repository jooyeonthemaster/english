"use client";

import { Database } from "lucide-react";

import type { M1PassageDraftWithJob, SourceMatchDisplay } from "../types";
import { formatPercent } from "../utils/format";
import { getDraftProblemEvidence } from "../utils/problem-evidence";
import { inferKnownSourceFromRaw } from "../utils/source-match";

export function SourceMatchPanel({ draft }: { draft: M1PassageDraftWithJob }) {
  const topSource = draft.sourceMatches[0] ?? null;
  const selectedSource =
    draft.sourceMatches.find((match) => match.selected) ?? topSource;
  const inferredSource = selectedSource
    ? null
    : inferKnownSourceFromRaw(draft.rawText);
  const displaySource = selectedSource ?? inferredSource;
  const evidence = getDraftProblemEvidence(draft)?.evidence ?? null;
  const sourceHints = Array.isArray(evidence?.sourceHints)
    ? evidence.sourceHints
    : [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-slate-500" aria-hidden="true" />
          <span className="text-[13px] font-bold text-slate-950">
            출처 활용
          </span>
        </div>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
          {displaySource ? formatPercent(displaySource.confidence) : "NO MATCH"}
        </span>
      </div>
      <div className="space-y-3 px-4 py-3">
        {displaySource ? (
          <SourceMatchSummary match={displaySource} />
        ) : (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
            아직 확정 가능한 출처 후보가 없습니다.
          </div>
        )}
        {sourceHints.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {sourceHints.slice(0, 5).map((hint) => (
              <span
                key={hint}
                className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200"
              >
                {hint}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function SourceMatchSummary({ match }: { match: SourceMatchDisplay }) {
  const sourceRef =
    typeof match.sourceRef === "string" && match.sourceRef.startsWith("http")
      ? match.sourceRef
      : null;

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-bold text-slate-900">
            {match.title ?? match.sourceRef ?? "출처 후보"}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-600">
            <span>{match.method}</span>
            {match.publisher ? <span>{match.publisher}</span> : null}
            {match.year ? <span>{match.year}</span> : null}
          </div>
        </div>
        <span className="shrink-0 rounded bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
          {match.selected ? "SELECTED" : "CANDIDATE"}
        </span>
      </div>
      {sourceRef ? (
        <a
          href={sourceRef}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block truncate text-[11px] font-semibold text-blue-700 underline-offset-2 hover:underline"
        >
          {sourceRef}
        </a>
      ) : null}
    </div>
  );
}
