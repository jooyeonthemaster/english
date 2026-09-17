import { getAnnouncements } from "@/actions/admin-announcements";
import { AnnouncementsAdminClient } from "@/components/admin/announcements/announcements-admin-client";

export const dynamic = "force-dynamic";

export default async function AdminAnnouncementsPage() {
  const announcements = await getAnnouncements();
  // 제목·액션(새 공지)은 클라이언트가 PageHeader 로 그린다.
  return <AnnouncementsAdminClient initialAnnouncements={announcements} />;
}
