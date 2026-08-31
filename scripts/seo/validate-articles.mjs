#!/usr/bin/env node
/**
 * articles-content.json 무결성 게이트.
 *
 * 대량 신설(멀티에이전트 팬아웃) 시 스키마 위반·중복 슬러그·깨진 내부링크·
 * 얄팍한 본문을 잡는다. 팬아웃 결과를 사람이 눈으로 훑는 것은 불가능하므로
 * 이 게이트가 유일한 방어선이다.
 *
 * 사용: node scripts/seo/validate-articles.mjs [--json]
 * 종료코드: 0=통과, 1=오류 있음
 *
 * ⚠️ 이 게이트는 "0건"을 보고하기 전에 반드시 음성테스트(결함 주입)로
 *    검출력을 확인할 것. 잡지 못하는 게이트의 초록은 초록이 아니다.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ARTICLES_PATH = resolve(ROOT, "src/lib/seo/articles-content.json");
const GUIDES_PATH = resolve(ROOT, "src/lib/seo/guides-content.json");

const CATEGORIES = new Set(["types", "exams", "textbooks", "guides"]);
const HUB_PATH = {
  types: "/types",
  exams: "/exam-prep",
  textbooks: "/textbooks",
  guides: "/guides",
};

/** 견본(common-english-guide) 기준선에서 유도한 최소 품질선. */
const MIN = {
  intro: 2,
  sections: 4,
  paragraphsPerSection: 2,
  faq: 3,
  keywords: 5,
  related: 3,
  totalChars: 5000,
  metaTitle: 15,
  metaDescription: 60,
};
const MAX = {
  metaTitle: 70,        // 구글 SERP 절단 경계(한글 기준 보수적)
  metaDescription: 200,
};

const errors = [];
const warnings = [];
const E = (slug, code, msg) => errors.push({ slug, code, msg });
const W = (slug, code, msg) => warnings.push({ slug, code, msg });

const articles = JSON.parse(readFileSync(ARTICLES_PATH, "utf8"));
const guides = existsSync(GUIDES_PATH)
  ? JSON.parse(readFileSync(GUIDES_PATH, "utf8"))
  : [];

if (!Array.isArray(articles)) {
  console.error("articles-content.json 이 배열이 아닙니다.");
  process.exit(1);
}

// ── 유효 내부링크 대상 수집 ────────────────────────────────────────────────
const validPaths = new Set([
  "/", "/about", "/faq", "/glossary", "/resources", "/register",
  "/guides", "/types", "/exam-prep", "/textbooks", "/schools",
  "/credits/products", "/terms", "/privacy", "/refund-policy",
  "/features/ai-question-generation", "/features/exam-builder",
  "/features/passage-analysis", "/features/exam-report",
  "/features/academy-erp", "/features/question-extraction",
  "/features/passage-webtoon",
]);
for (const a of articles) {
  if (CATEGORIES.has(a?.category) && a?.slug) {
    validPaths.add(`${HUB_PATH[a.category]}/${a.slug}`);
  }
}
for (const g of guides) if (g?.slug) validPaths.add(`/guides/${g.slug}`);

// ── 교차 소스 슬러그 충돌 ─────────────────────────────────────────────────
// /guides/[slug] 는 guides-content.json(랜딩 셸)과 articles-content.json(category:"guides")
// 두 소스를 함께 서빙한다. 슬러그가 겹치면 한쪽이 조용히 가려진다 — 라우트 주석이
// "검증 스크립트에서 보장"이라 적어 두었지만 실제 스크립트는 없었다. 여기서 보장한다.
{
  const guideSlugs = new Set(guides.map((g) => g?.slug).filter(Boolean));
  for (const a of articles) {
    if (a?.category === "guides" && guideSlugs.has(a.slug)) {
      E(a.slug, "SLUG_CROSS_SOURCE", `guides-content.json 과 슬러그 충돌 — /guides/${a.slug} 가 한쪽을 가린다`);
    }
  }
  const gt = new Map();
  for (const g of guides) {
    if (!g?.targetKeyword) continue;
    gt.set(g.targetKeyword, g.slug);
  }
  for (const a of articles) {
    const prev = gt.get(a?.targetKeyword);
    if (prev) E(a.slug, "TARGET_CROSS_SOURCE", `guides-content.json/${prev} 과 targetKeyword 중복: "${a.targetKeyword}"`);
  }
}

