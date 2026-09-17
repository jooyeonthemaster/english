import { adminGetSeminarRequests } from "@/actions/admin-help-center";
import { AdminSeminarsClient } from "@/components/admin/help/admin-seminars-client";
import { PageHeader } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

// 원장 페이지 히어로 이미지 설정은 /admin/settings(플랫폼 설정)로 옮겼다.
export default async function AdminSeminarsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const requests = await adminGetSeminarRequests({ status, page: 1 });
  return (
    <div className="space-y-6">
      <PageHeader
        title="1:1 세미나"
        description="신규 고객의 온보딩 세미나 신청을 접수하고 일정을 조율합니다"
      />
      <AdminSeminarsClient initialData={requests} initialStatus={status} />
    </div>
  );
}
