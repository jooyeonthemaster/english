// ============================================================================
// 글의 순서(SENTENCE_ORDER) 0원 결정형 게이트 — LLM 콜 없음(정규식·문자열 비교만).
// parser-order.ts 에서 분리(파일 500줄 규약). 의존 방향은 이 파일 → parser-order
// 단방향이다.
//
// ⚠ 이 유형은 PASSTHROUGH_TYPES 다 — 후처리가 전혀 없고, md-stream 라우트는 품질
//   검증기 결과를 **기록만** 하고 차단하지 않는다(route.ts:1147). 즉 여기서 못 잡은
//   결함은 학생 화면·인쇄물까지 그대로 간다. 그래서 fast 검증기
//   (validators/sentence-order.ts)의 치명 코드를 게이트로 승격 이식했다:
//   paragraph-not-source-backed · source-sentence-omitted/duplicated ·
//   answer-key-mismatch · unscrambled-answer · given-too-long · paragraph-labels ·
//   paragraph-body-label · text-order-prefix · paragraph-imbalance.
//
// 최강 불변식(#6)은 "무손실 재구성"이지만 그것만으로는 **문장 한가운데 절단**을 볼 수
// 없다(중간 절단도 완전한 무손실 분할이다). #6-b 가 원문 좌표에서 이음매 문자를 직접
// 읽어 그 사각을 메운다.
//
// ⚠ 단락 변형(#11)이 켜져도 **정답 키 축**(#1~#3·#6·#6-b·#8·#13)은 전부 축자 줄로 그대로
//   돈다. 반대로 **학생이 보는 면**에서만 무너지는 축(#4 본문 위생·분량 하한, #5 균형)은
//   변형본 기준으로 한 번 더 집행한다 — 축자에만 걸어 두면 순서 번호
//   노출·분량 불균형·문장 융합이 그대로 저장·인쇄된다(적대검수 실증).
//   #11 본체와 표시면 재집행은 gate-order-variant.ts 가 소유한다(500줄 규약).
//
// ⚠ 26-08-22 기출 전수 실측 수술(하네스 scripts/_tmp-order-fp.ts · 기출 258문항):
//   종전 임계는 기출 자체를 55.4%(수능 본시험 50%) 반려했다. 차단 게이트 배선 기준은
//   "기출 오반려 0%"(플레이북 §0)다 — #2·#4 단어수·#5 두 축은 관측 극값 밖으로 임계
//   이동, #10 공짜 소거·#4 문장수 하한은 orderGateAdvisories 비차단 권고로 강등
//   (계산 유지·채널만 변경 — gate-summary-mc.ts 26-08-22 수술 선례 동형).
// ============================================================================

import {
  SENTENCE_ORDER_MIN_PARAGRAPH_SENTENCES,
  countDisplaySentences,
  countWords,
} from "@/lib/question-quality/core";
import { SENTENCE_ORDER_MAX_GIVEN_WORDS } from "@/lib/question-quality/validators/sentence-order";
import { normalizeWs } from "./parser";
import {
  GIVEN_KEY,
  ORDER_LABELS,
  countFoldTokens,
  foldForOrderMatch,
  locateOrderChunks,
  orderDisplayParagraphs,
  orderPermutationText,
  orderSourceBounds,
  type MdOrderQuestion,
} from "./parser-order";
import { orderDisplayShapeIssues, orderVariantIssues } from "./gate-order-variant";

const ORDER_CIRCLED = "①②③④⑤";

// ── 26-08-22 기출 전수 실측 임계(하네스 scripts/_tmp-order-fp.ts · 기출 258문항) ──
// 정본 상수(validators/sentence-order.ts · core.ts)는 fast 검증기(md-stream 에서는
// 기록 전용 채널)가 계속 쓰므로 그대로 두고, **차단**하는 이 게이트만 관측 극값 밖
// + 여유폭으로 임계를 옮긴다. 아래 수치는 전부 하네스 재실행 출력 전사다.
/** #2 주어진 글 문장수 상한 — 기출 분포 {1:106, 2:120, 3:28, 4:4}(관측 최대 4,
 *  수능 3문장 실물 2021_SN_5061633·2018_SN_5019793 포함). 종전 2는 기출 32건(12.4%)
 *  오반려. 단어수 상한 70은 관측 최대 54라 정본 그대로 안전하다. */
