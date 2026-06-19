"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import {
  approveHeldReferral,
  rejectHeldReferral,
  clawbackReferral as clawbackReferralReward,
} from "@/lib/growth/referral";
import { broadcastToAllAcademies } from "@/lib/growth/notifications";
import { type ActionResult, fail } from "@/actions/admin-members/_shared";

// ============================================================================
// Unit D — Superadmin referral & mission management server actions.
//
// Every mutation: requireAdminAuth() first, then write an AdminAuditLog row
// (ideally in the same $transaction as the mutation, but the referral/mission
// state transitions live in @/lib/growth/* which run their own transactions —
// so for those we write the audit row immediately after the lib call succeeds,
// guarded by the lib's own idempotent/atomic state checks).
// ============================================================================

const REFERRAL_PATH = "/admin/referrals";

// A fraud signal as persisted on Referral.fraudSignals (jsonb array).
export interface FraudSignal {
  code: string;
  detail: string;
  weight: number;
}

export type ReferralStatus =
  | "GRANTED"
  | "HELD"
  | "APPROVED"
  | "REJECTED"
  | "CLAWED_BACK";

export interface ReferralOverviewRow {
  id: string;
  referrerAcademyName: string;
  referredAcademyName: string;
  status: ReferralStatus;
  referrerReward: number;
  referredReward: number;
  fraudScore: number;
  createdAt: string;
  grantedAt: string | null;
  reviewedAt: string | null;
}

export interface ReferralOverviewStats {
  totalSignups: number;
  granted: number;
  held: number;
  rejected: number;
  clawedBack: number;
  creditsIssued: number;
}

export interface ReferralOverview {
  rows: ReferralOverviewRow[];
  stats: ReferralOverviewStats;
}

export interface HeldReferralRow {
  id: string;
  referrerAcademyName: string;
  referredAcademyName: string;
  referrerReward: number;
  referredReward: number;
  fraudScore: number;
  fraudSignals: FraudSignal[];
  createdAt: string;
}

export interface MissionCatalogRow {
  id: string;
  key: string;
  title: string;
  description: string | null;
  category: string;
  cadence: string;
  rewardCredits: number;
  iconKey: string | null;
  actionUrl: string | null;
  ctaLabel: string | null;
  sortOrder: number;
  isActive: boolean;
  maxRewardPerMonth: number | null;
}

// fraudSignals is persisted as `Json?` — coerce defensively into a typed array.
function coerceFraudSignals(raw: unknown): FraudSignal[] {
  if (!Array.isArray(raw)) return [];
  const out: FraudSignal[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      out.push({
        code: typeof obj.code === "string" ? obj.code : "UNKNOWN",
        detail: typeof obj.detail === "string" ? obj.detail : "",
        weight: typeof obj.weight === "number" ? obj.weight : 0,
      });
    }
  }
  return out;
}

function asStatus(raw: string): ReferralStatus {
  switch (raw) {
    case "GRANTED":
    case "HELD":
    case "APPROVED":
    case "REJECTED":
    case "CLAWED_BACK":
      return raw;
    default:
      return "GRANTED";
  }
}

// ─── Reads ────────────────────────────────────────────────────────────────

/** Recent referral rows + aggregate stats, with academy NAMES joined. */
export async function getReferralOverview(): Promise<ReferralOverview> {
  await requireAdminAuth();

  const [rows, grouped] = await Promise.all([
    prisma.referral.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        status: true,
        referrerReward: true,
        referredReward: true,
        fraudScore: true,
        createdAt: true,
        grantedAt: true,
        reviewedAt: true,
        referrerAcademy: { select: { name: true } },
        referredAcademy: { select: { name: true } },
      },
    }),
    prisma.referral.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const byStatus = new Map<string, number>();
  for (const g of grouped) byStatus.set(g.status, g._count._all);

  // creditsIssued = both-side rewards actually paid out (GRANTED + APPROVED).
  const issuedAgg = await prisma.referral.aggregate({
    where: { status: { in: ["GRANTED", "APPROVED"] } },
    _sum: { referrerReward: true, referredReward: true },
  });
  const creditsIssued =
    (issuedAgg._sum.referrerReward ?? 0) + (issuedAgg._sum.referredReward ?? 0);

  const stats: ReferralOverviewStats = {
    totalSignups: grouped.reduce((sum, g) => sum + g._count._all, 0),
    granted: byStatus.get("GRANTED") ?? 0,
    held: byStatus.get("HELD") ?? 0,
    rejected: byStatus.get("REJECTED") ?? 0,
    clawedBack: byStatus.get("CLAWED_BACK") ?? 0,
    creditsIssued,
  };

  return {
    rows: rows.map((r) => ({
      id: r.id,
      referrerAcademyName: r.referrerAcademy?.name ?? "(삭제된 학원)",
      referredAcademyName: r.referredAcademy?.name ?? "(삭제된 학원)",
      status: asStatus(r.status),
      referrerReward: r.referrerReward,
      referredReward: r.referredReward,
      fraudScore: r.fraudScore,
      createdAt: r.createdAt.toISOString(),
      grantedAt: r.grantedAt?.toISOString() ?? null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    })),
    stats,
  };
}

