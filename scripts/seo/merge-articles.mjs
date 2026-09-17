#!/usr/bin/env node
/**
 * 팬아웃 산출물(ArticleEntry JSON 배열)을 articles-content.json 에 병합한다.
 *
 * 멱등(IDEMPOTENT): 같은 slug 가 이미 있으면 **전면 교체**한다.
 * 함대가 중간에 죽어 부분 저장돼도 재실행이 무해하도록 설계했다.
 *
 * 사용:
 *   node scripts/seo/merge-articles.mjs <입력.json> [--dry]
 *   <입력.json> 은 ArticleEntry 배열이거나 {produced:[...]} 형태 둘 다 허용.
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TARGET = resolve(ROOT, "src/lib/seo/articles-content.json");

const inputPath = process.argv[2];
const dry = process.argv.includes("--dry");
if (!inputPath) {
  console.error("사용: node scripts/seo/merge-articles.mjs <입력.json> [--dry]");
  process.exit(2);
}
if (!existsSync(inputPath)) {
  console.error(`입력 파일 없음: ${inputPath}`);
  process.exit(2);
}

const raw = JSON.parse(readFileSync(inputPath, "utf8"));
const incoming = Array.isArray(raw) ? raw : (raw.produced ?? raw.articles ?? []);
if (!Array.isArray(incoming) || !incoming.length) {
  console.error("입력에서 ArticleEntry 배열을 찾지 못했습니다.");
  process.exit(2);
}

const current = JSON.parse(readFileSync(TARGET, "utf8"));

// slug+category 를 키로 색인
const key = (a) => `${a.category}/${a.slug}`;
const index = new Map(current.map((a) => [key(a), a]));

const added = [];
const replaced = [];
const skipped = [];

for (const a of incoming) {
  if (!a || typeof a !== "object" || !a.slug || !a.category) {
    skipped.push(a?.slug ?? "(불명)");
    continue;
  }
  // 팬아웃 에이전트가 날짜를 임의로 넣는 것을 방지 — 감독이 고정한다.
  a.updatedAt = "2026-08-27";
  const k = key(a);
  if (index.has(k)) replaced.push(k);
  else added.push(k);
  index.set(k, a);
}

// 원 순서 유지 + 신규는 뒤에 append
const merged = [];
const seen = new Set();
for (const a of current) {
  const k = key(a);
  merged.push(index.get(k));
  seen.add(k);
}
for (const [k, a] of index) if (!seen.has(k)) merged.push(a);

console.log("=== 병합 결과 ===");
console.log(`  기존      : ${current.length}건`);
console.log(`  입력      : ${incoming.length}건`);
console.log(`  신규 추가 : ${added.length}건  ${added.join(", ") || "-"}`);
console.log(`  전면 교체 : ${replaced.length}건  ${replaced.join(", ") || "-"}`);
if (skipped.length) console.log(`  ⚠️ 건너뜀 : ${skipped.length}건  ${skipped.join(", ")}`);
console.log(`  최종      : ${merged.length}건`);

if (dry) {
  console.log("\n[--dry] 파일을 쓰지 않았습니다.");
  process.exit(0);
}

const backup = `${TARGET}.bak`;
copyFileSync(TARGET, backup);
// 들여쓰기 2칸 — 원본 서식이다. 압축해서 쓰면 파일 전체가 한 줄이 되어
// git diff 가 9,654줄 삭제로 찍히고 리뷰가 불가능해진다(실제로 한 번 그렇게 됐다).
writeFileSync(TARGET, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
console.log(`\n✅ 기록 완료 (백업: ${backup})`);
console.log("   다음: node scripts/seo/validate-articles.mjs");
