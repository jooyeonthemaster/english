import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import sharp from "sharp";

const require = createRequire(import.meta.url);

const OUT_DIR = "public/landing/generated";
const EXAM_PDF = "/Users/idongju/Downloads/2027_영어_실전모의고사_문제지.pdf";
const WORKSHEET_PDF = "/Users/idongju/Downloads/전단지용 학습지.pdf";
const DESK_BACKGROUND = path.join(OUT_DIR, "output-desk-background.webp");
const FINAL_STACK = path.join(OUT_DIR, "printed-output-stack-real-docs.webp");

const PAGE_W = 840;
const PAGE_H = 1188;
const CANVAS_W = 1600;
const CANVAS_H = 520;

const palette = {
  ink: "#172033",
  muted: "#64748b",
  blue: "#2563eb",
  navy: "#1e3a8a",
  green: "#16a34a",
  amber: "#f59e0b",
  purple: "#7c3aed",
  red: "#dc2626",
};

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function text(x, y, value, size = 20, opts = {}) {
  const {
    weight = 500,
    fill = palette.ink,
    anchor = "start",
    family = "Arial, Apple SD Gothic Neo, Noto Sans KR, sans-serif",
  } = opts;
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${family}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${esc(value)}</text>`;
}

function rect(x, y, w, h, opts = {}) {
  const { fill = "none", stroke = "#e2e8f0", width = 1, rx = 0, opacity = 1 } = opts;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" opacity="${opacity}" />`;
}

function line(x1, y1, x2, y2, stroke = "#e2e8f0", width = 1) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" />`;
}

function pageSvg(body) {
  return `
    <svg width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${PAGE_W}" height="${PAGE_H}" fill="#fffefa"/>
      ${body}
    </svg>
  `;
}

function scoreReportSvg() {
  const bars = [
    ["빈칸 추론", 92, palette.blue],
    ["어법 판단", 84, palette.green],
    ["글의 순서", 61, palette.amber],
    ["문장 삽입", 58, palette.amber],
    ["서술형", 78, palette.purple],
  ];

  return pageSvg(`
    ${text(64, 78, "SMOAT 성적 리포트", 30, { weight: 900, fill: palette.navy })}
    ${text(64, 111, "2027 영어 실전모의고사 · 김스모 학생 · 고2", 15, { weight: 700, fill: palette.muted })}
    ${line(64, 136, 776, 136, palette.navy, 2)}

    ${rect(64, 174, 205, 132, { fill: "#eff6ff", stroke: "#bfdbfe", rx: 16 })}
    ${text(92, 216, "총점", 15, { weight: 800, fill: palette.blue })}
    ${text(92, 272, "87점", 48, { weight: 900, fill: palette.navy })}
    ${rect(292, 174, 205, 132, { fill: "#f0fdf4", stroke: "#bbf7d0", rx: 16 })}
    ${text(320, 216, "반 평균 대비", 15, { weight: 800, fill: palette.green })}
    ${text(320, 272, "+9.5", 48, { weight: 900, fill: "#166534" })}
    ${rect(520, 174, 256, 132, { fill: "#fff7ed", stroke: "#fed7aa", rx: 16 })}
    ${text(548, 216, "보완 우선 유형", 15, { weight: 800, fill: "#c2410c" })}
    ${text(548, 272, "순서·삽입", 33, { weight: 900, fill: "#9a3412" })}

    ${text(64, 365, "유형별 정답률", 20, { weight: 900 })}
    ${bars
      .map(([label, pct, color], index) => {
        const y = 410 + index * 66;
        return [
          text(74, y + 17, label, 16, { weight: 800 }),
          rect(205, y, 470, 22, { fill: "#edf2f7", stroke: "none", rx: 11 }),
          rect(205, y, 4.7 * pct, 22, { fill: color, stroke: "none", rx: 11 }),
          text(704, y + 18, `${pct}%`, 15, { weight: 900, fill: color }),
        ].join("");
      })
      .join("")}

    ${rect(64, 756, 712, 160, { fill: "#f8fafc", stroke: "#e2e8f0", rx: 16 })}
    ${text(92, 800, "AI 학습 코멘트", 18, { weight: 900, fill: palette.navy })}
    ${text(92, 842, "주제 파악과 어휘 문항은 안정적입니다. 글의 순서와 문장 삽입에서", 16, { weight: 700 })}
    ${text(92, 872, "연결어 단서를 놓치는 패턴이 보여, 이번 주는 논리 연결 변형 세트를", 16, { weight: 700 })}
    ${text(92, 902, "우선 추천합니다.", 16, { weight: 700 })}

    ${text(64, 976, "추천 보완 학습", 20, { weight: 900 })}
    ${["순서·삽입 변형 12문항", "오답 문항 해설 재풀이", "동일 지문 서술형 3문항"].map((item, index) => {
      const y = 1028 + index * 36;
      return `<circle cx="86" cy="${y - 6}" r="4" fill="${palette.blue}"/>${text(104, y, item, 16, { weight: 700 })}`;
    }).join("")}
    ${text(64, 1140, "SMOAT 시험 리포트 · 상담/가정 발송용 PDF", 13, { fill: palette.muted, weight: 700 })}
  `);
}

async function loadPdfjs() {
  if (!process.getBuiltinModule) {
    process.getBuiltinModule = (name) => (name === "module" ? { createRequire } : require(name));
  }
  if (!globalThis.DOMMatrix) globalThis.DOMMatrix = DOMMatrix;
  if (!globalThis.ImageData) globalThis.ImageData = ImageData;
  if (!globalThis.Path2D) globalThis.Path2D = Path2D;
  return await import("pdfjs-dist/legacy/build/pdf.mjs");
}

