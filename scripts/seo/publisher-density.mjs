#!/usr/bin/env node
/**
 * 출판사 고유 정보 밀도 게이트 (교과서 축 전용).
 *
 * 왜 필요한가 — cross-similarity.mjs(Jaccard)는 **문장을 바꿔 쓰면 통과한다.**
 * 그런데 doorway page 의 본질은 문장 유사도가 아니라 "출판사명만 갈아끼우면
 * 그대로 성립하는가"다. 적대 검수 함대가 실제로 쓴 척도가 이것이었고
 * (예: "YBM 토큰을 담은 문장은 161문장 중 11문장 = 6.8%, 기존 기준선 12.0~27.7%"),
 * 내 Jaccard 게이트가 놓치는 사각이라 별도 계기로 세운다.
 *
 * 측정: 산문 문장 중 그 출판사 고유 토큰(출판사명·저자명)을 포함한 문장의 비율.
 * 기준: 기존 교과서 변형문제 8건의 실측 분포를 기준선으로 삼고,
 *       기준선 최솟값 미만이면 FAIL(= 고유 정보가 기존 자산보다도 얇다).
 *
 * 사용: node scripts/seo/publisher-density.mjs [--json]
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ARTICLES = JSON.parse(
  readFileSync(resolve(ROOT, "src/lib/seo/articles-content.json"), "utf8"),
);

/** 슬러그 → 그 출판사에서만 참인 고유 토큰. 일반 명사는 넣지 않는다. */
const TOKENS = {
  "neungyul-english": ["능률", "NE능률"],
  "ybm-english": ["YBM", "박준언", "김은형"],
  "chunjae-english": ["천재", "조수경", "이재영"],
  "visang-english": ["비상"],
  "donga-english": ["동아"],
  "jihak-english": ["지학사"],
  "miraen-english": ["미래엔"],
  "common-english-guide": ["공통영어"],
  // 신규 지문분석 축
  "neungyul-passage-analysis": ["능률", "NE능률"],
  "ybm-passage-analysis": ["YBM", "박준언", "김은형"],
  "chunjae-passage-analysis": ["천재", "조수경", "이재영"],
  "visang-passage-analysis": ["비상"],
  "donga-passage-analysis": ["동아"],
  "jihak-passage-analysis": ["지학사"],
  "miraen-passage-analysis": ["미래엔"],
};

/** 기준선 집단(기존 변형문제 8건) — 이들의 최솟값이 합격선이 된다. */
const BASELINE = new Set([
  "neungyul-english", "ybm-english", "chunjae-english", "visang-english",
  "donga-english", "jihak-english", "miraen-english", "common-english-guide",
]);

/** 사람이 읽는 산문만. 메타·링크 라벨은 제외(형식적으로 이름이 들어갈 수밖에 없음). */
function prose(a) {
  const out = [];
  out.push(...(a.intro ?? []));
  for (const s of a.sections ?? []) {
    out.push(s.heading ?? "");
    out.push(...(s.paragraphs ?? []));
    out.push(...(s.bullets ?? []));
    if (s.callout) out.push(s.callout.title, s.callout.body);
    if (s.table) for (const r of s.table.rows ?? []) out.push(...r);
    if (s.sample) out.push(s.sample.explanation ?? "");
  }
  for (const f of a.faq ?? []) out.push(f.question, f.answer);
  out.push(a.ctaTitle ?? "", a.ctaBody ?? "");
  return out.filter(Boolean);
}

function sentences(lines) {
  const out = [];
  for (const l of lines) {
    for (const s of String(l).split(/(?<=다\.|요\.|[.!?])\s+/)) {
      const t = s.trim();
      if (t.length >= 10) out.push(t);
    }
  }
  return out;
}

const rows = [];
for (const a of ARTICLES) {
  const toks = TOKENS[a.slug];
  if (!toks) continue;
  const sents = sentences(prose(a));
  const hit = sents.filter((s) => toks.some((t) => s.includes(t)));
  rows.push({
    slug: a.slug,
    baseline: BASELINE.has(a.slug),
    total: sents.length,
    hits: hit.length,
    ratio: sents.length ? Number(((hit.length / sents.length) * 100).toFixed(1)) : 0,
    samples: hit.slice(0, 2).map((s) => s.slice(0, 80)),
  });
}

const base = rows.filter((r) => r.baseline).map((r) => r.ratio).sort((x, y) => x - y);
const FLOOR = base.length ? base[0] : 10;
const MEDIAN = base.length ? base[Math.floor(base.length / 2)] : 15;

const candidates = rows.filter((r) => !r.baseline);
for (const r of candidates) {
  r.verdict = r.ratio >= FLOOR ? "PASS" : r.ratio >= FLOOR * 0.75 ? "BORDERLINE" : "FAIL";
}

const failed = candidates.filter((r) => r.verdict === "FAIL");
const borderline = candidates.filter((r) => r.verdict === "BORDERLINE");

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ floor: FLOOR, median: MEDIAN, rows }, null, 2));
} else {
  console.log("=== 출판사 고유 정보 밀도 게이트 ===");
  console.log(`  기준선(기존 변형문제 8건): 최소 ${FLOOR}% · 중앙 ${MEDIAN}% · 최대 ${base[base.length - 1]}%`);
  console.log(`  합격선 = 기준선 최솟값 ${FLOOR}%\n`);
  console.log("  [기준선 집단]");
  for (const r of rows.filter((x) => x.baseline).sort((a, b) => b.ratio - a.ratio)) {
    console.log(`    ${r.ratio.toFixed(1).padStart(5)}%  ${r.slug.padEnd(24)} ${r.hits}/${r.total} 문장`);
  }
  console.log("\n  [신규 지문분석 축]");
  for (const r of candidates.sort((a, b) => b.ratio - a.ratio)) {
    const mark = r.verdict === "PASS" ? "✅" : r.verdict === "BORDERLINE" ? "⚠️ " : "❌";
    console.log(`    ${mark} ${r.ratio.toFixed(1).padStart(5)}%  ${r.slug.padEnd(30)} ${r.hits}/${r.total} 문장  ${r.verdict}`);
  }
  if (failed.length) {
    console.log(`\n❌ FAIL ${failed.length}건 — 고유 정보가 기존 자산보다도 얇습니다(doorway 위험)`);
    for (const r of failed) console.log(`   · ${r.slug} (${r.ratio}% < ${FLOOR}%)`);
  } else if (borderline.length) {
    console.log(`\n⚠️  BORDERLINE ${borderline.length}건 — 합격선 근처입니다`);
    for (const r of borderline) console.log(`   · ${r.slug} (${r.ratio}%)`);
  } else {
    console.log(`\n✅ 신규 ${candidates.length}건 전부 기준선 이상`);
  }
}

process.exit(failed.length ? 1 : 0);
