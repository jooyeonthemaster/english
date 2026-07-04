export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="h-8 w-36 bg-muted rounded" />
      {/* Form fields */}
      <div className="space-y-4 max-w-2xl">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-10 bg-muted rounded-lg" />
          </div>
        ))}
        {/* Textarea for passage content */}
        <div className="space-y-2">
          <div className="h-4 w-20 bg-muted rounded" />
          <div className="h-40 bg-muted rounded-lg" />
        </div>
        <div className="h-10 w-32 bg-muted rounded-lg" />
      </div>
    </div>
  );
}
