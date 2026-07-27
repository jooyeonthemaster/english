// ============================================================================
// 주제 추론(TOPIC) md 레인 디스크립터.
// 견본: lane-antonym.ts / 인터페이스: ./lane-types.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md §4-7
//
// 이 유형의 설정 노브는 셋이다 — 선지 개수(4~8) · 정답 개수(1~N-1) · 정답 극성
// (적절한 것/적절하지 않은 것). 셋 다 **프롬프트 본문에 직접 박아** 집행하고,
// 개수는 게이트가 실값으로 재검사한다. 발문 언어·선지 언어는 아래 참조:
//
//   설정            프롬프트          게이트/어댑터
//   optionCount     선지 스캐폴드 N줄  게이트 #1 정확값 · qualityArgs.genericOptionCount
//   answerCount     정답 줄 형식·오답 수 게이트 #5/#7 · qualityArgs.genericAnswerCount
//   answerPolarity  선지 설계 블록 반전 어댑터 발문(부정형) · qualityArgs.answerPolarity
//   optionLanguage  선지 표면 블록      게이트 #3 언어 축(검증기 error 의 게이트 승격)
//   stemLanguage    ─(모델에게 안 맡김) **어댑터가 결정론으로 발문을 만든다**
//
// ⚠ 발문을 모델에게 받지 않는 것이 이 레인의 설계 결정이다. 발문은 (극성 × 정답
//   개수 × 발문 언어)의 순수 함수라 코드가 만들 수 있고, 그러면 검증기 세 개
//   (topic-direction-mismatch · gist-polarity-direction-mismatch ·
//   generic-multi-answer-direction)가 구조적으로 통과한다. 모델이 만들 수 있었던
//   실패 모드 하나를 통째로 제거한 것 — 철칙 1(한 정보는 한 곳에서만)의 적용이다.
//
// ⚠ 교사 지정 포인트(근거 문장 1~3)는 **프롬프트 전담**이다. fast 도 이 유형을
//   soft 로 둔다(point-picker-config.ts checkTeacherPointCompliance 의
//   COMPLIANCE_SURFACES 에 TOPIC 항목이 없어 항상 통과). 지문을 변형하지 않는
//   유형이라 "지정 문장이 반영됐는가"를 결정형으로 판정할 표면이 존재하지 않기
//   때문이다. 없는 판정을 흉내 내면 정상 문항을 반려해 재생성비만 태운다.
// ============================================================================

import {
  GENERIC_ANSWER_COUNT_MIN,
  GENERIC_ANSWER_COUNT_DEFAULT,
  GENERIC_OPTION_COUNT_DEFAULT,
  GENERIC_OPTION_COUNT_MAX,
  GENERIC_OPTION_COUNT_MIN,
  readOptionLanguageSetting,
  readStemLanguageSetting,
} from "@/lib/question-type-generation-settings";
import {
  buildMdTopicPrompt,
  clampTopicMdAnswerCount,
  clampTopicMdOptionCount,
  type TopicMdOptionLanguage,
  type TopicMdPolarity,
} from "./prompts-topic";
import { autoSnapTopicOptions, parseMdTopic, type MdTopicQuestion } from "./parser-topic";
import { gateMdTopic } from "./gate-topic";
import { adaptMdTopicToAiQuestion } from "./adapter-topic";
import type { MdLane, MdLaneContext, MdLaneParsed } from "./lane-types";

function optionCountOf(ctx: MdLaneContext): number {
  return clampTopicMdOptionCount(
    (ctx.resolved as { genericOptionCount?: number }).genericOptionCount ??
      GENERIC_OPTION_COUNT_DEFAULT,
  );
}

function answerCountOf(ctx: MdLaneContext): number {
  return clampTopicMdAnswerCount(
    (ctx.resolved as { genericAnswerCount?: number }).genericAnswerCount ??
      GENERIC_ANSWER_COUNT_DEFAULT,
    optionCountOf(ctx),
  );
}

function polarityOf(ctx: MdLaneContext): TopicMdPolarity {
  return (ctx.resolved as { answerPolarity?: string }).answerPolarity === "NEGATIVE"
    ? "NEGATIVE"
    : "POSITIVE";
}

