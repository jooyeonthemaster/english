"use server";

import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import { noticeSchema, calendarEventSchema, messageSchema } from "@/lib/validations";
import { revalidatePath } from "next/cache";

// ============================================================================
// NOTICES
// ============================================================================

export async function getNotices(filters?: {
  targetType?: string;
  search?: string;
}) {
  const staff = await requireStaffAuth();

  const where: Record<string, unknown> = {
    academyId: staff.academyId,
  };

  if (filters?.targetType && filters.targetType !== "ALL_FILTER") {
    where.targetType = filters.targetType;
  }

  if (filters?.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { content: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const notices = await prisma.notice.findMany({
    where,
    include: {
      reads: true,
    },
    orderBy: [{ isPinned: "desc" }, { publishAt: "desc" }],
  });

  return notices;
}

export async function getNotice(noticeId: string) {
  await requireStaffAuth();

  const notice = await prisma.notice.findUnique({
    where: { id: noticeId },
    include: {
      reads: true,
    },
  });

  return notice;
}

export async function createNotice(data: FormData) {
  const staff = await requireStaffAuth("DIRECTOR");

  const raw = {
    title: data.get("title") as string,
    content: data.get("content") as string,
    targetType: data.get("targetType") as string,
    targetId: (data.get("targetId") as string) || undefined,
    isPinned: data.get("isPinned") === "true",
    publishAt: (data.get("publishAt") as string) || undefined,
    sendKakao: data.get("sendKakao") === "true",
  };

  const validated = noticeSchema.parse(raw);

  const notice = await prisma.notice.create({
    data: {
      academyId: staff.academyId,
      title: validated.title,
      content: validated.content,
      targetType: validated.targetType,
      targetId: validated.targetId || null,
      isPinned: validated.isPinned,
      publishAt: validated.publishAt ? new Date(validated.publishAt) : new Date(),
    },
  });

  revalidatePath("/director/notices");
  return { success: true, id: notice.id };
}

export async function updateNotice(noticeId: string, data: FormData) {
  await requireStaffAuth("DIRECTOR");

  const raw = {
    title: data.get("title") as string,
    content: data.get("content") as string,
    targetType: data.get("targetType") as string,
    targetId: (data.get("targetId") as string) || undefined,
    isPinned: data.get("isPinned") === "true",
    publishAt: (data.get("publishAt") as string) || undefined,
    sendKakao: data.get("sendKakao") === "true",
  };

  const validated = noticeSchema.parse(raw);

  await prisma.notice.update({
    where: { id: noticeId },
    data: {
      title: validated.title,
      content: validated.content,
      targetType: validated.targetType,
      targetId: validated.targetId || null,
      isPinned: validated.isPinned,
      publishAt: validated.publishAt ? new Date(validated.publishAt) : undefined,
    },
  });

  revalidatePath("/director/notices");
  revalidatePath(`/director/notices/${noticeId}`);
  return { success: true };
}

export async function deleteNotice(noticeId: string) {
  await requireStaffAuth("DIRECTOR");

  await prisma.notice.delete({
    where: { id: noticeId },
  });

  revalidatePath("/director/notices");
  return { success: true };
}

// ============================================================================
// MESSAGES
// ============================================================================

export async function getConversations() {
  const staff = await requireStaffAuth();

  // Get all messages where staff is sender or receiver
  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: staff.id, senderType: "STAFF" },
        { receiverId: staff.id, receiverType: "STAFF" },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  // Group by conversation partner (parent)
  const conversationMap = new Map<
    string,
    {
      partnerId: string;
      partnerType: string;
      lastMessage: string;
      lastMessageAt: Date;
      unreadCount: number;
    }
  >();

  for (const msg of messages) {
    const isStaffSender = msg.senderId === staff.id && msg.senderType === "STAFF";
    const partnerId = isStaffSender ? msg.receiverId : msg.senderId;
    const partnerType = isStaffSender ? msg.receiverType : msg.senderType;

    if (!conversationMap.has(partnerId)) {
      conversationMap.set(partnerId, {
        partnerId,
        partnerType,
        lastMessage: msg.content,
        lastMessageAt: msg.createdAt,
        unreadCount: 0,
      });
    }

    // Count unread messages received by staff
    if (!isStaffSender && !msg.isRead) {
      const conv = conversationMap.get(partnerId)!;
      conv.unreadCount++;
    }
  }

  // Fetch partner details
  const partnerIds = Array.from(conversationMap.keys());
  const parents = await prisma.parent.findMany({
    where: { id: { in: partnerIds } },
    include: {
      studentLinks: {
        include: { student: { select: { id: true, name: true } } },
      },
    },
  });

  const parentMap = new Map(parents.map((p) => [p.id, p]));

  const conversations = Array.from(conversationMap.values()).map((conv) => {
    const parent = parentMap.get(conv.partnerId);
    return {
      ...conv,
      partnerName: parent?.name || "알 수 없음",
      partnerPhone: parent?.phone || "",
      students: parent?.studentLinks.map((l) => l.student) || [],
    };
  });

  conversations.sort(
    (a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime()
  );

  return conversations;
}

export async function getConversation(partnerId: string) {
  const staff = await requireStaffAuth();

  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: staff.id, receiverId: partnerId },
        { senderId: partnerId, receiverId: staff.id },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  // Mark incoming messages as read
  await prisma.message.updateMany({
    where: {
      senderId: partnerId,
      receiverId: staff.id,
      receiverType: "STAFF",
      isRead: false,
    },
    data: { isRead: true },
  });

  // Get partner info
  const parent = await prisma.parent.findUnique({
    where: { id: partnerId },
    include: {
      studentLinks: {
        include: { student: { select: { id: true, name: true } } },
      },
    },
  });

  return {
    messages,
    partner: parent
      ? {
          id: parent.id,
          name: parent.name,
          phone: parent.phone,
          students: parent.studentLinks.map((l) => l.student),
        }
      : null,
  };
}

export async function sendMessage(data: FormData) {
  const staff = await requireStaffAuth();

  const validated = messageSchema.parse({
    content: data.get("content") as string,
    receiverId: data.get("receiverId") as string,
    receiverType: data.get("receiverType") as string || "PARENT",
  });

  const message = await prisma.message.create({
    data: {
      senderId: staff.id,
      senderType: "STAFF",
      receiverId: validated.receiverId,
      receiverType: validated.receiverType,
      content: validated.content,
    },
  });

  revalidatePath("/director/messages");
  return { success: true, message };
}

export async function markMessagesRead(partnerId: string) {
  const staff = await requireStaffAuth();

  await prisma.message.updateMany({
    where: {
      senderId: partnerId,
      receiverId: staff.id,
      receiverType: "STAFF",
      isRead: false,
    },
    data: { isRead: true },
  });

  revalidatePath("/director/messages");
  return { success: true };
}

// ============================================================================
// CALENDAR EVENTS
// ============================================================================

export async function getCalendarEvents(month?: string) {
  const staff = await requireStaffAuth();

  // month format: "2026-03"
  let startDate: Date;
  let endDate: Date;

  if (month) {
    const [year, m] = month.split("-").map(Number);
    startDate = new Date(year, m - 1, 1);
    endDate = new Date(year, m, 0, 23, 59, 59);
  } else {
    const now = new Date();
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  }

  const events = await prisma.calendarEvent.findMany({
    where: {
      academyId: staff.academyId,
      startDate: { gte: startDate, lte: endDate },
    },
    orderBy: { startDate: "asc" },
  });

  return events;
}

export async function createCalendarEvent(data: FormData) {
  const staff = await requireStaffAuth("DIRECTOR");

  const raw = {
    title: data.get("title") as string,
    description: (data.get("description") as string) || undefined,
    startDate: data.get("startDate") as string,
    endDate: (data.get("endDate") as string) || undefined,
    allDay: data.get("allDay") === "true",
    type: data.get("type") as string,
    color: (data.get("color") as string) || undefined,
  };

  const validated = calendarEventSchema.parse(raw);

  const event = await prisma.calendarEvent.create({
    data: {
      academyId: staff.academyId,
      title: validated.title,
      description: validated.description || null,
      startDate: new Date(validated.startDate),
      endDate: validated.endDate ? new Date(validated.endDate) : null,
      allDay: validated.allDay,
      type: validated.type,
      color: validated.color || null,
    },
  });

  revalidatePath("/director/calendar");
  return { success: true, id: event.id };
}

export async function updateCalendarEvent(eventId: string, data: FormData) {
  await requireStaffAuth("DIRECTOR");

  const raw = {
    title: data.get("title") as string,
    description: (data.get("description") as string) || undefined,
    startDate: data.get("startDate") as string,
    endDate: (data.get("endDate") as string) || undefined,
    allDay: data.get("allDay") === "true",
    type: data.get("type") as string,
    color: (data.get("color") as string) || undefined,
  };

  const validated = calendarEventSchema.parse(raw);

  await prisma.calendarEvent.update({
    where: { id: eventId },
    data: {
      title: validated.title,
      description: validated.description || null,
      startDate: new Date(validated.startDate),
      endDate: validated.endDate ? new Date(validated.endDate) : null,
      allDay: validated.allDay,
      type: validated.type,
      color: validated.color || null,
    },
  });

  revalidatePath("/director/calendar");
  return { success: true };
}

export async function deleteCalendarEvent(eventId: string) {
  await requireStaffAuth("DIRECTOR");

  await prisma.calendarEvent.delete({
    where: { id: eventId },
  });

  revalidatePath("/director/calendar");
  return { success: true };
}
