// ============================================================================
// 함축 의미 추론(IMPLIED_MEANING) md 레인 디스크립터.
// 견본: lane-antonym.ts / 인터페이스: ./lane-types.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md §4-7
//
// 과금 축: fast 레인 getOperationType 의 VOCAB_TYPES 는
// {CONTEXT_MEANING, SYNONYM, ANTONYM} 뿐이다 — IMPLIED_MEANING 은 그 집합 밖이라
// QUESTION_GEN_SINGLE(2크레딧)이 맞다. 여기를 "어휘 계열이니까" 하고 VOCAB 으로
// 고쳐 두면 fast 폴백과 요금이 갈린다(정찰 R1 의 반대 방향 사고).
// ============================================================================

import {
  readGenericAnswerCountSetting,
  readGenericOptionCountSetting,
  readOptionLanguageSetting,
  readStemLanguageSetting,
} from "@/lib/question-type-generation-settings";
import { normalizeWs } from "./parser";
import {
  buildMdImpliedCandidateBlock,
  buildMdImpliedPrompt,
  clampImpliedMdAnswerCount,
  clampImpliedMdOptionCount,
  IMPLIED_MD_ANSWER_COUNT_DEFAULT,
  IMPLIED_MD_ANSWER_COUNT_MIN,
  IMPLIED_MD_OPTION_COUNT_DEFAULT,
  IMPLIED_MD_OPTION_COUNT_MAX,
  IMPLIED_MD_OPTION_COUNT_MIN,
} from "./prompts-implied";
import {
  autoSnapImpliedTarget,
  parseMdImplied,
  type MdImpliedQuestion,
} from "./parser-implied";
import { gateMdImplied } from "./gate-implied";
import {
  adaptMdImpliedToAiQuestion,
  IMPLIED_MD_DIRECTION_MULTI,
} from "./adapter-implied";
import type { MdLane, MdLaneContext, MdLaneParsed } from "./lane-types";

const IMPLIED_DIRECTION_EN_SINGLE =
  "Which of the following best describes what the underlined part in the passage implies?";
/** 후처리 DEFAULT_MULTI_EN_DIRECTION 과 동일 문자열 — 그대로 살아남는다. */
const IMPLIED_DIRECTION_EN_MULTI =
  "Choose all appropriate meanings of the underlined expression.";

interface ImpliedResolved {
  genericOptionCount?: number;
  genericAnswerCount?: number;
}

function optionCountOf(ctx: MdLaneContext): number {
  return clampImpliedMdOptionCount(
    (ctx.resolved as ImpliedResolved).genericOptionCount ??
      IMPLIED_MD_OPTION_COUNT_DEFAULT,
  );
}

function answerCountOf(ctx: MdLaneContext): number {
  return clampImpliedMdAnswerCount(
    (ctx.resolved as ImpliedResolved).genericAnswerCount ??
      IMPLIED_MD_ANSWER_COUNT_DEFAULT,
    optionCountOf(ctx),
  );
}

/**
 * 보기 언어 — 이 유형은 getQuestionLanguageToggleScope 가 "stem-option" 이라
 * 보기 언어가 실제 토글이다(구조적으로 고정된 유형과 다르다). 기본값 en.
 */
function optionLanguageOf(ctx: MdLaneContext): "ko" | "en" {
  return readOptionLanguageSetting(ctx.rawTypeSettings, "IMPLIED_MEANING") === "ko"
    ? "ko"
    : "en";
}

function stemLanguageOf(ctx: MdLaneContext): "ko" | "en" {
  return readStemLanguageSetting(ctx.rawTypeSettings, "IMPLIED_MEANING") === "en"
    ? "en"
    : "ko";
}

