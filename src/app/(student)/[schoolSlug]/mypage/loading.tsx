import { Skeleton } from "@/components/ui/skeleton";

export default function MypageLoading() {
  return (
    <div className="flex flex-col gap-4 px-5 py-5">
      <Skeleton className="h-20 w-full rounded-2xl" />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-40 w-full rounded-2xl" />
    </div>
  );
}
