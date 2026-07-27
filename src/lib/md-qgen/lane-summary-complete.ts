// ============================================================================
// 요약문 완성 단답형(SUMMARY_COMPLETE) md 레인 디스크립터.
// 견본: lane-antonym.ts · lane-summary-mc.ts / 인터페이스: ./lane-types.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md
//
// 과금 축: fast 레인 getOperationType(fast/route.ts:70,90-98)의 VOCAB_TYPES 는
// {CONTEXT_MEANING, SYNONYM, ANTONYM} 뿐이다. 요약문 완성은 그 집합 밖이므로
// QUESTION_GEN_SINGLE(표준 단건)이 정답이며, 이 값이 어긋나면 크레딧이 이중
// 청구되거나 클라 견적과 desync 된다(1차 승차에서 실제로 잡힌 사고).
//
// 교사 지정 포인트: 이 유형은 POINT_PICKER_CONFIG 미등재라 픽커 진입 자체가 없고
// clampTeacherPoints 가 항상 [] 를 돌려준다. 준수 게이트를 두지 않는다 — 요약문은
// 지문의 축자 구간이 아니라 압축 재진술이라, 지정 구간의 축자 포함을 요구하는
// 검사는 정상 문항을 오반려한다(fast 도 미등재 = 통과 계약).
//
// 사전 적합성: preflightQuestionFeasibility 는 SENTENCE_ORDER 만 활성이라
// 이 유형은 무조건 ok — 차감 전 지문 길이 게이트가 없다.
// ============================================================================

import { readStemLanguageSetting } from "@/lib/question-type-generation-settings";
import {
  SUMMARY_COMPLETE_MD_BLANK_COUNT_DEFAULT,
  SUMMARY_COMPLETE_MD_BLANK_COUNT_MAX,
  SUMMARY_COMPLETE_MD_BLANK_COUNT_MIN,
  buildMdSummaryCompletePrompt,
  clampSummaryCompleteMdBlankCount,
  summaryCompleteMdLabels,
} from "./prompts-summary-complete";
import {
  autoSnapSummaryComplete,
  parseMdSummaryComplete,
  type MdSummaryCompleteQuestion,
} from "./parser-summary-complete";
import { gateMdSummaryComplete } from "./gate-summary-complete";
import {
  adaptMdSummaryCompleteToAiQuestion,
  summaryCompleteMdDirectionEn,
} from "./adapter-summary-complete";
import type { MdLane, MdLaneContext, MdLaneParsed } from "./lane-types";

const SUMMARY_COMPLETE_SUB_TYPE = "SUMMARY_COMPLETE";

/**
 * 설정 리졸버가 내놓는 키는 `summaryCompleteBlankCount`(dispatchers.ts:196-206).
 * effectiveTypeSettings 경유의 `blankCount`(alias `summaryBlankCount`)도 함께
 * 본다 — 셋 다 없으면 유형 기본값 2.
 */
function blankCountOf(ctx: MdLaneContext): number {
  const resolved = ctx.resolved as {
    summaryCompleteBlankCount?: unknown;
    blankCount?: unknown;
    summaryBlankCount?: unknown;
  };
  return clampSummaryCompleteMdBlankCount(
    resolved.summaryCompleteBlankCount ??
      resolved.blankCount ??
      resolved.summaryBlankCount ??
      SUMMARY_COMPLETE_MD_BLANK_COUNT_DEFAULT,
  );
}

