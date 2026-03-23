export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 bg-muted rounded" />
        <div className="h-8 w-48 bg-muted rounded" />
      </div>
      {/* Student selector */}
      <div className="h-12 w-64 bg-muted rounded-lg" />
      {/* Grading area */}
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-32 bg-muted rounded-xl" />
        ))}
      </div>
      {/* Submit button */}
      <div className="h-10 w-32 bg-muted rounded-lg" />
    </div>
  );
}
