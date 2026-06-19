/**
 * Referral fraud scoring. B2B academies carry strong real-world identifiers
 * (director phone, signup IP), so self-referral — the #1 abuse vector — is far
 * easier to catch than in consumer programs. We join multiple weak signals into
 * a score; score >= REFERRAL_HOLD_FRAUD_SCORE routes the reward to a HELD admin
 * review queue instead of auto-granting (honoring "instant grant + fraud guard").
 */

import { prisma } from "@/lib/prisma";
import {
  REFERRAL_HOLD_FRAUD_SCORE,
  REFERRAL_MAX_REWARDED_PER_MONTH,
  REFERRAL_VELOCITY_MAX,
  REFERRAL_VELOCITY_WINDOW_HOURS,
  kstMonthStart,
} from "./constants";

export interface FraudSignal {
  code: string;
  detail: string;
  weight: number;
}

export interface FraudInput {
  referrerAcademyId: string;
  referredAcademyId: string;
  referredDirectorPhone?: string | null;
  referredDirectorEmail?: string | null;
  signupIp?: string | null;
}

export interface FraudResult {
  score: number;
  signals: FraudSignal[];
  shouldHold: boolean;
}

function digits(v?: string | null): string {
  return (v ?? "").replace(/\D/g, "");
}

/**
 * Evaluate fraud signals for a referral conversion. Read-only; the decision to
 * grant vs hold is made by the caller using `shouldHold`.
 */
export async function evaluateReferralFraud(input: FraudInput): Promise<FraudResult> {
  const signals: FraudSignal[] = [];

  // Hard self-referral: same academy on both sides (defensive; new academy is fresh).
  if (input.referrerAcademyId === input.referredAcademyId) {
    signals.push({
      code: "SELF_SAME_ACADEMY",
      detail: "추천인과 신규 학원이 동일",
      weight: 100,
    });
  }

  const [referrerDirector, monthStart] = [
    await prisma.staff.findFirst({
      where: { academyId: input.referrerAcademyId, role: "DIRECTOR" },
      orderBy: { createdAt: "asc" },
      select: { phone: true, email: true },
    }),
    kstMonthStart(),
  ];

  // Same director phone → near-certain self-referral.
  const refPhone = digits(referrerDirector?.phone);
  const newPhone = digits(input.referredDirectorPhone);
  if (refPhone && newPhone && refPhone === newPhone) {
    signals.push({
      code: "SAME_DIRECTOR_PHONE",
      detail: "원장 전화번호가 추천인과 동일 (자가추천 의심)",
      weight: 100,
    });
  }

  // Same director email local-part (catches +alias / case variants on same inbox).
  const refEmail = (referrerDirector?.email ?? "").trim().toLowerCase();
  const newEmail = (input.referredDirectorEmail ?? "").trim().toLowerCase();
  if (refEmail && newEmail) {
    const normalize = (e: string) => {
      const [local, domain] = e.split("@");
      if (!domain) return e;
      const base = local.split("+")[0].replace(/\./g, "");
      return `${base}@${domain}`;
    };
    if (normalize(refEmail) === normalize(newEmail)) {
      signals.push({
        code: "SAME_DIRECTOR_EMAIL",
        detail: "원장 이메일이 추천인과 동일 (별칭/대소문자 무시)",
        weight: 100,
      });
    }
  }

  // Velocity: many referrals from this referrer recently.
  const since = new Date(Date.now() - REFERRAL_VELOCITY_WINDOW_HOURS * 3600 * 1000);
  const recentCount = await prisma.referral.count({
    where: { referrerAcademyId: input.referrerAcademyId, createdAt: { gte: since } },
  });
  if (recentCount >= REFERRAL_VELOCITY_MAX) {
    signals.push({
      code: "VELOCITY",
      detail: `최근 ${REFERRAL_VELOCITY_WINDOW_HOURS}시간 내 추천 ${recentCount}건`,
      weight: 40,
    });
  }

  // Repeat signup from same IP for this referrer.
  if (input.signupIp) {
    const sameIp = await prisma.referral.count({
      where: { referrerAcademyId: input.referrerAcademyId, signupIp: input.signupIp },
    });
    if (sameIp > 0) {
      // Distinct legitimate academies rarely share a public egress IP at signup,
      // so one repeat is enough to route to HELD review on its own (weight >= hold
      // threshold). Raw IP is NOT echoed into the detail string (PIPA / data-min);
      // it is persisted in the structured Referral.signupIp column for the query.
      signals.push({
        code: "SAME_IP_REPEAT",
        detail: `동일 IP에서 반복 가입 (${sameIp}건)`,
        weight: 60,
      });
    }
  }

  // Monthly cap: too many rewarded referrals this month → hold the overflow.
  const monthlyRewarded = await prisma.referral.count({
    where: {
      referrerAcademyId: input.referrerAcademyId,
      status: { in: ["GRANTED", "APPROVED"] },
      createdAt: { gte: monthStart },
    },
  });
  if (monthlyRewarded >= REFERRAL_MAX_REWARDED_PER_MONTH) {
    signals.push({
      code: "MONTHLY_CAP",
      detail: `이번 달 보상 추천 ${monthlyRewarded}건 (상한 ${REFERRAL_MAX_REWARDED_PER_MONTH})`,
      weight: 60,
    });
  }

  const score = Math.min(100, signals.reduce((sum, s) => sum + s.weight, 0));
  return { score, signals, shouldHold: score >= REFERRAL_HOLD_FRAUD_SCORE };
}
