// 국어(한국어 과목) 문제 품질 검증기의 한글 텍스트 코어 — 토크나이저.
//
// 영어 검증기의 토크나이저(question-quality/core.ts 의 toLowerTokens/contentTokens)는
// /[a-z]/ 전제라 한글 입력에서 전부 무발화(거짓음성)한다. 국어 검증기는 이 모듈만 쓴다.
// 형태소 분석기 없이 순수 휴리스틱(조사 최장일치 스트립 + 보수적 어미 스트립)으로,
// "정답 누수 게이트 / 선지-지문 근거 판정" 이 요구하는 조사-변형 동치성만 노린다.
//
// ⚠️ 휴리스틱 한계 (검증기는 보수적으로 소비할 것):
//  - 1음절 스템("눈이"→"눈")은 동철이의어 오탐이 가능 — 후보에 원형을 항상 유지하고,
//    누수 판정은 단일 어절 일치가 아니라 연속 run 길이(koLongestSharedRun) 임계값으로 한다.
//  - 어미 스트립은 규칙형 종결어미만 다룬다(먹었다/먹는다→먹). 축약형("간다"의 ㄴ다)은
//    음절 내부 자모라 분해하지 않는다 — 미매칭은 거짓음성 쪽(안전)으로 떨어진다.
import { stripKoMarkers } from "./ko-markers";

// ---------------------------------------------------------------------------
// 정규화 · 기초 계수
// ---------------------------------------------------------------------------

export interface NormalizeKoTextOptions {
  /** true 면 줄바꿈을 보존한다(운문/행 단위 처리용). 기본 false = 전부 단일 공백으로 붕괴. */
  preserveLineBreaks?: boolean;
}

/**
 * NFC 정규화 + 공백 붕괴 + 제어문자 제거.
 * NBSP류(U+00A0/U+202F/U+2007)는 일반 공백으로, zero-width 류는 제거한다
 * (question-postprocess/text-utils.ts 의 normalizePassageWhitespace 미러).
 */
export function normalizeKoText(
  text: string,
  options: NormalizeKoTextOptions = {},
): string {
  if (!text) return "";
  const { preserveLineBreaks = false } = options;
  let out = text
    .normalize("NFC")
    // NBSP(U+00A0) · NARROW NBSP(U+202F) · FIGURE SPACE(U+2007) → 일반 공백
    .replace(/[   ]/g, " ")
    // C0 제어문자(탭/줄바꿈/CR 제외) · DEL · zero-width 류 · BOM → 제거
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\u2060\uFEFF]/g, "");
  if (preserveLineBreaks) {
    out = out
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n(?: ?\n)+/g, "\n\n") // 빈 줄 연속 → 문단 경계 하나
      .replace(/ ?\n ?/g, "\n");
    return out.trim();
  }
  return out.replace(/\s+/g, " ").trim();
}

/** 한글 포함 여부 (음절 가-힣 + 호환 자모 ㄱ-ㅣ). */
export function containsHangul(text: string): boolean {
  return /[가-힣ㄱ-ㅣ]/.test(text);
}

function hangulSyllableCount(text: string): number {
  return (text.match(/[가-힣]/g) ?? []).length;
}

export interface CountKoCharsOptions {
  /** true 면 라틴/숫자 글자도 계수에 포함(기본 false = 한글 음절만). */
  includeLatinAndDigits?: boolean;
}

/** 한글 음절 글자수 (공백·구두점·마커 제외). 시험지 분량 게이트가 소비한다. */
export function countKoChars(
  text: string,
  options: CountKoCharsOptions = {},
): number {
  const normalized = normalizeKoText(text ?? "");
  let count = hangulSyllableCount(normalized);
  if (options.includeLatinAndDigits) {
    count += (normalized.match(/[A-Za-z0-9]/g) ?? []).length;
  }
  return count;
}

// ---------------------------------------------------------------------------
// 어절 분해
// ---------------------------------------------------------------------------

/**
 * 꼬리 조사 목록. 복합조사(에서는/에게는/으로는/까지도/부터가/에서의…)는 이 목록의
 * 반복 스트립(최장일치 → 다시 최장일치)으로 처리하므로 여기 나열하지 않는다.
 */
