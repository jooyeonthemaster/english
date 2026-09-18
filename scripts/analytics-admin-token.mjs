/**
 * 로컬 검증용 관리자 JWT(10분) 출력 — 관리자 분석 API curl 검증에 쓴다.
 *   curl -H "cookie: yshin-admin-session=$(node --env-file=.env scripts/analytics-admin-token.mjs)" http://localhost:<port>/api/admin/analytics/overview
 * DB 에 계정을 만들지 않는다(순수 서명). 출력 토큰을 채팅·파일에 남기지 말 것.
 */
import { SignJWT } from "jose";

const secret = process.env.ADMIN_JWT_SECRET || process.env.NEXTAUTH_SECRET;
if (!secret) {
  console.error("ADMIN_JWT_SECRET/NEXTAUTH_SECRET 없음 — node --env-file=.env 로 실행");
  process.exit(1);
}
const token = await new SignJWT({ adminId: "qa-gate", email: "qa@gate.local", name: "QA", role: "SUPER_ADMIN" })
  .setProtectedHeader({ alg: "HS256" })
  .setExpirationTime("10m")
  .sign(new TextEncoder().encode(secret));
process.stdout.write(token);
