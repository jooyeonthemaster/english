// ============================================================================
// 핵심 표현 빈칸(FILL_BLANK_KEY) 0원 결정형 게이트 — LLM 콜 없음.
// 파서·스냅은 parser-fill-blank-key.ts (400줄 규칙 분리 — 1차 승차분 선례).
//
// 설계 원칙(§1-B 철칙5): **게이트 메시지는 자리를 지목한다.** 이 문구가 그대로
// 재생성 프롬프트의 피드백으로 실린다(md-stream route 의 [반려 재생성] 블록).
//
// 이식 근거 — 각 검사는 프로덕션에서 실제로 문항을 죽이는 코드의 결정형 대응물이다:
//   G4  fbk-missing-blank-marker         (validators/blank/fill-key.ts:97)
//   G5  fbk-multiple-blanks              (:26-31)
//   G6  fbk-frame-altered                (:120-138)  ← 이 유형 최강 게이트
//   G7/G8 fbk-answer-residual-leak       (:38-53)
//   G10 fbk-answer-skeleton-leak         (:139-151)
//   G16 explanation-quoted-token-missing (validators/explanation-quoted-tokens.ts:117)
// md-stream 은 qualityIssues 를 차단하지 않고 기록만 하므로, 위 코드들이 fast
// 폴백 경로에서 실제로 차단하는 불변식을 **여기서 결정형으로 잡아야** 한다.
// ============================================================================

import { containsHangul } from "@/lib/question-quality/core";
import {
  FILL_BLANK_KEY_MD_BLANK,
  FILL_BLANK_KEY_MD_QUOTE_WORD_MAX,
  FILL_BLANK_KEY_MD_WORD_MAX,
  FILL_BLANK_KEY_MD_WORD_MIN,
} from "./prompts-fill-blank-key";
import {
  answerBoundaryRegex,
  countFillBlankKeyAnswerOccurrences,
  fillBlankKeyComparable,
  restoreFillBlankKeySentence,
  type MdFillBlankKeyQuestion,
} from "./parser-fill-blank-key";

/** 프레임에 남아야 하는 최소 내용 단어 수 — 문맥이 정답을 지목할 최소 골격. */
const MIN_FRAME_WORDS = 4;
/** 한 문장 계약 상한 — 문단 통째 붙여넣기 차단. */
const MAX_SENTENCE_WORDS = 60;
/** 해설 계약은 '딱 2문장' — 넘으면 지문·군더더기가 섞인 것이다. */
const MAX_EXPLANATION_CHARS = 400;
/**
 * 해설이 지문을 이만큼 **연속으로** 옮겨 실으면 지문 재출력이다.
 *
 * ⚠ 20 이면 **정상 문항을 하드 반려한다**(실측). 프롬프트가 "지문 표현을 인용할 때는
 *   지문 축자 그대로 따옴표에 넣어라"라고 시키고 G16(환각 인용)이 축자성을 **요구**하는데,
 *   수능 수준 지문의 한 문장은 20~30단어가 예사다 — 프로브 지문의 근거 문장은 정확히
 *   20단어, 표적 문장은 21단어여서 그 문장을 통째로 인용한 정답·해설이 모두 옳은 문항이
 *   19단어면 통과·20단어면 반려라는 자의적 절벽에 걸렸다. 재생성 1회(OpenRouter 2콜)를
 *   태우고, 피드백이 '지문을 재출력하지 마라'라서 모델은 인용을 줄일 줄 모른다.
 *   임계를 30으로 올리고 표적 문장을 면제해 **정상 문항을 죽이지 않게** 한다.
 *   지문 전문 재출력이라는 원 결함은 400자 상한이 단독으로 잡는다(실측 617자 → 반려).
 *   순응 가능한 규칙은 프롬프트에 실었다(FILL_BLANK_KEY_MD_QUOTE_WORD_MAX 단어 이내).
 */
const PASSAGE_ECHO_WORDS = 30;

