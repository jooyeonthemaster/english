/**
 * ir-deck/ (원본) → public/ir/ (서빙 사본) 동기화.
 *
 * - 덱 파일 6개만 복사 — _qa/ 스크린샷, _pdf/ 캡처, README, PDF는 절대 복사하지 않음
 *   (public/ 에 들어가면 그대로 공개 서빙되므로).
 * - index.html 의 상대 에셋 경로를 /ir/ 절대 경로로 치환
 *   (`/ir` 처럼 트레일링 슬래시 없는 URL에서도 에셋이 깨지지 않도록).
 *
 * 사용: node scripts/sync-ir-deck.mjs
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "ir-deck");
const out = join(root, "public", "ir");

mkdirSync(out, { recursive: true });

const PLAIN = ["deck.css", "slides.css", "deck.js", "demo-data.js", "demo.js"];
for (const f of PLAIN) copyFileSync(join(src, f), join(out, f));

let html = readFileSync(join(src, "index.html"), "utf8");
html = html
  .replace(/href="deck\.css"/, 'href="/ir/deck.css"')
  .replace(/href="slides\.css"/, 'href="/ir/slides.css"')
  .replace(/src="deck\.js"/, 'src="/ir/deck.js"')
  .replace(/src="demo-data\.js"/, 'src="/ir/demo-data.js"')
  .replace(/src="demo\.js"/, 'src="/ir/demo.js"');
writeFileSync(join(out, "index.html"), html);

console.log("synced ir-deck/ -> public/ir/ (6 files)");