const ORDER_GATE_MAX_GIVEN_SENTENCES = 4;
/** #4 단락 단어수 절대 하한 — 관측 최소 19단어(24 미만 5건 1.9% 오반려 — 22단어
 *  평가원 2015_06_3026346-q38 포함). 관측 최소 밖 18. 짧은 지문 예산 완화식은 유지. */
const ORDER_GATE_MIN_PARAGRAPH_WORDS = 18;
/** #5 단락 분량 불균형 상한 — 기출 spread p50 1.36 · p95 1.89 · 관측 최대 2.21
 *  (2020 수능 67/32/60 실물). 종전 1.9는 기출 9건(3.5%) 오반려 → 관측 최대 밖 2.3. */
const ORDER_GATE_MAX_PARAGRAPH_WORD_RATIO = 2.3;
/** #5 주어진글/단락평균 비율 상한 — 기출 p50 0.69 · p95 1.19 · 관측 최대 1.41
 *  (평가원 2건 포함 7건 2.7% 오반려) → 관측 최대 밖 1.5. */
const ORDER_GATE_MAX_GIVEN_TO_AVG_PARAGRAPH_RATIO = 1.5;

// ── 공짜 소거 판정 ───────────────────────────────────────────────────────────
// 순열 6개 중 선지는 5개다. 즉 버릴 수 있는 배열은 딱 하나뿐이라 "어떤 라벨을 첫
// 자리에서 통째로 배제"하는 것은 산술적으로 불가능하다(선지가 4개로 준다). 따라서
// 규칙은 선지 쪽이 아니라 절단선 쪽이다 — 정답 첫 단락을 뺀 나머지 두 단락은 첫
// 단어만 보고 소거되지 않도록 자립적으로 시작해야 한다.
// 근거: question-prompts-mc.ts:363-365 실측 fatal("(C)가 대용어로 시작해 ④⑤ 즉시 소거").
const FREE_ELIMINATION_OPENER =
  /^(?:however|nevertheless|nonetheless|therefore|thus|hence|consequently|conversely|instead|moreover|furthermore|besides|likewise|similarly|meanwhile|finally|also|yet|but|then|in contrast|by contrast|on the contrary|as a result|for example|for instance|in addition|in other words|in short|that is|even so|after all|at the same time)\b/;

function freeEliminationMarker(text: string): string | null {
  const head = foldForOrderMatch(text).slice(0, 40);
  const m = head.match(FREE_ELIMINATION_OPENER);
  // 'Yet another kind of reader…' 는 연결사가 아니라 한정사구다(적대검수 오탐 실측).
  // 이 한 형태만 좁히고 나머지 개시어는 그대로 둔다 — #10 은 절단선을 옮기면 탈출
  // 가능한 반려라, 넓게 잡아 두는 편이 출하 사고보다 싸다.
  const bareYet = m?.[0] === "yet" && /^yet\s+(?:another|more|again|other)\b/.test(head);
  if (m && !bareYet) return m[0];
  const demonstrative = head.match(/^(?:these|those|such)\s+[a-z]+/);
  return demonstrative ? demonstrative[0] : null;
}

// ── 라벨 오염 판정 ───────────────────────────────────────────────────────────
// fast 의 findSentenceOrderDuplicatedBodyLabel(validators:224-239) **등가 복제**다.
// 종전 구현은 양방향으로 어긋나 있었다(적대검수): (1) 대문자 전용이라 소문자 (a)(b)(c)
// 를 놓쳐 fast 라면 차단됐을 문항을 통과시켰고(paragraph-body-label 은
// RELAXED_BLOCKING 등재 코드다 → fast 대비 회귀), (2) fast 가 면제하는 "직접 인용된
// 라벨 토큰"을 반려해 단락이 지문 축자 의무인 이 유형에서 **재생성으로 탈출 불가능한**
// 반려 루프를 만들었다. 탐지 범위와 면제 규칙을 fast 와 정확히 맞춘다.
const BODY_LABEL_RE = /(?:[（(]\s*[ABC]\s*[）)]|[［[]\s*[ABC]\s*[］\]]|[ⒶⒷⒸⓐⓑⓒ])/giu;
/**
 * 주어진 글의 라벨 오염 — fast validators:53 이 /i 라 대소문자 무관으로 맞춘다.
 * 탐지 **패턴**은 fast 와 동일하게 두되(넓히면 축자 의무와 충돌한다), 판정은 단락
 * 경로와 **같은 구조 라벨 가드**(인접 문자·직접 인용 면제)를 통과시킨다. 종전엔 가드가
 * 단락 경로에만 있어, 지문 첫 문장에 f(A) 나 인용된 "(A)" 가 있으면 주어진 글이 무조건
 * 반려됐다 — 주어진 글은 반드시 지문 맨 앞이라 모델이 피할 수 없는 반려였다(프로브 실증).
 */
