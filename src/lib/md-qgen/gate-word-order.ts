// ============================================================================
// 배열 영작(WORD_ORDER) 0원 자동 보정(스냅) + 0원 결정형 게이트 — LLM 콜 없음
// (토큰 회계·정규식만). 규범 §1 [6] 이 스냅과 게이트를 한 계약 단계로 묶는다.
// parser-word-order.ts 에서 분리(파일 500줄 규약). 의존 방향은
// gate-word-order → parser-word-order 단방향이다.
//
// ⚠ 이 유형은 PASSTHROUGH_TYPES 다(question-postprocess/types.ts:80) — 후처리가
//   아무것도 만들어 주지 않고, md-stream 라우트는 품질 검증기 결과를 **기록만**
//   하고 차단하지 않는다. 즉 여기서 못 잡은 결함은 학생 화면·인쇄물까지 그대로
//   간다. 그래서 fast 검증기의 치명 코드를 게이트로 승격 이식했다:
//     punctuation-only-chunk · scrambled-already-solved ·
//     scrambled-near-answer-order · word-order-unreconstructable ·
//     word-order-accepted-unreconstructable · writing-answer-verbatim-copy ·
//     explanation-quoted-token-missing
//   (전자 5개는 dispatcher.ts:1129-1156 + validators/word-order.ts, verbatim 은
//    dispatcher.ts:1072-1090, 인용 실재는 validators/explanation-quoted-tokens.ts)
//
// 게이트 메시지는 **자리를 지목**한다(§1-B 철칙5) — 이 문구가 그대로 재생성
// 프롬프트의 [반려 재생성] 피드백으로 실린다.
// ============================================================================

import {
  answerRunInPassage,
  containsHangul,
  containsLatinLetter,
  normalizeComparableText,
  summaryWritingComparableTokens,
} from "@/lib/question-quality/core";
import { wordOrderComparableTokens } from "@/lib/question-quality/validators/word-order";
import { findExplanationQuotedTokenIssue } from "@/lib/question-quality/validators/explanation-quoted-tokens";
import { chipsAreInAnswerOrder } from "@/lib/topic-sentence-writing";
import { normalizeWs } from "./parser";
import {
  WORD_ORDER_MD_ANSWER_CHUNK_MAX,
  WORD_ORDER_MD_ANSWER_CHUNK_MIN,
  WORD_ORDER_MD_ANSWER_TOKEN_MIN,
  WORD_ORDER_MD_CHIP_MAX,
  WORD_ORDER_MD_CHIP_MIN,
} from "./prompts-word-order";
import {
  arrangeWordOrderChips,
  chipsRevealAnswerOrder,
  deriveWordOrderDistractors,
  wordOrderAccounting,
  wordOrderAnswerChips,
  wordOrderTokenMultiset,
  type MdWordOrderQuestion,
} from "./parser-word-order";

export interface GateMdWordOrderOptions {
  /** 미끼 최소 개수 — BASIC/INTERMEDIATE 1, KILLER 2 (fast 프롬프트 계약 동형) */
  distractorMin?: number;
  chipMin?: number;
  chipMax?: number;
  answerChunkMin?: number;
  answerChunkMax?: number;
}

/** dispatcher.ts:1130 punctuation-only-chunk 와 동일 판정. */
const PUNCTUATION_ONLY = /^[^\wA-Za-z]+$/;

/**
 * 값 **가장자리**의 마크업 잔재 — 영어 산문의 첫·끝 글자로는 나오지 않는 문자만 골랐다
 * (오검출 0). 파서가 장식을 공유 유틸(decoration.ts)로 단일화한 뒤로 정상 파싱 경로에서는
 * 발화하지 않는다 — 이 검사는 **파서를 우회한 형상**(어댑터 단독 호출·구제 경로)의 최후
 * 방어다. 그 한 글자가 채점 correctAnswer 에 남으면 **정답을 정확히 쓴 학생 전원이 오답**
 * 이 된다(normalizeText 가 지우지 않는다). 토큰 회계는 이 문자를 버려 #7·#7b 는 늘
 * 클린이라, 이 축이 없으면 사고가 끝까지 은폐된다. */