/**
 * 교사 지정 준수 게이트 — 이 유형은 POINT_PICKER_CONFIG 미등재라 실제로는
 * teacherPoints 가 항상 비어 온다(clampTeacherPoints 가 미등재 유형에 [] 반환).
 * 그래도 방어적으로 구현해 둔다: 나중에 픽커가 열리면 "지정 표현이 밑줄이어야
 * 한다" 가 이 유형의 유일한 결정형 준수 조건이기 때문이다.
 */
function teacherPointIssues(q: MdImpliedQuestion, ctx: MdLaneContext): string[] {
  if (ctx.teacherPoints.length === 0) return [];
  const target = normalizeWs(q.expression);
  const issues: string[] = [];
  for (const p of ctx.teacherPoints) {
    const pt = normalizeWs(p.text);
    if (!pt) continue;
    if (!target || (!target.includes(pt) && !pt.includes(target))) {
      issues.push(`교사 지정 표현이 밑줄에 없음: '${p.text.slice(0, 60)}'`);
    }
  }
  return issues;
}

export const IMPLIED_MEANING_MD_LANE: MdLane = {
  subType: "IMPLIED_MEANING",

  // fast 레인 getOperationType 과 동기 — VOCAB_TYPES 밖이므로 2크레딧.
  operationType: "QUESTION_GEN_SINGLE",

  // 신형식 초기 반려율 실측이 없으므로 보수 정책(어법 도입기와 동일).
  retryEligible: true,

  isEligible(resolved) {
    const r = resolved as ImpliedResolved;
    const optionCount = Number(
      r.genericOptionCount ?? IMPLIED_MD_OPTION_COUNT_DEFAULT,
    );
    const answerCount = Number(
      r.genericAnswerCount ?? IMPLIED_MD_ANSWER_COUNT_DEFAULT,
    );
    return (
      Number.isFinite(optionCount) &&
      Number.isFinite(answerCount) &&
      optionCount >= IMPLIED_MD_OPTION_COUNT_MIN &&
      optionCount <= IMPLIED_MD_OPTION_COUNT_MAX &&
      answerCount >= IMPLIED_MD_ANSWER_COUNT_MIN &&
      answerCount <= optionCount - 1
    );
  },

  buildBasePrompt(ctx) {
    return buildMdImpliedPrompt(ctx.passage, "full", ctx.difficulty, {
      optionCount: optionCountOf(ctx),
      answerCount: answerCountOf(ctx),
      // 보기 언어는 base 프롬프트가 직접 집행한다 — 선지 작성 지시와 같은 자리에
      // 있어야 "base 는 영어를 시키고 extras 가 한국어로 뒤집는" 자기모순이 없다.
      optionLanguage: optionLanguageOf(ctx),
    });
  },

  buildExtras(ctx) {
    const extras: string[] = [];
    // 지문에서 뽑은 표적 후보 — 이 블록만이 프롬프트에 실릴 수 없는 "이 지문의
    // 실제 후보 목록"을 준다(≤6단어·3갈래 가드레일 + 1회 등장 필터 포함).
    // ⚠ fast 공용 블록(buildImpliedMeaningCandidateBlock)을 그대로 싣지 않는다 —
    //   md 형식에 없는 surroundingText 출력을 요구하고, 표적 줄을 `밑줄:` 이 아닌
    //   JSON 필드명으로 지칭하며, 후보 0건 분기가 base 의 보기 언어 설정을
    //   "선지는 영어" 로 뒤집는다. md 계약 번역본을 소유 파일에서 관리한다.
    const candidateBlock = buildMdImpliedCandidateBlock(ctx.passage, ctx.difficulty, {
      variantIndex: ctx.variantIndex,
      diversityEnabled: ctx.variantCount > 1,
    });
    if (candidateBlock) extras.push(candidateBlock);

    // 질문 언어 — md 레인의 확인된 기존 구멍(라우트에 stemLanguage 참조 0건)을
    // 레인에서 메운다. 보기 언어는 base 가 이미 집행했으므로 발문만 다룬다.
    if (stemLanguageOf(ctx) === "en") {
      extras.push(
        "## 질문 언어 (교사 설정, 필수)\n- 학생에게 보이는 발문은 영어로 낸다. 해설·오답 해설은 한국어 그대로 유지한다.",
      );
    }
    return extras;
  },

  parseAndGate(text, ctx) {
    const parsed = parseMdImplied(text);
    const snapped = autoSnapImpliedTarget(parsed, ctx.passage);
    const q = snapped.question;
    return {
      question: q,
      gateIssues: [
        ...gateMdImplied(q, ctx.passage, {
          optionCount: optionCountOf(ctx),
          answerCount: answerCountOf(ctx),
          optionLanguage: optionLanguageOf(ctx),
          difficulty: ctx.difficulty,
        }),
        ...teacherPointIssues(q, ctx),
      ],
      corrections: snapped.corrections,
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    const result = adaptMdImpliedToAiQuestion(
      parsed.question as MdImpliedQuestion,
      ctx.passage,
      ctx.rawDifficulty,
    );
    if (result.ok && result.aiQuestion && stemLanguageOf(ctx) === "en") {
      result.aiQuestion.direction =
        result.aiQuestion.direction === IMPLIED_MD_DIRECTION_MULTI
          ? IMPLIED_DIRECTION_EN_MULTI
          : IMPLIED_DIRECTION_EN_SINGLE;
    }
    return result;
  },

  qualityArgs(ctx) {
    return {
      genericOptionCount: optionCountOf(ctx),
      genericAnswerCount: answerCountOf(ctx),
      stemLanguage: stemLanguageOf(ctx),
      optionLanguage: optionLanguageOf(ctx),
    };
  },

  mdFormat(ctx) {
    return {
      optionCount: optionCountOf(ctx),
      answerCount: answerCountOf(ctx),
      optionLanguage: optionLanguageOf(ctx),
    };
  },

  diversityTargets(structuredData) {
    const target = structuredData.underlinedExpression;
    return typeof target === "string" && target.trim()
      ? [target.trim().slice(0, 90)]
      : [];
  },

  /**
   * md 계약이 **의도적으로 싣지 않는 내부 검수 필드** 때문에 발행되는 코드만
   * 걸러낸다. 확정 형식(규범 §4-7)은 `밑줄:` + 선지 + 정답 + 해설 + 오답이고,
   * fast 스키마의 surfaceMeaning·reasoningGap·evidenceChain 은 학생 표면에
   * 렌더되지 않는 검수 메모라 md 는 그 셋을 받지 않는다. 대신 그것들이 지키려던
   * 품질축(표면-이면 간극)은 프롬프트의 리트머스 검사(사고 안 수행)와
   * gate-implied 의 표적 게이트(축자·6단어·단일단어·절단·수사의문문·인접 재진술)로
   * 옮겨 담았다.
   *
   * 이 셋을 안 걸러내면 **모든 KILLER 문항**에 error 3건이 붙어 정상 문항이
   * 결함으로 보이고 포렌식이 통째로 오염된다(lane-order 의 선례와 동일 사상).
   * ⚠ 감독 판단 대기: 이 필드들을 md 형식에 추가할지는 감독 승인 사항이다
   *    (fast 는 KILLER 에서 이 셋을 실차단한다 — 보고서 uncertain 항목).
   */
  filterQualityIssues(codes) {
    const CONTRACT_ABSENT = new Set([
      "implied-meaning-missing-surface-meaning",
      "implied-meaning-thin-reasoning-gap",
      "implied-meaning-thin-evidence-chain",
    ]);
    return codes.filter((code) => !CONTRACT_ABSENT.has(code));
  },
};

// 설정 리더 재수출 — 라우트는 lane 인터페이스만 소비하지만, 벤치·픽스처가
// "UI 설정 → resolved" 경로를 직접 재현할 때 쓴다(견본 lane-antonym 동형).
export { readGenericAnswerCountSetting, readGenericOptionCountSetting };