const GIVEN_LABEL_RE = /[（([]\s*[ABC]\s*[）)\]]/gi;

function isDirectlyQuotedToken(text: string, start: number, end: number): boolean {
  let left = start - 1;
  while (left >= 0 && /\s/u.test(text[left] ?? "")) left -= 1;
  let right = end;
  while (right < text.length && /\s/u.test(text[right] ?? "")) right += 1;
  const pairs: Record<string, string> = {
    '"': '"',
    "'": "'",
    "“": "”",
    "‘": "’",
    "「": "」",
    "『": "』",
  };
  return pairs[text[left] ?? ""] === (text[right] ?? "");
}

/** 구조 라벨 판정 본체 — 탐지 패턴만 갈아 끼워 단락·주어진 글 두 경로가 공유한다. */
function structuralLabel(text: string, pattern: RegExp): string | null {
  for (const m of text.matchAll(pattern)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    // f(A) · (A)level 처럼 붙어 있는 표기는 구조 라벨이 아니다(fast 동일 규칙).
    if (/[\p{L}\p{N}]/u.test(text[start - 1] ?? "")) continue;
    if (/[\p{L}\p{N}]/u.test(text[end] ?? "")) continue;
    if (isDirectlyQuotedToken(text, start, end)) continue;
    return m[0];
  }
  return null;
}

const structuralBodyLabel = (text: string): string | null => structuralLabel(text, BODY_LABEL_RE);

// ── 절단선 위생(#6-b) 보조 사전 ─────────────────────────────────────────────
// 소문자로 시작해도 **정상 문장 개시**인 두 부류만 면제한다. 종전 면제식
// `/^[a-z][A-Z]/` 는 단어 안 대문자(iPhone·eBay)만 통과시켜 'von Neumann proved…'
// 'de Broglie suggested…' 처럼 소문자 성씨 접두로 시작하는 정상 문장을 중간 절단으로
// 오탐했다(프로브 실증). (1) 단어 내부 대문자 iPhone·macOS·mRNA → `[a-z]+[A-Z]`,
// (2) 소문자 성씨 접두 + 대문자 고유명사 von Neumann·van der Waals.
// ⚠ "아무 소문자 단어 + 대문자 단어"로 넓히면 'because Alden Reeve…' 같은 진짜 중간
//   절단까지 통과한다 — 접두사 목록으로 좁히고 **뒤 단어가 대문자**일 것을 요구한다
//   (이 조건이 'de facto standards…' 류 일반구를 면제에서 배제한다).
const NAME_PARTICLE =
  "von|van|de|del|della|der|den|des|di|da|du|dos|das|la|le|el|al|bin|ibn|ter|ten|af|av|zu";
const LOWERCASE_OPENER_EXEMPT = new RegExp(
  `^(?:[a-z]+[A-Z]|(?:${NAME_PARTICLE})(?:\\s+(?:${NAME_PARTICLE}))?\\s+[A-Z])`,
);

// 문장 종결처럼 보이지만 **뒤에 반드시 말이 더 오는** 약어. 이 마침표 뒤에서 자르면
// 이음매에 종결부호가 있고 다음 조각이 대문자로 시작해 #6-b 두 검사를 모두 우회했다
// ('… as Prof.' | 'Alden Reeve later showed…' — 프로브 실증).
// ⚠ 'U.S.'·'Inc.'·'etc.'·'et al.' 은 실제로 문장을 끝낼 수 있어 **의도적으로 제외**한다
//   (오탐이 실익보다 크다 — 정상 절단을 탈출 불가 반려로 만든다).
const NON_TERMINAL_ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "rev", "gen", "sen", "rep", "gov",
  "col", "lt", "sgt", "capt", "fig", "vol", "vs", "cf", "viz", "e.g", "i.e",
]);

/** 단락 본문 선두 순서표식(1. / ② / (2)) — 정답 순서 노출(validators:137-145 등가). */
const BARE_NUM_PREFIX = /^\s*[0-9]{1,2}(?![0-9])\s*[.)·]\s*(?=[A-Za-z])/;
const CIRCLED_PREFIX = /^\s*(?:[①-⑳]|[([][0-9]{1,2}[)\]])\s*[.)·]?\s*(?=[A-Za-z])/;

