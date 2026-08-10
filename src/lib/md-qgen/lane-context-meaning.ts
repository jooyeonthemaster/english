// ============================================================================
// 문맥 속 의미(CONTEXT_MEANING) md 레인 디스크립터.
// 견본: lane-antonym.ts / 인터페이스: ./lane-types.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md
//
// ★ 과금 축(정찰 확정 R1 의 직접 대상): fast 레인 getOperationType 의
//   VOCAB_TYPES = {CONTEXT_MEANING, SYNONYM, ANTONYM} → QUESTION_GEN_VOCAB(1크레딧).
//   md-stream 라우트는 QUESTION_GEN_SINGLE(2크레딧)을 기본값으로 갖고 있으므로,
//   이 값을 레인이 명시하지 않으면 문맥 속 의미가 **2배로 이중 청구**되고
//   클라이언트 견적(1)과도 어긋난다.
// ============================================================================

import {
  readGenericAnswerCountSetting,
  readGenericOptionCountSetting,
  readOptionLanguageSetting,
  readStemLanguageSetting,
} from "@/lib/question-type-generation-settings";
import { normalizeWs } from "./parser";
import {
  buildMdContextMeaningPrompt,
  clampContextMeaningMdAnswerCount,
  clampContextMeaningMdOptionCount,
  CONTEXT_MEANING_MD_ANSWER_COUNT_DEFAULT,
  CONTEXT_MEANING_MD_ANSWER_COUNT_MIN,
  CONTEXT_MEANING_MD_OPTION_COUNT_DEFAULT,
  CONTEXT_MEANING_MD_OPTION_COUNT_MAX,
  CONTEXT_MEANING_MD_OPTION_COUNT_MIN,
} from "./prompts-context-meaning";
import {
  autoSnapContextMeaningTarget,
  parseMdContextMeaning,
  type MdContextMeaningQuestion,
} from "./parser-context-meaning";
import { gateMdContextMeaning } from "./gate-context-meaning";
import {
  adaptMdContextMeaningToAiQuestion,
  CONTEXT_MEANING_MD_DIRECTION_MULTI,
} from "./adapter-context-meaning";
import type { MdLane, MdLaneContext, MdLaneParsed } from "./lane-types";

const CONTEXT_MEANING_DIRECTION_EN_SINGLE =
  "Which of the following is closest in meaning to the underlined word in context?";
/** "all" 이 있어야 generic-multi-answer-direction 게이트를 통과한다. */
const CONTEXT_MEANING_DIRECTION_EN_MULTI =
  "Choose all the meanings that fit the underlined word in this context.";

interface ContextMeaningResolved {
  genericOptionCount?: number;
  genericAnswerCount?: number;
}

function optionCountOf(ctx: MdLaneContext): number {
  return clampContextMeaningMdOptionCount(
    (ctx.resolved as ContextMeaningResolved).genericOptionCount ??
      CONTEXT_MEANING_MD_OPTION_COUNT_DEFAULT,
  );
}

function answerCountOf(ctx: MdLaneContext): number {
  return clampContextMeaningMdAnswerCount(
    (ctx.resolved as ContextMeaningResolved).genericAnswerCount ??
      CONTEXT_MEANING_MD_ANSWER_COUNT_DEFAULT,
    optionCountOf(ctx),
  );
}

function optionLanguageOf(ctx: MdLaneContext): "ko" | "en" {
  return readOptionLanguageSetting(ctx.rawTypeSettings, "CONTEXT_MEANING") === "ko"
    ? "ko"
    : "en";
}

function stemLanguageOf(ctx: MdLaneContext): "ko" | "en" {
  return readStemLanguageSetting(ctx.rawTypeSettings, "CONTEXT_MEANING") === "en"
    ? "en"
    : "ko";
}

/**
 * 교사 지정 준수 게이트 — 이 유형은 POINT_PICKER_CONFIG 미등재(v1 의도적 미등재,
 * point-picker-config.ts:72-73)라 실제로는 teacherPoints 가 항상 비어 온다
 * (clampTeacherPoints 가 미등재 유형에 [] 를 돌려준다). 그래도 방어적으로 구현해
 * 둔다: 픽커가 열리면 "지정 표현이 밑줄이어야 한다"가 이 유형의 유일한 결정형
 * 준수 조건이기 때문이다.
 */
function teacherPointIssues(
  q: MdContextMeaningQuestion,
  ctx: MdLaneContext,
): string[] {
  if (ctx.teacherPoints.length === 0) return [];
  const target = normalizeWs(q.word).toLowerCase();
  const issues: string[] = [];
  for (const point of ctx.teacherPoints) {
    const pt = normalizeWs(point.text).toLowerCase();
    if (!pt) continue;
    if (!target || (!target.includes(pt) && !pt.includes(target))) {
      issues.push(`교사 지정 표현이 밑줄에 없음: '${point.text.slice(0, 60)}'`);
    }
  }
  return issues;
}

