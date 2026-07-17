// E2E 검증: "포인트 짚어주기" (Teacher Point Picker)
// 실행: node experiments/point-picker-verify/capture.mjs (repo 루트에서)
// 주의: 문제 "생성" CTA(모달 푸터 버튼, 일괄 생성 바)는 절대 클릭하지 않는다.
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

const log = (...a) => console.log("[cap]", ...a);

async function shot(page, file, state) {
  const p = path.join(DIR, file);
  await page.screenshot({ path: p, fullPage: false });
  shots.push({ file: p.replace(/\\/g, "/"), state });
  log("shot:", file, "-", state);
}

// 간단 셀렉터 덤프 — 원인 추적용
async function dump(page, label) {
  const info = await page.evaluate(() => {
    const q = (s) => document.querySelectorAll(s).length;
    const btns = Array.from(document.querySelectorAll("button"))
      .filter((b) => b.offsetParent !== null)
      .map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 60);
    return {
      url: location.href,
      dialog: q('[role="dialog"]'),
      cards: q("[data-drag-item-id]"),
      typeTiles: q("[data-question-type-id]"),
      pickerSection: q('section[aria-label="포인트 짚어주기"]'),
      ppkTok: q(".ppk-tok"),
      ppkSel: q(".ppk-sel"),
      ppkSug: q(".ppk-sug, .ppk-ssug"),
      chips: q("[data-chip]"),
      rowGenBtn: q('[data-generate-tour="row-generate-button"]'),
      visibleButtons: btns,
    };
  });
  log(`dump(${label}):`, JSON.stringify(info, null, 1));
  return info;
}

