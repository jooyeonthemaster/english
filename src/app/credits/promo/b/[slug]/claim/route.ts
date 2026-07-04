import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { getPromoBundleLanding } from "@/lib/credit-promotion-bundles";
import {
  PROMO_COOKIE,
  parsePromoTokens,
  serializePromoTokens,
} from "@/lib/promo-link";
import {
  recordPromoLinkEvent,
  readClientHints,
} from "@/lib/promo-link-events";

// ============================================================================
// 번들 "혜택 받기" — /credits/promo/b/{slug}/claim
//   번들에 담긴 유효(활성+기간 내) 프로모션들의 linkToken 을 모두 프로모션
//   쿠키에 심는다(다중 토큰). 이후 흐름은 단일 claim 라우트와 동일:
//     · 로그인 원장  → /director/credits?promo=applied
//     · 그 외(비로그인/미가입) → /login?callbackUrl=/director/credits?promo=applied
//   번들 없음/비활성/유효 프로모션 0개 → /director/credits?promo=expired.
// ============================================================================

const MAX_COOKIE_AGE = 90 * 24 * 60 * 60; // 90일 상한
const DEFAULT_COOKIE_AGE = 7 * 24 * 60 * 60;
const CREDITS_PATH = "/director/credits";
const CREDITS_PROMO_APPLIED_PATH = `${CREDITS_PATH}?promo=applied`;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const expired = () =>
    NextResponse.redirect(new URL(`${CREDITS_PATH}?promo=expired`, req.url));

  if (!slug) return expired();

  let bundle: Awaited<ReturnType<typeof getPromoBundleLanding>> = null;
  try {
    bundle = await getPromoBundleLanding(slug);
  } catch (err) {
    console.error("[credits/promo/b/claim] lookup failed", err);
  }
  if (!bundle || bundle.items.length === 0) return expired();

  // 쿠키 수명: 가장 늦게 끝나는 구성원 프로모션까지(90일 상한) — 그때까지는
  // 어떤 구성원이든 재검증을 통과할 수 있으므로 토큰을 유지한다.
  const now = Date.now();
  const latestEndMs = bundle.items.reduce(
    (max, item) => Math.max(max, new Date(item.endsAt).getTime()),
    now + DEFAULT_COOKIE_AGE * 1000,
  );
  const maxAge = Math.min(
    MAX_COOKIE_AGE,
    Math.max(60, Math.floor((latestEndMs - now) / 1000)),
  );

  // 기존 토큰 + 번들 구성원 토큰을 하나씩 누적(단일 claim 과 같은 직렬화 규칙).
  let tokens = parsePromoTokens(req.cookies.get(PROMO_COOKIE)?.value);
  for (const item of bundle.items) {
    tokens = parsePromoTokens(serializePromoTokens(tokens, item.token));
  }
  const value = tokens.join(",");

  const staff = await getStaffSession();

  // "혜택 받기" 클릭(CLAIM) 기록 — 실패해도 클레임 흐름을 막지 않음.
  const { ip, userAgent } = readClientHints(req.headers);
  await recordPromoLinkEvent({
    kind: "CLAIM",
    targetType: "BUNDLE",
    linkRef: slug,
    bundleId: bundle.id,
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
