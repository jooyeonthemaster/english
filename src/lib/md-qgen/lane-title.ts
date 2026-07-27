// ============================================================================
// 제목 추론(TITLE) md 레인 디스크립터.
// 견본: lane-antonym.ts / 인터페이스: ./lane-types.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md §4-7(선택형 확정 형식)
//
// 이 유형은 지문을 변형하지 않는 선택형 계열이라 md 계약이 가장 짧다. 대신
// 설정 노브는 다섯 개(선지수·정답수·정답극성·발문언어·선지언어)로 많은 편이라,
// 집행 지점을 분명히 갈라 두었다:
//   optionCount / answerCount / answerPolarity / optionLanguage → 베이스 프롬프트
//   optionCount / answerCount / optionLanguage                  → 0원 게이트
//   answerPolarity / stemLanguage / answerCount                 → 어댑터 발문(결정형)
// 그래서 buildExtras 가 비어 있다 — 붙일 블록이 없어서가 아니라, 전부 더 강한
// 지점(베이스·게이트·어댑터)에서 이미 집행되기 때문이다.
//
// ⚠ 후처리 없음(PASSTHROUGH_TYPES) — 어댑터가 완제품을 낸다.
// ⚠ 교사 지정 포인트는 이 유형에서 **소프트**다: point-picker-config 의
//   COMPLIANCE_SURFACES 에 TITLE 항목이 없어 fast 도 준수 판정을 하지 않는다
//   (지정 '근거 문장'이 반영됐는지는 0원 결정형으로 판정할 표면이 없다).
//   여기서 임의 게이트를 만들면 fast 와 판정이 갈리므로 만들지 않는다 —
//   지정 문장의 역할은 라우트가 붙이는 공유 블록의 promptRole 이 전담한다.
// ============================================================================

import {
  readOptionLanguageSetting,
  readStemLanguageSetting,
} from "@/lib/question-type-generation-settings";
import {
  buildMdTitlePrompt,
  clampTitleMdAnswerCount,
  clampTitleMdOptionCount,
  TITLE_MD_ANSWER_COUNT_DEFAULT,
  TITLE_MD_ANSWER_COUNT_MIN,
  TITLE_MD_OPTION_COUNT_DEFAULT,
  TITLE_MD_OPTION_COUNT_MAX,
  TITLE_MD_OPTION_COUNT_MIN,
  type TitleMdAnswerPolarity,
} from "./prompts-title";
import {
  autoSnapTitleOptions,
  gateMdTitle,
  parseMdTitle,
  type MdTitleQuestion,
} from "./parser-title";
import { adaptMdTitleToAiQuestion } from "./adapter-title";
import type { MdLane, MdLaneContext, MdLaneParsed } from "./lane-types";

interface TitleResolved {
  genericOptionCount?: number;
  genericAnswerCount?: number;
  answerPolarity?: TitleMdAnswerPolarity;
}

function optionCountOf(ctx: MdLaneContext): number {
  return clampTitleMdOptionCount(
    (ctx.resolved as TitleResolved).genericOptionCount ?? TITLE_MD_OPTION_COUNT_DEFAULT,
  );
}

function answerCountOf(ctx: MdLaneContext): number {
  return clampTitleMdAnswerCount(
    (ctx.resolved as TitleResolved).genericAnswerCount ?? TITLE_MD_ANSWER_COUNT_DEFAULT,
    optionCountOf(ctx),
  );
}

/** 대의파악 계열 극성 토글 — 미설정(POSITIVE)이면 리졸버가 키를 아예 안 싣는다. */
function isNegativeOf(ctx: MdLaneContext): boolean {
  return (ctx.resolved as TitleResolved).answerPolarity === "NEGATIVE";
}

function optionLanguageOf(ctx: MdLaneContext): "ko" | "en" {
  return readOptionLanguageSetting(ctx.rawTypeSettings, "TITLE") === "ko" ? "ko" : "en";
}

function stemLanguageOf(ctx: MdLaneContext): "ko" | "en" {
  return readStemLanguageSetting(ctx.rawTypeSettings, "TITLE") === "en" ? "en" : "ko";
}

