// ============================================================================
// 프로모션 링크(/credits/promo/{token}) 공용 유틸.
//   · 링크를 연 원장의 브라우저에 httpOnly 쿠키로 토큰을 담아두고, 크레딧 상품
//     조회·구매 시 이 토큰으로 "링크 해금" 여부를 판정한다.
//   · 쿠키에는 여러 프로모션 토큰을 함께 담을 수 있다(콤마 구분).
//   · 실제 적용 가능 여부(기간·대상)는 서버가 매번 재검증하므로, 쿠키는 "이 링크를
//     거쳐 왔다"는 표식일 뿐 그 자체로 혜택을 보장하지 않는다.
// ============================================================================

export const PROMO_COOKIE = "smoat_promo";

// 쿠키에 담을 토큰 수 상한(무한정 누적 방지). 가장 최근 것 우선.
const MAX_TOKENS = 10;
// 토큰 형식(발급 시 규칙과 일치). 예상치 못한 값은 버린다.
const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** 쿠키 문자열 → 유효 토큰 배열(중복 제거, 형식 검증). */
export function parsePromoTokens(value: string | null | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  for (const raw of value.split(",")) {
    const t = raw.trim();
    if (t && TOKEN_RE.test(t)) seen.add(t);
  }
  return [...seen].slice(0, MAX_TOKENS);
}

/** 기존 토큰 목록에 새 토큰을 더해 쿠키 값으로 직렬화(최근 것 앞으로). */
export function serializePromoTokens(existing: string[], add: string): string {
  const next = [add, ...existing.filter((t) => t !== add)].slice(0, MAX_TOKENS);
  return next.join(",");
}

export function isValidPromoToken(token: string): boolean {
  return TOKEN_RE.test(token);
}
