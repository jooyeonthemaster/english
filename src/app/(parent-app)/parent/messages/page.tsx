import { redirect } from "next/navigation";
import { getParentSession } from "@/lib/auth-parent";
import { getParentMessages } from "@/actions/parent";
import { getParentAnnouncements } from "@/actions/platform-announcements";
import { MessagesClient } from "./messages-client";

export default async function ParentMessagesPage() {
  const session = await getParentSession();
  if (!session) redirect("/parent/login");

  const [notices, conversations] = await Promise.all([
    getParentAnnouncements(),
    getParentMessages(),
  ]);

  return (
    <MessagesClient
      notices={notices}
      conversations={conversations}
      parentId={session.parentId}
    />
  );
}
