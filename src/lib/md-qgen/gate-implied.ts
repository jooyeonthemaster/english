// ============================================================================
// 함축 의미 추론(IMPLIED_MEANING) 0원 결정형 게이트 — LLM 콜 없음.
// 400줄 규칙에 따라 parser-implied.ts 에서 분리(1차 승차분 gate-vocab/order 선례).
//
// 설계 원칙 두 가지:
//  1) **게이트 메시지는 자리를 지목한다.** 이 문구가 그대로 재생성 프롬프트의
//     피드백이 되므로(route.ts buildPrompt(feedback)), "무엇이 몇 개"가 아니라
//     "어느 라벨의 무엇이 어떻게" 를 적는다(규범 §1-B 철칙 5).
//  2) **fast 검증기의 치명 게이트를 md 로 승격 이식한다.** md 레인은
//     validateQuestionQuality 결과를 차단하지 않고 기록만 하므로(route.ts),
//     여기서 안 잡으면 결함이 그대로 출하된다(정찰 R8). 이 유형에서 그 대상은
//     밑줄 표적 규칙 전부 — 지문 축자·자리 유일·6단어 상한·단일단어 금지·
//     후행 기능어 절단 금지·수사의문문 금지·인접 재진술 금지다.
//
// 반려 극성은 fast 와 동기한다: 항상 error 인 것(too-long/trailing-function)은
// 전 난이도 반려, KILLER 전용 error 인 것(지엽 표적·다음 문장 누출)은 KILLER 만.
// 휴리스틱 강도가 세서 오반려 위험이 큰 검사(중심성 긍정판정)는 채택하지 않고,
// 정밀도가 높은 부정판정(지엽 세부 확정)만 게이트로 올렸다.
// ============================================================================

import {
  containsHangul,
  containsLatinLetter,
  countContentTokens,
  countImpliedMeaningLexicalUnits,
  countWordsForQuality,
  hasTrailingFunctionWord,
  isSingleEnglishToken,
  isTinyFunctionWord,
} from "@/lib/question-quality/core";
import {
  findDirectAnswerLeakage,
  findExpressionSentenceContextWithIndex,
  findImpliedMeaningAbsoluteGiveawayOption,
  findSameSentenceDirectAnswerLeakage,
  isPeripheralDetailImpliedMeaningTarget,
  isQuestionLikeImpliedMeaningTarget,
} from "@/lib/question-quality/validators/implied-distractor";
import { normalizeWs } from "./parser";
import { locateImpliedTarget, type MdImpliedQuestion } from "./parser-implied";
import {
  IMPLIED_MD_CIRCLED,
  IMPLIED_MD_TARGET_MAX_CHARS,
  IMPLIED_MD_TARGET_MAX_WORDS,
} from "./prompts-implied";
import type { MdDifficulty } from "./prompts";

export interface GateMdImpliedOptions {
  optionCount?: number;
  answerCount?: number;
  /** 교사 설정 보기 언어(기본 en) — 선지 언어 정합 검사의 기준 */
  optionLanguage?: "ko" | "en";
  /** KILLER 전용 반려(지엽 표적·다음 문장 누출)를 켤지 결정 */
  difficulty?: MdDifficulty;
  /** answer-only 모드에서 오답해설 개수 검사를 끈다 */
  requireWrong?: boolean;
}

const ELLIPSIS = (s: string, n = 60): string =>
  s.length > n ? `${s.slice(0, n)}…` : s;

/** 선지 형상 검사 — 라벨 순서·빈 텍스트·중복(개수는 호출 전 조기반려로 확정). */
function gateOptions(q: MdImpliedQuestion, expected: string[]): string[] {
  const v: string[] = [];
  if (q.options.map((o) => o.label).join("") !== expected.join("")) {
    v.push(
      `선지 라벨이 ${expected.join("")} 순서가 아님 — 실제 ${q.options.map((o) => o.label).join("") || "없음"}`,
    );
  }
  const seen = new Map<string, string>();
  for (const opt of q.options) {
    if (!opt.text) {
      v.push(`${opt.label} 선지 텍스트 누락`);
      continue;
    }
    const key = normalizeWs(opt.text).toLowerCase();
    const prev = seen.get(key);
    if (prev) {
      v.push(`선지 중복 — ${prev}와 ${opt.label}가 같은 내용: '${ELLIPSIS(opt.text)}'`);
    } else {
      seen.set(key, opt.label);
    }
  }
  return v;
}

