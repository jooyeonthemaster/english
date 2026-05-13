"use client";

export function DraftCardSkeleton() {
  return (
    <div className="flex h-full min-w-0 animate-pulse flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="size-3.5 shrink-0 rounded bg-slate-200" />
        <div className="h-3.5 w-8 shrink-0 rounded bg-slate-200" />
        <div className="h-4 w-32 rounded bg-slate-200" />
      </div>
      <div className="flex items-center gap-1">
        <div className="h-4 w-14 rounded-full bg-slate-200" />
        <div className="h-4 w-12 rounded-full bg-slate-200" />
        <div className="h-4 w-8 rounded-full bg-slate-200" />
      </div>
      <div className="space-y-1.5">
        <div className="h-2.5 w-full rounded bg-slate-200" />
        <div className="h-2.5 w-[92%] rounded bg-slate-200" />
        <div className="h-2.5 w-[78%] rounded bg-slate-200" />
      </div>
      <div className="mt-auto h-3 w-2/3 rounded bg-slate-200" />
    </div>
  );
}
