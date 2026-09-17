// 유닛 계획 생성기 — 결정론적. LLM 미사용.
// (지문 × 유형) 유닛 전체 목록 + 티어별 변형 수 + 적합성 판정을 산출한다.
//
// 실행: node qbank/harness/plan.mjs [--write]
//   --write   qbank/spec/unit-plan.json 을 갱신 (없으면 요약만 출력)
//
// 적합성 임계값은 하드코딩하지 않는다 — 코퍼스에서 자가 보정한다(calibrate()).
// 정찰이 src/lib/question-quality/feasibility.ts 의 코드 임계값을 회수하면, 그것과
// 이 실측 보정값 중 **더 엄격한 쪽**을 채택한다(둘 다 근거가 있으므로 보수적으로).

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src/data/exam-passages/passages.json");
const OUT = path.join(ROOT, "qbank/spec/unit-plan.json");
const SCREEN = path.join(ROOT, "qbank/spec/passage-screen.json");
const CAPACITY = path.join(ROOT, "qbank/spec/capacity.json");

// 지문별 유형 수용량(결정론) — 없으면 상한 없음으로 진행한다.
// 발견(Q045): 티어가 8을 요구해도 지문이 그만큼 지지하지 못하는 유형이 있다.
// REFERENCE 는 대명사 적격 출현 수, SENTENCE_INSERT 는 문장수−3(양끝 금지)이 물리적 상한이다.
let capacity = { byPassage: {} };
if (fs.existsSync(CAPACITY)) capacity = JSON.parse(fs.readFileSync(CAPACITY, "utf8"));
else console.warn("[경고] capacity.json 이 없다. `tsx qbank/harness/capacity.ts --write` 를 먼저 돌려라.");

// 지문 무결성 1차 스크리닝(결정론) 결과 — 없으면 경고만 하고 진행한다.
let screen = { results: [], typeRestrictions: {} };
if (fs.existsSync(SCREEN)) {
  screen = JSON.parse(fs.readFileSync(SCREEN, "utf8"));
} else {
  console.warn("[경고] passage-screen.json 이 없다. `node qbank/harness/passage-screen.mjs --write` 를 먼저 돌려라.");
}
const screenBlock = new Map(
  (screen.results || [])
    .filter((r) => r.worst === "block")
    .map((r) => [r.id, r.issues.filter((i) => i.severity === "block").map((i) => i.code + "(" + i.detail + ")").join(" | ")]),
);
const screenRestrict = screen.typeRestrictions || {};

// ── 26유형 ────────────────────────────────────────────────────────────────
// category: 선택형(지문 무변형) / 구조형(지문 재배열) / 어휘 / 어법 / 서술형 / 조합
export const TYPES = [
  { subType: "TITLE", ko: "제목 추론", cat: "선택형", mutating: false },
  { subType: "TOPIC", ko: "주제 추론", cat: "선택형", mutating: false },
  { subType: "MAIN_IDEA", ko: "요지/주장", cat: "선택형", mutating: false },
  { subType: "TOPIC_MAIN_IDEA", ko: "주제·요지 복합", cat: "선택형", mutating: false },
  { subType: "IMPLIED_MEANING", ko: "함축 의미 추론", cat: "선택형", mutating: false },
  { subType: "REFERENCE", ko: "지칭 추론", cat: "선택형", mutating: true },
  { subType: "CONTENT_MATCH", ko: "내용 일치", cat: "선택형", mutating: false },
  { subType: "BLANK_INFERENCE", ko: "빈칸 추론", cat: "선택형", mutating: true, canon: true },
  { subType: "SENTENCE_ORDER", ko: "글의 순서", cat: "구조형", mutating: true },
  { subType: "SENTENCE_INSERT", ko: "문장 삽입", cat: "구조형", mutating: true },
  { subType: "IRRELEVANT", ko: "무관한 문장", cat: "구조형", mutating: true },
  { subType: "SUMMARY_COMPLETE_MC", ko: "요약문 완성(객관식)", cat: "구조형", mutating: true },
  { subType: "GRAMMAR_ERROR", ko: "어법 판단", cat: "어법", mutating: true, canon: true },
  { subType: "GRAMMAR_CHOICE_COMBO", ko: "네모 어법", cat: "어법", mutating: true },
  { subType: "GRAMMAR_CORRECTION", ko: "어법 고쳐쓰기", cat: "어법", mutating: true },
  { subType: "VOCAB_CHOICE", ko: "어휘 적절성", cat: "어휘", mutating: true },
  { subType: "CONTEXT_MEANING", ko: "문맥상 의미", cat: "어휘", mutating: true },
  { subType: "SYNONYM", ko: "유의어", cat: "어휘", mutating: true },
  { subType: "ANTONYM", ko: "반의어", cat: "어휘", mutating: true },
  { subType: "CONDITIONAL_WRITING", ko: "조건부 영작", cat: "서술형", mutating: true },
  { subType: "SENTENCE_TRANSFORM", ko: "문장 전환", cat: "서술형", mutating: true },
  { subType: "FILL_BLANK_KEY", ko: "핵심어 빈칸", cat: "서술형", mutating: true },
  { subType: "SUMMARY_COMPLETE", ko: "요약문 완성(서술)", cat: "서술형", mutating: true },
  { subType: "SUMMARY_WRITING", ko: "요약문 영작", cat: "서술형", mutating: true },
  { subType: "WORD_ORDER", ko: "어순 배열", cat: "서술형", mutating: true },
  { subType: "TOPIC_SENTENCE_WRITING", ko: "주제문 쓰기", cat: "서술형", mutating: true },
];

