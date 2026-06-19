/**
 * Growth program constants — referral, credit missions, notifications.
 *
 * Pure constants + helpers, no server/client-only deps so this can be imported
 * from both API routes and client components. Reward "credits" are the same
 * per-academy AI credits used for generation; they are ON-PLATFORM ONLY
 * (자기적립 마일리지 → excluded from VAT base, no 기타소득 withholding) and must
 * never be made cash-withdrawable. The program is strictly single-hop give-get
 * (no multi-tier overrides → outside 다단계판매법).
 */

// ─── Referral reward amounts (credits) ──────────────────────────────────────
/** Credits granted to the referrer (existing academy) when a friend signs up. */
export const REFERRAL_REFERRER_REWARD = 50;
/** Welcome credits granted to the newly-referred academy (double-sided). */
export const REFERRAL_REFERRED_REWARD = 30;

// ─── Mission reward amounts (credits) ───────────────────────────────────────
export const KAKAO_SHARE_REWARD = 10;
export const DAILY_CHECKIN_REWARD = 5;
export const ONBOARD_PROFILE_REWARD = 30;
export const ONBOARD_FIRST_GENERATION_REWARD = 50;

// ─── Fraud / abuse guards (referral) ────────────────────────────────────────
/** fraudScore >= this → reward is HELD for admin review instead of auto-granted. */
export const REFERRAL_HOLD_FRAUD_SCORE = 60;
/** Max rewarded referrals per referrer academy per calendar month (KST). */
export const REFERRAL_MAX_REWARDED_PER_MONTH = 20;
/** Velocity window + threshold: more than N referrals in the window is suspicious. */
export const REFERRAL_VELOCITY_WINDOW_HOURS = 24;
export const REFERRAL_VELOCITY_MAX = 5;

// ─── Referral code / link ───────────────────────────────────────────────────
export const REFERRAL_CODE_LENGTH = 6;
/** Unambiguous alphabet — no 0/O/1/I/L to avoid transcription errors. */
export const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** Cookie that carries ?ref=CODE through the social-OAuth round trip to onboarding. */
export const REFERRAL_COOKIE = "smoat_ref";
/** 30-day attribution window. */
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

// ─── Mission keys / cadence / category ──────────────────────────────────────
export const MISSION_KEYS = {
  FRIEND_REFERRAL: "FRIEND_REFERRAL",
  KAKAO_SHARE: "KAKAO_SHARE",
  DAILY_CHECKIN: "DAILY_CHECKIN",
  ONBOARD_PROFILE: "ONBOARD_PROFILE",
  ONBOARD_FIRST_GENERATION: "ONBOARD_FIRST_GENERATION",
} as const;

export type MissionKey = (typeof MISSION_KEYS)[keyof typeof MISSION_KEYS];
export type MissionCadence = "ONCE" | "DAILY" | "EVENT";
export type MissionCategory = "ONBOARDING" | "DAILY" | "REFERRAL" | "EXPLORE";

/** Seed catalog — also the source of truth for the seeding script. */
export interface MissionSeed {
  key: MissionKey;
  title: string;
  description: string;
  category: MissionCategory;
  cadence: MissionCadence;
  rewardCredits: number;
  iconKey: string;
  actionUrl: string | null;
  ctaLabel: string | null;
  sortOrder: number;
  maxRewardPerMonth: number | null;
}

export const DEFAULT_MISSIONS: MissionSeed[] = [
  {
    key: MISSION_KEYS.FRIEND_REFERRAL,
    title: "동료 원장님 추천하기",
    description: "추천 코드를 카카오톡으로 공유하세요. 동료 학원이 가입하면 두 학원 모두 크레딧을 받습니다.",
    category: "REFERRAL",
    cadence: "EVENT",
    rewardCredits: REFERRAL_REFERRER_REWARD,
    iconKey: "user-plus",
    actionUrl: "/director/rewards#referral",
    ctaLabel: "추천하기",
    sortOrder: 10,
    maxRewardPerMonth: null,
  },
  {
    key: MISSION_KEYS.KAKAO_SHARE,
    title: "추천 링크 카카오톡 공유",
    description: "내 추천 링크를 카카오톡에 처음 공유하면 크레딧을 드려요.",
    category: "EXPLORE",
    cadence: "ONCE",
    rewardCredits: KAKAO_SHARE_REWARD,
    iconKey: "share-2",
    actionUrl: "/director/rewards#referral",
    ctaLabel: "공유하기",
    sortOrder: 20,
    maxRewardPerMonth: null,
  },
  {
    key: MISSION_KEYS.DAILY_CHECKIN,
    title: "매일 출석 체크",
    description: "하루 한 번 출석하면 크레딧을 적립해 드려요.",
    category: "DAILY",
    cadence: "DAILY",
    rewardCredits: DAILY_CHECKIN_REWARD,
    iconKey: "calendar-check",
    actionUrl: null,
    ctaLabel: "출석하기",
    sortOrder: 30,
    maxRewardPerMonth: null,
  },
  {
    key: MISSION_KEYS.ONBOARD_PROFILE,
    title: "학원 정보 완성",
    description: "학원 로고를 등록해 프로필을 완성하면 크레딧을 드려요.",
    category: "ONBOARDING",
    cadence: "ONCE",
    rewardCredits: ONBOARD_PROFILE_REWARD,
    iconKey: "building-2",
    actionUrl: "/director/settings",
    ctaLabel: "완성하기",
    sortOrder: 40,
    maxRewardPerMonth: null,
  },
  {
    key: MISSION_KEYS.ONBOARD_FIRST_GENERATION,
    title: "첫 문제 생성",
    description: "AI로 첫 문제를 생성해 보세요. 완료하면 크레딧을 드려요.",
    category: "ONBOARDING",
    cadence: "ONCE",
    rewardCredits: ONBOARD_FIRST_GENERATION_REWARD,
    iconKey: "rocket",
    actionUrl: "/director/workbench/questions/generate",
    ctaLabel: "생성하러 가기",
    sortOrder: 50,
    maxRewardPerMonth: null,
  },
];

// ─── URL / date helpers ─────────────────────────────────────────────────────

/** Canonical site origin (no trailing slash). */
export function getSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://www.smoat.co.kr";
  return raw.replace(/\/+$/, "");
}

/** Full referral landing link for a code. */
export function buildReferralLink(code: string): string {
  return `${getSiteUrl()}/register?ref=${encodeURIComponent(code)}`;
}

/** KST (UTC+9) calendar date key "YYYY-MM-DD" — used as periodKey for DAILY missions. */
export function kstDateKey(date: Date = new Date()): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/** KST month key "YYYY-MM" — used for monthly referral caps. */
export function kstMonthKey(date: Date = new Date()): string {
  return kstDateKey(date).slice(0, 7);
}

/** First instant (UTC) of the current KST month — for "this month" range queries. */
export function kstMonthStart(date: Date = new Date()): Date {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const startKst = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1, 0, 0, 0));
  // convert KST midnight back to UTC instant
  return new Date(startKst.getTime() - 9 * 60 * 60 * 1000);
}