/** HELD rows awaiting review — with fraud score / signals + academy names. */
export async function getHeldReferrals(): Promise<HeldReferralRow[]> {
  await requireAdminAuth();

  const rows = await prisma.referral.findMany({
    where: { status: "HELD" },
    orderBy: [{ fraudScore: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      referrerReward: true,
      referredReward: true,
      fraudScore: true,
      fraudSignals: true,
      createdAt: true,
      referrerAcademy: { select: { name: true } },
      referredAcademy: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    referrerAcademyName: r.referrerAcademy?.name ?? "(삭제된 학원)",
    referredAcademyName: r.referredAcademy?.name ?? "(삭제된 학원)",
    referrerReward: r.referrerReward,
    referredReward: r.referredReward,
    fraudScore: r.fraudScore,
    fraudSignals: coerceFraudSignals(r.fraudSignals),
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Full mission catalog for the admin table. */
export async function getMissionCatalog(): Promise<MissionCatalogRow[]> {
  await requireAdminAuth();

  const missions = await prisma.creditMission.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return missions.map((m) => ({
    id: m.id,
    key: m.key,
    title: m.title,
    description: m.description,
    category: m.category,
    cadence: m.cadence,
    rewardCredits: m.rewardCredits,
    iconKey: m.iconKey,
    actionUrl: m.actionUrl,
    ctaLabel: m.ctaLabel,
    sortOrder: m.sortOrder,
    isActive: m.isActive,
    maxRewardPerMonth: m.maxRewardPerMonth,
  }));
}

// ─── Referral state transitions (each: lib call → audit → revalidate) ───────

const reasonSchema = z
  .string()
  .trim()
  .max(500, "사유는 500자 이하로 입력해주세요.")
  .optional();

const referralIdSchema = z.string().min(1, "referralId가 필요합니다.");

export async function approveReferral(
  referralId: string,
  reason?: string,
): Promise<ActionResult> {
  const session = await requireAdminAuth();

  const id = referralIdSchema.safeParse(referralId);
  if (!id.success) return fail(id.error.issues[0]?.message ?? "잘못된 요청입니다.");
  const parsedReason = reasonSchema.safeParse(reason);
  if (!parsedReason.success) {
    return fail(parsedReason.error.issues[0]?.message ?? "사유가 올바르지 않습니다.");
  }
  const note = parsedReason.data;

  const result = await approveHeldReferral(referralId, session.adminId, note);
  if (!result.ok) {
    return fail(
      result.error === "not_held"
        ? "보류 상태인 추천만 승인할 수 있습니다."
        : result.error === "not_found"
          ? "추천 기록을 찾을 수 없습니다."
          : "승인 중 오류가 발생했습니다.",
    );
  }

  await prisma.adminAuditLog.create({
    data: {
      adminId: session.adminId,
      targetType: "REFERRAL",
      targetId: referralId,
      action: "APPROVE_REWARD",
      reason: note ?? null,
    },
  });

  revalidatePath(REFERRAL_PATH);
  return { success: true };
}

export async function rejectReferral(
  referralId: string,
  reason?: string,
): Promise<ActionResult> {
  const session = await requireAdminAuth();

  const id = referralIdSchema.safeParse(referralId);
  if (!id.success) return fail(id.error.issues[0]?.message ?? "잘못된 요청입니다.");
  const parsedReason = reasonSchema.safeParse(reason);
  if (!parsedReason.success) {
    return fail(parsedReason.error.issues[0]?.message ?? "사유가 올바르지 않습니다.");
  }
  const note = parsedReason.data;

  const result = await rejectHeldReferral(referralId, session.adminId, note);
  if (!result.ok) {
    return fail(
      result.error === "not_held"
        ? "보류 상태인 추천만 반려할 수 있습니다."
        : "반려 중 오류가 발생했습니다.",
    );
  }

  await prisma.adminAuditLog.create({
    data: {
      adminId: session.adminId,
      targetType: "REFERRAL",
      targetId: referralId,
      action: "REJECT_REWARD",
      reason: note ?? null,
    },
  });

  revalidatePath(REFERRAL_PATH);
  return { success: true };
}

export async function clawbackReferral(
  referralId: string,
  reason?: string,
): Promise<ActionResult> {
  const session = await requireAdminAuth();

  const id = referralIdSchema.safeParse(referralId);
  if (!id.success) return fail(id.error.issues[0]?.message ?? "잘못된 요청입니다.");
  const parsedReason = reasonSchema.safeParse(reason);
  if (!parsedReason.success) {
    return fail(parsedReason.error.issues[0]?.message ?? "사유가 올바르지 않습니다.");
  }
  const note = parsedReason.data;

  const result = await clawbackReferralReward(referralId, session.adminId, note);
  if (!result.ok) {
    return fail(
      result.error === "not_grantable_state"
        ? "지급 완료된 추천만 회수할 수 있습니다."
        : result.error === "not_found"
          ? "추천 기록을 찾을 수 없습니다."
          : "회수 중 오류가 발생했습니다.",
    );
  }

  await prisma.adminAuditLog.create({
    data: {
      adminId: session.adminId,
      targetType: "REFERRAL",
      targetId: referralId,
      action: "CLAWBACK_REWARD",
      reason: note ?? null,
    },
  });

  revalidatePath(REFERRAL_PATH);
  return { success: true };
}

// ─── Mission catalog mutations ──────────────────────────────────────────────

const upsertMissionSchema = z.object({
  id: z.string().min(1).optional(),
  key: z
    .string()
    .trim()
    .min(2, "key는 2자 이상이어야 합니다.")
    .max(64, "key는 64자 이하여야 합니다.")
    .regex(/^[A-Z0-9_]+$/, "key는 대문자/숫자/밑줄만 사용할 수 있습니다."),
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(120),
  description: z.string().trim().max(500).optional().nullable(),
  category: z.string().trim().min(1, "카테고리를 입력해주세요.").max(40),
  cadence: z.string().trim().min(1, "주기를 입력해주세요.").max(20),
  rewardCredits: z
    .number()
    .int("정수만 입력 가능합니다.")
    .min(0, "0 이상이어야 합니다.")
    .max(100_000, "보상이 너무 큽니다."),
  iconKey: z.string().trim().max(40).optional().nullable(),
  actionUrl: z.string().trim().max(500).optional().nullable(),
  ctaLabel: z.string().trim().max(60).optional().nullable(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  maxRewardPerMonth: z
    .number()
    .int()
    .min(0)
    .max(1_000_000)
    .optional()
    .nullable(),
});

export type UpsertMissionInput = z.input<typeof upsertMissionSchema>;

export async function upsertMission(
  input: UpsertMissionInput,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireAdminAuth();

  const parsed = upsertMissionSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }
  const data = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = data.id
        ? await tx.creditMission.findUnique({ where: { id: data.id } })
        : await tx.creditMission.findUnique({ where: { key: data.key } });

      const writeData = {
        key: data.key,
        title: data.title,
        description: data.description ?? null,
        category: data.category,
        cadence: data.cadence,
        rewardCredits: data.rewardCredits,
        iconKey: data.iconKey ?? null,
        actionUrl: data.actionUrl ?? null,
        ctaLabel: data.ctaLabel ?? null,
        sortOrder: data.sortOrder ?? existing?.sortOrder ?? 0,
        maxRewardPerMonth: data.maxRewardPerMonth ?? null,
      };

      const mission = existing
        ? await tx.creditMission.update({
            where: { id: existing.id },
            data: writeData,
          })
        : await tx.creditMission.create({ data: writeData });

      await tx.adminAuditLog.create({
        data: {
          adminId: session.adminId,
          targetType: "CREDIT_MISSION",
          targetId: mission.id,
          action: "UPSERT_MISSION",
          beforeJson: existing
            ? JSON.stringify({
                title: existing.title,
                rewardCredits: existing.rewardCredits,
                isActive: existing.isActive,
                sortOrder: existing.sortOrder,
              })
            : null,
          afterJson: JSON.stringify({
            key: mission.key,
            title: mission.title,
            rewardCredits: mission.rewardCredits,
            sortOrder: mission.sortOrder,
          }),
        },
      });

      return mission;
    });

    revalidatePath(REFERRAL_PATH);
    return { success: true, id: result.id };
  } catch (err) {
    // P2002 = unique key collision when creating with an already-used `key`.
    const message =
      err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002"
        ? "이미 존재하는 미션 key입니다."
        : "미션 저장 중 오류가 발생했습니다.";
    console.error("[upsertMission] failed", { adminId: session.adminId, err });
    return fail(message);
  }
}

const toggleMissionSchema = z.object({
  id: z.string().min(1),
  isActive: z.boolean(),
});

export async function toggleMission(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const session = await requireAdminAuth();

  const parsed = toggleMissionSchema.safeParse({ id, isActive });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }

  const mission = await prisma.creditMission.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, isActive: true },
  });
  if (!mission) return fail("미션을 찾을 수 없습니다.");
  if (mission.isActive === parsed.data.isActive) {
    return fail(parsed.data.isActive ? "이미 활성 상태입니다." : "이미 비활성 상태입니다.");
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.creditMission.update({
        where: { id: mission.id },
        data: { isActive: parsed.data.isActive },
      });
      await tx.adminAuditLog.create({
        data: {
          adminId: session.adminId,
          targetType: "CREDIT_MISSION",
          targetId: mission.id,
          action: "TOGGLE_MISSION",
          beforeJson: JSON.stringify({ isActive: mission.isActive }),
          afterJson: JSON.stringify({ isActive: parsed.data.isActive }),
        },
      });
    });
  } catch (err) {
    console.error("[toggleMission] failed", { id: mission.id, adminId: session.adminId, err });
    return fail("상태 변경 중 오류가 발생했습니다.");
  }

  revalidatePath(REFERRAL_PATH);
  return { success: true };
}