// ── 티어 정책 ─────────────────────────────────────────────────────────────
// 사용자 지시: 최신(2026)은 지문당 200개 수준, 과거로 갈수록 축소. 단 유형당 최소 5개는 절대 하한.
export const TIERS = [
  { tier: "S", years: [2027, 2026], perType: 8 },
  { tier: "A", years: [2025, 2024], perType: 7 },
  { tier: "B", years: [2023, 2022, 2021], perType: 6 },
  { tier: "C", years: [2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011], perType: 5 },
  { tier: "D", years: [2010, 2009, 2008, 2007, 2006, 2005, 2004, 2003], perType: 5 },
];
const tierOf = (year) => TIERS.find((t) => t.years.includes(year)) || TIERS[TIERS.length - 1];

// ── 유형별 변형 수 상한 (★ 견본 실측 근거, 잠정 — A/B 로 재검증한다) ──────
//
// 발견(Q018): 좋은 지문은 정의상 **단일 논지**를 갖는다(design-dna §1 "one controlling idea").
// 제목·주제·요지처럼 **그 하나의 논지를 묻는 유형**은 정답이 각도·추상층위·미끼팔레트만 달라질 뿐
// 의미가 수렴한다 — 감독이 직접 저작한 견본에서 6개까지는 서로 다른 인지 작업이 나왔으나
// 7~8번째부터 "표현만 다른 같은 답"이 되기 시작했다.
// 수를 채우려 억지 2개를 얹는 것은 불변조건 I8(양이 품질을 대체하지 않는다) 위반이므로,
// 그런 유형에는 티어와 무관한 상한을 둔다.
//
// 반면 **지문의 서로 다른 위치를 겨냥하는 유형**(빈칸·어법·어휘·삽입·순서·지칭·내용일치·서술형)은
// 표적 자체가 다르므로 8개 이상도 정직하게 나온다 — 상한을 두지 않는다.
export const TYPE_CAP = {
  TITLE: 6,
  TOPIC: 6,
  MAIN_IDEA: 6,
  TOPIC_MAIN_IDEA: 6,
  SUMMARY_COMPLETE_MC: 6,
  SUMMARY_COMPLETE: 6,
  SUMMARY_WRITING: 6,
  TOPIC_SENTENCE_WRITING: 6,
};
const variantsFor = (subType, tier, passageId) => {
  const structural = capacity.byPassage?.[passageId]?.[subType];
  return Math.min(
    tier.perType,
    TYPE_CAP[subType] ?? Infinity,
    structural === undefined ? Infinity : structural,
  );
};

