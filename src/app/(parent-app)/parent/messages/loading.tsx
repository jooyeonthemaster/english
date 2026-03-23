export default function Loading() {
  return (
    <div className="space-y-6 p-4 md:p-6 animate-pulse">
      {/* Header */}
      <div className="h-8 w-24 bg-muted rounded" />
      {/* Tab selector */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        <div className="flex-1 h-10 bg-white rounded-lg" />
        <div className="flex-1 h-10 bg-gray-50 rounded-lg" />
      </div>
      {/* Notice/message list */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 bg-muted rounded-xl" />
        ))}
      </div>
    </div>
  );
}
