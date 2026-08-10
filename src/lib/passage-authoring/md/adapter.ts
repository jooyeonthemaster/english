// ============================================================================
// AI 지문 생성 — 마크다운 파싱 결과 → AuthoringResultItem 어댑터
//
// 이 파일이 있는 이유는 하나다: **결과 카드·커버리지·지표·지문함 등록이 한 줄도
// 바뀌지 않게 하는 것.** 스트리밍 레인은 출력 형식만 다르고, 그 뒤의 모든 표면은
// 기존 AuthoringResultItem 만 본다.
//
// 서버 결정론 계약(generate.ts 와 동일 — 파기 금지)
//  · metrics/coverage 는 모델에게 묻지 않는다. metrics.ts 가 본문에서 계산한다.
//  · usedMaterialIds 는 selectAuthoringMaterialsWithBudget 이 **실제로 프롬프트에
//    실은** 자료 id 다(환각 근거 표시 차단). 그래서 호출부가 그 결과를 그대로 넘긴다.
//  · 본문이 망가지면(빈 본문·비영어·분량 폭주/붕괴) 실패로 판정해 호출부가 JSON
//    레인으로 폴백한다. 반대로 **메타만 비면 절대 실패시키지 않는다** — 결정론
//    폴백으로 채운다(설명 한 줄 때문에 멀쩡한 지문을 버리고 과금하는 것이 가장
//    나쁜 결과다).
//
// ⚠️ 알려진 이중 소유(정리 대상)
//   하드 분량비(0.6~1.6) · 봉투 위반 문구 · 한국어 폴백 두 개는 generate.ts 의
//   module-private 함수와 같은 판정을 한다. 수치의 원본은 두 파일 모두
//   prompts.targetWordRange / prompts.applyOffset **한 곳**이라 이중장부는 아니지만,
//   generate.ts 가 그 함수들을 export 하면 이 파일은 그걸 import 해야 한다.
// ============================================================================

import {
  bridgeStubWarnings,
  computeCoverage,
  computePassageMetrics,
  extractVocabTerms,
  extractVocabTermStats,
} from "../metrics";
import { applyOffset, summarizeMaterials, targetWordRange } from "../prompts";
import {
  GRADE_BAND_LABELS,
  PLAN_SKELETON_CODES,
  type AuthoringMaterial,
  type AuthoringRequest,
  type AuthoringResultItem,
  type PassageMetrics,
  type PassagePlan,
  type PassageSkeleton,
} from "../schema";
import type { AuthoredMd } from "./parser";

/** 결과 1편의 내용부. id·index·status 는 호출부(잡 러너/스트림 라우트)가 붙인다. */
export type AuthoredItemBody = Omit<AuthoringResultItem, "id" | "index" | "status">;

export interface AdaptAuthoredMdContext {
  request: AuthoringRequest;
  /** 실제로 프롬프트에 실린 자료 사본(선별·클리핑 후). */
  materials: AuthoringMaterial[];
  /** 이 편에 배정된 골격 — plan.skeleton 이 쓰레기일 때의 결정론 폴백. */
  skeleton: Exclude<PassageSkeleton, "AUTO">;
  perMaterialCharsSent: Record<string, { sent: number; total: number }>;
}

export interface AdaptAuthoredMdResult {
  ok: boolean;
  item?: AuthoredItemBody;
  /** 하드 게이트 위반 사유(한국어). 비면 통과다. */
  issues: string[];
}

// ── 하드 게이트 ─────────────────────────────────────────────────────────────
// generate.ts 의 MIN/MAX_WORD_RATIO 와 같은 값이다. 이 밖이면 "쓸 수 없는 지문"이고,
// 스트리밍 레인에서는 실패가 아니라 **JSON 레인 폴백**의 신호가 된다.
const MIN_WORD_RATIO = 0.6;
const MAX_WORD_RATIO = 1.6;

/** 본문이 영어인지 — 자료가 한국어일 때 통째로 한국어로 써버리는 사고 차단. */
function looksEnglish(text: string): boolean {
  const ascii = (text.match(/[A-Za-z]/g) || []).length;
  const hangul = (text.match(/[가-힣]/g) || []).length;
  if (ascii < 40) return false;
  return ascii > hangul;
}

// ── 봉투(측정 가능한 난이도 범위) ───────────────────────────────────────────
// 프롬프트가 모델에게 말한 수치(applyOffset · targetWordRange)와 **같은 원본**을
// 쓴다. 위반은 차단하지 않는다 — 1회 수리 프롬프트의 재료이고, 수리 후에도 남으면
// 그대로 인도한다(결과 카드가 '기출 범위 밖'으로 표시한다).

