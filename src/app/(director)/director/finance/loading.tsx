export default function Loading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      {/* KPI summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[120px] rounded-xl border border-gray-100 bg-muted" />
        ))}
      </div>
      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-[280px] rounded-xl bg-muted" />
        <div className="h-[280px] rounded-xl bg-muted" />
      </div>
      {/* Expense table */}
      <div className="h-[300px] rounded-xl bg-muted" />
    </div>
  );
}
