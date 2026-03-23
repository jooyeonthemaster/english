export default function Loading() {
  return (
    <div className="space-y-6 p-4 md:p-6 animate-pulse">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 bg-muted rounded" />
        <div className="h-8 w-48 bg-muted rounded" />
      </div>
      {/* Report header card */}
      <div className="h-32 bg-muted rounded-xl" />
      {/* Report content */}
      <div className="space-y-4">
        <div className="h-64 bg-muted rounded-xl" />
        <div className="h-48 bg-muted rounded-xl" />
      </div>
    </div>
  );
}