/**
 * 본문 위생 3종 — 순서표식·구조 라벨. 축자 줄과 **변형본 줄이 같은 검사를 받아야**
 * 한다: 학생이 보는 것은 변형본이라, 축자에만 걸면 '1. Present-day historians …' 같은
 * 순서 노출이 그대로 인쇄물까지 간다(적대검수 실증 — fast 의 text-order-prefix 대비
 * 표시면 회귀였다).
 */
function bodyHygieneIssues(key: string, text: string): string[] {
  const out: string[] = [];
  if (BARE_NUM_PREFIX.test(text) || CIRCLED_PREFIX.test(text)) {
    out.push(`${key} 앞에 순서 번호가 붙어 정답 순서가 노출됨`);
  }
  const bodyLabel = structuralBodyLabel(text);
  if (bodyLabel) out.push(`${key}에 구조 라벨 ${bodyLabel} 가 재등장`);
  return out;
}

// ── 제시문(주어진 글) 형식 ───────────────────────────────────────────────────
// fast 의 given-too-long 승격 이식. 주어진 글은 **어떤 설정에서도 지문 맨 앞 축자**
// 라 변형 여부와 무관하게 이 상한을 받는다(변형은 단락에만 건다).
function givenShapeIssues(text: string, key: string): string[] {
  const out: string[] = [];
  const sentences = countDisplaySentences(text);
  const words = countWords(text);
  if (sentences < 1 || sentences > ORDER_GATE_MAX_GIVEN_SENTENCES) {
    out.push(`${key}이 ${sentences}문장 (1~${ORDER_GATE_MAX_GIVEN_SENTENCES}문장이어야 함)`);
  }
  if (words > SENTENCE_ORDER_MAX_GIVEN_WORDS) {
    out.push(`${key}이 ${words}단어 (${SENTENCE_ORDER_MAX_GIVEN_WORDS}단어 이하여야 함)`);
  }
  return out;
}

export interface GateMdSentenceOrderOptions {
  /** 0 이면 전 단락 축자, N(1~3)이면 라벨 순서로 앞 N개 단락에 변형본 줄을 요구한다 */
  prefixVariationCount?: number;
  /** answer-only 모드에서 오답해설 개수 검사를 끈다 */
  requireWrong?: boolean;
}

