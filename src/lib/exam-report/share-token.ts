// ============================================================================
// 학생 시험 리포트 — 공개 링크 공유 토큰
//
// 발급: 24바이트 랜덤 → base64url (32자, 패딩 없음).
// revoke = 토큰 null, 재발급 = 신규 토큰(자동 rotate) — 라우트에서 처리.
// ============================================================================

import { randomBytes } from "node:crypto";

/** 32자 base64url 공유 토큰 발급 */
export function generateShareToken(): string {
  return randomBytes(24).toString("base64url");
}

/** 공개 리포트 경로(/r/[token]) 토큰 검증용 — 서버·클라 공통 */
export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

export function isValidShareToken(token: string): boolean {
  return SHARE_TOKEN_RE.test(token);
}
