// ============================================================================
// 요약문 완성 객관식(SUMMARY_COMPLETE_MC) md 레인 디스크립터.
// 견본: lane-antonym.ts · lane-combo.ts / 인터페이스: ./lane-types.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md
//
// 과금 축: fast 레인 getOperationType(fast/route.ts:90-98)의 VOCAB_TYPES 는
// {CONTEXT_MEANING, SYNONYM, ANTONYM} 뿐이다. 요약문 완성은 그 집합 밖이므로
// QUESTION_GEN_SINGLE(표준 단건)이 정답이며, 이 값이 어긋나면 크레딧이 이중
// 청구되거나 클라 견적과 desync 된다(1차 승차에서 실제로 잡힌 사고).
//
// 교사 지정 포인트: 이 유형은 POINT_PICKER_CONFIG 미등재라 픽커 진입 자체가
// 없고 clampTeacherPoints 가 항상 [] 를 돌려준다(point-picker-config.ts:275
// "미등재 유형 → []"). 따라서 준수 게이트를 두지 않는다 — 요약문은 지문의
// 축자 구간이 아니라 압축 재진술이라, 지정 구간의 축자 포함을 요구하는 검사는
// 정상 문항을 오반려한다(fast 도 COMPLIANCE_SURFACES 미등재 = 통과 계약).
// ============================================================================

import { readStemLanguageSetting } from "@/lib/question-type-generation-settings";
import {
  SUMMARY_MC_MD_BLANK_COUNT_DEFAULT,
  SUMMARY_MC_MD_BLANK_COUNT_MAX,
  SUMMARY_MC_MD_BLANK_COUNT_MIN,
  SUMMARY_MC_MD_OPTION_COUNT,
  buildMdSummaryMcPrompt,
  clampSummaryMcMdBlankCount,
  summaryMcMdLabels,
} from "./prompts-summary-mc";
import {
  autoSnapSummaryMc,
  parseMdSummaryMc,
  type MdSummaryMcQuestion,
} from "./parser-summary-mc";
import { gateMdSummaryMc, summaryMcGateAdvisories } from "./gate-summary-mc";
import {
  adaptMdSummaryMcToAiQuestion,
  summaryMcMdDirectionEn,
} from "./adapter-summary-mc";
import type { MdLane, MdLaneContext, MdLaneParsed } from "./lane-types";

const SUMMARY_MC_SUB_TYPE = "SUMMARY_COMPLETE_MC";

/**
 * 설정 리졸버가 내놓는 키는 `summaryCompleteMcBlankCount`
 * (dispatchers.ts:208-218). effectiveTypeSettings 경유의 `blankCount` 도 함께
 * 본다 — 둘 다 없으면 유형 기본값 2.
 */
function blankCountOf(ctx: MdLaneContext): number {
  const resolved = ctx.resolved as {
    summaryCompleteMcBlankCount?: unknown;
    blankCount?: unknown;
  };
  return clampSummaryMcMdBlankCount(
    resolved.summaryCompleteMcBlankCount ??
      resolved.blankCount ??
      SUMMARY_MC_MD_BLANK_COUNT_DEFAULT,
  );
}