export const SUMMARY_COMPLETE_MD_LANE: MdLane = {
  subType: SUMMARY_COMPLETE_SUB_TYPE,

  // ⚠ fast 레인 getOperationType 과 동기 — 어휘 계열이 아니므로 표준 단건이다.
  operationType: "QUESTION_GEN_SINGLE",

  // 신형식 초기 반려율 실측이 없으므로 보수 정책(스펙 §1 [6] 재생성 계약).
  retryEligible: true,

  isEligible(resolved) {
    const raw = resolved as {
      summaryCompleteBlankCount?: unknown;
      blankCount?: unknown;
      summaryBlankCount?: unknown;
    };
    for (const value of [
      raw.summaryCompleteBlankCount,
      raw.blankCount,
      raw.summaryBlankCount,
    ]) {
      if (value === undefined || value === null || value === "") continue;
      const n = Number(value);
      if (
        !Number.isFinite(n) ||
        !Number.isInteger(n) ||
        n < SUMMARY_COMPLETE_MD_BLANK_COUNT_MIN ||
        n > SUMMARY_COMPLETE_MD_BLANK_COUNT_MAX
      ) {
        return false;
      }
    }
    return true;
  },

  buildBasePrompt(ctx) {
    return buildMdSummaryCompletePrompt(ctx.passage, "full", ctx.difficulty, {
      blankCount: blankCountOf(ctx),
    });
  },

  buildExtras(ctx) {
    const extras: string[] = [];
    // 유형 세부 설정은 blankCount 하나뿐이고(dispatchers.ts:196-206) 그것은 base
    // 프롬프트의 라벨 스캐폴드·자기검산에 이미 실값으로 박혀 있다 — 별도 블록이
    // 있으면 같은 지시가 두 번 실려 오히려 흔들린다.
    //
    // 질문 언어 집행 — md 레인의 기존 결함(라우트에 stemLanguage 참조 0건) 봉합.
    // 이 유형은 toggle scope 가 'stem' 이라 발문 언어만 집행한다(요약문·정답은
    // 구조적으로 영어 고정 — language.ts:31,78 이 그 근거다).
    if (
      readStemLanguageSetting(ctx.rawTypeSettings, SUMMARY_COMPLETE_SUB_TYPE) === "en"
    ) {
      extras.push(
        `## 질문 언어 (교사 설정, 필수)\n- 학생에게 보이는 발문은 영어로 낸다. 요약문과 빈칸 정답은 영어 그대로, 해설은 한국어 그대로 유지한다.`,
      );
    }
    return extras;
  },

  parseAndGate(text, ctx) {
    const blankCount = blankCountOf(ctx);
    const snapped = autoSnapSummaryComplete(parseMdSummaryComplete(text), {
      blankCount,
    });
    const q = snapped.question;
    return {
      question: q,
      gateIssues: gateMdSummaryComplete(q, ctx.passage, { blankCount }),
      corrections: snapped.corrections,
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    const blankCount = blankCountOf(ctx);
    const result = adaptMdSummaryCompleteToAiQuestion(
      parsed.question as MdSummaryCompleteQuestion,
      ctx.rawDifficulty,
      blankCount,
    );
    if (
      result.ok &&
      result.aiQuestion &&
      readStemLanguageSetting(ctx.rawTypeSettings, SUMMARY_COMPLETE_SUB_TYPE) === "en"
    ) {
      result.aiQuestion.direction = summaryCompleteMdDirectionEn(
        summaryCompleteMdLabels(blankCount),
      );
    }
    return result;
  },

  qualityArgs(ctx) {
    // ValidateQuestionQualityInput(dispatcher.ts:41-92)에 SUMMARY_COMPLETE 전용
    // 카운트 슬롯은 **없다**(TSW 의 topicSentenceWritingBlankCount 하나뿐) —
    // 없는 키를 넘기면 tsc 에러다. 언어 축만 넘긴다.
    return {
      stemLanguage: readStemLanguageSetting(
        ctx.rawTypeSettings,
        SUMMARY_COMPLETE_SUB_TYPE,
      ),
      // 보기 언어 토글은 이 유형에서 노출되지 않는다(scope='stem'). 저장된 값이
      // 아니라 구조 기본값(en, language.ts:31)을 보고한다 — 스테일 저장값이
      // 검증 인자로 새어 나가는 desync 방지(lane-summary-mc 와 동일 규칙).
      optionLanguage: "en",
    };
  },

  mdFormat(ctx) {
    return { blankCount: blankCountOf(ctx) };
  },

  diversityTargets(structuredData) {
    // question-diversity.ts 의 요약형 표적 축과 동일 — 빈칸 정답 어구를 회피
    // 표적으로 쓴다(같은 지문에서 같은 압축 개념이 반복 출제되는 것을 막는다).
    const targets: string[] = [];
    const blanks = structuredData.blanks;
    if (Array.isArray(blanks)) {
      for (const blank of blanks as Array<Record<string, unknown>>) {
        const answer = blank?.answer;
        if (typeof answer === "string" && answer.trim()) {
          targets.push(answer.trim().slice(0, 90));
        }
      }
    }
    return targets;
  },
};
