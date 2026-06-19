/**
 * Referral engine — single-hop, double-sided give-get.
 *
 * Flow: each academy has one stable ReferralCode. A friend lands on /register?ref=CODE,
 * the code rides a cookie through OAuth, and on onboarding `processReferralOnSignup`
 * attributes the new academy to the referrer. Fraud is scored; clean conversions
 * are GRANTED instantly (referrer +50, new academy +30), suspicious ones are HELD
 * for admin review. Idempotency: Referral.referredAcademyId is @unique, created in
 * the same transaction as the grant, so a retry/race can never double-pay.
 */

import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { grantBonusCreditsTx, clawbackCreditsTx } from "./credit-grant";
import { createNotification, getAcademyDirectorStaffId } from "./notifications";
import { evaluateReferralFraud } from "./referral-fraud";
import {
  REFERRAL_REFERRER_REWARD,
  REFERRAL_REFERRED_REWARD,
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  buildReferralLink,
} from "./constants";

function isUniqueViolation(e: unknown): e is Prisma.PrismaClientKnownRequestError {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

function generateCode(): string {
  const bytes = randomBytes(REFERRAL_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    out += REFERRAL_CODE_ALPHABET[bytes[i] % REFERRAL_CODE_ALPHABET.length];
  }
  return out;
}

export function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// ─── Code lifecycle ─────────────────────────────────────────────────────────

/** Get the academy's referral code, creating a unique one on first call. */
export async function getOrCreateReferralCode(academyId: string, createdByStaffId?: string | null) {
  const existing = await prisma.referralCode.findUnique({ where: { academyId } });
  if (existing) return existing;

  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      return await prisma.referralCode.create({
        data: { academyId, code: generateCode(), createdByStaffId: createdByStaffId ?? null },
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        // Either a concurrent create for this academy, or a code collision.
        const byAcademy = await prisma.referralCode.findUnique({ where: { academyId } });
        if (byAcademy) return byAcademy;
        continue; // code collision → retry with a new code
      }
      throw e;
    }
  }
  throw new Error("Failed to generate a unique referral code");
}

export interface ReferralStats {
  code: string;
  link: string;
  totalClicks: number;
  totalSignups: number;
  totalRewarded: number;
  rewardedCount: number;
  heldCount: number;
  creditsEarned: number;
}

/** Stats for the director-facing referral panel. */
export async function getReferralStats(academyId: string): Promise<ReferralStats> {
  const referralCode = await getOrCreateReferralCode(academyId);
  const referrals = await prisma.referral.findMany({
    where: { referrerAcademyId: academyId },
    select: { status: true, referrerReward: true },
  });
  const rewardedCount = referrals.filter((r) => r.status === "GRANTED" || r.status === "APPROVED").length;
  const heldCount = referrals.filter((r) => r.status === "HELD").length;
  const creditsEarned = referrals
    .filter((r) => r.status === "GRANTED" || r.status === "APPROVED")
    .reduce((sum, r) => sum + r.referrerReward, 0);

  return {
    code: referralCode.code,
    link: buildReferralLink(referralCode.code),
    totalClicks: referralCode.totalClicks,
    totalSignups: referralCode.totalSignups,
    totalRewarded: referralCode.totalRewarded,
    rewardedCount,
    heldCount,
    creditsEarned,
  };
}

/** Increment click counter (best-effort, non-throwing). */
export async function recordReferralClick(code: string): Promise<void> {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return;
  try {
    await prisma.referralCode.updateMany({
      where: { code: normalized },
      data: { totalClicks: { increment: 1 } },
    });
  } catch {
    // best-effort
  }
}

// ─── Signup attribution ─────────────────────────────────────────────────────

export interface ProcessReferralInput {
  code: string;
  referredAcademyId: string;
  referredStaffId?: string | null;
  referredAcademyName?: string | null;
  referredDirectorPhone?: string | null;
  referredDirectorEmail?: string | null;
  signupIp?: string | null;
  signupUserAgent?: string | null;
}

export interface ProcessReferralResult {
  ok: boolean;
  reason?: "invalid_code" | "self_referral" | "already_referred";
  status?: "GRANTED" | "HELD";
  referrerReward?: number;
  referredReward?: number;
}

/**
 * Attribute a freshly-created academy to a referral code and (if clean) grant
 * both sides instantly. Call AFTER the onboarding transaction commits, so both
 * academies' CreditBalance rows already exist. Never throws on business outcomes
 * — returns {ok:false, reason} so signup is never blocked by referral logic.
 */
