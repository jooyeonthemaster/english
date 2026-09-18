export default function UnitLoading() {
  return (
    <div className="gd-page min-h-dvh px-5 pt-6">
      <div className="gd-skeleton h-3 w-16 animate-pulse" />
      <div className="gd-skeleton mt-3 h-6 w-56 animate-pulse" />
      <div className="gd-skeleton mt-5 h-24 animate-pulse rounded-2xl opacity-60" />
      <div className="mt-5 flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="gd-skeleton animate-pulse rounded-2xl opacity-50"
            style={{ height: "4.5rem" }}
          />
        ))}
      </div>
    </div>
  );
}
