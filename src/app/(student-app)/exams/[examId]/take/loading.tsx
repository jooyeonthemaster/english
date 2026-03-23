export default function Loading() {
  return (
    <div className="flex items-center justify-center h-screen animate-pulse">
      <div className="text-center space-y-4">
        <div className="h-12 w-12 bg-gray-100 rounded-full mx-auto" />
        <div className="h-4 w-40 bg-gray-100 rounded mx-auto" />
      </div>
    </div>
  );
}
