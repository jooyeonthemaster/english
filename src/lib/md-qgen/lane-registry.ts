// ============================================================================
// md 레인 디스크립터 레지스트리 — typeId → lane. 라우트의 유일한 신형 진입점.
// 신규 유형 승차는 여기에 한 줄 추가하는 것이 전부다(라우트 무편집).
// 계약: ./lane-types.ts · 문서: docs/md-qgen-type-expansion-spec.md
//
// 정본(빈칸·어법)은 여기 등록되지 않는다 — getMdLane 이 null 을 반환해
// 라우트의 기존 분기가 그대로 실행된다(바이트 무회귀).
// ============================================================================

import type { MdLane } from "./lane-types";

// ── 1차 승차 (26-07-26) ─────────────────────────────────────────────────────
import { ANTONYM_MD_LANE } from "./lane-antonym";
import { VOCAB_CHOICE_MD_LANE } from "./lane-vocab";
import { GRAMMAR_CHOICE_COMBO_MD_LANE } from "./lane-combo";
import { SENTENCE_ORDER_MD_LANE } from "./lane-order";

// ── 2차 승차 · 선택형 (지문 무변형) ─────────────────────────────────────────
import { TITLE_MD_LANE } from "./lane-title";
import { TOPIC_MD_LANE } from "./lane-topic";
import { MAIN_IDEA_MD_LANE } from "./lane-main-idea";
import { TOPIC_MAIN_IDEA_MD_LANE } from "./lane-topic-main-idea";
import { IMPLIED_MEANING_MD_LANE } from "./lane-implied";
import { REFERENCE_MD_LANE } from "./lane-reference";
import { CONTENT_MATCH_MD_LANE } from "./lane-content-match";

// ── 2차 승차 · 구조형 (지문 변형 — 재구성 대조 게이트) ──────────────────────
import { SENTENCE_INSERT_MD_LANE } from "./lane-sentence-insert";
import { IRRELEVANT_MD_LANE } from "./lane-irrelevant";
import { SUMMARY_COMPLETE_MC_MD_LANE } from "./lane-summary-mc";

// ── 2차 승차 · 어휘 ─────────────────────────────────────────────────────────
import { SYNONYM_MD_LANE } from "./lane-synonym";
import { CONTEXT_MEANING_MD_LANE } from "./lane-context-meaning";
import { GRAMMAR_CORRECTION_MD_LANE } from "./lane-grammar-correction";

// ── 2차 승차 · 서술형 (채점 계약이 객관식과 다름) ───────────────────────────
import { CONDITIONAL_WRITING_MD_LANE } from "./lane-conditional-writing";
import { SENTENCE_TRANSFORM_MD_LANE } from "./lane-sentence-transform";
import { FILL_BLANK_KEY_MD_LANE } from "./lane-fill-blank-key";
import { SUMMARY_COMPLETE_MD_LANE } from "./lane-summary-complete";
import { SUMMARY_WRITING_MD_LANE } from "./lane-summary-writing";
import { WORD_ORDER_MD_LANE } from "./lane-word-order";
import { TOPIC_SENTENCE_WRITING_MD_LANE } from "./lane-topic-sentence-writing";

const LANES: MdLane[] = [
  // 1차
  ANTONYM_MD_LANE,
  VOCAB_CHOICE_MD_LANE,
  GRAMMAR_CHOICE_COMBO_MD_LANE,
  SENTENCE_ORDER_MD_LANE,
  // 선택형
  TITLE_MD_LANE,
  TOPIC_MD_LANE,
  MAIN_IDEA_MD_LANE,
  TOPIC_MAIN_IDEA_MD_LANE,
  IMPLIED_MEANING_MD_LANE,
  REFERENCE_MD_LANE,
  CONTENT_MATCH_MD_LANE,
  // 구조형
  SENTENCE_INSERT_MD_LANE,
  IRRELEVANT_MD_LANE,
  SUMMARY_COMPLETE_MC_MD_LANE,
  // 어휘
  SYNONYM_MD_LANE,
  CONTEXT_MEANING_MD_LANE,
  GRAMMAR_CORRECTION_MD_LANE,
  // 서술형
  CONDITIONAL_WRITING_MD_LANE,
  SENTENCE_TRANSFORM_MD_LANE,
  FILL_BLANK_KEY_MD_LANE,
  SUMMARY_COMPLETE_MD_LANE,
  SUMMARY_WRITING_MD_LANE,
  WORD_ORDER_MD_LANE,
  TOPIC_SENTENCE_WRITING_MD_LANE,
];

const BY_TYPE = new Map<string, MdLane>(LANES.map((lane) => [lane.subType, lane]));

// 등록 무결성 — subType 중복은 뒤 항목이 앞을 조용히 덮어써 한 유형이 통째로
// 사라지는 사고가 되므로, 모듈 로드 시점에 즉시 드러나게 한다.
if (BY_TYPE.size !== LANES.length) {
  const seen = new Set<string>();
  const dup = LANES.map((l) => l.subType).filter((t) => (seen.has(t) ? true : (seen.add(t), false)));
  throw new Error(`md lane subType 중복 등록: ${[...new Set(dup)].join(", ")}`);
}

/** 신형 레인 유형이면 디스크립터, 정본(빈칸·어법)이면 null(라우트 기존 분기로). */
export function getMdLane(subType: string): MdLane | null {
  return BY_TYPE.get(subType) ?? null;
}

/** 라우트 MD_STREAM_SUBTYPES 조립용. */
export const MD_LANE_SUBTYPES: readonly string[] = LANES.map((l) => l.subType);
