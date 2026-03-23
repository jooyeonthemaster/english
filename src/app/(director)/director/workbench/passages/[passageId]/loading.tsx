export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 bg-muted rounded" />
        <div className="h-8 w-56 bg-muted rounded" />
      </div>
      {/* Passage content */}
      <div className="h-64 bg-muted rounded-xl" />
      {/* Analysis section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-48 bg-muted rounded-xl" />
        <div className="h-48 bg-muted rounded-xl" />
      </div>
    </div>
  );
}
