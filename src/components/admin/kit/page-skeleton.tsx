import { Skeleton } from "@/components/ui/skeleton";

/** 라우트 로딩 뼈대 — 제목 · 카드 줄 · 표. 모든 관리자 페이지의 loading.tsx 가 쓴다. */
export function AdminPageSkeleton({ stats = 4, rows = 8 }: { stats?: number; rows?: number }) {
  return (
    <div className="space-y-6" aria-busy aria-label="불러오는 중">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40 rounded-md" />
        <Skeleton className="h-4 w-72 rounded-md" />
      </div>
      {stats > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: stats }).map((_, i) => (
            <Skeleton key={i} className="h-[108px] rounded-xl" />
          ))}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
        <Skeleton className="h-11 rounded-none" />
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="mx-5 my-3 h-5 rounded-md" />
        ))}
      </div>
    </div>
  );
}
