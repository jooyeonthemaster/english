export default function Loading() {
  return (
    <div className="space-y-6 p-4 md:p-6 animate-pulse">
      {/* Header */}
      <div className="h-8 w-28 bg-muted rounded" />
      {/* Children tabs */}
      <div className="flex gap-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-10 w-24 bg-muted rounded-lg" />
        ))}
      </div>
      {/* Grade chart */}
      <div className="h-64 bg-muted rounded-xl" />
      {/* Grade list */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-muted rounded-xl" />
        ))}
      </div>
    </div>
  );
}
