export default function Loading() {
  return (
    <div className="flex min-h-screen animate-pulse">
      {/* Left panel */}
      <div className="flex flex-col justify-center w-full lg:w-[45%] px-6 sm:px-12 lg:px-16 xl:px-24 py-16">
        <div className="w-full max-w-[420px] mx-auto space-y-8">
          <div className="space-y-4">
            <div className="h-14 w-14 bg-gray-100 rounded-full" />
            <div className="h-10 w-72 bg-gray-100 rounded" />
            <div className="h-5 w-56 bg-gray-100 rounded" />
          </div>
          <div className="space-y-4">
            <div className="h-4 w-20 bg-gray-100 rounded" />
            <div className="h-14 bg-gray-100 rounded-2xl" />
          </div>
          <div className="h-14 bg-gray-100 rounded-2xl" />
        </div>
      </div>
      {/* Right panel */}
      <div className="hidden lg:block lg:w-[55%] bg-gray-100" />
    </div>
  );
}