export const KO_JOSA = [
  "은", "는", "이", "가", "을", "를", "에", "의", "도", "만", "와", "과",
  "로", "으로", "에서", "에게", "께", "랑", "이랑", "까지", "부터", "조차",
  "마저", "처럼", "같이", "보다", "마다", "밖에", "뿐", "이나", "나", "며",
  "이며", "든지", "라도", "이라도", "야", "이야", "요",
] as const;

const KO_JOSA_SET = new Set<string>(KO_JOSA);
const KO_JOSA_BY_LENGTH = [...KO_JOSA].sort((a, b) => b.length - a.length);

/**
 * 보수적 종결/연결 어미 목록 (용언 스템 후보 추출용). 단음절 "다"는 명사 과절단
 * (바다→바)을 부르므로 넣지 않는다 — 2음절 이상 규칙형만.
 */
const KO_VERB_ENDINGS = [
  "았습니다", "었습니다", "였습니다", "했습니다",
  "습니다", "입니다", "합니다", "됩니다",
  "았다", "었다", "였다", "했다", "겠다", "한다", "된다", "됐다",
  "이다", "하다", "되다", "는다",
  "다는", "다고", "다며", "라고", "라며", "라는",
  "하고", "하며", "하면", "하여", "해서", "하는",
  "했던", "았던", "었던", "였던",
  "는지", "지만", "면서", "도록", "거나",
].sort((a, b) => b.length - a.length);

