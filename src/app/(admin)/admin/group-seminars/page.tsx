import { adminGetGroupSeminars } from "@/actions/admin-help-center";
import { AdminGroupSeminarsClient } from "@/components/admin/help/admin-group-seminars-client";

export const dynamic = "force-dynamic";

// 제목·설명·"새 세미나 개설" 버튼은 목록과 같은 상태를 쓰므로 클라이언트에서 PageHeader 로 그린다.
export default async function AdminGroupSeminarsPage() {
  const seminars = await adminGetGroupSeminars();
  return <AdminGroupSeminarsClient initialSeminars={seminars} />;
}
