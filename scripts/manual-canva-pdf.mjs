// 매뉴얼 챕터 SVG 묶음 → Canva 가져오기용 PDF (텍스트 오퍼레이터 보존 → Canva에서 텍스트 편집 가능)
// 사용: node scripts/manual-canva-pdf.mjs <chapterSlug|all> [outDir]
//   예: node scripts/manual-canva-pdf.mjs 06-exam-report ~/Desktop/smoat-manual-canva-pdf-v2
// 원리: SVG를 슬라이드별 id 네임스페이스로 격리해 한 HTML에 인라인
//       → headless Chromium 인쇄(1920×1080 페이지, 여백 0)
// 참조: docs/claude-design-canva-integration.md "매뉴얼 → Canva 이관 트랙"
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANUAL = path.join(ROOT, "public", "manual", "redesign-185");
const require = createRequire(path.join(ROOT, "package.json"));
const { chromium } = require("playwright");

const arg = process.argv[2];
const outDir = process.argv[3] || path.join(process.env.HOME, "Desktop", "smoat-manual-canva-pdf-v2");
if (!arg) throw new Error("chapterSlug (or 'all') required");

const manifest = JSON.parse(fs.readFileSync(path.join(MANUAL, "slides.json"), "utf8"));
const slugs = arg === "all" ? [...new Set(manifest.entries.map((e) => e.fslug))] : [arg];

for (const slug of slugs) {
  await buildChapter(slug);
}

async function buildChapter(slug) {
const files = manifest.entries.filter((e) => e.fslug === slug).map((e) => e.file);
if (!files.length) throw new Error(`no slides for ${slug}`);

// SVG 내부 id를 슬라이드별로 네임스페이스 — 인라인 시 defs 충돌(그라디언트/필터/클립) 방지
function namespaceIds(svg, suffix) {
  const ids = new Set();
  for (const m of svg.matchAll(/\bid="([^"]+)"/g)) ids.add(m[1]);
  let out = svg;
  for (const id of ids) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out
      .replace(new RegExp(`\\bid="${esc}"`, "g"), `id="${id}__${suffix}"`)
      .replace(new RegExp(`url\\(#${esc}\\)`, "g"), `url(#${id}__${suffix})`)
      .replace(new RegExp(`(xlink:href|href)="#${esc}"`, "g"), `$1="#${id}__${suffix}"`);
  }
  return out;
}

const blocks = files.map((file, i) => {
  const svg = fs.readFileSync(path.join(MANUAL, file), "utf8");
  const ns = namespaceIds(svg, `s${String(i + 1).padStart(3, "0")}`);
  return `<div class="slide">${ns}</div>`;
});

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: 1920px 1080px; margin: 0; }
html,body { margin:0; padding:0; }
.slide { width:1920px; height:1080px; overflow:hidden; page-break-after:always; break-after:page; }
.slide svg { display:block; width:1920px; height:1080px; }
</style></head><body>${blocks.join("\n")}</body></html>`;

fs.mkdirSync(outDir, { recursive: true });
const htmlPath = path.join(outDir, `.${slug}.html`);
fs.writeFileSync(htmlPath, html);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
await page.evaluate("document.fonts ? document.fonts.ready.then(() => true) : true");
const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
await browser.close();

const outPdf = path.join(outDir, `${slug}.pdf`);
fs.writeFileSync(outPdf, pdf);
fs.unlinkSync(htmlPath);
console.log(`OK ${slug}: ${files.length} slides -> ${outPdf} (${(pdf.length / 1024 / 1024).toFixed(1)} MB)`);
}