/** 선지 언어 정합 — 교사 설정(optionLanguage)을 게이트가 집행한다. */
function gateOptionLanguage(
  q: MdImpliedQuestion,
  optionLanguage: "ko" | "en",
): string[] {
  const v: string[] = [];
  for (const opt of q.options) {
    if (!opt.text) continue;
    if (optionLanguage === "en") {
      if (containsHangul(opt.text)) {
        v.push(`${opt.label} 선지에 한글이 섞임 — 선지는 영어 전용: '${ELLIPSIS(opt.text)}'`);
        continue;
      }
      if (!containsLatinLetter(opt.text)) {
        v.push(`${opt.label} 선지가 영어 표현이 아님: '${ELLIPSIS(opt.text)}'`);
        continue;
      }
      if (countWordsForQuality(opt.text) < 3) {
        v.push(
          `${opt.label} 선지가 한두 단어 라벨 — 함축 의미는 구·절로 써야 한다: '${ELLIPSIS(opt.text)}'`,
        );
      }
    } else {
      if (!containsHangul(opt.text)) {
        v.push(
          `${opt.label} 선지가 한국어가 아님 — 교사 설정이 한국어 보기다: '${ELLIPSIS(opt.text)}'`,
        );
        continue;
      }
      if (normalizeWs(opt.text).length < 6) {
        v.push(`${opt.label} 선지가 너무 짧음 — 완결 진술문으로 쓰라: '${ELLIPSIS(opt.text)}'`);
      }
    }
  }
  return v;
}

/**
 * 절대표현 미끼 반려 — fast 의 KILLER error `implied-meaning-absolute-giveaway-option`
 * 을 md 로 승격 이식한 것이다. fast(strict)는 이 코드를 전건 차단하는데
 * (run-question-generation.ts 의 strict 분기, SHIP_FIRST_WARNING_CODES 밖) md 는
 * 검증기 결과를 기록만 하므로, 여기서 안 잡으면 "훑어보기만 해도 지워지는" 오답이
 * 그대로 학생 표면까지 간다. LLM 콜 없는 0원 결정형이라 비용 증가도 없다.
 *
 * 판정기는 fast 검증기를 **그대로 재사용**한다(로직 이중화 금지). 다만 라벨은
 * 게이트 시점 축인 원문자로 지목해야 재생성 피드백이 자리를 짚을 수 있으므로
 * (규범 §1-B 철칙 5), 오답 선지를 하나씩 단독으로 넘겨 라벨을 보존한다.
 * 지문 자체가 그 절대어를 쓰고 있으면 검증기가 스스로 통과시킨다(오반려 방지).
 */
function gateAbsoluteGiveawayOptions(
  q: MdImpliedQuestion,
  passage: string,
): string[] {
  // 정답 축을 못 읽었으면 어느 선지가 오답인지 모른다 — 정답을 미끼로 오인해
  // 반려하느니 침묵한다(정답 누락은 아래 필드 검사가 이미 지목한다).
  if (q.answers.length === 0) return [];
  const v: string[] = [];
  const answerSet = new Set(q.answers);
  for (const opt of q.options) {
    if (!opt.text || answerSet.has(opt.label)) continue;
    const cue = findImpliedMeaningAbsoluteGiveawayOption(
      [{ label: opt.label, text: opt.text }],
      [],
      passage,
    );
    if (!cue) continue;
    const word = cue.match(/"([^"]+)"/)?.[1] ?? cue;
    v.push(
      `${opt.label} 선지가 절대표현 미끼 — 지문이 그 정도를 명시하지 않아 읽지 않고도 지워진다(‘${word}’): '${ELLIPSIS(opt.text)}'`,
    );
  }
  return v;
}

