import { Skeleton } from "@/components/ui/skeleton";

export default function SchoolHomeLoading() {
  return (
    <div className="flex flex-col gap-5 px-5 py-6">
      <div className="mb-1">
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-48 mt-2" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl col-span-2" />
      </div>
      <Skeleton className="h-20 rounded-2xl" />
    </div>
  );
}
