"use client";

import { PanelBottomOpen } from "lucide-react";
import type { PointerEventHandler, Ref } from "react";

import { useTaskQueue } from "../context";

export function TaskQueueToggle({
  buttonRef,
  onDragPointerDown,
  shouldIgnoreClick,
}: {
  buttonRef?: Ref<HTMLButtonElement>;
  onDragPointerDown?: PointerEventHandler<HTMLButtonElement>;
  shouldIgnoreClick?: () => boolean;
}) {
  const { open, toggle } = useTaskQueue();
  const tooltip = "작업 목록 열기";

  return (
    <button
      ref={buttonRef}
      type="button"
      onPointerDown={onDragPointerDown}
      onClick={(event) => {
        if (shouldIgnoreClick?.()) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        toggle();
      }}
      aria-pressed={open}
      aria-label={tooltip}
      title={tooltip}
      className={
        "pointer-events-auto inline-flex h-11 cursor-grab touch-none select-none items-center gap-2 rounded-full border px-4 text-[13px] font-bold shadow-lg motion-safe:transition-colors motion-safe:duration-150 active:cursor-grabbing " +
        (open
          ? "border-blue-500 bg-blue-600 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700")
      }
    >
      <PanelBottomOpen className="size-4" aria-hidden="true" />
      작업 목록
    </button>
  );
}
