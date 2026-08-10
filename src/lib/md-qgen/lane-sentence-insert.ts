// ============================================================================
// 문장 삽입(SENTENCE_INSERT) md 레인 디스크립터.
// 견본: lane-antonym.ts / 인터페이스: ./lane-types.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md §4-5
//
// ⚠ 과금 축: fast 레인의 getOperationType(fast/route.ts:90-98) 은
//   VOCAB_TYPES = {CONTEXT_MEANING, SYNONYM, ANTONYM} 만 QUESTION_GEN_VOCAB 로
//   보내고 나머지는 QUESTION_GEN_SINGLE 이다. 문장 삽입은 어휘 계열이 아니므로
//   QUESTION_GEN_SINGLE — 여기를 틀리면 크레딧이 이중 청구되거나 덜 청구된다.
// ============================================================================

import { buildSentenceInsertPointGuidance } from "@/lib/sentence-insert-point-catalog";
import {
  readOptionLanguageSetting,
  readStemLanguageSetting,
} from "@/lib/question-type-generation-settings";
import { normalizeWs } from "./parser";
import {
  SENTENCE_INSERT_MD_SLOT_MAX,
  SENTENCE_INSERT_MD_SLOT_MIN,
  buildMdSentenceInsertPrompt,
  clampInsertMdSlotCount,
} from "./prompts-sentence-insert";
import {
  autoSnapInsertGiven,
  parseMdSentenceInsert,
  type MdInsertQuestion,
} from "./parser-sentence-insert";
import { gateMdSentenceInsert } from "./gate-sentence-insert";
import { adaptMdSentenceInsertToAiQuestion } from "./adapter-sentence-insert";
import type { MdLane, MdLaneContext, MdLaneParsed } from "./lane-types";

const SENTENCE_INSERT_DIRECTION_EN =
  "Where would the given sentence best fit in the flow of the passage?";

function slotCountOf(ctx: MdLaneContext): number {
  return clampInsertMdSlotCount(
    (ctx.resolved as { sentenceInsertSlotCount?: number }).sentenceInsertSlotCount ??
      SENTENCE_INSERT_MD_SLOT_MIN,
  );
}

function paraphrasePrefixOf(ctx: MdLaneContext): boolean {
  return Boolean(
    (ctx.resolved as { sentenceInsertParaphrasePrefix?: boolean })
      .sentenceInsertParaphrasePrefix,
  );
}

function pointFocusOf(ctx: MdLaneContext): boolean {
  return Boolean(
    (ctx.resolved as { sentenceInsertPointFocus?: boolean }).sentenceInsertPointFocus,
  );
}

