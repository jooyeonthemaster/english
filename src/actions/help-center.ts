"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import {
  helpPostSchema,
  helpReplySchema,
  seminarRequestSchema,
} from "@/lib/validations";
import type { HelpBoard } from "@/lib/help-center";
import { revalidatePath } from "next/cache";

// ============================================================================
// HELP CENTER — 고객(원장) 측 액션
// 피드백/고객지원 게시판은 글로벌(전체 학원 글 노출). 비밀글은 작성자 본인·운영자만.
// ============================================================================

const BOARD_PATH: Record<HelpBoard, string> = {
  FEEDBACK: "/director/help/feedback",
  SUPPORT: "/director/help/support",
};

export interface HelpPostListItem {
  id: string;
  board: string;
  category: string;
  title: string;
  status: string;
  isPrivate: boolean;
  isPinned: boolean;
  /** 비밀글이며 현재 사용자가 작성자가 아니면 true → 내용 숨김 */
  locked: boolean;
  isMine: boolean;
  authorName: string;
  preview: string | null;
  replyCount: number;
  upvoteCount: number;
  upvoted: boolean;
  hasOfficialAnswer: boolean;
  attachmentCount: number;
  createdAt: string;
}

function previewOf(content: string): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  return oneLine.length > 140 ? `${oneLine.slice(0, 140)}…` : oneLine;
}

export async function getHelpPosts(params: {
  board: HelpBoard;
  category?: string;
  status?: string;
  search?: string;
  onlyMine?: boolean;
  sort?: "recent" | "popular";
}): Promise<HelpPostListItem[]> {
  const staff = await requireStaffAuth();

  const where: Record<string, unknown> = { board: params.board };
  if (params.category && params.category !== "ALL") where.category = params.category;
  if (params.status && params.status !== "ALL") where.status = params.status;
  if (params.onlyMine) where.authorStaffId = staff.id;
  if (params.search) {
    where.title = { contains: params.search, mode: "insensitive" };
  }

  const orderBy =
    params.sort === "popular"
      ? [{ isPinned: "desc" as const }, { upvoteCount: "desc" as const }, { createdAt: "desc" as const }]
      : [{ isPinned: "desc" as const }, { createdAt: "desc" as const }];

  const posts = await prisma.helpPost.findMany({
    where,
    orderBy,
    include: {
      _count: { select: { replies: true } },
      replies: { where: { isOfficial: true }, select: { id: true }, take: 1 },
      upvotes: { where: { staffId: staff.id }, select: { id: true }, take: 1 },
    },
    take: 300,
  });

  return posts.map((p) => {
    const isMine = p.authorStaffId === staff.id;
    const locked = p.isPrivate && !isMine;
    const attachments = Array.isArray(p.attachments) ? p.attachments : [];
    return {
      id: p.id,
      board: p.board,
      category: p.category,
      title: p.title,
      status: p.status,
      isPrivate: p.isPrivate,
      isPinned: p.isPinned,
      locked,
      isMine,
      authorName: p.authorName,
      preview: locked ? null : previewOf(p.content),
      replyCount: p._count.replies,
      upvoteCount: p.upvoteCount,
      upvoted: p.upvotes.length > 0,
      hasOfficialAnswer: p.replies.length > 0,
      attachmentCount: attachments.length,
      createdAt: p.createdAt.toISOString(),
    };
  });
}

export interface HelpReplyView {
  id: string;
  authorRole: string;
  authorName: string;
  content: string;
  isOfficial: boolean;
  createdAt: string;
}

export interface HelpPostDetail {
  id: string;
  board: string;
  category: string;
  title: string;
  content: string;
  status: string;
  isPrivate: boolean;
  isPinned: boolean;
  isMine: boolean;
  authorName: string;
  upvoteCount: number;
  upvoted: boolean;
  viewCount: number;
  attachments: { name: string; url: string; size?: number; type?: string }[];
  replies: HelpReplyView[];
  createdAt: string;
}

export type HelpPostDetailResult =
  | { ok: true; post: HelpPostDetail }
  | { ok: false; reason: "NOT_FOUND" | "LOCKED" | "WRONG_PASSWORD" };

