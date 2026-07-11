// 랜딩 "실제 결과물 샘플" PDF(모의고사·학습지)에 SMOAT 로고 워터마크를
// 매 페이지 중앙에 반투명으로 스탬프한다. 브라우저 미리보기·PDF 다운로드가
// 같은 파일을 쓰므로 파일 자체를 워터마크하면 양쪽 모두 반영된다.
//
// 원본은 scripts/_sample-originals/ 에 1회 백업하고, 이후엔 항상 백업을
// 소스로 삼아 재실행해도 워터마크가 중첩되지 않게 한다.
//
// 실행: node scripts/watermark-samples.mjs
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SAMPLES_DIR = join(ROOT, "public/landing/samples");
const BACKUP_DIR = join(__dirname, "_sample-originals");
const LOGO_PATH = join(ROOT, "public/smoat-logo.png");

const TARGETS = ["sample-mock-exam.pdf", "sample-analysis-worksheet.pdf"];

// 워터마크 튜닝값.
const OPACITY = 0.11; // 본문 가독성을 해치지 않으면서 SMOAT 브랜드가 식별되는 정도
const ROTATE_DEG = 0; // 수평 배치
const WIDTH_RATIO = 0.55; // 페이지 짧은 변 대비 로고 폭 비율
const LABEL = "SMOAT"; // 로고 아래 워드마크
const LABEL_RATIO = 0.2; // 로고 폭 대비 글자 크기

async function main() {
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });

  for (const name of TARGETS) {
    const served = join(SAMPLES_DIR, name);
    const backup = join(BACKUP_DIR, name);

    // 최초 1회: 원본을 백업. 이후엔 백업을 소스로 사용(중첩 방지·멱등).
    if (!existsSync(backup)) {
      copyFileSync(served, backup);
      console.log(`  ↳ 원본 백업: scripts/_sample-originals/${name}`);
    }

    const srcBytes = readFileSync(backup);
    const pdf = await PDFDocument.load(srcBytes);
    const logo = await pdf.embedPng(readFileSync(LOGO_PATH));
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);

    const pages = pdf.getPages();
    const theta = (ROTATE_DEG * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    // 로컬(회전 전) 벡터를 페이지 좌표로 회전.
    const rot = (vx, vy) => ({ x: vx * cos - vy * sin, y: vx * sin + vy * cos });

    for (const page of pages) {
      const { width, height } = page.getSize();
      const short = Math.min(width, height);
      const w = short * WIDTH_RATIO;
      const h = (logo.height / logo.width) * w;

      const fontSize = w * LABEL_RATIO;
      const tw = font.widthOfTextAtSize(LABEL, fontSize);
      const capH = fontSize * 0.72; // 대문자 시각 높이(대략)
      const gap = h * 0.04;
      const groupH = h + gap + capH;

      // 로고+글자를 하나의 그룹으로 보고 그룹 중심을 페이지 중앙에 맞춘다.
      // (y는 위쪽이 +) 로고는 위, 글자는 아래.
      const cx = width / 2;
      const cy = height / 2;
      const logoCenterLocalY = groupH / 2 - h / 2;
      const textCenterLocalY = -groupH / 2 + capH / 2;

      // 로고 — pdf-lib은 좌하단 앵커 기준 회전이므로 중심을 역산.
      const lc = rot(0, logoCenterLocalY);
      const aImg = rot(w / 2, h / 2);
      page.drawImage(logo, {
        x: cx + lc.x - aImg.x,
        y: cy + lc.y - aImg.y,
        width: w,
        height: h,
        rotate: degrees(ROTATE_DEG),
        opacity: OPACITY,
      });

      // 글자 — drawText는 베이스라인-좌측 앵커. 시각 중심에서 좌/하로 역산.
      const tc = rot(0, textCenterLocalY);
      const aTxt = rot(tw / 2, capH / 2);
      page.drawText(LABEL, {
        x: cx + tc.x - aTxt.x,
        y: cy + tc.y - aTxt.y,
        size: fontSize,
        font,
        rotate: degrees(ROTATE_DEG),
        opacity: OPACITY,
      });
    }

    const outBytes = await pdf.save();
    writeFileSync(served, outBytes);
    console.log(`✓ ${basename(served)} — ${pages.length}쪽 워터마크 완료`);
  }
  console.log("\n완료. 브라우저 미리보기/PDF 다운로드 양쪽에 로고 워터마크가 적용됩니다.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
