// ============================================================================
// 요약문 영작(SUMMARY_WRITING) md 레인 디스크립터.
// 견본: lane-antonym.ts · lane-summary-mc.ts / 인터페이스: ./lane-types.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md
//
// 과금 축: fast 레인 getOperationType(fast/route.ts:70,90-98)의 VOCAB_TYPES 는
// {CONTEXT_MEANING, SYNONYM, ANTONYM} 뿐이다. 요약문 영작은 그 집합 밖이므로
// QUESTION_GEN_SINGLE(표준 단건)이 정답이며, 이 값이 어긋나면 크레딧이 이중
// 청구된다(1차 승차에서 실제로 잡힌 사고).
//
// 교사 지정 포인트: POINT_PICKER_CONFIG 미등재라 픽커 진입 자체가 없고
// clampTeacherPoints 가 항상 [] 를 돌려준다. 준수 게이트를 두지 않는다 — 요약문은
// 지문의 축자 구간이 아니라 압축 재진술이므로 축자 포함을 요구하면 정상 문항을
// 오반려한다(fast 도 미등재 = 통과 계약).
//
// 질문 언어 토글: 이 유형의 발문은 buildSummaryWritingDirection 이 설정에서
// 결정론으로 합성한 **한국어 문자열**이고, 학생 화면의 상자 라벨도 [해석]·[보기]로
// 한국어 고정이다(question-type-renderers.tsx PassageBlock). 발문만 영어로 바꾸면
// 한국어 상자를 영어로 지시하는 부정합이 생기고, 검증기 sw-direction-wordbank-mismatch
// (한국어 정규식)도 무력화된다. 따라서 fast 와 동일하게 발문은 한국어 합성값을
// 유지하고, stemLanguage 는 품질 인자로만 보고한다.
// ============================================================================

import {
  buildSummaryWritingDirection,
  readStemLanguageSetting,
  resolveSummaryWritingSettings,
  type ResolvedSummaryWritingSettings,
} from "@/lib/question-type-generation-settings";
import {
  SUMMARY_WRITING_MD_BLANK_COUNT_MAX,
  SUMMARY_WRITING_MD_BLANK_COUNT_MIN,
  buildMdSummaryWritingPrompt,
  clampSummaryWritingMdBlankCount,
} from "./prompts-summary-writing";
import {
  parseMdSummaryWriting,
  type MdSummaryWritingQuestion,
} from "./parser-summary-writing";
import { autoSnapSummaryWriting } from "./snap-summary-writing";
import {
  enforceSummaryWritingSettings,
  gateMdSummaryWriting,
  type SummaryWritingGateOptions,
} from "./gate-summary-writing";
import { adaptMdSummaryWritingToAiQuestion } from "./adapter-summary-writing";
import type { MdLane, MdLaneContext, MdLaneParsed } from "./lane-types";

const SUMMARY_WRITING_SUB_TYPE = "SUMMARY_WRITING";

/**
 * 설정 해석은 **fast 와 동일한 결정 소스**를 쓴다. 라우트가
 * resolveQuestionTypeGenerationSettings(subType, rawSettings, effectiveDifficulty)
 * 를 호출할 때 내부에서 도는 것과 같은 함수·같은 인자다(dispatchers.ts:35-36) —
 * 레인이 자체 기본값을 만들면 "설정 무시" 버그가 난다(규범 §1 [2]).
 * resolved 에는 18개 노브 중 4개만 평평하게 올라오므로 전량이 필요한 프롬프트·
 * 게이트·어댑터는 이 재해석본을 쓴다(결정론이라 값이 갈릴 수 없다).
 */
function settingsOf(ctx: MdLaneContext): ResolvedSummaryWritingSettings {
  return resolveSummaryWritingSettings(ctx.rawTypeSettings, ctx.rawDifficulty);
}

/** 결정론 합성 발문. resolved 에 실려 오면 그대로, 없으면 같은 함수로 재합성. */
function directionOf(
  ctx: MdLaneContext,
  settings: ResolvedSummaryWritingSettings,
): string {
  const carried = (ctx.resolved as { summaryWritingDirection?: unknown })
    .summaryWritingDirection;
  return typeof carried === "string" && carried.trim()
    ? carried
    : buildSummaryWritingDirection(settings);
}

function gateOptionsOf(settings: ResolvedSummaryWritingSettings): SummaryWritingGateOptions {
  return {
    blankCount: clampSummaryWritingMdBlankCount(settings.blankCount),
    glossEnabled: settings.glossEnabled,
    wordBankEnabled: settings.wordBankEnabled,
    wordBankUsage: settings.wordBankUsage,
    boxDistractors: settings.boxDistractors,
    targetWordsMode: settings.targetWordsMode,
    targetWordsPerBlank: settings.targetWordsPerBlank,
    requireCriteria: settings.scoringGranularity === "rubric",
    // 표제어는 LEMMA 채점(=keyword)에서만 채점기가 읽는다(grade.ts:52). 나머지 모드에서
    // 필수화하면 읽히지도 않는 필드로 생성이 실패한다(§1-B 철칙 1 중복 계약).
    requireLemmas: settings.scoringGranularity === "keyword",
  };
}

