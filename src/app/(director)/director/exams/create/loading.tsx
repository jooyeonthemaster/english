export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="h-8 w-36 bg-muted rounded" />
      {/* Wizard steps indicator */}
      <div className="flex gap-2 items-center">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-8 w-8 bg-muted rounded-full" />
            {i < 3 && <div className="h-0.5 w-12 bg-muted" />}
          </div>
        ))}
      </div>
      {/* Form area */}
      <div className="space-y-4 max-w-2xl">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-10 bg-muted rounded-lg" />
          </div>
        ))}
        <div className="h-10 w-32 bg-muted rounded-lg" />
      </div>
    </div>
  );
}
