// ============================================================================
// 요지·주장(MAIN_IDEA) md 레인 디스크립터.
// 견본: lane-antonym.ts / 인터페이스: ./lane-types.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md §4-7(선택형 확정 형식)
//
// 지문을 변형하지 않는 선택형 계열이라 md 계약이 가장 짧다. 대신 설정 노브가
// 다섯(선지수·정답수·정답극성·발문언어·선지언어)이라 집행 지점을 갈라 두었다:
//   optionCount / answerCount / answerPolarity / optionLanguage → 베이스 프롬프트
//   optionCount / answerCount / optionLanguage / teacherPoints  → 0원 게이트
//   answerPolarity / stemLanguage / answerCount / 발문축         → 어댑터 발문(결정형)
//
// ⚠ 후처리 없음(PASSTHROUGH_TYPES) — 어댑터가 완제품을 낸다.
// ⚠ 과금은 fast 레인 getOperationType 과 동기. MAIN_IDEA 는 VOCAB_TYPES 밖이므로
//   표준 2크레딧(QUESTION_GEN_SINGLE)이다.
// ============================================================================

import {
  readOptionLanguageSetting,
  readStemLanguageSetting,
} from "@/lib/question-type-generation-settings";
import {
  buildMdMainIdeaPrompt,
  clampMainIdeaMdAnswerCount,
  clampMainIdeaMdOptionCount,
  MAIN_IDEA_MD_ANSWER_COUNT_DEFAULT,
  MAIN_IDEA_MD_OPTION_COUNT_DEFAULT,
  MAIN_IDEA_MD_OPTION_COUNT_MAX,
  MAIN_IDEA_MD_OPTION_COUNT_MIN,
  type MainIdeaOptionLanguage,
  type MainIdeaPolarity,
} from "./prompts-main-idea";
import {
  autoSnapMainIdea,
  parseMdMainIdea,
  type MdMainIdeaQuestion,
} from "./parser-main-idea";
import { gateMdMainIdea } from "./gate-main-idea";
import { adaptMdMainIdeaToAiQuestion } from "./adapter-main-idea";
import type { MdLane, MdLaneContext, MdLaneParsed } from "./lane-types";

interface MainIdeaResolved {
  genericOptionCount?: number;
  genericAnswerCount?: number;
  answerPolarity?: MainIdeaPolarity;
}

function optionCountOf(ctx: MdLaneContext): number {
  return clampMainIdeaMdOptionCount(
    (ctx.resolved as MainIdeaResolved).genericOptionCount ??
      MAIN_IDEA_MD_OPTION_COUNT_DEFAULT,
  );
}

function answerCountOf(ctx: MdLaneContext): number {
  return clampMainIdeaMdAnswerCount(
    (ctx.resolved as MainIdeaResolved).genericAnswerCount ??
      MAIN_IDEA_MD_ANSWER_COUNT_DEFAULT,
    optionCountOf(ctx),
  );
}

/** 대의파악 계열 극성 토글 — 미설정(POSITIVE)이면 리졸버가 키를 아예 안 싣는다. */
function isNegativeOf(ctx: MdLaneContext): boolean {
  return (ctx.resolved as MainIdeaResolved).answerPolarity === "NEGATIVE";
}

/** 선지 언어 — MAIN_IDEA 기본은 한국어 진술문(language.ts:20). */
function optionLanguageOf(ctx: MdLaneContext): MainIdeaOptionLanguage {
  return readOptionLanguageSetting(ctx.rawTypeSettings, "MAIN_IDEA") === "en" ? "en" : "ko";
}

function stemLanguageOf(ctx: MdLaneContext): "ko" | "en" {
  return readStemLanguageSetting(ctx.rawTypeSettings, "MAIN_IDEA") === "en" ? "en" : "ko";
}

