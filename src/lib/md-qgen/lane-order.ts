// ============================================================================
// 글의 순서(SENTENCE_ORDER) md 레인 디스크립터.
// 견본: lane-antonym.ts / 인터페이스: ./lane-types.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md · 정밀 스펙: 정찰 종합 §3-C7
//
// 실장애 계통 메모(정찰 §4-D): 사용자가 본 "문제 생성 중 오류가 발생했습니다" 는
// preflightQuestionFeasibility 의 한국어 진단(최소 6문장·72단어)이 오류 매퍼의
// 하드 게이팅(workbench-generation-errors.ts:91-104)에 삼켜져 일반 문구로 바뀐
// 것이다. 그 봉합(X2)은 감독 소관이며, md 레인은 preflight 를 그대로 통과시킨다
// (라우트가 과금 전에 호출하므로 승차해도 동작 무변경).
// ============================================================================

import { buildSentenceOrderPointGuidance } from "@/lib/sentence-order-point-catalog";
import { countWords } from "@/lib/question-quality/core";
import {
  readOptionLanguageSetting,
  readStemLanguageSetting,
} from "@/lib/question-type-generation-settings";
import {
  buildMdSentenceOrderPrompt,
  clampOrderMdPrefixVariationCount,
  SENTENCE_ORDER_MD_PREFIX_VARIATION_MAX,
  SENTENCE_ORDER_MD_PREFIX_VARIATION_MIN,
} from "./prompts-order";
import {
  ORDER_LABELS,
  autoSnapOrderChunks,
  foldForOrderMatch,
  orderDisplayParagraphs,
  parseMdSentenceOrder,
  type MdOrderQuestion,
} from "./parser-order";
import { gateMdSentenceOrder } from "./gate-order";
import { adaptMdSentenceOrderToAiQuestion } from "./adapter-order";
import type { MdLane, MdLaneContext, MdLaneParsed } from "./lane-types";

const SENTENCE_ORDER_DIRECTION_EN =
  "Which is the most appropriate order of the paragraphs following the given passage?";

function prefixVariationOf(ctx: MdLaneContext): number {
  return clampOrderMdPrefixVariationCount(
    (ctx.resolved as { sentenceOrderPrefixVariationCount?: number })
      .sentenceOrderPrefixVariationCount ?? 0,
  );
}

function pointFocusOf(ctx: MdLaneContext): boolean {
  return Boolean(
    (ctx.resolved as { sentenceOrderPointFocus?: boolean }).sentenceOrderPointFocus,
  );
}

/**
 * 교사 지정 준수 게이트 — point-picker-config.ts:346-362 sentenceOrderComplies 등가.
 * 지정 문장이 순서 판단 단서가 되려면 주어진 글과 겹치거나, 어떤 단락의 시작/끝
 * (= 이음매 자리)이어야 한다. 레이어 규칙상 app 모듈을 import 하지 않고 복제한다.
 */
function teacherPointIssues(q: MdOrderQuestion, ctx: MdLaneContext): string[] {
  if (ctx.teacherPoints.length === 0) return [];
  if (q.paragraphs.length === 0) return []; // 판정 불가 — 통과
  const issues: string[] = [];
  const given = foldForOrderMatch(q.given);
  // 준수 판정은 **학생 표시면** 기준이다. 축자로만 재면, 변형이 갈아 끼우는 자리가
  // 정확히 '단락 첫 문장' 이라 교사가 이음매에 지정한 문장이 저장·인쇄본에서 사라졌는데도
  // '준수'로 통과한다(적대검수 실증 — 교사는 지정대로 출제됐다고 통보받는다).
  const exact = q.paragraphs.map((p) => foldForOrderMatch(p.text));
  const shown = (prefixVariationOf(ctx) > 0 ? orderDisplayParagraphs(q) : q.paragraphs).map((p) =>
    foldForOrderMatch(p.text),
  );
  const atSeam = (bodies: string[], pt: string) =>
    bodies.some((b) => b.startsWith(pt) || b.endsWith(pt));
  for (const point of ctx.teacherPoints) {
    const pt = foldForOrderMatch(point.text);
    if (!pt) continue;
    const inGiven = given.length > 0 && (given.includes(pt) || pt.includes(given));
    if (inGiven || atSeam(shown, pt)) continue;
    issues.push(
      atSeam(exact, pt)
        ? `교사 지정 문장이 변형 대상 단락의 첫 문장이라 학생 표시면에서 사라짐: '${point.text.slice(0, 40)}' — 절단선을 옮겨 그 문장이 단락 끝·주어진 글·변형하지 않는 단락의 시작 중 한 자리에 오게 하라`
        : `교사 지정 문장이 주어진 글·단락 경계 어디에도 없음: '${point.text.slice(0, 60)}'`,
    );
  }
  return issues;
}

