"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import {
  helpPostSchema,
  helpReplySchema,
  seminarRequestSchema,
  groupSeminarRegistrationSchema,
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
  attachments: { name: string; url: string; size?: number; type?: string }[];
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
        attachments: Array.isArray(r.attachments)
          ? (r.attachments as { name: string; url: string; size?: number; type?: string }[])
          : [],
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

/** 작성자(또는 누구나)의 후속 댓글. authorRole=STAFF. 이미지 첨부 가능. */
export async function addHelpReply(
  postId: string,
  content: string,
  attachments?: { name: string; url: string; size?: number; type?: string }[],
) {
  const staff = await requireStaffAuth();
  const validated = helpReplySchema.parse({ postId, content, attachments });

  if (!validated.content.trim() && !validated.attachments?.length) {
    throw new Error("내용 또는 이미지를 입력하세요.");
  }

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
      attachments: validated.attachments?.length ? validated.attachments : undefined,
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
  meetingUrl: string | null;
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
    meetingUrl: r.meetingUrl,
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

// ============================================================================
// 단체 세미나 — 고객(원장) 측
// 운영자가 개설(GroupSeminar)한 세미나를 원장이 둘러보고 신청한다.
// ============================================================================

export interface GroupSeminarView {
  id: string;
  title: string;
  summary: string | null;
  description: string | null;
  benefit: string | null;
  host: string | null;
  target: string | null;
  location: string | null;
  mapUrl: string | null;
  meetingUrl: string | null;
  scheduledAt: string | null;
  /** 사용자가 이 중 하루를 선택하는 세션 날짜(ISO). 0~1개면 선택 불필요. */
  sessionDates: string[];
  /** 세션(날짜)별 신청 현황. capacity는 일자별 정원으로 해석된다. */
  sessions: {
    date: string;
    registeredCount: number;
    spotsLeft: number | null;
    /** 신청 마감 시각(ISO) = 세션일 − registerCloseDays일 */
    closesAt: string;
    /** 마감(기간 종료)됐는지 */
    registrationClosed: boolean;
  }[];
  durationMin: number | null;
  capacity: number | null;
  /** 참가 보증금(원). null/0=없음 */
  depositAmount: number | null;
  /** 신청 마감: 실행 N일 전까지 접수(null/0=당일까지) */
  registerCloseDays: number | null;
  /** 모든 세션 날짜가 지났는지(행사 종료) */
  eventPassed: boolean;
  /** 지금 신청 가능한 세션이 하나라도 있는지(status OPEN 전제) */
  registrationOpen: boolean;
  coverImageUrl: string | null;
  status: string;
  /** 확정 신청 인원(headCount 합계) */
  registeredCount: number;
  /** 남은 자리(capacity 없으면 null) */
  spotsLeft: number | null;
  /** 내 신청 정보(없으면 null) */
  myRegistration: {
    id: string;
    headCount: number;
    status: string;
    selectedDate: string | null;
    depositStatus: string;
  } | null;
}

const GROUP_SEMINAR_PATH = "/director/help/group-seminar";

/** DRAFT를 제외한 모든 세미나를 임박순으로 반환하며, 내 신청 상태를 함께 담는다. */
export async function getOpenGroupSeminars(): Promise<GroupSeminarView[]> {
  const staff = await requireStaffAuth();

  const seminars = await prisma.groupSeminar.findMany({
    where: { status: { not: "DRAFT" } },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    include: {
      registrations: {
        where: { status: { in: ["REGISTERED", "ATTENDED"] } },
        select: {
          staffId: true,
          headCount: true,
          status: true,
          id: true,
          selectedDate: true,
          depositStatus: true,
        },
      },
    },
  });

  const now = Date.now();
  const DAY = 86_400_000;

  return seminars.map((s) => {
    const active = s.registrations;
    const registeredCount = active.reduce((sum, r) => sum + r.headCount, 0);
    const mine = active.find((r) => r.staffId === staff.id) ?? null;
    const sessionIso = Array.isArray(s.sessionDates) ? (s.sessionDates as string[]) : [];
    const cutoffMs = (s.registerCloseDays ?? 0) * DAY;

    // capacity는 "일자별 정원"으로 해석 — 세션마다 개별 카운트/마감.
    // 신청 마감 = 세션일 − registerCloseDays. 마감이 지나면 그 세션은 접수 종료.
    const sessions = sessionIso.map((iso) => {
      const t = new Date(iso).getTime();
      const reg = active
        .filter((r) => r.selectedDate && r.selectedDate.getTime() === t)
        .reduce((sum, r) => sum + r.headCount, 0);
      const closeMs = t - cutoffMs;
      return {
        date: iso,
        registeredCount: reg,
        spotsLeft: s.capacity != null ? Math.max(0, s.capacity - reg) : null,
        closesAt: new Date(closeMs).toISOString(),
        registrationClosed: now >= closeMs,
      };
    });

    // 남은 자리 총합: 세션이 있으면 일자별 잔여 합, 없으면 단일 풀.
    const spotsLeft =
      sessionIso.length > 0
        ? s.capacity != null
          ? sessions.reduce((sum, x) => sum + (x.spotsLeft ?? 0), 0)
          : null
        : s.capacity != null
          ? Math.max(0, s.capacity - registeredCount)
          : null;

    // 행사 종료 여부: 세션이 있으면 모든 세션 날짜가 지났는지, 없으면 대표 일시 기준.
    const eventTimes = sessionIso.length
      ? sessionIso.map((x) => new Date(x).getTime())
      : s.scheduledAt
        ? [s.scheduledAt.getTime()]
        : [];
    const eventPassed = eventTimes.length > 0 && eventTimes.every((t) => now >= t);

    // 신청 가능: OPEN 상태 + 마감 안 지난 세션 + 자리 있음.
    let registrationOpen = false;
    if (s.status === "OPEN") {
      if (sessionIso.length) {
        registrationOpen = sessions.some(
          (x) => !x.registrationClosed && (x.spotsLeft == null || x.spotsLeft > 0),
        );
      } else {
        const closeMs = (s.scheduledAt?.getTime() ?? Infinity) - cutoffMs;
        registrationOpen =
          now < closeMs && (spotsLeft == null || spotsLeft > 0);
      }
    }

    return {
      id: s.id,
      title: s.title,
      summary: s.summary,
      description: s.description,
      benefit: s.benefit,
      host: s.host,
      target: s.target,
      location: s.location,
      mapUrl: s.mapUrl,
      // 접속 링크는 신청 확정자에게만 노출한다.
      meetingUrl: mine ? s.meetingUrl : null,
      scheduledAt: s.scheduledAt?.toISOString() ?? null,
      sessionDates: sessionIso,
      sessions,
      durationMin: s.durationMin,
      capacity: s.capacity,
      depositAmount: s.depositAmount,
      registerCloseDays: s.registerCloseDays,
      eventPassed,
      registrationOpen,
      coverImageUrl: s.coverImageUrl,
      status: s.status,
      registeredCount,
      spotsLeft,
      myRegistration: mine
        ? {
            id: mine.id,
            headCount: mine.headCount,
            status: mine.status,
            selectedDate: mine.selectedDate?.toISOString() ?? null,
            depositStatus: mine.depositStatus,
          }
        : null,
    };
  });
}

export async function registerGroupSeminar(
  seminarId: string,
  input: {
    applicantName: string;
    phone: string;
    email?: string;
    academyName?: string;
    headCount?: number;
    selectedDate?: string | null;
    message?: string;
    depositorName?: string;
    refundBankName?: string;
    refundAccountNumber?: string;
    refundAccountHolder?: string;
  },
) {
  const staff = await requireStaffAuth();
  const validated = groupSeminarRegistrationSchema.parse(input);

  const seminar = await prisma.groupSeminar.findUnique({
    where: { id: seminarId },
    select: {
      status: true,
      capacity: true,
      sessionDates: true,
      registerCloseDays: true,
      scheduledAt: true,
      depositAmount: true,
    },
  });
  if (!seminar) throw new Error("세미나를 찾을 수 없습니다.");
  if (seminar.status !== "OPEN") throw new Error("현재 모집 중인 세미나가 아닙니다.");

  // 세션 날짜 선택 검증. 여러 날짜가 있으면 그중 하나를 반드시 선택해야 한다.
  const sessions = Array.isArray(seminar.sessionDates)
    ? (seminar.sessionDates as string[])
    : [];
  let selectedDate: Date | null = null;
  if (sessions.length > 1) {
    if (!validated.selectedDate) {
      throw new Error("참석하실 날짜를 선택해 주세요.");
    }
    // ISO 시각으로 정확히 일치하는 세션만 허용.
    const picked = new Date(validated.selectedDate).getTime();
    const match = sessions.find((s) => new Date(s).getTime() === picked);
    if (!match) throw new Error("선택한 날짜가 올바르지 않습니다.");
    selectedDate = new Date(match);
  } else if (sessions.length === 1) {
    selectedDate = new Date(sessions[0]);
  }

  // 신청 마감(실행 N일 전) 검증. 선택 날짜(없으면 대표 일시)의 마감이 지났으면 접수 종료.
  const deadlineBase = selectedDate ?? seminar.scheduledAt ?? null;
  if (deadlineBase) {
    const closeMs = deadlineBase.getTime() - (seminar.registerCloseDays ?? 0) * 86_400_000;
    if (Date.now() >= closeMs) {
      throw new Error("신청 기간이 종료되었습니다.");
    }
  }

  // 이미 신청(취소 아님)했는지 확인.
  const existing = await prisma.groupSeminarRegistration.findUnique({
    where: { seminarId_staffId: { seminarId, staffId: staff.id } },
    select: { id: true, status: true },
  });
  if (existing && existing.status !== "CANCELED") {
    throw new Error("이미 신청한 세미나입니다.");
  }

  // 정원 검사. 세션 날짜가 있으면 "선택한 날짜"의 정원만 카운트(일자별 정원).
  if (seminar.capacity != null) {
    const where: {
      seminarId: string;
      status: { in: string[] };
      selectedDate?: Date;
    } = { seminarId, status: { in: ["REGISTERED", "ATTENDED"] } };
    if (selectedDate) where.selectedDate = selectedDate;
    const agg = await prisma.groupSeminarRegistration.aggregate({
      where,
      _sum: { headCount: true },
    });
    const taken = agg._sum.headCount ?? 0;
    if (taken + validated.headCount > seminar.capacity) {
      throw new Error(
        selectedDate ? "선택한 날짜의 정원이 마감되었습니다." : "정원이 마감되었습니다.",
      );
    }
  }

  // 참가 보증금 세미나면 입금자명 + 환급계좌를 필수로 받고 "입금대기(WAITING)"로 접수.
  // 실제 입금은 계좌이체 후 bank-notify 웹훅이 금액+입금자명으로 자동 확정(PAID)한다.
  const hasDeposit = (seminar.depositAmount ?? 0) > 0;
  let depositFields: Record<string, unknown> = { depositStatus: "NONE" };
  if (hasDeposit) {
    const depositorName = validated.depositorName?.trim() || validated.applicantName.trim();
    const refundBankName = validated.refundBankName?.trim();
    const refundAccountNumber = validated.refundAccountNumber?.trim();
    const refundAccountHolder = validated.refundAccountHolder?.trim();
    if (!refundBankName || !refundAccountNumber || !refundAccountHolder) {
      throw new Error("환급받을 계좌(은행·계좌번호·예금주)를 입력해 주세요.");
    }
    depositFields = {
      depositStatus: "WAITING",
      depositAmount: seminar.depositAmount,
      depositorName,
      refundBankName,
      refundAccountNumber,
      refundAccountHolder,
    };
  }

  const data = {
    academyId: staff.academyId,
    staffId: staff.id,
    applicantName: validated.applicantName,
    phone: validated.phone,
    email: validated.email || null,
    academyName: validated.academyName || staff.academyName || null,
    headCount: validated.headCount,
    selectedDate,
    message: validated.message || null,
    status: "REGISTERED",
    ...depositFields,
  };

  // 취소했던 신청이 있으면 재활성화(unique 제약 회피).
  const reg = existing
    ? await prisma.groupSeminarRegistration.update({ where: { id: existing.id }, data })
    : await prisma.groupSeminarRegistration.create({ data: { seminarId, ...data } });

  revalidatePath(GROUP_SEMINAR_PATH);
  return {
    success: true,
    id: reg.id,
    depositRequired: hasDeposit,
    depositAmount: seminar.depositAmount ?? null,
  };
}

export async function cancelGroupSeminarRegistration(registrationId: string) {
  const staff = await requireStaffAuth();
  const reg = await prisma.groupSeminarRegistration.findUnique({
    where: { id: registrationId },
    select: { staffId: true, status: true },
  });
  if (!reg || reg.staffId !== staff.id) throw new Error("권한이 없습니다.");
  if (reg.status === "ATTENDED") throw new Error("이미 참석 완료된 신청입니다.");

  await prisma.groupSeminarRegistration.update({
    where: { id: registrationId },
    data: { status: "CANCELED" },
  });
  revalidatePath(GROUP_SEMINAR_PATH);
  return { success: true };
}
