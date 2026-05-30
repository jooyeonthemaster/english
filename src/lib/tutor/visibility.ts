// ============================================================================
// Tutor Passage Visibility & Hint Policy (SSOT)
// ----------------------------------------------------------------------------
// 근본원인 3 해결: showPassage가 mode 하나로 결정되던 것을 type×policy 정책 + 서버 측
// 원문 가공 + 단계적 힌트 감점으로 대체. (스펙 §5)
// ============================================================================

import type { TutorActivityType } from "@/lib/tutor/activity-types";
import type { HintStage, PassagePolicy } from "@/lib/tutor/activity-payload-schema";

// ── type별 기본 원문 정책 ────────────────────────────────────────────────────
// visible: 원문 펼쳐 노출 / assist: 원문 접힘(무료 펼침) /
// hidden_hintable: 기본 숨김, '힌트 보기' 열람 시 감점 / hidden_memorize: 암기용 숨김
export const PASSAGE_POLICY_BY_TYPE: Record<TutorActivityType, PassagePolicy> = {
  // vocab — 단어 단위라 누출 위험 낮음, 문맥 보조
  vocab_choice: "assist",
  contextual_meaning: "assist",
  vocab_collocation: "assist",
  vocab_confusable: "assist",
  vocab_synonym: "assist",
  vocab_form: "assist",
  vocab_match: "visible",
  vocab_spell: "hidden_memorize",
  // interpret
  chunk_reading: "assist",
  sentence_translate: "assist",
  structure_role: "assist",
  gist_select: "assist",
  title_select: "assist",
  paraphrase_mc: "assist",
  blank_infer: "hidden_hintable",
  // order — 정답 단서가 원문에 그대로 노출 → 기본 숨김
  sentence_order: "hidden_hintable",
  insertion_point: "hidden_hintable",
  irrelevant_sentence: "hidden_hintable",
  connector_select: "hidden_hintable",
  // memorize
  sentence_rebuild: "hidden_memorize",
  chunk_rebuild: "hidden_memorize",
  progressive_cloze: "hidden_memorize",
  first_letter_recall: "hidden_memorize",
  // transfer
  structure_transform: "assist",
  conditional_writing: "assist",
  // grammar — 어법 판단 단서가 원문에 노출 → 기본 숨김
  grammar_judge: "hidden_hintable",
  grammar_error_span: "hidden_hintable",
  grammar_correct: "assist",
  // mastery — prompt 안에 자체 지문/마커를 포함
  mastery_test: "hidden_hintable",
};

export function resolvePassagePolicy(
  type: string,
  payloadPolicy: PassagePolicy | undefined,
  hintsAllowed: boolean,
): PassagePolicy {
  const base = payloadPolicy ?? PASSAGE_POLICY_BY_TYPE[type as TutorActivityType] ?? "visible";
  // R10: 과제 설정상 힌트 금지인데 hidden_hintable이면 "풀 수 없는 카드"가 되므로 assist로 완화.
  // 단 암기(hidden_memorize)는 노출이 목적과 모순이므로 완화하지 않는다.
  if (!hintsAllowed && base === "hidden_hintable") return "assist";
  return base;
}

// ── 단계적 힌트 감점표 (SSOT, 누적 상한 0.5) ──────────────────────────────────
export const HINT_COST: Record<HintStage["kind"], number> = {
  length: 0.15,
  structure: 0.2,
  korean_gloss: 0.2,
  context_window: 0.25,
  narrow_options: 0.3,
  first_letter: 0.4,
};

export const HINT_PENALTY_CAP = 0.5;

export function hintCost(kind: HintStage["kind"]): number {
  return HINT_COST[kind] ?? 0.2;
}

// 사용한 힌트 stage들의 cost 합을 상한 0.5로 클램프.
export function computeHintPenalty(hints: HintStage[] | undefined, usedStages: number[]): number {
  if (!hints?.length || !usedStages.length) return 0;
  const used = new Set(usedStages);
  const sum = hints
    .filter((stage) => used.has(stage.stage))
    .reduce((acc, stage) => acc + (Number.isFinite(stage.cost) ? stage.cost : hintCost(stage.kind)), 0);
  return Math.min(HINT_PENALTY_CAP, sum);
}

export function applyHintPenalty(baseScore: number, penalty: number): number {
  return Math.round(baseScore * (1 - Math.min(HINT_PENALTY_CAP, Math.max(0, penalty))));
}

// ── 서버 측 원문 가공: 정책에 맞는 열람 가능 원문만 클라이언트로 전달 ──────────
export interface ViewablePassage {
  content: string | null; // null = 클라이언트에 원문 미전달(누출 차단)
  collapsed: boolean; // true = 기본 접힘(assist), 펼침 무료
  hintable: boolean; // true = 힌트로 단계적 열람(감점)
}

export function buildViewablePassage(
  policy: PassagePolicy,
  passageContent: string,
  options?: { passageWithoutTarget?: string | null },
): ViewablePassage {
  const safeContent = options?.passageWithoutTarget ?? passageContent;
  switch (policy) {
    case "visible":
      return { content: safeContent, collapsed: false, hintable: false };
    case "assist":
      return { content: safeContent, collapsed: true, hintable: false };
    case "hidden_hintable":
      return { content: null, collapsed: true, hintable: true };
    case "hidden_memorize":
    default:
      return { content: null, collapsed: true, hintable: false };
  }
}