/** 0원 결정형 게이트 — 빈 배열이면 클린. */
export function gateMdSentenceOrder(
  q: MdOrderQuestion,
  passage: string,
  options?: GateMdSentenceOrderOptions,
): string[] {
  const requireWrong = options?.requireWrong !== false;
  const variation = Math.max(0, Math.round(Number(options?.prefixVariationCount ?? 0)) || 0);
  const v: string[] = [];

  // #1 단락 개수·라벨 — 어긋나면 이후 검사가 전부 무의미하므로 즉시 반려.
  if (q.paragraphs.length !== 3) return [`단락 ${q.paragraphs.length}개 (3개 필요)`];
  const labelRun = q.paragraphs.map((p) => p.label).join("");
  if (labelRun !== ORDER_LABELS.join("")) return [`단락 라벨이 (A)(B)(C) 순서가 아님 — 실제 ${labelRun || "없음"}`];
  if (!q.given) return [`${GIVEN_KEY} 누락`];

  // #2 제시문 형식 — 주어진 글은 변형 설정과 무관하게 언제나 지문 축자다.
  v.push(...givenShapeIssues(q.given, GIVEN_KEY));
  const givenWords = countWords(q.given);

  // #3 제시문에 구조 라벨 오염 — 주어진 글과 (A)(B)(C) 는 분리 출력이 계약이다.
  const givenLabel = structuralLabel(q.given, GIVEN_LABEL_RE);
  if (givenLabel) v.push(`${GIVEN_KEY}에 단락 라벨 ${givenLabel} 포함`);

  // #4 단락 본문 위생 — 순서표식·라벨 재등장·분량 하한.
  const paragraphWords: number[] = [];
  for (const p of q.paragraphs) {
    paragraphWords.push(0);
    if (!p.text) {
      v.push(`단락 ${p.label} 본문 누락`);
      continue;
    }
    v.push(...bodyHygieneIssues(`단락 ${p.label} 본문`, p.text));
    const words = countWords(p.text);
    paragraphWords[paragraphWords.length - 1] = words;
    // 문장수 하한(2문장)은 26-08-22 기출 실측으로 **차단 자격 상실** — 1문장 단락 보유
    // 기출 39건(15.1%), 수능 본시험 실물 포함(2021_SN_5061633-q37 (C)·2019_SN_5031122
    // -q36 (A)). 관측 최소 1문장이 자연 하한이라 "관측 극값 밖" 차단 임계가 존재하지
    // 않는다(countDisplaySentences 는 비어 있지 않으면 항상 ≥1 — 하한 1은 죽은 검사고,
    // 빈 본문은 위 '본문 누락'이 이미 잡는다) → 2문장 권장은 orderGateAdvisories 로
    // 강등(계산 유지·채널만 변경). 단어수 하한은 남긴다 —
    // 지문이 줄 수 없는 것을 요구하지 않는다(26-07-27 실사용 신고 근거).
    // 짧은 지문에서는 도달 불가능한 요구가 되어 재시도해도 같은 사유로 죽으므로,
    // 지문이 실제로 감당할 수 있는 만큼으로 하한을 낮춘다(예산 완화식 유지).
    const budgetWords = Math.max(1, countWords(passage) - 12);
    const minWords =
      budgetWords >= ORDER_GATE_MIN_PARAGRAPH_WORDS * 3
        ? ORDER_GATE_MIN_PARAGRAPH_WORDS
        : Math.max(8, Math.floor(budgetWords / 3 / 2));
    if (words < minWords) {
      v.push(`단락 ${p.label} 이 ${words}단어 (${minWords}단어 이상 필요)`);
    }
  }

  // #5 분량 균형 — 한 조각만 길면 분량으로 답이 드러난다(validators:182-200 등가).
  if (paragraphWords.every((w) => w > 0)) {
    const avg = paragraphWords.reduce((a, b) => a + b, 0) / paragraphWords.length;
    const spread = Math.max(...paragraphWords) / Math.min(...paragraphWords);
    if (spread > ORDER_GATE_MAX_PARAGRAPH_WORD_RATIO) {
      v.push(`단락 분량 불균형 (${paragraphWords.join("/")}단어 — 최대/최소 ${ORDER_GATE_MAX_PARAGRAPH_WORD_RATIO} 이하 필요)`);
    }
    // 변형 시에도 축자본 단어 수로 함께 잰다(둘 중 큰 쪽 기준 — 양축 상한).
    if (givenWords > 0 && givenWords / avg > ORDER_GATE_MAX_GIVEN_TO_AVG_PARAGRAPH_RATIO) {
      v.push(`${GIVEN_KEY}(${givenWords}단어)이 단락 평균(${Math.round(avg)}단어) 대비 너무 김`);
    }
  }

  // ── #6 최강 불변식: 주어진 글 + 원문 순서 단락 == 지문 전체 ──────────────
  const { spans, missing } = locateOrderChunks(passage, [
    { key: GIVEN_KEY, text: q.given },
    ...q.paragraphs.map((p) => ({ key: p.label, text: p.text })),
  ]);
  let sourceOrder: string[] = [];
  for (const key of missing) v.push(`${key} 이(가) 지문 축자 분할이 아님 — 원문에서 그대로 찾을 수 없음(단어를 고쳐 썼거나 문장을 합침)`);
  if (missing.length === 0) {
    const folded = foldForOrderMatch(passage);
    const sorted = [...spans].sort((a, b) => a.start - b.start);
    const tokens = (from: number, to: number) => countFoldTokens(folded.slice(from, to));
    const tail = tokens(sorted[sorted.length - 1].end, folded.length);
    let contiguous = true;
    if (sorted[0].key !== GIVEN_KEY) v.push(`${GIVEN_KEY}이 지문 맨 앞 조각이 아님 — 원문 순서상 ${sorted[0].key} 이(가) 앞선다`);
    if (sorted[0].start > 0) {
      v.push(`지문 앞부분 ${tokens(0, sorted[0].start)}단어가 어느 조각에도 실리지 않음`);
      contiguous = false;
    }
    for (let i = 1; i < sorted.length; i += 1) {
      const [prev, cur] = [sorted[i - 1], sorted[i]];
      if (cur.start < prev.end) {
        v.push(`${prev.key} 와 ${cur.key} 가 원문의 같은 구간을 중복 사용`);
        contiguous = false;
      } else if (cur.start > prev.end + 1) {
        v.push(`${prev.key} 와 ${cur.key} 사이 원문 ${tokens(prev.end, cur.start)}단어 유실`);
        contiguous = false;
      }
    }
    if (tail > 0) {
      v.push(`지문 끝 ${tail}단어가 어느 조각에도 실리지 않음 — 지문 전체를 네 조각으로 나눠야 한다`);
      contiguous = false;
    }
    sourceOrder = sorted.filter((s) => s.key !== GIVEN_KEY).map((s) => s.key);

    // #6-b 절단선 위생 — 분할이 무손실임이 증명된 뒤에만(진단 중복 방지) 이음매가
    // **문장 경계**인지 원문 좌표에서 확인한다. 문장 한가운데 절단은 #6 으로는 절대
    // 보이지 않는다(중간 절단도 무손실 분할이다) — 실제로 쉼표 뒤를 자른 md 가
    // 게이트 13종·품질 검증기·어댑터를 전부 통과해 저장·인쇄까지 갔다(적대검수 실증).
    // fast 의 sentence-order-dependent-fragment(RELAXED_BLOCKING)가 잡던 자리다.
    if (contiguous) {
      const bounds = orderSourceBounds(passage, sorted);
      for (let i = 0; i < bounds.length; i += 1) {
        const b = bounds[i];
        if (i > 0) {
          const seam = passage.slice(bounds[i - 1].end, b.start);
          if (!/[.!?]/.test(seam)) {
            v.push(
              `${bounds[i - 1].key} 와 ${b.key} 의 경계가 문장 경계가 아님 — 이음매 '${seam.trim() || "(공백)"}' 에 문장 종결부호가 없다. 절단은 마침표 뒤에서만 하라`,
            );
            continue;
          }
          // 이음매의 마침표가 **약어의 것**이면 그것은 문장 끝이 아니다.
          const abbrev = seam.startsWith(".")
            ? passage.slice(Math.max(0, bounds[i - 1].end - 10), bounds[i - 1].end).match(/[A-Za-z.]+$/)?.[0] ?? ""
            : "";
          if (NON_TERMINAL_ABBREVIATIONS.has(abbrev.toLowerCase())) {
            v.push(
              `${bounds[i - 1].key} 이(가) 약어 '${abbrev}.' 에서 끝남 — 그 마침표는 문장 끝이 아니다. 절단은 문장이 실제로 끝나는 자리에서만 하라`,
            );
            continue;
          }
        }
        const opener = passage.slice(b.start, b.end).replace(/^[^\p{L}\p{N}]+/u, "");
        const first = opener.match(/^[A-Za-z]/)?.[0];
        if (first && first === first.toLowerCase() && !LOWERCASE_OPENER_EXEMPT.test(opener)) {
          v.push(
            `${b.key} 이(가) 소문자 '${opener.slice(0, 14)}' 로 시작 — 문장 한가운데를 잘랐다. 절단은 문장 경계에서만 하라`,
          );
        }
      }
    }
  }

  // #7 선지 5개 · 전부 유효 순열 · 중복 없음
  if (q.options.length !== 5) v.push(`선지 ${q.options.length}개 (5개 필요)`);
  const seenOrders = new Set<string>();
  for (const o of q.options) {
    if (o.order.length !== 3) {
      v.push(`선지 ${o.label} 가 (A)(B)(C) 순열이 아님: '${o.text.slice(0, 40)}'`);
      continue;
    }
    const key = orderPermutationText(o.order);
    if (seenOrders.has(key)) v.push(`선지 순열 중복: ${key}`);
    seenOrders.add(key);
  }
  if (q.options.map((o) => o.label).join("") !== ORDER_CIRCLED.slice(0, q.options.length)) {
    v.push("선지 번호가 ①~⑤ 순서가 아님");
  }

  // #8 정답 라벨 · 결정론 도출 대조 (md 만 가능한 도약 — 구형은 스키마를 신뢰했다)
  const answerOption = q.options.find((o) => o.label === q.answer);
  if (!q.answer) v.push("정답 누락");
  else if (!answerOption) v.push(`정답 라벨(${q.answer})이 선지에 없음`);
  else if (answerOption.order.length !== 3) v.push("정답 선지가 유효한 순열이 아님");
  else {
    const claimed = orderPermutationText(answerOption.order);
    // #9 표시 순서 그대로 찍어 맞히는 문항 금지(validators:963 승격).
    if (claimed === "(A)-(B)-(C)") v.push("정답이 표시 순서 (A)-(B)-(C) — 라벨을 섞어 재배치하라");
    if (sourceOrder.length === 3) {
      const derived = orderPermutationText(sourceOrder);
      if (derived !== claimed) {
        v.push(`정답 불일치 — 원문 순서는 ${derived} 인데 정답은 ${claimed} 로 표시됨`);
      }
      // #10 공짜 소거 개시어는 26-08-22 기출 전수 실측으로 **비차단 강등** — 기출
      // 258 중 99건(38.4%)이 발화했다(but 27·however 15·for example 10…, 2023 수능
      // 37번 'Therefore' 실물 포함). "비첫자리 2단락 둘 다 개시어" 복합 조건으로
      // 좁혀도 기출 10건(3.9%)이라 어떤 임계·복합 조건도 오반려 0%가 안 된다 —
      // 연결사·지시사 개시는 기출의 정상 패턴이다. 판정 계산은 orderGateAdvisories
      // 가 그대로 갖고 있다(채널만 변경). 절단선 지시는 프롬프트 레버로만 한다.
    }
  }

  // ── #11 단락 변형(2단 출력) 계약 — 라벨 순서대로 앞에서 variation 개 단락에만
  // 변형 줄이 붙는다. 축자 줄은 그대로 남아 #4~#6·#13 을 전부 통과해야 하므로 이 축이
  // 켜져도 정답 키 검증(무손실 축자 분할·원문 순서 도출)은 조금도 약해지지 않는다.
  const gotVariantLabels = q.variants.map((x) => x.label).join("");
  const needVariantLabels = ORDER_LABELS.slice(0, variation).join("");
  if (gotVariantLabels !== needVariantLabels) {
    if (variation === 0) v.push(`단락 변형 설정이 꺼져 있는데 변형본 줄이 출력됨: ${gotVariantLabels}`);
    else if (!gotVariantLabels) v.push(`단락 변형 설정(${variation}개)인데 '단락(A,변형):' 줄이 없음`);
    else v.push(`단락 변형본 라벨이 ${needVariantLabels} 가 아님 — 실제 ${gotVariantLabels} (라벨 순서대로 앞에서 ${variation}개 단락에만 붙인다)`);
  }
  if (variation > 0) {
    for (const x of q.variants) v.push(...bodyHygieneIssues(`단락 ${x.label} 변형본`, x.text));
    v.push(...orderVariantIssues(q, passage, sourceOrder));
    // #4·#5 를 표시면에서 한 번 더 — 축자만 재던 종전 구현은 '표시면만 하한 미달·
    // 불균형' 문항을 통과시켰다(PASSTHROUGH 라 그대로 저장·인쇄된다).
    v.push(...orderDisplayShapeIssues(q));
  }

  // #12 해설·오답 블록 — 개수가 아니라 **라벨 집합**으로 검사한다. 개수만 세면
  // 중복 라벨(①②②⑤)이 통과하고, 어댑터의 Map 이 뒤 값으로 덮어써 해설 1건이 조용히
  // 소실되고 1건은 엉뚱한 내용으로 덮인다(PASSTHROUGH 라 후처리 보정도 없고 fast
  // 검증기의 wrong-option-explanation-count 는 이 유형에서 error 가 아니다).
  if (!q.explanation) v.push("해설 누락");
  if (requireWrong) {
    const optionLabels = q.options.map((o) => o.label);
    const got = q.wrong.map((w) => w.label);
    const dup = [...new Set(got.filter((l, i) => got.indexOf(l) !== i))];
    if (dup.length > 0) v.push(`오답해설 라벨 중복: ${dup.join("")} — 선지마다 정확히 한 줄씩 써라`);
    const alien = [...new Set(got.filter((l) => !optionLabels.includes(l)))];
    if (alien.length > 0) v.push(`오답해설에 선지에 없는 라벨: ${alien.join("")}`);
    // ⚠ '정답을 뺀 나머지' 기준의 개수·결손 진단은 **정답이 확정된 입력에서만** 낸다.
    //   정답 줄이 없거나 정답 라벨이 선지 밖이면 need 가 선지 5개 전부가 되어
    //   '오답해설 4개 (5개 필요)'·'누락 라벨 ③' 같은 거짓 진단이 #8 반려와 함께 나가
    //   재생성 프롬프트에 잘못된 요구를 주입한다(독립 프로브 실증 — 오통과는 아니고
    //   진단 노이즈). 형상이 깨진 입력의 진짜 결함은 #8 이 이미 말하고 있다.
    if (q.answer && optionLabels.includes(q.answer)) {
      const need = optionLabels.filter((l) => l !== q.answer);
      if (got.length !== need.length) v.push(`오답해설 ${got.length}개 (${need.length}개 필요)`);
      const lost = need.filter((l) => !got.includes(l));
      if (lost.length > 0) v.push(`오답해설 누락 라벨: ${lost.join("")}`);
      if (got.includes(q.answer)) v.push("오답해설에 정답 번호 포함");
    }
  }

  // #13 저장 형상 정합 — normalizeWs 축에서도 재구성이 성립하는지 최종 확인.
  // fold 는 구두점을 무시하므로, 스냅이 원문 문자를 복원했는지 여기서 본다(단어가
  // 옳다는 것은 #6 에서 이미 증명된 상태라 진단 문구를 분리한다).
  if (missing.length === 0 && sourceOrder.length === 3) {
    const byLabel = new Map(q.paragraphs.map((p) => [p.label, p.text]));
    const rebuilt = normalizeWs([q.given, ...sourceOrder.map((l) => byLabel.get(l) ?? "")].join(" "));
    if (rebuilt !== normalizeWs(passage)) {
      v.push("재구성 결과가 원문과 구두점 수준에서 어긋남 — 원문 문장부호를 그대로 옮겨라");
    }
  }

  return v;
}

