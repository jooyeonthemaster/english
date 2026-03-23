export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 bg-muted rounded" />
        <div className="h-8 w-48 bg-muted rounded" />
      </div>
      {/* Invoice detail card */}
      <div className="h-48 bg-muted rounded-xl" />
      {/* Line items */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 bg-muted rounded-xl" />
        ))}
      </div>
      {/* Payment info */}
      <div className="h-32 bg-muted rounded-xl" />
    </div>
  );
}