export const SENTENCE_ORDER_MD_LANE: MdLane = {
  subType: "SENTENCE_ORDER",

  // fast 레인 getOperationType 과 동기 — 어휘 계열(1크레딧)이 아니므로 표준 2크레딧.
  operationType: "QUESTION_GEN_SINGLE",

  // 축자 분할 게이트가 빡세 1차 반려율이 있을 것이라 보수 정책(신형 도입기 규약).
  retryEligible: true,

  isEligible(resolved) {
    // Phase 1 정찰안은 prefixVariationCount === 0 만 허용(1 이상은 fast 폴백)이었다.
    // md 는 단락 2단 출력(축자 줄 + 변형 줄)으로 그 자기모순을 없앴으므로 전 범위를
    // 받는다 — fast 로 폴백시키면 100% 실패 확정 경로로 되돌리는 셈이다.
    const n = Number(
      (resolved as { sentenceOrderPrefixVariationCount?: number })
        .sentenceOrderPrefixVariationCount ?? 0,
    );
    return (
      Number.isFinite(n) &&
      n >= SENTENCE_ORDER_MD_PREFIX_VARIATION_MIN &&
      n <= SENTENCE_ORDER_MD_PREFIX_VARIATION_MAX
    );
  },

  buildBasePrompt(ctx) {
    return buildMdSentenceOrderPrompt(ctx.passage, "full", ctx.difficulty, {
      prefixVariationCount: prefixVariationOf(ctx),
    });
  },

  buildExtras(ctx) {
    const extras: string[] = [];
    // 응집장치 focus 가이드(기출 550문항 LLM 검증 분포) — pointFocus 일 때만 문자열을
    // 돌려준다. lib→lib 이므로 레이어 규칙 위반 없음.
    const guidance = buildSentenceOrderPointGuidance({
      variantIndex: ctx.variantIndex,
      pointFocus: pointFocusOf(ctx),
      diversityEnabled: ctx.variantCount > 1,
    });
    if (guidance) extras.push(guidance);

    if (readStemLanguageSetting(ctx.rawTypeSettings, "SENTENCE_ORDER") === "en") {
      extras.push(
        `## 질문 언어 (교사 설정, 필수)\n- 학생에게 보이는 발문은 영어로 낸다. 해설·오답 해설은 한국어 그대로 유지한다.`,
      );
    }
    return extras;
  },

  parseAndGate(text, ctx) {
    const parsed = parseMdSentenceOrder(text);
    const snapped = autoSnapOrderChunks(parsed, ctx.passage);
    const q = snapped.question;
    return {
      question: q,
      gateIssues: [
        ...gateMdSentenceOrder(q, ctx.passage, {
          prefixVariationCount: prefixVariationOf(ctx),
        }),
        ...teacherPointIssues(q, ctx),
      ],
      corrections: snapped.corrections,
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    const result = adaptMdSentenceOrderToAiQuestion(
      parsed.question as MdOrderQuestion,
      ctx.passage,
      ctx.rawDifficulty,
      prefixVariationOf(ctx) > 0 ? "PARAGRAPH_VARIANT" : "SOURCE_EXACT",
    );
    if (
      result.ok &&
      result.aiQuestion &&
      readStemLanguageSetting(ctx.rawTypeSettings, "SENTENCE_ORDER") === "en"
    ) {
      result.aiQuestion.direction = SENTENCE_ORDER_DIRECTION_EN;
    }
    return result;
  },

  qualityArgs(ctx) {
    // dispatcher 는 SENTENCE_ORDER 에 전용 개수 인자를 요구하지 않는다
    // (validateSentenceOrderQuestion 이 형식을 자체 판정) — 언어 실값만 넘긴다.
    return {
      stemLanguage: readStemLanguageSetting(ctx.rawTypeSettings, "SENTENCE_ORDER"),
      optionLanguage: readOptionLanguageSetting(ctx.rawTypeSettings, "SENTENCE_ORDER"),
    };
  },

  mdFormat(ctx) {
    const variation = prefixVariationOf(ctx);
    return {
      prefixVariationCount: variation,
      // 어느 라벨이 변형본으로 저장됐는지 — 축자가 아닌 단락을 포렌식으로 특정한다.
      variantLabels: ORDER_LABELS.slice(0, variation),
      pointFocus: pointFocusOf(ctx),
      paragraphCount: 3,
      optionCount: 5,
    };
  },

  /**
   * variation>0 에서 `sentence-order-paragraph-not-source-backed` 는 **설계상 필연**
   * 이다: 검증기는 paragraphs[].text 가 지문 축자일 것을 요구하는데(validators/
   * sentence-order.ts:696-704) 변형 단락은 첫 문장이 재진술본이기 때문이다. 축자
   * 대조는 md 게이트가 축자 줄로 이미 수행했으므로(무손실 분할·원문 순서 도출·문장
   * 경계) 이 코드를 기록하면 정상 문항이 결함으로 보여 포렌식이 오염된다.
   * variation=0 이면 그것은 진짜 결함이므로 한 건도 걸러내지 않는다.
   */
  filterQualityIssues(codes, ctx) {
    if (prefixVariationOf(ctx) <= 0) return codes;
    return codes.filter((code) => code !== "sentence-order-paragraph-not-source-backed");
  },

  diversityTargets(structuredData) {
    // ⚠ 이 유형은 **지문 축자를 회피 표적으로 내보내면 안 된다.** 라우트는 이 배열을
    //   `## 표적 회피 — 이미 출제된 자리(겹치지 않게 하라)` 헤더 아래에 그대로 싣는데
    //   (md-stream/route.ts:706), 이 유형의 하드 계약은 "지문 전체를 축자로 네 조각에
    //   남김없이 담아라"이고 주어진 글은 반드시 지문 맨 앞이다. 즉 '지문 첫 40자를
    //   피하라'는 지시는 게이트 #6(주어진 글이 지문 맨 앞 조각 · 앞부분 유실 금지)과
    //   논리적으로 양립 불가능해서, 모델이 지시를 따르면 무조건 반려되고 재생성도 같은
    //   충돌 블록을 받아 같은 반려로 수렴한다(잡 실패·환불). 종전 구현이 그랬다.
    //   → 표적은 축자가 아니라 **절단 좌표(단어 수)** 로 낸다. "같은 자리에서 자르지
    //     마라"는 계약과 충돌하지 않으면서 절단선 분산이라는 목적은 그대로 달성한다.
    const given = structuredData.givenSentence;
    const paragraphs = structuredData.paragraphs;
    if (typeof given !== "string" || !given.trim() || !Array.isArray(paragraphs)) return [];
    const bodies = (paragraphs as Array<Record<string, unknown>>)
      .map((row) => (typeof row?.text === "string" ? countWords(row.text) : 0))
      .filter((n) => n > 0);
    if (bodies.length === 0) return [];
    return [
      `이미 쓴 절단 좌표(단어수) 주어진글 ${countWords(given)} · 단락 ${bodies.join("/")} — 같은 자리에서 자르지 마라`,
    ];
  },
};
