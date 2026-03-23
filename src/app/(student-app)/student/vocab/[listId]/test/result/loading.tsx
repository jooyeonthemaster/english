export default function Loading() {
  return (
    <div className="px-5 pt-8 pb-4 min-h-screen animate-pulse">
      {/* Result header */}
      <div className="text-center mb-8">
        <div className="h-10 w-10 bg-gray-100 rounded-full mx-auto" />
        <div className="h-6 w-32 bg-gray-100 rounded mx-auto mt-3" />
      </div>
      {/* Circular progress placeholder */}
      <div className="flex justify-center my-8">
        <div className="size-[140px] bg-gray-100 rounded-full" />
      </div>
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-xl" />
        ))}
      </div>
      {/* XP card */}
      <div className="h-16 bg-gray-100 rounded-2xl mb-6" />
      {/* Action buttons */}
      <div className="mt-auto space-y-3">
        <div className="h-12 bg-gray-100 rounded-xl" />
        <div className="h-12 bg-gray-100 rounded-xl" />
      </div>
    </div>
  );
}
