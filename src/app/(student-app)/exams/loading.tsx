export default function Loading() {
  return (
    <div className="space-y-4 p-4 animate-pulse">
      {/* Header */}
      <div className="h-8 w-28 bg-gray-100 rounded" />
      {/* Exam list */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
