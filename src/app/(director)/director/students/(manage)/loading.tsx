export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header with title + button */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-32 bg-muted rounded" />
          <div className="h-4 w-48 bg-muted rounded mt-2" />
        </div>
        <div className="h-10 w-32 bg-muted rounded-lg" />
      </div>
      {/* Filter bar */}
      <div className="flex gap-3">
        <div className="h-10 w-40 bg-muted rounded-lg" />
        <div className="h-10 w-40 bg-muted rounded-lg" />
        <div className="h-10 w-64 bg-muted rounded-lg" />
      </div>
      {/* Student list */}
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 bg-muted rounded-xl" />
        ))}
      </div>
    </div>
  );
}
