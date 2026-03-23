import { Skeleton } from "@/components/ui/skeleton";

export default function VocabDetailLoading() {
  return (
    <div className="flex flex-col gap-4 px-5 py-5">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full rounded-xl" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
