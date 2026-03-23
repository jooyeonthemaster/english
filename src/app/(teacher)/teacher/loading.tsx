export default function Loading() {
  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 animate-pulse">
      {/* Header */}
      <div>
        <div className="h-8 w-40 bg-muted rounded" />
        <div className="h-4 w-56 bg-muted rounded mt-2" />
      </div>
      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[120px] bg-muted rounded-xl" />
        ))}
      </div>
      {/* Two column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-[320px] bg-muted rounded-xl" />
        <div className="space-y-6">
          <div className="h-[200px] bg-muted rounded-xl" />
          <div className="h-[200px] bg-muted rounded-xl" />
        </div>
      </div>
    </div>
  );
}
