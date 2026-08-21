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
//     여기서 안 잡으면 결함이 그대로 출하된다(정찰 R8).
//
// ── 26-08-22 기출 오반려 전수 실측(수능·평가원·학평 93문항, 캠페인 배선 기준
//    "기출 오반려 0%만 차단 자격") 에 따른 수술 원장 ──
//  · 차단 유지(기출 오반려 0건): 축자 결속·자리 유일(대소문자 구분 폴백 추가)·
//    상한(임계 14로 완화)·후행 기능어 절단·수사의문 표현 분기·같은 문장 즉시
//    재진술(쉼표 조건 강화)·다음 문장 누출[KILLER]·선지 형상/언어(하한 2단어).
//  · 비차단 강등(기출이 정규 패턴으로 쓰는 검사 — impliedGateAdvisories 로 이동,
//    판정 계산은 유지하고 채널만 변경): 단일 단어 표적·내용어<2 표적·
//    지엽 표적[KILLER]·절대표현 미끼[KILLER]. 강등 근거 수치는 각 함수 주석에.
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
  normalizeComparableText,
} from "@/lib/question-quality/core";
import {
  findDirectAnswerLeakage,
  findExpressionSentenceContextWithIndex,
  findImpliedMeaningAbsoluteGiveawayOption,
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

/**
 * 게이트 전용 밑줄 크기 상한(단어·어휘단위 공용).
 * 26-08-22 기출 전수 실측(93문항): 단어수 분포 1~13(6단어 초과 23건 25%),
 * lexicalUnits 최대 13, 문자수 최대 72자. 프롬프트 상한(6단어)을 게이트가 그대로
 * 집행하면 기출 24건(25.8%, 수능 2026·2022·2021 포함)이 오반려된다 — 6단어는
 * 프롬프트 레버로만 유지하고(프롬프트가 이미 지시), 차단 임계는 관측 최대(13)
 * 밖인 14로 물린다(오반려 0%). 문자 상한 90자는 관측 최대 72자 밖이라 유지.
 */
const IMPLIED_GATE_TARGET_MAX_UNITS = 14;

export interface GateMdImpliedOptions {
  optionCount?: number;
  answerCount?: number;
  /** 교사 설정 보기 언어(기본 en) — 선지 언어 정합 검사의 기준 */
  optionLanguage?: "ko" | "en";
  /** KILLER 전용 검사(다음 문장 누출 차단, 지엽·절대표현 권고)를 켤지 결정 */
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
      // 26-08-22 기출 실측: 영어 선지 단어수 하한은 2단어('stay calm'/'blame
      // yourself', 고1 학평 2020)이고 1단어 선지는 0건 — 임계 3→2 로 내려
      // 단일 단어 선지만 반려한다(임계 3은 기출 1문항 오반려).
      if (countWordsForQuality(opt.text) < 2) {
        v.push(
          `${opt.label} 선지가 한 단어뿐 — 함축 의미는 구·절로 써야 한다: '${ELLIPSIS(opt.text)}'`,
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
 * 절대표현 미끼 — fast 의 KILLER error `implied-meaning-absolute-giveaway-option`
 * 판정기를 그대로 재사용한다(로직 이중화 금지). 라벨은 게이트 시점 축인 원문자로
 * 지목해야 피드백이 자리를 짚으므로 오답 선지를 하나씩 단독으로 넘겨 라벨을
 * 보존한다. 지문 자체가 그 절대어를 쓰면 검증기가 스스로 통과시킨다.
 *
 * ⚠ 26-08-22 차단→권고 강등: 기출 12/93 문항(12.9%)의 오답 선지가 never(3)·
 * only(3)·completely(3)·entirely(2)·always(2)를 정규 미끼로 쓴다 — 2024 수능
 * 본시험 포함. 절대어 오답은 기출의 정상 설계다(요약문 미끼 절대어 73% 선례와
 * 동일 계통, 플레이북 §3). 완화 조건이 없어 차단 자격이 없으므로 판정 계산은
 * 유지한 채 채널만 impliedGateAdvisories 로 옮겼다. 공유 판정기
 * (findImpliedMeaningAbsoluteGiveawayOption)는 fast 레인이 계속 차단에 쓰므로
 * 손대지 않는다(gate-summary-mc 선례와 동일 원칙 — 회귀 방지).
 */
function absoluteGiveawayIssues(
  q: MdImpliedQuestion,
  passage: string,
): string[] {
  // 정답 축을 못 읽었으면 어느 선지가 오답인지 모른다 — 정답을 미끼로 오인해
  // 지목하느니 침묵한다(정답 누락은 필드 검사가 이미 지목한다).
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
 * 대소문자 **구분** 정확 일치 등장 횟수 — locateImpliedTarget(대소문자 무시)의
 * 자리 유일성 판정에 대한 폴백 축. 26-08-22 실측: 'None'(2019 6월 평가원 29번,
 * 지문 "…? None." 실존 기출)이 대소문자 무시로는 2회("none of which" 포함)라
 * 오반려됐다 — 구분 계수로는 1회 유일. 토큰 사이 공백량만 흡수하고(스냅 후
 * 표현은 지문 축자라 그 외 변형은 불요) 단어 경계는 locateImpliedTarget 과
 * 동일하게 강제한다(art"is"ts 사고 방지).
 */
function countCaseSensitiveOccurrences(
  passage: string,
  expression: string,
): number {
  const trimmed = expression.trim();
  if (!trimmed || !passage) return 0;
  const body = trimmed
    .split(/\s+/)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const pre = /^[A-Za-z]/.test(trimmed) ? "(?<![A-Za-z])" : "";
  const post = /[A-Za-z]$/.test(trimmed) ? "(?![A-Za-z])" : "";
  try {
    return [...passage.matchAll(new RegExp(`${pre}${body}${post}`, "g"))].length;
  } catch {
    return 0;
  }
}

/**
 * 같은 문장 안 즉시 재진술 — 게이트 로컬 강화판.
 * 26-08-22 실측 1건(1.1%): 2020 9월 평가원 'a cage model that is difficult to
 * defend…' 의 **관계절** "that is" 를 재진술 큐로 오인해 오반려. 재진술 담화표지
 * "that is" 는 실제로는 뒤에 쉼표가 온다("…, that is, …") — 쉼표 조건을 붙이면
 * 기출 오반려 0%. 나머지 큐(namely/in other words/this means/that means/
 * meaning that/which means)는 관측 오탐 0건이라 그대로 유지.
 * ⚠ fast 공유 판정기(findSameSentenceDirectAnswerLeakage)는 쉼표 없는 "that is"
 * 를 계속 큐로 쓴다 — 공유 함수를 고치면 fast 레인 극성이 바뀌므로(회귀 위험)
 * md 게이트 호출부만 로컬 판정으로 교체했다(공유 함수 원형 유지).
 */
function findSameSentenceLeakStrict(
  expression: string,
  sentence: string,
): string | null {
  if (!sentence) return null;
  const expressionIndex = normalizeComparableText(sentence).indexOf(
    normalizeComparableText(expression),
  );
  if (expressionIndex === -1) return null;
  const afterExpression = sentence.slice(expressionIndex + expression.length);
  if (
    afterExpression.length <= 180 &&
    /\b(?:that\s+is\s*,|namely\b|in other words\b|this means\b|that means\b|meaning that\b|which means\b)/i.test(
      afterExpression,
    )
  ) {
    return afterExpression.slice(0, 120);
  }
  return null;
}

/**
 * 밑줄 표적 검사 — 이 유형의 심장. 지문 결속(축자·유일)과 크기·절단·수사의문
 * (표현 분기)·즉시 재진술은 전 난이도 차단, 다음 문장 누출은 KILLER 차단.
 * 단일 단어·내용어<2·지엽 표적은 26-08-22 기출 실측으로 비차단 강등 —
 * impliedGateAdvisories 에서 계산한다(각 함수 주석에 근거 수치).
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
  } else if (hit.count > 1 && countCaseSensitiveOccurrences(passage, expr) !== 1) {
    // #2 자리 유일 — 같은 표현이 여러 번이면 어느 자리에 밑줄인지 확정되지 않는다.
    // 26-08-22 실측: 대소문자 **구분** 정확 일치가 1회 유일이면 통과(무시 계수는
    // 폴백) — 'None'(2019 6월 평가원) 오반려 1건 해소, 기출 오반려 0%.
    v.push(
      `밑줄 표현이 지문에 ${hit.count}회 등장 — 밑줄 자리가 모호하다. 한 번만 나오는 표현을 골라라: '${ELLIPSIS(expr, 80)}'`,
    );
  }

  // #3 크기 — 임계는 게이트 전용 상수(관측 최대 13 밖 = 14, 상수 주석 참조).
  //    검증기 implied-meaning-target-too-long(6단어)와 의도적으로 다르다:
  //    26-08-22 실측에서 6단어 집행이 기출 24건(25.8%)을 오반려했다. 6단어는
  //    프롬프트 레버로만 유지하고, 반려 메시지의 수리 지시도 프롬프트 상한을
  //    가리킨다(재생성 피드백은 더 엄한 쪽으로 줄이라고 시켜야 안전).
  const words = countWordsForQuality(expr);
  const lexicalUnits = countImpliedMeaningLexicalUnits(expr);
  if (
    expr.length > IMPLIED_MD_TARGET_MAX_CHARS ||
    words > IMPLIED_GATE_TARGET_MAX_UNITS ||
    lexicalUnits > IMPLIED_GATE_TARGET_MAX_UNITS
  ) {
    v.push(
      `밑줄이 너무 김(${words}단어/${expr.length}자) — ${IMPLIED_MD_TARGET_MAX_WORDS}단어 이내 압축 표현으로 잘라라: '${ELLIPSIS(expr, 80)}'`,
    );
  }

  // #4(구) 단일 단어·내용어<2 하한 — 26-08-22 비차단 강등(impliedGateAdvisories).
  //    단일 단어: 'None'(2019 6월 평가원 29번) 실존 기출 1건(1.1%) 오반려.
  //    내용어<2: 기출 10/93(10.8%) — 'the ghost'(2027 평가원)·'don’t knock the
  //    box'(2021 평가원)·'Garbage in, garbage out'(2020 평가원) 등 관용구·비유
  //    표적은 기능어 위주가 이 유형의 정상이라 내용어 계수로 구제 불가.

  // #5 절단 — 전치사·접속사로 끝나면 표현이 잘려 보인다(기출 오반려 0건 실측).
  if (hasTrailingFunctionWord(expr)) {
    v.push(
      `밑줄이 전치사·접속사로 끝나 잘려 있음 — 완결된 압축 구로 다시 잡아라: '${ELLIPSIS(expr)}'`,
    );
  }

  const context = findExpressionSentenceContextWithIndex(passage, expr);

  // #6 수사의문문 — **표현 분기만** 차단한다. 26-08-22 실측: 오반려 3/93(3.2%)
  //    전부 문장 분기 발화였고 표적 자체가 ?로 끝난 기출은 0건 — 기출은 수사
  //    의문문 문장 **내부** 표적('give up the ghost', 2027 6월 평가원)에 실제로
  //    밑줄을 긋는다. 문장 분기(context.sentence 판정)는 삭제했다(fast 검증기
  //    implied.ts:159-160 은 두 분기 유지 — 공유 함수는 손대지 않음).
  if (isQuestionLikeImpliedMeaningTarget(expr)) {
    v.push(
      `밑줄이 수사적 질문(자문자답) 자리 — 질문이 아니라 답변 쪽의 압축·비유 표현에 밑줄을 그어라: '${ELLIPSIS(expr)}'`,
    );
  }

  // #7 같은 문장 안 즉시 재진술 — 표면-이면 간극이 0이 되므로 전 난이도 반려.
  //    로컬 강화판(쉼표 조건, findSameSentenceLeakStrict 주석 참조) 사용.
  if (context?.sentence) {
    const sameSentenceLeak = findSameSentenceLeakStrict(expr, context.sentence);
    if (sameSentenceLeak) {
      v.push(
        `밑줄 직후에서 같은 문장이 뜻을 그대로 풀어 줌 — 함축이 남지 않는다: '${ELLIPSIS(sameSentenceLeak, 80)}'`,
      );
    }
  }

  // #8 KILLER 전용 — 다음 문장 누출(기출 오반려 0건 실측, 차단 유지).
  //    #9(구) 지엽 표적은 26-08-22 비차단 강등 — 기출 1/93(1.1%,
  //    'an urban green space paradox' 고1 학평 2025-10) 오반려, 표본상 완화
  //    임계 도출 불가 → impliedGateAdvisories 로 이동.
  if (difficulty === "KILLER" && context) {
    const nextLeak = findDirectAnswerLeakage(expr, context.next);
    if (nextLeak) {
      v.push(
        `다음 문장이 밑줄의 답을 거의 그대로 풀어 줌 — 밑줄 자리를 옮겨라: '${ELLIPSIS(nextLeak, 80)}'`,
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
    // 절대표현 미끼는 26-08-22 차단→권고 강등(absoluteGiveawayIssues 주석) —
    // impliedGateAdvisories 가 KILLER 에서 계산해 corrections 로만 남긴다.
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

/**
 * **비차단 권고** — 게이트가 반려하지 않고 잡 result(mdCorrections)에만 남기는
 * 항목. 26-08-22 기출 전수 실측(93문항)으로 차단에서 강등한 4검사가 여기로
 * 온다(판정 로직은 차단 시절 그대로 — 채널만 변경, gate-summary-mc 의
 * summaryMcGateAdvisories 선례 동형):
 *  · 단일 단어 표적 — 기출 1건('None', 2019 6월 평가원 29번) 실존.
 *  · 내용어<2 표적 — 기출 10건(10.8%): 관용구·비유 표적('the ghost' 등)이 정상.
 *  · 지엽 표적[KILLER] — 기출 1건('an urban green space paradox', 고1 학평).
 *  · 절대표현 미끼[KILLER] — 기출 12건(12.9%, 2024 수능 포함): 절대어 오답은
 *    기출의 정규 미끼 설계다.
 * 반려하면 재생성 1회 후 크레딧 환불이라, 기출조차 지키지 않는 구조 취향에 그
 * 예산을 쓰지 않는다(플레이북 §1 "과반려 게이트 강등" 견본과 같은 원칙).
 *
 * gateMdImplied 가 이미 반려한 문항에는 호출할 필요가 없다(레인이 순서 보장 —
 * 재생성 피드백 옆에 놓이면 소음이다).
 */
export function impliedGateAdvisories(
  q: MdImpliedQuestion,
  passage: string,
  options?: GateMdImpliedOptions,
): string[] {
  const difficulty = options?.difficulty ?? "KILLER";
  const out: string[] = [];
  const expr = q.expression.trim();
  if (expr) {
    // 강등 전 #4와 동일한 판정·분기 구조(단일 단어 우선, 내용어 하한은 그 외).
    if (isSingleEnglishToken(expr)) {
      out.push(
        `참고(비차단): 밑줄이 단일 단어 — 함축 추론이 아니라 어휘 문항이 된다: '${expr}'`,
      );
    } else if (isTinyFunctionWord(expr) || countContentTokens(expr) < 2) {
      out.push(
        `참고(비차단): 밑줄에 내용어가 2개 미만 — 함축을 지탱하지 못한다: '${ELLIPSIS(expr)}'`,
      );
    }
    if (difficulty === "KILLER") {
      const context = findExpressionSentenceContextWithIndex(passage, expr);
      if (
        context &&
        isPeripheralDetailImpliedMeaningTarget(context.sentence, expr)
      ) {
        out.push(
          `참고(비차단): 밑줄이 예시·실험 세부 문장 속 지엽 표현 — 중심 논지(주제문·결론문)나 그 직접 근거로 옮겨라: '${ELLIPSIS(expr)}'`,
        );
      }
    }
  }
  if (difficulty === "KILLER") {
    out.push(
      ...absoluteGiveawayIssues(q, passage).map((m) => `참고(비차단): ${m}`),
    );
  }
  return out;
}
