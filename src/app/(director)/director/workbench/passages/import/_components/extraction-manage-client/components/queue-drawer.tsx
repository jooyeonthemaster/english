"use client";

import { X } from "lucide-react";

import { QueuePanel } from "../../shared/queue-panel";

interface QueueDrawerProps {
  open: boolean;
  activeJobId: string | null;
  refreshKey: number;
  onClose: () => void;
  onDeleteActiveJob: () => void;
  onOpenJob: (id: string) => void;
}

export function QueueDrawer({
  open,
  activeJobId,
  refreshKey,
  onClose,
  onDeleteActiveJob,
  onOpenJob,
}: QueueDrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed bottom-40 right-8 z-50 w-[min(520px,calc(100vw-40px))]">
      <div className="relative max-h-[min(620px,calc(100vh-220px))] overflow-y-auto rounded-lg bg-white shadow-2xl ring-1 ring-slate-200/80 [&>section>div:first-child]:pr-14">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 inline-flex size-8 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-900"
          aria-label="작업 목록 닫기"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
        <QueuePanel
          activeJobId={activeJobId}
          refreshKey={refreshKey}
          onDeleteActiveJob={onDeleteActiveJob}
          onOpenJob={onOpenJob}
        />
      </div>
    </div>
  );
}
