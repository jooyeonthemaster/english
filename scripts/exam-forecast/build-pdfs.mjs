// exam-forecast PDF 사전 생성 — 앱의 인쇄 경로를 Playwright 로 열어 그대로 PDF 로 떠낸다(화면 = 인쇄 = PDF).
//
//   node scripts/exam-forecast/build-pdfs.mjs <base-url> <slug> <out-dir> <job> [<job> …]
//     job:  ref | set:3 | set:3:answers | passage:HP-q20 | q:12-40,55[:answers] | all-sets | workbook:all|hakpyeong|olympus[:answers]
//   예) node scripts/exam-forecast/build-pdfs.mjs http://localhost:3210 hanguang-2026-2mid .tmp-hanguang/pdf ref set:1 set:1:answers
//
// 인증: 스태프 세션 쿠키를 주조해 격리된 브라우저 프로필에만 심는다(.tmp-studio-qa/mint-cookie.mjs — 로컬 QA 전용).
// 문제지는 쪽을 자체 조판(@page 여백 0, 바닥글 포함). 정답·해설지는 다단 흐름이라 Playwright 바닥글로 쪽 번호를 넣는다.
// 산출: <out-dir>/<file>.pdf + manifest.json({ file, pages }).
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [, , base, slug, outDir, ...jobs] = process.argv;
if (!base || !slug || !outDir || jobs.length === 0) {
  console.error("usage: build-pdfs.mjs <base-url> <slug> <out-dir> <job>…");
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });
const cookie = execSync("node D:/Desktop/2026project/nara/.tmp-studio-qa/mint-cookie.mjs").toString().trim();
const host = new URL(base).hostname;

function jobToTarget(job) {
  const [kind, a, b] = job.split(":");
  const pad = (n) => String(n).padStart(2, "0");
  if (kind === "ref") return { file: "reference", query: "ref=1", answers: false };
  if (kind === "set") return { file: `set-${pad(a)}-${b === "answers" ? "answers" : "paper"}`, query: `set=${a}${b === "answers" ? "&answers=1" : ""}`, answers: b === "answers" };
  if (kind === "workbook") return { file: `workbook-${a}${b === "answers" ? "-answers" : ""}`.replace("workbook-all-answers", "workbook-answers"), query: `workbook=${a}${b === "answers" ? "&answers=1" : ""}`, answers: b === "answers" };
  if (kind === "passage") return { file: `passage-${a.toLowerCase()}`, query: `passage=${encodeURIComponent(a)}`, answers: false };
  if (kind === "q") return { file: b && b !== "answers" ? b : `custom${b === "answers" ? "-answers" : ""}`, query: `q=${a}${b === "answers" ? "&answers=1" : ""}`, answers: b === "answers" };
  if (kind === "file") {
    // file:<name>:<raw query> — 임의 쿼리를 정해진 파일명으로
    const raw = job.split(":").slice(2).join(":");
    return { file: a, query: raw, answers: /answers=1/.test(raw) };
  }
  throw new Error(`unknown job ${job}`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 1400 } });
await ctx.addCookies([{ name: "authjs.session-token", value: cookie, domain: host, path: "/" }]);
const manifest = [];
for (const job of jobs.flatMap((j) => (j === "all-sets" ? Array.from({ length: 10 }, (_, i) => [`set:${i + 1}`, `set:${i + 1}:answers`]).flat() : [j]))) {
  const t = jobToTarget(job);
  const page = await ctx.newPage();
  const url = `${base}/director/exam-forecast/${slug}/print?${t.query}&print=0`;
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 240000 });
  if (!res || res.status() !== 200) {
    console.error("FAIL", job, res?.status());
    await page.close();
    continue;
  }
  await page.waitForSelector('[data-fcp-print-ready="1"]', { timeout: 240000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  const out = path.join(outDir, `${t.file}.pdf`);
  if (t.answers) {
    await page.pdf({
      path: out,
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="width:100%;text-align:center;font-family:'Malgun Gothic',sans-serif;font-size:8.5pt;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
    });
  } else {
    await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
  }
  const pages = await page.evaluate(() => Number(document.querySelector("[data-fcp-pages]")?.getAttribute("data-fcp-pages") || 0));
  manifest.push({ job, file: `${t.file}.pdf`, pages });
  console.log("ok", job, "→", out, pages ? `${pages}쪽` : "");
  await page.close();
}
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 1));
await browser.close();
