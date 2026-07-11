import { adminGetGroupSeminars } from "@/actions/admin-help-center";
import { AdminGroupSeminarsClient } from "@/components/admin/help/admin-group-seminars-client";

export const dynamic = "force-dynamic";

export default async function AdminGroupSeminarsPage() {
  const seminars = await adminGetGroupSeminars();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">단체 세미나 관리</h1>
        <p className="text-[13px] text-gray-400 mt-1">
          세미나 클래스를 개설하면 원장이 열람하고 신청할 수 있습니다
        </p>
      </div>
      <AdminGroupSeminarsClient initialSeminars={seminars} />
    </div>
  );
}