/** 정답 어구에 있으면 안 되는 문자(빈칸 마커·괄호·따옴표). */
const FORBIDDEN_ANSWER_CHARS = /[_"“”()[\]{}<>;:]/;

const QUOTED_ENGLISH =
  /(?<![A-Za-z])['‘“"]([A-Za-z][A-Za-z .,'-]{2,60}?)['’”"]/g;
const MIN_QUOTE_FRAGMENT = 12;

/**
 * 문장 경계 오탐 방어 — 약어 뒤 마침표는 경계로 세지 않는다.
 * 🚫 여기에 `us`·`uk`·`eu`·`un`·`ca`·`mt` 를 추가하지 마라. 그것들은 **점 없는
 *   보통 낱말**로도 문장을 끝낼 수 있어("He gave it to us. Then he left."),
 *   목록에 넣는 순간 진짜 문장 경계가 조용히 죽는다. U.S./Ph.D. 류는 아래
 *   isDottedAbbreviation 이 **내부 점** 조건으로만 정확히 걸러낸다.
 */
const SENTENCE_ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "st", "vs", "etc", "fig", "no", "jr", "sr",
  "approx", "dept", "est", "ex", "al", "eg", "ie", "cf", "inc", "ltd", "co",
]);

function wordCount(value: string): number {
  return value.split(/\s+/).filter((t) => /[A-Za-z0-9]/.test(t)).length;
}

/**
 * 점 찍힌 이니셜리즘·약어(U.S. / Ph.D. / N.A.S.A. / a.k.a.)인가.
 * 이걸 문장 경계로 세면 "The U.S. Centers for Disease Control ..." 같은 **완전히
 * 정상인 한 문장**이 "문장 2개를 이어 붙임"으로 하드 반려된다 — 모델이 순응할
 * 방법이 없어(쪼갤 문장이 없다) 재생성 1회를 태우고 반드시 실패한다.
 * 판정은 **내부 점이 있을 때만** 적용한다(점 없는 "IBM."·"us."는 진짜 경계다).
 */
function isDottedAbbreviation(rawHead: string): boolean {
  if (!rawHead.includes(".")) return false;
  if (/^(?:[A-Za-z]\.){2,}[A-Za-z]?$/.test(`${rawHead}.`)) return true; // U.S. / N.A.S.A.
  return rawHead.replace(/\./g, "").length <= 4; // Ph.D. / a.k.a. / e.g.
}