export const MAIN_IDEA_MD_LANE: MdLane = {
  subType: "MAIN_IDEA",

  // ⚠ fast 레인 getOperationType 과 동기(fast/route.ts:70 VOCAB_TYPES =
  // {CONTEXT_MEANING, SYNONYM, ANTONYM}). MAIN_IDEA 는 그 집합 밖이므로 2크레딧이다.
  // 여기를 QUESTION_GEN_VOCAB 로 "고쳐" 두면 fast 폴백과 요금이 갈린다.
  operationType: "QUESTION_GEN_SINGLE",

  // 신형식 초기 반려율 실측이 없으므로 보수 정책(어법 도입기와 동일).
  retryEligible: true,

  isEligible(resolved) {
    const r = resolved as MainIdeaResolved;
    const optionCount = Number(r.genericOptionCount ?? MAIN_IDEA_MD_OPTION_COUNT_DEFAULT);
    const answerCount = Number(r.genericAnswerCount ?? MAIN_IDEA_MD_ANSWER_COUNT_DEFAULT);
    return (
      Number.isFinite(optionCount) &&
      Number.isFinite(answerCount) &&
      optionCount >= MAIN_IDEA_MD_OPTION_COUNT_MIN &&
      optionCount <= MAIN_IDEA_MD_OPTION_COUNT_MAX &&
      answerCount >= 1 &&
      answerCount <= optionCount - 1
    );
  },

  buildBasePrompt(ctx) {
    return buildMdMainIdeaPrompt(ctx.passage, "full", ctx.difficulty, {
      optionCount: optionCountOf(ctx),
      answerCount: answerCountOf(ctx),
      polarity: isNegativeOf(ctx) ? "NEGATIVE" : "POSITIVE",
      optionLanguage: optionLanguageOf(ctx),
    });
  },

  buildExtras(ctx) {
    // 설정 다섯 개는 전부 베이스 프롬프트·게이트·어댑터에서 집행된다(상단 표).
    // 특히 발문은 모델이 만들지 않으므로 질문 언어 블록은 붙이지 않는다 —
    // 존재하지 않는 필드를 지시하는 블록이 되기 때문이다.
    //
    // 유일한 예외가 교사 지정 포인트다. 라우트가 뒤에 붙이는 공유 블록
    // (question-generation-prompt-contract.ts:34)이 이미 "정답 위치(… 근거 문장)로
    // 반드시 사용하라"고 선언하므로, 이 유형에서 그 선언이 어느 줄로 떨어지는지를
    // 한 줄로 못박아 게이트(#10)와 지시를 같은 자리에 맞춘다.
    if (ctx.teacherPoints.length === 0) return [];
    return [
      [
        "## 교사 지정 근거 문장 — `근거:` 줄 집행 (필수)",
        "- 아래 '교사 지정 출제 포인트' 블록의 문장 중 **하나를 그대로** `근거:` 줄에 옮겨라. 다른 문장을 고르면 기계 검사에서 반려된다.",
        "- 지정 문장이 여럿이면 정답 논지가 가장 압축된 것을 `근거:` 로 쓰고, 나머지 문장의 논지도 정답 선지와 해설에 반영하라.",
      ].join("\n"),
    ];
  },

  parseAndGate(text, ctx) {
    const snapped = autoSnapMainIdea(parseMdMainIdea(text), ctx.passage);
    const q = snapped.question;
    return {
      question: q,
      gateIssues: gateMdMainIdea(q, ctx.passage, {
        optionCount: optionCountOf(ctx),
        answerCount: answerCountOf(ctx),
        optionLanguage: optionLanguageOf(ctx),
        teacherPoints: ctx.teacherPoints.map((point) => point.text),
      }),
      corrections: snapped.corrections,
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    return adaptMdMainIdeaToAiQuestion(
      parsed.question as MdMainIdeaQuestion,
      ctx.passage,
      ctx.rawDifficulty,
      {
        negative: isNegativeOf(ctx),
        stemLanguage: stemLanguageOf(ctx),
      },
    );
  },

  qualityArgs(ctx) {
    return {
      genericOptionCount: optionCountOf(ctx),
      genericAnswerCount: answerCountOf(ctx),
      // 미설정(POSITIVE)이면 키를 싣지 않는다 — dispatcher 의 극성 게이트는
      // "NEGATIVE 일 때만" 동작하는 계약이라 기본 경로 동작이 불변이어야 한다.
      ...(isNegativeOf(ctx) ? { answerPolarity: "NEGATIVE" as const } : {}),
      stemLanguage: stemLanguageOf(ctx),
      optionLanguage: optionLanguageOf(ctx),
    };
  },

  mdFormat(ctx) {
    return {
      optionCount: optionCountOf(ctx),
      answerCount: answerCountOf(ctx),
      answerPolarity: isNegativeOf(ctx) ? "NEGATIVE" : "POSITIVE",
      optionLanguage: optionLanguageOf(ctx),
      teacherPointCount: ctx.teacherPoints.length,
    };
  },

  diversityTargets(structuredData) {
    // ⚠ 이 유형은 **정답 진술을 회피 표적으로 내보내면 안 된다.** 라우트는 이 배열을
    //   `## 표적 회피 — 이미 출제된 자리(정답·빈칸이 겹치지 않게 하라)` 헤더 아래에
    //   그대로 싣는데(md-stream/route.ts:706), 한 지문의 요지는 하나뿐이라 "이전 정답을
    //   피하라"는 지시는 곧 "틀린 요지를 골라라"가 된다. 순서 유형이 축자 회피 목록으로
    //   자기모순에 빠졌던 사고(lane-order.ts diversityTargets 주석)와 같은 계통이다.
    //   → 표적 대신 **회피의 정확한 범위**를 한 줄로 실어 헤더의 오해를 상쇄한다.
    //     (라우트가 항목당 90자로 자르므로 한 줄에 담기는 길이로 유지할 것.)
    const options = structuredData.options;
    if (!Array.isArray(options) || options.length === 0) return [];
    if (typeof structuredData.correctAnswer !== "string" || !structuredData.correctAnswer.trim()) {
      return [];
    }
    return ["같은 지문이므로 논지는 그대로 두되, 정답 진술의 어휘·문형과 오답 기제 조합을 새로 짜라"];
  },
};