function optionLanguageOf(ctx: MdLaneContext): TopicMdOptionLanguage {
  return readOptionLanguageSetting(ctx.rawTypeSettings, "TOPIC") === "ko" ? "ko" : "en";
}

/**
 * 발문 결정론 생성 — 극성 × 정답 개수 × 발문 언어의 순수 함수.
 * 한국어 부정형 리터럴은 fast 리졸버(dispatchers.ts 의 negDirection)와 같은 문구다
 * (사용자 표면 무변경). 검증기 통과 조건도 여기서 구조적으로 만족시킨다:
 *  - ko 는 언제나 '주제' 포함(topic-direction-mismatch)
 *  - NEGATIVE 는 '적절하지 않은' / en 은 NOT 포함(gist-polarity-direction-mismatch)
 *  - 복수 정답은 '모두' / all 포함(generic-multi-answer-direction)
 */
export function buildTopicDirection(
  polarity: TopicMdPolarity,
  answerCount: number,
  stemLanguage: "ko" | "en",
): string {
  const multi = answerCount >= 2;
  if (stemLanguage === "en") {
    if (polarity === "NEGATIVE") {
      return multi
        ? "Choose all of the following that are NOT appropriate topics of the passage."
        : "Which of the following is NOT an appropriate topic of the passage?";
    }
    return multi
      ? "Choose all of the following that are appropriate topics of the passage."
      : "Which of the following is the best topic of the passage?";
  }
  if (polarity === "NEGATIVE") {
    return multi
      ? "다음 글의 주제로 적절하지 않은 것을 모두 고르시오."
      : "다음 글의 주제로 가장 적절하지 않은 것은?";
  }
  return multi
    ? "다음 글의 주제로 적절한 것을 모두 고르시오."
    : "다음 글의 주제로 가장 적절한 것은?";
}

