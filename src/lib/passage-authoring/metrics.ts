import type {
  AuthoringCoverage,
  AuthoringMaterial,
  CoverageCheck,
  GradeBand,
  PassageMetrics,
} from "./schema";

// ============================================================================
// AI 지문 생성 — 결정론적 지표·대조 (순수 함수, 부작용 없음)
//
// 이 파일이 존재하는 이유: 모델에게 "몇 단어인가", "그 단어를 썼는가"를 물으면
// 태연하게 거짓말을 한다(passage-transform 에서 실측된 교훈). 그래서 셀 수 있는
// 값은 전부 서버가 본문에서 직접 센다. schema.ts 의 PassageMetrics/AuthoringCoverage
// 는 "모델의 주장"이 아니라 "본문의 사실"이라는 계약이고, 그 계약을 지키는 곳이
// 여기다.
//
// ── 2026-07 확장: 기계성 지표 5종 ──────────────────────────────────────────
// 옛 지표(단어·문장·평균·최장·문단)는 "분량이 맞는가"만 봤다. 그런데 분량이 정확히
// 맞는데도 기계가 쓴 티가 나는 지문이 대부분이었다. 원인은 **분산**이다 — 여섯
// 문장이 전부 같은 무게로 굴러가면 사람이 쓴 글로 읽히지 않는다. 그래서 문장 길이
// 변동계수·스팬·최단 문장·담화표지 밀도·명사화 비율을 함께 센다.
// 이는 "셀 수 있는 값은 서버가 센다"(아래 계약)의 **파기가 아니라 확장**이다:
// 여전히 모델에게 묻지 않고 본문에서 직접 센다.
// 판정은 KICE_BANDS 로 "기출 범위 안 / 벗어남"만 표시한다. **자동 재생성은 하지
// 않는다** — 재생성은 크레딧·부분 환불 계약(run-job.ts)과 얽혀 별도 정책 결정이
// 필요하다. 지표는 사실만 말하고, 다음 행동은 선생님이 고른다.
//
// 회귀 방지 계약
//  - 부작용·I/O·랜덤 금지. 같은 입력이면 언제나 같은 출력이어야 한다(테스트·재현).
//  - 빈 문자열·공백만·60k자 초장문에도 던지지 않고 안전한 값을 돌려준다.
//  - 정규식은 전부 선형 스캔만 한다. 중첩 수량자(`(a+)+`)를 만들지 않는다 —
//    자료 본문은 사용자 업로드라 백트래킹 폭발은 곧 서버 정지다.
//  - 문장 분할은 splitSentences() 한 곳만 쓴다. 지표마다 제 나름의 분할을 만들면
//    "평균 18.4단어인데 최단이 22단어"처럼 서로 모순되는 값이 한 카드에 뜬다.
// ============================================================================

// ── 공통 유틸 ───────────────────────────────────────────────────────────────

/** 정규식 메타문자 이스케이프. 표제어는 사용자 파일에서 오므로 반드시 거친다. */
function escapeRegExp(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 곡선 아포스트로피를 직선으로 통일 — 표제어/본문 표기 차이로 매칭이 새는 것 방지. */
function normalizeApostrophes(text: string): string {
  return text.replace(/[‘’ʼ]/g, "'");
}

/**
 * 단어 수. 공백 토큰 중 "글자나 숫자를 하나라도 가진 것"만 센다 —
 * 줄표(—)·따옴표 같은 고립 기호가 단어로 잡혀 목표 분량 판정이 흔들리는 것을 막는다.
 */
function countWords(text: string): number {
  if (!text) return 0;
  let count = 0;
  for (const token of text.split(/\s+/)) {
    if (token && /[A-Za-z0-9가-힣]/.test(token)) count += 1;
  }
  return count;
}

// ── 문장 분할 ───────────────────────────────────────────────────────────────

/**
 * 문장 종결 후보. `(?=\s|$)` 를 붙인 이유가 핵심이다 —
 * 이게 없으면 "3.5" 나 "U.S.A" 의 내부 마침표까지 종결로 잡힌다.
 */
const SENTENCE_END_RE = /[.!?…]+["'”’)\]]*(?=\s|$)/g;

/**
 * 마침표를 문장 끝으로 보면 안 되는 약어들(소문자 비교). 여기에 없더라도
 * 마침표 앞이 알파벳 1글자면(= J. K. 같은 이니셜) 종결로 치지 않는다.
 */
const SENTENCE_ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "st", "jr", "sr", "vs", "etc", "fig", "no",
  "cf", "al", "ca", "vol", "ex", "inc", "ltd", "co", "approx", "dept", "est",
  "e.g", "i.e", "u.s", "u.k", "a.m", "p.m", "b.c", "a.d", "ph.d",
]);