// ── 전수 검사 ──────────────────────────────────────────────────────────────
const seenSlug = new Map();
const seenTargetKeyword = new Map();
const seenMetaTitle = new Map();

const REQUIRED = [
  "slug", "category", "targetKeyword", "metaTitle", "metaDescription",
  "keywords", "updatedAt", "eyebrow", "h1", "intro", "sections", "faq",
  "ctaTitle", "ctaBody", "related",
];

for (const a of articles) {
  const slug = a?.slug ?? "(슬러그없음)";

  for (const k of REQUIRED) {
    if (a?.[k] === undefined || a?.[k] === null) E(slug, "MISSING_FIELD", `필수 필드 누락: ${k}`);
  }
  if (!CATEGORIES.has(a?.category)) E(slug, "BAD_CATEGORY", `알 수 없는 category: ${a?.category}`);
  if (a?.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug)) {
    E(slug, "BAD_SLUG", "슬러그는 소문자 케밥케이스만 허용");
  }
  if (a?.updatedAt && !/^\d{4}-\d{2}-\d{2}$/.test(a.updatedAt)) {
    E(slug, "BAD_DATE", `updatedAt 형식 오류: ${a.updatedAt} (YYYY-MM-DD)`);
  }

  // 중복 — 슬러그는 카테고리 내에서만 충돌
  const slugKey = `${a?.category}/${a?.slug}`;
  if (seenSlug.has(slugKey)) E(slug, "DUP_SLUG", `슬러그 중복: ${slugKey}`);
  else seenSlug.set(slugKey, true);

  // targetKeyword / metaTitle 중복 = 카니벌라이제이션
  if (a?.targetKeyword) {
    const prev = seenTargetKeyword.get(a.targetKeyword);
    if (prev) E(slug, "DUP_TARGET_KEYWORD", `targetKeyword 중복(카니벌라이제이션): "${a.targetKeyword}" ← ${prev}`);
    else seenTargetKeyword.set(a.targetKeyword, slug);
  }
  if (a?.metaTitle) {
    const prev = seenMetaTitle.get(a.metaTitle);
    if (prev) E(slug, "DUP_META_TITLE", `metaTitle 중복: ${prev}`);
    else seenMetaTitle.set(a.metaTitle, slug);
  }

  // 길이·분량
  if (typeof a?.metaTitle === "string") {
    if (a.metaTitle.length < MIN.metaTitle) E(slug, "SHORT_TITLE", `metaTitle 너무 짧음(${a.metaTitle.length}자)`);
    if (a.metaTitle.length > MAX.metaTitle) W(slug, "LONG_TITLE", `metaTitle ${a.metaTitle.length}자 — SERP 절단 위험`);
  }
  if (typeof a?.metaDescription === "string") {
    if (a.metaDescription.length < MIN.metaDescription) E(slug, "SHORT_DESC", `metaDescription 너무 짧음(${a.metaDescription.length}자)`);
    if (a.metaDescription.length > MAX.metaDescription) W(slug, "LONG_DESC", `metaDescription ${a.metaDescription.length}자`);
  }
  if (Array.isArray(a?.keywords) && a.keywords.length < MIN.keywords) {
    E(slug, "FEW_KEYWORDS", `keywords ${a.keywords.length}개 (최소 ${MIN.keywords})`);
  }
  if (Array.isArray(a?.intro) && a.intro.length < MIN.intro) {
    E(slug, "SHORT_INTRO", `intro ${a.intro.length}문단 (최소 ${MIN.intro})`);
  }
  if (Array.isArray(a?.faq) && a.faq.length < MIN.faq) {
    E(slug, "FEW_FAQ", `faq ${a.faq.length}개 (최소 ${MIN.faq})`);
  }
  if (Array.isArray(a?.related) && a.related.length < MIN.related) {
    E(slug, "FEW_RELATED", `related ${a.related.length}개 (최소 ${MIN.related})`);
  }

  // 섹션
  if (Array.isArray(a?.sections)) {
    if (a.sections.length < MIN.sections) {
      E(slug, "FEW_SECTIONS", `sections ${a.sections.length}개 (최소 ${MIN.sections})`);
    }
    a.sections.forEach((s, i) => {
      if (!s?.heading) E(slug, "SECTION_NO_HEADING", `sections[${i}] heading 없음`);
      if (!Array.isArray(s?.paragraphs) || s.paragraphs.length < MIN.paragraphsPerSection) {
        E(slug, "SECTION_THIN", `sections[${i}]("${s?.heading ?? "?"}") 문단 ${s?.paragraphs?.length ?? 0}개 (최소 ${MIN.paragraphsPerSection})`);
      }
      if (s?.table) {
        const h = s.table.headers?.length ?? 0;
        if (!h) E(slug, "TABLE_NO_HEADER", `sections[${i}] table headers 없음`);
        (s.table.rows ?? []).forEach((r, ri) => {
          if (r.length !== h) E(slug, "TABLE_RAGGED", `sections[${i}] table rows[${ri}] 열 수 불일치(${r.length} ≠ ${h})`);
        });
      }
      if (s?.sample) {
        for (const k of ["passage", "question", "answer", "explanation"]) {
          if (!s.sample[k]) E(slug, "SAMPLE_INCOMPLETE", `sections[${i}] sample.${k} 누락`);
        }
        if (s.sample.options && s.sample.options.length !== 5) {
          W(slug, "SAMPLE_OPTIONS", `sections[${i}] 선택지 ${s.sample.options.length}개 (5지선다 아님)`);
        }
      }
    });
  }

  // 내부링크 유효성
  if (Array.isArray(a?.related)) {
    a.related.forEach((r, i) => {
      if (!r?.href) { E(slug, "RELATED_NO_HREF", `related[${i}] href 없음`); return; }
      if (!r?.label) E(slug, "RELATED_NO_LABEL", `related[${i}] label 없음`);
      if (r.href.startsWith("http")) return;             // 외부링크 허용
      if (!validPaths.has(r.href)) E(slug, "RELATED_BROKEN", `related[${i}] 깨진 내부링크: ${r.href}`);
      if (r.href === `${HUB_PATH[a.category]}/${a.slug}`) E(slug, "RELATED_SELF", `related[${i}] 자기 자신을 링크`);
    });
  }

  // 총 분량
  const chars = JSON.stringify(a).length;
  if (chars < MIN.totalChars) E(slug, "THIN_CONTENT", `총 ${chars}자 (최소 ${MIN.totalChars}) — 얄팍한 콘텐츠`);

  // targetKeyword 가 실제로 본문에 착지했는지
  if (a?.targetKeyword) {
    const body = JSON.stringify({ h1: a.h1, mt: a.metaTitle, md: a.metaDescription });
    const core = a.targetKeyword.split(/\s+/).filter((t) => t.length > 1);
    const hit = core.filter((t) => body.includes(t)).length;
    if (core.length && hit / core.length < 0.6) {
      E(slug, "KEYWORD_NOT_LANDED", `targetKeyword "${a.targetKeyword}" 가 제목/설명에 미착지(${hit}/${core.length})`);
    }
  }
}

// ── 보고 ───────────────────────────────────────────────────────────────────
const summary = {
  총아티클: articles.length,
  카테고리별: articles.reduce((m, a) => ((m[a?.category] = (m[a?.category] ?? 0) + 1), m), {}),
  오류: errors.length,
  경고: warnings.length,
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ summary, errors, warnings }, null, 2));
} else {
  console.log("=== articles-content.json 게이트 ===");
  console.log(`  총 ${summary.총아티클}건 |`, JSON.stringify(summary.카테고리별));
  if (errors.length) {
    console.log(`\n❌ 오류 ${errors.length}건`);
    for (const e of errors) console.log(`  [${e.code}] ${e.slug}: ${e.msg}`);
  }
  if (warnings.length) {
    console.log(`\n⚠️  경고 ${warnings.length}건`);
    for (const w of warnings.slice(0, 40)) console.log(`  [${w.code}] ${w.slug}: ${w.msg}`);
    if (warnings.length > 40) console.log(`  … 외 ${warnings.length - 40}건`);
  }
  if (!errors.length) console.log(`\n✅ 오류 0건${warnings.length ? ` (경고 ${warnings.length}건)` : ""}`);
}

process.exit(errors.length ? 1 : 0);
