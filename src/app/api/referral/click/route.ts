import { NextRequest, NextResponse } from "next/server";
import { recordReferralClick } from "@/lib/growth/referral";

export const runtime = "nodejs";

const CLICK_DEDUPE_COOKIE = "smoat_clk";
const CLICK_DEDUPE_MAX_AGE = 60 * 60 * 6; // 6h: one count per browser per code

// PUBLIC endpoint (no auth): pinged when a referral link is opened. Best-effort
// click tracking — it must never throw or block the visitor, so it always
// returns { ok: true } regardless of the body or the lib outcome.
//
// Abuse guard: this writes to the DB (totalClicks counter), so to avoid an
// unauthenticated write-amplification loop we (a) normalize+length-cap the code
// and (b) dedupe per browser via a short-lived cookie so repeated POSTs for the
// same code don't re-write. (A true edge rate-limiter is a recommended follow-up.)
export async function POST(request: NextRequest) {
  const res = NextResponse.json({ ok: true });
  try {
    const body = (await request.json().catch(() => null)) as
      | { code?: unknown }
      | null;
    const code =
      typeof body?.code === "string"
        ? body.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32)
        : "";

    if (code && request.cookies.get(CLICK_DEDUPE_COOKIE)?.value !== code) {
      await recordReferralClick(code).catch((error) => {
        console.error("[referral/click] recordReferralClick failed:", error);
      });
      res.cookies.set(CLICK_DEDUPE_COOKIE, code, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: CLICK_DEDUPE_MAX_AGE,
        path: "/",
      });
    }
  } catch (error) {
    // Swallow everything — click tracking is non-critical.
    console.error("[referral/click] Error:", error);
  }

  return res;
}
