// 재캡처: "포인트 짚어주기" 수리 검증 (r04/r06/r08/r09)
// 실행: node experiments/point-picker-verify/recapture.mjs (repo 루트에서)
// 주의: 문제 "생성" CTA(모달 푸터 생성 버튼, 일괄 생성 바)는 절대 클릭하지 않는다.
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:3211";
const EXE = "C:/Users/jooye/AppData/Local/ms-playwright/chromium-1169/chrome-win/chrome.exe";

const shots = [];
const findings = [];
const blockers = [];
const consoleErrors = [];
const domChecks = {};

const log = (...a) => console.log("[cap]", ...a);

async function shot(page, file, state) {
  const p = path.join(DIR, file);
  await page.screenshot({ path: p, fullPage: false });
  shots.push({ file: p.replace(/\\/g, "/"), state });
  log("shot:", file, "-", state);
}

async function dismissOverlays(page) {
  for (let i = 0; i < 4; i++) {
    const welcome = page.locator('[aria-labelledby="jooyeon-welcome-title"]');
    if ((await welcome.count()) > 0) {
      const startBtn = welcome.locator("button").filter({ hasText: "바로 시작하기" });
      if ((await startBtn.count()) > 0) await startBtn.first().click();
      else await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
      continue;
    }
    const banner = page.locator('[aria-labelledby^="site-banner"]');
    if ((await banner.count()) > 0) {
      const dontToday = banner.locator("button, a").filter({ hasText: "오늘 하루 보지 않기" });
      if ((await dontToday.count()) > 0) await dontToday.first().click();
      else await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
      continue;
    }
    break;
  }
}

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: EXE });
  const context = await browser.newContext({
    viewport: { width: 1680, height: 1000 },
    deviceScaleFactor: 1,
    locale: "ko-KR",
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("smoat.workbench.questions.generate.tutorial.hidden.v1", "1");
      sessionStorage.removeItem("yshin-jooyeon-welcome-pending");
    } catch {}
  });
  await context.route("**/api/site-banners*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ banners: [] }),
    }),
  );
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 500));
  });
  page.on("pageerror", (err) => consoleErrors.push("pageerror: " + String(err).slice(0, 500)));

  try {
    // ── 0. 로그인 ──────────────────────────────────────────────────────────
    await page.goto(
      BASE + "/login?callbackUrl=" + encodeURIComponent("/director/workbench/questions/generate"),
      { waitUntil: "domcontentloaded", timeout: 60000 },
    );
    await page.fill("#email", "jooyeon");
    await page.fill("#password", "jooyeon");
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45000 }),
      page.click('button[type="submit"]'),
    ]);
    log("logged in →", page.url());

    // ── 1. generate 페이지 ──────────────────────────────────────────────────
    await page.goto(BASE + "/director/workbench/questions/generate", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    await dismissOverlays(page);

    const PASSAGE_CARD = "[data-drag-item-id]:not([data-question-card-id])";
    let rowBtn = page.locator('[data-generate-tour="row-generate-button"]');
    if ((await rowBtn.count()) === 0) {
      if ((await page.locator(PASSAGE_CARD).count()) === 0) {
        const libTab = page
          .locator("button, a")
          .filter({ hasText: /내 지문함/ })
          .locator("visible=true")
          .first();
        if ((await libTab.count()) > 0) {
          await libTab.click();
          await page.waitForTimeout(1200);
        }
      }
      await page.waitForSelector(PASSAGE_CARD, { timeout: 20000 });
      await page.waitForTimeout(800);
      await dismissOverlays(page);
      // 검수필요 draft 카드는 승격(DB 쓰기)되므로 일반 카드만 사용.
      const normalCard = page.locator(PASSAGE_CARD).filter({ hasNotText: "검수필요" }).first();
      if ((await normalCard.count()) === 0) {
        blockers.push("일반(비 draft) 지문 카드 없음 — 중단");
        throw new Error("only draft cards");
      }
      await normalCard.click();
      await page.waitForTimeout(600);
      const goWs = page
        .locator("button")
        .filter({ hasText: /다음으로 \(워크스페이스\)|추가하기/ })
        .first();
      if ((await goWs.count()) === 0) {
        blockers.push("'다음으로 (워크스페이스)' 버튼 미발견");
        throw new Error("no workspace button");
      }
      await goWs.click();
      await page.waitForSelector('[data-generate-tour="row-generate-button"]', { timeout: 15000 });
    }
    rowBtn = page.locator('[data-generate-tour="row-generate-button"]').first();
    await rowBtn.click(); // 모달만 연다(생성 아님)
    await page.waitForSelector('[role="dialog"][aria-label*="문제 생성 설정"]', { timeout: 10000 });
    await page.waitForTimeout(600);
    await dismissOverlays(page);

    // ── 2. 어법 판단 세부설정 팝오버 → 진입 행 클릭 ─────────────────────────
    const dialog = page.locator('[role="dialog"][aria-label*="문제 생성 설정"]');
    const grammarTile = dialog.locator('[data-question-type-id="GRAMMAR_ERROR"]');
    if ((await grammarTile.count()) === 0) {
      blockers.push("어법 판단 타일 없음");
      throw new Error("no grammar tile");
    }
    await grammarTile.scrollIntoViewIfNeeded();
    const chevron = grammarTile.locator('button[title*="어법 판단 세부 옵션"]').last();
    await chevron.click();
    const detailPopover = page
      .locator("[data-radix-popper-content-wrapper]")
      .filter({ hasText: "어법 판단 세부 설정" });
    const entryBtn = detailPopover
      .locator("button")
      .filter({ hasText: /^(지정하기|수정하기)$/ })
      .first();
    await detailPopover.locator("text=포인트 짚어주기").first().waitFor({ timeout: 8000 });
    await entryBtn.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);

    // ── 3. r04: 픽커 열림 — 우측 콘솔 팝오버 닫힘 + 유형 리스트 1컬럼 ────────
    await entryBtn.click();
    await page.waitForSelector('section[aria-label="포인트 짚어주기"]', { timeout: 8000 });
    await page.waitForSelector(".ppk-tok", { timeout: 8000 });
    await page.waitForTimeout(900); // 2컬럼 성장 트랜지션 안정화

    domChecks.r04 = await page.evaluate(() => {
      const popovers = Array.from(
        document.querySelectorAll("[data-radix-popper-content-wrapper]"),
      ).filter((el) => (el.textContent || "").includes("어법 판단 세부 설정"));
      const grids = Array.from(document.querySelectorAll("[data-type-tile-grid]")).filter(
        (el) => el.offsetParent !== null,
      );
      return {
        detailPopoverOpen: popovers.length,
        visibleGrids: grids.length,
        gridColumns: grids.map(
          (g) => getComputedStyle(g).gridTemplateColumns.split(" ").length,
        ),
      };
    });
    log("r04 dom:", JSON.stringify(domChecks.r04));
    await shot(page, "r04-picker-open.png", "픽커 열림 — 콘솔 팝오버/1컬럼 판독용");

    // ── 4. r06: 두 번째 문장에서 3토큰 드래그 → 연속 pill ───────────────────
    const sent2Toks = page.locator(".ppk-sent").nth(1).locator(".ppk-tok");
    let toks = sent2Toks;
    if ((await sent2Toks.count()) < 3) {
      findings.push("두 번째 문장 토큰 3개 미만 — 첫 문장으로 대체");
      toks = page.locator(".ppk-sent").nth(0).locator(".ppk-tok");
    }
    const a = toks.nth(0);
    const b = toks.nth(2);
    const ab = await a.boundingBox();
    const bb = await b.boundingBox();
    if (!ab || !bb) {
      blockers.push("드래그 대상 토큰 bounding box 획득 실패");
      throw new Error("no bbox");
    }
    await page.mouse.move(ab.x + ab.width / 2, ab.y + ab.height / 2);
    await page.mouse.down();
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 10 });
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(600);

    domChecks.r06 = await page.evaluate(() => {
      const sels = Array.from(document.querySelectorAll(".ppk-sel"));
      const byKey = {};
      for (const el of sels) {
        const k = el.getAttribute("data-pt") || "?";
        (byKey[k] ??= []).push(el);
      }
      const out = {};
      for (const [k, els] of Object.entries(byKey)) {
        const rects = els.map((e) => e.getBoundingClientRect());
        rects.sort((r1, r2) => r1.left - r2.left);
        let maxGap = 0;
        for (let i = 1; i < rects.length; i++) {
          maxGap = Math.max(maxGap, rects[i].left - rects[i - 1].right);
        }
        out[k] = {
          segments: els.length,
          tokens: els.filter((e) => e.classList.contains("ppk-tok")).length,
          gaps: els.filter((e) => e.classList.contains("ppk-gap")).length,
          maxPixelGapBetweenSegments: Math.round(maxGap * 10) / 10,
          sameLine: new Set(rects.map((r) => Math.round(r.top))).size === 1,
          text: els.map((e) => e.textContent?.trim()).join(" ").slice(0, 80),
        };
      }
      return { chipCount: document.querySelectorAll("[data-chip]").length, points: out };
    });
    log("r06 dom:", JSON.stringify(domChecks.r06));
    await shot(page, "r06-phrase.png", "3토큰 드래그 — pill 연속성 판독용");

    // ── 5. r08: '선택 완료' → 문항 수 자동 1 + 타일 '포인트 N' 배지 ─────────
    const doneBtn = page
      .locator('section[aria-label="포인트 짚어주기"] button')
      .filter({ hasText: "선택 완료" })
      .first();
    await doneBtn.click();
    await page
      .waitForSelector('section[aria-label="포인트 짚어주기"]', { state: "detached", timeout: 8000 })
      .catch(() => findings.push("'선택 완료' 후 픽커가 8초 내 닫히지 않음"));
    await page.waitForTimeout(1000); // 카운트 커밋(120ms)+콘솔 복귀 트랜지션 안정화
    await grammarTile.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);

    domChecks.r08 = await page.evaluate(() => {
      const tile = document.querySelector('[data-question-type-id="GRAMMAR_ERROR"]');
      if (!tile) return { tile: false };
      const stepper = Array.from(tile.querySelectorAll("span")).find((s) =>
        s.className.includes("border-x"),
      );
      const badge = Array.from(tile.querySelectorAll("button")).find((b) =>
        /포인트 \d+/.test(b.textContent || ""),
      );
      return {
        tile: true,
        stepperCount: stepper?.textContent?.trim() ?? null,
        pointBadgeText: badge?.textContent?.trim() ?? null,
      };
    });
    log("r08 dom:", JSON.stringify(domChecks.r08));
    await shot(page, "r08-after-done.png", "'선택 완료' 후 — 문항 수/배지 판독용");

    // ── 6. r09: 푸터 '포인트 N개 반영' 칩 클릭 → 픽커 재진입 ────────────────
    // 주의: 푸터의 생성 CTA 가 아니라 칩(텍스트 '…개 반영')만 클릭한다.
    const footerChip = page
      .locator('[role="dialog"][aria-label*="문제 생성 설정"] button[title="포인트 짚어주기 다시 열기"]')
      .filter({ hasText: /개 반영/ })
      .first();
    if ((await footerChip.count()) === 0) {
      findings.push("푸터 '포인트 N개 반영' 칩이 렌더되지 않음");
      await shot(page, "r09-reenter.png", "푸터 칩 미발견 상태(결함 조사용)");
    } else {
      const chipText = (await footerChip.textContent())?.trim();
      log("footer chip:", chipText);
      await footerChip.click();
      const reentered = await page
        .waitForSelector('section[aria-label="포인트 짚어주기"]', { timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      if (!reentered) findings.push("푸터 칩 클릭 후 픽커가 재진입되지 않음");
      await page.waitForSelector(".ppk-tok", { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(900);
      domChecks.r09 = {
        footerChipText: chipText,
        reentered,
        selCount: await page.locator(".ppk-sel").count(),
        chipCount: await page.locator("[data-chip]").count(),
      };
      log("r09 dom:", JSON.stringify(domChecks.r09));
      await shot(page, "r09-reenter.png", "푸터 칩 클릭 후 — 픽커 재진입 판독용");
    }
  } catch (e) {
    log("aborted:", e.message);
    try {
      await shot(page, "r99-abort.png", "중단 시점 상태");
    } catch {}
  } finally {
    await browser.close();
  }

  const result = { shots, findings, blockers, consoleErrors, domChecks };
  fs.writeFileSync(path.join(DIR, "recapture-result.json"), JSON.stringify(result, null, 2));
  console.log("RESULT_JSON_START");
  console.log(JSON.stringify(result, null, 2));
  console.log("RESULT_JSON_END");
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