// ── 적합성 규칙 — ★ 코퍼스에서 자가 보정한다 (매직 넘버 없음) ────────────
//
// 근거: 코퍼스 자체가 정답을 갖고 있다. 각 유형그룹으로 **실제 기출 출제된** 지문들의
// 길이 분포가 곧 KICE 가 실증한 하한이다. 내 추측(문장 6개)은 문장삽입 실측 최소(4개)보다
// 엄격해서 유효 지문 1,001건을 근거 없이 버릴 뻔했다.
//
// 규칙:
//   (a) 그 유형으로 **실제 출제된 적이 있는 지문**은 무조건 적합 — KICE 가 이미 증명했다.
//   (b) 그 외에는 해당 유형그룹 실측 분포의 **p05**(단어·문장 각각)를 넘어야 한다.
//       p05 를 쓰는 이유: min 은 이상치에 취약하다(글의순서 min = 52단어·1문장은 분할 실패 의심).
//
// subType → 코퍼스 typeGroup 매핑. null 이면 아래 BASELINE_GROUP 을 쓴다.
export const TYPE_GROUP = {
  TITLE: "제목",
  TOPIC: "주제",
  MAIN_IDEA: "요지",
  TOPIC_MAIN_IDEA: "주제",
  IMPLIED_MEANING: "함축의미",
  REFERENCE: "지칭",
  CONTENT_MATCH: "내용일치",
  BLANK_INFERENCE: "빈칸추론",
  SENTENCE_ORDER: "글의순서",
  SENTENCE_INSERT: "문장삽입",
  IRRELEVANT: "무관한문장",
  SUMMARY_COMPLETE_MC: "요약문",
  SUMMARY_COMPLETE: "요약문",
  SUMMARY_WRITING: "요약문",
  GRAMMAR_ERROR: "어법",
  GRAMMAR_CHOICE_COMBO: "어법",
  GRAMMAR_CORRECTION: "어법",
  VOCAB_CHOICE: "어휘",
  CONTEXT_MEANING: "어휘",
  SYNONYM: "어휘",
  ANTONYM: "어휘",
  // 서술형은 기출 대응 그룹이 없다 — 지문 전체 이해가 필요하므로 '요지' 를 기준선으로 삼는다.
  CONDITIONAL_WRITING: "요지",
  SENTENCE_TRANSFORM: "요지",
  FILL_BLANK_KEY: "빈칸추론",
  WORD_ORDER: "요지",
  TOPIC_SENTENCE_WRITING: "주제",
};
const BASELINE_GROUP = "요지";

/** 코퍼스 실측으로 유형그룹별 (단어 p05, 문장 p05) 임계값을 만든다. */
export function calibrate(passages) {
  const g = {};
  for (const p of passages) {
    const k = p.typeGroup || "?";
    (g[k] = g[k] || []).push({ w: p.wordCount || 0, s: countSentences(p.text) });
  }
  const pct = (a, x) => a[Math.min(a.length - 1, Math.floor((a.length - 1) * x))];
  const table = {};
  for (const [k, arr] of Object.entries(g)) {
    const w = arr.map((x) => x.w).sort((a, b) => a - b);
    const s = arr.map((x) => x.s).sort((a, b) => a - b);
    table[k] = {
      n: arr.length,
      minWords: pct(w, 0.05),
      minSentences: pct(s, 0.05),
      observedMinWords: w[0],
      observedMinSentences: s[0],
    };
  }
  return table;
}

export function isFeasibleCalibrated(p, subType, sentences, table) {
  const group = TYPE_GROUP[subType] || BASELINE_GROUP;
  // (a) 그 유형으로 실제 출제된 지문 → 무조건 적합
  if (p.typeGroup === group) return { ok: true, why: "KICE 실증(동일 유형그룹 기출)" };
  // 장문 지문은 어떤 유형이든 길이가 넉넉하다
  if (p.typeGroup === "장문") return { ok: true, why: "장문 지문" };
  const t = table[group] || table[BASELINE_GROUP];
  if (!t) return { ok: true, why: "기준 없음(통과)" };
  if ((p.wordCount || 0) < t.minWords) return { ok: false, why: `단어 ${p.wordCount} < ${t.minWords}(${group} p05)` };
  if (sentences < t.minSentences) return { ok: false, why: `문장 ${sentences} < ${t.minSentences}(${group} p05)` };
  return { ok: true };
}

