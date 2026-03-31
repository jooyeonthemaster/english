export default function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-5 px-5 pt-4 pb-8">
      <div className="h-28 rounded-3xl bg-gradient-to-r from-blue-50 to-indigo-50 animate-pulse" />
      <div className="h-40 rounded-3xl bg-gray-50 animate-pulse" />
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 animate-pulse" />
            <div className="w-10 h-3 rounded bg-gray-50" />
          </div>
        ))}
      </div>
      <div className="h-24 rounded-3xl bg-gray-50 animate-pulse" />
      <div className="h-24 rounded-3xl bg-gray-50 animate-pulse" />
    </div>
  );
}
