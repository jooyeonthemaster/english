"use client";

import { X } from "lucide-react";

import { useTaskQueue } from "../context";
import { TaskQueuePanel } from "./task-queue-panel";

export function TaskQueueDrawer() {
  const { open, setOpen } = useTaskQueue();

  return (
    <div
      className={
        "fixed bottom-40 right-8 z-50 w-[min(520px,calc(100vw-40px))] motion-safe:transition-[opacity,transform] motion-safe:duration-150 " +
        (open
          ? "opacity-100"
          : "pointer-events-none -translate-y-1 opacity-0")
      }
      aria-hidden={!open}
    >
      <div className="relative h-[min(480px,calc(100vh-220px))] overflow-hidden rounded-lg bg-white shadow-2xl ring-1 ring-slate-200/80 [&>section>div:first-child]:pr-14">
        <button
          type="button"
          onClick={() => setOpen(false)}
          tabIndex={open ? 0 : -1}
          className="absolute right-3 top-3 z-10 inline-flex size-8 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-900"
          aria-label="작업 목록 닫기"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
        <TaskQueuePanel />
      </div>
    </div>
  );
}
