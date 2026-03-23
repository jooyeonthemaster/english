import { getConversations } from "@/actions/communication";
import MessagesClient from "./messages-client";

export default async function MessagesPage() {
  const conversations = await getConversations();

  return <MessagesClient initialConversations={conversations} />;
}
