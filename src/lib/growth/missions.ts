/**
 * Credit mission engine. Missions are an admin-managed catalog (CreditMission);
 * per-academy completion is recorded idempotently in AcademyMissionClaim with a
 * unique (academyId, missionKey, periodKey). periodKey is "ONCE" for one-time
 * missions and the KST date for DAILY ones, so the unique constraint is the
 * single source of truth that prevents double-claiming under concurrency.
 *
 * Onboarding missions are gated on a real, value-aligned condition (logo added,
 * first generation done) re-verified server-side at claim time — never on busywork.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { grantBonusCreditsTx } from "./credit-grant";
import { createNotification } from "./notifications";
import { MISSION_KEYS, kstDateKey, kstMonthStart } from "./constants";

function isUniqueViolation(e: unknown): e is Prisma.PrismaClientKnownRequestError {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

function periodKeyFor(cadence: string): string {
  return cadence === "DAILY" ? kstDateKey() : "ONCE";
}

export interface MissionView {
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
  completed: boolean; // ONCE: ever; DAILY: today; EVENT: derived
  claimable: boolean; // condition met & not yet claimed this period & button-claimable
  lockedReason: string | null; // why not claimable (condition not met)
}

interface ConditionContext {
  logoUrl: string | null;
  hasConsumption: boolean;
}

/** Fetch all condition inputs in ONE round (avoids N+1 in the mission list loop). */
async function loadConditionContext(academyId: string): Promise<ConditionContext> {
  const [academy, consumed] = await Promise.all([
    prisma.academy.findUnique({ where: { id: academyId }, select: { logoUrl: true } }),
    prisma.creditTransaction.count({ where: { academyId, type: "CONSUMPTION" } }),
  ]);
  return { logoUrl: academy?.logoUrl ?? null, hasConsumption: consumed > 0 };
}

/** Pure, synchronous condition evaluation from a pre-fetched context. */
function evalCondition(
  missionKey: string,
  ctx: ConditionContext,
): { met: boolean; reason: string | null } {
  switch (missionKey) {
    case MISSION_KEYS.ONBOARD_PROFILE:
      return ctx.logoUrl
        ? { met: true, reason: null }
        : { met: false, reason: "학원 로고를 등록하면 받을 수 있어요" };
    case MISSION_KEYS.ONBOARD_FIRST_GENERATION:
      return ctx.hasConsumption
        ? { met: true, reason: null }
        : { met: false, reason: "첫 문제를 생성하면 받을 수 있어요" };
    default:
      return { met: true, reason: null };
  }
}

/**
 * Re-verify a single mission's qualifying condition server-side (used at claim time).
 * DAILY/EXPLORE missions are unconditional; ONBOARDING missions require real product
 * progress. Short-circuits before any DB read for unconditional missions.
 */
async function conditionMet(
  missionKey: string,
  academyId: string,
): Promise<{ met: boolean; reason: string | null }> {
  if (
    missionKey !== MISSION_KEYS.ONBOARD_PROFILE &&
    missionKey !== MISSION_KEYS.ONBOARD_FIRST_GENERATION
  ) {
    return { met: true, reason: null };
  }
  const ctx = await loadConditionContext(academyId);
  return evalCondition(missionKey, ctx);
}

/** List all active missions with this academy's completion/claimable state. */
export async function getMissionsForAcademy(academyId: string): Promise<MissionView[]> {
  const missions = await prisma.creditMission.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const today = kstDateKey();
  const claims = await prisma.academyMissionClaim.findMany({
    where: { academyId },
    select: { missionKey: true, periodKey: true },
  });
  const onceClaimed = new Set(claims.filter((c) => c.periodKey === "ONCE").map((c) => c.missionKey));
  const todayClaimed = new Set(claims.filter((c) => c.periodKey === today).map((c) => c.missionKey));

  // Has this academy ever earned a referral reward? (for the EVENT card state)
  const grantedReferrals = await prisma.referral.count({
    where: { referrerAcademyId: academyId, status: { in: ["GRANTED", "APPROVED"] } },
  });

  // Pre-fetch onboarding-condition inputs once (no per-mission queries in the loop).
  const conditionCtx = await loadConditionContext(academyId);

  const views: MissionView[] = [];
  for (const m of missions) {
    let completed = false;
    let claimable = false;
    let lockedReason: string | null = null;

    if (m.cadence === "DAILY") {
      completed = todayClaimed.has(m.key);
      claimable = !completed;
    } else if (m.cadence === "EVENT") {
      // Not button-claimable (auto-granted by the system, e.g. referral).
      completed = m.key === MISSION_KEYS.FRIEND_REFERRAL ? grantedReferrals > 0 : false;
      claimable = false;
    } else {
      // ONCE
      completed = onceClaimed.has(m.key);
      if (!completed) {
        const cond = evalCondition(m.key, conditionCtx);
        claimable = cond.met;
        lockedReason = cond.met ? null : cond.reason;
      }
    }

    views.push({
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
      completed,
      claimable,
      lockedReason,
    });
  }
  return views;
}

