"use server";

import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { notifyAcademyDirector } from "@/lib/growth/notifications";
import { groupSeminarSchema } from "@/lib/validations";
import { revalidatePath } from "next/cache";

// ============================================================================
// HELP CENTER — 운영자(SuperAdmin) 측 액션
// 비밀글도 운영자는 전부 열람. 답변/상태변경 시 작성 학원 원장에게 벨 알림.
// ============================================================================

const DIRECTOR_PATH: Record<string, string> = {
  FEEDBACK: "/director/help/feedback",
  SUPPORT: "/director/help/support",
};
const ADMIN_PATH: Record<string, string> = {
  FEEDBACK: "/admin/feedback",
  SUPPORT: "/admin/support",
};

export interface AdminHelpPostListItem {
  id: string;
  board: string;
  category: string;
  title: string;
  status: string;
  isPrivate: boolean;
  isPinned: boolean;
  authorName: string;
  academyId: string | null;
  replyCount: number;
  upvoteCount: number;
  hasOfficialAnswer: boolean;
  createdAt: string;
}

const HELP_CENTER_PAGE_SIZE = 50;

export interface AdminHelpPostsResult {
  items: AdminHelpPostListItem[];
  total: number;
  page: number;
  pageSize: number;
}

function normalizeHelpPage(page?: number): number {
  if (!Number.isFinite(page) || (page ?? 0) < 1) return 1;
  return Math.floor(page as number);
}

