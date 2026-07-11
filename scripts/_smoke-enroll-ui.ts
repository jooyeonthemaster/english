/* eslint-disable no-console */
import { chromium } from "playwright";
const [url, shotDir] = process.argv.slice(2);
async function main() {
  const b = await chromium.launch();
  const errs: string[] = [];
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
  await p.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${shotDir}/enroll-01-landing.png` });
  // 이름 검색
  const nameInput = p.locator("input").first();
  await nameInput.fill("김");
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${shotDir}/enroll-02-search.png` });
  // 첫 결과 선택
  const row = p.locator("button, [role=button]", { hasText: "김연주" }).first();
  let selected = false;
  if (await row.count()) { await row.click(); await p.waitForTimeout(800); selected = true; await p.screenshot({ path: `${shotDir}/enroll-03-selected.png` }); }
  const html = await p.content();
  console.log(JSON.stringify({
    selected,
    leakCorrectAnswer: html.includes("correctAnswer"),
    consoleErrors: errs.slice(0, 5),
  }));
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
