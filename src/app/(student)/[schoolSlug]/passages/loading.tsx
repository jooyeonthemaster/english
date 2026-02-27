import { Skeleton } from "@/components/ui/skeleton";

export default function PassagesLoading() {
  return (
    <div className="flex flex-col gap-4 px-5 py-5">
      <Skeleton className="h-10 w-full rounded-xl" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
