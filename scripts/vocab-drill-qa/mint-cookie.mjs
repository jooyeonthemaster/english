// QA 학생 세션 쿠키 발급 — 스모크 하네스 전용.
//
// 학생 로그인(학원코드+학생코드)을 거치지 않고 세션 JWT 를 직접 주조한다.
// 서명 키는 서버와 동일한 GRAMMAR_DRILL_JWT_SECRET(없으면 NEXTAUTH_SECRET)이므로
// 이 스크립트를 돌릴 수 있다는 것은 이미 서버 시크릿을 가졌다는 뜻이다 —
// 권한 상승 경로가 아니다. 산출 토큰은 .cookie 로 떨어지고 git 에 올리지 않는다.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SignJWT } from "jose";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");

const STUDENT = {
  studentId: "cms35q8dg00019q37g2nvlj4l",
  academyId: "cmr4lx5690000l504n0uyck1g",
  studentName: "이동주(테스트)",
  academyName: "QA",
  grade: 2,
};

const env = fs.readFileSync(path.join(REPO, ".env"), "utf8");
const pick = (k) => env.match(new RegExp(`^${k}="?([^"\\n\\r]+)`, "m"))?.[1];
const secret = pick("GRAMMAR_DRILL_JWT_SECRET") ?? pick("NEXTAUTH_SECRET");
if (!secret) {
  console.error("GRAMMAR_DRILL_JWT_SECRET/NEXTAUTH_SECRET 를 .env 에서 못 찾았다");
  process.exit(1);
}

const token = await new SignJWT({ ...STUDENT })
  .setProtectedHeader({ alg: "HS256", typ: "JWT" })
  .setIssuer("nara-grammar-drill")
  .setAudience("grammar-drill-student")
  .setIssuedAt()
  .setExpirationTime("1d")
  .sign(new TextEncoder().encode(secret));

fs.writeFileSync(path.join(HERE, ".cookie"), token);
console.log(`발급 완료 → scripts/vocab-drill-qa/.cookie (${STUDENT.studentName}, 24시간)`);