export const TOPIC_MD_LANE: MdLane = {
  subType: "TOPIC",

  // ⚠ fast 레인 getOperationType 과 동기 — 어휘 계열(CONTEXT_MEANING·SYNONYM·
  // ANTONYM = QUESTION_GEN_VOCAB, 1크레딧)이 아니므로 표준 QUESTION_GEN_SINGLE 이다.
  // 여기를 틀리면 크레딧이 이중 청구되거나 과소 청구된다(1차 승차에서 실제로 잡힌 사고).
  operationType: "QUESTION_GEN_SINGLE",

  // 신형식 초기 반려율 실측이 없으므로 보수 정책(어법 도입기와 동일).
  retryEligible: true,

  isEligible(resolved) {
    const optionCount = Number(
      (resolved as { genericOptionCount?: number }).genericOptionCount ??
        GENERIC_OPTION_COUNT_DEFAULT,
    );
    const answerCount = Number(
      (resolved as { genericAnswerCount?: number }).genericAnswerCount ??
        GENERIC_ANSWER_COUNT_DEFAULT,
    );
    return (
      Number.isFinite(optionCount) &&
      optionCount >= GENERIC_OPTION_COUNT_MIN &&
      optionCount <= GENERIC_OPTION_COUNT_MAX &&
      Number.isFinite(answerCount) &&
      answerCount >= GENERIC_ANSWER_COUNT_MIN &&
      // 오답이 최소 1개는 남아야 문항이 성립한다(리졸버 클램프와 동일 규칙).
      answerCount <= optionCount - 1
    );
  },

  buildBasePrompt(ctx) {
    return buildMdTopicPrompt(ctx.passage, "full", ctx.difficulty, {
      optionCount: optionCountOf(ctx),
      answerCount: answerCountOf(ctx),
      polarity: polarityOf(ctx),
      optionLanguage: optionLanguageOf(ctx),
    });
  },

  buildExtras() {
    // 이 유형의 모든 설정은 base 프롬프트 본문에 직접 박혀 있다(개수·극성·선지 언어)
    // 또는 어댑터가 결정론으로 집행한다(발문 언어). 같은 지시를 블록으로 한 번 더
    // 붙이면 철칙 1(한 정보는 한 곳에서만) 위반이고, 두 문구가 어긋날 때 모델이
    // 어느 쪽을 따를지 알 수 없어진다. 교사 포인트·다양성·커스텀·반려 피드백은
    // 라우트가 공통으로 뒤에 붙인다.
    return [];
  },

  parseAndGate(text, ctx) {
    const parsed = parseMdTopic(text);
    // 스냅은 표면 정돈만 한다(지문 대조 대상이 없는 유형이라 지문 인자를 받지 않는다).
    const snapped = autoSnapTopicOptions(parsed);
    const q = snapped.question;
    return {
      question: q,
      gateIssues: gateMdTopic(q, ctx.passage, {
        optionCount: optionCountOf(ctx),
        answerCount: answerCountOf(ctx),
        optionLanguage: optionLanguageOf(ctx),
      }),
      corrections: snapped.corrections,
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    return adaptMdTopicToAiQuestion(
      parsed.question as MdTopicQuestion,
      ctx.passage,
      ctx.rawDifficulty,
      {
        direction: buildTopicDirection(
          polarityOf(ctx),
          answerCountOf(ctx),
          readStemLanguageSetting(ctx.rawTypeSettings, "TOPIC") === "en" ? "en" : "ko",
        ),
      },
    );
  },

  qualityArgs(ctx) {
    const polarity = polarityOf(ctx);
    return {
      genericOptionCount: optionCountOf(ctx),
      genericAnswerCount: answerCountOf(ctx),
      stemLanguage: readStemLanguageSetting(ctx.rawTypeSettings, "TOPIC"),
      optionLanguage: readOptionLanguageSetting(ctx.rawTypeSettings, "TOPIC"),
      // 미설정(POSITIVE)이면 키를 넣지 않는다 — 극성 게이트 미동작(fast 동일 규칙).
      ...(polarity === "NEGATIVE" ? { answerPolarity: "NEGATIVE" } : {}),
    };
  },

  mdFormat(ctx) {
    return {
      optionCount: optionCountOf(ctx),
      answerCount: answerCountOf(ctx),
      polarity: polarityOf(ctx),
      optionLanguage: optionLanguageOf(ctx),
      stemLanguage: readStemLanguageSetting(ctx.rawTypeSettings, "TOPIC"),
    };
  },

  /**
   * ⚠ 이 유형은 **정답 주제를 회피 표적으로 내보내면 안 된다.** 라우트는 이 배열을
   *   `## 표적 회피 — 이미 출제된 자리(정답·빈칸이 겹치지 않게 하라)` 헤더 아래에
   *   그대로 싣는데(md-stream/route.ts:706), 한 지문의 주제는 하나뿐이라 "정답을
   *   피하라"는 지시는 곧 "틀린 문항을 만들어라"가 된다(순서 레인이 같은 함정을
   *   실제로 밟았다).
   *   → 표적은 주제 자체가 아니라 **정답 선지의 문구**로 내고, 무엇을 피하라는
   *     것인지(표현) 와 무엇은 유지하라는 것인지(주제)를 한 줄 안에 못 박는다.
   *     라우트가 90자로 자르므로 문장 길이도 그 안에서 완결시킨다.
   */
  diversityTargets(structuredData) {
    const options = structuredData.options;
    if (!Array.isArray(options)) return [];
    const correct = new Set(
      String(structuredData.correctAnswer ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    if (Array.isArray(structuredData.correctAnswers)) {
      for (const label of structuredData.correctAnswers) {
        if (typeof label === "string" && label.trim()) correct.add(label.trim());
      }
    }
    const texts: string[] = [];
    for (const raw of options as Array<Record<string, unknown>>) {
      const label = typeof raw?.label === "string" ? raw.label.trim() : "";
      const text = typeof raw?.text === "string" ? raw.text.trim() : "";
      if (!label || !text || !correct.has(label)) continue;
      texts.push(`이미 쓴 주제 문구 "${text.slice(0, 44)}" — 같은 표현 반복 금지(주제 자체는 유지)`);
    }
    return texts;
  },
};