export interface ClaimResult {
  ok: boolean;
  reason?: "mission_not_found" | "not_claimable" | "already_claimed" | "condition_not_met" | "monthly_cap";
  rewardCredits?: number;
  balanceAfter?: number;
}

/**
 * Claim a mission's reward. Idempotent: the unique (academyId, missionKey, periodKey)
 * constraint guarantees one grant per period even under concurrent calls.
 */
export async function claimMission(
  academyId: string,
  missionKey: string,
  staffId?: string | null,
): Promise<ClaimResult> {
  const mission = await prisma.creditMission.findUnique({ where: { key: missionKey } });
  if (!mission || !mission.isActive) return { ok: false, reason: "mission_not_found" };
  if (mission.cadence === "EVENT") return { ok: false, reason: "not_claimable" };

  // Re-verify qualifying condition (onboarding missions).
  const cond = await conditionMet(missionKey, academyId);
  if (!cond.met) return { ok: false, reason: "condition_not_met" };

  // Monthly cap (if configured).
  if (mission.maxRewardPerMonth != null) {
    const since = kstMonthStart();
    const monthCount = await prisma.academyMissionClaim.count({
      where: { academyId, missionKey, createdAt: { gte: since } },
    });
    if (monthCount >= mission.maxRewardPerMonth) return { ok: false, reason: "monthly_cap" };
  }

  const periodKey = periodKeyFor(mission.cadence);

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Idempotency guard — duplicate insert throws P2002 and aborts the grant.
      const claim = await tx.academyMissionClaim.create({
        data: {
          academyId,
          missionKey,
          periodKey,
          rewardCredits: mission.rewardCredits,
          claimedByStaffId: staffId ?? null,
        },
      });

      const grant = await grantBonusCreditsTx(tx, {
        academyId,
        amount: mission.rewardCredits,
        description: `미션 보상: ${mission.title}`,
        operationType: `MISSION_${mission.key}`,
        referenceId: claim.id,
        referenceType: "MISSION",
        staffId: staffId ?? null,
        metadata: { missionKey, periodKey },
      });

      await tx.academyMissionClaim.update({
        where: { id: claim.id },
        data: { creditTxId: grant.transactionId },
      });

      if (staffId) {
        await createNotification(
          {
            academyId,
            recipientStaffId: staffId,
            category: "MISSION",
            type: "MISSION_REWARD",
            title: `미션 완료 +${mission.rewardCredits} 크레딧`,
            body: mission.title,
            iconKey: mission.iconKey ?? "coins",
            actionUrl: "/director/rewards",
            data: { missionKey, creditAmount: mission.rewardCredits },
          },
          tx,
        );
      }

      return { rewardCredits: mission.rewardCredits, balanceAfter: grant.balanceAfter };
    });

    return { ok: true, rewardCredits: result.rewardCredits, balanceAfter: result.balanceAfter };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, reason: "already_claimed" };
    throw e;
  }
}

/** Daily attendance check-in. */
export function recordDailyCheckin(academyId: string, staffId?: string | null) {
  return claimMission(academyId, MISSION_KEYS.DAILY_CHECKIN, staffId);
}

/** One-time "shared my referral link to KakaoTalk" reward. */
export function recordKakaoShare(academyId: string, staffId?: string | null) {
  return claimMission(academyId, MISSION_KEYS.KAKAO_SHARE, staffId);
}