/**
 * 밑줄 표적 검사 — 이 유형의 심장.
 * 지문 결속(축자·유일)은 전 난이도 반려, 표적 품질은 fast 극성과 동기한다.
 */
function gateTarget(
  q: MdImpliedQuestion,
  passage: string,
  difficulty: MdDifficulty,
): string[] {
  const v: string[] = [];
  const expr = q.expression.trim();
  if (!expr) return ["밑줄 표현 누락 — `밑줄:` 줄이 없거나 비어 있음"];

  // #1 지문 축자 결속 — 실패하면 후처리가 "expression not found" 로 전체 실패한다.
  const hit = locateImpliedTarget(passage, expr);
  if (!hit) {
    v.push(`밑줄 표현이 지문에 축자로 없음 — 지문에서 그대로 복사하라: '${ELLIPSIS(expr, 80)}'`);
  } else if (hit.count > 1) {
    // #2 자리 유일 — 같은 표현이 여러 번이면 어느 자리에 밑줄인지 확정되지 않는다.
    v.push(
      `밑줄 표현이 지문에 ${hit.count}회 등장 — 밑줄 자리가 모호하다. 한 번만 나오는 표현을 골라라: '${ELLIPSIS(expr, 80)}'`,
    );
  }

  // #3 크기 — 상한은 검증기 implied-meaning-target-too-long 과 같은 값(항상 error).
  const words = countWordsForQuality(expr);
  const lexicalUnits = countImpliedMeaningLexicalUnits(expr);
  if (
    expr.length > IMPLIED_MD_TARGET_MAX_CHARS ||
    words > IMPLIED_MD_TARGET_MAX_WORDS ||
    lexicalUnits > IMPLIED_MD_TARGET_MAX_WORDS
  ) {
    v.push(
      `밑줄이 너무 김(${words}단어/${expr.length}자) — ${IMPLIED_MD_TARGET_MAX_WORDS}단어 이내 압축 표현으로 잘라라: '${ELLIPSIS(expr, 80)}'`,
    );
  }

  // #4 하한 — 단일 단어·기능어는 CONTEXT_MEANING·REFERENCE 의 자리다.
  if (isSingleEnglishToken(expr)) {
    v.push(`밑줄이 단일 단어 — 함축 추론이 아니라 어휘 문항이 된다: '${expr}'`);
  } else if (isTinyFunctionWord(expr) || countContentTokens(expr) < 2) {
    v.push(`밑줄에 내용어가 2개 미만 — 함축을 지탱하지 못한다: '${ELLIPSIS(expr)}'`);
  }

  // #5 절단 — 전치사·접속사로 끝나면 표현이 잘려 보인다(검증기 항상 error).
  if (hasTrailingFunctionWord(expr)) {
    v.push(
      `밑줄이 전치사·접속사로 끝나 잘려 있음 — 완결된 압축 구로 다시 잡아라: '${ELLIPSIS(expr)}'`,
    );
  }

  const context = findExpressionSentenceContextWithIndex(passage, expr);

  // #6 수사의문문 — 자문자답 구조는 답변 쪽에 밑줄을 그어야 한다.
  if (
    isQuestionLikeImpliedMeaningTarget(expr) ||
    (context?.sentence && isQuestionLikeImpliedMeaningTarget(context.sentence))
  ) {
    v.push(
      `밑줄이 수사적 질문(자문자답) 자리 — 질문이 아니라 답변 쪽의 압축·비유 표현에 밑줄을 그어라: '${ELLIPSIS(expr)}'`,
    );
  }

  // #7 같은 문장 안 즉시 재진술("that is / in other words / this means") —
  // 표면-이면 간극이 0이 되므로 전 난이도 반려(정밀도 높은 결정형 신호).
  if (context?.sentence) {
    const sameSentenceLeak = findSameSentenceDirectAnswerLeakage(expr, context.sentence);
    if (sameSentenceLeak) {
      v.push(
        `밑줄 직후에서 같은 문장이 뜻을 그대로 풀어 줌 — 함축이 남지 않는다: '${ELLIPSIS(sameSentenceLeak, 80)}'`,
      );
    }
  }

  // #8/#9 KILLER 전용 — fast 의 KILLER 차단 코드와 극성을 맞춘다.
  if (difficulty === "KILLER" && context) {
    const nextLeak = findDirectAnswerLeakage(expr, context.next);
    if (nextLeak) {
      v.push(
        `다음 문장이 밑줄의 답을 거의 그대로 풀어 줌 — 밑줄 자리를 옮겨라: '${ELLIPSIS(nextLeak, 80)}'`,
      );
    }
    if (isPeripheralDetailImpliedMeaningTarget(context.sentence, expr)) {
      v.push(
        `밑줄이 예시·실험 세부 문장 속 지엽 표현 — 중심 논지(주제문·결론문)나 그 직접 근거로 옮겨라: '${ELLIPSIS(expr)}'`,
      );
    }
  }

  return v;
}

