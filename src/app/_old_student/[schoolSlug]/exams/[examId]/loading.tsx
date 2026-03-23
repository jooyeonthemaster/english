import { Skeleton } from "@/components/ui/skeleton";

export default function ExamDetailLoading() {
  return (
    <div className="flex flex-col gap-4 px-5 py-5">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-32" />
      <div className="flex flex-col gap-3 mt-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
