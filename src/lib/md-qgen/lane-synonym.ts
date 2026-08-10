// ============================================================================
// 동의어(SYNONYM) md 레인 디스크립터.
// 견본: lane-antonym.ts / 인터페이스: ./lane-types.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md
//
// ⚠ 과금 축(최우선 확인 사항): fast 레인 getOperationType 의
//   VOCAB_TYPES = {CONTEXT_MEANING, SYNONYM, ANTONYM} 에 SYNONYM 이 **포함**된다
//   (fast/route.ts:70 실측). 따라서 QUESTION_GEN_VOCAB(1크레딧)이다.
//   md-stream 이 QUESTION_GEN_SINGLE(2크레딧)을 하드코딩하던 시절의 값을 그대로
//   두면 동의어가 fast 대비 2배로 이중 청구되고 클라이언트 견적(1)과도 어긋난다 —
//   1차 승차에서 반의어가 실제로 그 사고를 냈다(정찰 확정 R1).
// ============================================================================

import {
  readGenericAnswerCountSetting,
  readGenericOptionCountSetting,
  readStemLanguageSetting,
} from "@/lib/question-type-generation-settings";
import { normalizeWs } from "./parser";
import {
  buildMdSynonymPrompt,
  clampSynonymMdAnswerCount,
  clampSynonymMdOptionCount,
  SYNONYM_MD_ANSWER_COUNT_DEFAULT,
  SYNONYM_MD_ANSWER_COUNT_MIN,
  SYNONYM_MD_OPTION_COUNT_DEFAULT,
  SYNONYM_MD_OPTION_COUNT_MAX,
  SYNONYM_MD_OPTION_COUNT_MIN,
} from "./prompts-synonym";
import {
  autoSnapSynonymTarget,
  parseMdSynonym,
  type MdSynonymQuestion,
} from "./parser-synonym";
import { gateMdSynonym } from "./gate-synonym";
import {
  adaptMdSynonymToAiQuestion,
  SYNONYM_MD_DIRECTION_MULTI,
} from "./adapter-synonym";
import type { MdLane, MdLaneContext, MdLaneParsed } from "./lane-types";

const SYNONYM_DIRECTION_EN_SINGLE =
  "Which of the following is closest in meaning to the underlined word?";
/** "all" 이 있어야 dispatcher 의 generic-multi-answer-direction 게이트를 통과한다. */
const SYNONYM_DIRECTION_EN_MULTI =
  "Choose all the words that are closest in meaning to the underlined word.";

interface SynonymResolved {
  genericOptionCount?: number;
  genericAnswerCount?: number;
}

function optionCountOf(ctx: MdLaneContext): number {
  return clampSynonymMdOptionCount(
    (ctx.resolved as SynonymResolved).genericOptionCount ??
      SYNONYM_MD_OPTION_COUNT_DEFAULT,
  );
}

function answerCountOf(ctx: MdLaneContext): number {
  return clampSynonymMdAnswerCount(
    (ctx.resolved as SynonymResolved).genericAnswerCount ??
      SYNONYM_MD_ANSWER_COUNT_DEFAULT,
    optionCountOf(ctx),
  );
}

function stemLanguageOf(ctx: MdLaneContext): "ko" | "en" {
  return readStemLanguageSetting(ctx.rawTypeSettings, "SYNONYM") === "en"
    ? "en"
    : "ko";
}

/**
 * 보기 언어는 **구조 고정("en")** 이다.
 * getQuestionLanguageToggleScope("SYNONYM") === "stem" 이라(language.ts:64-79
 * OPTION_LANGUAGE_FREE_TYPE_IDS 미등재), 저장값이 무엇이든 languageSettingsForType
 * 이 기본값 en 을 돌려준다. 여기서 readOptionLanguageSetting 을 그대로 읽으면
 * 저장된 유령 값(ko)이 프롬프트·qualityArgs 로 새어 나가 fast 와 어긋난다.
 */
const SYNONYM_OPTION_LANGUAGE = "en" as const;

/**
 * 교사 지정 준수 게이트 — 이 유형은 POINT_PICKER_CONFIG 미등재라(point-picker-config.ts:72
 * "어휘 계열 중 SYNONYM(지문 미포함)은 v1 의도적 미등재") 실제로는 teacherPoints 가
 * 항상 비어 온다. 그래도 방어적으로 구현해 둔다: 나중에 픽커가 열리면 "지정 단어가
 * 대상 단어여야 한다" 가 이 유형의 유일한 결정형 준수 조건이기 때문이다.
 */