const MARKUP_EDGE = /^[|*_`~]|[|*_`~]$/;

function preview(value: string, max = 40): string {
  const text = normalizeWs(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function tokenList(tokens: string[], max = 6): string {
  return [...new Set(tokens)]
    .slice(0, max)
    .map((t) => `"${t}"`)
    .join(", ");
}

/**
 * **단어 내부 구두점을 살린** 토큰 — `and/or` · `km/h` · `3/4` 를 한 덩어리로 본다.
 * wordOrderComparableTokens 는 이런 문자를 버리므로, 칩이 슬래시에서 조용히
 * 쪼개져도 토큰 회계(#7)는 원리상 클린이다. 그 사각을 이 축으로 막는다.
 * 문말 마침표처럼 **단어 사이가 아닌** 구두점은 애초에 토큰에 들어오지 않아,
 * 칩이 종결부호를 안 달고 오는 정상 드리프트는 오검출하지 않는다.
 */
function wordOrderTightTokens(value: string): string[] {
  const normalized = normalizeComparableText(value);
  if (!normalized) return [];
  return normalized.match(/[a-z0-9]+(?:[^\sa-z0-9]+[a-z0-9]+)*/g) ?? [];
}

/** 0원 결정형 게이트 — 빈 배열이면 클린. */
export function gateMdWordOrder(
  q: MdWordOrderQuestion,
  passage: string,
  options?: GateMdWordOrderOptions,
): string[] {
  const distractorMin = Math.max(0, Math.round(Number(options?.distractorMin ?? 1)) || 0);
  const chipMin = options?.chipMin ?? WORD_ORDER_MD_CHIP_MIN;
  const chipMax = options?.chipMax ?? WORD_ORDER_MD_CHIP_MAX;
  const chunkMin = options?.answerChunkMin ?? WORD_ORDER_MD_ANSWER_CHUNK_MIN;
  const chunkMax = options?.answerChunkMax ?? WORD_ORDER_MD_ANSWER_CHUNK_MAX;
  const v: string[] = [];

  // ── #1 필드 존재 — 모범답안·칩이 없으면 이후 검사가 전부 무의미하다 ──────────
  // 메시지는 **신형식의 자리**를 지목한다(§1-B 철칙5) — 칩은 별도 줄이 아니라
  // `모범답안:` 줄의 ` / ` 청크 경계에서 나온다.
  if (!q.modelAnswer) {
    return [
      "모범답안 줄을 인식할 수 없음 — `모범답안: <청크1 / 청크2 / ...>` 한 줄이 필요하다",
    ];
  }
  if (q.chips.length === 0) {
    return [
      "모범답안 줄에 청크 경계가 없음 — 정답 문장을 ` / ` 로 끊어 `모범답안: Spreading faster / than regulators could respond, / the norms` 처럼 써라",
    ];
  }

  const answerTokens = wordOrderComparableTokens(q.modelAnswer);

  // ── #2 모범답안 형식 — 영어 완성 문장 ────────────────────────────────────────
  if (containsHangul(q.modelAnswer)) {
    v.push(`모범답안에 한글이 섞임: '${preview(q.modelAnswer)}' — 영어 완성 문장이어야 한다`);
  }
  if (!containsLatinLetter(q.modelAnswer)) {
    v.push("모범답안에 영어가 없음 — 영어 완성 문장이어야 한다");
  }
  if (answerTokens.length < WORD_ORDER_MD_ANSWER_TOKEN_MIN) {
    v.push(
      `모범답안이 ${answerTokens.length}단어 (${WORD_ORDER_MD_ANSWER_TOKEN_MIN}단어 이상 필요) — 배열 과제가 성립하지 않는다`,
    );
  }
  if (MARKUP_EDGE.test(q.modelAnswer.trim())) {
    v.push(
      `모범답안 가장자리에 장식 기호가 남음: '${preview(q.modelAnswer)}' — 라벨 뒤에는 맨 값만 써라(감싼 기호가 그대로 채점 문자열이 되어 정답을 맞힌 학생이 오답 처리된다)`,
    );
  }

  // ── #3 칩 형식 — 개수·구두점 전용·과대 청크 ─────────────────────────────────
  if (q.chips.length < chipMin || q.chips.length > chipMax) {
    v.push(`칩 ${q.chips.length}개 (${chipMin}~${chipMax}개 필요)`);
  }
  for (const chip of q.chips) {
    if (!chip.trim()) {
      v.push("빈 칩이 있음 — ` / ` 구분자를 연달아 쓰지 마라");
      continue;
    }
    if (PUNCTUATION_ONLY.test(chip.trim())) {
      v.push(`구두점만 있는 칩: '${chip.trim()}' — 구두점은 앞뒤 의미 단위에 붙여라`);
    }
    if (containsHangul(chip)) {
      v.push(`칩에 한글이 섞임: '${preview(chip)}' — 칩은 영어여야 한다`);
    }
    if (MARKUP_EDGE.test(chip.trim())) {
      v.push(`칩 가장자리에 장식 기호가 남음: '${preview(chip)}' — 칩을 굵게·기울임·표 칸으로 감싸지 마라`);
    }
  }

  // ── #4 미끼 ─────────────────────────────────────────────────────────────────
  // 신형식에서 미끼는 칩에 **추가되는** 새 칩이라 실재 검사가 구조적으로 자명하다.
  // 이 검사는 구형(`칩:` 줄) 폴백 경로를 계속 지킨다.
  const chipSet = new Set(q.chips);
  for (const d of q.distractors) {
    if (!chipSet.has(d)) {
      v.push(`미끼 '${preview(d)}' 가 칩 목록에 없음 — 칩에 실재하는 문자열을 그대로 다시 적어라`);
    }
  }
  if (q.distractors.length < distractorMin) {
    v.push(
      `미끼 ${q.distractors.length}개 (${distractorMin}개 이상 필요) — 미끼가 없으면 "칩을 순서대로 전부 쓰기"가 되어 함정 설계가 사라진다`,
    );
  }
  // 미끼가 정답 청크와 축자 동일하면 학생 화면에 **똑같은 칩 두 개**가 나간다
  // (신형식은 미끼를 칩에 더하므로 새로 가능해진 실패 모드다). 어느 쪽을 써도
  // 정답이 되므로 함정이 아니라 잡음이고, 중복 칩은 배열 UI 에서 오조작을 부른다.
  const answerChipSet = new Set(wordOrderAnswerChips(q.chips, q.distractors));
  for (const d of new Set(q.distractors)) {
    if (answerChipSet.has(d)) {
      v.push(`미끼 '${preview(d)}' 가 정답 청크와 동일 — 같은 칩이 두 번 제시된다. 다른 미끼로 바꿔라`);
    }
  }

  // ── #5 정답 청크 개수 ───────────────────────────────────────────────────────
  const answerChunkCount = q.chips.length - q.distractors.length;
  if (answerChunkCount < chunkMin || answerChunkCount > chunkMax) {
    v.push(
      `정답 청크 ${answerChunkCount}개 (칩 ${q.chips.length} − 미끼 ${q.distractors.length}, ${chunkMin}~${chunkMax}개 필요)`,
    );
  }

  // ── #6 과대 청크 — 한 칩이 정답의 절반을 넘게 담으면 배열 과제가 사라진다 ────
  if (answerTokens.length >= WORD_ORDER_MD_ANSWER_TOKEN_MIN) {
    const distractorSet = new Set(q.distractors);
    for (const chip of q.chips) {
      if (distractorSet.has(chip)) continue;
      const n = wordOrderComparableTokens(chip).length;
      if (n * 2 > answerTokens.length) {
        v.push(
          `칩 '${preview(chip)}' 가 정답 ${answerTokens.length}단어 중 ${n}단어를 담음 — 한 칩은 정답의 절반을 넘지 못한다`,
        );
      }
    }
  }

  // ── #7 재구성 회계(word-order-unreconstructable 승격) ───────────────────────
  // (칩 − 선언미끼) 멀티셋이 modelAnswer 를 과부족 0 으로 덮어야 한다. fast 는
  // 잉여를 관용하지만(미선언 미끼와 구분 불가라서), md 는 스냅이 미끼를 결정론
  // 재도출하므로 **양방향**으로 조인다 — 미선언 미끼가 남는 것도 결함이다.
  const { missing, surplus } = wordOrderAccounting(q.chips, q.distractors, q.modelAnswer);
  if (missing.length > 0) {
    v.push(
      `칩으로 모범답안을 조립할 수 없음 — 부족 토큰 ${tokenList(missing)}. 모범답안을 남김없이 칩으로 쪼개라`,
    );
  }
  if (surplus.length > 0) {
    v.push(
      `칩에서 미끼를 뺀 뒤에도 남는 토큰 ${tokenList(surplus)} — 선언하지 않은 미끼가 있다. 그 칩을 \`미끼:\` 줄에 전부 적어라`,
    );
  }

  // ── #7b 문자 단위 커버(단어 내부 구두점) ────────────────────────────────────
  // #7 은 wordOrderComparableTokens 기준이라 `and/or` → [and][or] 처럼 **칩 안의
  // 슬래시가 사라지는** 손실을 원리상 못 본다. 그 상태로 출하되면 학생이 칩을
  // 정답 순서로 남김없이 배열해도 `and or` ≠ `and/or` 라 전원 오답이 된다.
  if (missing.length === 0 && surplus.length === 0) {
    const shown = wordOrderTokenMultiset(
      wordOrderTightTokens(wordOrderAnswerChips(q.chips, q.distractors).join(" ")),
    );
    const wanted: string[] = [];
    for (const token of wordOrderTightTokens(q.modelAnswer)) {
      const left = shown.get(token) ?? 0;
      if (left > 0) shown.set(token, left - 1);
      else wanted.push(token);
    }
    if (wanted.length > 0) {
      v.push(
        `칩을 이어 붙여도 모범답안의 ${tokenList(wanted)} 를 만들 수 없음 — 단어 안의 기호(and/or · km/h)는 구분자가 아니다. 그 조각을 한 칩으로 붙여라`,
      );
    }
  }

  // ── #8 어순 누수(scrambled-already-solved / near-answer-order 승격) ─────────
  // fast 의 두 검사는 다단어 청크 설계에서 사각이 있다 — chipsRevealAnswerOrder 가
  // "미끼만 건너뛰면 정답 문장이 그대로 나오는" 실질 누수를 직접 잡는다.
  if (chipsRevealAnswerOrder(q.chips, q.distractors, q.modelAnswer)) {
    v.push(
      q.distractors.length > 0
        ? "미끼를 빼고 칩을 왼→오로 읽으면 정답 문장이 그대로 나옴 — 정답 칩의 상대 순서를 흐트러뜨려라"
        : "칩이 정답 어순 그대로 나열됨 — 왼쪽에서 오른쪽으로 읽기만 하면 풀린다",
    );
  } else if (chipsAreInAnswerOrder(q.chips, q.modelAnswer)) {
    v.push("칩 배열이 정답 어순에 가까움(왼→오 읽기로 풀림) — 정답 어순에서 더 멀리 섞어라");
  }

  // ── #9 지문 verbatim 복사(writing-answer-verbatim-copy 승격, §9 #5) ─────────
  // 이 유형은 원본 지문이 문항 안에 INLINE 으로 함께 노출된다
  // (taking-parts/question-view.tsx PASSAGE_CONTENT_SUBTYPES). 모범답안이 지문
  // 문장의 사실상 통째 복사면 학생이 베껴 써서 영작이 무력화된다 — 실측 fatal
  // (runIndex 47/48). SALVAGE_RELAXABLE 에서도 명시 제외된 F급 결함이다.
  if (passage) {
    const phraseTokens = summaryWritingComparableTokens(q.modelAnswer);
    if (phraseTokens.length >= 6) {
      const run = answerRunInPassage(
        q.modelAnswer,
        passage,
        Math.max(6, Math.ceil(phraseTokens.length * 0.8)),
      );
      if (run) {
        v.push(
          `모범답안이 지문 문장의 통째 복사입니다: "${preview(run, 60)}". 시제·태·구문 전환을 최소 1개 넣어 다시 설계하라`,
        );
      }
    }
  }

  // ── #10 허용답 멀티셋(word-order-accepted-unreconstructable 승격, §9 #2) ────
  // 자동채점이 이 집합을 정확일치로 흡수한다(grade.ts:50) — 칩으로 못 만드는
  // 허용답은 **오답을 정답으로 흡수**하는 되돌릴 수 없는 채점 사고다.
  const answerMultiset = wordOrderTokenMultiset(answerTokens);
  for (const accepted of q.acceptedAnswers) {
    const acceptedTokens = wordOrderComparableTokens(accepted);
    if (acceptedTokens.length === 0) {
      v.push(`허용답 '${preview(accepted)}' 에 영어 단어가 없음`);
      continue;
    }
    const acceptedMultiset = wordOrderTokenMultiset(acceptedTokens);
    const extra: string[] = [];
    const short: string[] = [];
    for (const token of new Set([...acceptedMultiset.keys(), ...answerMultiset.keys()])) {
      const inAccepted = acceptedMultiset.get(token) ?? 0;
      const inModel = answerMultiset.get(token) ?? 0;
      if (inAccepted > inModel) extra.push(token);
      else if (inAccepted < inModel) short.push(token);
    }
    if (extra.length > 0 || short.length > 0) {
      const detail = [
        extra.length > 0 ? `없는 칩을 요구: ${tokenList(extra)}` : "",
        short.length > 0 ? `정답 칩이 남음: ${tokenList(short)}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      v.push(
        `허용답 '${preview(accepted, 50)}' 이 제시 칩만으로 조립되지 않음 (${detail}) — 축약형·단어 치환은 허용답이 될 수 없다`,
      );
    }
  }

  // ── #11 힌트 — 한국어 한 줄 · 정답 누수 금지 ────────────────────────────────
  if (q.contextHint) {
    if (!containsHangul(q.contextHint)) {
      v.push(`힌트가 한국어가 아님: '${preview(q.contextHint)}' — 힌트는 한국어 한 줄이어야 한다`);
    }
    const leak = answerRunInPassage(q.modelAnswer, q.contextHint, 3);
    if (leak) {
      v.push(`힌트에 정답 표현이 그대로 노출됨: "${leak}" — 힌트는 문장의 역할만 가리켜라`);
    }
  }

  // ── #12 해설 ───────────────────────────────────────────────────────────────
  if (!q.explanation) {
    v.push("해설 누락 — `해설:` 줄에 한국어 2문장을 써라");
  } else if (!containsHangul(q.explanation)) {
    v.push("해설이 한국어가 아님 — 해설은 한국어로만 쓴다");
  } else {
    const quoted = findExplanationQuotedTokenIssue(
      {
        explanation: q.explanation,
        modelAnswer: q.modelAnswer,
        scrambledWords: q.chips,
        contextHint: q.contextHint,
        acceptedAnswers: q.acceptedAnswers,
      },
      passage,
    );
    if (quoted) v.push(quoted.message);

    // 해설에 **라틴 산문이 통째로** 실렸는가. 파서가 해설 뒤 꼬리 출력을 끊게 됐지만
    // (`발문: Rearrange the given words …` 흡수 실측), 모델이 같은 문장을 해설 줄
    // 안에 이어 쓰면 파싱만으로는 못 막는다. 문항 표면(정답·칩·허용답·지문)에
    // 실재하지 않는 6단어 이상 영어 연속은 인용이 아니라 유출로 본다.
    const alien = findAlienLatinRun(q, passage);
    if (alien) {
      v.push(`해설에 문항과 무관한 영어 문장이 섞임: "${alien}" — 해설은 한국어로만 쓰고 인용은 지문·정답 표현만 허용한다`);
    }
  }

  return v;
}

/** 소문자 단어열(구두점 무시) — 앞뒤 공백을 붙여 부분열 포함 판정에 쓴다. */
function latinWordSeq(value: string): string {
  return ` ${(normalizeComparableText(value).match(/[a-z]+/g) ?? []).join(" ")} `;
}

/**
 * 해설 안의 "표면에 없는" 라틴 연속(6단어 이상)을 찾는다. 없으면 "".
 * 비교는 **단어열**로만 한다 — 인용하며 쉼표를 흘리는 정상 드리프트를 유출로
 * 오검출하지 않기 위함이다(보수 가드: 애매하면 통과시킨다).
 */
function findAlienLatinRun(q: MdWordOrderQuestion, passage: string): string {
  const corpus = latinWordSeq(
    [q.modelAnswer, ...q.chips, ...q.acceptedAnswers, q.contextHint, passage].join(" "),
  );
  for (const run of q.explanation.match(/[A-Za-z][A-Za-z'’-]*(?:[ ,]+[A-Za-z][A-Za-z'’-]*)*/g) ?? []) {
    if (run.split(/[ ,]+/).filter(Boolean).length < 6) continue;
    if (!corpus.includes(latinWordSeq(run))) return preview(run, 60);
  }
  return "";
}

// ── 0원 자동 보정 ────────────────────────────────────────────────────────────

const TERMINAL_PUNCTUATION = /[.!?][")'”’\]]?\s*$/;

function foldChip(value: string): string {
  return normalizeWs(value).toLowerCase();
}

/**
 * 0원 자동 보정. 보수 가드: 확실할 때만 교정하고 애매하면 게이트가 반려하게 둔다.
 *
 * 1. 모범답안 종결부호 — 없으면 마침표. 채점 정규화(normalizeText)가 문말 구두점을
 *    제거하므로 채점 결과는 불변이고 표시면만 완성 문장이 된다.
 * 2. 미끼 문자열 — 칩과 대소문자·공백만 다르면 칩 축자로 갈아 끼우고, 칩에 아예
 *    없으면 버린다(§1-B 철칙3: 버린 사실을 corrections 로 남긴다). 신형식에서는
 *    미끼가 곧 칩이라 이 단계가 항상 축자 일치로 통과한다.
 * 3. 미끼 재도출 — 구형 폴백 전용. 과부족 0이 안 되면 칩·모범답안 대조로 다시 뽑는다.
 * 4. 허용답 절삭 — modelAnswer 와 토큰 멀티셋이 다른 원소는 **오답 흡수 사고**를
 *    만들므로(§9 #2) 버린다. 자동채점이 이 집합을 정확일치로 흡수한다.
 * 5. 칩 재배열 — fast 가 생성 후 하는 reorderChipsAwayFromAnswer 가 md 라우트에는
 *    없다(§9 #1). 스냅이 그 자리를 메워 게이트가 보는 칩과 어댑터가 싣는 칩을
 *    같게 만든다(멱등·칩 내용 불변).
 */
export function autoSnapWordOrderChips(q: MdWordOrderQuestion): {
  question: MdWordOrderQuestion;
  corrections: string[];
} {
  const corrections: string[] = [];

  // 1. 종결부호
  let modelAnswer = q.modelAnswer;
  if (modelAnswer && !TERMINAL_PUNCTUATION.test(modelAnswer)) {
    modelAnswer = `${modelAnswer.replace(/\s+$/, "")}.`;
    corrections.push("모범답안에 문장 종결부호(.)를 보정");
  }

  // 2. 미끼 문자열을 칩 축자로 정렬
  const chips = [...q.chips];
  const chipByFold = new Map<string, string>();
  for (const chip of chips) {
    const key = foldChip(chip);
    if (key && !chipByFold.has(key)) chipByFold.set(key, chip);
  }
  let distractors: string[] = [];
  for (const declared of q.distractors) {
    const exact = chips.find((c) => c === declared);
    if (exact !== undefined) {
      distractors.push(exact);
      continue;
    }
    const folded = chipByFold.get(foldChip(declared));
    if (folded !== undefined) {
      distractors.push(folded);
      corrections.push(`미끼 '${declared}' 를 칩 축자 '${folded}' 로 보정`);
      continue;
    }
    corrections.push(`미끼 '${declared}' 가 칩 목록에 없어 제외`);
  }

  // 3. 과부족 0이 아니면 미끼 재도출
  if (modelAnswer && chips.length > 0) {
    const { missing, surplus } = wordOrderAccounting(chips, distractors, modelAnswer);
    if (missing.length > 0 || surplus.length > 0) {
      const derived = deriveWordOrderDistractors(chips, modelAnswer);
      if (derived) {
        const before = distractors.join(" / ");
        distractors = derived;
        corrections.push(
          `미끼를 칩·모범답안 대조로 재도출 (선언 '${before || "없음"}' → '${derived.join(" / ") || "없음"}')`,
        );
      }
    }
  }

  // 4. 허용답 절삭 — 멀티셋이 다르면 버린다(오답 흡수 방지)
  const answerMultiset = wordOrderTokenMultiset(wordOrderComparableTokens(modelAnswer));
  const seenAccepted = new Set<string>([foldChip(modelAnswer)]);
  const acceptedAnswers: string[] = [];
  for (const entry of q.acceptedAnswers) {
    const fold = foldChip(entry);
    if (!fold || seenAccepted.has(fold)) continue; // 모범답안 자신·중복은 조용히 흡수
    const tokens = wordOrderComparableTokens(entry);
    const entryMultiset = wordOrderTokenMultiset(tokens);
    let same = tokens.length > 0 && entryMultiset.size === answerMultiset.size;
    if (same) {
      for (const [token, count] of answerMultiset) {
        if (entryMultiset.get(token) !== count) {
          same = false;
          break;
        }
      }
    }
    if (!same) {
      corrections.push(
        `허용답 '${entry.slice(0, 50)}' 이 모범답안과 같은 칩 조합이 아니어서 제외(오답 흡수 방지)`,
      );
      continue;
    }
    seenAccepted.add(fold);
    acceptedAnswers.push(entry);
  }

  // 5. 칩 재배열(fast 동형). 신형식은 칩이 정답 어순인 것이 **정상**이고 셔플이
  //    설계된 단계라 보정 기록을 남기지 않는다(전 문항 보정 이력 = 포렌식 오염).
  let orderedChips = chips;
  if (modelAnswer && chips.length > 1) {
    const leaked =
      chipsAreInAnswerOrder(chips, modelAnswer) ||
      chipsRevealAnswerOrder(chips, distractors, modelAnswer);
    orderedChips = arrangeWordOrderChips(chips, distractors, modelAnswer);
    if (leaked && !q.chunksFromAnswer) corrections.push("칩이 정답 어순으로 읽혀 결정론 재배열");
  }

  return {
    question: {
      ...q,
      modelAnswer,
      chips: orderedChips,
      distractors,
      acceptedAnswers,
    },
    corrections,
  };
}