/** 종결부호 직전 토큰이 약어인지. text 전체를 다시 훑지 않도록 앞 16자만 본다. */
function endsWithAbbreviation(text: string, endIndex: number): boolean {
  const head = text.slice(Math.max(0, endIndex - 16), endIndex);
  const token = head.match(/[A-Za-z.]+$/);
  if (!token) return false;
  const word = token[0].toLowerCase();
  // "J." 같은 이니셜 — 이름 중간이므로 문장 경계가 아니다.
  if (word.replace(/\./g, "").length <= 1) return true;
  return SENTENCE_ABBREVIATIONS.has(word) || SENTENCE_ABBREVIATIONS.has(word.replace(/\.$/, ""));
}

/**
 * 문장 배열. `.!?` + 공백 경계로 자르되 (1) 약어 오분할과 (2) 소문자로 이어지는
 * 잘못된 경계("...co. and the rest")를 걸러낸다. 한 번의 선형 스캔이다.
 */
function splitSentences(passage: string): string[] {
  const text = passage.trim();
  if (!text) return [];

  const sentences: string[] = [];
  let cursor = 0;
  SENTENCE_END_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SENTENCE_END_RE.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (endsWithAbbreviation(text, start)) continue;
    // 경계 뒤가 소문자로 이어지면 문장이 끝난 게 아니다(약어 목록 밖의 사고 방지).
    const rest = text.slice(end);
    const nextChar = rest.replace(/^\s+/, "").charAt(0);
    if (nextChar && /[a-z]/.test(nextChar)) continue;
    const chunk = text.slice(cursor, end).trim();
    if (chunk) sentences.push(chunk);
    cursor = end;
  }
  const tail = text.slice(cursor).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

// ── §1-a. 기계성 지표의 재료(담화표지·명사화) ───────────────────────────────

/**
 * 담화표지(discourse connective) 17종.
 *
 * ⚠️ 이 목록은 **기출 코퍼스 측정에 쓴 사전과 한 글자도 다르면 안 된다**.
 * connectiveDensity 의 기준값(기출 중앙 0.12 / p90 0.33 / 0개인 지문 40%)이 바로
 * 이 17종·단어 경계 매칭으로 KICE 2018+ 558편을 훑어 나온 수치이기 때문이다.
 * 예를 들어 "that is" 는 관계절 조각("the idea that is central")까지 함께 잡는
 * 과다 계수가 있지만, **기준 중앙값도 똑같은 규칙으로 측정됐으므로** 비교 가능성이
 * 정밀도보다 중요하다. 항목을 빼거나 더하고 싶으면 기준값부터 다시 측정할 것.
 */
export const CONNECTIVES = [
  "however",
  "therefore",
  "thus",
  "moreover",
  "furthermore",
  "in addition",
  "for example",
  "for instance",
  "consequently",
  "nevertheless",
  "on the other hand",
  "in conclusion",
  "in short",
  "that is",
  "indeed",
  "similarly",
  "likewise",
] as const;

/**
 * 17종을 하나의 교대(alternation)로 합친 정규식. 긴 표현을 앞에 두어 "in short" 가
 * "in addition" 과 겹칠 여지를 없앤다. 어절 사이는 `\s+` 하나뿐이라 중첩 수량자가
 * 없고(백트래킹 폭발 없음), 전체가 한 번의 선형 스캔이다.
 */
const CONNECTIVE_RE = new RegExp(
  `\\b(?:${[...CONNECTIVES]
    .sort((a, b) => b.length - a.length)
    .map((phrase) => phrase.replace(/ /g, "\\s+"))
    .join("|")})\\b`,
  "gi",
);

/**
 * 명사화(nominalisation) 접미사. 추상명사가 문장의 주어 자리를 차지할수록 학술
 * 산문의 무게가 나온다 — 기출이 기계 산문과 갈리는 지점 중 하나다.
 * `nature`·`future`·`picture` 같은 오탐이 섞이지만, 기준값(기출 중앙 5.2%) 역시
 * 같은 규칙으로 측정됐으므로 그대로 둔다(위 CONNECTIVES 와 같은 이유).
 */
const NOMINAL_SUFFIX_RE =
  /(tion|sion|ment|ness|ity|ance|ence|ism|ship|ure)$/;