export const SUMMARY_COMPLETE_MC_MD_LANE: MdLane = {
  subType: SUMMARY_MC_SUB_TYPE,

  // ⚠ fast 레인 getOperationType 과 동기 — 어휘 계열이 아니므로 표준 단건이다.
  operationType: "QUESTION_GEN_SINGLE",

  // 신형식 초기 반려율 실측이 없으므로 보수 정책(스펙 §1 [6] 재생성 계약).
  retryEligible: true,

  isEligible(resolved) {
    const raw = (resolved as {
      summaryCompleteMcBlankCount?: unknown;
      blankCount?: unknown;
    });
    for (const value of [raw.summaryCompleteMcBlankCount, raw.blankCount]) {
      if (value === undefined || value === null || value === "") continue;
      const n = Number(value);
      if (
        !Number.isFinite(n) ||
        !Number.isInteger(n) ||
        n < SUMMARY_MC_MD_BLANK_COUNT_MIN ||
        n > SUMMARY_MC_MD_BLANK_COUNT_MAX
      ) {
        return false;
      }
    }
    return true;
  },

  buildBasePrompt(ctx) {
    return buildMdSummaryMcPrompt(ctx.passage, "full", ctx.difficulty, {
      blankCount: blankCountOf(ctx),
    });
  },

  buildExtras(ctx) {
    const extras: string[] = [];
    // 질문 언어 집행 — md 레인의 기존 결함(라우트에 stemLanguage 참조 0건) 봉합.
    // 이 유형은 toggle scope 가 'stem' 이라 발문 언어만 집행한다(요약문·선지는
    // 구조적으로 영어 고정 — language.ts:28,61 이 그 근거다).
    if (readStemLanguageSetting(ctx.rawTypeSettings, SUMMARY_MC_SUB_TYPE) === "en") {
      extras.push(
        `## 질문 언어 (교사 설정, 필수)\n- 학생에게 보이는 발문은 영어로 낸다. 요약문과 선지 값은 영어 그대로, 해설·오답 해설은 한국어 그대로 유지한다.`,
      );
    }
    return extras;
  },

  parseAndGate(text, ctx) {
    const blankCount = blankCountOf(ctx);
    const snapped = autoSnapSummaryMc(parseMdSummaryMc(text));
    const q = snapped.question;
    // 난이도는 **원본 문자열**을 넘긴다 — 게이트의 KILLER 함정 강도 검사는
    // validateQuestionQuality 의 requestedDifficulty(=effectiveDifficulty) 축과
    // 동일해야 한다. md 3분기(ctx.difficulty)는 '그 외 전부 KILLER' 로 접히므로
    // 그걸 넘기면 검증기가 검사도 않는 난이도에서 게이트만 반려하게 된다.
    const gateOptions = {
      blankCount,
      optionCount: SUMMARY_MC_MD_OPTION_COUNT,
      difficulty: ctx.rawDifficulty,
    };
    const gateIssues = gateMdSummaryMc(q, ctx.passage, gateOptions);
    return {
      question: q,
      gateIssues,
      // 비차단 권고는 반려가 아니라 잡 result.mdCorrections 포렌식으로만 남긴다.
      // 이미 반려된 문항에는 붙이지 않는다 — 재생성 피드백 옆에 놓이면 소음이다.
      corrections: [
        ...snapped.corrections,
        ...(gateIssues.length === 0 ? summaryMcGateAdvisories(q, gateOptions) : []),
      ],
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    const blankCount = blankCountOf(ctx);
    const result = adaptMdSummaryMcToAiQuestion(
      parsed.question as MdSummaryMcQuestion,
      ctx.rawDifficulty,
      blankCount,
    );
    if (
      result.ok &&
      result.aiQuestion &&
      readStemLanguageSetting(ctx.rawTypeSettings, SUMMARY_MC_SUB_TYPE) === "en"
    ) {
      result.aiQuestion.direction = summaryMcMdDirectionEn(
        summaryMcMdLabels(blankCount),
      );
    }
    return result;
  },

  qualityArgs(ctx) {
    return {
      stemLanguage: readStemLanguageSetting(ctx.rawTypeSettings, SUMMARY_MC_SUB_TYPE),
      // 보기 언어 토글은 이 유형에서 노출되지 않는다(scope='stem'). 저장된 값이
      // 아니라 구조 기본값(en, language.ts:28)을 보고한다 — 스테일 저장값이
      // 검증 인자로 새어 나가는 desync 방지(lane-combo 와 동일 규칙).
      optionLanguage: "en",
    };
  },

  mdFormat(ctx) {
    return {
      blankCount: blankCountOf(ctx),
      optionCount: SUMMARY_MC_MD_OPTION_COUNT,
    };
  },

  diversityTargets(structuredData) {
    // question-diversity.ts:252 와 동일 축 — 빈칸 정답 어구를 회피 표적으로 쓴다
    // (TARGET_NOUN_BY_SUBTYPE:462 "요약문 빈칸 정답 어구").
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
