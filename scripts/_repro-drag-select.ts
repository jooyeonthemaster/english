/**
 * 드래그 셀렉(마키) 재현 — npx tsx scripts/_repro-drag-select.ts
 * exams/create 좌측 문제 패널에서 카드 2장 이상을 가로지르는 드래그를 시뮬레이트하고
 * 몇 장이 선택(시험지에 추가)되는지 확인한다.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { encode } from "@auth/core/jwt";
import { chromium } from "playwright";

const ROOT = path.resolve(__dirname, "..");
const BASE = "http://localhost:3000";
const DIRECTOR = { id: "cmp0uus960002l8040qwiuqqo", email: "ldongju33@gmail.com" };

for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const browser = await chromium.launch();
  const cookieName = "authjs.session-token";
  const token = await encode({
    token: { id: DIRECTOR.id, email: DIRECTOR.email, sub: DIRECTOR.id },
    secret: process.env.NEXTAUTH_SECRET!,
    salt: cookieName,
    maxAge: 3600,
  });
  const ctx = await browser.newContext({ viewport: { width: 2000, height: 1200 } });
  await ctx.addCookies([
    { name: cookieName, value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
  const page = await ctx.newPage();
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("Module not found") || text.includes("step5-report")) return;
    if (text.includes("[marquee-debug]")) console.log(text.slice(0, 500));
    else if (msg.type() === "error" || msg.type() === "warning")
      console.log(`[console.${msg.type()}]`, text.slice(0, 400));
  });
  page.on("pageerror", (err) => console.log("[pageerror]", String(err).slice(0, 500)));
  const t0 = Date.now();
  page.on("requestfailed", (req) => {
    if (req.method() === "POST")
      console.log(
        `[abort +${((Date.now() - t0) / 1000).toFixed(1)}s]`,
        req.headers()["next-action"]?.slice(0, 12) ?? "(no action)",
        req.failure()?.errorText,
      );
  });
  page.on("response", (res) => {
    const req = res.request();
    if (req.method() === "POST" && req.headers()["next-action"])
      console.log(
        `[action ${res.status()} +${((Date.now() - t0) / 1000).toFixed(1)}s]`,
        req.headers()["next-action"]?.slice(0, 12),
      );
  });

  await page.goto(BASE + "/director/workbench/exams/create", { waitUntil: "load" });
  await page.waitForTimeout(4000);

  // 배너/튜토리얼 닫기
  for (const t of ["오늘 하루 보지 않기", "다시는 보지 않기"]) {
    const el = page.getByText(t).first();
    if (await el.isVisible().catch(() => false)) {
      await el.click().catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  // 사이트 배너 등 모달이 지연되어 뜰 수 있어, 잠시 기다렸다가 모두 닫는다.
  await page.waitForTimeout(3000);
  for (let i = 0; i < 10; i++) {
    const dialog = page.locator('[role="dialog"]');
    if ((await dialog.count()) === 0) break;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const backdrop = page.locator('button[aria-label="닫기"].absolute.inset-0');
    if (await backdrop.first().isVisible().catch(() => false)) {
      await backdrop.first().click({ position: { x: 30, y: 30 } }).catch(() => {});
    }
    await page.waitForTimeout(700);
  }
  console.log("dialogs remaining:", await page.locator('[role="dialog"]').count());

  // 백드롭이 남아 있으면 그 모달 전체 내용을 덤프
  const modalDump = await page.evaluate(() => {
    const backdrop = document.querySelector(
      'button[aria-label="닫기"].absolute.inset-0',
    );
    if (!backdrop) return null;
    const parent = backdrop.parentElement;
    const st = window.getComputedStyle(backdrop as HTMLElement);
    return {
      backdropStyle: {
        opacity: st.opacity,
        visibility: st.visibility,
        display: st.display,
        zIndex: st.zIndex,
        pointerEvents: st.pointerEvents,
      },
      parentCls: parent?.className?.toString().slice(0, 200),
      parentHtml: parent?.outerHTML.slice(0, 1200),
    };
  });
  console.log("modal dump:", JSON.stringify(modalDump, null, 1));
  await page.screenshot({ path: "scripts/_repro-before-drag.png" });

  await page.waitForSelector("[data-drag-item-id]", { timeout: 15000 });
  const cards = await page.$$("[data-drag-item-id]");
  console.log("visible cards:", cards.length);
  if (cards.length < 2) throw new Error("need 2+ cards");

  const r1 = (await cards[0].boundingBox())!;
  const r2 = (await cards[1].boundingBox())!;
  console.log("card1", r1, "card2", r2);

  const allBoxes = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("[data-drag-item-id]")).map(
      (el) => {
        const r = el.getBoundingClientRect();
        return {
          id: el.getAttribute("data-drag-item-id")?.slice(-6),
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      },
    );
  });
  console.log("all item boxes:", JSON.stringify(allBoxes));

  // 드래그 시작점: 환경변수 MODE 로 선택
  //  gap(기본): 카드1 아래 여백 → 카드2 상단
  //  card: 카드1 본문(제목 텍스트 부근) → 카드2 중심
  const MODE = process.env.MODE || "gap";
  let startX: number, startY: number, endX: number, endY: number;
  if (MODE === "card") {
    startX = r1.x + r1.width * 0.5;
    startY = r1.y + 90; // 제목 텍스트 영역
    endX = r2.x + r2.width * 0.6;
    endY = r2.y + r2.height * 0.6;
  } else if (MODE === "passage") {
    startX = r1.x + r1.width * 0.5;
    startY = r1.y + r1.height * 0.62; // 지문 미리보기 박스
    endX = r2.x + r2.width * 0.6;
    endY = r2.y + r2.height * 0.6;
  } else if (MODE === "all") {
    // 카드1 상단 여백에서 시작해 화면에 보이는 모든 카드(세트 포함)를 쓸어내리기
    const last = (await cards[cards.length - 1].boundingBox())!;
    startX = r1.x + 5;
    startY = r1.y + 5;
    endX = last.x + last.width - 10;
    endY = Math.min(last.y + last.height - 10, 1150);
  } else {
    startX = r1.x + 5;
    startY = r1.y + r1.height + 5;
    endX = r2.x + r2.width - 10;
    endY = r2.y + 10;
  }
  console.log("MODE:", MODE, { startX, startY, endX, endY });

  // 드래그 중 상태 계측: 마키 사각형 존재 여부 + 선택 카드 수
  const probe = () =>
    page.evaluate(() => {
      const marquee = document.querySelector(
        "div.pointer-events-none.border-blue-400",
      );
      let checked = 0;
      document.querySelectorAll("[data-drag-item-id]").forEach((el) => {
        if (
          el.querySelector(
            '[role="checkbox"][aria-checked="true"], input[type="checkbox"]:checked, [data-state="checked"]',
          )
        )
          checked++;
      });
      return {
        marquee: marquee
          ? (marquee as HTMLElement).getBoundingClientRect().width.toFixed(0)
          : null,
        checked,
      };
    });

  const scopeInfo = await page.evaluate(
    ({ sx, sy }) => {
      const scopes = Array.from(
        document.querySelectorAll("[data-marquee-scope]"),
      ).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          cls: (el as HTMLElement).className.slice(0, 80),
          rect: { x: r.x, y: r.y, w: r.width, h: r.height },
          containsStart: r.left <= sx && sx <= r.right && r.top <= sy && sy <= r.bottom,
        };
      });
      const target = document.elementFromPoint(sx, sy);
      // blocksMarqueeStart 유사 진단: 조상 체인의 draggable/cursor
      const chain: string[] = [];
      let el: Element | null = target;
      while (el && chain.length < 12) {
        const h = el as HTMLElement;
        const cursor = window.getComputedStyle(h).cursor;
        chain.push(
          `${h.tagName.toLowerCase()}${h.getAttribute("draggable") === "true" ? "[draggable]" : ""}[cursor=${cursor}]${h.hasAttribute("data-marquee-scope") ? "[SCOPE]" : ""}${h.hasAttribute("data-drag-item-id") ? "[ITEM]" : ""}`,
        );
        el = el.parentElement;
      }
      const t = target as HTMLElement | null;
      const tr = t?.getBoundingClientRect();
      return {
        scopes,
        targetChain: chain,
        targetDetail: t
          ? {
              tag: t.tagName,
              cls: t.className?.toString().slice(0, 200),
              rect: tr ? { x: tr.x, y: tr.y, w: tr.width, h: tr.height } : null,
              html: t.outerHTML.slice(0, 300),
            }
          : null,
      };
    },
    { sx: startX, sy: startY },
  );
  console.log("scopes:", JSON.stringify(scopeInfo.scopes, null, 1));
  console.log("target chain:", scopeInfo.targetChain.join(" > "));
  console.log("target detail:", JSON.stringify(scopeInfo.targetDetail, null, 1));

  if (process.env.WARM) {
    console.log("waiting for set prefetch to warm up...");
    await page.waitForTimeout(15000);
  }

  // 배너가 늦게 뜰 수 있어 드래그 직전 한 번 더 정리하고, 없어질 때까지 기다린다.
  for (let i = 0; i < 20; i++) {
    if ((await page.locator('[role="dialog"]').count()) === 0) break;
    const closeBtn = page.locator('[role="dialog"] button[aria-label="닫기"]').last();
    await closeBtn.click().catch(() => page.keyboard.press("Escape"));
    await page.waitForTimeout(500);
  }
  console.log(
    "dialogs before drag:",
    await page.locator('[role="dialog"]').count(),
  );

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  const steps = 20;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      startX + ((endX - startX) * i) / steps,
      startY + ((endY - startY) * i) / steps,
    );
    await page.waitForTimeout(40);
    console.log(`step ${i}:`, JSON.stringify(await probe()));
  }
  if (process.env.SHRINK) {
    // 되돌리기: 카드1만 덮는 지점까지 축소 후 릴리즈 → 나머지는 해제되어야 한다.
    for (let i = steps - 1; i >= 1; i--) {
      await page.mouse.move(
        startX + ((endX - startX) * i) / steps,
        startY + ((endY - startY) * i) / steps,
      );
      await page.waitForTimeout(60);
      if (i % 4 === 0)
        console.log(`shrink ${i}:`, JSON.stringify(await probe()));
    }
    await page.mouse.move(startX + 30, startY + 30);
    await page.waitForTimeout(200);
  }
  await page.mouse.up();
  await page.waitForTimeout(1500);
  console.log("after up:", JSON.stringify(await probe()));
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(2500);
    console.log(`after up +${(i + 1) * 2.5}s:`, JSON.stringify(await probe()));
  }
  const toasts = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-sonner-toast]")).map((el) =>
      (el as HTMLElement).innerText.slice(0, 120),
    ),
  );
  console.log("toasts:", JSON.stringify(toasts));
  const selectedIds = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-drag-item-id]"))
      .filter((el) =>
        el.querySelector(
          '[role="checkbox"][aria-checked="true"], input[type="checkbox"]:checked, [data-state="checked"]',
        ),
      )
      .map((el) => el.getAttribute("data-drag-item-id")?.slice(-6)),
  );
  console.log("selected ids:", JSON.stringify(selectedIds));

  // 선택 상태 확인: 카드의 체크 표시(선택 순번 배지) 또는 우측 "N블록·N문항" 텍스트
  const summary = await page
    .locator("text=/\\d+블록/")
    .first()
    .textContent()
    .catch(() => null);
  console.log("paper summary:", summary);

  const selectedCount = await page.evaluate(() => {
    const els = document.querySelectorAll("[data-drag-item-id]");
    let n = 0;
    els.forEach((el) => {
      // 선택된 카드는 파란 테두리/체크 배지 — aria-checked 또는 체크박스 상태로 판별 시도
      const checkbox = el.querySelector('[role="checkbox"][aria-checked="true"], input[type="checkbox"]:checked');
      if (checkbox) n++;
    });
    return n;
  });
  console.log("selected cards (checkbox):", selectedCount);

  await page.screenshot({ path: path.join(ROOT, "scripts", "_repro-drag-select.png"), fullPage: false });
  console.log("screenshot saved");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
