// ============================================================================
// 실물(인쇄형) 쿠폰 — 서버 전용 코드/토큰/QR 생성 유틸.
// 8자리 사람입력 코드(혼동문자 제외) + QR 토큰(원본 미저장, SHA-256 해시만 저장).
// ============================================================================

import "server-only";
import { createHash, randomBytes } from "node:crypto";
import QRCode from "qrcode";

// I, O, 0, 1 제외 — 손글씨/스캔 혼동 방지 (referral.ts 패턴 차용).
const READABLE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const COUPON_CODE_LENGTH = 8;

/** 혼동문자 제외 8자리 코드 1개 생성(전역 유일성은 @unique + insert 재시도로 보장). */
export function createReadableCode(): string {
  const bytes = randomBytes(COUPON_CODE_LENGTH);
  let code = "";
  for (let i = 0; i < COUPON_CODE_LENGTH; i++) {
    code += READABLE_ALPHABET[bytes[i] % READABLE_ALPHABET.length];
  }
  return code;
}

/**
 * QR 딥링크에 실리는 원본 토큰과 그 SHA-256 해시.
 * 원본 토큰은 DB에 저장하지 않고 QR 이미지에만 담는다. DB에는 tokenHash만 저장,
 * 등록 시 사용자가 제시한 토큰을 해시해 대조한다.
 */
export function createCouponToken(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, tokenHash: hashCouponToken(token) };
}

/** 등록 시 대조용 — 제시된 토큰의 SHA-256 hex. */
export function hashCouponToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** 사람이 입력한 코드 정규화(공백/하이픈 제거, 대문자, 혼동문자 무관). */
export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** 등록 딥링크. QR·수동입력 모두 이 URL로 수렴. */
export function buildClaimUrl(origin: string, token: string): string {
  return `${origin}/coupon/register?t=${encodeURIComponent(token)}`;
}

/** 등록 딥링크를 QR PNG data URL로 렌더(인쇄용, DB 미저장). */
export async function renderCouponQrDataUrl(claimUrl: string): Promise<string> {
  return QRCode.toDataURL(claimUrl, {
    width: 220,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#FFFFFF" },
  });
}
