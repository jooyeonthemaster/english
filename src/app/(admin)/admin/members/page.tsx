import { Suspense } from "react";
import { getMembers } from "@/actions/admin-members";
import { Skeleton } from "@/components/ui/skeleton";
import { MembersListClient } from "@/components/admin/members-list-client";

export const dynamic = "force-dynamic";

async function MembersContent() {
  const members = await getMembers({ limit: 500 });
  return <MembersListClient members={members} />;
}

function MembersSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-[80px] rounded-xl" />
      <Skeleton className="h-[500px] rounded-xl" />
    </div>
  );
}

export default function MembersPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900">회원 관리</h1>
          <p className="text-[13px] text-gray-400 mt-1">
            소셜·이메일로 가입한 원장 회원을 관리하고 크레딧을 조정합니다
          </p>
        </div>
      </div>

      <Suspense fallback={<MembersSkeleton />}>
        <MembersContent />
      </Suspense>
    </div>
  );
}
