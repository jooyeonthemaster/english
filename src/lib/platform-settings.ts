// ============================================================================
// Global platform settings (key-value). Server-only — imports prisma.
//
// Currently holds the default signup credit grant, which used to be the
// hardcoded SIGNUP_CREDITS constant. The constant remains the fallback default
// so a missing/blank row behaves exactly as before.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { SIGNUP_CREDITS } from "@/lib/feedback-program";

export const SIGNUP_CREDITS_KEY = "signup_credits";

/** Read a raw setting value; null when unset. */
export async function getPlatformSetting(key: string): Promise<string | null> {
  try {
    const row = await prisma.platformSetting.findUnique({ where: { key } });
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/** Default credits granted to a brand-new self-signup academy (DB-configurable). */
export async function getSignupCredits(): Promise<number> {
  const raw = await getPlatformSetting(SIGNUP_CREDITS_KEY);
  if (raw !== null) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return SIGNUP_CREDITS;
}
