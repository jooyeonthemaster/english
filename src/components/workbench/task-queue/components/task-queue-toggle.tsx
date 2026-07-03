"use client";

import { ClipboardList } from "lucide-react";

import { useTaskQueue } from "../context";

export function TaskQueueToggle() {
  const { open, toggle } = useTaskQueue();
  const tooltip = open ? "작업 목록 닫기" : "작업 목록 열기";

  return (
    <button
      type="button"
      onClick={() => toggle()}
      aria-pressed={open}
      aria-label={tooltip}
      title={tooltip}
      className={
        "pointer-events-auto flex size-10 items-center justify-center rounded-xl border shadow-sm active:scale-[0.98] motion-safe:transition-colors motion-safe:duration-150 " +
        (open
          ? "border-blue-500 bg-blue-600 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700")
      }
    >
      <ClipboardList className="size-5" strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