// ─── Announcement broadcast ─────────────────────────────────────────────────

const announcementSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(120, "제목은 120자 이하로 입력해주세요."),
  body: z.string().trim().max(2000, "본문은 2000자 이하로 입력해주세요.").optional().nullable(),
  category: z.enum(["MISSION", "REFERRAL", "SYSTEM", "BILLING"]).optional(),
  target: z.enum(["ALL_DIRECTORS", "ALL_STAFF"]),
  actionUrl: z.string().trim().max(500).optional().nullable(),
});

export type SendAnnouncementInput = z.input<typeof announcementSchema>;

export async function sendAnnouncement(
  input: SendAnnouncementInput,
): Promise<ActionResult<{ count: number }>> {
  const session = await requireAdminAuth();

  const parsed = announcementSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }
  const { title, body, category, target, actionUrl } = parsed.data;

  try {
    const result = await broadcastToAllAcademies(
      {
        category: category ?? "SYSTEM",
        type: "SYSTEM_ANNOUNCEMENT",
        title,
        body: body ?? null,
        iconKey: "megaphone",
        actionUrl: actionUrl ?? null,
      },
      { scope: target },
    );

    await prisma.adminAuditLog.create({
      data: {
        adminId: session.adminId,
        targetType: "ANNOUNCEMENT",
        targetId: target,
        action: "SEND_ANNOUNCEMENT",
        metadata: JSON.stringify({
          count: result.count,
          target,
          category: category ?? "SYSTEM",
          title,
        }),
      },
    });

    return { success: true, count: result.count };
  } catch (err) {
    console.error("[sendAnnouncement] failed", { adminId: session.adminId, err });
    return fail("공지 발송 중 오류가 발생했습니다.");
  }
}
