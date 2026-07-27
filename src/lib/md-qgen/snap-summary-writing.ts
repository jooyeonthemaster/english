// ============================================================================
// 요약문 영작(SUMMARY_WRITING) 0원 자동 보정(스냅) + 0원 결정형 파생(미끼 = 잔여 칩).
// 파서: ./parser-summary-writing.ts · 게이트: ./gate-summary-writing.ts
//
// 파일 분할 근거(규범 §0 "파일 500줄 초과 금지 · 400줄에서 분할 검토"): 장식 관용을
// 넓히면서 파서(601줄)·게이트(536줄)가 상한을 넘겼다. 판독(파서)·보정과 파생(이 파일)·
// 검사(게이트)는 호출 시점도 의존도 다르므로 — 정본 굴절 매처를 쓰는 쪽이 여기다 —
// 이 경계에서 자른다. 의존 방향은 **스냅 → 파서** 한 방향뿐이다(파서는 의존성 0 유지).
//
// 미끼는 모델에게 받지 않고 파생한다: 보기 칩 중 어느 정답에도 소비되지 않는 칩이
// 정의상 미끼다(자기신고 목록은 거짓말이 가능하지만 잔여 파생은 불가능하다).
// 게이트와 어댑터가 **이 함수 하나**를 공유해야 저장값과 검사값이 갈리지 않는다.
//
// 보수 가드: 확실할 때만 교정하고, 애매하면 그대로 두어 게이트가 반려하게 한다.
// ============================================================================

import {
  summaryWritingWordTokens,
  wordBankChipCoversAnswerToken,
} from "@/lib/question-quality/validators/summary/writing";
import { normalizeWs } from "./parser";
import {
  summaryWritingAnswerTokens,
  type MdSummaryWritingQuestion,
} from "./parser-summary-writing";

const FULLWIDTH_LABEL_RE = /[(（]\s*([A-Ca-c])\s*[)）]/g;
const BLANK_RUN_AFTER_LABEL_RE = /(\([A-C]\))\s*(?:_{2,}|…+|\.{3,}|[-–—]{2,})/g;

/**
 * 표제어를 채점기가 실제로 매칭할 수 있는 형태로 정규화한다.
 *  ① 단어 단위·소문자·중복 제거 — grade.ts:58 은 `tokens.has(lemma)` 정확 일치만 본다.
 *     다단어 표제어("sample size")는 영원히 매칭되지 않아 LEMMA 채점이 전건 보류가 된다.
 *  ② 표면형 스냅 — 원형("collect")인데 정답엔 굴절형("collecting")뿐이면 역시 영원히
 *     매칭되지 않는다. **정본 매처 wordBankChipCoversAnswerToken** 으로 규칙 굴절(묵음
 *     e: increase↔increasing)·불규칙·파생을 흡수한다. 구식 접두 비교는 -e 동사를 전부
 *     놓쳐, 정본 fast 계약("표제어는 원형")을 지킨 정상 출력이 반려됐다(실측 major).
 *  ③ 그래도 못 붙으면 **드롭 + corrections 기록**(반려 아님). 단 전부 못 붙으면 원본을
 *     남겨 게이트가 자리를 지목하게 한다(철칙 3).
 */
function normalizeLemmas(
  raw: string[],
  surfaceTokens: string[],
): { lemmas: string[]; changed: boolean; dropped: string[] } {
  const out: string[] = [];
  const orphans: string[] = [];
  const dropped: string[] = [];
  let changed = false;
  const surface = new Set(surfaceTokens);
  for (const item of raw) {
    const tokens = summaryWritingAnswerTokens(item);
    if (tokens.length !== 1 || tokens[0] !== item) changed = true;
    for (const token of tokens) {
      let value = token;
      if (!surface.has(value)) {
        const hit = surfaceTokens.find((t) => wordBankChipCoversAnswerToken(t, value));
        if (hit) {
          value = hit;
          changed = true;
        } else {
          if (!orphans.includes(token)) orphans.push(token);
          continue;
        }
      }
      if (!out.includes(value)) out.push(value);
      else changed = true;
    }
  }
  if (out.length === 0) return { lemmas: orphans, changed, dropped };
  if (orphans.length > 0) {
    dropped.push(...orphans);
    changed = true;
  }
  return { lemmas: out, changed, dropped };
}

