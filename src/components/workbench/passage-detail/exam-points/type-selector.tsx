"use client";

import { EXAM_TYPE_GROUPS } from "../constants";

interface TypeSelectorProps {
  typeCounts: Record<string, number>;
  totalQuestions: number;
  activeTypes: string[];
  setTypeCount: (id: string, count: number) => void;
  setTypeCounts: (v: Record<string, number>) => void;
}

export function TypeSelector({
  typeCounts,
  totalQuestions,
  activeTypes,
  setTypeCount,
  setTypeCounts,
}: TypeSelectorProps) {
  return (
    <>
      {/* Type groups with per-type counters */}
      <div className="space-y-4">
        {EXAM_TYPE_GROUPS.map((group) => (
          <div key={group.group}>
            <span className="text-[11px] font-semibold text-slate-400 tracking-wider">{group.group}</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {group.items.map((item) => {
                const count = typeCounts[item.id] || 0;
                const active = count > 0;
                return (
                  <div
                    key={item.id}
                    className={`inline-flex items-center h-8 rounded-lg border transition-all duration-150 ${
                      active
                        ? "bg-blue-50 border-blue-300"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setTypeCount(item.id, count + 1)}
                      className={`h-full px-2.5 text-[12px] font-medium transition-colors ${
                        active ? "text-blue-700" : "text-slate-500 hover:text-blue-600"
                      }`}
                    >
                      {item.label}
                    </button>
                    {active && (
                      <div className="flex items-center gap-0.5 pr-1 border-l border-blue-200">
                        <button
                          type="button"
                          onClick={() => setTypeCount(item.id, count - 1)}
                          className="w-6 h-6 flex items-center justify-center text-blue-400 hover:text-blue-600 text-[14px] font-bold"
                        >
                          -
                        </button>
                        <span className="w-4 text-center text-[12px] font-bold text-blue-700">{count}</span>
                        <button
                          type="button"
                          onClick={() => setTypeCount(item.id, count + 1)}
                          className="w-6 h-6 flex items-center justify-center text-blue-400 hover:text-blue-600 text-[14px] font-bold"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Total counter */}
      {totalQuestions > 0 && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-blue-50 border border-blue-100">
          <span className="text-[13px] font-medium text-blue-800">
            총 <strong>{totalQuestions}</strong>문제
            <span className="text-blue-500 ml-2 text-[11px]">
              ({activeTypes.length}개 유형)
            </span>
          </span>
          <button
            type="button"
            onClick={() => setTypeCounts({})}
            className="text-[11px] text-blue-500 hover:text-blue-700 font-medium"
          >
            초기화
          </button>
        </div>
      )}
    </>
  );
}