/**
 * 상세 조회. 비밀글이고 작성자가 아니면 password 필요(bcrypt 검증).
 * 비밀번호 없이 요청하면 reason="LOCKED", 틀리면 "WRONG_PASSWORD".
 */
export async function getHelpPost(
  postId: string,
  password?: string,
): Promise<HelpPostDetailResult> {
  const staff = await requireStaffAuth();

  const post = await prisma.helpPost.findUnique({
    where: { id: postId },
    include: {
      replies: { orderBy: { createdAt: "asc" } },
      upvotes: { where: { staffId: staff.id }, select: { id: true }, take: 1 },
    },
  });
  if (!post) return { ok: false, reason: "NOT_FOUND" };

  const isMine = post.authorStaffId === staff.id;
  if (post.isPrivate && !isMine) {
    if (!password) return { ok: false, reason: "LOCKED" };
    const valid = post.passwordHash
      ? await bcrypt.compare(password, post.passwordHash)
      : false;
    if (!valid) return { ok: false, reason: "WRONG_PASSWORD" };
  }

  // 조회수 증가(작성자 본인 제외)
  if (!isMine) {
    await prisma.helpPost.update({
      where: { id: postId },
      data: { viewCount: { increment: 1 } },
    });
  }

  const attachments = Array.isArray(post.attachments)
    ? (post.attachments as { name: string; url: string; size?: number; type?: string }[])
    : [];

  return {
    ok: true,
    post: {
      id: post.id,
      board: post.board,
      category: post.category,
      title: post.title,
      content: post.content,
      status: post.status,
      isPrivate: post.isPrivate,
      isPinned: post.isPinned,
      isMine,
      authorName: post.authorName,
      upvoteCount: post.upvoteCount,
      upvoted: post.upvotes.length > 0,
      viewCount: post.viewCount,
      attachments,
      replies: post.replies.map((r) => ({
        id: r.id,
        authorRole: r.authorRole,
        authorName: r.authorName,
        content: r.content,
        isOfficial: r.isOfficial,
        createdAt: r.createdAt.toISOString(),
      })),
      createdAt: post.createdAt.toISOString(),
    },
  };
}

export async function createHelpPost(input: {
  board: HelpBoard;
  category: string;
  title: string;
  content: string;
  isPrivate?: boolean;
  password?: string;
  attachments?: { name: string; url: string; size?: number; type?: string }[];
}) {
  const staff = await requireStaffAuth();
  const validated = helpPostSchema.parse(input);

  if (validated.isPrivate && (!validated.password || validated.password.length < 4)) {
    throw new Error("비밀글 비밀번호는 4자 이상이어야 합니다.");
  }

  const passwordHash =
    validated.isPrivate && validated.password
      ? await bcrypt.hash(validated.password, 10)
      : null;

  const post = await prisma.helpPost.create({
    data: {
      board: validated.board,
      academyId: staff.academyId,
      authorStaffId: staff.id,
      authorName: staff.academyName || staff.name,
      category: validated.category,
      title: validated.title,
      content: validated.content,
      isPrivate: validated.isPrivate,
      passwordHash,
      attachments: input.attachments?.length ? input.attachments : undefined,
    },
  });

  revalidatePath(BOARD_PATH[validated.board]);
  return { success: true, id: post.id };
}

/** 작성자 본인만 수정/삭제 가능. */
async function assertOwner(postId: string, staffId: string) {
  const post = await prisma.helpPost.findUnique({
    where: { id: postId },
    select: { authorStaffId: true, board: true },
  });
  if (!post) throw new Error("게시글을 찾을 수 없습니다.");
  if (post.authorStaffId !== staffId) throw new Error("권한이 없습니다.");
  return post;
}

export async function updateHelpPost(
  postId: string,
  input: { category: string; title: string; content: string },
) {
  const staff = await requireStaffAuth();
  const existing = await assertOwner(postId, staff.id);

  await prisma.helpPost.update({
    where: { id: postId },
    data: {
      category: input.category,
      title: input.title,
      content: input.content,
    },
  });

  revalidatePath(BOARD_PATH[existing.board as HelpBoard]);
  revalidatePath(`${BOARD_PATH[existing.board as HelpBoard]}/${postId}`);
  return { success: true };
}