export function authoringEnvelopeViolations(
  metrics: PassageMetrics,
  request: AuthoringRequest,
): string[] {
  const spec = request.spec;
  const params = applyOffset(spec.gradeBand, spec.lexical, spec.syntax);
  const { low, high } = targetWordRange(spec);
  const maxParagraphs =
    spec.genre === "PRACTICAL"
      ? 0
      : spec.genre === "NARRATIVE" && spec.targetWords >= 300
        ? 2
        : 1;

  const out: string[] = [];
  if (metrics.words < low) {
    out.push(`the passage is ${metrics.words} words, under the required ${low}-${high}`);
  } else if (metrics.words > high) {
    out.push(`the passage is ${metrics.words} words, over the required ${low}-${high}`);
  }
  if (metrics.avgSentenceWords > params.avgHi) {
    out.push(
      `mean sentence length ${metrics.avgSentenceWords} exceeds the allowed ${params.avgLo}-${params.avgHi}`,
    );
  } else if (metrics.sentences > 0 && metrics.avgSentenceWords < params.avgLo) {
    out.push(
      `mean sentence length ${metrics.avgSentenceWords} is below the allowed ${params.avgLo}-${params.avgHi}`,
    );
  }
  if (metrics.longestSentenceWords > params.longestHi) {
    out.push(
      `one sentence runs ${metrics.longestSentenceWords} words, over the ${params.longestHi}-word cap`,
    );
  }
  if (maxParagraphs > 0 && metrics.paragraphs > maxParagraphs) {
    out.push(
      `${metrics.paragraphs} paragraphs, but this passage must be ${
        maxParagraphs === 1 ? "ONE unbroken paragraph" : `at most ${maxParagraphs} blocks`
      }`,
    );
  }
  return out;
}

// ── 결정론 폴백(메타 전용) ──────────────────────────────────────────────────

function fallbackKoreanSummary(ctx: {
  topicLabel: string;
  title: string;
  request: AuthoringRequest;
  words: number;
}): string {
  const subject = ctx.topicLabel || ctx.title;
  const level = GRADE_BAND_LABELS[ctx.request.spec.gradeBand];
  return `${subject ? `'${subject}' 소재의 ` : ""}${level} 수준 영어 지문 (${ctx.words}단어)`;
}

function fallbackRationale(ctx: {
  request: AuthoringRequest;
  materials: AuthoringMaterial[];
}): string {
  const level = GRADE_BAND_LABELS[ctx.request.spec.gradeBand];
  const head = `${level} 수준, 목표 ${ctx.request.spec.targetWords}단어 설정으로 새로 작성한 지문입니다.`;
  const body = ctx.materials.length
    ? ` 첨부하신 자료 ${ctx.materials.length}건(${summarizeMaterials(ctx.materials)})을 반영했습니다.`
    : ` 첨부 자료 없이 요청 내용만으로 작성했습니다.`;
  return `${head}${body} (AI가 설명을 비워 자동으로 채운 문구입니다.)`;
}

/**
 * 설계 블록 검증. 골격 코드가 카탈로그 밖이면 **이 편에 배정된 골격**으로 되돌린다
 * (결과 카드의 골격 뱃지와 실제 배분이 어긋나면 안 된다). 전 칸이 비면 undefined 를
 * 돌려 카드가 빈 plan 블록을 그리지 않게 한다. 절대 throw 하지 않는다.
 */
function finalizePlan(
  raw: AuthoredMd["plan"],
  assignedSkeleton: Exclude<PassageSkeleton, "AUTO">,
): PassagePlan | undefined {
  // ⚠️ 배정된 골격이 이긴다 — generate.finalizePlan 과 같은 규칙이다(그쪽 주석 참조).
  //   모델의 자기 신고를 그대로 실으면 서버가 무엇을 지시했는지 화면으로 알 수 없다.
  const rawSkeleton = raw.skeleton.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const skeleton = assignedSkeleton;
  if (
    (PLAN_SKELETON_CODES as readonly string[]).includes(rawSkeleton) &&
    rawSkeleton !== assignedSkeleton
  ) {
    console.warn(
      `[PASSAGE-AUTHORING-MD] skeleton mismatch — assigned ${assignedSkeleton}, model reported ${rawSkeleton}`,
    );
  }

  const groundingRaw = raw.grounding.toLowerCase();
  const groundingMatch = groundingRaw.match(/\b([abc])\b/);
  const grounding = groundingMatch ? groundingMatch[1] : groundingRaw.slice(0, 40);

  const { thesis, warrantA, warrantB, turn, closingMove } = raw;
  if (!thesis && !warrantA && !warrantB && !turn && !closingMove) return undefined;
  return { skeleton, grounding, thesis, warrantA, warrantB, turn, closingMove };
}

