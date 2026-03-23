export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div>
        <div className="h-8 w-40 bg-muted rounded" />
        <div className="h-4 w-64 bg-muted rounded mt-2" />
      </div>
      {/* Passage selector */}
      <div className="h-12 bg-muted rounded-lg max-w-md" />
      {/* Generation settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-28 bg-muted rounded" />
              <div className="h-10 bg-muted rounded-lg" />
            </div>
          ))}
        </div>
        <div className="h-80 bg-muted rounded-xl" />
      </div>
    </div>
  );
}