/** 포함 비교용 정규화 — 구두점·대소문자 무관(교사 지정 문장은 UI 에서 잘려 온다). */
function foldForCompliance(text: string): string {
  return normalizeWs(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 교사 지정 준수 게이트 — point-picker-config.ts:340-341 의 SENTENCE_INSERT 추출기
 * (`sourceSentenceToOmit` · `givenSentence`) 등가. promptRole 계약이
 * "지정한 문장을 지문에서 빼내어 주어진 문장으로 반드시 사용한다"이므로,
 * 지정 문장은 **빼낸 문장**과 포함 관계여야 한다.
 * 레이어 규칙상 app 모듈을 import 하지 않고 판정만 복제한다.
 */
function teacherPointIssues(q: MdInsertQuestion, ctx: MdLaneContext): string[] {
  if (ctx.teacherPoints.length === 0) return [];
  const issues: string[] = [];
  const surfaces = [q.given, q.givenVariant].map(foldForCompliance).filter(Boolean);
  if (surfaces.length === 0) return issues; // 판정 불가 — 게이트 #1 이 이미 말한다.
  for (const point of ctx.teacherPoints) {
    const pt = foldForCompliance(point.text);
    if (!pt) continue;
    const hit = surfaces.some(
      (s) => ` ${s} `.includes(` ${pt} `) || ` ${pt} `.includes(` ${s} `),
    );
    if (!hit) {
      issues.push(
        `교사 지정 문장을 빼내지 않았음: '${point.text.slice(0, 60)}' — 이 문장을 삽입문장으로 써라`,
      );
    }
  }
  return issues;
}

export const SENTENCE_INSERT_MD_LANE: MdLane = {
  subType: "SENTENCE_INSERT",

  // fast getOperationType 과 동기 — 어휘 계열이 아니므로 표준 2크레딧.
  operationType: "QUESTION_GEN_SINGLE",

  // 재구성 대조 게이트가 빡세 1차 반려율이 있을 것이라 보수 정책(신형 도입기 규약).
  retryEligible: true,

  isEligible(resolved) {
    const n = Number(
      (resolved as { sentenceInsertSlotCount?: number }).sentenceInsertSlotCount ??
        SENTENCE_INSERT_MD_SLOT_MIN,
    );
    return (
      Number.isFinite(n) &&
      n >= SENTENCE_INSERT_MD_SLOT_MIN &&
      n <= SENTENCE_INSERT_MD_SLOT_MAX
    );
  },

  buildBasePrompt(ctx) {
    return buildMdSentenceInsertPrompt(ctx.passage, "full", ctx.difficulty, {
      slotCount: slotCountOf(ctx),
      paraphrasePrefix: paraphrasePrefixOf(ctx),
    });
  },

  buildExtras(ctx) {
    const extras: string[] = [];
    // 응집장치 focus 가이드(기출 456문항 LLM 검증 분포) — pointFocus 일 때만 문자열을
    // 돌려준다. lib→lib 이므로 레이어 규칙 위반 없음.
    const guidance = buildSentenceInsertPointGuidance({
      variantIndex: ctx.variantIndex,
      pointFocus: pointFocusOf(ctx),
      diversityEnabled: ctx.variantCount > 1,
    });
    if (guidance) extras.push(guidance);

    if (readStemLanguageSetting(ctx.rawTypeSettings, "SENTENCE_INSERT") === "en") {
      extras.push(
        `## 질문 언어 (교사 설정, 필수)\n- 학생에게 보이는 발문은 영어로 낸다. 해설·오답 해설은 한국어 그대로 유지한다.`,
      );
    }
    return extras;
  },

  parseAndGate(text, ctx) {
    const parsed = parseMdSentenceInsert(text);
    const snapped = autoSnapInsertGiven(parsed, ctx.passage);
    const q = snapped.question;
    return {
      question: q,
      gateIssues: [
        ...gateMdSentenceInsert(q, ctx.passage, {
          slotCount: slotCountOf(ctx),
          paraphrasePrefix: paraphrasePrefixOf(ctx),
        }),
        ...teacherPointIssues(q, ctx),
      ],
      corrections: snapped.corrections,
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    const result = adaptMdSentenceInsertToAiQuestion(
      parsed.question as MdInsertQuestion,
      ctx.passage,
      ctx.rawDifficulty,
      paraphrasePrefixOf(ctx) ? "PREFIX_VARIANT" : "SOURCE_EXACT",
    );
    if (
      result.ok &&
      result.aiQuestion &&
      readStemLanguageSetting(ctx.rawTypeSettings, "SENTENCE_INSERT") === "en"
    ) {
      result.aiQuestion.direction = SENTENCE_INSERT_DIRECTION_EN;
    }
    return result;
  },

  qualityArgs(ctx) {
    return {
      sentenceInsertSlotCount: slotCountOf(ctx),
      stemLanguage: readStemLanguageSetting(ctx.rawTypeSettings, "SENTENCE_INSERT"),
      optionLanguage: readOptionLanguageSetting(ctx.rawTypeSettings, "SENTENCE_INSERT"),
    };
  },

  mdFormat(ctx) {
    return {
      slotCount: slotCountOf(ctx),
      paraphrasePrefix: paraphrasePrefixOf(ctx),
      pointFocus: pointFocusOf(ctx),
    };
  },

  /**
   * 회피 표적 = **이미 빼낸 문장**. 라우트는 이 배열을 "이 지문에서 이미 출제된
   * 자리" 헤더로 실어 보내는데, 이 유형은 "지문 문장 중 하나를 골라 빼내는" 계약이라
   * 축자 문장을 표적으로 내보내도 계약과 충돌하지 않는다(순서 유형과 다른 지점 —
   * 거기서는 지문 전체를 네 조각으로 덮어야 해서 축자 회피가 논리적 모순이었다).
   */
  diversityTargets(structuredData) {
    const targets: string[] = [];
    for (const key of ["omittedSourceSentence", "sourceSentenceToOmit", "givenSentence"]) {
      const value = structuredData[key];
      if (typeof value === "string" && value.trim()) {
        targets.push(value.trim());
        break;
      }
    }
    return targets;
  },
};
