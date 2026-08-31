#!/usr/bin/env node
/**
 * 내부링크 그래프 게이트.
 *
 * 전역 정합 검수가 실측으로 잡은 결함 — 단위 검수자는 자기 글의 related 만 보므로
 * "아무도 나를 링크하지 않는다"를 구조적으로 볼 수 없다. 그래서 기계가 센다.
 *
 * 검출:
 *   ORPHAN        인바운드 0 (아무도 링크하지 않음)
 *   DANGLING      본문에서 다른 글로 위임했는데 related 에 그 글이 없음
 *   NO_FEATURE    related 에 기능 허브(/features/...)가 없음
 *   HUB_WEAK      축 허브인데 인바운드가 기준 미만
 *
 * 사용: node scripts/seo/link-graph.mjs [--json] [--new-only]
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ARTICLES = JSON.parse(
  readFileSync(resolve(ROOT, "src/lib/seo/articles-content.json"), "utf8"),
);
const FEATURE_LINKS_SRC = readFileSync(
  resolve(ROOT, "src/lib/seo/feature-links.ts"),
  "utf8",
);

const HUB = { types: "/types", exams: "/exam-prep", textbooks: "/textbooks", guides: "/guides" };
const pathOf = (a) => `${HUB[a.category]}/${a.slug}`;

/** 이번 축에서 신설한 24건. */
const NEW = new Set([
  "naesin-variant-questions","naesin-variant-ai","naesin-english-ai","naesin-question-program",
  "naesin-variant-workflow","school-exam-variant","go1-naesin-english","go2-naesin-english",
  "naesin-passage-analysis","passage-analysis-method","passage-analysis-ai","english-syntax-analysis",
  "literal-translation-worksheet","passage-vocabulary-sheet","naesin-passage-range","mock-exam-passage-analysis",
  "textbook-passage-analysis-ai","neungyul-passage-analysis","ybm-passage-analysis","chunjae-passage-analysis",
  "visang-passage-analysis","donga-passage-analysis","jihak-passage-analysis","miraen-passage-analysis",
]);

/** 축 허브 — 결속이 여기로 수렴해야 한다. */
const AXIS_HUBS = {
  "naesin-variant-questions": "축A 내신 변형문제",
  "naesin-passage-analysis": "축B 내신 지문분석",
  "textbook-passage-analysis-ai": "축C 교과서 지문분석",
};
const HUB_MIN_INBOUND = 3;

const newOnly = process.argv.includes("--new-only");
const asJson = process.argv.includes("--json");

// ── 그래프 구성 ────────────────────────────────────────────────────────────
const byPath = new Map(ARTICLES.map((a) => [pathOf(a), a]));
const inbound = new Map([...byPath.keys()].map((p) => [p, []]));

for (const a of ARTICLES) {
  const from = pathOf(a);
  for (const r of a.related ?? []) {
    if (!r?.href || r.href.startsWith("http")) continue;
    if (inbound.has(r.href)) inbound.get(r.href).push(from);
  }
}

// 기능 허브(feature-links.ts TOPIC_SPOKES)에서 오는 인바운드도 계산에 넣는다.
for (const m of FEATURE_LINKS_SRC.matchAll(/href:\s*"(\/(?:guides|types|exam-prep|textbooks)\/[a-z0-9-]+)"/g)) {
  if (inbound.has(m[1])) inbound.get(m[1]).push("(기능허브)");
}

const issues = [];
const rows = [];

