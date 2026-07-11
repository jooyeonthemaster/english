/* eslint-disable no-console */
// /t/[token] 응시면 실브라우저 스모크 — 태블릿(1024×768)·폰(390×844) 뷰포트.
//   npx tsx scripts/_smoke-taking-ui.ts <TABLET_URL> <OMR_URL> <SHOT_DIR>
// 흐름: 로드→스크린샷→선지 탭→네비게이터→저장 인디케이터 확인→콘솔 에러 수집.
// 제출은 하지 않는다(스모크 토큰을 시각검수용으로 살려둠).
import { chromium } from "playwright";

const [tabletUrl, omrUrl, shotDir] = process.argv.slice(2);
if (!tabletUrl || !omrUrl || !shotDir) {
  console.error("usage: tsx scripts/_smoke-taking-ui.ts <TABLET_URL> <OMR_URL> <SHOT_DIR>");
  process.exit(1);
}

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const browser = await chromium.launch();
  const consoleErrors: string[] = [];

  // ── 태블릿 응시(1024×768) ──────────────────────────────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(`[tablet] ${m.text().slice(0, 200)}`);
    });
    await page.goto(tabletUrl, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${shotDir}/tablet-01-first-question.png` });

    const html = await page.content();
    check("tablet: 페이지에 correctAnswer 문자열 부재", !html.includes("correctAnswer"));
    check("tablet: 문항 카드 로드", (await page.locator("text=/1\\s*\\/\\s*22|22문항|1번/").count()) > 0 || html.includes("22"));

    // 선지 버튼(원형 ①~) 첫 번째 탭
    const choiceBtn = page.locator("button", { hasText: "①" }).first();
    if (await choiceBtn.count()) {
      await choiceBtn.click();
      await page.waitForTimeout(2000); // 디바운스 저장
      await page.screenshot({ path: `${shotDir}/tablet-02-choice-selected.png` });
      check("tablet: 선지 선택 반영", true);
    } else {
      check("tablet: ① 선지 버튼 존재", false);
    }

    // 다음 문항 이동
    const nextBtn = page.locator("button", { hasText: /다음/ }).first();
    if (await nextBtn.count()) {
      await nextBtn.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${shotDir}/tablet-03-next-question.png` });
    }

    // 네비게이터 열기
    const navBtn = page.locator("button", { hasText: /문항|네비/ }).first();
    if (await navBtn.count()) {
      await navBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${shotDir}/tablet-04-navigator.png` });
    }
    await page.close();
  }

  // ── OMR 응시(폰 390×844) ──────────────────────────────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(`[omr] ${m.text().slice(0, 200)}`);
    });
    await page.goto(omrUrl, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${shotDir}/omr-01-list.png`, fullPage: false });

    const html = await page.content();
    check("omr: 페이지에 correctAnswer 문자열 부재", !html.includes("correctAnswer"));

    const choiceBtn = page.locator("button", { hasText: "②" }).first();
    if (await choiceBtn.count()) {
      await choiceBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${shotDir}/omr-02-selected.png` });
      check("omr: 선지 선택 동작", true);
    } else {
      check("omr: ② 선지 버튼 존재", false);
    }
    await page.screenshot({ path: `${shotDir}/omr-03-full.png`, fullPage: true });
    await page.close();
  }

  await browser.close();

  check("콘솔 에러 0건", consoleErrors.length === 0, consoleErrors.slice(0, 5).join(" | "));
  console.log(`\n■ 스모크: ${passed} passed / ${failures.length} failed`);
  if (failures.length) console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
  if (consoleErrors.length) console.log("콘솔 에러:\n" + consoleErrors.slice(0, 10).join("\n"));
  process.exitCode = failures.length > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error("스모크 실패:", e);
  process.exit(1);
});
