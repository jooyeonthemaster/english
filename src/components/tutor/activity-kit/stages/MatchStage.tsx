"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { MatchStageProps } from "../types";

// MATCH: 각 좌측 항목에 우측 보기 하나를 연결. 같은 우측을 두 번 못 쓰도록 1:1 강제.
export function MatchStage({ payload, disabled, onResponse }: MatchStageProps) {
  const [matches, setMatches] = useState<Record<string, string>>({});
  useEffect(() => {
    onResponse(null, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function assign(left: string, right: string) {
    if (disabled) return;
    const next = { ...matches };
    // 1:1: 다른 좌측이 이미 이 우측을 쓰고 있으면 해제
    for (const key of Object.keys(next)) {
      if (next[key] === right) delete next[key];
    }
    next[left] = next[left] === right ? "" : right;
    if (!next[left]) delete next[left];
    setMatches(next);
    const allDone = payload.leftItems.every((item) => next[item]);
    onResponse({ matches: next }, allDone);
  }

  const usedRights = new Set(Object.values(matches));

  return (
    <div className="space-y-3">
      <p className="text-[12px] font-medium text-slate-500">영단어마다 뜻을 하나씩 연결하세요. (1:1)</p>
      <div className="space-y-3">
        {payload.leftItems.map((left) => (
          <div key={left} className="border-l-2 border-slate-100 pl-3">
            <p className="mb-1.5 font-mono text-[13.5px] font-bold text-slate-900">{left}</p>
            <div className="flex flex-wrap gap-1.5">
              {payload.rightItems.map((right) => {
                const active = matches[left] === right;
                const usedElsewhere = !active && usedRights.has(right);
                return (
                  <button
                    key={`${left}-${right}`}
                    type="button"
                    disabled={disabled || usedElsewhere}
                    onClick={() => assign(left, right)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[11px] font-bold transition",
                      active
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : usedElsewhere
                          ? "border-slate-100 bg-slate-50 text-slate-300"
                          : "border-slate-100 bg-white text-slate-600 active:border-blue-200",
                    )}
                  >
                    {right}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
