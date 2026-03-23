export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-28 bg-muted rounded" />
          <div className="h-4 w-56 bg-muted rounded mt-2" />
        </div>
        <div className="h-10 w-28 bg-muted rounded-lg" />
      </div>
      {/* Follow-up reminder */}
      <div className="h-20 bg-muted rounded-xl" />
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="h-9 w-32 bg-muted rounded-lg" />
        <div className="h-9 w-32 bg-muted rounded-lg" />
        <div className="ml-auto h-9 w-40 bg-muted rounded-lg" />
      </div>
      {/* Table */}
      <div className="space-y-2">
        <div className="h-10 bg-muted rounded" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 bg-muted rounded" />
        ))}
      </div>
    </div>
  );
}
