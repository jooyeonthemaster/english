/**
 * Server-side notification service — per-staff inbox (fan-out-on-write).
 *
 * Design (from 2026 research): a materialized per-recipient inbox makes the hot
 * read path (recent notifications WHERE recipientStaffId = ?) cheap. Bell badge
 * = "unseen" count (created after NotificationState.lastSeenAt); per-item read
 * state is tracked separately via Notification.readAt. Academy fan-out is tiny
 * (a handful of staff), so write amplification is a non-issue.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type NotificationCategory = "MISSION" | "REFERRAL" | "SYSTEM" | "BILLING";

export interface CreateNotificationInput {
  academyId: string;
  recipientStaffId: string;
  category: NotificationCategory;
  type: string;
  title: string;
  body?: string | null;
  iconKey?: string | null;
  actionUrl?: string | null;
  data?: Record<string, unknown> | null;
  groupKey?: string | null;
  expiresAt?: Date | null;
}

type DbClient = Prisma.TransactionClient | typeof prisma;

/** Create a single notification row (optionally inside a transaction). */
export async function createNotification(
  input: CreateNotificationInput,
  client: DbClient = prisma,
) {
  return client.notification.create({
    data: {
      academyId: input.academyId,
      recipientStaffId: input.recipientStaffId,
      category: input.category,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      iconKey: input.iconKey ?? null,
      actionUrl: input.actionUrl ?? null,
      data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
      groupKey: input.groupKey ?? null,
      expiresAt: input.expiresAt ?? null,
    },
  });
}

/** Resolve the DIRECTOR staff id of an academy (primary recipient for academy-level events). */
export async function getAcademyDirectorStaffId(
  academyId: string,
  client: DbClient = prisma,
): Promise<string | null> {
  const director = await client.staff.findFirst({
    where: { academyId, role: "DIRECTOR", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return director?.id ?? null;
}

/**
 * Notify the academy's director. Convenience for academy-scoped events
 * (referral / credit / billing). No-op (returns null) if no active director.
 */
export async function notifyAcademyDirector(
  academyId: string,
  input: Omit<CreateNotificationInput, "academyId" | "recipientStaffId">,
  client: DbClient = prisma,
) {
  const directorId = await getAcademyDirectorStaffId(academyId, client);
  if (!directorId) return null;
  return createNotification({ ...input, academyId, recipientStaffId: directorId }, client);
}

/** Fan out an identical notification to every active staff of one academy. */
export async function broadcastToAcademy(
  academyId: string,
  input: Omit<CreateNotificationInput, "academyId" | "recipientStaffId">,
) {
  const staff = await prisma.staff.findMany({
    where: { academyId, isActive: true },
    select: { id: true },
  });
  if (staff.length === 0) return { count: 0 };
  return prisma.notification.createMany({
    data: staff.map((s) => ({
      academyId,
      recipientStaffId: s.id,
      category: input.category,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      iconKey: input.iconKey ?? null,
      actionUrl: input.actionUrl ?? null,
      data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
      groupKey: input.groupKey ?? null,
      expiresAt: input.expiresAt ?? null,
    })),
  });
}

export interface BroadcastTarget {
  scope: "ALL_DIRECTORS" | "ALL_STAFF";
}

/**
 * Admin announcement — fan out to all active directors (or all active staff)
 * across every academy. Batched insert per academy to keep payloads bounded.
 */
export async function broadcastToAllAcademies(
  input: Omit<CreateNotificationInput, "academyId" | "recipientStaffId">,
  target: BroadcastTarget = { scope: "ALL_DIRECTORS" },
) {
  const where: Prisma.StaffWhereInput = { isActive: true };
  if (target.scope === "ALL_DIRECTORS") where.role = "DIRECTOR";

  const recipients = await prisma.staff.findMany({
    where,
    select: { id: true, academyId: true },
  });
  if (recipients.length === 0) return { count: 0 };

  const result = await prisma.notification.createMany({
    data: recipients.map((r) => ({
      academyId: r.academyId,
      recipientStaffId: r.id,
      category: input.category,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      iconKey: input.iconKey ?? null,
      actionUrl: input.actionUrl ?? null,
      data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
      groupKey: input.groupKey ?? null,
      expiresAt: input.expiresAt ?? null,
    })),
  });
  return result;
}

// ─── Read side ──────────────────────────────────────────────────────────────

export interface NotificationListItem {
  id: string;
  category: string;
  type: string;
  title: string;
  body: string | null;
  iconKey: string | null;
  actionUrl: string | null;
  data: unknown;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationSummary {
  unseenCount: number;
  unreadCount: number;
  latestCreatedAt: string | null;
}

function notExpired(): Prisma.NotificationWhereInput {
  return {
    archivedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };
}

/** Lightweight summary for polling — unseen badge count + latest timestamp. */
export async function getNotificationSummary(staffId: string): Promise<NotificationSummary> {
  const [state, latest, unreadCount] = await Promise.all([
    prisma.notificationState.findUnique({ where: { staffId } }),
    prisma.notification.findFirst({
      where: { recipientStaffId: staffId, ...notExpired() },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.notification.count({
      where: { recipientStaffId: staffId, readAt: null, ...notExpired() },
    }),
  ]);

  const lastSeenAt = state?.lastSeenAt ?? new Date(0);
  const unseenCount = await prisma.notification.count({
    where: { recipientStaffId: staffId, createdAt: { gt: lastSeenAt }, ...notExpired() },
  });

  return {
    unseenCount,
    unreadCount,
    latestCreatedAt: latest?.createdAt.toISOString() ?? null,
  };
}

/** Full list for the popover / page. Cursor by createdAt (before). */
export async function getNotifications(
  staffId: string,
  options?: { limit?: number; before?: Date },
): Promise<NotificationListItem[]> {
  const rows = await prisma.notification.findMany({
    where: {
      recipientStaffId: staffId,
      ...notExpired(),
      ...(options?.before ? { createdAt: { lt: options.before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(options?.limit ?? 20, 50),
  });

  return rows.map((n) => ({
    id: n.id,
    category: n.category,
    type: n.type,
    title: n.title,
    body: n.body,
    iconKey: n.iconKey,
    actionUrl: n.actionUrl,
    data: n.data,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  }));
}

/** Mark the inbox as seen (clears the bell badge). */
export async function markNotificationsSeen(staffId: string): Promise<void> {
  const now = new Date();
  await prisma.notificationState.upsert({
    where: { staffId },
    create: { staffId, lastSeenAt: now },
    update: { lastSeenAt: now },
  });
}

/** Mark a single notification read (ownership-checked). Returns true if it was updated. */
export async function markNotificationRead(staffId: string, notificationId: string): Promise<boolean> {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, recipientStaffId: staffId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count > 0;
}

/** Mark all of a staff's notifications read. */
export async function markAllNotificationsRead(staffId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { recipientStaffId: staffId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}