export async function adminGetHelpPosts(params: {
  board: "FEEDBACK" | "SUPPORT";
  status?: string;
  search?: string;
  page?: number;
}): Promise<AdminHelpPostsResult> {
  await requireAdminAuth();

  const page = normalizeHelpPage(params.page);
  const pageSize = HELP_CENTER_PAGE_SIZE;

  const where: Record<string, unknown> = { board: params.board };
  // "PENDING" = 미답변(접수 + 처리중) — 대시보드 "미답변 문의" 진입용 묶음 필터
  if (params.status === "PENDING") {
    where.status = { in: ["OPEN", "IN_PROGRESS"] };
  } else if (params.status && params.status !== "ALL") {
    where.status = params.status;
  }
  if (params.search) where.title = { contains: params.search, mode: "insensitive" };

  const [posts, total] = await Promise.all([
    prisma.helpPost.findMany({
      where,
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      include: {
        _count: { select: { replies: true } },
        replies: { where: { isOfficial: true }, select: { id: true }, take: 1 },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.helpPost.count({ where }),
  ]);

  return {
    items: posts.map((p) => ({
      id: p.id,
      board: p.board,
      category: p.category,
      title: p.title,
      status: p.status,
      isPrivate: p.isPrivate,
      isPinned: p.isPinned,
      authorName: p.authorName,
      academyId: p.academyId,
      replyCount: p._count.replies,
      upvoteCount: p.upvoteCount,
      hasOfficialAnswer: p.replies.length > 0,
      createdAt: p.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}

export interface AdminSupportDashboardItem {
  id: string;
  title: string;
  category: string;
  status: string;
  isPrivate: boolean;
  authorName: string;
  hasOfficialAnswer: boolean;
  createdAt: string;
}

export interface AdminSupportDashboardResult {
  recent: AdminSupportDashboardItem[];
  /** 답변이 필요한(접수/처리중) 문의 수 */
  pendingCount: number;
}

/** 대시보드용: 최근 고객지원 문의 + 미답변 건수 */
export async function adminGetRecentSupportPosts(
  limit = 5,
): Promise<AdminSupportDashboardResult> {
  await requireAdminAuth();

  const [posts, pendingCount] = await Promise.all([
    prisma.helpPost.findMany({
      where: { board: "SUPPORT" },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        replies: { where: { isOfficial: true }, select: { id: true }, take: 1 },
      },
    }),
    prisma.helpPost.count({
      where: { board: "SUPPORT", status: { in: ["OPEN", "IN_PROGRESS"] } },
    }),
  ]);

  return {
    recent: posts.map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      status: p.status,
      isPrivate: p.isPrivate,
      authorName: p.authorName,
      hasOfficialAnswer: p.replies.length > 0,
      createdAt: p.createdAt.toISOString(),
    })),
    pendingCount,
  };
}

export interface AdminHelpReplyView {
  id: string;
  authorRole: string;
  authorName: string;
  content: string;
  isOfficial: boolean;
  attachments: { name: string; url: string; size?: number; type?: string }[];
  createdAt: string;
}

export interface AdminHelpPostDetail {
  id: string;
  board: string;
  category: string;
  title: string;
  content: string;
  status: string;
  isPrivate: boolean;
  isPinned: boolean;
  authorName: string;
  academyId: string | null;
  upvoteCount: number;
  viewCount: number;
  attachments: { name: string; url: string; size?: number; type?: string }[];
  replies: AdminHelpReplyView[];
  createdAt: string;
}

export async function adminGetHelpPost(postId: string): Promise<AdminHelpPostDetail | null> {
  await requireAdminAuth();
  const post = await prisma.helpPost.findUnique({
    where: { id: postId },
    include: { replies: { orderBy: { createdAt: "asc" } } },
  });
  if (!post) return null;

  const attachments = Array.isArray(post.attachments)
    ? (post.attachments as { name: string; url: string; size?: number; type?: string }[])
    : [];

  return {
    id: post.id,
    board: post.board,
    category: post.category,
    title: post.title,
    content: post.content,
    status: post.status,
    isPrivate: post.isPrivate,
    isPinned: post.isPinned,
    authorName: post.authorName,
    academyId: post.academyId,
    upvoteCount: post.upvoteCount,
    viewCount: post.viewCount,
    attachments,
    replies: post.replies.map((r) => ({
      id: r.id,
      authorRole: r.authorRole,
      authorName: r.authorName,
      content: r.content,
      isOfficial: r.isOfficial,
      attachments: Array.isArray(r.attachments)
        ? (r.attachments as { name: string; url: string; size?: number; type?: string }[])
        : [],
      createdAt: r.createdAt.toISOString(),
    })),
    createdAt: post.createdAt.toISOString(),
  };
}

/** 운영자 공식 답변 + (선택)상태 변경. 작성 학원 원장에게 벨 알림. */
export async function adminReplyHelpPost(
  postId: string,
  content: string,
  newStatus?: string,
  attachments?: { name: string; url: string; size?: number; type?: string }[],
) {
  const admin = await requireAdminAuth();
  if (!content.trim() && !attachments?.length) {
    throw new Error("답변 내용 또는 이미지를 입력하세요.");
  }

  const post = await prisma.helpPost.findUnique({
    where: { id: postId },
    select: { board: true, academyId: true, title: true },
  });
  if (!post) throw new Error("게시글을 찾을 수 없습니다.");

  await prisma.$transaction(async (tx) => {
    await tx.helpPostReply.create({
      data: {
        postId,
        authorRole: "ADMIN",
        authorAdminId: admin.adminId,
        authorName: "운영팀",
        content,
        isOfficial: true,
        attachments: attachments?.length ? attachments : undefined,
      },
    });
    if (newStatus) {
      await tx.helpPost.update({ where: { id: postId }, data: { status: newStatus } });
    }
  });

  // 작성 학원 원장에게 알림
  if (post.academyId) {
    const boardLabel = post.board === "FEEDBACK" ? "피드백" : "문의 게시판";
    await notifyAcademyDirector(post.academyId, {
      category: "SYSTEM",
      type: "HELP_REPLY",
      title: `${boardLabel} 답변이 등록되었습니다`,
      body: post.title,
      actionUrl: `${DIRECTOR_PATH[post.board]}/${postId}`,
    });
  }

  revalidatePath(`${ADMIN_PATH[post.board]}/${postId}`);
  revalidatePath(ADMIN_PATH[post.board]);
  revalidatePath(`${DIRECTOR_PATH[post.board]}/${postId}`);
  return { success: true };
}

export async function adminUpdateHelpStatus(postId: string, status: string) {
  await requireAdminAuth();
  const post = await prisma.helpPost.update({
    where: { id: postId },
    data: { status },
    select: { board: true, academyId: true, title: true },
  });

  if (post.academyId) {
    await notifyAcademyDirector(post.academyId, {
      category: "SYSTEM",
      type: "HELP_STATUS",
      title: "문의 상태가 변경되었습니다",
      body: post.title,
      actionUrl: `${DIRECTOR_PATH[post.board]}/${postId}`,
    });
  }

  revalidatePath(`${ADMIN_PATH[post.board]}/${postId}`);
  revalidatePath(ADMIN_PATH[post.board]);
  return { success: true };
}

export async function adminToggleHelpPin(postId: string) {
  await requireAdminAuth();
  const current = await prisma.helpPost.findUnique({
    where: { id: postId },
    select: { isPinned: true, board: true },
  });
  if (!current) throw new Error("게시글을 찾을 수 없습니다.");

  await prisma.helpPost.update({
    where: { id: postId },
    data: { isPinned: !current.isPinned },
  });
  revalidatePath(ADMIN_PATH[current.board]);
  revalidatePath(DIRECTOR_PATH[current.board]);
  return { success: true, isPinned: !current.isPinned };
}

export async function adminDeleteHelpPost(postId: string) {
  await requireAdminAuth();
  const post = await prisma.helpPost.delete({
    where: { id: postId },
    select: { board: true },
  });
  revalidatePath(ADMIN_PATH[post.board]);
  revalidatePath(DIRECTOR_PATH[post.board]);
  return { success: true };
}

// ============================================================================
// 1:1 세미나 신청 — 운영자 측
// ============================================================================

export interface AdminSeminarRequestView {
  id: string;
  academyId: string | null;
  applicantName: string;
  phone: string;
  email: string | null;
  academyName: string | null;
  preferredChannel: string;
  preferredTimes: string | null;
  topic: string | null;
  message: string | null;
  status: string;
  adminMemo: string | null;
  scheduledAt: string | null;
  meetingUrl: string | null;
  createdAt: string;
}

export interface AdminSeminarRequestsResult {
  items: AdminSeminarRequestView[];
  total: number;
  page: number;
  pageSize: number;
}

export async function adminGetSeminarRequests(params?: {
  status?: string;
  search?: string;
  page?: number;
}): Promise<AdminSeminarRequestsResult> {
  await requireAdminAuth();

  const page = normalizeHelpPage(params?.page);
  const pageSize = HELP_CENTER_PAGE_SIZE;

  const where: Record<string, unknown> = {};
  if (params?.status && params.status !== "ALL") where.status = params.status;
  if (params?.search) {
    where.OR = [
      { applicantName: { contains: params.search, mode: "insensitive" } },
      { academyName: { contains: params.search, mode: "insensitive" } },
      { phone: { contains: params.search } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.seminarRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.seminarRequest.count({ where }),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      academyId: r.academyId,
      applicantName: r.applicantName,
      phone: r.phone,
      email: r.email,
      academyName: r.academyName,
      preferredChannel: r.preferredChannel,
      preferredTimes: r.preferredTimes,
      topic: r.topic,
      message: r.message,
      status: r.status,
      adminMemo: r.adminMemo,
      scheduledAt: r.scheduledAt?.toISOString() ?? null,
      meetingUrl: r.meetingUrl,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}

export async function adminUpdateSeminarRequest(
  requestId: string,
  input: {
    status?: string;
    adminMemo?: string;
    scheduledAt?: string | null;
    meetingUrl?: string | null;
  },
) {
  const admin = await requireAdminAuth();

  const data: Record<string, unknown> = { handledByAdminId: admin.adminId };
  if (input.status) data.status = input.status;
  if (input.adminMemo !== undefined) data.adminMemo = input.adminMemo || null;
  if (input.scheduledAt !== undefined) {
    data.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  }
  if (input.meetingUrl !== undefined) {
    data.meetingUrl = input.meetingUrl?.trim() || null;
  }

  const req = await prisma.seminarRequest.update({
    where: { id: requestId },
    data,
    select: { academyId: true, status: true },
  });

  if (req.academyId && input.status) {
    await notifyAcademyDirector(req.academyId, {
      category: "SYSTEM",
      type: "SEMINAR_STATUS",
      title: "1:1 세미나 신청 상태가 변경되었습니다",
      body: null,
      actionUrl: "/director/help/seminar",
    });
  }

  revalidatePath("/admin/seminars");
  revalidatePath("/director/help/seminar");
  return { success: true };
}

// ============================================================================
// 단체 세미나 — 운영자 측
// 세미나 클래스 개설/수정/삭제 + 신청자 관리.
// ============================================================================

const GROUP_SEMINAR_ADMIN_PATH = "/admin/group-seminars";
const GROUP_SEMINAR_DIRECTOR_PATH = "/director/help/group-seminar";

export interface AdminGroupSeminarListItem {
  id: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  capacity: number | null;
  registeredCount: number;
}

export interface AdminGroupSeminarRegistrationView {
  id: string;
  applicantName: string;
  academyName: string | null;
  phone: string;
  email: string | null;
  headCount: number;
  selectedDate: string | null;
  message: string | null;
  status: string;
  createdAt: string;
  // 참가 보증금
  depositStatus: string;
  depositAmount: number | null;
  depositorName: string | null;
  refundBankName: string | null;
  refundAccountNumber: string | null;
  refundAccountHolder: string | null;
  depositPaidAt: string | null;
  depositRefundedAt: string | null;
}

export interface AdminGroupSeminarDetail {
  id: string;
  title: string;
  summary: string | null;
  description: string | null;
  host: string | null;
  target: string | null;
  location: string | null;
  mapUrl: string | null;
  meetingUrl: string | null;
  scheduledAt: string | null;
  sessionDates: string[];
  durationMin: number | null;
  capacity: number | null;
  registerCloseDays: number | null;
  depositAmount: number | null;
  coverImageUrl: string | null;
  status: string;
  registeredCount: number;
  registrations: AdminGroupSeminarRegistrationView[];
  createdAt: string;
}

export async function adminGetGroupSeminars(): Promise<AdminGroupSeminarListItem[]> {
  await requireAdminAuth();
  const rows = await prisma.groupSeminar.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
      registrations: {
        where: { status: { in: ["REGISTERED", "ATTENDED"] } },
        select: { headCount: true },
      },
    },
  });
  return rows.map((s) => ({
    id: s.id,
    title: s.title,
    status: s.status,
    scheduledAt: s.scheduledAt?.toISOString() ?? null,
    capacity: s.capacity,
    registeredCount: s.registrations.reduce((sum, r) => sum + r.headCount, 0),
  }));
}

export async function adminGetGroupSeminarDetail(
  seminarId: string,
): Promise<AdminGroupSeminarDetail | null> {
  await requireAdminAuth();
  const s = await prisma.groupSeminar.findUnique({
    where: { id: seminarId },
    include: { registrations: { orderBy: { createdAt: "desc" } } },
  });
  if (!s) return null;
  const active = s.registrations.filter((r) => r.status !== "CANCELED");
  return {
    id: s.id,
    title: s.title,
    summary: s.summary,
    description: s.description,
    host: s.host,
    target: s.target,
    location: s.location,
    mapUrl: s.mapUrl,
    meetingUrl: s.meetingUrl,
    scheduledAt: s.scheduledAt?.toISOString() ?? null,
    sessionDates: Array.isArray(s.sessionDates) ? (s.sessionDates as string[]) : [],
    durationMin: s.durationMin,
    capacity: s.capacity,
    registerCloseDays: s.registerCloseDays,
    depositAmount: s.depositAmount,
    coverImageUrl: s.coverImageUrl,
    status: s.status,
    registeredCount: active.reduce((sum, r) => sum + r.headCount, 0),
    registrations: s.registrations.map((r) => ({
      id: r.id,
      applicantName: r.applicantName,
      academyName: r.academyName,
      phone: r.phone,
      email: r.email,
      headCount: r.headCount,
      selectedDate: r.selectedDate?.toISOString() ?? null,
      message: r.message,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      depositStatus: r.depositStatus,
      depositAmount: r.depositAmount,
      depositorName: r.depositorName,
      refundBankName: r.refundBankName,
      refundAccountNumber: r.refundAccountNumber,
      refundAccountHolder: r.refundAccountHolder,
      depositPaidAt: r.depositPaidAt?.toISOString() ?? null,
      depositRefundedAt: r.depositRefundedAt?.toISOString() ?? null,
    })),
    createdAt: s.createdAt.toISOString(),
  };
}

function toSeminarData(input: Record<string, unknown>) {
  const v = groupSeminarSchema.partial().parse(input);
  const data: Record<string, unknown> = {};
  if (v.title !== undefined) data.title = v.title;
  if (v.summary !== undefined) data.summary = v.summary || null;
  if (v.description !== undefined) data.description = v.description || null;
  if (v.host !== undefined) data.host = v.host || null;
  if (v.target !== undefined) data.target = v.target || null;
  if (v.location !== undefined) data.location = v.location || null;
  if (v.mapUrl !== undefined) data.mapUrl = v.mapUrl?.trim() || null;
  if (v.meetingUrl !== undefined) data.meetingUrl = v.meetingUrl?.trim() || null;
  if (v.coverImageUrl !== undefined) data.coverImageUrl = v.coverImageUrl || null;
  if (v.status !== undefined) data.status = v.status;
  if (v.durationMin !== undefined) data.durationMin = v.durationMin ?? null;
  if (v.capacity !== undefined) data.capacity = v.capacity ?? null;
  if (v.registerCloseDays !== undefined) {
    data.registerCloseDays = v.registerCloseDays ?? null;
  }
  if (v.depositAmount !== undefined) data.depositAmount = v.depositAmount ?? null;
  if (v.scheduledAt !== undefined) {
    data.scheduledAt = v.scheduledAt ? new Date(v.scheduledAt) : null;
  }
  // 세션 날짜 목록(사용자가 이 중 하루 선택)이 오면 정렬 저장하고, 대표 일시는 가장 이른 날짜로.
  if (v.sessionDates !== undefined) {
    const dates = (v.sessionDates ?? [])
      .map((s) => new Date(s))
      .filter((d) => !Number.isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    data.sessionDates = dates.map((d) => d.toISOString());
    data.scheduledAt = dates[0] ?? null;
  }
  return data;
}

export async function adminCreateGroupSeminar(input: {
  title: string;
  [key: string]: unknown;
}) {
  const admin = await requireAdminAuth();
  const data = toSeminarData(input);
  if (!data.title) throw new Error("제목을 입력하세요.");
  const seminar = await prisma.groupSeminar.create({
    data: { ...data, title: data.title as string, createdByAdminId: admin.adminId },
  });
  revalidatePath(GROUP_SEMINAR_ADMIN_PATH);
  revalidatePath(GROUP_SEMINAR_DIRECTOR_PATH);
  return { success: true, id: seminar.id };
}

export async function adminUpdateGroupSeminar(
  seminarId: string,
  input: Record<string, unknown>,
) {
  await requireAdminAuth();
  const data = toSeminarData(input);

  const seminar = await prisma.groupSeminar.update({
    where: { id: seminarId },
    data,
    select: { status: true, title: true },
  });

  // 세미나가 취소되면 신청 확정자(원장)에게 알림.
  if (data.status === "CANCELED") {
    const regs = await prisma.groupSeminarRegistration.findMany({
      where: { seminarId, status: "REGISTERED", academyId: { not: null } },
      select: { academyId: true },
    });
    const academyIds = [...new Set(regs.map((r) => r.academyId).filter(Boolean) as string[])];
    await Promise.all(
      academyIds.map((academyId) =>
        notifyAcademyDirector(academyId, {
          category: "SYSTEM",
          type: "GROUP_SEMINAR_STATUS",
          title: `단체 세미나 "${seminar.title}"가 취소되었습니다`,
          body: null,
          actionUrl: GROUP_SEMINAR_DIRECTOR_PATH,
        }),
      ),
    );
  }

  revalidatePath(GROUP_SEMINAR_ADMIN_PATH);
  revalidatePath(GROUP_SEMINAR_DIRECTOR_PATH);
  return { success: true };
}

export async function adminDeleteGroupSeminar(seminarId: string) {
  await requireAdminAuth();
  await prisma.groupSeminar.delete({ where: { id: seminarId } });
  revalidatePath(GROUP_SEMINAR_ADMIN_PATH);
  revalidatePath(GROUP_SEMINAR_DIRECTOR_PATH);
  return { success: true };
}

/** 신청자 상태 변경(참석 처리·취소 등). */
export async function adminSetGroupSeminarRegistrationStatus(
  registrationId: string,
  status: "REGISTERED" | "ATTENDED" | "CANCELED",
) {
  await requireAdminAuth();
  await prisma.groupSeminarRegistration.update({
    where: { id: registrationId },
    data: { status },
  });
  revalidatePath(GROUP_SEMINAR_ADMIN_PATH);
  revalidatePath(GROUP_SEMINAR_DIRECTOR_PATH);
  return { success: true };
}

/**
 * 참가 보증금 상태 수동 변경. 입금은 웹훅이 자동 확정(PAID)하지만, 관리자가
 * 수동 입금확인(WAITING→PAID)·환급완료(PAID→REFUNDED)·몰수(FORFEITED)도 할 수 있다.
 * 환급은 자동 송금이 불가하므로 관리자가 실제 이체 후 REFUNDED로 표시한다.
 */
export async function adminSetSeminarDepositStatus(
  registrationId: string,
  status: "WAITING" | "PAID" | "REFUNDED" | "FORFEITED",
) {
  await requireAdminAuth();
  const now = new Date();
  const data: Record<string, unknown> = { depositStatus: status };
  if (status === "PAID") data.depositPaidAt = now;
  if (status === "REFUNDED") data.depositRefundedAt = now;
  await prisma.groupSeminarRegistration.update({
    where: { id: registrationId },
    data,
  });
  revalidatePath(GROUP_SEMINAR_ADMIN_PATH);
  revalidatePath(GROUP_SEMINAR_DIRECTOR_PATH);
  return { success: true };
}