/**
 * **비차단 권고** — 게이트가 반려하지 않고 잡 result(mdCorrections) 포렌식으로만
 * 남기는 항목. gate-summary-mc.ts 의 summaryMcGateAdvisories 선례 동형(26-08-22
 * 수술 규약: 계산은 유지하고 채널만 바꾼다). 레인은 게이트가 클린일 때만 호출한다 —
 * 반려 피드백 옆에 놓이면 소음이고, #8 대조(원문 순서 == 정답 라벨)가 선행돼야
 * answerOption.order[0] 을 "실제 첫 자리"로 믿을 수 있다.
 *
 * · #10 공짜 소거 개시어 — 기출 258 중 99건(38.4%) 발화(2023 수능 'Therefore' 실물
 *   포함), 복합 조건으로 좁혀도 3.9% → 차단 자격 없음(플레이북 §0). 판정 대상은
 *   차단 시절과 동일하게 **학생이 읽는 면**이다(variation>0 이면 변형본).
 * · #4 단락 문장수 2문장 권장 — 1문장 단락 보유 기출 39건(15.1%, 수능 실물 포함).
 *   관측 최소 1문장이 자연 하한이라 차단 임계가 존재하지 않는다. 짧은 지문 면제
 *   (문장 예산 6 미만)는 차단 시절 완화식 그대로다.
 */
