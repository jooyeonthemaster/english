import {
  JOOYEON_LOGIN_ID,
  JOOYEON_WELCOME_STORAGE_KEY,
} from "@/lib/jooyeon-special-account";

/**
 * Special demo/feedback accounts that show a one-time welcome modal on first
 * dashboard visit after login. Each entry is keyed by its login id (the value
 * stored in `staff.email`). Add a new entry here to onboard another account —
 * the login pages and the welcome modal both read from this registry.
 */
export interface SpecialWelcomeContent {
  /** Small uppercase eyebrow label. */
  badge: string;
  /** Modal heading. */
  title: string;
  /** Main bold line inside the highlight card. */
  highlight: string;
  /** Supporting line below the highlight. */
  sub: string;
  /** Credit figure shown in the stat card (already formatted). */
  creditsLabel: string;
  /** Pass/plan label shown in the stat card. */
  passLabel: string;
}

export interface SpecialAccount {
  /** Canonical lowercase login id. */
  id: string;
  /** sessionStorage key used to gate the one-time welcome modal. */
  welcomeStorageKey: string;
  welcome: SpecialWelcomeContent;
}

export const SPECIAL_ACCOUNTS: SpecialAccount[] = [
  {
    id: JOOYEON_LOGIN_ID,
    welcomeStorageKey: JOOYEON_WELCOME_STORAGE_KEY,
    welcome: {
      badge: "Special Access",
      title: "다른 학원 원장선생님 환영합니다!",
      highlight: "1억 크래딧과 함께 무제한 사용권을 멋쟁이 주연 제자님께서 보내셨습니다!",
      sub: "마음껏 활용해보세요!",
      creditsLabel: "100,000,000",
      passLabel: "무제한",
    },
  },
  {
    id: "penrose",
    welcomeStorageKey: "yshin-penrose-welcome-pending",
    welcome: {
      badge: "Special Access",
      title: "펜로즈아카데미 박보윤 원장님 환영합니다!",
      highlight: "5,000 크래딧과 함께 베타 사용권을 보내드립니다.",
      sub: "마음껏 활용해보시고, 많은 피드백 부탁드립니다!",
      creditsLabel: "5,000",
      passLabel: "베타",
    },
  },
];

/** Resolve the special-account config for a given login id / email, if any. */
export function getSpecialAccount(identifier?: string | null): SpecialAccount | null {
  const id = (identifier ?? "").trim().toLowerCase();
  if (!id) return null;
  return SPECIAL_ACCOUNTS.find((account) => account.id === id) ?? null;
}