for (const a of ARTICLES) {
  const p = pathOf(a);
  if (newOnly && !NEW.has(a.slug)) continue;

  const inb = inbound.get(p) ?? [];
  const outb = (a.related ?? []).filter((r) => r?.href && !r.href.startsWith("http"));
  const hasFeature = outb.some((r) => r.href.startsWith("/features/"));

  rows.push({ slug: a.slug, path: p, inbound: inb.length, outbound: outb.length, hasFeature });

  if (inb.length === 0) {
    issues.push({ code: "ORPHAN", slug: a.slug, msg: "인바운드 0 — 아무도 이 글을 링크하지 않습니다" });
  }
  if (!hasFeature) {
    issues.push({ code: "NO_FEATURE", slug: a.slug, msg: "related 에 기능 허브(/features/...)가 없습니다" });
  }
  if (AXIS_HUBS[a.slug] && inb.length < HUB_MIN_INBOUND) {
    issues.push({ code: "HUB_WEAK", slug: a.slug, msg: `${AXIS_HUBS[a.slug]} 허브인데 인바운드 ${inb.length} (최소 ${HUB_MIN_INBOUND})` });
  }

  // 위임했는데 링크 없음 — 본문에 다른 신규 글의 targetKeyword 를 언급하며 위임 어구를 쓴 경우.
  //
  // ⚠️ 부분문자열 오탐 방지(실전 사고): 단순 includes 로 세면
  //   「영어 내신 변형문제 AI」·「학교별 영어 내신 변형문제」·「영어 내신 변형문제 제작」이
  //   전부 짧은 「영어 내신 변형문제」로도 매칭돼, 올바로 링크한 글 6건이 DANGLING 으로 오탐됐다.
  //   → 각 등장 위치에서 **가장 긴 targetKeyword 하나만** 그 위치의 참조로 인정한다.
  //   또한 자기 글의 targetKeyword 를 포함하는 문맥(자기 정의문)은 위임이 아니므로 제외한다.
  const body = JSON.stringify({ s: a.sections, f: a.faq, i: a.intro });
  const DELEGATE = /(정리해 두었|정리했|따로 다루|맡기고|넘기고|별도로 다룹|다른 글에|참고하십시오|참고하세요)/;
  if (DELEGATE.test(body)) {
    const outHrefs = new Set(outb.map((r) => r.href));
    const candidates = ARTICLES.filter((o) => o.slug !== a.slug && NEW.has(o.slug))
      .sort((x, y) => y.targetKeyword.length - x.targetKeyword.length);

    // 위치별 최장일치 — 긴 키워드가 먹은 구간은 짧은 키워드가 다시 세지 않는다.
    const claimed = []; // [start, end)
    const overlaps = (s, e) => claimed.some(([cs, ce]) => s < ce && cs < e);
    const referenced = new Set();

    for (const o of candidates) {
      let i = body.indexOf(o.targetKeyword);
      while (i !== -1) {
        const end = i + o.targetKeyword.length;
        if (!overlaps(i, end)) {
          claimed.push([i, end]);
          // 자기 글 정의문(자기 targetKeyword 가 이 구간을 감싸는 경우)은 위임이 아니다.
          const around = body.slice(Math.max(0, i - 12), end + 12);
          if (!around.includes(a.targetKeyword)) referenced.add(o.slug);
        }
        i = body.indexOf(o.targetKeyword, i + 1);
      }
    }

    for (const slug of referenced) {
      const m = ARTICLES.find((x) => x.slug === slug);
      if (m && !outHrefs.has(pathOf(m))) {
        issues.push({
          code: "DANGLING",
          slug: a.slug,
          msg: `본문이 "${m.targetKeyword}" 를 언급하며 위임하는데 related 에 ${pathOf(m)} 가 없습니다`,
        });
      }
    }
  }
}

const byCode = issues.reduce((m, i) => ((m[i.code] = (m[i.code] ?? 0) + 1), m), {});

if (asJson) {
  console.log(JSON.stringify({ summary: byCode, issues, rows }, null, 2));
} else {
  console.log("=== 내부링크 그래프 게이트 ===");
  console.log(`  검사 ${rows.length}건${newOnly ? " (신규만)" : ""}`);
  const hubRows = rows.filter((r) => AXIS_HUBS[r.slug]);
  if (hubRows.length) {
    console.log("\n  [축 허브 인바운드]");
    for (const r of hubRows) console.log(`    ${String(r.inbound).padStart(3)} ← ${r.slug}  (${AXIS_HUBS[r.slug]})`);
  }
  const orph = rows.filter((r) => r.inbound === 0);
  console.log(`\n  인바운드 0(고아): ${orph.length}건${orph.length ? " — " + orph.map((r) => r.slug).join(", ") : ""}`);
  if (issues.length) {
    console.log(`\n❌ 이슈 ${issues.length}건 ${JSON.stringify(byCode)}`);
    for (const i of issues.slice(0, 40)) console.log(`  [${i.code}] ${i.slug}: ${i.msg}`);
    if (issues.length > 40) console.log(`  … 외 ${issues.length - 40}건`);
  } else {
    console.log("\n✅ 이슈 0건");
  }
}

process.exit(issues.some((i) => i.code === "ORPHAN" || i.code === "HUB_WEAK") ? 1 : 0);