function teacherPointIssues(q: MdSynonymQuestion, ctx: MdLaneContext): string[] {
  if (ctx.teacherPoints.length === 0) return [];
  const target = normalizeWs(q.target).toLowerCase();
  const issues: string[] = [];
  for (const p of ctx.teacherPoints) {
    const pt = normalizeWs(p.text).toLowerCase();
    if (!pt) continue;
    if (!target || (!target.includes(pt) && !pt.includes(target))) {
      issues.push(`교사 지정 표현이 대상 단어가 아님: '${p.text.slice(0, 60)}'`);
    }
  }
  return issues;
}

export const SYNONYM_MD_LANE: MdLane = {
  subType: "SYNONYM",

  // fast 레인 getOperationType 과 동기 — 어휘 계열은 1크레딧이다(위 헤더 주석 참조).
  operationType: "QUESTION_GEN_VOCAB",

  // 신형식 초기 반려율 실측이 없으므로 보수 정책(어법 도입기와 동일).
  retryEligible: true,

  isEligible(resolved) {
    const r = resolved as SynonymResolved;
    const optionCount = Number(
      r.genericOptionCount ?? SYNONYM_MD_OPTION_COUNT_DEFAULT,
    );
    const answerCount = Number(
      r.genericAnswerCount ?? SYNONYM_MD_ANSWER_COUNT_DEFAULT,
    );
    return (
      Number.isFinite(optionCount) &&
      Number.isFinite(answerCount) &&
      optionCount >= SYNONYM_MD_OPTION_COUNT_MIN &&
      optionCount <= SYNONYM_MD_OPTION_COUNT_MAX &&
      answerCount >= SYNONYM_MD_ANSWER_COUNT_MIN &&
      answerCount <= optionCount - 1
    );
  },

  buildBasePrompt(ctx) {
    return buildMdSynonymPrompt(ctx.passage, "full", ctx.difficulty, {
      optionCount: optionCountOf(ctx),
      answerCount: answerCountOf(ctx),
    });
  },

  buildExtras(ctx) {
    const extras: string[] = [];
    // 질문 언어 — md 레인의 확인된 기존 구멍(라우트에 stemLanguage 참조 0건)을
    // 레인에서 메운다. 보기 언어는 이 유형에서 구조 고정(영어 단어 목록)이므로
    // 발문만 다룬다.
    if (stemLanguageOf(ctx) === "en") {
      extras.push(
        "## 질문 언어 (교사 설정, 필수)\n- 학생에게 보이는 발문은 영어로 낸다. 선지는 그대로 영어 단어·짧은 구이고, 해설·오답 해설은 한국어를 유지한다.",
      );
    }
    return extras;
  },

  parseAndGate(text, ctx) {
    const parsed = parseMdSynonym(text);
    const snapped = autoSnapSynonymTarget(parsed, ctx.passage);
    const q = snapped.question;
    return {
      question: q,
      gateIssues: [
        ...gateMdSynonym(q, ctx.passage, {
          optionCount: optionCountOf(ctx),
          answerCount: answerCountOf(ctx),
        }),
        ...teacherPointIssues(q, ctx),
      ],
      corrections: snapped.corrections,
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    const result = adaptMdSynonymToAiQuestion(
      parsed.question as MdSynonymQuestion,
      ctx.passage,
      ctx.rawDifficulty,
    );
    if (result.ok && result.aiQuestion && stemLanguageOf(ctx) === "en") {
      result.aiQuestion.direction =
        result.aiQuestion.direction === SYNONYM_MD_DIRECTION_MULTI
          ? SYNONYM_DIRECTION_EN_MULTI
          : SYNONYM_DIRECTION_EN_SINGLE;
    }
    return result;
  },

  qualityArgs(ctx) {
    return {
      genericOptionCount: optionCountOf(ctx),
      genericAnswerCount: answerCountOf(ctx),
      stemLanguage: stemLanguageOf(ctx),
      optionLanguage: SYNONYM_OPTION_LANGUAGE,
    };
  },

  mdFormat(ctx) {
    return {
      optionCount: optionCountOf(ctx),
      answerCount: answerCountOf(ctx),
      optionLanguage: SYNONYM_OPTION_LANGUAGE,
    };
  },

  /**
   * 같은 지문의 기존 동의어 문항이 쓴 대상 단어를 회피 목록으로 넘긴다.
   * question-diversity.ts:454 의 TARGET_NOUN_BY_SUBTYPE.SYNONYM = "대상 단어" 와
   * 같은 축이다(structuredData.targetWord).
   */
  diversityTargets(structuredData) {
    const target = structuredData.targetWord;
    return typeof target === "string" && target.trim()
      ? [target.trim().slice(0, 90)]
      : [];
  },
};

// 설정 리더 재수출 — 라우트는 lane 인터페이스만 소비하지만, 벤치·픽스처가
// "UI 설정 → resolved" 경로를 직접 재현할 때 쓴다(견본 lane-antonym 동형).
export { readGenericAnswerCountSetting, readGenericOptionCountSetting };