export const TITLE_MD_LANE: MdLane = {
  subType: "TITLE",

  // ⚠ fast 레인 getOperationType 과 동기(fast/route.ts:68 VOCAB_TYPES =
  // {CONTEXT_MEANING, SYNONYM, ANTONYM}). TITLE 은 그 집합 밖이므로 표준 2크레딧이다.
  // 여기를 QUESTION_GEN_VOCAB 로 "고쳐" 두면 fast 폴백과 요금이 갈린다.
  operationType: "QUESTION_GEN_SINGLE",

  // 신형식 초기 반려율 실측이 없으므로 보수 정책(어법 도입기와 동일).
  retryEligible: true,

  isEligible(resolved) {
    const r = resolved as TitleResolved;
    const optionCount = Number(r.genericOptionCount ?? TITLE_MD_OPTION_COUNT_DEFAULT);
    const answerCount = Number(r.genericAnswerCount ?? TITLE_MD_ANSWER_COUNT_DEFAULT);
    return (
      Number.isFinite(optionCount) &&
      Number.isFinite(answerCount) &&
      optionCount >= TITLE_MD_OPTION_COUNT_MIN &&
      optionCount <= TITLE_MD_OPTION_COUNT_MAX &&
      answerCount >= TITLE_MD_ANSWER_COUNT_MIN &&
      answerCount <= optionCount - 1
    );
  },

  buildBasePrompt(ctx) {
    return buildMdTitlePrompt(ctx.passage, "full", ctx.difficulty, {
      optionCount: optionCountOf(ctx),
      answerCount: answerCountOf(ctx),
      optionLanguage: optionLanguageOf(ctx),
      answerPolarity: isNegativeOf(ctx) ? "NEGATIVE" : "POSITIVE",
    });
  },

  buildExtras() {
    // 이 유형의 설정 다섯 개는 전부 베이스 프롬프트·게이트·어댑터에서 집행된다
    // (파일 상단 주석의 집행 지점 표 참조). 특히 발문은 모델이 만들지 않으므로
    // 질문 언어 블록을 붙이면 존재하지 않는 필드를 지시하는 셈이라 붙이지 않는다.
    return [];
  },

  parseAndGate(text, ctx) {
    const snapped = autoSnapTitleOptions(parseMdTitle(text));
    const q = snapped.question;
    return {
      question: q,
      gateIssues: gateMdTitle(q, ctx.passage, {
        optionCount: optionCountOf(ctx),
        answerCount: answerCountOf(ctx),
        optionLanguage: optionLanguageOf(ctx),
      }),
      corrections: snapped.corrections,
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    return adaptMdTitleToAiQuestion(
      parsed.question as MdTitleQuestion,
      ctx.passage,
      ctx.rawDifficulty,
      {
        negative: isNegativeOf(ctx),
        stemLanguage: stemLanguageOf(ctx),
      },
    );
  },

  qualityArgs(ctx) {
    return {
      genericOptionCount: optionCountOf(ctx),
      genericAnswerCount: answerCountOf(ctx),
      // 미설정(POSITIVE)이면 키를 싣지 않는다 — dispatcher 의 극성 게이트는
      // "NEGATIVE 일 때만" 동작하는 계약이라 기본 경로 동작이 불변이어야 한다.
      ...(isNegativeOf(ctx) ? { answerPolarity: "NEGATIVE" as const } : {}),
      stemLanguage: stemLanguageOf(ctx),
      optionLanguage: optionLanguageOf(ctx),
    };
  },

  mdFormat(ctx) {
    return {
      optionCount: optionCountOf(ctx),
      answerCount: answerCountOf(ctx),
      answerPolarity: isNegativeOf(ctx) ? "NEGATIVE" : "POSITIVE",
      optionLanguage: optionLanguageOf(ctx),
    };
  },

  diversityTargets(structuredData) {
    // 회피 표적은 **정답 제목**이다. 지문을 변형하지 않는 유형이라 축자 회피가
    // 게이트와 충돌할 여지가 없고(순서 유형의 함정), 같은 지문에서 같은 제목이
    // 반복 출제되는 것이 이 유형의 실제 중복 계통이다. 오답까지 싣지 않는 이유는
    // 회피 목록 상한이 8개라 정답이 밀려나면 목적을 잃기 때문이다.
    const options = structuredData.options;
    if (!Array.isArray(options)) return [];
    const answerLabels = new Set<string>();
    const push = (value: unknown) => {
      const label = String(value ?? "").trim();
      if (label) answerLabels.add(label);
    };
    if (Array.isArray(structuredData.correctAnswers)) {
      for (const value of structuredData.correctAnswers) push(value);
    }
    if (typeof structuredData.correctAnswer === "string") {
      for (const part of structuredData.correctAnswer.split(",")) push(part);
    }
    if (answerLabels.size === 0) return [];
    const targets: string[] = [];
    for (const row of options as Array<Record<string, unknown>>) {
      const label = String(row?.label ?? "").trim();
      const text = typeof row?.text === "string" ? row.text.trim() : "";
      if (text && answerLabels.has(label)) targets.push(text.slice(0, 90));
    }
    return targets;
  },
};
