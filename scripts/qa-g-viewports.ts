// ============================================================================
// /g 학생 표면 — 뷰포트 매트릭스 QA 캡처 (dev 전용)
//
// grammar-drill-session JWT 를 직접 민팅해(auth.ts 와 동일 클레임) 로그인 없이
// 주요 화면을 폰/가로폰/태블릿(세로·가로) 뷰포트로 캡처한다.
// 실행: pnpm dev 가 3000 포트에 떠 있는 상태에서
//   npx tsx scripts/qa-g-viewports.ts [출력디렉터리]
// 기본 출력: artifacts/qa-g/
// ============================================================================

import * as fs from "node:fs";
import * as path from "node:path";
import { SignJWT } from "jose";
import { chromium } from "playwright";
import { prisma } from "../src/lib/prisma";

const ROOT = process.cwd();
// .env 로더 (dotenv 없이 — manual-screenshots.ts 방식)
for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const OUT = process.argv[2] ?? path.join(ROOT, "artifacts/qa-g");
const ACADEMY_ID = process.env.QA_ACADEMY_ID ?? "cmp0uus900000l804cfq0wphc";

const VIEWPORTS = [
  { name: "360x640", width: 360, height: 640 },
  { name: "390x844", width: 390, height: 844 },
  { name: "844x390", width: 844, height: 390 }, // 가로폰 — gd-phead/gd-qstrip 컴팩션 확인
  { name: "768x1024", width: 768, height: 1024 }, // iPad 9th 세로
  { name: "820x1180", width: 820, height: 1180 }, // iPad 10th/Air 세로
  { name: "1024x1366", width: 1024, height: 1366 }, // iPad Pro 12.9 세로 — 52rem 단
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1366x1024", width: 1366, height: 1024 }, // iPad Pro 가로 — 58rem 단
  { name: "1280x800", width: 1280, height: 800 },
] as const;

const ROUTES = [
  { name: "home", path: "/g/home" },
  { name: "tasks", path: "/g/tasks" },
  { name: "track", path: "/g/track/grammar" },
  { name: "me", path: "/g/me" },
  { name: "drill", path: "/g/drill?mode=smart" },
] as const;

async function main() {
  const secret =
    process.env.GRAMMAR_DRILL_JWT_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("GRAMMAR_DRILL_JWT_SECRET/NEXTAUTH_SECRET 미설정");

  const academy = await prisma.academy.findUniqueOrThrow({
    where: { id: ACADEMY_ID },
    select: { id: true, name: true },
  });
  const student = await prisma.student.findFirstOrThrow({
    where: { academyId: academy.id, status: "ACTIVE" },
    select: { id: true, name: true, grade: true },
  });
  console.log("student:", student.name);

  const token = await new SignJWT({
    studentId: student.id,
    academyId: academy.id,
    studentName: student.name,
    academyName: academy.name,
    grade: student.grade,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("nara-grammar-drill")
    .setAudience("grammar-drill-student")
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(new TextEncoder().encode(secret));

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: vp.width < 1024,
      hasTouch: true,
    });
    await ctx.addCookies([
      {
        name: "grammar-drill-session",
        value: token,
        domain: new URL(BASE).hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const page = await ctx.newPage();
    for (const r of ROUTES) {
      try {
        await page.goto(`${BASE}${r.path}`, { waitUntil: "networkidle", timeout: 60000 });
        await page.waitForTimeout(900);
        await page.screenshot({ path: path.join(OUT, `${r.name}-${vp.name}.png`) });
        console.log(`shot: ${r.name}-${vp.name}`);
      } catch (e) {
        console.error(`FAIL: ${r.name}-${vp.name}`, (e as Error).message);
      }
    }
    await ctx.close();
  }

  await browser.close();
  await prisma.$disconnect();
  console.log("output:", OUT);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
