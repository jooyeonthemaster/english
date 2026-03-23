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
      {/* Summary card */}
      <div className="h-32 bg-muted rounded-xl" />
      {/* Invoice list */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 bg-muted rounded-xl" />
        ))}
      </div>
    </div>
  );
}