async function renderPdfPage(pdfPath, outPath, scale = 2.3) {
  const { getDocument } = await loadPdfjs();
  const data = new Uint8Array(await fs.readFile(pdfPath));
  const doc = await getDocument({
    data,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  await fs.writeFile(outPath, canvas.toBuffer("image/png"));
  return { pages: doc.numPages, width: canvas.width, height: canvas.height };
}

async function renderScoreReport(outPath) {
  await sharp(Buffer.from(scoreReportSvg())).png().toFile(outPath);
}

async function paperLayer(input, width, rotate, opts = {}) {
  const page = await sharp(input)
    .resize({ width, withoutEnlargement: true })
    .modulate({ brightness: opts.brightness ?? 1.015, saturation: 0.96 })
    .png()
    .toBuffer();
  const meta = await sharp(page).metadata();
  const pad = 34;
  const baseW = meta.width + pad * 2;
  const baseH = meta.height + pad * 2;
  const shadowSvg = `
    <svg width="${baseW}" height="${baseH}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-45%" y="-45%" width="190%" height="190%">
          <feDropShadow dx="${opts.dx ?? 10}" dy="${opts.dy ?? 28}" stdDeviation="${opts.blur ?? 22}" flood-color="#1f2937" flood-opacity="${opts.opacity ?? 0.28}"/>
        </filter>
        <linearGradient id="paperLight" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/>
          <stop offset="0.55" stop-color="#ffffff" stop-opacity="0"/>
          <stop offset="1" stop-color="#cbd5e1" stop-opacity="0.08"/>
        </linearGradient>
      </defs>
      <rect x="${pad}" y="${pad}" width="${meta.width}" height="${meta.height}" fill="#fff" filter="url(#shadow)"/>
      <rect x="${pad}" y="${pad}" width="${meta.width}" height="${meta.height}" fill="url(#paperLight)"/>
    </svg>
  `;
  return sharp(Buffer.from(shadowSvg))
    .composite([{ input: page, left: pad, top: pad, blend: "over" }])
    .rotate(rotate, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function makeComposite(examPng, worksheetPng, reportPng) {
  const background = await sharp(DESK_BACKGROUND)
    .resize(CANVAS_W, CANVAS_H, { fit: "cover" })
    .modulate({ brightness: 0.99, saturation: 0.95 })
    .webp({ quality: 95 })
    .toBuffer();

  const exam = await paperLayer(examPng, 285, -6, { dx: 8, dy: 24, blur: 18, opacity: 0.3 });
  const worksheet = await paperLayer(worksheetPng, 305, 3, { dx: 4, dy: 26, blur: 20, opacity: 0.25 });
  const report = await paperLayer(reportPng, 285, 8, { dx: 6, dy: 24, blur: 18, opacity: 0.27 });

  const grain = Buffer.from(`
    <svg width="${CANVAS_W}" height="${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="3" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
        <feComponentTransfer><feFuncA type="table" tableValues="0 0.045"/></feComponentTransfer>
      </filter>
      <rect width="${CANVAS_W}" height="${CANVAS_H}" filter="url(#grain)" opacity="0.55"/>
      <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="rgba(255,255,255,0.08)"/>
    </svg>
  `);

  await sharp(background)
    .composite([
      { input: exam, left: 170, top: 12 },
      { input: worksheet, left: 620, top: 4 },
      { input: report, left: 1060, top: 16 },
      { input: grain, left: 0, top: 0, blend: "overlay" },
    ])
    .webp({ quality: 88 })
    .toFile(FINAL_STACK);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await Promise.all([fs.access(EXAM_PDF), fs.access(WORKSHEET_PDF), fs.access(DESK_BACKGROUND)]);

  const examPng = path.join(OUT_DIR, "actual-smoat-exam-page1.png");
  const worksheetPng = path.join(OUT_DIR, "actual-smoat-worksheet-page1.png");
  const reportPng = path.join(OUT_DIR, "smoat-score-report-page.png");

  const [examMeta, worksheetMeta] = await Promise.all([
    renderPdfPage(EXAM_PDF, examPng),
    renderPdfPage(WORKSHEET_PDF, worksheetPng),
    renderScoreReport(reportPng),
  ]);
  await makeComposite(examPng, worksheetPng, reportPng);

  await Promise.all([
    sharp(examPng).resize({ width: 720 }).webp({ quality: 86 }).toFile(path.join(OUT_DIR, "actual-smoat-exam-page1.webp")),
    sharp(worksheetPng).resize({ width: 720 }).webp({ quality: 86 }).toFile(path.join(OUT_DIR, "actual-smoat-worksheet-page1.webp")),
    sharp(reportPng).resize({ width: 720 }).webp({ quality: 86 }).toFile(path.join(OUT_DIR, "smoat-score-report-page.webp")),
  ]);
  await Promise.all([examPng, worksheetPng, reportPng].map((file) => fs.rm(file)));

  console.log(`Rendered exam PDF: ${examMeta.width}x${examMeta.height}, ${examMeta.pages} pages`);
  console.log(`Rendered worksheet PDF: ${worksheetMeta.width}x${worksheetMeta.height}, ${worksheetMeta.pages} pages`);
  console.log(`Generated ${FINAL_STACK}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