/** 라틴 문자로 시작하는 낱말 토큰. 명사화 비율의 분모다(숫자·한글은 세지 않는다). */
const LATIN_WORD_RE = /[A-Za-z][A-Za-z'’-]*/g;

/** 모집단 표준편차(pstdev). 표본이 아니라 이 지문 전체가 모집단이므로 n 으로 나눈다. */
function populationStdev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) {
    const diff = value - mean;
    sum += diff * diff;
  }
  return Math.sqrt(sum / values.length);
}

/** 담화표지 등장 횟수. 본문 전체를 한 번만 훑는다. */
function countConnectives(text: string): number {
  if (!text) return 0;
  CONNECTIVE_RE.lastIndex = 0;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = CONNECTIVE_RE.exec(text)) !== null) {
    count += 1;
    // 0길이 매칭은 구조상 불가하지만, 무한 루프는 절대 만들지 않는다.
    if (match[0].length === 0) CONNECTIVE_RE.lastIndex += 1;
    if (count >= 500) break;
  }
  return count;
}

/** 명사화 접미사로 끝나는 낱말의 비율(%). 소유격 `'s` 는 떼고 본다. */
function computeNominalRatioPercent(text: string): number {
  if (!text) return 0;
  LATIN_WORD_RE.lastIndex = 0;
  let total = 0;
  let nominal = 0;
  let match: RegExpExecArray | null;
  while ((match = LATIN_WORD_RE.exec(text)) !== null) {
    const token = normalizeApostrophes(match[0])
      .toLowerCase()
      .replace(/'s$/, "")
      .replace(/[-']+$/, "");
    if (!token) continue;
    total += 1;
    if (NOMINAL_SUFFIX_RE.test(token)) nominal += 1;
  }
  if (total === 0) return 0;
  return Math.round((nominal / total) * 1000) / 10;
}

// ── §1-b. 지문 지표 ─────────────────────────────────────────────────────────

/**
 * 본문에서 직접 계산하는 지표. targetWords 가 0/음수여도(방어) 편차는 0 으로 둔다.
 * avgSentenceWords 는 소수점 1자리 — UI 가 "평균 18.4단어"로 그대로 쓴다.
 *
 * 기계성 지표 5종의 기출 실측 중앙값(KICE 2018+ n=558):
 *   sentenceLengthCv 0.36 (p10 0.24 / p90 0.54) · sentenceSpanWords 25 (p10 16 / p90 38)
 *   shortestSentenceWords 10 (8단어 이하인 지문이 30%) · connectiveDensity 0.12
 *   (p90 0.33, 하나도 없는 지문이 40%) · nominalRatioPercent 5.2%
 */
export function computePassageMetrics(
  passage: string,
  targetWords: number,
): PassageMetrics {
  const text = (passage ?? "").trim();
  const words = countWords(text);
  const sentences = splitSentences(text);
  const sentenceWordCounts = sentences.map((s) => countWords(s));
  const paragraphs = text
    ? text.split(/\n\s*\n/).filter((block) => block.trim().length > 0).length || 1
    : 0;

  const avg =
    sentenceWordCounts.length > 0 ? words / sentenceWordCounts.length : 0;
  const longest =
    sentenceWordCounts.length > 0 ? Math.max(...sentenceWordCounts) : 0;
  const shortest =
    sentenceWordCounts.length > 0 ? Math.min(...sentenceWordCounts) : 0;
  const targetDeltaPercent =
    Number.isFinite(targetWords) && targetWords > 0
      ? Math.round(((words - targetWords) / targetWords) * 100)
      : 0;

  // CV 의 평균은 `words / 문장 수`(=avg)가 아니라 문장별 단어 수의 평균을 쓴다.
  // 둘은 거의 같지만, 문장 밖에 남은 토큰이 있는 병리적 입력에서 CV 가 음수 분모를
  // 만나지 않도록 계산 재료를 한 배열로 통일한다.
  const countMean =
    sentenceWordCounts.length > 0
      ? sentenceWordCounts.reduce((sum, n) => sum + n, 0) /
        sentenceWordCounts.length
      : 0;
  const stdev = populationStdev(sentenceWordCounts, countMean);
  const sentenceLengthCv = countMean > 0 ? stdev / countMean : 0;

  const connectiveHits = countConnectives(text);

  return {
    words,
    sentences: sentenceWordCounts.length,
    avgSentenceWords: Math.round(avg * 10) / 10,
    longestSentenceWords: longest,
    paragraphs,
    targetDeltaPercent,
    // 소수 2자리 — 0.36 / 0.12 처럼 기준값과 같은 자릿수로 읽혀야 비교가 된다.
    sentenceLengthCv: Math.round(sentenceLengthCv * 100) / 100,
    sentenceSpanWords: sentenceWordCounts.length > 0 ? longest - shortest : 0,
    shortestSentenceWords: shortest,
    connectiveDensity:
      sentenceWordCounts.length > 0
        ? Math.round((connectiveHits / sentenceWordCounts.length) * 100) / 100
        : 0,
    nominalRatioPercent: computeNominalRatioPercent(text),
  };
}

// ── §1-c. 기출 범위(KICE_BANDS) ─────────────────────────────────────────────

/** 기출 범위 판정을 붙이는 지표 5종. 옛 지표(단어·문장 수)는 목표 대비 %로 따로 본다. */
export const KICE_METRIC_KEYS = [
  "sentenceLengthCv",
  "sentenceSpanWords",
  "shortestSentenceWords",
  "connectiveDensity",
  "nominalRatioPercent",
] as const;
export type KiceMetricKey = (typeof KICE_METRIC_KEYS)[number];

export interface KiceBand {
  lo: number;
  hi: number;
}

// ── 이 표의 출처와 신뢰도 ───────────────────────────────────────────────────
// HIGH_3 / CSAT 행만 **실측**이다: KICE 2018년 이후 평가원 지문 558편을 아래와
// 똑같은 함수(같은 splitSentences·같은 CONNECTIVES 17종·같은 접미사 목록)로 훑어
// 얻은 p10~p90 이다. 중앙값은 CV 0.36 / 스팬 25 / 최단 10 / 연결사 0.12 / 명사화
// 5.2% 이고, 아래 HIGH_3·CSAT 행이 그 분포의 양 끝이다.
//
// 나머지 다섯 행(MIDDLE_1~HIGH_2)은 **추정치**다. 학년별 기출 코퍼스가 없어서
// CSAT 행을 학년별 평균 문장 길이 중앙값 비율로 축소했다(중1 9.5 → 수능 23.5 대비
// 0.40배 …). 실측 코퍼스가 생기면 이 다섯 행부터 교체할 것.
// 예외: nominalRatioPercent 만은 전 학년이 추정이 아니다 — prompts.ts 의
// GRADE_BAND_PARAMS(abstract-noun share) 행과 **같은 값**을 그대로 쓴다. 프롬프트가
// 요구한 범위와 UI 가 판정하는 범위가 갈라지면 "시킨 대로 썼는데 벗어났다고 표시"
// 되는 모순이 생긴다. 한쪽을 고치면 반드시 다른 쪽도 고칠 것.
// (metrics.ts 는 클라이언트도 import 한다. prompts.ts 를 여기서 import 하면 영어
//  프롬프트 전문이 클라이언트 번들에 실리므로, 의도적으로 값만 복제한다.)
//
// 판정은 "범위 안 / 벗어남" 표시로 끝난다. 벗어났다고 자동 재생성하지 않는다.
// ───────────────────────────────────────────────────────────────────────────
export const KICE_BANDS: Record<KiceMetricKey, Record<GradeBand, KiceBand>> = {
  // 문장 길이 변동계수 — 척도 무관 지표라 학년에 따라 크게 움직이지 않는다.
  // 하한이 이 지표의 본체다: 하한 미만 = 모든 문장이 같은 무게 = 기계 산문.
  sentenceLengthCv: {
    MIDDLE_1: { lo: 0.18, hi: 0.5 },
    MIDDLE_2: { lo: 0.19, hi: 0.51 },
    MIDDLE_3: { lo: 0.2, hi: 0.52 },
    HIGH_1: { lo: 0.21, hi: 0.53 },
    HIGH_2: { lo: 0.22, hi: 0.54 },
    HIGH_3: { lo: 0.24, hi: 0.54 },
    CSAT: { lo: 0.24, hi: 0.54 },
  },
  // 최장 − 최단(단어). 기출 p10 16 / p90 38 — 학년 평균 문장 길이 비율로 축소.
  sentenceSpanWords: {
    MIDDLE_1: { lo: 6, hi: 15 },
    MIDDLE_2: { lo: 8, hi: 19 },
    MIDDLE_3: { lo: 9, hi: 22 },
    HIGH_1: { lo: 11, hi: 25 },
    HIGH_2: { lo: 13, hi: 31 },
    HIGH_3: { lo: 15, hi: 35 },
    CSAT: { lo: 16, hi: 38 },
  },
  // 최단 문장. 기출 중앙 10 이고 8단어 이하가 30% — "짧게 치고 나가는 한 문장"이
  // 있어야 사람 글로 읽힌다. 상한을 넘었다 = 짧은 문장이 하나도 없다는 뜻이다.
  shortestSentenceWords: {
    MIDDLE_1: { lo: 3, hi: 7 },
    MIDDLE_2: { lo: 3, hi: 7 },
    MIDDLE_3: { lo: 3, hi: 9 },
    HIGH_1: { lo: 3, hi: 10 },
    HIGH_2: { lo: 4, hi: 12 },
    HIGH_3: { lo: 5, hi: 14 },
    CSAT: { lo: 5, hi: 15 },
  },
  // 담화표지 / 문장. 기출은 하나도 없는 지문이 40% 라 하한이 0 이다(없는 게 정상).
  // 상한 초과 = "However, … Therefore, … Moreover, …" 로 이어 붙인 기계 산문.
  // 중등은 명시적 연결을 더 허용한다(교과서 산문의 실제 관행).
  connectiveDensity: {
    MIDDLE_1: { lo: 0, hi: 0.45 },
    MIDDLE_2: { lo: 0, hi: 0.43 },
    MIDDLE_3: { lo: 0, hi: 0.4 },
    HIGH_1: { lo: 0, hi: 0.38 },
    HIGH_2: { lo: 0, hi: 0.36 },
    HIGH_3: { lo: 0, hi: 0.33 },
    CSAT: { lo: 0, hi: 0.33 },
  },
  // 명사화 비율(%). prompts.ts GRADE_BAND_PARAMS 의 abstract-noun share 와 동일 값.
  // 고3·수능 행이 기출 중앙 5.2% 를 감싼다.
  nominalRatioPercent: {
    MIDDLE_1: { lo: 0, hi: 1.5 },
    MIDDLE_2: { lo: 0, hi: 2.5 },
    MIDDLE_3: { lo: 2, hi: 3.5 },
    HIGH_1: { lo: 3.5, hi: 4.5 },
    HIGH_2: { lo: 4.5, hi: 5.5 },
    HIGH_3: { lo: 5, hi: 6.5 },
    CSAT: { lo: 5, hi: 7.5 },
  },
};

/** 한 지표 한 학년의 기출 범위. 학년이 이상하면 수능 행으로 떨어진다(방어). */
export function kiceBandFor(key: KiceMetricKey, gradeBand: GradeBand): KiceBand {
  const row = KICE_BANDS[key];
  return row[gradeBand] ?? row.CSAT;
}

export interface KiceBandCheck {
  key: KiceMetricKey;
  value: number;
  lo: number;
  hi: number;
  /** 기출 범위 안인가. UI 는 이 값으로 "범위 안 / 벗어남" 두 상태만 그린다. */
  within: boolean;
}

/**
 * 지표 5종을 기출 범위와 대조한다. UI 가 같은 판정식을 다섯 군데에서 다시 쓰지
 * 않도록 여기서 한 번만 만든다(결과 카드·커버리지 패널이 갈라지면 같은 지문이
 * 화면마다 다른 판정을 받는다).
 */
export function evaluateKiceBands(
  metrics: PassageMetrics,
  gradeBand: GradeBand,
): KiceBandCheck[] {
  return KICE_METRIC_KEYS.map((key) => {
    const band = kiceBandFor(key, gradeBand);
    const value = Number(metrics?.[key] ?? 0);
    return {
      key,
      value,
      lo: band.lo,
      hi: band.hi,
      within: value >= band.lo && value <= band.hi,
    };
  });
}

// ── §1-d. 빈 다리 문장(bridge stub) 통지 ────────────────────────────────────
//
// 실측 5편 **전부**의 중반에 "앞 문장을 지시어로 되받기만 하는 짧은 단문"이 박혔다:
//   Such structured scrutiny continually reshapes policy.        (1편, 4/7)
//   This complex dynamic creates a fundamental operational disconnect. (3편, 5/8)
//   The key lies in focus.                                       (4편, 4/9)
//   Such encounters cannot replace organic conversation.         (5편, 4/7)
// 지문에서 가장 중요한 다리 자리인데 주장만 있고 이유가 없다. 원인(짧은 문장을
// **명령**하던 프롬프트 두 줄)은 prompts.ts 에서 제거했지만, 그 수정이 실제로
// 먹혔는지를 사람이 매번 눈으로 세는 것은 방법이 아니다.
//
// ⚠️ 이것은 **게이트가 아니다.** 차단하지 않고, 재생성하지 않고, 모델을 부르지
// 않는다 — item.warnings 에 사실만 얹는다(run-job 의 배치 중복 경고와 같은 채널,
// 결과 카드가 이미 그리는 자리다). 판단은 선생님이 한다.
//
// 판정을 **순수 구문**으로만 하는 이유: "구체 정보가 있는가"를 어휘 없이 재려다
// 오탐을 만드는 순간 통지 자체가 소음이 된다. 주어가 앞을 되받는 지시 표현이고
// 문장이 짧다 — 이 둘만 본다. 실측 5편에서 4건을 잡고, 남은 하나
// ("The mind inherently seeks permanence.")는 애초에 비어 있다는 지적을 받은
// 문장이 아니다.

/** 앞 문장을 되받는 주어. 여기 없는 주어로 시작하면 다리 문장으로 보지 않는다. */
const BRIDGE_SUBJECT_RE =
  /^(?:this|these|that|those|such)\b|^the\s+(?:key|point|answer|result|problem|issue|reason|difference|distinction)\b/i;

/** 이 길이 미만일 때만 통지 대상. 기출 최단 문장 중앙값이 10 이라 그 아래를 본다. */
const BRIDGE_MAX_WORDS = 10;

export interface BridgeStub {
  /** 1-based 문장 번호 — 통지 문구가 "N번째 문장"으로 읽힌다. */
  index: number;
  text: string;
  words: number;
}

/**
 * 앞을 되받기만 하는 짧은 다리 문장을 찾는다. 첫 문장은 되받을 앞이 없으므로 제외.
 * 순수 함수(계약: 부작용·I/O·랜덤 금지).
 */
export function detectBridgeStubs(passage: string): BridgeStub[] {
  const sentences = splitSentences((passage ?? "").trim());
  const out: BridgeStub[] = [];
  for (let i = 1; i < sentences.length; i += 1) {
    const text = sentences[i];
    const words = countWords(text);
    if (words >= BRIDGE_MAX_WORDS) continue;
    if (!BRIDGE_SUBJECT_RE.test(text.trim())) continue;
    out.push({ index: i + 1, text, words });
  }
  return out;
}

/** 통지 문구(한국어). 결과 카드가 warnings 를 그대로 한 줄씩 그린다. */
export function bridgeStubWarnings(passage: string): string[] {
  return detectBridgeStubs(passage).map(
    (stub) =>
      `${stub.index}번째 문장이 앞 내용을 되받기만 하는 짧은 단문일 수 있어요 (${stub.words}단어) — "${stub.text.slice(0, 60)}"`,
  );
}

// ── §2. 단어장 표제어 추출 ──────────────────────────────────────────────────

/** 대조 대상 상한. 이 이상은 UI 에서도 의미가 없고 매칭 비용만 늘린다. */
export const MAX_VOCAB_TERMS = 200;

/** 한 자료에서 훑을 최대 줄 수 — 60k자 단어장이 와도 선형 시간에 끝낸다. */
const MAX_VOCAB_LINES = 4_000;

/**
 * 표제어 뒤에 붙어 하나의 표제어를 이루는 불변화사. 단어장 줄의 "첫 영어 덩어리"를
 * 무작정 3어까지 먹으면 "abundant plentiful"(영영 뜻풀이) 같은 쓰레기 표제어가
 * 생겨 커버리지가 통째로 0 이 된다. 그래서 2·3번째 토큰은 구동사 불변화사일 때만
 * 이어 붙인다(give up / look forward to).
 */
const PHRASAL_PARTICLES = new Set([
  "up", "down", "off", "out", "on", "in", "into", "over", "through", "away",
  "back", "with", "for", "to", "at", "about", "after", "along", "around", "by",
  "from", "upon", "forward", "together", "apart", "aside", "across", "against",
  "ahead", "behind", "under", "without",
]);

/** 표제어가 될 수 없는 기능어 — 목차/머리글 줄이 표제어로 섞이는 것을 막는다. */
const NON_HEADWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "in", "on", "at", "to", "for", "is",
  "are", "was", "were", "it", "this", "that", "with", "by", "as", "from",
]);

/**
 * 단어장 한 줄에서 표제어 하나를 읽는다. 단어장 형식은 제각각이라
 * ("word - 뜻", "word\t뜻", "1. word 뜻", CSV, 공백 구분) 공통분모인
 * "줄 앞의 첫 영어 덩어리"만 신뢰한다. 영어가 없으면 null.
 */
function readHeadword(rawLine: string): string | null {
  // 표제어는 언제나 줄 앞에 있다 — 한 줄이 아무리 길어도 앞 160자만 본다.
  const line = normalizeApostrophes(rawLine.slice(0, 160));
  const stripped = line
    .replace(/^[\s•·*\-–—]+/, "")
    .replace(/^\(?\d{1,4}\)?(?:[.)\]:]\s*|\s+)/, "");
  // 영어·공백·하이픈·아포스트로피만 이어지는 선두 구간 = 표제어 후보.
  // 한글/숫자/구분자(, ; : / tab)를 만나면 자동으로 끊긴다.
  const latin = stripped.match(/^[A-Za-z][A-Za-z'\- ]{0,59}/);
  if (!latin) return null;

  const tokens = latin[0].split(/\s+/).filter(Boolean);
  const head = (tokens[0] ?? "").replace(/[-']+$/, "");
  if (head.length < 2) return null;
  const lower = head.toLowerCase();
  if (NON_HEADWORDS.has(lower)) return null;

  const parts = [lower];
  for (let i = 1; i < tokens.length && parts.length < 3; i += 1) {
    const next = tokens[i].replace(/[-']+$/, "").toLowerCase();
    if (!next || !PHRASAL_PARTICLES.has(next)) break;
    parts.push(next);
  }
  return parts.join(" ");
}

/** 표제어 추출 결과 + 분모 정직성 재료. */
export interface VocabTermStats {
  /** 대조에 쓸 표제어(최대 MAX_VOCAB_TERMS). */
  terms: string[];
  /** 상한을 걷어내고 이 자료들에서 실제로 감지한 표제어 총 개수. */
  totalDetected: number;
  /** 200개 상한이나 줄 수 상한이 실제로 걸렸는지. */
  truncated: boolean;
}

/**
 * role==="VOCABULARY" 자료들에서 영어 표제어를 뽑는다(소문자·중복 제거).
 * 다른 역할의 자료는 쳐다보지 않는다 — 어법 교재에서 단어를 뽑으면 커버리지가
 * 의미를 잃는다.
 *
 * 200개에서 조기 반환하지 않고 끝까지 세는 이유는 **분모 정직성**이다. 512개짜리
 * 단어장을 올린 선생님에게 "200개 중 3개(2%)"라고만 적으면 거짓말이 된다.
 * totalDetected 가 있어야 "앞 200개만 대조했어요(전체 512개)"를 쓸 수 있다.
 * 비용은 자료당 최대 MAX_VOCAB_LINES 줄의 선형 스캔이라 그대로다.
 */
export function extractVocabTermStats(
  materials: AuthoringMaterial[],
): VocabTermStats {
  const terms: string[] = [];
  const seen = new Set<string>();
  let totalDetected = 0;
  let truncated = false;
  for (const material of materials ?? []) {
    if (!material || material.role !== "VOCABULARY") continue;
    const lines = (material.content ?? "").split(/\r?\n/);
    if (lines.length > MAX_VOCAB_LINES) truncated = true;
    const limit = Math.min(lines.length, MAX_VOCAB_LINES);
    for (let i = 0; i < limit; i += 1) {
      const term = readHeadword(lines[i] ?? "");
      if (!term || seen.has(term)) continue;
      seen.add(term);
      totalDetected += 1;
      if (terms.length < MAX_VOCAB_TERMS) terms.push(term);
      else truncated = true;
    }
  }
  return { terms, totalDetected, truncated };
}

/**
 * 표제어 배열만 필요한 호출부용 얇은 래퍼. **구현은 위 한 벌뿐이다** —
 * 두 벌로 갈라지면 대조에 쓴 표제어와 화면이 말하는 분모가 어긋난다.
 */
export function extractVocabTerms(materials: AuthoringMaterial[]): string[] {
  return extractVocabTermStats(materials).terms;
}

// ── §3. 커버리지 대조 ───────────────────────────────────────────────────────

/** 모델이 보고한 어법 라벨의 표시 상한 — 카드 한 장에 들어갈 만큼만. */
const MAX_GRAMMAR_POINTS = 12;

/**
 * 굴절 허용 패턴. 단어장 표제어는 원형인데 지문에는 굴절형으로 나오므로
 * (attempt → attempted, study → studies, create → creating, stop → stopping)
 * 어간 관용 매칭을 한다. 대신 접미사 대안은 고정 문자열 나열뿐이라 백트래킹이
 * 폭발하지 않는다.
 */
function inflectionPattern(word: string): string {
  if (/y$/i.test(word) && word.length > 2) {
    return `${escapeRegExp(word.slice(0, -1))}(?:y|ies|ied|ying|ily)`;
  }
  if (/e$/i.test(word) && word.length > 2) {
    return `${escapeRegExp(word.slice(0, -1))}(?:e|es|ed|ing|ely)`;
  }
  const last = escapeRegExp(word.slice(-1));
  // `${last}?(?:ed|ing)` 가 자음 반복(stop→stopped/stopping)까지 흡수한다.
  return `${escapeRegExp(word)}(?:${last}?(?:ed|ing)|es|s|ly|d)?`;
}

/** 표제어 → 굴절 허용 정규식. 실패하면 null(호출부는 0회로 센다). */
function buildTermRegex(term: string): RegExp | null {
  const words = term.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const head = words.slice(0, -1).map(escapeRegExp).join("\\s+");
  const tail = inflectionPattern(words[words.length - 1]);
  const body = head ? `${head}\\s+${tail}` : tail;
  try {
    return new RegExp(`\\b${body}\\b`, "gi");
  } catch {
    return null;
  }
}

function countOccurrences(haystack: string, term: string): number {
  const re = buildTermRegex(term);
  if (!re) return 0;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(haystack)) !== null) {
    count += 1;
    // 0길이 매칭은 구조상 불가하지만, 무한 루프는 절대 만들지 않는다.
    if (match[0].length === 0) re.lastIndex += 1;
    if (count >= 500) break;
  }
  return count;
}

/**
 * 약속한 단어가 본문에 실제로 들어갔는지 대조한다.
 *  - wordCoveragePercent: vocabTerms 가 비면 null(단어장 자료가 없다는 뜻).
 *    값 자체는 그대로 두되, **판정은 UI 가 한다** — 40~70% 가 적정이고 70% 초과는
 *    "과밀"이다. 이 지표를 높을수록 좋은 점수로 읽으면 "많이 우겨넣을수록 고득점"이
 *    되어, "억지로 넣지 말라"는 프롬프트와 지표가 서로를 배반한다.
 *  - grammarPoints: 라벨 그대로 통과한다. 어법은 문자열 매칭으로 검증할 수 없어
 *    (분사구문을 정규식으로 셀 수 없다) schema 주석대로 "모델 보고"임을 유지한다.
 *  - termsTotalDetected/termsTruncated: 분모 정직성. 호출부가 **클리핑 전 원본**
 *    자료로 잰 값을 넘겨 주면 그대로 싣고, 넘기지 않으면 대조한 표제어 수로 채운다
 *    (미전달 호출부도 거짓말은 하지 않는 안전한 기본값).
 */
export function computeCoverage(
  passage: string,
  opts: {
    vocabTerms: string[];
    grammarPoints: string[];
    /** 클리핑 전 원본 자료에서 감지한 총 표제어 수(extractVocabTermStats.totalDetected). */
    termsTotalDetected?: number;
    /** 200개 상한·예산 절단이 실제로 걸렸는지. */
    termsTruncated?: boolean;
  },
): AuthoringCoverage {
  const haystack = normalizeApostrophes((passage ?? "").trim());
  const words: CoverageCheck[] = [];
  const seen = new Set<string>();
  let hits = 0;

  for (const raw of (opts.vocabTerms ?? []).slice(0, MAX_VOCAB_TERMS)) {
    const label = normalizeApostrophes((raw ?? "").trim().toLowerCase());
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const count = haystack ? countOccurrences(haystack, label) : 0;
    if (count > 0) hits += 1;
    words.push({ label, hit: count > 0, count });
  }

  const grammarSeen = new Set<string>();
  const grammarPoints: string[] = [];
  for (const raw of opts.grammarPoints ?? []) {
    const label = (raw ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
    if (!label || grammarSeen.has(label)) continue;
    grammarSeen.add(label);
    grammarPoints.push(label);
    if (grammarPoints.length >= MAX_GRAMMAR_POINTS) break;
  }

  // 대조한 표제어 수(= 분모). 원본에서 감지한 총 개수가 이보다 크면 어딘가에서
  // 잘렸다는 뜻이고, 그 사실을 화면이 말해야 한다.
  const comparedCount = words.length;
  const reportedTotal =
    typeof opts.termsTotalDetected === "number" &&
    Number.isFinite(opts.termsTotalDetected) &&
    opts.termsTotalDetected > comparedCount
      ? Math.round(opts.termsTotalDetected)
      : comparedCount;
  const truncated =
    opts.termsTruncated ??
    (reportedTotal > comparedCount || comparedCount >= MAX_VOCAB_TERMS);

  return {
    words,
    grammarPoints,
    wordCoveragePercent:
      comparedCount > 0 ? Math.round((hits / comparedCount) * 100) : null,
    termsTotalDetected: reportedTotal,
    termsTruncated: truncated,
  };
}
