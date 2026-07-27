// ============================================================================
// 무관한 문장(IRRELEVANT) md 레인 디스크립터.
// 견본(EXEMPLAR): lane-antonym.ts · 인터페이스: ./lane-types.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md
//
// 과금 축(중대): fast 레인의 getOperationType 은 VOCAB_TYPES =
// {CONTEXT_MEANING, SYNONYM, ANTONYM} 만 QUESTION_GEN_VOCAB 로 보낸다
// (fast/route.ts:70,95). IRRELEVANT 는 그 집합 밖이므로 QUESTION_GEN_SINGLE 이
// 정답이다 — 여기서 어긋나면 크레딧이 이중 청구되거나 과소 청구된다.
// ============================================================================

import { buildIrrelevantPointGuidance } from "@/lib/irrelevant-point-catalog";
import { countPassageSentences, splitPassageSentences } from "@/lib/passage-sentence-utils";
import {
  IRRELEVANT_SLOT_COUNT_DEFAULT,
  readOptionLanguageSetting,
  readStemLanguageSetting,
  validateIrrelevantAgainstPassage,
} from "@/lib/question-type-generation-settings";
import {
  buildMdIrrelevantPrompt,
  clampIrrelevantMdSlotCount,
  IRRELEVANT_MD_SLOT_COUNT_MAX,
  IRRELEVANT_MD_SLOT_COUNT_MIN,
} from "./prompts-irrelevant";
import {
  autoSnapIrrelevantSlots,
  parseMdIrrelevant,
  type MdIrrelevantQuestion,
} from "./parser-irrelevant";
import { gateMdIrrelevant } from "./gate-irrelevant";
import { adaptMdIrrelevantToAiQuestion } from "./adapter-irrelevant";
import type { MdLane, MdLaneContext, MdLaneParsed } from "./lane-types";

const IRRELEVANT_DIRECTION_EN =
  "Which sentence does NOT fit in the overall flow of the passage?";

function slotCountOf(ctx: MdLaneContext): number {
  return clampIrrelevantMdSlotCount(
    (ctx.resolved as { irrelevantSlotCount?: number }).irrelevantSlotCount ??
      IRRELEVANT_SLOT_COUNT_DEFAULT,
  );
}

function pointFocusOf(ctx: MdLaneContext): boolean {
  return Boolean(
    (ctx.resolved as { irrelevantPointFocus?: boolean }).irrelevantPointFocus,
  );
}

/** 준수 판정용 정규화 — point-picker-config.ts:294-303 복제(레이어 규칙상 app 미import). */
const normalizeForCompliance = (s: string) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function complianceOverlaps(a: string, b: string): boolean {
  const na = normalizeForCompliance(a);
  const nb = normalizeForCompliance(b);
  if (!na || !nb) return false;
  return ` ${na} `.includes(` ${nb} `) || ` ${nb} `.includes(` ${na} `);
}

/**
 * 교사 지정 준수 게이트 — COMPLIANCE_SURFACES.IRRELEVANT 는 `sentences[]` 다
 * (point-picker-config.ts:342-343). 지정 문장이 번호 슬롯 중 하나와 겹쳐야 한다.
 * 표면 부재(슬롯 0개)는 판정 불가로 통과시킨다(원 구현과 동일 보수 규약).
 *
 * ⚠ **지문 첫 문장 예외**: 포인트 피커는 첫 문장을 막지 않는데(index 0 배제 없음),
 *   이 유형은 도입문에 번호를 붙일 수 없다(게이트 #6 · 프로덕션
 *   irrelevant-source-first-sentence). 그대로 차단하면 준수 게이트와 게이트 #6 이
 *   **상호 배타 조건**이 되어 재생성해도 반드시 실패·환불로 수렴한다(삽입문이 첫
 *   문장을 품게 우회하면 이번엔 신규성 게이트가 잡는다). 같은 상황에서 fast 는
 *   `teacher-point-ignored` 를 relaxed 에서 경고로 강등해 문항을 출하한다 —
 *   md 만 하드 실패하면 안 된다. 판정 불가로 통과시키고 보정 기록에 남긴다.
 */