export async function processReferralOnSignup(
  input: ProcessReferralInput,
): Promise<ProcessReferralResult> {
  const normalized = normalizeReferralCode(input.code);
  if (!normalized) return { ok: false, reason: "invalid_code" };

  const referralCode = await prisma.referralCode.findUnique({ where: { code: normalized } });
  if (!referralCode) return { ok: false, reason: "invalid_code" };

  const referrerAcademyId = referralCode.academyId;
  if (referrerAcademyId === input.referredAcademyId) {
    return { ok: false, reason: "self_referral" };
  }

  // Already attributed? (referredAcademyId is @unique)
  const existing = await prisma.referral.findUnique({
    where: { referredAcademyId: input.referredAcademyId },
    select: { id: true },
  });
  if (existing) return { ok: false, reason: "already_referred" };

  const fraud = await evaluateReferralFraud({
    referrerAcademyId,
    referredAcademyId: input.referredAcademyId,
    referredDirectorPhone: input.referredDirectorPhone,
    referredDirectorEmail: input.referredDirectorEmail,
    signupIp: input.signupIp,
  });

  const status: "GRANTED" | "HELD" = fraud.shouldHold ? "HELD" : "GRANTED";
  const referrerReward = REFERRAL_REFERRER_REWARD;
  const referredReward = REFERRAL_REFERRED_REWARD;

  try {
    await prisma.$transaction(async (tx) => {
      // Idempotency guard — unique referredAcademyId. A concurrent run throws P2002 here.
      const referral = await tx.referral.create({
        data: {
          referralCodeId: referralCode.id,
          referrerAcademyId,
          referredAcademyId: input.referredAcademyId,
          referredStaffId: input.referredStaffId ?? null,
          referrerReward,
          referredReward,
          status,
          fraudScore: fraud.score,
          fraudSignals: fraud.signals as unknown as Prisma.InputJsonValue,
          signupIp: input.signupIp ?? null,
          signupUserAgent: input.signupUserAgent ?? null,
        },
      });

      // Always count the signup.
      await tx.referralCode.update({
        where: { id: referralCode.id },
        data: { totalSignups: { increment: 1 } },
      });

      if (status === "GRANTED") {
        const referrerGrant = await grantBonusCreditsTx(tx, {
          academyId: referrerAcademyId,
          amount: referrerReward,
          description: `친구 추천 보상 (신규 학원 가입, 코드 ${referralCode.code})`,
          operationType: "REFERRAL_REFERRER",
          referenceId: referral.id,
          referenceType: "REFERRAL",
          metadata: { referredAcademyId: input.referredAcademyId, code: referralCode.code },
        });
        const referredGrant = await grantBonusCreditsTx(tx, {
          academyId: input.referredAcademyId,
          amount: referredReward,
          description: `추천 코드 입력 환영 보너스 (코드 ${referralCode.code})`,
          operationType: "REFERRAL_REFERRED",
          referenceId: referral.id,
          referenceType: "REFERRAL",
          staffId: input.referredStaffId ?? null,
          metadata: { referrerAcademyId, code: referralCode.code },
        });

        await tx.referral.update({
          where: { id: referral.id },
          data: {
            referrerTxId: referrerGrant.transactionId,
            referredTxId: referredGrant.transactionId,
            grantedAt: new Date(),
          },
        });
        await tx.referralCode.update({
          where: { id: referralCode.id },
          data: { totalRewarded: { increment: referrerReward + referredReward } },
        });

        // Notify referrer's director.
        const referrerDirectorId = await getAcademyDirectorStaffId(referrerAcademyId, tx);
        if (referrerDirectorId) {
          await createNotification(
            {
              academyId: referrerAcademyId,
              recipientStaffId: referrerDirectorId,
              category: "REFERRAL",
              type: "REFERRAL_FRIEND_JOINED",
              title: `추천 보상 +${referrerReward} 크레딧 적립`,
              body: input.referredAcademyName
                ? `${input.referredAcademyName} 학원이 추천 코드로 가입했어요.`
                : "추천 코드로 신규 학원이 가입했어요.",
              iconKey: "user-plus",
              actionUrl: "/director/rewards#referral",
              data: { referredAcademyId: input.referredAcademyId, creditAmount: referrerReward },
            },
            tx,
          );
        }

        // Welcome notification to the new academy's director.
        if (input.referredStaffId) {
          await createNotification(
            {
              academyId: input.referredAcademyId,
              recipientStaffId: input.referredStaffId,
              category: "REFERRAL",
              type: "REFERRAL_WELCOME_BONUS",
              title: `환영 보너스 +${referredReward} 크레딧`,
              body: "추천 코드 입력으로 환영 크레딧을 받았어요. 첫 문제를 생성해 보세요!",
              iconKey: "gift",
              actionUrl: "/director/rewards",
              data: { creditAmount: referredReward },
            },
            tx,
          );
        }
      }
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, reason: "already_referred" };
    throw e;
  }

  return { ok: true, status, referrerReward, referredReward };
}

// ─── Admin state transitions ────────────────────────────────────────────────

export interface ReferralAdminActionResult {
  ok: boolean;
  error?: string;
}

/** Approve a HELD referral → grant both sides, mark APPROVED. */
export async function approveHeldReferral(
  referralId: string,
  adminId: string,
  note?: string,
): Promise<ReferralAdminActionResult> {
  try {
    await prisma.$transaction(async (tx) => {
      const referral = await tx.referral.findUnique({ where: { id: referralId } });
      if (!referral) throw new Error("not_found");
      if (referral.status !== "HELD") throw new Error("not_held");

      // Atomic compare-and-set: only the winning concurrent tx flips HELD→APPROVED
      // and goes on to grant. A racing duplicate (double-click / two admins) sees
      // count 0 here and aborts BEFORE granting — preventing a double payout.
      const moved = await tx.referral.updateMany({
        where: { id: referralId, status: "HELD" },
        data: {
          status: "APPROVED",
          grantedAt: new Date(),
          reviewedByAdminId: adminId,
          reviewedAt: new Date(),
          reviewNote: note ?? null,
        },
      });
      if (moved.count === 0) throw new Error("not_held");

      const referrerGrant = await grantBonusCreditsTx(tx, {
        academyId: referral.referrerAcademyId,
        amount: referral.referrerReward,
        description: `친구 추천 보상 (관리자 승인)`,
        operationType: "REFERRAL_REFERRER",
        referenceId: referral.id,
        referenceType: "REFERRAL",
        adminId,
      });
      const referredGrant = await grantBonusCreditsTx(tx, {
        academyId: referral.referredAcademyId,
        amount: referral.referredReward,
        description: `추천 환영 보너스 (관리자 승인)`,
        operationType: "REFERRAL_REFERRED",
        referenceId: referral.id,
        referenceType: "REFERRAL",
        adminId,
      });

      await tx.referral.update({
        where: { id: referral.id },
        data: {
          referrerTxId: referrerGrant.transactionId,
          referredTxId: referredGrant.transactionId,
        },
      });
      await tx.referralCode.update({
        where: { id: referral.referralCodeId },
        data: { totalRewarded: { increment: referral.referrerReward + referral.referredReward } },
      });

      const referrerDirectorId = await getAcademyDirectorStaffId(referral.referrerAcademyId, tx);
      if (referrerDirectorId) {
        await createNotification(
          {
            academyId: referral.referrerAcademyId,
            recipientStaffId: referrerDirectorId,
            category: "REFERRAL",
            type: "REFERRAL_FRIEND_JOINED",
            title: `추천 보상 +${referral.referrerReward} 크레딧 적립`,
            body: "관리자 검토 후 추천 보상이 지급되었습니다.",
            iconKey: "user-plus",
            actionUrl: "/director/rewards#referral",
            data: { creditAmount: referral.referrerReward },
          },
          tx,
        );
      }
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

/** Reject a HELD referral → no grant, mark REJECTED. */
export async function rejectHeldReferral(
  referralId: string,
  adminId: string,
  note?: string,
): Promise<ReferralAdminActionResult> {
  try {
    const result = await prisma.referral.updateMany({
      where: { id: referralId, status: "HELD" },
      data: {
        status: "REJECTED",
        reviewedByAdminId: adminId,
        reviewedAt: new Date(),
        reviewNote: note ?? null,
      },
    });
    if (result.count === 0) return { ok: false, error: "not_held" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

/** Claw back an already-GRANTED/APPROVED referral (confirmed fraud) → reverse credits. */
export async function clawbackReferral(
  referralId: string,
  adminId: string,
  note?: string,
): Promise<ReferralAdminActionResult> {
  try {
    await prisma.$transaction(async (tx) => {
      const referral = await tx.referral.findUnique({ where: { id: referralId } });
      if (!referral) throw new Error("not_found");
      if (referral.status !== "GRANTED" && referral.status !== "APPROVED") {
        throw new Error("not_grantable_state");
      }

      // Atomic compare-and-set: only the winning tx moves to CLAWED_BACK and
      // reverses credits; a racing duplicate aborts (no double-reversal / dup ledger row).
      const moved = await tx.referral.updateMany({
        where: { id: referralId, status: { in: ["GRANTED", "APPROVED"] } },
        data: {
          status: "CLAWED_BACK",
          clawedBackAt: new Date(),
          reviewedByAdminId: adminId,
          reviewedAt: new Date(),
          reviewNote: note ?? null,
        },
      });
      if (moved.count === 0) throw new Error("not_grantable_state");

      if (referral.referrerReward > 0) {
        await clawbackCreditsTx(tx, {
          academyId: referral.referrerAcademyId,
          amount: referral.referrerReward,
          description: "추천 보상 회수 (관리자 클로백)",
          referenceId: referral.id,
          referenceType: "REFERRAL",
          adminId,
        });
      }
      if (referral.referredReward > 0) {
        await clawbackCreditsTx(tx, {
          academyId: referral.referredAcademyId,
          amount: referral.referredReward,
          description: "추천 환영 보너스 회수 (관리자 클로백)",
          referenceId: referral.id,
          referenceType: "REFERRAL",
          adminId,
        });
      }
      // status/clawedBackAt/reviewer already set atomically by the CAS updateMany above.
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}
