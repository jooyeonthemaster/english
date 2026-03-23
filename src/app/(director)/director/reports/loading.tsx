export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-32 bg-muted rounded" />
          <div className="h-4 w-56 bg-muted rounded mt-2" />
        </div>
        <div className="h-10 w-36 bg-muted rounded-lg" />
      </div>
      {/* Filters */}
      <div className="flex gap-3">
        <div className="h-9 w-32 bg-muted rounded-lg" />
        <div className="h-9 w-32 bg-muted rounded-lg" />
      </div>
      {/* Report list */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 bg-muted rounded-xl" />
        ))}
      </div>
    </div>
  );
}
