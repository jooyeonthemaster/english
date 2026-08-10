// ============================================================================
// 주제/요지(TOPIC_MAIN_IDEA) md 레인 디스크립터.
// 견본: lane-antonym.ts / 인터페이스: ./lane-types.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md §4-7
//
// 설정 해석은 fast 와 동일한 결정 소스(resolveQuestionTypeGenerationSettings)를
// 그대로 읽는다 — md 가 자체 기본값을 만들면 "설정 무시" 버그가 난다(규범 §1-[2]).
//   genericOptionCount(4~8) · genericAnswerCount(1~N-1) · answerPolarity(NEGATIVE) ·
//   stemLanguage · optionLanguage
// 이 다섯이 이 유형 노브의 전부이고, 다섯 전부를 프롬프트·게이트·발문·검증 인자에
// 집행한다(설정 무시 구멍 0).
//
// ⚠ 보기 언어(optionLanguage)가 곧 문항 형식이다: en = 주제(영어 명사구 선지) /
//   ko = 요지(한국어 진술문 선지). 레거시 통합 유형이라 fast 는 이 선택을 모델에게
//   맡겼는데(question-prompts-mc.ts:483-489), 그러면 발문·선지·검증기 기대치가 세
//   갈래로 흩어진다. md 는 교사 설정으로 결정형 고정한다.
// ⚠ 교사 지정 포인트는 이 유형에서 **soft** 다 — point-picker-config.ts 의
//   COMPLIANCE_SURFACES 에 TOPIC_MAIN_IDEA 항목이 없어 fast 도 준수 판정을 하지
//   않는다("근거 문장이 정답 선지에 반영됐는가"는 결정형으로 판정 불가). 그래서
//   레인도 게이트를 걸지 않고, 라우트가 붙이는 공유 프롬프트 블록으로만 집행한다.
// ============================================================================

import {
  readOptionLanguageSetting,
  readStemLanguageSetting,
} from "@/lib/question-type-generation-settings";
import {
  TOPIC_MAIN_IDEA_MD_ANSWER_COUNT_DEFAULT,
  TOPIC_MAIN_IDEA_MD_ANSWER_COUNT_MIN,
  TOPIC_MAIN_IDEA_MD_OPTION_COUNT_DEFAULT,
  TOPIC_MAIN_IDEA_MD_OPTION_COUNT_MAX,
  TOPIC_MAIN_IDEA_MD_OPTION_COUNT_MIN,
  buildMdTopicMainIdeaPrompt,
  clampTopicMdAnswerCount,
  clampTopicMdOptionCount,
  type MdGistMode,
  type MdGistPolarity,
} from "./prompts-topic-main-idea";
import {
  autoSnapTopicMainIdea,
  parseMdTopicMainIdea,
  type MdTopicMainIdeaQuestion,
} from "./parser-topic-main-idea";
import { gateMdTopicMainIdea } from "./gate-topic-main-idea";
import { adaptMdTopicMainIdeaToAiQuestion } from "./adapter-topic-main-idea";
import type { MdLane, MdLaneContext, MdLaneParsed } from "./lane-types";

const SUB_TYPE = "TOPIC_MAIN_IDEA";

function optionCountOf(ctx: MdLaneContext): number {
  return clampTopicMdOptionCount(
    (ctx.resolved as { genericOptionCount?: number }).genericOptionCount ??
      TOPIC_MAIN_IDEA_MD_OPTION_COUNT_DEFAULT,
  );
}

function answerCountOf(ctx: MdLaneContext): number {
  return clampTopicMdAnswerCount(
    (ctx.resolved as { genericAnswerCount?: number }).genericAnswerCount ??
      TOPIC_MAIN_IDEA_MD_ANSWER_COUNT_DEFAULT,
    optionCountOf(ctx),
  );
}

/** 보기 언어 = 문항 형식(주제/요지). 상단 주석의 결정형 고정 지점. */
function gistModeOf(ctx: MdLaneContext): MdGistMode {
  return readOptionLanguageSetting(ctx.rawTypeSettings, SUB_TYPE) === "en"
    ? "TOPIC"
    : "MAIN_IDEA";
}

function polarityOf(ctx: MdLaneContext): MdGistPolarity {
  return (ctx.resolved as { answerPolarity?: string }).answerPolarity === "NEGATIVE"
    ? "NEGATIVE"
    : "POSITIVE";
}

function stemLanguageOf(ctx: MdLaneContext): "ko" | "en" {
  return readStemLanguageSetting(ctx.rawTypeSettings, SUB_TYPE) === "en" ? "en" : "ko";
}

