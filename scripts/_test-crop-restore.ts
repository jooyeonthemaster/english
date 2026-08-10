/* eslint-disable no-console */
// ============================================================================
// 크롭-네이티브 원문 복원 실검증 하네스 (개발용 — 배포와 무관)
//
//   npx tsx scripts/_test-crop-restore.ts <image...> [--model google/gemini-3.5-flash-lite]
//
// 프로덕션 "AI로 원문 복원" 극속 경로(restoreCropImage — 이미지 1장 → 멀티모달
// 1콜 → OCR+문제풀이+복원+변경점)를 실제 이미지로 그대로 때려서, 어떤 모델이
// 안 터지고 제대로 푸는지 눈으로 확인한다. --model 은 env
// OPENROUTER_RESTORATION_MODEL 오버라이드로 주입한다(모듈 로드 전에 세팅).
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve, basename } from "node:path";

// .env 수동 로드 (Next 외부 실행이므로 직접 파싱 — test-restoration-lite.ts 와 동일)
for (const file of [".env", ".env.local"]) {
  try {
    const envFile = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const line of envFile.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, key, rawValue] = m;
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  } catch {
    /* 파일 없으면 무시 */
  }
}

async function main() {
  const args = process.argv.slice(2);
  const modelIdx = args.indexOf("--model");
  let modelOverride: string | undefined;
  if (modelIdx >= 0) {
    modelOverride = args[modelIdx + 1];
    args.splice(modelIdx, 2);
  }
  if (args.length === 0) {
    console.error("usage: npx tsx scripts/_test-crop-restore.ts <image...> [--model <id>]");
    process.exit(1);
  }
  if (modelOverride) {
    process.env.OPENROUTER_RESTORATION_MODEL = modelOverride;
  }

  // env 세팅 후에 로드해야 model-config 가 오버라이드를 읽는다.
  const { restoreCropImage } = await import(
    "../src/trigger/_lib/m1-passage-restoration/crop-native"
  );
  const { getExtractionAiModelName } = await import(
    "../src/lib/extraction/model-config"
  );
  console.log("모델:", getExtractionAiModelName("passage-restoration"));

  for (const imgPath of args) {
    const bytes = readFileSync(resolve(process.cwd(), imgPath));
    const started = Date.now();
    console.log(`\n━━━ ${basename(imgPath)} (${(bytes.length / 1024).toFixed(0)}KB) ━━━`);
    try {
      const r = await restoreCropImage({
        base64: bytes.toString("base64"),
        mimeType: "image/jpeg",
      });
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`✅ ${secs}s | type=${r.problemType} | changes=${r.changes.length} | in=${r.usage?.inputTokens} out=${r.usage?.outputTokens} cost=$${r.usage?.costUsd ?? "?"}`);
      for (const c of r.changes) {
        console.log(`  [${c.type}] ${c.marker}: "${c.before.slice(0, 60)}" → "${c.after.slice(0, 60)}"`);
        console.log(`      이유: ${c.reason.slice(0, 120)}`);
      }
      console.log("--- rawText (앞 300자) ---");
      console.log(r.rawText.slice(0, 300));
      console.log("--- restoredText ---");
      console.log(r.restoredText);
    } catch (err) {
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      const e = err as Error & { status?: number; code?: string };
      console.log(`💥 ${secs}s | ${e.name}: ${e.message}`);
      if (e.status !== undefined) console.log(`   status=${e.status} code=${e.code}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
