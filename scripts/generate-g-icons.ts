// ============================================================================
// /g PWA 아이콘 생성 (1회성) — public/smoat-logo.png(500×500) 에서
// public/icons/g/{icon-192,icon-512,maskable-512}.png 를 만든다.
// maskable 은 로고를 80%로 줄여 #F4F6F9 캔버스에 합성(안전 영역 확보).
// 실행: npx tsx scripts/generate-g-icons.ts  → 산출물 커밋
// ============================================================================

import * as fs from "node:fs";
import * as path from "node:path";
import sharp from "sharp";

const SRC = path.join(process.cwd(), "public/smoat-logo.png");
const OUT_DIR = path.join(process.cwd(), "public/icons/g");

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  await sharp(SRC).resize(192, 192).png().toFile(path.join(OUT_DIR, "icon-192.png"));
  await sharp(SRC).resize(512, 512).png().toFile(path.join(OUT_DIR, "icon-512.png"));

  // maskable: 512² 캔버스(#F4F6F9) 중앙에 로고 410px(≈80%) — 마스크 안전 영역
  const logo = await sharp(SRC).resize(410, 410).png().toBuffer();
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 244, g: 246, b: 249, alpha: 1 },
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(path.join(OUT_DIR, "maskable-512.png"));

  console.log("generated:", fs.readdirSync(OUT_DIR).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
