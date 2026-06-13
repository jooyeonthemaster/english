export function RosterSkeleton() {
  return (
    <div className="divide-y divide-[#F2F4F6]" aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex h-12 items-center gap-3 px-3">
          <div className="size-4 shrink-0 rounded bg-[#F2F4F6]" />
          <div className="size-8 shrink-0 rounded-full bg-[#F2F4F6]" />
          <div className="h-3 w-28 rounded bg-[#F2F4F6]" />
          <div className="ml-auto h-3 w-16 rounded bg-[#F2F4F6]" />
          <div className="h-3 w-12 rounded bg-[#F2F4F6]" />
        </div>
      ))}
    </div>
  );
}