export async function deleteHelpPost(postId: string) {
  const staff = await requireStaffAuth();
  const existing = await assertOwner(postId, staff.id);

  await prisma.helpPost.delete({ where: { id: postId } });
  revalidatePath(BOARD_PATH[existing.board as HelpBoard]);
  return { success: true };
}

/** 피드백 공감 토글. */
export async function toggleHelpUpvote(postId: string) {
  const staff = await requireStaffAuth();

  const existing = await prisma.helpPostUpvote.findUnique({
    where: { postId_staffId: { postId, staffId: staff.id } },
  });

  if (existing) {
    await prisma.$transaction([
      prisma.helpPostUpvote.delete({ where: { id: existing.id } }),
      prisma.helpPost.update({
        where: { id: postId },
        data: { upvoteCount: { decrement: 1 } },
      }),
    ]);
    return { success: true, upvoted: false };
  }

  await prisma.$transaction([
    prisma.helpPostUpvote.create({ data: { postId, staffId: staff.id } }),
    prisma.helpPost.update({
      where: { id: postId },
      data: { upvoteCount: { increment: 1 } },
    }),
  ]);
  return { success: true, upvoted: true };
}

/** 작성자(또는 누구나)의 후속 댓글. authorRole=STAFF. */
export async function addHelpReply(postId: string, content: string) {
  const staff = await requireStaffAuth();
  const validated = helpReplySchema.parse({ postId, content });

  const post = await prisma.helpPost.findUnique({
    where: { id: postId },
    select: { board: true },
  });
  if (!post) throw new Error("게시글을 찾을 수 없습니다.");

  await prisma.helpPostReply.create({
    data: {
      postId,
      authorRole: "STAFF",
      authorStaffId: staff.id,
      authorName: staff.academyName || staff.name,
      content: validated.content,
      isOfficial: false,
    },
  });

  revalidatePath(`${BOARD_PATH[post.board as HelpBoard]}/${postId}`);
  return { success: true };
}

// ============================================================================
// 1:1 세미나 신청 — 고객 측
// ============================================================================

export interface SeminarRequestView {
  id: string;
  applicantName: string;
  phone: string;
  email: string | null;
  preferredChannel: string;
  preferredTimes: string | null;
  topic: string | null;
  message: string | null;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
}

export async function getMySeminarRequests(): Promise<SeminarRequestView[]> {
  const staff = await requireStaffAuth();
  const rows = await prisma.seminarRequest.findMany({
    where: { staffId: staff.id },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    applicantName: r.applicantName,
    phone: r.phone,
    email: r.email,
    preferredChannel: r.preferredChannel,
    preferredTimes: r.preferredTimes,
    topic: r.topic,
    message: r.message,
    status: r.status,
    scheduledAt: r.scheduledAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function createSeminarRequest(input: {
  applicantName: string;
  phone: string;
  email?: string;
  preferredChannel: "PHONE" | "KAKAO" | "EITHER";
  preferredTimes?: string;
  topic?: string;
  message?: string;
}) {
  const staff = await requireStaffAuth();
  const validated = seminarRequestSchema.parse(input);

  const req = await prisma.seminarRequest.create({
    data: {
      academyId: staff.academyId,
      staffId: staff.id,
      applicantName: validated.applicantName,
      phone: validated.phone,
      email: validated.email || null,
      academyName: validated.academyName || staff.academyName || null,
      preferredChannel: validated.preferredChannel,
      preferredTimes: validated.preferredTimes || null,
      topic: validated.topic || null,
      message: validated.message || null,
    },
  });

  revalidatePath("/director/help/seminar");
  return { success: true, id: req.id };
}

export async function cancelSeminarRequest(requestId: string) {
  const staff = await requireStaffAuth();
  const req = await prisma.seminarRequest.findUnique({
    where: { id: requestId },
    select: { staffId: true, status: true },
  });
  if (!req || req.staffId !== staff.id) throw new Error("권한이 없습니다.");
  if (req.status === "DONE") throw new Error("이미 완료된 신청입니다.");

  await prisma.seminarRequest.update({
    where: { id: requestId },
    data: { status: "CANCELED" },
  });
  revalidatePath("/director/help/seminar");
  return { success: true };
}
