#!/usr/bin/env node
/**
 * 아티클 간 중복도(doorway page) 기계 리포트.
 *
 * 단위 검수자는 구조적으로 "다른 글과 얼마나 겹치는가"를 볼 수 없다.
 * 특히 교과서 8건처럼 출판사명만 바뀐 글은 구글 doorway 제재 대상이므로
 * 기계가 후보를 좁히고 사람/에이전트가 판정한다.
 *
 * 방법: 문서별 한글 문자 4-gram 집합의 Jaccard 유사도 + 완전일치 문장 추출.
 *
 * 사용:
 *   node scripts/seo/cross-similarity.mjs                # 전체
 *   node scripts/seo/cross-similarity.mjs --cat textbooks
 *   node scripts/seo/cross-similarity.mjs --only <slug1,slug2,...>
 *   node scripts/seo/cross-similarity.mjs --json
 *
 * 임계: Jaccard >= 0.30 경고, >= 0.45 위험(doorway 의심)
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ARTICLES = JSON.parse(
  readFileSync(resolve(ROOT, "src/lib/seo/articles-content.json"), "utf8"),
);

const argv = process.argv.slice(2);
const getArg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const catFilter = getArg("--cat");
const onlyList = getArg("--only")?.split(",").map((s) => s.trim());
const asJson = argv.includes("--json");

const WARN = 0.3;
const DANGER = 0.45;

/** 아티클에서 사람이 읽는 산문만 뽑는다(메타·링크 라벨 제외 — 형식적으로 비슷할 수밖에 없음). */
function prose(a) {
  const out = [];
  out.push(...(a.intro ?? []));
  for (const s of a.sections ?? []) {
    out.push(s.heading ?? "");
    out.push(...(s.paragraphs ?? []));
    out.push(...(s.bullets ?? []));
    if (s.callout) out.push(s.callout.title, s.callout.body);
    if (s.table) {
      out.push(...(s.table.headers ?? []));
      for (const r of s.table.rows ?? []) out.push(...r);
    }
    // sample.passage 는 영어 창작 지문이라 한글 4-gram 에 안 잡히지만 해설은 포함
    if (s.sample) out.push(s.sample.question ?? "", s.sample.explanation ?? "");
  }
  for (const f of a.faq ?? []) out.push(f.question, f.answer);
  out.push(a.ctaTitle ?? "", a.ctaBody ?? "");
  return out.filter(Boolean);
}

/** 한글/영문 4-gram 집합. 공백·문장부호 정규화. */
function shingles(text, n = 4) {
  const t = text.replace(/[\s​]+/g, "").replace(/[·—…“”"'’,.()\[\]%~]/g, "");
  const set = new Set();
  for (let i = 0; i + n <= t.length; i++) set.add(t.slice(i, i + n));
  return set;
}

function jaccard(A, B) {
  if (!A.size || !B.size) return 0;
  let inter = 0;
  const [small, large] = A.size < B.size ? [A, B] : [B, A];
  for (const x of small) if (large.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** 문장 단위 분해(한국어 종결형 기준). */
function sentences(lines) {
  const out = [];
  for (const l of lines) {
    for (const s of l.split(/(?<=[.!?。]|다\.|요\.)\s+/)) {
      const t = s.trim();
      if (t.length >= 12) out.push(t);
    }
  }
  return out;
}

// ── 대상 선정 ──────────────────────────────────────────────────────────────
let docs = ARTICLES;
if (catFilter) docs = docs.filter((a) => a.category === catFilter);
if (onlyList) docs = docs.filter((a) => onlyList.includes(a.slug));

const prepared = docs.map((a) => {
  const lines = prose(a);
  const joined = lines.join(" ");
  return {
    slug: a.slug,
    category: a.category,
    targetKeyword: a.targetKeyword,
    chars: joined.length,
    sh: shingles(joined),
    sents: new Set(sentences(lines)),
  };
});

// ── 쌍별 비교 ──────────────────────────────────────────────────────────────
const pairs = [];
for (let i = 0; i < prepared.length; i++) {
  for (let j = i + 1; j < prepared.length; j++) {
    const a = prepared[i];
    const b = prepared[j];
    const sim = jaccard(a.sh, b.sh);
    if (sim < WARN) continue;
    const shared = [...a.sents].filter((s) => b.sents.has(s));
    pairs.push({
      a: a.slug, b: b.slug,
      sameCategory: a.category === b.category,
      jaccard: Number(sim.toFixed(3)),
      level: sim >= DANGER ? "DANGER" : "WARN",
      sharedSentences: shared.length,
      samples: shared.slice(0, 3),
    });
  }
}
pairs.sort((x, y) => y.jaccard - x.jaccard);

const summary = {
  검사대상: prepared.length,
  카테고리: catFilter ?? "전체",
  임계: { WARN, DANGER },
  경고쌍: pairs.filter((p) => p.level === "WARN").length,
  위험쌍: pairs.filter((p) => p.level === "DANGER").length,
};

if (asJson) {
  console.log(JSON.stringify({ summary, pairs }, null, 2));
} else {
  console.log("=== 아티클 간 중복도(doorway) 기계 리포트 ===");
  console.log(` 대상 ${summary.검사대상}건 (${summary.카테고리}) | 임계 WARN≥${WARN} DANGER≥${DANGER}`);
  console.log(` 최단 ${Math.min(...prepared.map((p) => p.chars))}자 / 최장 ${Math.max(...prepared.map((p) => p.chars))}자`);
  if (!pairs.length) {
    console.log("\n✅ 임계 초과 쌍 없음");
  } else {
    console.log(`\n⚠️ 임계 초과 ${pairs.length}쌍 (위험 ${summary.위험쌍} / 경고 ${summary.경고쌍})\n`);
    for (const p of pairs) {
      console.log(`  [${p.level}] ${p.jaccard}  ${p.a}  ×  ${p.b}${p.sameCategory ? "  (동일 카테고리)" : ""}`);
      if (p.sharedSentences) {
        console.log(`      완전일치 문장 ${p.sharedSentences}개`);
        for (const s of p.samples) console.log(`        · ${s.slice(0, 90)}`);
      }
    }
  }
}

// 위험쌍이 있으면 비0 종료 — CI 게이트로 쓸 수 있게
process.exit(summary.위험쌍 ? 1 : 0);