function teacherPointIssues(
  q: MdIrrelevantQuestion,
  ctx: MdLaneContext,
): { issues: string[]; notes: string[] } {
  if (ctx.teacherPoints.length === 0 || q.slots.length === 0) {
    return { issues: [], notes: [] };
  }
  const firstSentence = splitPassageSentences(ctx.passage)[0] ?? "";
  const issues: string[] = [];
  const notes: string[] = [];
  for (const point of ctx.teacherPoints) {
    if (q.slots.some((slot) => complianceOverlaps(slot.text, point.text))) continue;
    if (firstSentence && complianceOverlaps(firstSentence, point.text)) {
      notes.push(
        `교사 지정 문장이 지문 첫 문장(도입문)이라 이 유형에서는 번호를 붙일 수 없어 준수 검사를 건너뜀: '${point.text.slice(0, 40)}'`,
      );
      continue;
    }
    issues.push(`교사 지정 문장이 번호 슬롯에 없음: '${point.text.slice(0, 60)}'`);
  }
  return { issues, notes };
}

/**
 * 지문 대조 적격성 — **라우트 `mdEligible` 단계에서 반드시 함께 호출해야 하는 배선
 * 필수 항목**(감독 소관. 주석·보고서가 아니라 배선으로 집행되어야 한다).
 *
 * `MdLane.isEligible` 은 resolved 만 받아 지문을 볼 수 없다. 그래서 지문 문장수로는
 * 불가능한 조합(9문장 지문 + 슬롯 10)이 md 로 들어와 QUESTION_GEN_SINGLE 2크레딧을
 * **선차감한 뒤** 확정 실패한다(모델이 쓸 원문 소스가 8개뿐이라 게이트가 반드시
 * 반려하고 재생성도 같은 결과 → 잡 실패·환불. 사용자는 60~120초와 LLM 2콜을 버린다).
 * fast 는 차감 전에 400 으로 "선택지 수를 N개 이하로 줄이거나 더 긴 지문을 선택해
 * 주세요" 를 즉시 돌려주던 경로다(fast/route.ts:309-326 · 같은 검증 함수).
 * `preflightQuestionFeasibility` 는 SENTENCE_ORDER 만 처리하므로 md 경로에는 이
 * 방어가 없다 → 라우트에서 `!ok` 면 400 `MD_STREAM_INELIGIBLE` 로 fast 폴백시켜라.
 *
 * 배선 전까지의 완충으로 `parseAndGate` 도 이 검사를 선행해, 최소한 실패 사유가
 * "번호 마커 9개 (10개 필요)" 라는 오도 문구가 아니라 진짜 원인이 되게 한다.
 */
export function checkIrrelevantMdPassageFeasibility(
  resolved: Record<string, unknown>,
  passage: string,
): { ok: boolean; error?: string; effective: number } {
  const requested = clampIrrelevantMdSlotCount(
    (resolved as { irrelevantSlotCount?: number }).irrelevantSlotCount ??
      IRRELEVANT_SLOT_COUNT_DEFAULT,
  );
  const result = validateIrrelevantAgainstPassage(
    requested,
    countPassageSentences(passage),
  );
  return result.ok
    ? { ok: true, effective: result.effective }
    : { ok: false, error: result.error, effective: result.effective };
}

