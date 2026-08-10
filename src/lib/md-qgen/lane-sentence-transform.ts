// ============================================================================
// 문장 전환(SENTENCE_TRANSFORM) md 레인 디스크립터.
// 견본: lane-antonym.ts / 인터페이스: ./lane-types.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md
//
// 과금 축(정찰 §0-4 실측): fast 레인 VOCAB_TYPES = {CONTEXT_MEANING, SYNONYM,
// ANTONYM}(fast/route.ts:70,90-98)에 이 유형은 없다 → QUESTION_GEN_SINGLE.
// md-stream 이 같은 값을 하드코딩하므로 여기서도 같은 값을 선언해야 이중청구가 없다.
//
// 설정 축(정찰 §5 실측): resolveQuestionTypeGenerationSettings 에 이 유형의 분기가
// 없어 폴백(dispatchers.ts:353-360)이 stemLanguage/optionLanguage 만 돌려준다.
// 즉 UI 노브는 **난이도와 질문 언어 둘뿐**이고, 난이도는 프롬프트가 유일한 집행
// 지점이다(설정 프리셋이 없다). 그래서 isEligible 은 항상 true 다.
//
// 교사 지정 포인트(정찰 §5-3): POINT_PICKER_CONFIG 에 이 유형이 없어
// ctx.teacherPoints 는 항상 빈 배열이다 → 준수 게이트도, 프롬프트 블록도 만들지 않는다.
// ============================================================================

import { readStemLanguageSetting } from "@/lib/question-type-generation-settings";
import {
  SENTENCE_TRANSFORM_MD_CONDITION_RANGE,
  SENTENCE_TRANSFORM_MD_SCORING_MAX,
  SENTENCE_TRANSFORM_MD_SCORING_MIN,
  buildMdSentenceTransformPrompt,
} from "./prompts-sentence-transform";
import {
  autoSnapSentenceTransform,
  parseMdSentenceTransform,
  type MdSentenceTransformQuestion,
} from "./parser-sentence-transform";
import { gateMdSentenceTransform } from "./gate-sentence-transform";
import { adaptMdSentenceTransformToAiQuestion } from "./adapter-sentence-transform";
import type { MdLane, MdLaneParsed } from "./lane-types";

const SENTENCE_TRANSFORM_DIRECTION_EN =
  "Rewrite the following sentence according to the given conditions.";

export const SENTENCE_TRANSFORM_MD_LANE: MdLane = {
  subType: "SENTENCE_TRANSFORM",

  // ⚠ fast 레인 getOperationType 과 동기 — 어휘 계열이 아니므로 표준 2크레딧.
  operationType: "QUESTION_GEN_SINGLE",

  // 신형식 초기 반려율 실측이 없으므로 보수 정책(규범 §1 [6] — 신규 유형 전부 true).
  retryEligible: true,

  // 설정 범위가 없는 유형이다(resolved 에 이 유형 전용 키가 존재하지 않는다).
  // 커버 못 하는 조합이 없으므로 fast 폴백 조건도 없다.
  isEligible() {
    return true;
  },

  buildBasePrompt(ctx) {
    return buildMdSentenceTransformPrompt(ctx.passage, "full", ctx.difficulty);
  },

  buildExtras(ctx) {
    const extras: string[] = [];
    // 언어 토글 scope 는 "stem" — 발문 언어만 집행한다(language.ts:38,75-79).
    // 실제 발문 문자열은 어댑터가 갈아 끼우므로 이 블록은 해설 언어를 고정하는 역할이 크다.
    if (readStemLanguageSetting(ctx.rawTypeSettings, "SENTENCE_TRANSFORM") === "en") {
      extras.push(
        `## 질문 언어 (교사 설정, 필수)\n- 학생에게 보이는 발문은 영어로 낸다. 조건·해설·채점기준은 한국어 그대로 유지한다.`,
      );
    }
    return extras;
  },

  parseAndGate(text, ctx) {
    const parsed = parseMdSentenceTransform(text);
    const snapped = autoSnapSentenceTransform(parsed, ctx.passage);
    const q = snapped.question;
    return {
      question: q,
      gateIssues: gateMdSentenceTransform(q, ctx.passage, { difficulty: ctx.difficulty }),
      corrections: snapped.corrections,
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    const result = adaptMdSentenceTransformToAiQuestion(
      parsed.question as MdSentenceTransformQuestion,
      ctx.rawDifficulty,
    );
    if (
      result.ok &&
      result.aiQuestion &&
      readStemLanguageSetting(ctx.rawTypeSettings, "SENTENCE_TRANSFORM") === "en"
    ) {
      result.aiQuestion.direction = SENTENCE_TRANSFORM_DIRECTION_EN;
    }
    return result;
  },

  qualityArgs(ctx) {
    // ValidateQuestionQualityInput(dispatcher.ts:41-92)에 이 유형 전용 개수 슬롯은
    // 없다(TSW 의 topicSentenceWritingBlankCount 하나뿐) — 언어 실값만 넘긴다.
    return {
      stemLanguage: readStemLanguageSetting(ctx.rawTypeSettings, "SENTENCE_TRANSFORM"),
    };
  },

  mdFormat(ctx) {
    const range = SENTENCE_TRANSFORM_MD_CONDITION_RANGE[ctx.difficulty];
    return {
      conditionMin: range.min,
      conditionMax: range.max,
      scoringCriteriaMin: SENTENCE_TRANSFORM_MD_SCORING_MIN,
      scoringCriteriaMax: SENTENCE_TRANSFORM_MD_SCORING_MAX,
      stemLanguage: readStemLanguageSetting(ctx.rawTypeSettings, "SENTENCE_TRANSFORM"),
    };
  },

  /**
   * 회피 표적은 **원문장**이다 — 같은 지문에서 같은 문장을 반복해 전환 대상으로
   * 삼는 것이 이 유형의 유일한 반복 실패 모드다(라우트가 `## 표적 회피` 헤더 아래
   * 그대로 싣는다). 지문 축자를 싣지만, 이 유형의 계약은 "지문 문장 중 하나를
   * 고르라"이지 "지문 전체를 담으라"가 아니므로 게이트와 충돌하지 않는다
   * (순서 유형이 축자 표적을 못 쓰는 이유와 대조 — lane-order.ts:203-211).
   */
  diversityTargets(structuredData) {
    const sentence = structuredData.originalSentence;
    if (typeof sentence !== "string" || !sentence.trim()) return [];
    return [sentence.trim().slice(0, 90)];
  },
};
