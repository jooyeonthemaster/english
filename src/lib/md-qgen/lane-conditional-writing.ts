// ============================================================================
// 조건부 영작(CONDITIONAL_WRITING) md 레인 디스크립터.
// 견본: lane-antonym.ts / 인터페이스: ./lane-types.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md · 서술형 7종 계약서 §8-1/§10
//
// 이 유형의 특이점(객관식 견본과 다른 축):
//  - 서술형이다. 선지가 없고 `정답:` 줄도 없다 — modelAnswer 가 정답의 유일 진실원.
//  - 채점은 MANUAL_ONLY(answer-spec.ts:250,271-273 FREE_WRITING) — acceptedAnswers 계약이
//    아예 없는 유형이라 어댑터가 정답 집합을 만들지 않는다. 대신 scoringCriteria 가
//    사람 채점의 유일한 근거다.
//  - 후처리 PASSTHROUGH — 어댑터가 완제품을 낸다.
// ============================================================================

import { readStemLanguageSetting } from "@/lib/question-type-generation-settings";
import { buildMdConditionalWritingPrompt } from "./prompts-conditional-writing";
import {
  autoSnapConditionalWriting,
  parseMdConditionalWriting,
  type MdConditionalWritingQuestion,
} from "./parser-conditional-writing";
import { gateMdConditionalWriting } from "./gate-conditional-writing";
import {
  adaptMdConditionalWritingToAiQuestion,
  CONDITIONAL_WRITING_MD_DIRECTION_EN,
} from "./adapter-conditional-writing";
import {
  CW_MD_CONDITION_MAX,
  CW_MD_CONDITION_MIN,
  CW_MD_CRITERIA_MAX,
  CW_MD_CRITERIA_MIN,
  CONDITIONAL_WRITING_SUB_TYPE,
} from "./prompts-conditional-writing";
import type { MdLane, MdLaneParsed } from "./lane-types";

export const CONDITIONAL_WRITING_MD_LANE: MdLane = {
  subType: CONDITIONAL_WRITING_SUB_TYPE,

  // ⚠ fast 레인 getOperationType 과 동기(fast/route.ts:70,90-98).
  // VOCAB_TYPES = {CONTEXT_MEANING, SYNONYM, ANTONYM} 에 이 유형은 없으므로
  // 표준 2크레딧이다. 어휘 계열 값을 잘못 쓰면 과금이 어긋난다.
  operationType: "QUESTION_GEN_SINGLE",

  // 신형식 초기 반려율 실측이 없으므로 보수 정책(규범 §1 [6]).
  retryEligible: true,

  // 이 유형은 resolved 에 전용 키가 아예 없다(dispatchers.ts:353-360 폴백 —
  // stemLanguage·optionLanguage 만). 즉 설정 범위 밖이라는 개념이 없다.
  isEligible() {
    return true;
  },

  buildBasePrompt(ctx) {
    return buildMdConditionalWritingPrompt(ctx.passage, "full", ctx.difficulty);
  },

  buildExtras(ctx) {
    const extras: string[] = [];

    // 질문 언어 집행 — md 레인의 기존 결함(라우트에 stemLanguage 참조 0건) 봉합.
    // 이 유형은 toggle scope 가 'stem' 이라 발문 언어만 집행한다(language.ts:8-44,75-79).
    if (
      readStemLanguageSetting(ctx.rawTypeSettings, CONDITIONAL_WRITING_SUB_TYPE) === "en"
    ) {
      extras.push(
        "## 질문 언어 (교사 설정, 필수)\n- 학생에게 보이는 발문은 영어로 낸다. 우리말 제시문·조건·채점기준·해설은 한국어 그대로 유지한다.",
      );
    }

    // 교사 지정 포인트 블록은 넣지 않는다 — POINT_PICKER_CONFIG 에 이 유형이
    // 전무해서(§5-3) resolvePointPickerMeta 가 undefined 를 돌려주고,
    // ctx.teacherPoints 는 항상 빈 배열이다.
    return extras;
  },

  parseAndGate(text, ctx) {
    const snapped = autoSnapConditionalWriting(parseMdConditionalWriting(text));
    return {
      question: snapped.question,
      gateIssues: gateMdConditionalWriting(snapped.question, ctx.passage, {
        difficulty: ctx.difficulty,
      }),
      corrections: snapped.corrections,
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    const result = adaptMdConditionalWritingToAiQuestion(
      parsed.question as MdConditionalWritingQuestion,
      ctx.rawDifficulty,
    );
    if (
      result.ok &&
      result.aiQuestion &&
      readStemLanguageSetting(ctx.rawTypeSettings, CONDITIONAL_WRITING_SUB_TYPE) === "en"
    ) {
      result.aiQuestion.direction = CONDITIONAL_WRITING_MD_DIRECTION_EN;
    }
    return result;
  },

  qualityArgs(ctx) {
    // ValidateQuestionQualityInput(dispatcher.ts:41-92)에 이 유형 전용 카운트 슬롯은
    // 없다 — 없는 키를 넘기면 tsc 에러다. stemLanguage 만 넘긴다.
    return {
      stemLanguage: readStemLanguageSetting(
        ctx.rawTypeSettings,
        CONDITIONAL_WRITING_SUB_TYPE,
      ),
    };
  },

  mdFormat(ctx) {
    return {
      conditionMin: CW_MD_CONDITION_MIN[ctx.difficulty],
      conditionMax: CW_MD_CONDITION_MAX,
      criteriaMin: CW_MD_CRITERIA_MIN,
      criteriaMax: CW_MD_CRITERIA_MAX,
      stemLanguage: readStemLanguageSetting(
        ctx.rawTypeSettings,
        CONDITIONAL_WRITING_SUB_TYPE,
      ),
    };
  },

  // 다양성 회피 표적 — 같은 지문에서 같은 문장이 반복 출제되는 것을 막는다(§10-6).
  diversityTargets(structuredData) {
    const targets: string[] = [];
    const reference = structuredData.referenceSentence;
    if (typeof reference === "string" && reference.trim()) {
      targets.push(reference.trim().slice(0, 90));
    }
    return targets;
  },
};
