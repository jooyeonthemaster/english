export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Back + actions */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-16 bg-muted rounded" />
        <div className="flex gap-2">
          <div className="h-8 w-16 bg-muted rounded-lg" />
          <div className="h-8 w-16 bg-muted rounded-lg" />
        </div>
      </div>
      {/* Notice content card */}
      <div className="h-64 bg-muted rounded-xl" />
      {/* Read status card */}
      <div className="h-40 bg-muted rounded-xl" />
    </div>
  );
}
