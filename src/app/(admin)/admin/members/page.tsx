import { Suspense } from "react";
import { getMembers } from "@/actions/admin-members";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/admin/kit";
import {
  MembersListClient,
  type MembersViewMode,
} from "@/components/admin/members-list-client";

export const dynamic = "force-dynamic";

async function MembersContent({
  initialSearch,
  initialView,
}: {
  initialSearch?: string;
  initialView: MembersViewMode;
}) {
  // limit 미지정 = 전체 로드. 회원 검색/정렬이 클라이언트 메모리에서 전 범위를
  // 대상으로 이뤄지도록(이전 500명 캡 제거). 화면은 50건씩 페이지로 나눠 보인다.
  const members = await getMembers();
  return (
    <MembersListClient members={members} initialSearch={initialSearch} initialView={initialView} />
  );
}

function MembersSkeleton() {
  return (
    <div className="space-y-4" aria-busy aria-label="불러오는 중">
      <Skeleton className="h-9 w-40 rounded-xl" />
      <Skeleton className="h-[62px] rounded-xl" />
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
        <Skeleton className="h-14 rounded-none" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="mx-5 my-3 h-5 rounded-md" />
        ))}
      </div>
    </div>
  );
}

type PageProps = { searchParams: Promise<{ search?: string; view?: string }> };

export default async function MembersPage({ searchParams }: PageProps) {
  // 대시보드 "크레딧 소진 임박" 등에서 ?search=학원명 으로 진입하면 그 검색어로 시작한다.
  // ?view=member 는 회원별 보기로 시작(탭 상태는 useUrlTab 이 URL 에 보존).
  const { search, view } = await searchParams;
  const initialView: MembersViewMode = view === "member" ? "member" : "academy";
  return (
    <div className="space-y-6">
      <PageHeader
        title="학원 · 회원 관리"
        description="소셜·이메일로 가입한 원장 회원을 관리하고 크레딧을 조정합니다"
      />

      <Suspense fallback={<MembersSkeleton />}>
        <MembersContent initialSearch={search} initialView={initialView} />
      </Suspense>
    </div>
  );
}
