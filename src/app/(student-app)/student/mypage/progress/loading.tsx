export default function Loading() {
  return (
    <div className="px-5 pt-6 pb-4 space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-5 w-5 bg-gray-100 rounded" />
        <div className="h-6 w-24 bg-gray-100 rounded" />
      </div>
      {/* XP / Level card */}
      <div className="h-24 bg-blue-100 rounded-2xl" />
      {/* Vocab trend chart */}
      <div className="h-64 bg-gray-100 rounded-2xl" />
      {/* Exam trend chart */}
      <div className="h-64 bg-gray-100 rounded-2xl" />
    </div>
  );
}
