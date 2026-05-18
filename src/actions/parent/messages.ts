"use server";

import { prisma } from "@/lib/prisma";
import { requireParentAuth } from "@/lib/auth-parent";
import type { MessageConversation, MessageItem } from "./types";

export async function getParentMessages(): Promise<MessageConversation[]> {
  const session = await requireParentAuth();

  // Get all messages where parent is sender or receiver
  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: session.parentId, senderType: "PARENT" },
        { receiverId: session.parentId, receiverType: "PARENT" },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  // Group by staff partner
  const conversationMap = new Map<
    string,
    { messages: typeof messages; staffId: string }
  >();

  for (const msg of messages) {
    const staffId =
      msg.senderType === "STAFF" ? msg.senderId : msg.receiverId;
    if (!conversationMap.has(staffId)) {
      conversationMap.set(staffId, { messages: [], staffId });
    }
    conversationMap.get(staffId)!.messages.push(msg);
  }

  // Fetch staff names
  const staffIds = [...conversationMap.keys()];
  const staffMembers = await prisma.staff.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, name: true },
  });
  const staffNameMap = new Map(staffMembers.map((s) => [s.id, s.name]));

  const conversations: MessageConversation[] = [];

  for (const [staffId, data] of conversationMap) {
    const sorted = data.messages.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const unread = sorted.filter(
      (m) =>
        m.receiverId === session.parentId &&
        m.receiverType === "PARENT" &&
        !m.isRead
    ).length;

    conversations.push({
      staffId,
      staffName: staffNameMap.get(staffId) || "강사",
      lastMessage:
        sorted[0]?.content.slice(0, 50) +
        (sorted[0]?.content.length > 50 ? "..." : ""),
      lastAt: sorted[0]?.createdAt.toISOString() || "",
      unreadCount: unread,
    });
  }

  conversations.sort(
    (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
  );

  return conversations;
}

export async function getConversation(
  staffId: string
): Promise<MessageItem[]> {
  const session = await requireParentAuth();

  const messages = await prisma.message.findMany({
    where: {
      OR: [
        {
          senderId: session.parentId,
          senderType: "PARENT",
          receiverId: staffId,
          receiverType: "STAFF",
        },
        {
          senderId: staffId,
          senderType: "STAFF",
          receiverId: session.parentId,
          receiverType: "PARENT",
        },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  // Mark received messages as read
  await prisma.message.updateMany({
    where: {
      senderId: staffId,
      senderType: "STAFF",
      receiverId: session.parentId,
      receiverType: "PARENT",
      isRead: false,
    },
    data: { isRead: true },
  });

  return messages.map((m) => ({
    id: m.id,
    content: m.content,
    senderType: m.senderType,
    createdAt: m.createdAt.toISOString(),
    isRead: m.isRead,
  }));
}

export async function sendParentMessage(staffId: string, content: string) {
  const session = await requireParentAuth();

  if (!content.trim()) throw new Error("메시지를 입력해주세요.");

  const message = await prisma.message.create({
    data: {
      senderId: session.parentId,
      senderType: "PARENT",
      receiverId: staffId,
      receiverType: "STAFF",
      content: content.trim(),
    },
  });

  return { id: message.id };
}
