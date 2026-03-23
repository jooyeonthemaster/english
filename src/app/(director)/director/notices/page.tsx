import { getNotices } from "@/actions/communication";
import { getClassList } from "@/actions/consultations";
import NoticesClient from "./notices-client";

export default async function NoticesPage() {
  const [notices, classes] = await Promise.all([
    getNotices({}),
    getClassList(),
  ]);

  return <NoticesClient initialNotices={notices} initialClasses={classes} />;
}