/**
 * 보기 칩 순서를 정답 어순에서 결정형으로 떼어 놓는다. fast 의 reorderChipsAwayFromAnswer
 * 대응물 — md 라우트에는 그 재배열이 없어(정찰 §9 #1) 레인이 직접 한다. 난수 없음.
 */
function reorderChipsAwayFromAnswerOrder(chips: string[]): string[] {
  const odd = chips.filter((_, i) => i % 2 === 1);
  const even = chips.filter((_, i) => i % 2 === 0);
  return [...odd.reverse(), ...even];
}

/** 칩 나열이 정답 토큰열의 연속 부분열인가(sw-wordbank-no-answer-order 동형). */
export function chipsFollowAnswerOrder(
  chips: string[],
  answerSequence: string,
): boolean {
  if (chips.length < 2) return false;
  const tokenize = (value: string): string[] =>
    (value.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) ?? []).map((t) => t.toLowerCase());
  const bank = chips.flatMap((chip) => tokenize(chip)).join(" ");
  const answer = tokenize(answerSequence).join(" ");
  return Boolean(bank && answer && answer.includes(bank));
}

/**
 * 0원 자동 보정.
 *  S1 요약문 라벨 표기 정규화(전각·소문자 → `(A)`).
 *  S2 요약문 라벨 뒤 빈칸선 제거 — 저장 정본은 라벨만이고 밑줄은 표시 계층
 *     (summaryWritingMaskedSummary)이 붙인다. 남기면 라벨 개수 검사에 잡티가 낀다.
 *  S3 동치 목록에서 정답과 같은 항목 제거(무의미 중복).
 *  S4 표제어 토큰화·표면형 스냅·미대응 드롭(normalizeLemmas 주석 참조).
 *  S5 보기 칩이 정답 어순 그대로면 결정형 재배열.
 */
