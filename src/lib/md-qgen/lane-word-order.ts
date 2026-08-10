// ============================================================================
// 배열 영작(WORD_ORDER) md 레인 디스크립터.
// 견본: lane-antonym.ts / 인터페이스: ./lane-types.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md · 서술형 7종 계약서 §8-6/§10
//
// 서술형 계열 메모:
//  - 과금은 QUESTION_GEN_SINGLE. fast 의 VOCAB_TYPES={CONTEXT_MEANING,SYNONYM,
//    ANTONYM} 에 WORD_ORDER 가 없으므로(fast/route.ts:70) md 도 표준 2크레딧이다.
//  - 유형 설정 노브가 **없다**(question-type-generation-settings/dispatchers.ts
//    :353-360 폴백 → stemLanguage·optionLanguage 뿐). 따라서 isEligible 은 항상
//    true 이고, 난이도 3분기는 **프롬프트가 유일한 집행 지점**이다.
//  - 교사 지정 포인트 미지원(POINT_PICKER_CONFIG 미등재) → teacherPoints 는
//    항상 빈 배열이고 buildExtras 에 교사포인트 블록을 넣지 않는다.
// ============================================================================

import { readStemLanguageSetting } from "@/lib/question-type-generation-settings";
import {
  buildMdWordOrderPrompt,
  wordOrderMdDistractorMin,
} from "./prompts-word-order";
import { parseMdWordOrder, type MdWordOrderQuestion } from "./parser-word-order";
import { autoSnapWordOrderChips, gateMdWordOrder } from "./gate-word-order";
import { adaptMdWordOrderToAiQuestion } from "./adapter-word-order";
import type { MdLane, MdLaneContext, MdLaneParsed } from "./lane-types";

const WORD_ORDER_DIRECTION_EN =
  "Rearrange the given words to complete the sentence. (Some words are not used.)";
const WORD_ORDER_DIRECTION_EN_NO_DISTRACTOR =
  "Rearrange the given words to complete the sentence.";

function distractorMinOf(ctx: MdLaneContext): number {
  return wordOrderMdDistractorMin(ctx.difficulty);
}

export const WORD_ORDER_MD_LANE: MdLane = {
  subType: "WORD_ORDER",

  // ⚠ fast 레인 getOperationType 과 동기 — 어휘 계열이 아니므로 표준 2크레딧.
  //   틀리면 크레딧이 이중 청구된다(1차 웨이브에서 실제로 잡힌 사고).
  operationType: "QUESTION_GEN_SINGLE",

  // 신형식 초기 반려율 실측이 없으므로 보수 정책(규범 §1 [6]).
  retryEligible: true,

  // 이 유형은 resolved 에 전용 키가 아예 없다(언어 토글만 존재) — 커버 못 하는
  // 설정 조합이 없으므로 항상 적격이다.
  isEligible() {
    return true;
  },

  buildBasePrompt(ctx) {
    return buildMdWordOrderPrompt(ctx.passage, "full", ctx.difficulty);
  },

  buildExtras(ctx) {
    const extras: string[] = [];
    // 교사 지정 포인트 블록 없음 — 이 유형은 POINT_PICKER_CONFIG 미등재라
    // ctx.teacherPoints 가 구조적으로 항상 비어 있다(서술형 7종 공통).
    if (readStemLanguageSetting(ctx.rawTypeSettings, "WORD_ORDER") === "en") {
      extras.push(
        `## 질문 언어 (교사 설정, 필수)\n- 학생에게 보이는 발문은 영어로 낸다. 해설·힌트는 한국어 그대로 유지한다.`,
      );
    }
    return extras;
  },

  parseAndGate(text, ctx) {
    const parsed = parseMdWordOrder(text);
    // 스냅이 미끼 재도출·허용답 절삭·칩 재배열을 마친 뒤 게이트가 본다 —
    // 게이트가 보는 형상과 어댑터가 싣는 형상이 정확히 같아야 하기 때문이다.
    const snapped = autoSnapWordOrderChips(parsed);
    const q = snapped.question;
    return {
      question: q,
      gateIssues: gateMdWordOrder(q, ctx.passage, {
        distractorMin: distractorMinOf(ctx),
      }),
      corrections: snapped.corrections,
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    const result = adaptMdWordOrderToAiQuestion(
      parsed.question as MdWordOrderQuestion,
      ctx.rawDifficulty,
    );
    if (
      result.ok &&
      result.aiQuestion &&
      readStemLanguageSetting(ctx.rawTypeSettings, "WORD_ORDER") === "en"
    ) {
      const distractors = result.aiQuestion.wordBankDistractors;
      result.aiQuestion.direction =
        Array.isArray(distractors) && distractors.length > 0
          ? WORD_ORDER_DIRECTION_EN
          : WORD_ORDER_DIRECTION_EN_NO_DISTRACTOR;
    }
    return result;
  },

  qualityArgs(ctx) {
    // ValidateQuestionQualityInput 에 WORD_ORDER 전용 카운트 슬롯은 없다
    // (dispatcher.ts:41-92 실측) — 언어 실값만 넘긴다. 없는 키를 넘기면 tsc 에러.
    return {
      stemLanguage: readStemLanguageSetting(ctx.rawTypeSettings, "WORD_ORDER"),
    };
  },

  mdFormat(ctx) {
    return {
      distractorMin: distractorMinOf(ctx),
      difficulty: ctx.difficulty,
      // 26-07-26 §1-B 철칙1 개정 — `칩:` 줄 소멸(정답 청크는 `모범답안:` 줄의
      // ` / ` 경계에서 파생). 포렌식이 구·신 출력을 구분할 수 있게 실값을 남긴다.
      sections: ["모범답안(청크 ` / ` 구분)", "미끼", "힌트", "허용답", "해설"],
    };
  },

  diversityTargets(structuredData) {
    const modelAnswer = structuredData.modelAnswer;
    if (typeof modelAnswer !== "string" || !modelAnswer.trim()) return [];
    return [modelAnswer.trim().slice(0, 90)];
  },
};