export const IRRELEVANT_MD_LANE: MdLane = {
  subType: "IRRELEVANT",

  // ⚠ fast 레인 getOperationType 과 동기 — 어휘 계열이 아니므로 표준 2크레딧.
  operationType: "QUESTION_GEN_SINGLE",

  // 지문 재구성 게이트가 빡세 1차 반려율이 있을 것이라 보수 정책(신형 도입기 규약).
  retryEligible: true,

  isEligible(resolved) {
    const n = Number(
      (resolved as { irrelevantSlotCount?: number }).irrelevantSlotCount ??
        IRRELEVANT_SLOT_COUNT_DEFAULT,
    );
    return (
      Number.isFinite(n) &&
      n >= IRRELEVANT_MD_SLOT_COUNT_MIN &&
      n <= IRRELEVANT_MD_SLOT_COUNT_MAX
    );
  },

  buildBasePrompt(ctx) {
    return buildMdIrrelevantPrompt(ctx.passage, "full", ctx.difficulty, {
      slotCount: slotCountOf(ctx),
    });
  },

  buildExtras(ctx) {
    const extras: string[] = [];
    // 무관성 유형 focus 가이드(기출 227문항 LLM 검증 분포) — pointFocus 일 때만
    // 문자열을 돌려준다. lib→lib 이므로 레이어 규칙 위반 없음.
    const guidance = buildIrrelevantPointGuidance({
      variantIndex: ctx.variantIndex,
      pointFocus: pointFocusOf(ctx),
      diversityEnabled: ctx.variantCount > 1,
    });
    if (guidance) extras.push(guidance);

    if (readStemLanguageSetting(ctx.rawTypeSettings, "IRRELEVANT") === "en") {
      extras.push(
        `## 질문 언어 (교사 설정, 필수)\n- 학생에게 보이는 발문은 영어로 낸다. 해설·오답 해설은 한국어 그대로 유지한다.`,
      );
    }
    return extras;
  },

  parseAndGate(text, ctx) {
    const parsed = parseMdIrrelevant(text);
    const snapped = autoSnapIrrelevantSlots(parsed, ctx.passage);
    const q = snapped.question;
    // 지문으로는 불가능한 슬롯 수면 다른 반려는 전부 파생 잡음이다 — 진짜 원인만 낸다.
    const feasibility = checkIrrelevantMdPassageFeasibility(ctx.resolved, ctx.passage);
    if (!feasibility.ok) {
      return {
        question: q,
        gateIssues: [
          `선택지 수 ${slotCountOf(ctx)}개는 이 지문으로 만들 수 없다 — ${feasibility.error ?? ""}`.trim(),
        ],
        corrections: snapped.corrections,
      };
    }
    const teacher = teacherPointIssues(q, ctx);
    return {
      question: q,
      gateIssues: [
        ...gateMdIrrelevant(q, ctx.passage, {
          slotCount: slotCountOf(ctx),
          difficulty: ctx.difficulty,
        }),
        ...teacher.issues,
      ],
      corrections: [...snapped.corrections, ...teacher.notes],
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    const result = adaptMdIrrelevantToAiQuestion(
      parsed.question as MdIrrelevantQuestion,
      ctx.passage,
      ctx.rawDifficulty,
    );
    if (
      result.ok &&
      result.aiQuestion &&
      readStemLanguageSetting(ctx.rawTypeSettings, "IRRELEVANT") === "en"
    ) {
      result.aiQuestion.direction = IRRELEVANT_DIRECTION_EN;
    }
    return result;
  },

  qualityArgs(ctx) {
    return {
      irrelevantSlotCount: slotCountOf(ctx),
      stemLanguage: readStemLanguageSetting(ctx.rawTypeSettings, "IRRELEVANT"),
      optionLanguage: readOptionLanguageSetting(ctx.rawTypeSettings, "IRRELEVANT"),
    };
  },

  mdFormat(ctx) {
    return {
      slotCount: slotCountOf(ctx),
      pointFocus: pointFocusOf(ctx),
      // 계약 식별자 — 포렌식에서 "교체형"과 혼동되지 않게 명시한다.
      passageMode: "INSERTION",
    };
  },

  /**
   * ⚠ 표시 원문 문장을 회피 표적으로 내보내면 안 된다. 라우트는 이 배열을
   *   `## 표적 회피 — 이미 출제된 자리(겹치지 않게 하라)` 아래에 그대로 싣는데,
   *   짧은 지문에서는 "쓸 수 있는 원문 문장 전부"가 회피 목록이 되어 게이트와
   *   양립 불가능해진다(재생성도 같은 충돌로 수렴 → 잡 실패·환불).
   *   이 유형의 진짜 다양성 축은 **삽입한 무관 문장**이므로 그것만 낸다.
   */
  diversityTargets(structuredData) {
    const sentences = structuredData.sentences;
    const index = Number(structuredData.irrelevantIndex);
    if (!Array.isArray(sentences) || !Number.isInteger(index)) return [];
    const inserted = sentences[index];
    if (typeof inserted !== "string" || !inserted.trim()) return [];
    return [`이미 쓴 무관 문장: ${inserted.trim().slice(0, 90)}`];
  },
};
