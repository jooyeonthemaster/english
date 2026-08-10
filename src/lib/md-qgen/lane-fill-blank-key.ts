// ============================================================================
// 핵심 표현 빈칸(FILL_BLANK_KEY) md 레인 디스크립터.
// 견본: lane-antonym.ts / 인터페이스: ./lane-types.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md
//
// 이 유형의 좌표(정찰 실측):
//  · 서술형 7종 중 **유일하게 후처리 프로세서를 가진 유형**(question-postprocess/
//    index.ts:127-128 processFillBlankKey). passageWithBlank 는 후처리 전담이다.
//  · 과금은 QUESTION_GEN_SINGLE — fast 의 VOCAB_TYPES(CONTEXT_MEANING·SYNONYM·
//    ANTONYM)에 없다(fast/route.ts:70). 어휘 계열로 오등록하면 크레딧 축이 어긋난다.
//  · 설정 노브가 **없다**. resolveQuestionTypeGenerationSettings 에 이 유형 분기가
//    없어(dispatchers.ts:353-360 폴백) resolved 에는 stemLanguage·optionLanguage
//    뿐이다. 그래서 isEligible 은 항상 true 이고, **난이도 3분기의 유일한 집행
//    지점은 프롬프트**다(설정 프리셋이 존재하지 않는다).
//  · 언어 토글 scope 는 'stem'(language.ts:39,78) — 발문 언어만 집행한다.
//  · 교사 지정 포인트 미지원: POINT_PICKER_CONFIG 에 이 유형이 없어 ctx.teacherPoints
//    는 항상 빈 배열이다. 여기서 임의 준수 게이트를 만들면 fast 와 판정이 갈리므로
//    만들지 않는다(견본 lane-title.ts 와 동일 판단).
//  · qualityArgs 전용 슬롯 없음: ValidateQuestionQualityInput(dispatcher.ts:41-92)에
//    FILL_BLANK_KEY 카운트 인자가 없다. stemLanguage 만 넘긴다(넘기면 tsc 에러).
// ============================================================================

import { readStemLanguageSetting } from "@/lib/question-type-generation-settings";
import { buildMdFillBlankKeyPrompt } from "./prompts-fill-blank-key";
import {
  autoSnapFillBlankKey,
  parseMdFillBlankKey,
  type MdFillBlankKeyQuestion,
} from "./parser-fill-blank-key";
import { gateMdFillBlankKey } from "./gate-fill-blank-key";
import {
  adaptMdFillBlankKeyToAiQuestion,
  FILL_BLANK_KEY_MD_DIRECTION_EN,
} from "./adapter-fill-blank-key";
import type { MdLane, MdLaneContext, MdLaneParsed } from "./lane-types";

function stemLanguageOf(ctx: MdLaneContext): "ko" | "en" {
  return readStemLanguageSetting(ctx.rawTypeSettings, "FILL_BLANK_KEY") === "en"
    ? "en"
    : "ko";
}

export const FILL_BLANK_KEY_MD_LANE: MdLane = {
  subType: "FILL_BLANK_KEY",

  // ⚠ fast 레인 getOperationType 과 동기(fast/route.ts:70,90-98) — 서술형 7종은
  // VOCAB_TYPES 에 하나도 없으므로 전부 QUESTION_GEN_SINGLE 이다.
  operationType: "QUESTION_GEN_SINGLE",

  // 신형식 초기 반려율 실측이 없으므로 보수 정책(규범 §1 [6]).
  retryEligible: true,

  // 이 유형은 설정 노브가 없어 md 프롬프트가 전 범위를 커버한다 — 폴백 조건 없음.
  isEligible() {
    return true;
  },

  buildBasePrompt(ctx) {
    return buildMdFillBlankKeyPrompt(ctx.passage, "full", ctx.difficulty);
  },

  buildExtras(ctx) {
    const extras: string[] = [];
    if (stemLanguageOf(ctx) === "en") {
      // 발문은 어댑터가 결정형 상수로 싣지만(모델 문구를 쓰지 않는다), 해설이
      // 발문 언어를 따라가는 드리프트를 막기 위해 경계를 명시한다.
      extras.push(
        `## 질문 언어 (교사 설정, 필수)\n- 학생에게 보이는 발문은 영어로 낸다(시스템이 결정형으로 붙이므로 발문 줄은 출력하지 마라).\n- 해설은 한국어 그대로 유지한다.`,
      );
    }
    return extras;
  },

  parseAndGate(text, ctx) {
    const snapped = autoSnapFillBlankKey(parseMdFillBlankKey(text), ctx.passage);
    return {
      question: snapped.question,
      gateIssues: gateMdFillBlankKey(snapped.question, ctx.passage),
      corrections: snapped.corrections,
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    const result = adaptMdFillBlankKeyToAiQuestion(
      parsed.question as MdFillBlankKeyQuestion,
      ctx.rawDifficulty,
    );
    if (result.ok && result.aiQuestion && stemLanguageOf(ctx) === "en") {
      result.aiQuestion.direction = FILL_BLANK_KEY_MD_DIRECTION_EN;
    }
    return result;
  },

  qualityArgs(ctx) {
    return { stemLanguage: stemLanguageOf(ctx) };
  },

  mdFormat(ctx) {
    return {
      sections: ["빈칸문장", "정답", "해설"],
      blankCount: 1,
      // 허용답 칸을 두지 않는다 — 표기 변형은 어댑터가 결정론으로 파생한다.
      // 이 사실이 포렌식에 남아야 "허용답이 왜 없나"를 나중에 되짚을 수 있다.
      acceptedAnswers: "derived",
      stemLanguage: stemLanguageOf(ctx),
    };
  },

  diversityTargets(structuredData) {
    const targets: string[] = [];
    const answer = structuredData.answer;
    if (typeof answer === "string" && answer.trim()) {
      targets.push(answer.trim().slice(0, 90));
    }
    return targets;
  },
};
