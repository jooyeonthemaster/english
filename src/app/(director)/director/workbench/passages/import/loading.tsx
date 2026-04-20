export default function ImportLoading() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
        <span className="text-sm text-slate-500">불러오는 중…</span>
      </div>
    </div>
  );
}
