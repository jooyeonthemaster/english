"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { ChoiceStageProps } from "../types";

function optionText(option: unknown): { label: string; before?: string; after?: string } {
  if (option && typeof option === "object") {
    const record = option as Record<string, unknown>;
    return {
      label: String(record.label ?? ""),
      before: record.before ? String(record.before) : undefined,
      after: record.after ? String(record.after) : undefined,
    };
  }
  return { label: String(option ?? "") };
}

export function ChoiceStage({ payload, disabled, onResponse }: ChoiceStageProps) {
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    onResponse(null, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(index: number) {
    if (disabled) return;
    setSelected(index);
    onResponse({ selectedIndex: index }, true);
  }

  return (
    <div className="space-y-3">
      <ChoicePrompt payload={payload} />
      <div className="grid gap-1.5">
        {payload.options.map((option, index) => {
          const opt = optionText(option);
          const active = selected === index;
          return (
            <button
              key={`${opt.label}-${index}`}
              type="button"
              data-testid="tutor-choice-option"
              disabled={disabled}
              onClick={() => pick(index)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left text-[13px] font-bold leading-5 transition",
                active
                  ? "border-blue-500 bg-blue-50/60 text-blue-800"
                  : "border-slate-100 bg-white text-slate-700 active:border-blue-200",
              )}
            >
              <span className="block">{opt.label}</span>
              {(opt.before || opt.after) && (
                <span className="mt-1 block text-[11px] font-medium leading-5 text-slate-500">
                  {opt.before && <span className="block">앞: {opt.before}</span>}
                  {opt.after && <span className="block">뒤: {opt.after}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChoicePrompt({ payload }: { payload: ChoiceStageProps["payload"] }) {
  // 어휘류: 큰 stem
  if (payload.variant === "stem") {
    return (
      <div className="border-l-2 border-slate-200 pl-3">
        <p className="font-mono text-xl font-bold leading-7 text-slate-900">{payload.stem ?? payload.prompt}</p>
        {payload.source?.sentenceIndex !== undefined && (
          <p className="mt-1 text-[10px] font-bold text-slate-400">문장 {Number(payload.source.sentenceIndex) + 1} 기반</p>
        )}
      </div>
    );
  }
  // 문장 삽입: 제시문 강조
  if (payload.variant === "insertion") {
    return (
      <div className="space-y-2">
        <div className="border-l-2 border-blue-300 pl-3">
          <p className="mb-1 text-[10px] font-bold text-blue-600">제시문</p>
          <p className="font-mono text-[13.5px] font-bold leading-7 text-slate-900">
            {payload.targetSentence ?? payload.prompt}
          </p>
        </div>
        {payload.prompt && payload.prompt !== payload.targetSentence && (
          <p className="break-words whitespace-pre-wrap border-l-2 border-slate-200 pl-3 font-mono text-[12.5px] font-medium leading-6 text-slate-700">
            {payload.prompt}
          </p>
        )}
      </div>
    );
  }
  // 어법/어휘 적절성: 마커가 들어간 본문
  if (payload.variant === "marked_passage") {
    return (
      <div className="space-y-2">
        <p className="break-words whitespace-pre-wrap border-l-2 border-slate-200 pl-3 font-mono text-[12.5px] font-medium leading-6 text-slate-700">
          {payload.markedPassage ?? payload.prompt}
        </p>
        {payload.markers?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {payload.markers.map((marker) => (
              <span
                key={marker.no}
                className="rounded-md bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 ring-1 ring-blue-100"
              >
                {marker.no}. {marker.text}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  }
  // 글의 순서: (A)(B)(C) 단락 카드 — 핵심 버그(보기만 보이던 문제) 해결
  if (payload.variant === "order_paragraphs") {
    return (
      <div className="space-y-2">
        {payload.prompt && (
          <p className="break-words whitespace-pre-wrap border-l-2 border-slate-300 pl-3 font-mono text-[12.5px] font-bold leading-6 text-slate-800">
            {payload.prompt}
          </p>
        )}
        <div className="grid gap-1.5">
          {(payload.paragraphs ?? []).map((para) => (
            <div key={para.label} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
              <p className="text-[10px] font-bold text-blue-600">({para.label})</p>
              <p className="mt-0.5 font-mono text-[12.5px] font-medium leading-6 text-slate-800">{para.text}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <p className="break-words whitespace-pre-wrap border-l-2 border-slate-200 pl-3 font-mono text-[13.5px] font-bold leading-7 text-slate-900">
      {payload.prompt}
    </p>
  );
}
