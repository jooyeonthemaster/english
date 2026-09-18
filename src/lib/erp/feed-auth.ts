// ============================================================
//  ERP 피드 인증 — 사람이 아니라 기계가 부른다
// ------------------------------------------------------------
//  이 서비스의 관리자 API 는 전부 쿠키 JWT 다 (src/lib/auth-admin.ts).
//  본사 ERP 는 브라우저가 아니라 서버라 쿠키를 들고 올 수 없으므로,
//  기계용 통로를 따로 둔다. 입금 알림 릴레이(bank-notify)가 이미 쓰는
//  Bearer 토큰 방식과 같은 모양이다.
//
//  ⚠️ 이 토큰은 **관리자 로그인과 같은 무게**다. 새면 결제 내역이 통째로
//     읽힌다. 다음을 지킨다:
//       · 값은 환경변수에만 둔다 (ERP_FEED_TOKEN). 코드에 기본값을 두지 않는다.
//       · 설정돼 있지 않으면 라우트는 열리지 않는다 (503).
//       · 읽기 전용이다. 이 통로로는 아무것도 쓰지 못한다.
//       · 한 글자씩 비교하지 않는다 (timingSafeEqual).
// ============================================================

import { timingSafeEqual } from "crypto";

export type FeedAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** 요청의 Bearer 토큰이 ERP_FEED_TOKEN 과 같은가 */
export function checkFeedAuth(req: Request): FeedAuthResult {
  const expected = (process.env.ERP_FEED_TOKEN ?? "").trim();
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: "ERP_FEED_TOKEN 이 설정되지 않아 피드가 닫혀 있습니다.",
    };
  }
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !safeEqual(token, expected)) {
    return { ok: false, status: 401, error: "피드 토큰이 올바르지 않습니다." };
  }
  return { ok: true };
}
