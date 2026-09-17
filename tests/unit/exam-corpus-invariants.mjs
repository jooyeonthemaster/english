/**
 * 기출 코퍼스 본문 무결성 불변식 — 순수 검사 로직.
 *
 * 이 파일은 테스트가 아니다. `node --test` 의 파일 매칭 패턴
 * (`*.test.mjs` / `*-test.mjs` / `*_test.mjs` / `test-*.mjs` / `test.mjs`)
 * 중 어느 것에도 걸리지 않도록 이름을 지었고, 설령 실행되더라도
 * test() 등록이 없어 무해하다.
 *
 * 왜 별도 모듈인가: 실제 코퍼스 검사와 "결함 주입 음성테스트"가
 * **완전히 같은 코드 경로**를 타야 계기(instrument)가 살아있음을
 * 증명할 수 있기 때문이다. 검사 함수는 전부 주입된 인자만 보고
 * 판단하며 파일시스템을 읽지 않는다.
 *
 * 관련 사고: 2026-06-20~22 `C:/tmp/haengpyeong/` 파이프라인이
 * 본문을 소리 없이 잘라냈는데, 리포에 존재하던 유일한 코퍼스 assert 가
 * `corpus.length === 4_537` (개수 동결) 뿐이라 전량 통과했다.
 */

// ---------------------------------------------------------------------------
// 공통 유틸
// ---------------------------------------------------------------------------

