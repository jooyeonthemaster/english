export default function Loading() {
  return (
    <div className="space-y-6 p-4 md:p-6 animate-pulse">
      {/* Header */}
      <div>
        <div className="h-8 w-40 bg-muted rounded" />
        <div className="h-4 w-56 bg-muted rounded mt-2" />
      </div>
      {/* Children selector */}
      <div className="flex gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-12 w-32 bg-muted rounded-xl" />
        ))}
      </div>
      {/* Dashboard cards */}
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-muted rounded-xl" />
        ))}
      </div>
      {/* Activity section */}
      <div className="h-48 bg-muted rounded-xl" />
    </div>
  );
}