/** 0원 결정형 게이트 — 빈 배열이면 클린. */
export function gateMdImplied(
  q: MdImpliedQuestion,
  passage: string,
  options?: GateMdImpliedOptions,
): string[] {
  const optionCount = options?.optionCount ?? q.options.length;
  const answerCount = options?.answerCount ?? 1;
  const optionLanguage = options?.optionLanguage === "ko" ? "ko" : "en";
  const difficulty = options?.difficulty ?? "KILLER";
  const requireWrong = options?.requireWrong !== false;
  const expected: string[] = IMPLIED_MD_CIRCLED.slice(0, optionCount);

  // 개수가 어긋나면 라벨·정답·오답 검사가 전부 파생 잡음이 된다 — 즉시 반려.
  if (q.options.length !== optionCount) {
    return [`선지 ${q.options.length}개 (${optionCount}개 필요)`];
  }

  const v: string[] = [
    ...gateOptions(q, expected),
    ...gateOptionLanguage(q, optionLanguage),
    ...gateTarget(q, passage, difficulty),
    // fast 와 같은 극성 — 이 코드는 fast 에서도 KILLER 에서만 발행된다.
    ...(difficulty === "KILLER" ? gateAbsoluteGiveawayOptions(q, passage) : []),
  ];

  // 정답 — `정답:` 줄이 유일 진실원이다(선지 줄에 정답 표시 칸을 두지 않는 계약).
  const optionLabels = new Set(q.options.map((o) => o.label));
  if (q.answers.length === 0) {
    v.push("정답 누락 — `정답:` 줄이 없거나 라벨을 읽을 수 없음");
  } else if (q.answers.length !== answerCount) {
    v.push(
      `정답 ${q.answers.length}개 (${answerCount}개 필요) — 실제 ${q.answers.join(", ")}`,
    );
  }
  for (const label of q.answers) {
    if (!optionLabels.has(label)) v.push(`정답 라벨(${label})이 선지에 없음`);
  }

  if (!q.explanation) v.push("해설 누락");

  const wrongNeeded = optionCount - answerCount;
  if (requireWrong && q.wrong.length !== wrongNeeded) {
    v.push(
      `오답해설 ${q.wrong.length}개 (${wrongNeeded}개 필요) — 정답을 뺀 모든 선지에 1개씩`,
    );
  }
  const answerSet = new Set(q.answers);
  for (const w of q.wrong) {
    if (answerSet.has(w.label)) v.push(`오답해설에 정답 라벨(${w.label}) 포함`);
    else if (!optionLabels.has(w.label)) {
      v.push(`오답해설 라벨(${w.label})이 선지에 없음`);
    }
  }

  return v;
}