export const TOPIC_MAIN_IDEA_MD_LANE: MdLane = {
  subType: SUB_TYPE,

  // ⚠ fast 레인 getOperationType(question-generation/fast/route.ts:90-98) 과 동기.
  // VOCAB_TYPES={CONTEXT_MEANING,SYNONYM,ANTONYM} 에 없는 유형이므로 표준 2크레딧이다.
  // 여기서 어휘 계열 값을 쓰면 과소 청구, 반대면 이중 청구가 된다(정찰 확정 R1).
  operationType: "QUESTION_GEN_SINGLE",

  // 신형식 초기 반려율 실측이 없으므로 보수 정책(어법 도입기와 동일).
  retryEligible: true,

  isEligible(resolved) {
    const optionCount = Number(
      (resolved as { genericOptionCount?: number }).genericOptionCount ??
        TOPIC_MAIN_IDEA_MD_OPTION_COUNT_DEFAULT,
    );
    const answerCount = Number(
      (resolved as { genericAnswerCount?: number }).genericAnswerCount ??
        TOPIC_MAIN_IDEA_MD_ANSWER_COUNT_DEFAULT,
    );
    return (
      Number.isFinite(optionCount) &&
      optionCount >= TOPIC_MAIN_IDEA_MD_OPTION_COUNT_MIN &&
      optionCount <= TOPIC_MAIN_IDEA_MD_OPTION_COUNT_MAX &&
      Number.isFinite(answerCount) &&
      answerCount >= TOPIC_MAIN_IDEA_MD_ANSWER_COUNT_MIN &&
      // 오답이 최소 1개는 남아야 문항이 성립한다(정답이 선지 전부인 설정은 부적격).
      answerCount <= optionCount - 1
    );
  },

  buildBasePrompt(ctx) {
    return buildMdTopicMainIdeaPrompt(ctx.passage, "full", ctx.difficulty, {
      optionCount: optionCountOf(ctx),
      answerCount: answerCountOf(ctx),
      gistMode: gistModeOf(ctx),
      polarity: polarityOf(ctx),
      stemLanguage: stemLanguageOf(ctx),
    });
  },

  buildExtras(ctx) {
    const extras: string[] = [];
    // 발문·선지 언어는 base 프롬프트가 이미 확정 문장으로 박아 두었다(발문은 서버
    // 확정, 선지 형식은 gistMode). 여기서는 해설 언어만 못 박는다 — 발문이 영어일 때
    // 모델이 해설까지 영어로 쓰는 실측 드리프트를 막는다.
    if (stemLanguageOf(ctx) === "en") {
      extras.push(
        `## 질문 언어 (교사 설정, 필수)\n- 학생에게 보이는 발문은 위에 제시된 영어 문장 그대로다(서버가 확정한다).\n- 해설·오답 해설은 한국어로 유지한다.`,
      );
    }
    return extras;
  },

  parseAndGate(text, ctx) {
    const parsed = parseMdTopicMainIdea(text);
    const snapped = autoSnapTopicMainIdea(parsed, ctx.passage);
    return {
      question: snapped.question,
      gateIssues: gateMdTopicMainIdea(snapped.question, ctx.passage, {
        optionCount: optionCountOf(ctx),
        answerCount: answerCountOf(ctx),
        gistMode: gistModeOf(ctx),
      }),
      corrections: snapped.corrections,
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    return adaptMdTopicMainIdeaToAiQuestion(
      parsed.question as MdTopicMainIdeaQuestion,
      ctx.passage,
      ctx.rawDifficulty,
      {
        gistMode: gistModeOf(ctx),
        polarity: polarityOf(ctx),
        stemLanguage: stemLanguageOf(ctx),
      },
    );
  },

  qualityArgs(ctx) {
    const polarity = polarityOf(ctx);
    return {
      // dispatcher.ts:805 validateOptions 가 이 값으로 선지 개수를 검사하고,
      // :810-821 이 복수 정답 라벨 수를 검사한다(기본 5·1이면 종전과 같은 값).
      genericOptionCount: optionCountOf(ctx),
      genericAnswerCount: answerCountOf(ctx),
      // NEGATIVE 일 때만 극성 게이트가 돈다(:877-885). POSITIVE 는 키 미주입 =
      // 기존 동작 그대로.
      ...(polarity === "NEGATIVE" ? { answerPolarity: polarity } : {}),
      stemLanguage: readStemLanguageSetting(ctx.rawTypeSettings, SUB_TYPE),
      optionLanguage: readOptionLanguageSetting(ctx.rawTypeSettings, SUB_TYPE),
    };
  },

  mdFormat(ctx) {
    return {
      optionCount: optionCountOf(ctx),
      answerCount: answerCountOf(ctx),
      gistMode: gistModeOf(ctx),
      polarity: polarityOf(ctx),
    };
  },

  /**
   * ⚠ 이 유형은 **정답 선지를 회피 표적으로 내보내면 안 된다.** 라우트는 이 배열을
   *   `## 표적 회피 — 이미 출제된 자리(정답·빈칸이 겹치지 않게 하라)` 헤더 아래에
   *   그대로 싣는데(md-stream/route.ts), 한 지문의 요지·주제는 하나뿐이라
   *   "그 요지를 피하라"는 지시는 곧 "틀린 정답을 만들라"가 된다(순서 유형에서
   *   실제로 같은 계통의 자멸이 있었다 — lane-order.ts 주석 참조).
   *   반복을 실제로 줄여야 하는 것은 **미끼**다. 같은 지문으로 두 번째 문항을 만들 때
   *   이전 오답 선지를 그대로 재사용하면 두 문항이 사실상 같은 문항이 된다.
   */
  diversityTargets(structuredData) {
    const options = structuredData.options;
    if (!Array.isArray(options)) return [];
    const answerLabels = new Set<string>();
    const push = (value: unknown) => {
      if (typeof value !== "string") return;
      for (const part of value.split(",")) {
        const token = part.trim();
        if (token) answerLabels.add(token);
      }
    };
    push(structuredData.correctAnswer);
    if (Array.isArray(structuredData.correctAnswers)) {
      for (const value of structuredData.correctAnswers) push(value);
    }
    const targets: string[] = [];
    for (const option of options as Array<Record<string, unknown>>) {
      const label = typeof option?.label === "string" ? option.label.trim() : "";
      const text = typeof option?.text === "string" ? option.text.trim() : "";
      if (!text || (label && answerLabels.has(label))) continue;
      // 라우트가 90자로 자르므로 접두어를 포함해 그 안에 들어오게 자른다.
      targets.push(`이미 쓴 미끼: ${text.slice(0, 60)}`);
    }
    return targets;
  },
};