// ── 지문 격리 규칙 ────────────────────────────────────────────────────────
// P0 무결성 게이트 이전에 결정론적으로 걸러낼 수 있는 것들.
export function quarantineReason(p) {
  // 스크리닝의 block 판정이 우선 — 절단·중복문장·인코딩·마커잔재까지 포함한다.
  const s = screenBlock.get(p.id);
  if (s) return "1차 스크리닝 block — " + s;
  if (p.hasDeliberateError) return "복원 실패 플래그(hasDeliberateError) — 의도적 오류 잔존 가능";
  if (p.confidence === "low") return "코퍼스 신뢰도 low";
  if (!p.text || p.text.trim().length < 50) return "본문 부족";
  return null;
}

// 문장 수 — 약식(축약어 오분할을 감수). 적합성 판정용이지 저작용이 아니다.
const ABBREV = /\b(Mr|Mrs|Ms|Dr|Prof|St|vs|etc|e\.g|i\.e|Fig|No|cf)\.$/i;
export function countSentences(text) {
  const parts = String(text).split(/(?<=[.!?])\s+/);
  let n = 0;
  let carry = "";
  for (const part of parts) {
    const s = (carry + part).trim();
    if (!s) continue;
    if (ABBREV.test(s)) {
      carry = s + " ";
      continue;
    }
    carry = "";
    n += 1;
  }
  if (carry.trim()) n += 1;
  return n;
}

// ── 계획 생성 ─────────────────────────────────────────────────────────────
function build() {
  const passages = JSON.parse(fs.readFileSync(SRC, "utf8"));
  const calibration = calibrate(passages);
  const units = [];
  const quarantined = [];
  const perPassage = [];
  const skipped = {};

  for (const p of passages) {
    const q = quarantineReason(p);
    if (q) {
      quarantined.push({ id: p.id, year: p.year, reason: q });
      continue;
    }
    const sentences = countSentences(p.text);
    const t = tierOf(p.year);
    let count = 0;
    const applied = [];
    const notApplied = [];
    const restricted = new Set(screenRestrict[p.id] || []);
    for (const ty of TYPES) {
      // 본문에 라벨((A)~(J)·원문자)이 박힌 지문은 마커 기반 유형을 태울 수 없다 — 파서가 혼동한다.
      if (restricted.has(ty.subType)) {
        notApplied.push({ subType: ty.subType, why: "지문 본문 라벨과 마커 충돌" });
        skipped[ty.subType] = (skipped[ty.subType] || 0) + 1;
        continue;
      }
      const structuralCap = capacity.byPassage?.[p.id]?.[ty.subType];
      if (structuralCap === 0) {
        notApplied.push({ subType: ty.subType, why: "구조적 수용량 0 — 이 지문은 이 유형을 지지하지 못한다" });
        skipped[ty.subType] = (skipped[ty.subType] || 0) + 1;
        continue;
      }
      const f = isFeasibleCalibrated(p, ty.subType, sentences, calibration);
      if (!f.ok) {
        notApplied.push({ subType: ty.subType, why: f.why });
        skipped[ty.subType] = (skipped[ty.subType] || 0) + 1;
        continue;
      }
      units.push({
        passageId: p.id,
        year: p.year,
        grade: p.grade,
        tier: t.tier,
        subType: ty.subType,
        category: ty.cat,
        canon: !!ty.canon,
        variants: variantsFor(ty.subType, t, p.id),
        wordCount: p.wordCount,
        sentences,
      });
      applied.push(ty.subType);
      count += variantsFor(ty.subType, t, p.id);
    }
    // 적용 가능 유형이 하나도 없으면 유닛 0개가 조용히 생기는 대신 격리로 드러낸다.
    if (applied.length === 0) {
      quarantined.push({
        id: p.id,
        year: p.year,
        reason: `적용 가능 유형 0 (단어 ${p.wordCount}·문장 ${sentences}) — 어떤 유형도 성립하지 않는 지문`,
      });
      continue;
    }
    perPassage.push({ id: p.id, year: p.year, tier: t.tier, sentences, wordCount: p.wordCount, types: applied.length, questions: count, notApplied: notApplied.length });
  }

  const targetQuestions = units.reduce((a, u) => a + u.variants, 0);

  // 요약 집계
  const byTier = {};
  const byYear = {};
  const byType = {};
  for (const u of units) {
    byTier[u.tier] = byTier[u.tier] || { units: 0, questions: 0 };
    byTier[u.tier].units += 1;
    byTier[u.tier].questions += u.variants;
    byYear[u.year] = byYear[u.year] || { units: 0, questions: 0 };
    byYear[u.year].units += 1;
    byYear[u.year].questions += u.variants;
    byType[u.subType] = byType[u.subType] || { units: 0, questions: 0 };
    byType[u.subType].units += 1;
    byType[u.subType].questions += u.variants;
  }

  const qPer = perPassage.map((x) => x.questions).sort((a, b) => a - b);
  const pct = (x) => qPer[Math.min(qPer.length - 1, Math.floor((qPer.length - 1) * x))];

  return {
    generatedAt: new Date().toISOString(),
    source: "src/data/exam-passages/passages.json",
    calibration,
    screenApplied: fs.existsSync(SCREEN),
    typeRestrictions: screenRestrict,
    feasibilityPolicy: "코퍼스 자가보정 — (a) 동일 유형그룹 기출은 무조건 적합 (b) 그 외는 해당 그룹 p05(단어·문장) 이상",
    tiers: TIERS,
    typeCap: TYPE_CAP,
    typeCount: TYPES.length,
    passagesTotal: passages.length,
    passagesPlanned: perPassage.length,
    quarantinedCount: quarantined.length,
    quarantined,
    totalUnits: units.length,
    targetQuestions,
    questionsPerPassage: { min: qPer[0], p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), max: qPer[qPer.length - 1] },
    byTier,
    byYear,
    byType,
    skippedByType: skipped,
    units,
  };
}