// ── 본체 ────────────────────────────────────────────────────────────────────

/**
 * 파싱 결과 → 결과 아이템. 하드 게이트를 통과하지 못하면 `ok:false` 와 사유만
 * 돌려준다(throw 하지 않는다 — 호출부가 그 사유로 폴백을 결정한다).
 */
export function adaptAuthoredMdToItem(
  parsed: AuthoredMd,
  ctx: AdaptAuthoredMdContext,
): AdaptAuthoredMdResult {
  const passage = parsed.passage.trim();
  if (!passage) {
    return { ok: false, issues: ["생성된 지문이 비어 있습니다."] };
  }
  if (!looksEnglish(passage)) {
    return { ok: false, issues: ["생성된 지문이 영어가 아닙니다."] };
  }

  const target = ctx.request.spec.targetWords;
  const metrics = computePassageMetrics(passage, target);
  const low = Math.floor(target * MIN_WORD_RATIO);
  const high = Math.ceil(target * MAX_WORD_RATIO);
  if (metrics.words < low || metrics.words > high) {
    return {
      ok: false,
      issues: [
        `생성된 지문의 분량이 범위를 벗어났습니다 (${metrics.words}단어, 허용 ${low}~${high}).`,
      ],
    };
  }

  // 분모 정직성: 대조 대상은 모델이 실제로 본 클리핑 사본에서 뽑고, 분모 표시용
  // 총 개수는 클리핑 전 원본에서 잰다(generate.ts 와 같은 규칙).
  const originalTermStats = extractVocabTermStats(ctx.request.materials ?? []);
  const coverage = computeCoverage(passage, {
    vocabTerms: extractVocabTerms(ctx.materials),
    grammarPoints: parsed.usedGrammarPoints,
    termsTotalDetected: originalTermStats.totalDetected,
    termsTruncated: originalTermStats.truncated,
  });

  return {
    ok: true,
    issues: [],
    item: {
      title: parsed.title || "AI 생성 지문",
      passage,
      koreanSummary:
        parsed.koreanSummary ||
        fallbackKoreanSummary({
          topicLabel: parsed.topicLabel,
          title: parsed.title,
          request: ctx.request,
          words: metrics.words,
        }),
      rationale:
        parsed.rationale ||
        fallbackRationale({ request: ctx.request, materials: ctx.materials }),
      topicLabel: parsed.topicLabel,
      plan: finalizePlan(parsed.plan, ctx.skeleton),
      metrics,
      coverage,
      // 빈 다리 문장 통지 — 차단·재생성 없이 사실만 얹는다(metrics.ts §1-d).
      warnings: bridgeStubWarnings(passage),
      usedMaterialIds: ctx.materials.map((material) => material.id),
      perMaterialCharsSent: ctx.perMaterialCharsSent,
    },
  };
}

/**
 * 봉투 수리 프롬프트. **같은 지문을 다시 쓰게 하는 것**이지 새 지문을 시키는 게
 * 아니다 — 논지·전환·예시가 바뀌면 그건 수리가 아니라 두 번째 생성이고, 편당
 * 과금이 두 배가 되는 대신 얻는 게 없다(generate.ts buildRevisionPrompt 와 같은 취지,
 * 출력 형식만 마크다운으로 바뀐다).
 */
export function buildAuthoringMdRevisionPrompt(violations: string[]): string {
  return [
    "# REVISION PASS — your draft failed the measured envelope",
    "The server measured your passage and found:",
    ...violations.map((line) => `- ${line}`),
    "Rewrite the SAME passage — same thesis, same pivot, same example, same argument. Change only sentence boundaries, clause packing, and wording density until every measurement is inside the envelope. Do not shorten by deleting the concrete instantiation; split or merge sentences instead. Do not introduce a new topic, a new example, or a summary sentence.",
    "Output the FULL corrected answer again in the same markdown sections and labels (설계 / 지문 / 메타). Do not output a diff, a note, or JSON.",
  ].join("\n");
}
