export default function Loading() {
  return (
    <div className="px-5 pt-6 pb-4 animate-pulse">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="h-5 w-5 bg-gray-100 rounded" />
        <div className="h-6 w-24 bg-gray-100 rounded" />
      </div>
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
        <div className="flex-1 h-10 bg-white rounded-lg" />
        <div className="flex-1 h-10 bg-gray-50 rounded-lg" />
      </div>
      {/* Wrong answer list */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
