export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* Blue gradient header */}
      <div className="bg-gradient-to-br from-blue-500 to-indigo-600 px-5 pt-6 pb-8">
        <div className="h-5 w-24 bg-white/20 rounded mb-4" />
        <div className="flex items-center gap-4">
          <div className="size-16 rounded-full bg-white/20" />
          <div className="flex-1">
            <div className="h-5 w-32 bg-white/20 rounded" />
            <div className="h-3 w-24 bg-white/20 rounded mt-2" />
            <div className="h-1.5 bg-white/20 rounded-full mt-3" />
          </div>
        </div>
      </div>
      {/* Radar chart section */}
      <div className="px-5 -mt-4">
        <div className="bg-white rounded-2xl shadow-sm p-5 h-[360px]" />
      </div>
      {/* Tabs */}
      <div className="px-5 mt-6">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <div className="flex-1 h-9 bg-white rounded-lg" />
          <div className="flex-1 h-9 bg-gray-50 rounded-lg" />
          <div className="flex-1 h-9 bg-gray-50 rounded-lg" />
        </div>
      </div>
      {/* Tab content */}
      <div className="px-5 mt-4 space-y-4">
        <div className="h-48 bg-gray-100 rounded-2xl" />
        <div className="h-32 bg-gray-100 rounded-2xl" />
      </div>
    </div>
  );
}
