// ============================================================================
// 내용 일치(CONTENT_MATCH) md 레인 디스크립터.
// 견본: lane-antonym.ts / 인터페이스: ./lane-types.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md §4-7
//
// 과금 축(중대): fast 레인의 getOperationType 은 VOCAB_TYPES =
// {CONTEXT_MEANING, SYNONYM, ANTONYM} 만 QUESTION_GEN_VOCAB(1크레딧)으로 본다
// (fast/route.ts:70). CONTENT_MATCH 는 그 집합 밖이므로 표준 QUESTION_GEN_SINGLE
// 이다 — 여기를 어기면 fast/md 사이에 크레딧이 어긋난다(1차 승차에서 실제로 잡힌 사고).
// ============================================================================

import {
  readContentMatchAnswerCountSetting,
  readContentMatchOptionCountSetting,
  readContentMatchTypeSetting,
  readOptionLanguageSetting,
  readStemLanguageSetting,
  type ContentMatchPolarity,
} from "@/lib/question-type-generation-settings";
import {
  buildMdContentMatchPrompt,
  clampContentMatchMdAnswerCount,
  clampContentMatchMdOptionCount,
  CONTENT_MATCH_MD_ANSWER_COUNT_MIN,
  CONTENT_MATCH_MD_OPTION_COUNT_MAX,
  CONTENT_MATCH_MD_OPTION_COUNT_MIN,
} from "./prompts-content-match";
import {
  autoSnapContentMatchEvidence,
  parseMdContentMatch,
  type MdContentMatchQuestion,
} from "./parser-content-match";
import { contentMatchGateAdvisories, gateMdContentMatch } from "./gate-content-match";
import { adaptMdContentMatchToAiQuestion } from "./adapter-content-match";
import type { MdLane, MdLaneContext, MdLaneParsed } from "./lane-types";

// 개수·극성은 resolved(fast 와 동일 결정 소스)를 1순위로 읽고, 값이 없을 때만
// raw 리더로 폴백한다 — 레인이 자체 기본값을 만들면 "설정 무시" 버그가 난다.
function optionCountOf(ctx: MdLaneContext): number {
  const resolved = (ctx.resolved as { contentMatchOptionCount?: number }).contentMatchOptionCount;
  return clampContentMatchMdOptionCount(
    resolved ?? readContentMatchOptionCountSetting(ctx.rawTypeSettings),
  );
}

function answerCountOf(ctx: MdLaneContext): number {
  const optionCount = optionCountOf(ctx);
  const resolved = (ctx.resolved as { contentMatchAnswerCount?: number }).contentMatchAnswerCount;
  return clampContentMatchMdAnswerCount(
    resolved ?? readContentMatchAnswerCountSetting(ctx.rawTypeSettings, optionCount),
    optionCount,
  );
}

/**
 * 정답 극성. resolved 를 1순위로 읽고(fast 와 동일 결정 소스), 없으면 raw 리더로
 * 폴백한다 — 리더의 기본값은 "불일치"(수능 표준형)다.
 */
function matchTypeOf(ctx: MdLaneContext): ContentMatchPolarity {
  const resolved = (ctx.resolved as { contentMatchType?: unknown }).contentMatchType;
  if (resolved === "일치" || resolved === "불일치") return resolved;
  return readContentMatchTypeSetting(ctx.rawTypeSettings);
}

function stemLanguageOf(ctx: MdLaneContext): "ko" | "en" {
  return readStemLanguageSetting(ctx.rawTypeSettings, "CONTENT_MATCH") === "en" ? "en" : "ko";
}

function optionLanguageOf(ctx: MdLaneContext): "ko" | "en" {
  return readOptionLanguageSetting(ctx.rawTypeSettings, "CONTENT_MATCH") === "ko" ? "ko" : "en";
}