// 늦게 마운트되는 오버레이(웰컴 모달 등) 정리 — 검증 대상과 무관한 크롬.
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
  // 온보딩 투어·웰컴 모달 억제 — 오버레이가 클릭을 가로채는 것 방지.
  // 웰컴 모달은 sessionStorage 'yshin-jooyeon-welcome-pending'="true" 일 때 열리므로
  // 매 네비게이션 전에 선제 제거한다(로그인 시 세팅됨).
  await context.addInitScript(() => {
    try {
      localStorage.setItem("smoat.workbench.questions.generate.tutorial.hidden.v1", "1");
      sessionStorage.removeItem("yshin-jooyeon-welcome-pending");
    } catch {}
  });
  // 사이트 공지 배너는 API 응답 후 늦게 마운트되고 forceShow 일 수 있어 UI 로 못 끈다 —
  // 검증 대상(포인트 짚어주기)과 무관하므로 라우트 스텁으로 빈 큐를 돌려준다.
  await context.route("**/api/site-banners*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ banners: [] }),
    }),
  );
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const t = msg.text();
      // Next dev 오버레이/HMR 소음 제외 없이 원문 수집
      consoleErrors.push(t.slice(0, 500));
    }
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

    // ── 1. generate 페이지 + 지문 카드 ──────────────────────────────────────
    // 로그인 리다이렉트는 SPA push 라 웰컴 모달 sessionStorage 키가 살아 있다 —
    // 하드 내비게이션으로 initScript(키 제거)를 다시 태운다.
    await page.goto(BASE + "/director/workbench/questions/generate", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});

    await dismissOverlays(page);

    // 초기 화면은 '지문 추가'(intake) — '내 지문함' 탭으로 전환해 지문 카드를 띄운다.
    // 주의: [data-drag-item-id] 는 하단 문제은행 카드(data-question-card-id 병기)에도
    // 붙으므로, 지문 카드는 :not([data-question-card-id]) 로 구분한다.
    const PASSAGE_CARD = "[data-drag-item-id]:not([data-question-card-id])";
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
    try {
      await page.waitForSelector(PASSAGE_CARD, { timeout: 20000 });
    } catch {
      blockers.push("'내 지문함' 전환 후에도 지문 카드가 20초 내 로드되지 않음");
      await dump(page, "no-cards");
      await shot(page, "01-generate-page.png", "지문 카드 로드 실패 상태");
      throw new Error("no passage cards");
    }
    await page.waitForTimeout(800); // 카드 로딩 애니메이션 안정화
    await dismissOverlays(page); // 늦게 뜨는 오버레이 재확인
    await shot(page, "01-generate-page.png", "generate 페이지 — 내 지문함, 지문 카드 로드됨");

    // ── 2. 지문 선택 → 워크스페이스 → 지문별 생성 모달 ──────────────────────
    // 이미 워크스페이스 행이 있으면 그대로 사용, 없으면 카드 1개 선택 후 이동
    let rowBtn = page.locator('[data-generate-tour="row-generate-button"]');
    if ((await rowBtn.count()) === 0) {
      // 검수필요 draft 카드는 워크스페이스 이동 시 실지문으로 '승격'(DB 쓰기)되므로
      // 반드시 일반 카드만 고른다.
      const normalCard = page
        .locator(PASSAGE_CARD)
        .filter({ hasNotText: "검수필요" })
        .first();
      if ((await normalCard.count()) === 0) {
        blockers.push("검수필요(draft)가 아닌 일반 지문 카드가 없음 — DB 쓰기(draft 승격) 회피를 위해 중단");
        await dump(page, "only-draft-cards");
        throw new Error("only draft cards");
      }
      const firstCard = normalCard;
      await firstCard.click(); // 단일 클릭 = 선택 토글
      await page.waitForTimeout(600);
      const goWs = page
        .locator("button")
        .filter({ hasText: /다음으로 \(워크스페이스\)|추가하기/ })
        .first();
      if ((await goWs.count()) === 0) {
        blockers.push("'다음으로 (워크스페이스)' 버튼을 찾지 못함 — 카드 선택이 안 됐거나 레이아웃 상이");
        await dump(page, "no-ws-btn");
        throw new Error("no workspace button");
      }
      await goWs.click();
      await page.waitForSelector('[data-generate-tour="row-generate-button"]', { timeout: 15000 });
    }
    rowBtn = page.locator('[data-generate-tour="row-generate-button"]').first();
    await rowBtn.click(); // 워크스페이스 행 푸터 — 모달만 연다(생성 아님)
    try {
      await page.waitForSelector('[role="dialog"][aria-label*="문제 생성 설정"]', {
        timeout: 10000,
      });
    } catch {
      blockers.push("지문별 생성 모달([role=dialog] aria-label*='문제 생성 설정')이 열리지 않음");
      await dump(page, "no-modal");
      throw new Error("no modal");
    }
    await page.waitForTimeout(600);
    await shot(page, "02-modal.png", "지문별 문제 생성 모달 열림");

    // ── 3. '어법 판단' 세부설정 펼치기 → 포인트 짚어주기 진입 행 ────────────
    const dialog = page.locator('[role="dialog"][aria-label*="문제 생성 설정"]');
    const grammarTile = dialog.locator('[data-question-type-id="GRAMMAR_ERROR"]');
    if ((await grammarTile.count()) === 0) {
      blockers.push("모달 안에 어법 판단 타일([data-question-type-id=GRAMMAR_ERROR]) 없음 — 그룹 접힘 여부 확인 필요");
      await dump(page, "no-grammar-tile");
      throw new Error("no grammar tile");
    }
    await grammarTile.scrollIntoViewIfNeeded();
    // 타일 우측 chevron 토글(세부 옵션 펼치기)
    const chevron = grammarTile.locator('button[title*="어법 판단 세부 옵션"]').last();
    await chevron.click();
    // 세부설정 팝오버(포탈) 내 '포인트 짚어주기' 진입 행 — 페이지 배경의
    // 다른 '수정하기' 버튼(문제카드 등)과 섞이지 않게 팝오버로 스코프한다.
    const detailPopover = page
      .locator("[data-radix-popper-content-wrapper]")
      .filter({ hasText: "어법 판단 세부 설정" });
    const entryBtn = detailPopover
      .locator("button")
      .filter({ hasText: /^(지정하기|수정하기)$/ })
      .first();
    try {
      await detailPopover.locator("text=포인트 짚어주기").first().waitFor({ timeout: 8000 });
    } catch {
      blockers.push(
        "어법 판단 세부설정을 펼쳤으나 '포인트 짚어주기' 진입 행 미표시 — renderPointPickerEntry 미렌더 의심(onOpenPointPicker 콜백/메타 확인 필요)",
      );
      await dump(page, "no-entry-row");
      await shot(page, "03-entry-row.png", "진입 행 미표시 상태(결함 조사용)");
      throw new Error("no entry row");
    }
    await entryBtn.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
    await shot(page, "03-entry-row.png", "어법 판단 세부설정 — 포인트 짚어주기 진입 행 표시");

    // ── 4. 진입 → 픽커(2컬럼 지문 무대) ────────────────────────────────────
    await entryBtn.click();
    try {
      await page.waitForSelector('section[aria-label="포인트 짚어주기"]', { timeout: 8000 });
    } catch {
      blockers.push("진입 행 클릭 후 픽커(section[aria-label='포인트 짚어주기'])가 열리지 않음");
      await dump(page, "no-picker");
      throw new Error("picker did not open");
    }
    await page.waitForSelector(".ppk-tok", { timeout: 8000 });
    await page.waitForTimeout(700); // 2컬럼 성장 트랜지션(300ms) 안정화
    await shot(page, "04-picker-open.png", "픽커 열림 — 2컬럼(지문 무대 + 설정 콘솔)");

    // ── 5a. 단어 1개 클릭 ───────────────────────────────────────────────────
    const tokens = page.locator(".ppk-tok");
    const tokCount = await tokens.count();
    log("token count:", tokCount);
    const wordTok = tokens.nth(Math.min(6, tokCount - 1));
    const wordText = (await wordTok.textContent())?.trim();
    await wordTok.click();
    await page.waitForTimeout(500);
    const selCount = await page.locator(".ppk-sel").count();
    const chipCount = await page.locator("[data-chip]").count();
    if (selCount === 0 || chipCount === 0) {
      findings.push(
        `단어 클릭('${wordText}') 후 선택 pill(.ppk-sel=${selCount})/칩([data-chip]=${chipCount})이 렌더되지 않음 — 클릭 무반응 결함`,
      );
      await dump(page, "word-click-failed");
    }
    await shot(page, "05-word-selected.png", `단어 1개 클릭('${wordText}') — pill+칩 상태`);

    // ── 5b. 2~3단어 드래그 구 선택 (두 번째 문장에서, 기존 선택과 비겹침) ────
    const sent2Toks = page.locator(".ppk-sent").nth(1).locator(".ppk-tok");
    const sent2Count = await sent2Toks.count();
    if (sent2Count >= 3) {
      const a = sent2Toks.nth(0);
      const b = sent2Toks.nth(2);
      const ab = await a.boundingBox();
      const bb = await b.boundingBox();
      if (ab && bb) {
        const chipsBefore = await page.locator("[data-chip]").count();
        await page.mouse.move(ab.x + ab.width / 2, ab.y + ab.height / 2);
        await page.mouse.down();
        await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 10 });
        await page.waitForTimeout(150);
        await page.mouse.up();
        await page.waitForTimeout(500);
        const chipsAfter = await page.locator("[data-chip]").count();
        const phraseChip = await page
          .locator("[data-chip]")
          .evaluateAll((els) =>
            els.map((e) => e.textContent?.trim().slice(0, 60) ?? ""),
          );
        log("chips:", JSON.stringify(phraseChip));
        if (chipsAfter <= chipsBefore) {
          findings.push(
            `드래그 구 선택 후 칩 수가 늘지 않음(before=${chipsBefore}, after=${chipsAfter}) — 드래그 커밋 실패 의심`,
          );
          await dump(page, "drag-failed");
        }
      }
    } else {
      findings.push("두 번째 문장 토큰이 3개 미만이라 드래그 구 선택 검증을 첫 문장 후반부로 대체 시도");
      const a = tokens.nth(Math.min(10, tokCount - 3));
      const b = tokens.nth(Math.min(12, tokCount - 1));
      const ab = await a.boundingBox();
      const bb = await b.boundingBox();
      if (ab && bb) {
        await page.mouse.move(ab.x + ab.width / 2, ab.y + ab.height / 2);
        await page.mouse.down();
        await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(500);
      }
    }
    await shot(page, "06-phrase-selected.png", "드래그 구 선택 후 상태");

    // ── 6. AI 제안 (무과금 flash-lite — 클릭 허용) ──────────────────────────
    const aiBtn = page
      .locator('section[aria-label="포인트 짚어주기"] button')
      .filter({ hasText: /AI 제안|다시 제안|다시 시도/ })
      .first();
    if ((await aiBtn.count()) === 0) {
      findings.push("픽커 헤더에 'AI 제안'(ScanSearch) 버튼이 없음");
      await dump(page, "no-ai-btn");
    } else {
      await aiBtn.click();
      log("AI 제안 클릭 — 응답 대기(≤25s)");
      const t0 = Date.now();
      let outcome = "timeout";
      while (Date.now() - t0 < 25000) {
        const sugCount = await page.locator(".ppk-sug, .ppk-ssug").count();
        const btnText = (await aiBtn.textContent())?.trim() ?? "";
        const errText = await page
          .locator('section[aria-label="포인트 짚어주기"] header p')
          .filter({ hasText: /불러오지 못했|찾지 못했/ })
          .count();
        if (sugCount > 0) {
          outcome = `done(${sugCount}건 하이라이트)`;
          break;
        }
        if (errText > 0) {
          outcome = "error-or-empty";
          break;
        }
        if (/다시 제안/.test(btnText)) {
          outcome = "done(제안 0건일 수 있음)";
          break;
        }
        await page.waitForTimeout(700);
      }
      log("AI 제안 결과:", outcome);
      if (outcome === "timeout") {
        findings.push("AI 제안 요청 후 25초 내 완료/에러 상태 전환 없음(로딩 지속) — point-suggest 응답 지연/무응답");
        await dump(page, "ai-timeout");
      } else if (outcome === "error-or-empty") {
        const msg = await page
          .locator('section[aria-label="포인트 짚어주기"] header p')
          .allTextContents();
        findings.push("AI 제안 실패/빈 결과 안내 표시: " + msg.join(" | ").slice(0, 200));
      }
      await page.waitForTimeout(800); // 드로우-인 애니메이션
      await shot(page, "07-ai-suggest.png", `AI 제안 결과 — ${outcome}`);
    }

    // ── 7. Esc 사다리: 1회 = 픽커만 닫힘, 모달 유지 ─────────────────────────
    await page.keyboard.press("Escape");
    await page.waitForTimeout(700);
    const pickerAfter = await page.locator('section[aria-label="포인트 짚어주기"]').count();
    const modalAfter = await page
      .locator('[role="dialog"][aria-label*="문제 생성 설정"]')
      .count();
    if (pickerAfter > 0) {
      findings.push("Esc 1회 후에도 픽커가 닫히지 않음 — Esc 사다리 1단 미동작");
    }
    if (modalAfter === 0) {
      findings.push("Esc 1회에 모달까지 닫힘 — Esc 사다리 결함(픽커만 닫혀야 함)");
    }
    log("after Esc: picker=", pickerAfter, "modal=", modalAfter);
    await shot(
      page,
      "08-esc-once.png",
      `Esc 1회 후 — 픽커 ${pickerAfter === 0 ? "닫힘(정상)" : "유지(결함)"}, 모달 ${modalAfter > 0 ? "유지(정상)" : "닫힘(결함)"}`,
    );
    await dump(page, "final");
  } catch (e) {
    log("aborted:", e.message);
    try {
      await shot(page, "99-abort-state.png", "중단 시점 상태");
    } catch {}
  } finally {
    await browser.close();
  }

  const result = { shots, findings, blockers, consoleErrors };
  fs.writeFileSync(path.join(DIR, "result.json"), JSON.stringify(result, null, 2));
  console.log("RESULT_JSON_START");
  console.log(JSON.stringify(result, null, 2));
  console.log("RESULT_JSON_END");
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
