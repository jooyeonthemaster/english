import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface SkeletonProps {
  className?: string;
}

// ---------------------------------------------------------------------------
// Shimmer Skeleton Base
// ---------------------------------------------------------------------------
function ShimmerBlock({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-[#F3F4F0]", className)}>
      <div className="absolute inset-0 animate-shimmer" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card Skeleton
// ---------------------------------------------------------------------------
export function CardSkeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-white p-5 shadow-card",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <ShimmerBlock className="size-12 rounded-xl" />
        <div className="flex-1 space-y-2.5">
          <ShimmerBlock className="h-4 w-3/5 rounded-md" />
          <ShimmerBlock className="h-3 w-2/5 rounded-md" />
        </div>
      </div>
      <div className="mt-5 space-y-2.5">
        <ShimmerBlock className="h-3 w-full rounded-md" />
        <ShimmerBlock className="h-3 w-4/5 rounded-md" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List Skeleton
// ---------------------------------------------------------------------------
export function ListSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-2xl bg-white px-4 py-4 shadow-card"
        >
          <ShimmerBlock className="size-10 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2.5">
            <ShimmerBlock className="h-3.5 w-2/5 rounded-md" />
            <ShimmerBlock className="h-3 w-3/5 rounded-md" />
          </div>
          <ShimmerBlock className="h-7 w-14 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats Skeleton
// ---------------------------------------------------------------------------
export function StatsSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("grid grid-cols-3 gap-3", className)}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col items-center gap-2.5 rounded-2xl bg-white py-5 px-2 shadow-card"
        >
          <ShimmerBlock className="size-10 rounded-xl" />
          <ShimmerBlock className="h-6 w-12 rounded-md" />
          <ShimmerBlock className="h-3 w-16 rounded-md" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile Skeleton
// ---------------------------------------------------------------------------
export function ProfileSkeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-[#252B20] p-6",
        className
      )}
    >
      <div className="flex items-center gap-4">
        <div className="size-14 shrink-0 rounded-full bg-white/10" />
        <div className="flex flex-1 flex-col gap-2.5">
          <div className="h-5 w-24 rounded-md bg-white/10" />
          <div className="flex gap-2">
            <div className="h-5 w-20 rounded-md bg-white/8" />
            <div className="h-5 w-16 rounded-md bg-white/8" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Skeleton (Full Page)
// ---------------------------------------------------------------------------
export function PageSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      {/* Top bar skeleton */}
      <div className="flex h-14 items-center border-b border-[#F3F4F0] bg-white px-4">
        <ShimmerBlock className="mx-auto h-4 w-24 rounded-md" />
      </div>

      {/* Content skeleton */}
      <div className="space-y-5 p-5">
        {/* Profile card */}
        <ProfileSkeleton />

        {/* Stats */}
        <StatsSkeleton />

        {/* Calendar-like block */}
        <div className="rounded-2xl bg-white p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <ShimmerBlock className="size-7 rounded-lg" />
            <ShimmerBlock className="h-4 w-20 rounded-md" />
          </div>
          <ShimmerBlock className="h-28 w-full rounded-xl" />
        </div>

        {/* List items */}
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-card"
            >
              <ShimmerBlock className="size-12 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2.5">
                <ShimmerBlock className="h-4 w-3/5 rounded-md" />
                <ShimmerBlock className="h-3 w-2/5 rounded-md" />
              </div>
              <ShimmerBlock className="size-5 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
