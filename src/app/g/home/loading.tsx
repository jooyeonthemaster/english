export default function HomeLoading() {
  return (
    <div className="gd-page min-h-dvh px-5 pt-5">
      <div className="gd-skeleton h-3 w-24 animate-pulse" />
      <div className="gd-skeleton mt-2 h-6 w-48 animate-pulse" />
      <div className="gd-skeleton mt-4 h-20 animate-pulse rounded-2xl opacity-60" />
      <div className="gd-skeleton mt-3.5 animate-pulse rounded-xl" style={{ height: "3.25rem" }} />
      <div className="mt-6 flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="gd-skeleton h-16 animate-pulse rounded-2xl opacity-50" />
        ))}
      </div>
    </div>
  );
}
