export default function Loading() {
  return (
    <div className="px-5 pt-6 pb-4 space-y-6 animate-pulse">
      {/* Welcome header */}
      <div>
        <div className="h-6 w-48 bg-gray-100 rounded" />
        <div className="h-4 w-32 bg-gray-100 rounded mt-2" />
        <div className="h-2 w-full bg-gray-100 rounded-full mt-4" />
      </div>
      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 bg-gray-100 rounded-2xl" />
        <div className="h-24 bg-gray-100 rounded-2xl" />
      </div>
      {/* Tasks */}
      <div className="space-y-2">
        <div className="h-4 w-16 bg-gray-100 rounded" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-xl" />
        ))}
      </div>
      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
