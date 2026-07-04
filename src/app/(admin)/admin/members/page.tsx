import { Suspense } from "react";
import { getMembers } from "@/actions/admin-members";
import { getSignupCredits } from "@/lib/platform-settings";
import { Skeleton } from "@/components/ui/skeleton";
import { MembersListClient } from "@/components/admin/members-list-client";
import { SignupCreditSetting } from "@/components/admin/signup-credit-setting";

export const dynamic = "force-dynamic";

async function MembersContent() {
  // limit 미지정 = 전체 로드. 회원 검색/정렬이 클라이언트 메모리에서 전 범위를
  // 대상으로 이뤄지도록(이전 500명 캡 제거).
  const members = await getMembers();
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

export default async function MembersPage() {
  const signupCredits = await getSignupCredits();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900">학원 · 회원 관리</h1>
          <p className="text-[13px] text-gray-400 mt-1">
            소셜·이메일로 가입한 원장 회원을 관리하고 크레딧을 조정합니다
          </p>
        </div>
        <SignupCreditSetting initialAmount={signupCredits} />
      </div>

      <Suspense fallback={<MembersSkeleton />}>
        <MembersContent />
      </Suspense>
    </div>
  );
}
