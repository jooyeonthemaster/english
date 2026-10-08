import "server-only";

// 무료 신청 공개 API 의 남용 방지 — 인스턴스 메모리 기준 IP 별 횟수 제한(서버리스라 완벽하진 않다:
// 인스턴스가 여럿이면 각자 센다). 파일 크기는 버킷 fileSizeLimit 이, 칸당 개수는 신청 검증이 막는다.
// IP 는 메모리에서 횟수를 셀 때만 쓰고 어디에도 저장하지 않는다 — 동의문이 받는다고 적은 것은 이메일 하나다(10-08).

const hits = new Map<string, number[]>();
/** 청소 기준 — 쓰는 창 중 가장 긴 것(신청 1시간). 짧은 창 호출이 긴 창 기록을 지우지 않게 */
const LONGEST_WINDOW_MS = 60 * 60 * 1000;

export function ffClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return (xff?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}

/** windowMs 동안 max 회까지. 넘으면 false. */
export function ffRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < Math.max(windowMs, LONGEST_WINDOW_MS))) hits.delete(k);
  }
  return true;
}