const QUOTE_CHARS_REGEX = /["'“”‘’「」『』〈〉《》‹›«»]/g;
const KO_BOGI_LABEL_REGEX = /[<〈《[［(（]\s*보기\s*[>〉》\]］)）]/g;

/** 어절 하나에서 마커·<보기> 라벨·따옴표를 제거하고 앞뒤 구두점을 스트립한다. */
function cleanKoEojeolToken(token: string): string {
  let t = stripKoMarkers(token ?? "");
  t = t.replace(KO_BOGI_LABEL_REGEX, "");
  t = t.replace(QUOTE_CHARS_REGEX, "");
  t = t
    .replace(/^[^가-힣ㄱ-ㅣA-Za-z0-9]+/, "")
    .replace(/[^가-힣ㄱ-ㅣA-Za-z0-9]+$/, "");
  return t;
}

/**
 * 구두점·마커(㉠~㉭, ①~⑳, ⓐ~ⓩ, <보기> 등)를 스트립한 어절 배열.
 * 마커에 조사만 붙어 있던 어절("㉠은")은 마커 제거 후 조사 잔여물이라 버린다.
 */
export function koEojeols(text: string): string[] {
  const normalized = normalizeKoText(text ?? "");
  if (!normalized) return [];
  const out: string[] = [];
  for (const raw of normalized.split(" ")) {
    const hadMarker = raw !== stripKoMarkers(raw);
    const cleaned = cleanKoEojeolToken(raw);
    if (!cleaned) continue;
    if (hadMarker && KO_JOSA_SET.has(cleaned)) continue;
    out.push(cleaned);
  }
  return out;
}

/** 공백 분리 어절 수 (마커·구두점만인 토큰 제외). 시험지 분량 게이트가 소비한다. */
export function countKoEojeol(text: string): number {
  return koEojeols(text).length;
}

// ---------------------------------------------------------------------------
// 스템 후보 (조사 변형 동치성)
// ---------------------------------------------------------------------------

function stripLongestJosa(word: string): string | null {
  for (const josa of KO_JOSA_BY_LENGTH) {
    if (!word.endsWith(josa) || word.length <= josa.length) continue;
    const stem = word.slice(0, -josa.length);
    // 스트립 후 남는 스템은 한글 음절 ≥1 (라틴/숫자 스템은 "TV는" 류를 위해 허용)
    if (hangulSyllableCount(stem) >= 1 || /[A-Za-z0-9]/.test(stem)) return stem;
  }
  return null;
}

function stripVerbEnding(word: string): string | null {
  for (const ending of KO_VERB_ENDINGS) {
    if (!word.endsWith(ending) || word.length <= ending.length) continue;
    const stem = word.slice(0, -ending.length);
    if (hangulSyllableCount(stem) >= 1) return stem;
  }
  return null;
}

/**
 * 어절 → [원형, 조사 스트립형...] 후보 배열.
 * 꼬리 조사를 최장일치로 반복 스트립하고("학교에서는"→학교에서→학교),
 * 각 후보에 보수적 어미 스트립을 1회 시도한다("먹었다"→먹).
 * 1음절 스템도 후보로 남기되 원형이 항상 첫 후보라 과절단이 단독 판정을 오염시키지 않는다.
 */
export function koStemCandidates(eojeol: string): string[] {
  const clean = cleanKoEojeolToken(eojeol ?? "");
  if (!clean) return [];
  const candidates: string[] = [];
  const push = (value: string) => {
    if (value && !candidates.includes(value)) candidates.push(value);
  };
  push(clean);

  let cur = clean;
  for (let guard = 0; guard < 4; guard += 1) {
    const next = stripLongestJosa(cur);
    if (!next) break;
    push(next);
    cur = next;
  }

  for (const base of [...candidates]) {
    const stripped = stripVerbEnding(base);
    if (stripped) push(stripped);
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// 내용어 토큰
// ---------------------------------------------------------------------------

/** 접속부사 — 단독 어절이면 내용어에서 제외. */
export const KO_CONJUNCTIVE_ADVERBS = new Set([
  "그리고", "그러나", "그런데", "하지만", "따라서", "그래서", "또한", "즉",
  "결국", "한편", "다만", "물론", "또", "및", "혹은", "또는", "그러므로",
  "그리하여", "그렇지만", "게다가", "아울러", "요컨대", "왜냐하면", "더구나",
  "하물며", "오히려", "그러니까",
]);

/** 형식(의존)명사·지시어 — 단독(또는 조사만 붙은) 어절이면 내용어에서 제외. */
export const KO_FORMAL_STANDALONE = new Set([
  "이", "그", "저", "것", "수", "때", "중", "등", "때문", "뿐", "데", "바",
  "줄", "이것", "그것", "저것",
]);

function finalJosaStrippedStem(clean: string): string {
  let cur = clean;
  for (let guard = 0; guard < 4; guard += 1) {
    const next = stripLongestJosa(cur);
    if (!next) break;
    cur = next;
  }
  return cur;
}

function isKoFunctionEojeol(clean: string): boolean {
  if (KO_CONJUNCTIVE_ADVERBS.has(clean)) return true;
  if (KO_FORMAL_STANDALONE.has(clean)) return true;
  if (KO_FORMAL_STANDALONE.has(finalJosaStrippedStem(clean))) return true;
  // 숫자·단위 단독 (예: "3", "3.14", "1953년", "5개")
  if (/^[0-9]+(?:[.,][0-9]+)*[가-힣]{0,2}$/.test(clean)) return true;
  return false;
}

function lowerIfLatin(value: string): string {
  return /[A-Za-z]/.test(value) ? value.toLowerCase() : value;
}

/** 분석된 내용어 토큰 — 검증기가 후보 집합 매칭(조사 변형 허용)에 직접 쓸 수 있게 노출. */
export interface KoAnalyzedToken {
  /** 정제된 어절 원형. */
  eojeol: string;
  /** [원형, 조사/어미 스트립형...] — koStemCandidates 결과. */
  candidates: string[];
  /** 후보 집합 (candidates 와 동일 내용, 매칭용). */
  candidateSet: Set<string>;
  /** 대표 스템 = 가장 짧은 "안전" 후보(한글 음절 ≥2, 없으면 원형 유지 — 과절단 방어). */
  stem: string;
}

function representativeStem(candidates: string[]): string {
  let best = candidates[0] ?? "";
  let bestLength = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const syllables = hangulSyllableCount(candidate);
    const safe =
      syllables >= 2 ||
      (syllables === 0 && /^[A-Za-z0-9][A-Za-z0-9'-]+$/.test(candidate));
    if (safe && candidate.length < bestLength) {
      best = candidate;
      bestLength = candidate.length;
    }
  }
  return best;
}

/** 텍스트 → 순서 보존 내용어 토큰 분석 배열 (기능어 어절 제외). */
export function koAnalyzeContentTokens(text: string): KoAnalyzedToken[] {
  const tokens: KoAnalyzedToken[] = [];
  for (const eojeol of koEojeols(text)) {
    if (isKoFunctionEojeol(eojeol)) continue;
    const candidates = koStemCandidates(eojeol).map(lowerIfLatin);
    if (candidates.length === 0) continue;
    tokens.push({
      eojeol,
      candidates,
      candidateSet: new Set(candidates),
      stem: representativeStem(candidates),
    });
  }
  return tokens;
}

/** 어절 → 대표 스템 배열. 순수 기능어 어절(접속부사·형식명사 단독·숫자/단위)은 제외. */
export function koContentTokens(text: string): string[] {
  return koAnalyzeContentTokens(text).map((token) => token.stem);
}

function tokensMatch(a: KoAnalyzedToken, b: KoAnalyzedToken): boolean {
  for (const candidate of a.candidates) {
    if (b.candidateSet.has(candidate)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 겹침 신호 (선지-지문 차용 / 누수 게이트)
// ---------------------------------------------------------------------------

/**
 * 두 텍스트의 내용어 스템 겹침 — 짧은 쪽 기준 포함률(0~1).
 * 토큰 매칭은 스템 후보 교집합(조사 변형 허용)으로 하고, 짧은 쪽은 대표 스템으로
 * 유니크화해 같은 어절 반복이 점수를 부풀리지 않게 한다.
 * 용도: 선지가 지문 표현을 얼마나 차용했는지 — 자카드 대신 포함률인 이유는
 * 선지(짧음)가 지문(긺)에 흡수되는 방향만 관심사이기 때문.
 */
export function koTokenSetOverlap(a: string, b: string): number {
  const tokensA = koAnalyzeContentTokens(a);
  const tokensB = koAnalyzeContentTokens(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const [shorter, longer] =
    tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  const unique = new Map<string, KoAnalyzedToken>();
  for (const token of shorter) {
    if (!unique.has(token.stem)) unique.set(token.stem, token);
  }
  let matched = 0;
  for (const token of unique.values()) {
    if (longer.some((other) => tokensMatch(token, other))) matched += 1;
  }
  return matched / unique.size;
}

/**
 * needle 의 내용어 연속열이 haystack 에 "순서대로, 인접하게" 등장하는 최장 run 길이.
 * 인접 판정은 스템 후보 교집합(조사 변형 허용) — "존엄성은"과 "존엄성이"는 같은 토큰.
 * 누수 게이트의 주력 신호: 예) 서술형 정답 12어절 중 연속 6어절 이상이 지문에 있으면
 * verbatim 누수로 판정(임계값은 호출부 검증기가 유형별로 정한다 —
 * question-quality/core.ts 의 answerRunInPassage(minRun=3) 미러).
 * 양쪽 모두 기능어 어절이 제거된 좌표계라, 중간의 조사·접속부사 차이는 run 을 끊지 않는다.
 */
export function koLongestSharedRun(needle: string, haystack: string): number {
  const needleTokens = koAnalyzeContentTokens(needle);
  const hayTokens = koAnalyzeContentTokens(haystack);
  if (needleTokens.length === 0 || hayTokens.length === 0) return 0;
  let best = 0;
  let next: number[] = new Array(hayTokens.length + 1).fill(0);
  for (let i = needleTokens.length - 1; i >= 0; i -= 1) {
    const cur: number[] = new Array(hayTokens.length + 1).fill(0);
    for (let j = hayTokens.length - 1; j >= 0; j -= 1) {
      if (tokensMatch(needleTokens[i], hayTokens[j])) {
        cur[j] = next[j + 1] + 1;
        if (cur[j] > best) best = cur[j];
      }
    }
    next = cur;
  }
  return best;
}

/**
 * 한글 음절 bigram Dice 계수 (0~1, 대칭, 자기유사 1.0).
 * 음절 연속 구간(어절 내부)별로 bigram 을 뽑고, 1음절 구간은 그 음절 자체를 사용한다.
 * 짧은 텍스트(빈칸 정답 어구 등)에서 run 신호를 보조하는 문자 수준 유사도.
 */
export function koCharBigramSimilarity(a: string, b: string): number {
  const gramsA = koSyllableBigrams(a);
  const gramsB = koSyllableBigrams(b);
  const totalA = sumCounts(gramsA);
  const totalB = sumCounts(gramsB);
  if (totalA === 0 || totalB === 0) return 0;
  let shared = 0;
  for (const [gram, countA] of gramsA) {
    const countB = gramsB.get(gram) ?? 0;
    shared += Math.min(countA, countB);
  }
  return (2 * shared) / (totalA + totalB);
}

function koSyllableBigrams(text: string): Map<string, number> {
  const grams = new Map<string, number>();
  const runs = normalizeKoText(text ?? "").match(/[가-힣]+/g) ?? [];
  const add = (gram: string) => grams.set(gram, (grams.get(gram) ?? 0) + 1);
  for (const run of runs) {
    if (run.length === 1) {
      add(run);
      continue;
    }
    for (let i = 0; i + 2 <= run.length; i += 1) {
      add(run.slice(i, i + 2));
    }
  }
  return grams;
}

function sumCounts(map: Map<string, number>): number {
  let total = 0;
  for (const count of map.values()) total += count;
  return total;
}

// ---------------------------------------------------------------------------
// 지문 내 표현 위치 탐색
// ---------------------------------------------------------------------------

export interface KoFoundRange {
  /** 원문 기준 시작 오프셋 (inclusive). */
  start: number;
  /** 원문 기준 끝 오프셋 (exclusive) — passage.slice(start, end) === 매칭 구간. */
  end: number;
}

/**
 * 지문에서 표현의 위치를 찾는다 — indexOf 기반 + 공백 정규화 허용 매칭
 * (영어 text-utils 의 findExpressionInPassage 미러, script-agnostic).
 * occurrenceIndex(0-기반)로 n번째 출현을 선택한다. 못 찾으면 null.
 * 반환 오프셋은 항상 "원문" 좌표 — 밑줄/마커 삽입 렌더러가 그대로 소비한다.
 */
export function findKoExpressionInPassage(
  expr: string,
  passage: string,
  occurrenceIndex = 0,
): KoFoundRange | null {
  if (!expr || !passage || occurrenceIndex < 0) return null;

  // 전략 1: 원문 그대로 n번째 출현
  const direct = nthIndexOf(passage, expr, occurrenceIndex);
  if (direct !== -1) return { start: direct, end: direct + expr.length };

  // 전략 2: 공백 정규화 사본에서 찾고 원문 오프셋으로 역매핑
  const normExpr = expr.replace(/\s+/g, " ").trim();
  if (!normExpr) return null;
  const { normalized, indexMap } = buildWhitespaceNormalizedIndex(passage);
  const normIdx = nthIndexOf(normalized, normExpr, occurrenceIndex);
  if (normIdx === -1) return null;
  const start = indexMap[normIdx];
  const lastCharIdx = indexMap[normIdx + normExpr.length - 1];
  if (start === undefined || lastCharIdx === undefined) return null;
  return { start, end: lastCharIdx + 1 };
}

function nthIndexOf(haystack: string, needle: string, occurrence: number): number {
  let idx = -1;
  for (let k = 0; k <= occurrence; k += 1) {
    idx = haystack.indexOf(needle, idx + 1);
    if (idx === -1) return -1;
  }
  return idx;
}

/** 공백 붕괴 사본 + (정규화 인덱스 → 원문 인덱스) 매핑을 만든다. */
function buildWhitespaceNormalizedIndex(original: string): {
  normalized: string;
  indexMap: number[];
} {
  let normalized = "";
  const indexMap: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < original.length; i += 1) {
    const ch = original[i];
    if (/\s/.test(ch)) {
      if (normalized.length > 0) pendingSpace = true;
      continue;
    }
    if (pendingSpace) {
      normalized += " ";
      indexMap.push(i); // 공백 런의 "다음 실문자" 위치로 매핑해도 매칭 시작은 실문자에서만 일어난다
      pendingSpace = false;
    }
    normalized += ch;
    indexMap.push(i);
  }
  return { normalized, indexMap };
}