export function orderGateAdvisories(
  q: MdOrderQuestion,
  passage: string,
  options?: GateMdSentenceOrderOptions,
): string[] {
  const variation = Math.max(0, Math.round(Number(options?.prefixVariationCount ?? 0)) || 0);
  const out: string[] = [];
  const answerOption = q.options.find((o) => o.label === q.answer);
  if (answerOption?.order.length === 3) {
    const firstLabel = answerOption.order[0];
    for (const p of variation > 0 ? orderDisplayParagraphs(q) : q.paragraphs) {
      if (p.label === firstLabel || !p.text) continue;
      const marker = freeEliminationMarker(p.text);
      if (marker) {
        out.push(
          `참고(비차단): 단락 ${p.label} 이 '${marker}' 로 시작해 첫 자리 후보에서 공짜로 소거됨 — 가능하면 절단 위치를 옮겨 첫 문장을 자립화하라`,
        );
      }
    }
  }
  const budgetSentences = Math.max(1, countDisplaySentences(passage) - 1);
  if (budgetSentences >= 6) {
    for (const p of q.paragraphs) {
      if (!p.text) continue;
      const sentences = countDisplaySentences(p.text);
      if (sentences < SENTENCE_ORDER_MIN_PARAGRAPH_SENTENCES) {
        out.push(
          `참고(비차단): 단락 ${p.label} 이 ${sentences}문장 — 지문이 허락하면 ${SENTENCE_ORDER_MIN_PARAGRAPH_SENTENCES}문장 이상이 바람직하다`,
        );
      }
    }
  }
  return out;
}
