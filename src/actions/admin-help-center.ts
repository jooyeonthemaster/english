"use server";

import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { notifyAcademyDirector } from "@/lib/growth/notifications";
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
