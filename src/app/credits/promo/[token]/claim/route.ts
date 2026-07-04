import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { getCreditProductByPromoLink } from "@/lib/credit-top-up-products";
import {
  PROMO_COOKIE,
  isValidPromoToken,
  parsePromoTokens,
  serializePromoTokens,
} from "@/lib/promo-link";
import {
  recordPromoLinkEvent,
  readClientHints,
} from "@/lib/promo-link-events";

// ============================================================================
// 프로모션 "혜택 받기" — /credits/promo/{token}/claim
//   랜딩(page.tsx)의 CTA가 여기로 온다. 토큰을 검증하고 쿠키에 담은 뒤:
//     · 로그인 원장  → /director/credits?promo=applied (바로 적용된 화면)
//     · 그 외(비로그인/미가입) → /login?callbackUrl=/director/credits?promo=applied
//        (자격증명·기존 소셜 로그인은 로그인 후 크레딧 페이지로 안착. 신규 소셜
//         가입은 온보딩을 거치지만, 이미 심긴 쿠키로 이후 혜택이 유지된다.)
//   무효/만료 → /director/credits?promo=expired 로 안내.
// ============================================================================

const MAX_COOKIE_AGE = 90 * 24 * 60 * 60; // 90일 상한
const DEFAULT_COOKIE_AGE = 7 * 24 * 60 * 60;
const CREDITS_PATH = "/director/credits";
const CREDITS_PROMO_APPLIED_PATH = `${CREDITS_PATH}?promo=applied`;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const expired = () =>
    NextResponse.redirect(new URL(`${CREDITS_PATH}?promo=expired`, req.url));

  if (!token || !isValidPromoToken(token)) return expired();

  let result: Awaited<ReturnType<typeof getCreditProductByPromoLink>> = null;
  try {
    result = await getCreditProductByPromoLink(token);
  } catch (err) {
    console.error("[credits/promo/claim] lookup failed", err);
  }
  if (!result || !result.valid) return expired();

  const now = Date.now();
  const endMs = result.promotionEndsAt
    ? new Date(result.promotionEndsAt).getTime()
    : now + DEFAULT_COOKIE_AGE * 1000;
  const maxAge = Math.min(
    MAX_COOKIE_AGE,
    Math.max(60, Math.floor((endMs - now) / 1000)),
  );

  const existing = parsePromoTokens(req.cookies.get(PROMO_COOKIE)?.value);
  const value = serializePromoTokens(existing, token);

  const staff = await getStaffSession();

  // "혜택 받기" 클릭(CLAIM) 기록 — 실패해도 클레임 흐름을 막지 않음.
  const { ip, userAgent } = readClientHints(req.headers);
  await recordPromoLinkEvent({
    kind: "CLAIM",
    targetType: "PROMO",
    linkRef: token,
    promotionId: result.promotionId,
    staff,
    ip,
    userAgent,
  });

  const dest =
    staff?.role === "DIRECTOR"
      ? CREDITS_PROMO_APPLIED_PATH
      : `/login?callbackUrl=${encodeURIComponent(CREDITS_PROMO_APPLIED_PATH)}`;

  const res = NextResponse.redirect(new URL(dest, req.url));
  res.cookies.set(PROMO_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  return res;
}