/** 텍스트 안의 진짜 문장 경계 수(약어·이니셜 제외). */
export function internalSentenceBreaks(text: string): number {
  let count = 0;
  for (const m of text.matchAll(/([A-Za-z0-9.'’]+)[.!?]["'”’)\]]?\s+(?=[A-Z“"'(])/g)) {
    const head = m[1].toLowerCase().replace(/[.'’]/g, "");
    if (head.length <= 1) continue; // "J. Smith" 이니셜
    if (isDottedAbbreviation(m[1])) continue;
    if (SENTENCE_ABBREVIATIONS.has(head)) continue;
    count += 1;
  }
  return count;
}

/** 해설이 인용한 영어 조각이 문항 표면에 실재하는지(환각 인용 차단). */
function quotedTokenIssue(explanation: string, corpusRaw: string): string | null {
  // 비교축은 게이트 전역과 동일(fillBlankKeyComparable) — 지문이 en 대시·곱슬
  // 따옴표를 쓰고 모델이 곧은 표기로 인용하면 원문 대조는 환각으로 오판한다.
  const corpus = fillBlankKeyComparable(corpusRaw);
  for (const match of explanation.matchAll(QUOTED_ENGLISH)) {
    const fragments = match[1]
      .trim()
      .split(/\.{2,}|…|,/)
      .map((f) => f.trim())
      .filter((f) => f.length >= MIN_QUOTE_FRAGMENT);
    for (const fragment of fragments) {
      if (!corpus.includes(fillBlankKeyComparable(fragment))) {
        return `해설이 인용한 영어 표현이 지문·빈칸문장·정답 어디에도 없음(환각 인용): "${fragment.slice(0, 60)}"`;
      }
    }
  }
  return null;
}

function wordBag(text: string): string {
  return ` ${(fillBlankKeyComparable(text).match(/[a-z0-9'-]+/g) ?? []).join(" ")} `;
}

/**
 * 해설이 지문을 연속 N단어 이상 그대로 옮겨 실었으면 그 조각을 돌려준다.
 * `exempt`(빈칸에 정답을 되끼운 표적 문장)와 겹치는 구간은 세지 않는다 — 그 문장은
 * 학생 화면(passageWithBlank)에 이미 통째로 보이므로 해설이 인용해도 '재출력'이
 * 아니고, 프롬프트가 시키는 '어느 문장의 무엇' 근거 제시의 정상 형태다.
 */
function passageEchoFragment(
  explanation: string,
  passage: string,
  exempt: string,
): string | null {
  const words = fillBlankKeyComparable(explanation).match(/[a-z0-9'-]+/g) ?? [];
  if (words.length < PASSAGE_ECHO_WORDS) return null;
  const corpus = wordBag(passage);
  const allowed = wordBag(exempt);
  for (let i = 0; i + PASSAGE_ECHO_WORDS <= words.length; i += 1) {
    const window = words.slice(i, i + PASSAGE_ECHO_WORDS).join(" ");
    if (!corpus.includes(` ${window} `)) continue;
    if (allowed.includes(` ${window} `)) continue;
    return window;
  }
  return null;
}

export interface FillBlankKeyGateOptions {
  /** 해설 요구 여부(answer-only 모드 대비). 기본 true. */
  requireExplanation?: boolean;
  /** 지문 첫 문장 표적 금지 게이트. 기본 true. */
  forbidFirstSentence?: boolean;
}

/** 0원 결정형 게이트 — 빈 배열이면 클린. */
export function gateMdFillBlankKey(
  q: MdFillBlankKeyQuestion,
  passage: string,
  options?: FillBlankKeyGateOptions,
): string[] {
  const requireExplanation = options?.requireExplanation !== false;
  const forbidFirstSentence = options?.forbidFirstSentence !== false;
  const v: string[] = [];

  const swb = q.sentenceWithBlank.trim();
  const answer = q.answer.trim();
  const explanation = q.explanation.trim();

  // ── G1 필드 존재 ──────────────────────────────────────────────────────────
  if (!swb) v.push("빈칸문장 누락 — `빈칸문장:` 줄이 없거나 값이 비어 있음");
  if (!answer) v.push("정답 누락 — `정답:` 줄이 없거나 값이 비어 있음");
  if (requireExplanation && !explanation) v.push("해설 누락 — `해설:` 줄이 없거나 값이 비어 있음");

  // ── G0 인식 못 한 라벨 줄의 **자리 지목** (§1-B 철칙5) ────────────────────
  // 필드가 빈 채로 반려될 때 "정답 누락" 한 줄만 던지면, 모델은 정답 줄을 썼는데
  // '없다'는 피드백을 받고 재생성이 같은 형태를 반복한다. 파서가 못 읽은 줄을
  // 함께 지목해야 무엇을 고칠지 알 수 있다.
  // ⚠ 필드가 전부 정상일 때는 반려하지 않는다 — 군더더기 한 줄 때문에 살릴 수
  //    있는 문항을 죽이면 재생성 1회 소진 + 크레딧 환불로 손해가 더 크다
  //    (그 경우는 autoSnapFillBlankKey 가 corrections 로 기록만 한다).
  const unknownLabelLines = q.unknownLabelLines ?? [];
  if (v.length > 0 && unknownLabelLines.length > 0) {
    v.push(
      `파서가 읽지 못한 라벨 줄 ${unknownLabelLines.length}개 — 계약 라벨은 \`빈칸문장:\` \`정답:\` \`해설:\` 셋뿐이다: ${unknownLabelLines
        .slice(0, 2)
        .map((line) => `"${line.slice(0, 60)}"`)
        .join(" / ")}`,
    );
  }

  // 두 축이 없으면 이후 검사가 전부 무의미하다(오진 메시지로 재생성을 오도하지 않는다).
  if (!swb || !answer) return v;

  // ── G4/G5 빈칸 마커 개수 ──────────────────────────────────────────────────
  const blanks = (swb.match(/_{3,}/g) ?? []).length;
  if (blanks === 0) {
    v.push(
      `빈칸문장에 빈칸 마커(${FILL_BLANK_KEY_MD_BLANK})가 없음 — 정답 스팬을 ${FILL_BLANK_KEY_MD_BLANK} 로 바꿔라`,
    );
  } else if (blanks > 1) {
    v.push(
      `빈칸문장에 빈칸이 ${blanks}개 — 단일 정답 유형이므로 정확히 1개여야 한다(빈칸 하나만 남기고 나머지는 원문으로 되돌려라)`,
    );
  }

  // ── G2 정답 형태 ──────────────────────────────────────────────────────────
  const answerWords = wordCount(answer);
  if (answerWords < FILL_BLANK_KEY_MD_WORD_MIN) {
    v.push(
      `정답이 ${answerWords}단어 — 이 유형의 정답은 논지를 지고 있는 핵심 표현(${FILL_BLANK_KEY_MD_WORD_MIN}~${FILL_BLANK_KEY_MD_WORD_MAX}단어 콜로케이션)이어야 한다. 단어 하나만 비우면 동의어가 다 맞아 채점이 무너진다`,
    );
  } else if (answerWords > FILL_BLANK_KEY_MD_WORD_MAX) {
    v.push(
      `정답이 ${answerWords}단어 — 문장을 통째로 비운 셈이라 복원 불가다(${FILL_BLANK_KEY_MD_WORD_MIN}~${FILL_BLANK_KEY_MD_WORD_MAX}단어로 스팬을 좁혀라)`,
    );
  }
  if (FORBIDDEN_ANSWER_CHARS.test(answer)) {
    v.push(`정답에 문장부호·괄호·따옴표가 포함됨 — 어구만 써라: '${answer.slice(0, 60)}'`);
  }
  if (/[.,;:!?]$/.test(answer)) {
    v.push(`정답이 문장부호로 끝남 — 구두점은 빈칸 밖에 남겨라: '${answer.slice(0, 60)}'`);
  }
  if (/^(a|an|the)\s/i.test(answer)) {
    v.push(
      `정답이 관사로 시작함('${answer.slice(0, 40)}') — 관사는 빈칸 밖에 남겨라. 학생이 관사를 쓸지 말지로 채점이 갈린다`,
    );
  }

  // ── G14 프레임 골격 ───────────────────────────────────────────────────────
  const frameOnly = swb.replace(/_{3,}/g, " ");
  const frameWords = wordCount(frameOnly);
  if (frameWords < MIN_FRAME_WORDS) {
    v.push(
      `빈칸문장에서 빈칸을 뺀 단어가 ${frameWords}개뿐 — 문맥이 정답을 지목하지 못한다(원문 문장 전체를 그대로 옮겨라)`,
    );
  }
  if (frameWords > MAX_SENTENCE_WORDS) {
    v.push(
      `빈칸문장이 ${frameWords}단어 — 지문의 '한 문장'만 옮겨야 한다(문단을 통째로 붙여넣지 마라)`,
    );
  }
  const breaks = internalSentenceBreaks(swb);
  if (breaks > 0) {
    v.push(
      `빈칸문장이 문장 ${breaks + 1}개를 이어 붙임 — 지문의 한 문장만 옮겨라(문장 경계 ${breaks}곳 발견)`,
    );
  }

  // ── G6 프레임 복원 대조 (이 유형 최강 게이트) ─────────────────────────────
  // 빈칸에 정답을 되끼운 문장이 원 지문에 축자로 없으면 모델이 프레임을 고친 것이다.
  // 마커형 유형의 "지문 재구성 일치"와 같은 자리의 게이트.
  const passageComparable = fillBlankKeyComparable(passage);
  const restored = blanks === 1 ? restoreFillBlankKeySentence(swb, answer) : "";
  if (blanks === 1) {
    if (!restored) {
      v.push("빈칸문장 복원 실패 — 빈칸에 정답을 되끼운 문장을 만들 수 없음");
    } else if (!passageComparable.includes(restored)) {
      v.push(
        `빈칸에 정답('${answer.slice(0, 40)}')을 되끼운 문장이 지문에 없음 — 빈칸문장은 원문 문장에서 정답 스팬만 ${FILL_BLANK_KEY_MD_BLANK} 로 바꾼 것이어야 한다(철자·구두점·어형을 손대지 마라): "${restored.slice(0, 90)}"`,
      );
    } else if (forbidFirstSentence && passageComparable.indexOf(restored) === 0) {
      v.push(
        "빈칸을 지문 첫 문장에 뚫었다 — 앞 문맥이 없어 정답이 유일하게 지목되지 않는다. 논지가 전개된 뒤의 문장을 골라라",
      );
    }
  }

  // ── G7/G8 정답 축자성과 유일 등장 ────────────────────────────────────────
  const occurrences = countFillBlankKeyAnswerOccurrences(passage, answer);
  if (occurrences === 0) {
    v.push(
      `정답('${answer.slice(0, 60)}')이 지문에 축자로 없음 — 이 유형의 정답은 지문에 실제로 있는 표현이어야 한다`,
    );
  } else if (occurrences > 1) {
    v.push(
      `정답('${answer.slice(0, 60)}')이 지문에 ${occurrences}회 등장 — 빈칸 처리 뒤에도 본문에 정답이 남아 학생이 찾아 베낀다. 지문에서 한 번만 나오는 표현을 골라라`,
    );
  }

  // ── G9 빈칸문장 내 정답 잔존 ─────────────────────────────────────────────
  if (answerBoundaryRegex(answer).test(swb)) {
    v.push(
      `정답('${answer.slice(0, 60)}')이 빈칸문장에 그대로 남아 노출됨 — 그 스팬을 ${FILL_BLANK_KEY_MD_BLANK} 로 바꿔라`,
    );
  }

  // ── G10 자음골격/언더스코어 난독 누설 ────────────────────────────────────
  // 정상 _____(공백 둘러싸임)은 deobf 가 no-op 이므로 오탐하지 않는다(검증기 주석 :107-109).
  const deobf = swb.replace(/([A-Za-z])[_·.\-]{1,2}(?=[A-Za-z])/g, "$1");
  if (deobf !== swb && answerBoundaryRegex(answer).test(deobf)) {
    v.push(
      `정답이 자음골격/언더스코어 난독으로 빈칸문장에 노출됨 — 빈칸은 ${FILL_BLANK_KEY_MD_BLANK} 로만 표기하라`,
    );
  }

  // ── G15/G16/G18 해설 계약 ────────────────────────────────────────────────
  if (explanation) {
    if (!containsHangul(explanation)) {
      v.push("해설에 한국어가 없음 — 해설은 한국어(합니다체)로 쓴다");
    }
    // G18 지문 재출력 차단 — 해설은 학생·강사 표면에 그대로 렌더된다. 모델이
    // 꼬리에 지문을 재출력하면(파서가 1차로 끊지만) 여기서 결정형으로 잡는다.
    if (explanation.length > MAX_EXPLANATION_CHARS) {
      v.push(
        `해설이 ${explanation.length}자 — 계약은 '딱 2문장'(${MAX_EXPLANATION_CHARS}자 이내)이다. 지문이나 군더더기가 섞였는지 확인하라: "${explanation.slice(-60)}"`,
      );
    }
    // 표적 문장(빈칸에 정답을 되끼운 문장)은 면제한다 — 학생이 이미 보는 문장이다.
    const echo = passageEchoFragment(explanation, passage, restored || swb);
    if (echo) {
      v.push(
        `해설이 지문을 연속 ${PASSAGE_ECHO_WORDS}단어 이상 그대로 옮겨 실었다 — 지문 인용은 한 조각 ${FILL_BLANK_KEY_MD_QUOTE_WORD_MAX}단어 이내로 줄이고 나머지는 한국어로 설명하라: "${echo.slice(0, 70)}…"`,
      );
    }
    const quoteIssue = quotedTokenIssue(explanation, `${passage} ${swb} ${answer}`);
    if (quoteIssue) v.push(quoteIssue);
  }

  return v;
}
