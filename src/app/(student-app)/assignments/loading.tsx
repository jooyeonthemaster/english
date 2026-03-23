export default function Loading() {
  return (
    <div className="space-y-4 p-4 animate-pulse">
      {/* Header */}
      <div className="h-8 w-28 bg-gray-100 rounded" />
      {/* Assignment list */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
