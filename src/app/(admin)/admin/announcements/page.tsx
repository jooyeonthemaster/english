import { getAnnouncements } from "@/actions/admin-announcements";
import { AnnouncementsAdminClient } from "@/components/admin/announcements/announcements-admin-client";

export const dynamic = "force-dynamic";

export default async function AdminAnnouncementsPage() {
  const announcements = await getAnnouncements();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">스모트 소식 관리</h1>
        <p className="mt-1 text-[13px] text-gray-400">
          전체 이용자에게 노출되는 플랫폼 공지를 작성·발행합니다. 새 기능을 배포할
          때마다 릴리즈 노트로 자동 발행되는 소식도 여기서 함께 관리됩니다.
        </p>
      </div>
      <AnnouncementsAdminClient initialAnnouncements={announcements} />
    </div>
  );
}