export function autoSnapSummaryWriting(
  q: MdSummaryWritingQuestion,
): { question: MdSummaryWritingQuestion; corrections: string[] } {
  const corrections: string[] = [];

  let summary = q.summary;
  const normalizedLabels = summary.replace(
    FULLWIDTH_LABEL_RE,
    (_full, key: string) => `(${key.toUpperCase()})`,
  );
  if (normalizedLabels !== summary) {
    corrections.push("요약문 빈칸 라벨 표기를 (A) 정본으로 정규화");
    summary = normalizedLabels;
  }
  const withoutRuns = summary.replace(BLANK_RUN_AFTER_LABEL_RE, "$1");
  if (withoutRuns !== summary) {
    corrections.push("요약문 라벨 뒤 빈칸선 제거 (표시 계층이 부착)");
    summary = withoutRuns
      .replace(/\s+/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .trim();
  }

  let droppedVariants = 0;
  let lemmaFixed = 0;
  const droppedLemmas: string[] = [];
  const blanks = q.blanks.map((blank) => {
    const answerKey = normalizeWs(blank.answer).toLowerCase();
    const seen = new Set<string>();
    const variants: string[] = [];
    for (const variant of blank.variants) {
      const key = normalizeWs(variant).toLowerCase();
      if (!key || key === answerKey || seen.has(key)) {
        droppedVariants += 1;
        continue;
      }
      seen.add(key);
      variants.push(variant);
    }
    const surfaceTokens = [
      ...summaryWritingAnswerTokens(blank.answer),
      ...variants.flatMap((variant) => summaryWritingAnswerTokens(variant)),
    ];
    const { lemmas, changed, dropped } = normalizeLemmas(blank.lemmas, surfaceTokens);
    if (changed) lemmaFixed += 1;
    if (dropped.length > 0) {
      droppedLemmas.push(...dropped.map((d) => `${blank.label} '${d}'`));
    }
    return { ...blank, variants, lemmas };
  });
  if (droppedVariants > 0) {
    corrections.push(`동치 정답 ${droppedVariants}개 제거(정답과 중복)`);
  }
  if (lemmaFixed > 0) {
    corrections.push(
      `핵심어 ${lemmaFixed}곳을 단어 단위 소문자 + 정답 표면형으로 정규화(채점기 토큰 대조용)`,
    );
  }
  if (droppedLemmas.length > 0) {
    corrections.push(
      `핵심어 ${droppedLemmas.join(", ")} 을(를) 드롭 — 정답 어구에 대응 형태가 없어 어떤 학생도 만족할 수 없는 조건이라 반려 대신 제거`,
    );
  }

  let chips = q.chips;
  if (chips.length >= 2) {
    const answerSequence = blanks.map((b) => b.answer).join(" ");
    if (chipsFollowAnswerOrder(chips, answerSequence)) {
      const reordered = reorderChipsAwayFromAnswerOrder(chips);
      if (!chipsFollowAnswerOrder(reordered, answerSequence)) {
        corrections.push("보기 칩 나열이 정답 어순이라 결정형으로 재배열");
        chips = reordered;
      }
    }
  }

  return { question: { ...q, summary, blanks, chips }, corrections };
}

// ── 결정형 파생: 미끼(잔여 칩) ───────────────────────────────────────────────

interface PoolToken {
  chip: number;
  token: string;
}

function stripPossessive(token: string): string {
  return token.replace(/['’]s$/, "");
}

function buildPool(chips: string[]): PoolToken[] {
  const pool: PoolToken[] = [];
  chips.forEach((chip, index) => {
    for (const token of summaryWritingWordTokens(chip)) {
      pool.push({ chip: index, token });
    }
  });
  return pool;
}

/** 정본 consumeCandidateFromPool 과 동형(정확일치 1패스 → 어형변화 2패스). */
function consumeCandidate(
  answerTokens: string[],
  pool: PoolToken[],
): { missing: number; leftover: PoolToken[]; used: number[] } {
  const remaining = [...pool];
  const used: number[] = [];
  const deferred: string[] = [];
  for (const token of answerTokens) {
    const i = remaining.findIndex(
      (entry) => stripPossessive(entry.token) === stripPossessive(token),
    );
    if (i >= 0) {
      used.push(remaining[i].chip);
      remaining.splice(i, 1);
    } else {
      deferred.push(token);
    }
  }
  let missing = 0;
  for (const token of deferred) {
    const i = remaining.findIndex((entry) =>
      wordBankChipCoversAnswerToken(token, entry.token),
    );
    if (i >= 0) {
      used.push(remaining[i].chip);
      remaining.splice(i, 1);
    } else {
      missing += 1;
    }
  }
  return { missing, leftover: remaining, used };
}

/**
 * 보기 칩 중 어느 빈칸 정답에도 소비되지 않는 칩 = 미끼.
 * 정본 findUnbuildableWordBankBlanks 와 같은 순서·같은 매칭 규칙으로 공유 풀을 소비한다.
 * 칩 하나라도 토큰이 소비되면 "쓰인 칩" 으로 본다(청크 칩의 부분 소비 = 사용으로 간주).
 */
export function deriveSummaryWritingDistractors(
  chips: string[],
  blanks: { answer: string; variants: string[] }[],
): string[] {
  if (chips.length === 0) return [];
  let pool = buildPool(chips);
  const used = new Set<number>();
  for (const blank of blanks) {
    const candidates = [blank.answer, ...blank.variants].filter(Boolean);
    let best: { missing: number; leftover: PoolToken[]; used: number[] } | null = null;
    for (const candidate of candidates) {
      const tokens = summaryWritingWordTokens(candidate);
      if (tokens.length === 0) continue;
      const result = consumeCandidate(tokens, pool);
      if (best === null || result.missing < best.missing) best = result;
      if (result.missing === 0) break;
    }
    if (!best) continue;
    for (const index of best.used) used.add(index);
    pool = best.leftover;
  }
  return chips.filter((_, index) => !used.has(index));
}