export const CONTEXT_MEANING_MD_LANE: MdLane = {
  subType: "CONTEXT_MEANING",

  // ⚠ fast 레인 getOperationType 과 동기 — 어휘 계열은 1크레딧이다.
  operationType: "QUESTION_GEN_VOCAB",

  // 신형식 초기 반려율 실측이 없으므로 보수 정책(어법 도입기와 동일).
  retryEligible: true,

  isEligible(resolved) {
    const r = resolved as ContextMeaningResolved;
    const optionCount = Number(
      r.genericOptionCount ?? CONTEXT_MEANING_MD_OPTION_COUNT_DEFAULT,
    );
    const answerCount = Number(
      r.genericAnswerCount ?? CONTEXT_MEANING_MD_ANSWER_COUNT_DEFAULT,
    );
    return (
      Number.isFinite(optionCount) &&
      Number.isFinite(answerCount) &&
      optionCount >= CONTEXT_MEANING_MD_OPTION_COUNT_MIN &&
      optionCount <= CONTEXT_MEANING_MD_OPTION_COUNT_MAX &&
      answerCount >= CONTEXT_MEANING_MD_ANSWER_COUNT_MIN &&
      answerCount <= optionCount - 1
    );
  },

  buildBasePrompt(ctx) {
    return buildMdContextMeaningPrompt(ctx.passage, "full", ctx.difficulty, {
      optionCount: optionCountOf(ctx),
      answerCount: answerCountOf(ctx),
      // 보기 언어는 base 프롬프트가 직접 집행한다 — 선지 작성 지시와 같은 자리에
      // 있어야 "base 는 영어를 시키고 extras 가 한국어로 뒤집는" 자기모순이 없다.
      optionLanguage: optionLanguageOf(ctx),
    });
  },

  buildExtras(ctx) {
    const extras: string[] = [];
    // 질문 언어 — md 레인의 확인된 기존 구멍(라우트에 stemLanguage 참조 0건)을
    // 레인에서 메운다. 보기 언어는 base 가 이미 집행했으므로 발문만 다룬다.
    if (stemLanguageOf(ctx) === "en") {
      extras.push(
        "## 질문 언어 (교사 설정, 필수)\n- 학생에게 보이는 발문은 영어로 낸다. 해설·오답 해설은 한국어 그대로 유지한다.",
      );
    }
    return extras;
  },

  parseAndGate(text, ctx) {
    const parsed = parseMdContextMeaning(text);
    const snapped = autoSnapContextMeaningTarget(parsed, ctx.passage);
    const q = snapped.question;
    return {
      question: q,
      gateIssues: [
        ...gateMdContextMeaning(q, ctx.passage, {
          optionCount: optionCountOf(ctx),
          answerCount: answerCountOf(ctx),
          optionLanguage: optionLanguageOf(ctx),
        }),
        ...teacherPointIssues(q, ctx),
      ],
      corrections: snapped.corrections,
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    const result = adaptMdContextMeaningToAiQuestion(
      parsed.question as MdContextMeaningQuestion,
      ctx.passage,
      ctx.rawDifficulty,
    );
    if (result.ok && result.aiQuestion && stemLanguageOf(ctx) === "en") {
      result.aiQuestion.direction =
        result.aiQuestion.direction === CONTEXT_MEANING_MD_DIRECTION_MULTI
          ? CONTEXT_MEANING_DIRECTION_EN_MULTI
          : CONTEXT_MEANING_DIRECTION_EN_SINGLE;
    }
    return result;
  },

  qualityArgs(ctx) {
    return {
      genericOptionCount: optionCountOf(ctx),
      genericAnswerCount: answerCountOf(ctx),
      stemLanguage: stemLanguageOf(ctx),
      optionLanguage: optionLanguageOf(ctx),
    };
  },

  mdFormat(ctx) {
    return {
      optionCount: optionCountOf(ctx),
      answerCount: answerCountOf(ctx),
      optionLanguage: optionLanguageOf(ctx),
    };
  },

  diversityTargets(structuredData) {
    // question-diversity.ts:148-150 이 이 유형의 회피 표적으로 읽는 필드와 동일 축.
    const target = structuredData.underlinedWord;
    return typeof target === "string" && target.trim()
      ? [target.trim().slice(0, 90)]
      : [];
  },
};

// 설정 리더 재수출 — 라우트는 lane 인터페이스만 소비하지만, 벤치·픽스처가
// "UI 설정 → resolved" 경로를 직접 재현할 때 쓴다(견본 lane-antonym 동형).
export { readGenericAnswerCountSetting, readGenericOptionCountSetting };
