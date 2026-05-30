"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { ChipStageProps } from "../types";

// CHIP: 칩을 순서대로 탭해 배열. 완성 칩을 탭하면 제거(끝에서 되돌리기). 순서가 곧 정답.
export function ChipStage({ payload, disabled, onResponse }: ChipStageProps) {
  const [order, setOrder] = useState<number[]>([]);
  useEffect(() => {
    onResponse(null, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chipById = new Map(payload.chips.map((chip) => [chip.id, chip.text]));

  function report(next: number[]) {
    setOrder(next);
    onResponse({ order: next }, next.length === payload.chips.length && payload.chips.length > 0);
  }

  function place(id: number) {
    if (disabled || order.includes(id)) return;
    report([...order, id]);
  }
  function removeAt(position: number) {
    if (disabled) return;
    report(order.filter((_, index) => index !== position));
  }

  const remaining = payload.chips.filter((chip) => !order.includes(chip.id));
  const label = payload.variant === "order" ? "내가 만든 순서" : "완성한 문장";
  const placeholder =
    payload.variant === "order" ? "아래 조각을 순서대로 누르세요." : "아래 조각을 원문 순서대로 누르세요.";

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-[10px] font-bold tracking-wide text-blue-600">{label}</p>
        <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-xl border border-blue-100 bg-blue-50/40 p-2">
          {order.length === 0 ? (
            <span className="px-1 text-[12px] font-medium text-slate-400">{placeholder}</span>
          ) : (
            order.map((id, position) => (
              <button
                key={`${id}-${position}`}
                type="button"
                disabled={disabled}
                onClick={() => removeAt(position)}
                className="rounded-md bg-blue-600 px-2 py-1 font-mono text-[11.5px] font-bold text-white active:bg-blue-700"
              >
                <span className="mr-1 text-[9px] text-blue-200">{position + 1}</span>
                {chipById.get(id)}
              </button>
            ))
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {remaining.map((chip) => (
          <button
            key={chip.id}
            type="button"
            disabled={disabled}
            onClick={() => place(chip.id)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[12px] font-bold text-slate-700 transition active:border-blue-300 active:bg-blue-50"
          >
            {chip.text}
          </button>
        ))}
        {remaining.length === 0 && (
          <span className="px-1 text-[11px] font-medium text-slate-400">모든 조각을 배치했어요. 채점해 보세요.</span>
        )}
      </div>
    </div>
  );
}
