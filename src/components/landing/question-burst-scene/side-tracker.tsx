"use client";

import { QUESTION_SAMPLES } from "../shared/mock-data";

export function SideTracker({
  currentIndex,
  completed,
  completedCount,
  totalCount,
  autoPlay,
  onTogglePlay,
  onSelect,
  onReset,
}: {
  currentIndex: number;
  completed: Set<number>;
  completedCount: number;
  totalCount: number;
  autoPlay: boolean;
  onTogglePlay: () => void;
  onSelect: (i: number) => void;
  onReset: () => void;
}) {
  return (
    <aside className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col shadow-[0_15px_40px_-15px_rgba(0,0,0,0.05)] h-[360px] lg:h-[680px]">
      <div className="flex items-center justify-between mb-3 px-2">
        <div className="text-[11px] uppercase tracking-[0.18em] font-extrabold text-gray-500">
          실시간 생성 트래커
        </div>
        <div className="text-[12px] font-mono font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded">
          {completedCount}/{totalCount}
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex gap-[3px] mb-4 px-2">
        {QUESTION_SAMPLES.map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-[3px] rounded-full transition-colors ${
              i === currentIndex
                ? "bg-[#3B82F6]"
                : completed.has(i)
                ? "bg-blue-300"
                : "bg-gray-200"
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1.5 flex-1 overflow-auto pr-1 custom-scrollbar">
        {QUESTION_SAMPLES.map((q, i) => {
          const isCurrent = i === currentIndex;
          const isDone = completed.has(i);
          return (
            <button
              key={q.no}
              onClick={() => onSelect(i)}
              className={`relative w-full flex items-center h-10 pl-2.5 pr-2.5 rounded-lg cursor-pointer transition-all text-left border ${
                isCurrent
                  ? "border-[#3B82F6] bg-blue-50 shadow-sm"
                  : isDone
                  ? "border-blue-100 bg-white"
                  : "border-transparent hover:bg-gray-50"
              }`}
            >
              <span
                className="text-[12px] font-mono font-black w-[20px]"
                style={{
                  color: isCurrent ? "#1D4ED8" : isDone ? "#60A5FA" : "#9CA3AF",
                }}
              >
                {q.no}
              </span>
              <span
                className={`flex-1 text-[12px] truncate ${
                  isCurrent
                    ? "font-bold text-blue-900"
                    : isDone
                    ? "font-bold text-gray-700"
                    : "font-semibold text-gray-500"
                }`}
              >
                {q.name}
              </span>
              {isCurrent && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-pulse" />
              )}
              {isDone && !isCurrent && (
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 11 11"
                  className="text-blue-400"
                  fill="none"
                >
                  <path
                    d="M1 5.5 L4.5 9 L10 1.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
        <button
          onClick={onTogglePlay}
          className={`flex-1 text-[11px] uppercase tracking-[0.15em] font-extrabold py-2 rounded-lg border transition-colors ${
            autoPlay
              ? "bg-[#3B82F6] text-white border-[#3B82F6]"
              : "bg-white text-gray-700 border-gray-200 hover:border-blue-300"
          }`}
        >
          {autoPlay ? "■ 일시정지" : "▶ 자동재생"}
        </button>
        <button
          onClick={onReset}
          className="px-3 text-[11px] uppercase tracking-[0.15em] font-extrabold py-2 rounded-lg border border-gray-200 text-gray-700 hover:border-blue-300 transition-colors"
        >
          ↺ 초기화
        </button>
      </div>
    </aside>
  );
}