export const CONTENT_MATCH_MD_LANE: MdLane = {
  subType: "CONTENT_MATCH",

  // ⚠ fast 레인 getOperationType 과 동기 — 어휘 계열이 아니므로 표준 2크레딧.
  operationType: "QUESTION_GEN_SINGLE",

  // 신형식 초기 반려율 실측이 없으므로 보수 정책(신형 도입기 규약).
  retryEligible: true,

  isEligible(resolved) {
    const optionCount = Number(
      (resolved as { contentMatchOptionCount?: number }).contentMatchOptionCount ??
        CONTENT_MATCH_MD_OPTION_COUNT_MIN,
    );
    const answerCount = Number(
      (resolved as { contentMatchAnswerCount?: number }).contentMatchAnswerCount ??
        CONTENT_MATCH_MD_ANSWER_COUNT_MIN,
    );
    return (
      Number.isFinite(optionCount) &&
      Number.isFinite(answerCount) &&
      optionCount >= CONTENT_MATCH_MD_OPTION_COUNT_MIN &&
      optionCount <= CONTENT_MATCH_MD_OPTION_COUNT_MAX &&
      answerCount >= CONTENT_MATCH_MD_ANSWER_COUNT_MIN &&
      answerCount <= optionCount
    );
  },

  buildBasePrompt(ctx) {
    return buildMdContentMatchPrompt(ctx.passage, "full", ctx.difficulty, {
      optionCount: optionCountOf(ctx),
      answerCount: answerCountOf(ctx),
      matchType: matchTypeOf(ctx),
      optionLanguage: optionLanguageOf(ctx),
    });
  },

  buildExtras() {
    // 이 유형의 설정은 전부 base 프롬프트 본문(정답 규약·진술 언어)과 어댑터
    // (발문 문형·극성·정답 개수)가 집행한다. 특히 **발문 언어(stemLanguage)는
    // 프롬프트 블록을 쓰지 않는다** — 모델이 발문을 쓰지 않고 어댑터가 결정론으로
    // 합성하므로, 언어 블록을 덧붙이면 모델이 발문 줄을 만들어 형식만 흔든다.
    // 교사 포인트·다양성·커스텀·반려 피드백은 라우트가 뒤에 붙인다.
    return [];
  },

  parseAndGate(text, ctx) {
    const parsed = parseMdContentMatch(text);
    const snapped = autoSnapContentMatchEvidence(parsed, ctx.passage);
    const q = snapped.question;
    const gateOptions = {
      optionCount: optionCountOf(ctx),
      answerCount: answerCountOf(ctx),
      optionLanguage: optionLanguageOf(ctx),
      teacherPoints: ctx.teacherPoints,
    };
    const gateIssues = gateMdContentMatch(q, ctx.passage, gateOptions);
    return {
      question: q,
      gateIssues,
      // #5 길이 편중은 26-08-22 기출 실측(191문항 중 3건 발화·2023 수능 본시험
      // 포함)으로 비차단 강등 — 반려가 아니라 잡 result.mdCorrections 포렌식으로만
      // 남긴다. 이미 반려된 문항에는 붙이지 않는다(lane-summary-mc 와 동일 규칙 —
      // 재생성 피드백 옆에 놓이면 소음이다).
      corrections: [
        ...snapped.corrections,
        ...(gateIssues.length === 0 ? contentMatchGateAdvisories(q, gateOptions) : []),
      ],
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    return adaptMdContentMatchToAiQuestion(
      parsed.question as MdContentMatchQuestion,
      ctx.passage,
      ctx.rawDifficulty,
      {
        matchType: matchTypeOf(ctx),
        answerCount: answerCountOf(ctx),
        stemLanguage: stemLanguageOf(ctx),
      },
    );
  },

  qualityArgs(ctx) {
    // contentMatchType 은 dispatcher.ts:869 의 극성 게이트 스위치다. 어댑터가 발문을
    // 결정론으로 합성하므로 이 검사는 항상 통과해야 정상이며, 실패하면 어댑터 회귀다.
    // ⚠ genericOptionCount 는 넘기지 않는다 — validateOptions 가 그 값을 5~? 범위로
    //   클램프해 기대 선지 수로 쓰는데, CONTENT_MATCH 는 getExpectedOptionCount 가
    //   실제 선지 수(5~12)를 읽는 전용 분기를 이미 갖고 있다(options.ts:79).
    return {
      contentMatchType: matchTypeOf(ctx),
      stemLanguage: stemLanguageOf(ctx),
      optionLanguage: optionLanguageOf(ctx),
    };
  },

  mdFormat(ctx) {
    return {
      optionCount: optionCountOf(ctx),
      answerCount: answerCountOf(ctx),
      matchType: matchTypeOf(ctx),
      optionLanguage: optionLanguageOf(ctx),
    };
  },

  diversityTargets(structuredData) {
    // 회피 표적은 **이미 출제된 정답 진술** 이다(지문 축자가 아니다).
    // 순서 유형에서 확인된 함정 — 지문 축자를 회피 목록에 실으면 "지문을 그대로
    // 써라"는 하드 계약과 충돌해 재생성이 같은 반려로 수렴한다 — 을 피한 선택이다.
    // 이 유형에는 특정 지문 구간을 강제하는 게이트가 없으므로(근거는 서로 다르기만
    // 하면 된다) 정답 진술 회피는 어떤 게이트와도 충돌하지 않는다.
    const options = structuredData.options;
    if (!Array.isArray(options)) return [];
    const labels = new Set<string>();
    const push = (value: unknown) => {
      const text = typeof value === "string" ? value.trim() : "";
      if (text) labels.add(text);
    };
    if (Array.isArray(structuredData.correctAnswers)) {
      for (const value of structuredData.correctAnswers) push(value);
    } else if (typeof structuredData.correctAnswer === "string") {
      for (const part of structuredData.correctAnswer.split(",")) push(part);
    }
    if (labels.size === 0) return [];
    const targets: string[] = [];
    for (const option of options as Array<Record<string, unknown>>) {
      const label = typeof option?.label === "string" ? option.label.trim() : "";
      const text = typeof option?.text === "string" ? option.text.trim() : "";
      if (label && text && labels.has(label)) targets.push(text.slice(0, 90));
    }
    return targets;
  },
};