export const SUMMARY_WRITING_MD_LANE: MdLane = {
  subType: SUMMARY_WRITING_SUB_TYPE,

  // ⚠ fast 레인 getOperationType 과 동기 — 어휘 계열이 아니므로 표준 단건이다.
  operationType: "QUESTION_GEN_SINGLE",

  // 신형식 초기 반려율 실측이 없으므로 보수 정책(규범 §1 [6] 재생성 계약).
  retryEligible: true,

  isEligible(resolved) {
    const raw = (resolved as { summaryWritingBlankCount?: unknown })
      .summaryWritingBlankCount;
    // 키가 없으면(구형 설정) 유형 기본값 1 로 간주 — 적격.
    if (raw === undefined || raw === null || raw === "") return true;
    const n = Number(raw);
    return (
      Number.isFinite(n) &&
      Number.isInteger(n) &&
      n >= SUMMARY_WRITING_MD_BLANK_COUNT_MIN &&
      n <= SUMMARY_WRITING_MD_BLANK_COUNT_MAX
    );
  },

  buildBasePrompt(ctx) {
    const settings = settingsOf(ctx);
    return buildMdSummaryWritingPrompt(
      ctx.passage,
      settings,
      directionOf(ctx, settings),
      "full",
      ctx.difficulty,
    );
  },

  buildExtras(ctx) {
    const extras: string[] = [];
    // 발문·상자 라벨이 한국어 고정인 유형이라 발문 언어를 뒤집지 않는다. 다만
    // 교사가 영어 토글을 켠 사실을 프롬프트에 남겨, 요약문·보기의 영어 품질을
    // 한 번 더 조이는 지시로만 쓴다(학생 표면 계약은 무변경).
    if (readStemLanguageSetting(ctx.rawTypeSettings, SUMMARY_WRITING_SUB_TYPE) === "en") {
      extras.push(
        `## 질문 언어 (교사 설정)\n- 발문은 위 "발문 (이미 확정됨)" 문구를 그대로 쓴다(설정에서 기계가 합성한 값이라 번역·변형 금지).\n- 요약문·보기·정답은 영어, 해석·채점기준·해설은 한국어를 유지한다.`,
      );
    }
    return extras;
  },

  parseAndGate(text, ctx) {
    const settings = settingsOf(ctx);
    const snapped = autoSnapSummaryWriting(parseMdSummaryWriting(text));
    const enforced = enforceSummaryWritingSettings(snapped.question, {
      glossEnabled: settings.glossEnabled,
      wordBankEnabled: settings.wordBankEnabled,
    });
    return {
      question: enforced.question,
      gateIssues: gateMdSummaryWriting(
        enforced.question,
        ctx.passage,
        gateOptionsOf(settings),
      ),
      corrections: [...snapped.corrections, ...enforced.corrections],
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    const settings = settingsOf(ctx);
    return adaptMdSummaryWritingToAiQuestion(
      parsed.question as MdSummaryWritingQuestion,
      settings,
      directionOf(ctx, settings),
      ctx.rawDifficulty,
    );
  },

  qualityArgs(ctx) {
    // ValidateQuestionQualityInput 에 SUMMARY_WRITING 전용 카운트 슬롯은 없다
    // (dispatcher.ts:41-92 — topicSentenceWritingBlankCount 만 존재). 넘기면 tsc 에러.
    return {
      stemLanguage: readStemLanguageSetting(ctx.rawTypeSettings, SUMMARY_WRITING_SUB_TYPE),
    };
  },

  mdFormat(ctx) {
    const s = settingsOf(ctx);
    return {
      blankCount: clampSummaryWritingMdBlankCount(s.blankCount),
      glossEnabled: s.glossEnabled,
      wordBankEnabled: s.wordBankEnabled,
      wordBankUsage: s.wordBankUsage,
      boxDistractors: s.boxDistractors,
      wordBankFidelity: s.wordBankFidelity,
      targetWordsMode: s.targetWordsMode,
      targetWordsPerBlank: s.targetWordsPerBlank,
      connectorFrame: s.connectorFrame,
      summarySourceMode: s.summarySourceMode,
      scoringGranularity: s.scoringGranularity,
      // 형식에서 **받지 않는** 필드 — 포렌식에서 "왜 이 줄이 없나"를 즉시 판별하기 위해.
      derived: ["modelAnswer", "wordBankDistractors", "connectorFrameAfter", "firstLetterHint"],
    };
  },

  diversityTargets(structuredData) {
    // question-diversity 의 요약 계열과 동일 축 — 빈칸 정답 어구를 회피 표적으로.
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