const plan = build();

console.log("═══ 유닛 계획 ═══");
console.log(`지문        ${plan.passagesPlanned.toLocaleString()} / ${plan.passagesTotal.toLocaleString()}  (격리 ${plan.quarantinedCount})`);
console.log(`유닛        ${plan.totalUnits.toLocaleString()}`);
console.log(`목표 문항   ${plan.targetQuestions.toLocaleString()}`);
console.log(`지문당 문항 min ${plan.questionsPerPassage.min} / p25 ${plan.questionsPerPassage.p25} / p50 ${plan.questionsPerPassage.p50} / p75 ${plan.questionsPerPassage.p75} / max ${plan.questionsPerPassage.max}`);
console.log("\n티어별:");
for (const [t, v] of Object.entries(plan.byTier))
  console.log(`  ${t}  유닛 ${String(v.units).padStart(6)}  문항 ${String(v.questions).padStart(7)}`);
console.log("\n적용 불가(유형별 지문 수):");
for (const [k, v] of Object.entries(plan.skippedByType).sort((a, b) => b[1] - a[1]))
  console.log(`  ${k.padEnd(24)} ${v}`);
console.log("\n연도별 문항 (상위 6):");
for (const y of Object.keys(plan.byYear).sort((a, b) => b - a).slice(0, 6))
  console.log(`  ${y}  유닛 ${String(plan.byYear[y].units).padStart(5)}  문항 ${String(plan.byYear[y].questions).padStart(6)}`);

if (process.argv.includes("--write")) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(plan, null, 1), "utf8");
  const mb = (fs.statSync(OUT).size / 1e6).toFixed(1);
  console.log(`\n→ ${OUT} (${mb} MB)`);
} else {
  console.log("\n(--write 를 주면 qbank/spec/unit-plan.json 에 기록한다)");
}
