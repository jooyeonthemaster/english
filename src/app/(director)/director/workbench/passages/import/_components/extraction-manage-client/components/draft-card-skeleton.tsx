"use client";

export function DraftCardSkeleton() {
  return (
    <div className="relative flex h-full min-h-[176px] min-w-0 flex-col gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Bar w="size-4" />
        <Bar w="w-8" h="h-4" />
        <Bar w="w-40" h="h-4" />
      </div>
      <div className="flex items-center gap-1.5">
        <Bar w="w-16" h="h-5" className="rounded-full" />
        <Bar w="w-14" h="h-5" className="rounded-full" />
        <Bar w="w-10" h="h-5" className="rounded-full" />
      </div>
      <div className="space-y-1.5">
        <Bar w="w-full" h="h-3" />
        <Bar w="w-[92%]" h="h-3" />
        <Bar w="w-[78%]" h="h-3" />
      </div>
      <div className="mt-auto">
        <Bar w="w-2/3" h="h-3" />
      </div>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/60 to-transparent motion-safe:animate-[shimmer_1.6s_ease-in-out_infinite]"
      />
      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

function Bar({ w, h = "h-3", className = "" }: { w: string; h?: string; className?: string }) {
  return <span className={`block rounded bg-slate-200 ${w} ${h} ${className}`} />;
}
