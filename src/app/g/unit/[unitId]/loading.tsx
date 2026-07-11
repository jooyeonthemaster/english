export default function UnitLoading() {
  return (
    <div className="mx-auto min-h-dvh max-w-md px-5 pt-6">
      <div className="h-3 w-16 animate-pulse rounded bg-[var(--gd-line)]" />
      <div className="mt-3 h-6 w-56 animate-pulse rounded bg-[var(--gd-line)]" />
      <div className="mt-5 h-24 animate-pulse rounded-2xl bg-[var(--gd-line)] opacity-60" />
      <div className="mt-5 flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-18 animate-pulse rounded-2xl bg-[var(--gd-line)] opacity-50" style={{ height: "4.5rem" }} />
        ))}
      </div>
    </div>
  );
}
