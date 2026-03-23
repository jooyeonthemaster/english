export default function Loading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      {/* KPI summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[120px] rounded-xl border border-gray-100 bg-muted" />
        ))}
      </div>
      {/* Filter bar */}
      <div className="flex gap-3">
        <div className="h-10 w-40 bg-muted rounded-lg" />
        <div className="h-10 w-40 bg-muted rounded-lg" />
        <div className="h-10 w-64 bg-muted rounded-lg" />
      </div>
      {/* Invoice table */}
      <div className="h-[400px] rounded-xl border border-gray-100 bg-muted" />
    </div>
  );
}
