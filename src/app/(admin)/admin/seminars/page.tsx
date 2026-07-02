import { adminGetSeminarRequests } from "@/actions/admin-help-center";
import { AdminSeminarsClient } from "@/components/admin/help/admin-seminars-client";

export const dynamic = "force-dynamic";

export default async function AdminSeminarsPage() {
  const requests = await adminGetSeminarRequests();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">1:1 세미나 신청 관리</h1>
        <p className="text-[13px] text-gray-400 mt-1">
          신규 고객의 온보딩 세미나 신청을 접수하고 일정을 조율합니다
        </p>
      </div>
      <AdminSeminarsClient initialRequests={requests} />
    </div>
  );
}
