export default function HomeLoading() {
  return (
    <div className="mx-auto min-h-dvh max-w-md px-5 pt-5">
      <div className="h-3 w-24 animate-pulse rounded bg-[var(--gd-line)]" />
      <div className="mt-2 h-6 w-48 animate-pulse rounded bg-[var(--gd-line)]" />
      <div className="mt-4 h-20 animate-pulse rounded-2xl bg-[var(--gd-line)] opacity-60" />
      <div className="mt-3.5 h-13 animate-pulse rounded-xl bg-[var(--gd-line)]" style={{ height: "3.25rem" }} />
      <div className="mt-6 flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-[var(--gd-line)] opacity-50" />
        ))}
      </div>
    </div>
  );
}
