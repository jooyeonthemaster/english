"use client";

// 팔 다중 선택 — arm.group 별 묶음, 가설은 툴팁. 행마다 생성 설정 한 줄.

import { Info } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ArmConfig } from "@/lib/qgen-lab/types";
import { cn } from "@/lib/utils";
import { armConfigLine, DIFFICULTY_SHORT, GROUP_LABEL, GROUP_ORDER } from "./format-utils";

export function ArmPicker({
  arms,
  selected,
  onChange,
}: {
  arms: ArmConfig[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const sel = new Set(selected);
  const groups = GROUP_ORDER.map((g) => ({ g, arms: arms.filter((a) => a.group === g) })).filter((x) => x.arms.length);

  const toggle = (id: string) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // 레지스트리 순서 유지(카드 배치가 매번 같게).
    onChange(arms.map((a) => a.id).filter((x) => next.has(x)));
  };
  const setGroup = (ids: string[], on: boolean) => {
    const next = new Set(sel);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    onChange(arms.map((a) => a.id).filter((x) => next.has(x)));
  };

  return (
    <div className="space-y-2.5">
      {groups.map(({ g, arms: list }) => {
        const ids = list.map((a) => a.id);
        const allOn = ids.every((id) => sel.has(id));
        return (
          <div key={g}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[0.6875rem] font-bold tracking-[0.1em] text-stone-500 uppercase">
                {GROUP_LABEL[g]} <span className="font-mono text-stone-400">{list.length}</span>
              </span>
              <button
                type="button"
                onClick={() => setGroup(ids, !allOn)}
                className="text-[0.6875rem] font-semibold text-stone-500 hover:text-stone-900"
              >
                {allOn ? "모두 해제" : "모두 선택"}
              </button>
            </div>
            <ul className="overflow-hidden rounded-md border border-stone-300 bg-white">
              {list.map((arm) => {
                const on = sel.has(arm.id);
                return (
                  <li key={arm.id} className="border-b border-stone-100 last:border-b-0">
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-2 px-2.5 py-1.5",
                        on ? "bg-[#f3efe4]" : "hover:bg-stone-50",
                      )}
                    >
                      <Checkbox
                        checked={on}
                        onCheckedChange={() => toggle(arm.id)}
                        className="mt-0.5 border-stone-400 data-[state=checked]:border-stone-900 data-[state=checked]:bg-stone-900"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="rounded-[3px] bg-stone-800 px-1 font-mono text-[0.5625rem] leading-[0.875rem] font-bold text-[#fffefa]">
                            {DIFFICULTY_SHORT[arm.difficulty]}
                          </span>
                          <span className="font-mono text-[0.75rem] font-bold text-stone-900">{arm.id}</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-stone-400 hover:text-stone-700" onClick={(e) => e.preventDefault()}>
                                <Info className="size-3" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-xs text-[0.75rem] leading-5">
                              <p className="font-semibold">{arm.label}</p>
                              <p className="mt-1 opacity-90">{arm.hypothesis}</p>
                            </TooltipContent>
                          </Tooltip>
                        </span>
                        <span className="block truncate text-[0.6875rem] text-stone-600">{arm.label}</span>
                        <span className="block truncate font-mono text-[0.625rem] text-stone-400">{armConfigLine(arm)}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {arms.length === 0 && <p className="text-[0.75rem] text-stone-400">팔 레지스트리가 비어 있습니다</p>}
    </div>
  );
}
