import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

// ============================================================================
// 프로모션 링크 활동 기록 — 랜딩 방문(VIEW)과 "혜택 받기" 클릭(CLAIM)을
// credit_promotion_link_events 에 남긴다. 관리자 "프로모션 모니터링" 탭이
// 이 로그를 집계해 전체/학원별/회원별 클릭 현황을 보여준다.
//
// 원칙: 절대 랜딩/클레임 흐름을 막지 않는다(try/catch 로 삼킴). 로그인한
// 원장이면 학원·회원을 식별하고, 익명이면 IP+UA+날짜 해시로 순 방문자만 근사.
// ============================================================================

type PromoEventKind = "VIEW" | "CLAIM";
type PromoEventTarget = "PROMO" | "BUNDLE";

type StaffSnapshot = {
  id: string;
  role: string;
  academyId?: string | null;
  academyName?: string | null;
  name?: string | null;
} | null;

type RecordArgs = {
  kind: PromoEventKind;
  targetType: PromoEventTarget;
  linkRef: string;
  promotionId?: string | null;
  bundleId?: string | null;
  staff?: StaffSnapshot;
  ip?: string | null;
  userAgent?: string | null;
};

/** 익명 방문자 근사 키 — IP+UA+당일 날짜를 해시(원본 IP는 저장하지 않음). */
function anonVisitorKey(ip: string, userAgent: string): string | null {
  const basis = `${ip}|${userAgent}`.trim();
  if (!basis || basis === "|") return null;
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  return (
    "anon:" +
    createHash("sha256").update(`${basis}|${day}`).digest("hex").slice(0, 24)
  );
}

/** 프로모션/번들 링크 활동 1건 기록. 실패해도 조용히 삼킨다. */
export async function recordPromoLinkEvent(args: RecordArgs): Promise<void> {
  try {
    const isDirector = args.staff?.role === "DIRECTOR";
    const staffId = isDirector ? args.staff?.id ?? null : null;
    const academyId = isDirector ? args.staff?.academyId ?? null : null;
    const academyName = isDirector ? args.staff?.academyName ?? null : null;
    const visitorName = isDirector ? args.staff?.name ?? null : null;
    const visitorKey = staffId
      ? `staff:${staffId}`
      : anonVisitorKey(args.ip ?? "", args.userAgent ?? "");

    await prisma.creditPromotionLinkEvent.create({
      data: {
        kind: args.kind,
        targetType: args.targetType,
        linkRef: args.linkRef,
        promotionId: args.promotionId ?? null,
        bundleId: args.bundleId ?? null,
        staffId,
        academyId,
        academyName,
        visitorName,
        visitorKey,
      },
    });
  } catch (err) {
    console.error("[promo-link-events] record failed", err);
  }
}

/** next/headers 또는 Request 에서 IP/UA 를 뽑는 헬퍼(서버 컴포넌트·라우트 공용). */
export function readClientHints(headers: Headers): {
  ip: string;
  userAgent: string;
} {
  const ip =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "";
  const userAgent = headers.get("user-agent") ?? "";
  return { ip, userAgent };
}
