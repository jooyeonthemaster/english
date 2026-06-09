"use client";

import { Layers } from "lucide-react";

import type { M1PassageDraftWithJob } from "../types";
import {
  readRestorationMetadata,
  recommendationLabel,
} from "../utils/restoration-metadata";
import { formatExtractedTextForDisplay } from "../utils/display-text";

export function ComparisonPanel({ draft }: { draft: M1PassageDraftWithJob }) {
  const restoration = readRestorationMetadata(draft);
  if (!restoration) return null;
  const aiRestored = restoration.aiRestoration?.restoredText?.trim() ?? "";
  const displayAiRestored = formatExtractedTextForDisplay(aiRestored);
  const comparison = restoration.comparison ?? null;
  const sourceMatch = restoration.sourceMatch ?? null;
  // 표시할 정보가 전혀 없으면 패널 자체를 숨긴다.
  if (!aiRestored && !comparison && !sourceMatch) return null;

  const agreementPct =
    typeof comparison?.agreement === "number"
      ? Math.round(comparison.agreement * 100)
      : null;
  const recLabel = recommendationLabel(comparison?.recommendation ?? null);
  const differences = Array.isArray(comparison?.differences)
    ? comparison.differences.filter(
        (d): d is string => typeof d === "string" && d.trim().length > 0,
      )
    : [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-violet-600" aria-hidden="true" />
          <span className="text-[13px] font-bold text-slate-950">
            출처 ↔ AI 복원 비교
          </span>
          {restoration.finalMethod ? (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
              최종: {restoration.finalMethod}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {agreementPct != null ? (
            <span className="rounded bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-800 ring-1 ring-violet-100">
              일치도 {agreementPct}%
            </span>
          ) : null}
          <span
            className={
              "rounded px-2 py-0.5 text-[11px] font-bold ring-1 " + recLabel.className
            }
          >
            {recLabel.label}
          </span>
        </div>
      </div>
      <div className="space-y-3 px-4 py-3">
        {aiRestored ? (
          <details className="rounded-md border border-slate-200 bg-slate-50">
            <summary className="cursor-pointer select-none px-3 py-2 text-[12px] font-bold text-slate-700">
              AI 복원본 (출처 미사용 추론)
              <span className="ml-2 text-[11px] font-normal text-slate-500">
                {restoration.aiRestoration?.status ?? ""} ·{" "}
                {restoration.aiRestoration?.method ?? ""}
              </span>
            </summary>
            <div className="whitespace-pre-wrap border-t border-slate-200 bg-white px-3 py-2.5 text-[13px] leading-6 text-slate-800">
              {displayAiRestored}
            </div>
          </details>
        ) : null}
        {differences.length > 0 ? (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-900 ring-1 ring-amber-100">
            <div className="mb-1 font-bold">두 결과가 다른 부분</div>
            <ul className="list-disc space-y-0.5 pl-4">
              {differences.slice(0, 6).map((diff) => (
                <li key={diff}>{diff}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
