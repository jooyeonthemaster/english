import { getStaffAnnouncements } from "@/actions/platform-announcements";
import NoticesClient from "./notices-client";

export const dynamic = "force-dynamic";

export default async function NoticesPage() {
  const announcements = await getStaffAnnouncements();
  return <NoticesClient initialAnnouncements={announcements} />;
}