/** 알파넘 이외를 모두 제거한 비교용 정규화(따옴표/대시/공백 변형에 둔감). */
export function normalizeForCompare(text) {
  return String(text ?? "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toLowerCase();
}

export function wordCount(text) {
  const t = String(text ?? "").trim();
  return t ? t.split(/\s+/).length : 0;
}

export function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** 하이픈류 전부(ASCII·유니코드·전각). 2024 EBSi 는 U+2015, KICE 는 U+FF0D 를 쓴다. */
const DASHES = "\\-\\u2010\\u2011\\u2012\\u2013\\u2014\\u2015\\u2212\\uFF0D";

// ---------------------------------------------------------------------------
// I1 — 글의순서 블록 완전성
// ---------------------------------------------------------------------------

/**
 * recon kind='order' 레코드의 구조 완전성.
 *
 * ⚠ 설계상 제약(반드시 읽을 것): 원 기획은 "정답 순열의 3블록 접두 60자를
 * 모두 포함" 이었으나, 리포 내 `problems.json` 의 stem 은 추출 단계에서
 * **약 160자로 절단**되어 (A)/(B)/(C) 블록 본문을 보존하지 않는다.
 * 따라서 리포만으로 검증 가능한 최대치는 아래 3개다:
 *   (a) lead 블록 접두 60자가 본문 머리에 그대로 살아있는가
 *   (b) 정답 인덱스가 1..5 범위인가
 *   (c) 5지선다 순열 집합이 (A)(B)(C) 6순열 중 서로 다른 5개인가
 * 3블록 본문 대조는 PDF 재추출(2단계)이 있어야 가능하다.
 */
/** answer 필드를 정수 배열로 정규화한다. null(미채점)이면 null 을 돌려준다. */
export function answerValues(answer) {
  if (answer === null || answer === undefined) return null;
  if (typeof answer === "number") return [answer];
  if (typeof answer === "object") return Object.values(answer);
  return [NaN];
}

export function checkOrderBlockCompleteness(passages, problems) {
  const violations = [];
  const meta = {
    orderRecords: 0,
    answerMissing: 0,
    skippedNoProblemEntry: 0,
    skippedShortStem: 0,
    checkedLeadPrefix: 0,
    checkedPermutation: 0,
  };

  const permRe = new RegExp(
    `\\(([ABC])\\)\\s*[${DASHES}]\\s*\\(([ABC])\\)\\s*[${DASHES}]\\s*\\(([ABC])\\)`,
  );

  for (const p of passages) {
    if (p.reconstructionKind !== "order") continue;
    meta.orderRecords += 1;

    // answer 는 세 형태를 갖는다: 정수(단일 문항) · {qNum: 정수}(장문 세트) · null(미채점).
    const keys = answerValues(p.answer);
    if (keys === null) {
      meta.answerMissing += 1;
    } else if (!keys.length || keys.some((v) => !Number.isInteger(v) || v < 1 || v > 5)) {
      violations.push(`${p.id}::answer-out-of-range(${JSON.stringify(p.answer)})`);
    }

    const entry = problems?.[p.id];
    const raw = entry && Array.isArray(entry.rawProblems) ? entry.rawProblems[0] : null;
    if (!raw) {
      meta.skippedNoProblemEntry += 1;
      continue;
    }

    // (a) lead 블록: stem 에서 문항번호와 (A) 이후를 떼면 주어진 글이 남는다.
    let stem = String(raw.stem ?? "").replace(/^\s*\d+\.\s*/, "");
    const markerAt = stem.indexOf("(A)");
    if (markerAt >= 0) stem = stem.slice(0, markerAt);
    const nStem = normalizeForCompare(stem);
    if (nStem.length < 40) {
      meta.skippedShortStem += 1;
    } else {
      meta.checkedLeadPrefix += 1;
      if (!normalizeForCompare(p.text).startsWith(nStem.slice(0, 60))) {
        violations.push(`${p.id}::lead-block-prefix-lost`);
      }
    }

    // (c) 순열 선지 집합
    const choices = Array.isArray(raw.choices) ? raw.choices : [];
    if (p.typeGroup === "글의순서" && choices.length === 5) {
      meta.checkedPermutation += 1;
      const perms = choices.map((c) => {
        const m = permRe.exec(String(c));
        return m ? m[1] + m[2] + m[3] : "";
      });
      if (new Set(perms.filter(Boolean)).size !== 5) {
        violations.push(`${p.id}::permutation-set-broken`);
      }
    }
  }

  return { violations: violations.sort(), meta };
}

/** problems.json 대응이 아예 없는 레코드 수(조용한 축소 방지용 카운트 잠금). */
export function countPassagesWithoutProblemEntry(passages, problems) {
  let n = 0;
  for (const p of passages) if (!problems?.[p.id]) n += 1;
  return n;
}

// ---------------------------------------------------------------------------
// I2 — 정답키별 길이 분포 균일성
// ---------------------------------------------------------------------------

/**
 * 글의순서에서 특정 정답 코호트만 짧다 = 재배열 뒤 꼬리를 잘랐다(RC-1).
 * 코드를 전혀 몰라도 이 지표 하나가 RC-1 을 즉시 검출한다.
 * 반환: `${board}|answer${k}` -> {ratio, deviation, n}
 */
export function measureAnswerKeyLengthUniformity(passages, { typeGroup = "글의순서", minCohort = 15 } = {}) {
  const rows = passages.filter((p) => p.typeGroup === typeGroup);
  const boards = [...new Set(rows.map((p) => p.board))].sort();
  const out = {};
  for (const board of boards) {
    const scoped = rows.filter((p) => p.board === board);
    for (const key of [1, 2, 3, 4, 5]) {
      const cohort = scoped.filter((p) => p.answer === key);
      const rest = scoped.filter((p) => p.answer !== key);
      if (cohort.length < minCohort || rest.length < minCohort) continue;
      const mc = median(cohort.map((p) => wordCount(p.text)));
      const mr = median(rest.map((p) => wordCount(p.text)));
      const ratio = mr === 0 ? 0 : mc / mr;
      out[`${board}|answer${key}`] = {
        n: cohort.length,
        ratio: Number(ratio.toFixed(3)),
        deviation: Number(Math.abs(ratio - 1).toFixed(3)),
      };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// I3 — 유형×보드 정규화 길이 하한
// ---------------------------------------------------------------------------

/** (board, era, typeGroup) 중앙값의 60% 미만인 레코드. */
export function checkLengthFloor(passages, { minGroup = 12, floorRatio = 0.6 } = {}) {
  const groups = new Map();
  for (const p of passages) {
    const key = `${p.board}|${p.era}|${p.typeGroup}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const violations = [];
  const meta = { groupsChecked: 0, groupsSkipped: 0, recordsInSkippedGroups: 0 };
  for (const [, rows] of groups) {
    if (rows.length < minGroup) {
      meta.groupsSkipped += 1;
      meta.recordsInSkippedGroups += rows.length;
      continue;
    }
    meta.groupsChecked += 1;
    const floor = median(rows.map((p) => wordCount(p.text))) * floorRatio;
    for (const p of rows) if (wordCount(p.text) < floor) violations.push(p.id);
  }
  return { violations: violations.sort(), meta };
}

// ---------------------------------------------------------------------------
// I4 — 문장 미완결
// ---------------------------------------------------------------------------

const TERMINATED = /[.!?\u2026]["'\u201D\u2019)\]]?$/;
const DANGLING_PUNCT = new RegExp(`[,;:${DASHES}]$`);
const TAIL_FUNCTION_WORDS = new Set([
  "of", "the", "to", "and", "a", "in", "for", "on", "with", "that", "as", "at",
  "by", "from", "or", "but", "is", "are", "was", "were", "be", "an", "it",
  "their", "his", "her", "this", "these", "those", "which", "who", "when",
  "while", "than", "so", "if", "into", "about", "over", "under", "we", "they",
  "he", "she",
]);

/** 종결부호 없이 끝나거나, 기능어/구두점에 매달려 끝나는 레코드. */
export function checkSentenceCompleteness(passages) {
  const violations = [];
  const meta = { noTerminalPunctuation: 0, danglingPunctuation: 0, trailingFunctionWord: 0 };
  for (const p of passages) {
    const t = String(p.text ?? "").trim();
    const terminated = TERMINATED.test(t);
    const reasons = [];
    if (!terminated) {
      reasons.push("no-terminal-punctuation");
      meta.noTerminalPunctuation += 1;
    }
    if (DANGLING_PUNCT.test(t)) {
      reasons.push("dangling-punctuation");
      meta.danglingPunctuation += 1;
    }
    const lastWord = (t.match(/([A-Za-z']+)\s*$/) || [])[1];
    if (!terminated && lastWord && TAIL_FUNCTION_WORDS.has(lastWord.toLowerCase())) {
      reasons.push("trailing-function-word");
      meta.trailingFunctionWord += 1;
    }
    if (reasons.length) violations.push(`${p.id}::${reasons.join("+")}`);
  }
  return { violations: violations.sort(), meta };
}

// ---------------------------------------------------------------------------
// I5 — 무성(길이 변화 없는) 훼손 패턴
// ---------------------------------------------------------------------------

/**
 * RC-4b 확정 훼손 site — `.tmp-corpus-rca/final/C5-rc4b.mjs:14-22` 의 7건.
 * 행두 `^\d{1,2}\.` 제거가 소수점을 먹어 숫자 의미를 바꿨다(길이는 거의 불변).
 * 2단계 수리가 성공하면 이 목록의 hit 은 0 이 되어야 한다.
 */
export const RC4B_DAMAGE_SIGNATURES = [
  ["ebsi_go1_20091118-q39", "about 6 billion", "about 1.6 billion"],
  ["ebsi_go1_20120314-q29", "between April 1 and April ", "between April 1 and April 15."],
  ["ebsi_go1_20230601-q34", "they bought 3 on average", "they bought 5.3 on average"],
  ["ebsi_go1_20250903-q33", "the sun: 49597", "the sun: 1.49597"],
  ["ebsi_go2_20120314-q25", "in 2009 to 9% in 2010", "in 2009 to 0.9% in 2010"],
  ["ebsi_go2_20161123-q40", "claims 45% of Briti", "claims 95.45% of Briti"],
  ["ebsi_go3_20101012-q25", "weigh up to 5 tons", "weigh up to 1.5 tons"],
];

const HANGUL = /[\uAC00-\uD7A3]/;
const CIRCLED_CHOICE = /[\u2460-\u2473]/;
const POINTS_MARKER = /\[\s*\d\s*\uC810\s*\]/;
const BLOCK_MARKER = /\((?:A|B|C)\)/;
const REFERENCE_MARK = /[\u203B\u2020\u2021]/;
const DUP_FUNCTION_WORD = /\b(the|of|to|and|in|that|is|a|for|on|with|where|it|as)\s+\1\b/i;

/**
 * 붙은 복합어(RC-4c, `low-population` -> `lowpopulation`) 탐지.
 * 사전이 없으므로 코퍼스 자체를 사전으로 쓴다: 길이 12+ 소문자 토큰이
 * 코퍼스 전체에서 1회만 등장하면서, 코퍼스 빈출 단어 2개로 쪼개지면 후보.
 * 정밀도는 낮다 — 그래서 기준선(baseline) 동결 방식으로 쓴다.
 */
export function findGluedCompounds(passages, { minLen = 12, minPart = 3, minPartFreq = 40, maxSelfFreq = 1 } = {}) {
  const freq = new Map();
  for (const p of passages) {
    for (const m of String(p.text ?? "").toLowerCase().matchAll(/\b[a-z]+\b/g)) {
      freq.set(m[0], (freq.get(m[0]) || 0) + 1);
    }
  }
  const split = (w) => {
    for (let i = minPart; i <= w.length - minPart; i += 1) {
      const a = w.slice(0, i);
      const b = w.slice(i);
      if ((freq.get(a) || 0) >= minPartFreq && (freq.get(b) || 0) >= minPartFreq) return `${a}|${b}`;
    }
    return null;
  };
  const hits = [];
  for (const p of passages) {
    const seen = new Set();
    for (const m of String(p.text ?? "").matchAll(/\b[a-z]+\b/g)) {
      const w = m[0];
      if (w.length < minLen || seen.has(w)) continue;
      seen.add(w);
      if ((freq.get(w) || 0) > maxSelfFreq) continue;
      const s = split(w);
      if (s) hits.push(`${p.id}::${w}(${s})`);
    }
  }
  return hits.sort();
}

/** 무성 훼손 패턴 배터리. 검출기별로 독립된 위반 목록을 낸다. */
export function checkSilentCorruption(passages) {
  const result = {
    hangulInEnglishCorpus: [],
    circledChoiceMarker: [],
    pointsMarker: [],
    blockMarkerResidue: [],
    referenceMarkResidue: [],
    duplicatedFunctionWord: [],
    rc4bDamagedNumeric: [],
    gluedCompound: findGluedCompounds(passages),
  };
  const byId = new Map(passages.map((p) => [p.id, p]));
  for (const p of passages) {
    const t = String(p.text ?? "");
    if (HANGUL.test(t)) result.hangulInEnglishCorpus.push(p.id);
    if (CIRCLED_CHOICE.test(t)) result.circledChoiceMarker.push(p.id);
    if (POINTS_MARKER.test(t)) result.pointsMarker.push(p.id);
    if (BLOCK_MARKER.test(t)) result.blockMarkerResidue.push(p.id);
    if (REFERENCE_MARK.test(t)) result.referenceMarkResidue.push(p.id);
    const dup = DUP_FUNCTION_WORD.exec(t);
    if (dup) result.duplicatedFunctionWord.push(`${p.id}::${dup[0].toLowerCase()}`);
  }
  for (const [id, damaged, original] of RC4B_DAMAGE_SIGNATURES) {
    const p = byId.get(id);
    if (p && String(p.text).includes(damaged)) {
      result.rc4bDamagedNumeric.push(`${id}::${damaged.trim()} (원본: ${original.trim()})`);
    }
  }
  for (const k of Object.keys(result)) result[k] = result[k].sort();
  return result;
}

// ---------------------------------------------------------------------------
// I6 — facets ↔ passages 정합
// ---------------------------------------------------------------------------

const FACET_LIST_FIELDS = {
  years: "year",
  exams: "exam",
  grades: "grade",
  boards: "board",
  eras: "era",
  typeGroups: "typeGroup",
  reconKinds: "reconstructionKind",
  sihengs: "siheng",
  sourceKinds: "sourceKind",
  galaes: "galae",
  subGenres: "subGenre",
  difficulties: "difficulty",
};

/**
 * D3(원자성 없는 패치)이 만들 수 있는 passages/facets 불일치를 CI 가 잡게 한다.
 * `total`, 차원별 counts, 그리고 열거 목록의 커버리지를 각각 본다.
 */
export function checkFacetConsistency(passages, facets, label) {
  const violations = [];
  const meta = { label, passages: passages.length, facetTotal: facets?.total ?? null };

  if (facets?.total !== passages.length) {
    violations.push(`${label}::total-mismatch(facets=${facets?.total} passages=${passages.length})`);
  }

  for (const [dim, expected] of Object.entries(facets?.counts ?? {})) {
    const actual = {};
    for (const p of passages) {
      const v = p[dim];
      if (v === undefined || v === null) continue;
      const k = String(v);
      actual[k] = (actual[k] || 0) + 1;
    }
    for (const k of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      const e = expected[k] ?? 0;
      const a = actual[k] ?? 0;
      if (e !== a) violations.push(`${label}::counts.${dim}[${k || "<empty>"}] facets=${e} actual=${a}`);
    }
  }

  for (const [listKey, field] of Object.entries(FACET_LIST_FIELDS)) {
    const listed = facets?.[listKey];
    if (!Array.isArray(listed)) continue;
    const listedSet = new Set(listed.map(String));
    const actualSet = new Set(
      passages.map((p) => p[field]).filter((v) => v !== undefined && v !== null).map(String),
    );
    for (const v of [...actualSet].sort()) {
      if (!listedSet.has(v)) violations.push(`${label}::${listKey} missing "${v || "<empty>"}" (본문에는 존재)`);
    }
    for (const v of [...listedSet].sort()) {
      if (!actualSet.has(v)) violations.push(`${label}::${listKey} lists "${v || "<empty>"}" (본문에 없음)`);
    }
  }

  return { violations: violations.sort(), meta };
}

// ---------------------------------------------------------------------------
// 집계
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// I7 — 개수 잠금 교체 (자기기술 불변식)
// ---------------------------------------------------------------------------

/**
 * `corpus.length === 4_537` 같은 상수 동결을 대체한다.
 * 상수 동결은 (a) 무결성을 전혀 보증하지 못하고 (b) 수리로 레코드가 늘어나면
 * 오히려 수리를 막는다. 대신 facets 가 개수를 자기기술하게 하고, 하한만 잠근다.
 * assert 자체를 없애면 안 된다 — 로드 실패(빈 배열)를 통과시키기 때문이다.
 */
export function checkCountLock(passages, facets, minPassages, label = "corpus") {
  const violations = [];
  if (!Array.isArray(passages) || passages.length === 0) {
    violations.push(`${label}::corpus-load-failed`);
    return violations;
  }
  if (facets?.total !== passages.length) {
    violations.push(`${label}::self-description-broken(facets.total=${facets?.total} length=${passages.length})`);
  }
  if (passages.length < minPassages) {
    violations.push(`${label}::corpus-shrank(${passages.length} < ${minPassages})`);
  }
  const ids = new Set(passages.map((p) => p.id));
  if (ids.size !== passages.length) {
    violations.push(`${label}::duplicate-ids(${passages.length - ids.size})`);
  }
  return violations;
}

export function evaluateCorpus({ passages, problems, facets, koPassages, koFacets }) {
  return {
    I1: checkOrderBlockCompleteness(passages, problems),
    I1_skip: countPassagesWithoutProblemEntry(passages, problems),
    I2: measureAnswerKeyLengthUniformity(passages),
    I3: checkLengthFloor(passages),
    I4: checkSentenceCompleteness(passages),
    I5: checkSilentCorruption(passages),
    I6_en: checkFacetConsistency(passages, facets, "en"),
    I6_ko: koPassages && koFacets ? checkFacetConsistency(koPassages, koFacets, "ko") : null,
  };
}

// ---------------------------------------------------------------------------
// I0 — wordCount 절대 앵커 (렌즈 R3, 2026-08-20 추가)
// ---------------------------------------------------------------------------

/**
 * 각 레코드는 추출 시점에 계산된 `wordCount` 를 **함께 저장**하고 있다.
 * 본문(`text`)은 파이프라인이 다시 쓰지만 `wordCount` 는 다시 쓰지 않았다 —
 * 즉 두 필드는 서로 **독립 계기**다. 본문이 잘리거나 붙으면 둘이 갈라진다.
 *
 * 실측(2026-08-20, 무변경 코퍼스 4,537건):
 *   exact 4,500 · |Δ|=1 37건 · |Δ|≥2 **0건**
 * Δ=1 은 토큰화 규칙 차이(전각 공백·하이픈 결합 등)에서 오는 상수 오차이므로
 * 허용 상한을 1 로 두면 **오탐 0 · 민감도 최대**가 된다.
 *
 * ⚠ 2단계 수리에 주는 계약: 잘린 꼬리를 되붙이면 이 앵커가 즉시 RED 가 된다.
 *    그것이 의도다 — 패처는 `text` 와 `wordCount` 를 **원자적으로 함께** 갱신해야 한다.
 *    (기존 I3/I4 는 "짧다/안 끝난다"만 보므로, 정상 길이로 위장한 치환은 못 잡는다.)
 */
export function checkWordCountAnchor(passages, { maxDrift = 1 } = {}) {
  const violations = [];
  const meta = { records: 0, missingField: 0, exact: 0, offByOne: 0 };
  for (const p of passages ?? []) {
    meta.records += 1;
    const stored = p?.wordCount;
    if (typeof stored !== "number" || !Number.isFinite(stored)) {
      meta.missingField += 1;
      violations.push(`${p?.id}::wordcount-field-missing`);
      continue;
    }
    const computed = wordCount(p.text);
    const drift = Math.abs(computed - stored);
    if (drift === 0) meta.exact += 1;
    else if (drift === 1) meta.offByOne += 1;
    if (drift > maxDrift) {
      violations.push(`${p.id}::wordcount-drift(stored=${stored} computed=${computed} drift=${drift})`);
    }
  }
  return { violations: violations.sort(), meta };
}

// ---------------------------------------------------------------------------
// (id, wordCount) 튜플 잠금 — "영구 면제" 구멍 제거 (렌즈 R3)
// ---------------------------------------------------------------------------

/**
 * 기준선을 id 만으로 잠그면 **그 id 는 영구 면제**가 된다.
 * 예: `2007_06_3001177-q21` 은 I3(길이 하한) 기준선에 있다. id 잠금 상태에서는
 * 이 레코드를 200단어에서 10단어로 더 잘라도 여전히 "기준선에 있는 위반"이라
 * 게이트가 GREEN 을 유지한다. 실제로 기준선 116건 전부가 그런 구멍이었다.
 *
 * 그래서 위반 문자열에 **현재 단어수를 각인**한다. 같은 결함이라도 본문 길이가
 * 바뀌면 문자열이 달라져 regression(새 위반) + repaired(사라진 위반) 양방향으로
 * 잡힌다. 코퍼스에서 사라진 id 는 `@wc=MISSING` 이 되어 stale 로 드러난다.
 */
export function lockToWordCount(violations, passages) {
  const wc = new Map((passages ?? []).map((p) => [p.id, wordCount(p.text)]));
  return violations.map((v) => {
    const id = String(v).split("::")[0];
    return `${v}@wc=${wc.has(id) ? wc.get(id) : "MISSING"}`;
  });
}

/** 튜플 각인을 떼어 원래 위반 문자열로 되돌린다(=stale id 조회용). */
export function stripWordCountLock(violation) {
  return String(violation).replace(/@wc=(?:\d+|MISSING)$/, "");
}

/** 튜플 각인에서 단어수만 뽑는다. 각인이 없으면 null. */
export function lockedWordCount(violation) {
  const m = /@wc=(\d+|MISSING)$/.exec(String(violation));
  if (!m) return null;
  return m[1] === "MISSING" ? "MISSING" : Number(m[1]);
}
