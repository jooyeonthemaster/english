/* 슬라이드 27장을 최종 스텝 상태로 캡처 → _pdf/page-XX.jpg */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const OUT = dirname(fileURLToPath(import.meta.url));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
});

await page.goto("http://localhost:4173/#0.0", { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => document.body.classList.add("moved")); // 힌트 숨김
await page.waitForTimeout(1200);

const slides = await page.evaluate(() =>
  Array.from(document.querySelectorAll(".slide")).map((el) => ({
    steps: Math.max(1, parseInt(el.dataset.steps || "1", 10)),
    cls: el.className,
  }))
);

for (let i = 0; i < slides.length; i++) {
  await page.evaluate(
    ([s, k]) => window.deckGo(s, k),
    [i, slides[i].steps - 1]
  );
  // 카운트업·SVG 드로우·스태거가 끝나길 대기 (차트 슬라이드는 더 길게)
  const isChart = slides[i].cls.includes("s05") || slides[i].cls.includes("s16");
  await page.waitForTimeout(isChart ? 3000 : 2400);

  // S09 체험 데모: 문제 생성 실행 + 정답·해설까지 펼친 상태로 캡처
  if (slides[i].cls.includes("s09")) {
    await page.evaluate(() => document.getElementById("demo-go").click());
    await page.waitForTimeout(7500); // 단계 연출 + 발문 타이핑 + 선지 스태거
    await page.evaluate(() => {
      const b = document.querySelector(".q-reveal-btn");
      if (b) b.click();
    });
    await page.waitForTimeout(800);
  }

  const n = String(i + 1).padStart(2, "0");
  await page.screenshot({
    path: join(OUT, `page-${n}.jpg`),
    type: "jpeg",
    quality: 86,
  });
  console.log(`captured ${n}/${slides.length}`);
}

await browser.close();
console.log("done");
