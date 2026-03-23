export default function Loading() {
  return (
    <div className="px-5 pt-6 pb-4 animate-pulse">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="h-5 w-5 bg-gray-100 rounded" />
        <div className="h-6 w-24 bg-gray-100 rounded" />
      </div>
      {/* Search */}
      <div className="h-10 w-full bg-gray-100 rounded-xl mb-4" />
      {/* Grade filter */}
      <div className="flex gap-2 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-14 bg-gray-100 rounded-full" />
        ))}
      </div>
      {/* Vocab lists */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
