// ============================================================================
// 지문 세트 — preset registry (single source of truth)
// ============================================================================
// 한 지문에 여러 문항을 묶는 "세트"를 강사가 임의 조합하는 대신, 코드에 등록된
// PRESET 중에서 고르게 한다. 각 프리셋은 (1) 멤버 유형 + 출제 순서,
// (2) 구조 모드, (3) 멤버별 기본 난이도/상세설정, (4) 적용 가능한 최소 지문
// 분량을 담는다. read-core-2는 검증 완료 프리셋이고, 나머지는 생성 테스트와
// 세트 검수 장치를 정교화하기 위한 출시 후보 프리셋이다.
//
// ⚠️ 이름은 '장문'이지만 길이 전용이 아니다 — minSentences/minWords 는 그 프리셋이
// 동작하는 "최소 구조"일 뿐 장문 강제가 아니며, 일반/짧은 지문도 충족하면 노출된다.
// 긴 지문일수록 더 무거운(구조변형·3문항) 프리셋까지 메뉴에 열린다.
//
// 설계 근거: docs/long-passage-set-architecture.md + 2026-06-23 프리셋 검증 워크플로.
// ============================================================================

import { splitIntoSentences } from "@/lib/question-postprocess/sentence-splitter";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";

import { validateSetComposition } from "./leakage-gate";
import type { StructuralMode } from "./types";

export type SetDifficulty = "BASIC" | "INTERMEDIATE" | "KILLER";

/**
 * 세트 안전 장치 1차 정책: 기본 생성 후 결정론적 검수에서 DEGRADED가 나오면
 * 세트 전용 지시문을 추가해 한 번 더 생성한다. 라우트/프론트 비용 산정도 이 값을
 * 공유한다(예약 차감 후 미사용분 환불).
 */
export const QUESTION_SET_SAFETY_MAX_ATTEMPTS = 2;

/** 프리셋 멤버 한 개 — 유형 + (선택) 멤버별 난이도/상세설정. 배열 순서 = 출제 순서. */
export interface PresetMember {
  typeId: string;
  /** 멤버별 기본 난이도. 미지정 시 세트 호출자의 기본 난이도를 따른다. */
  difficulty?: SetDifficulty;
  /** 멤버별 기본 생성 플랜. 미지정 시 세트 전체 생성 플랜을 따른다. */
  generationPlan?: QuestionGenerationPlan;
  /**
   * 유형별 상세설정(어법 네모/정답 개수, 빈칸 부정-부정, 어휘 보기 수 등).
   * 이미 라우트→오케스트레이터→generateOne→엔진까지 흐르는 배관이 깔려 있어,
   * 여기 정의해 두면 UI가 멤버별로 받지 않아도 생성에 반영된다.
   */
  typeSettings?: Record<string, unknown>;
}

/** 한 프리셋의 완전한 정의. PRESET_REGISTRY 의 값 타입. */
export interface SetPreset {
  id: string;
  /** 강사에게 보이는 한글 라벨. */
  label: string;
  description: string;
  /** 표시 베이스 지문을 정의하는 구조 멤버가 있으면 그 모드, 없으면 NONE. */
  structuralMode: StructuralMode;
  /** 멤버 목록(배열 순서 = orderInSet). */
  members: PresetMember[];
  /** 적용 가능성 — 이 분량 미만 지문에는 메뉴에서 숨긴다(장문 강제 아님). */
  minSentences: number;
  minWords: number;
  /** 1 = UI 노출 대상, 2 = 숨김 후보. */
  tier: 1 | 2;
}

// ── 레지스트리 (1티어 10개) ──────────────────────────────────────────────────
// 최소 분량은 생성 테스트 하네스로 계속 보정한다. 변형형(빈칸/어법/삽입/순서)은
// 이후 세트 검수 장치의 핵심 검증 대상이므로 현재는 프리셋 후보로 먼저 노출한다.
export const SET_PRESETS: readonly SetPreset[] = [
  {
    id: "read-core-2",
    label: "독해 핵심 2문항",
    // 요지/주장(MAIN_IDEA)은 단독 18런 영어보기 0/18로 깨끗. (주제/요지=TOPIC_MAIN_IDEA는
    // 기본엔진 한정 약점으로 영어보기 ~28% 튐 — 2026-06-23 귀속테스트로 확인, 그래서 회피.)
    description:
      "요지/주장 + 내용 일치 — 지문을 변형하지 않는 가장 기본 세트. 일반·짧은 지문에 적합.",
    structuralMode: "NONE",
    members: [
      { typeId: "MAIN_IDEA" },
      { typeId: "CONTENT_MATCH" },
    ],
    // 무표시 독해형(지문 분할 없음) — 단어 수가 실질 기준. 문장 수는 느슨하게.
    minSentences: 4,
    minWords: 90,
    tier: 1,
  },
  {
    id: "read-comprehensive-3",
    label: "독해 종합 3문항",
    description: "제목 + 지칭 + 내용 일치 — 구조 변형 없는 종합 독해 세트.",
    structuralMode: "NONE",
    members: [
      { typeId: "TITLE" },
      { typeId: "REFERENCE" },
      { typeId: "CONTENT_MATCH" },
    ],
    minSentences: 5,
    minWords: 110,
    tier: 1,
  },
  {
    id: "vocab-meaning",
    label: "어휘·의미 세트",
    description: "동의어 + 문맥 속 의미 — 밑줄 어휘 집중 세트(서로 다른 단어).",
    structuralMode: "NONE",
    members: [
      { typeId: "SYNONYM" },
      { typeId: "CONTEXT_MEANING" },
    ],
    minSentences: 4,
    minWords: 90,
    tier: 1,
  },
  {
    id: "summary-set",
    label: "요약 독해 3문항",
    description:
      "요약문 완성 + 제목 + 내용 일치 — 중심 내용 압축과 세부 확인을 함께 묻는 세트.",
    structuralMode: "NONE",
    members: [
      { typeId: "SUMMARY_COMPLETE_MC" },
      { typeId: "TITLE" },
      { typeId: "CONTENT_MATCH" },
    ],
    minSentences: 5,
    minWords: 120,
    tier: 1,
  },
  {
    id: "csat-43-45",
    label: "수능 43~45형",
    description: "글의 순서 + 지칭 + 내용 일치 — 정통 장문 세트(긴 지문 전용).",
    structuralMode: "SENTENCE_ORDER",
    members: [
      { typeId: "SENTENCE_ORDER", typeSettings: { pointFocus: true } },
      { typeId: "REFERENCE" },
      { typeId: "CONTENT_MATCH" },
    ],
    // 글의 순서는 지문을 블록으로 쪼개야 해 문장 수가 실제로 필요(구조형).
    minSentences: 7,
    minWords: 150,
    tier: 1,
  },
  {
    id: "sentence-insert-3",
    label: "문장 삽입 3문항",
    description:
      "문장 삽입 + 지칭 + 내용 일치 — 연결 단서와 세부 독해를 함께 확인하는 구조 세트.",
    structuralMode: "SENTENCE_INSERT",
    members: [
      { typeId: "SENTENCE_INSERT", typeSettings: { pointFocus: true } },
      { typeId: "REFERENCE" },
      { typeId: "CONTENT_MATCH" },
    ],
    minSentences: 7,
    minWords: 150,
    tier: 1,
  },
  {
    id: "structure-killer-3",
    label: "구조 독해 고난도",
    description:
      "문장 삽입 + 제목 + 요지/주장 — 글의 전개와 중심 내용을 동시에 묻는 고난도 세트.",
    structuralMode: "SENTENCE_INSERT",
    members: [
      {
        typeId: "SENTENCE_INSERT",
        difficulty: "KILLER",
        typeSettings: { pointFocus: true },
      },
      { typeId: "TITLE" },
      { typeId: "MAIN_IDEA" },
    ],
    minSentences: 7,
    minWords: 150,
    tier: 1,
  },
  {
    id: "blank-reading-3",
    label: "빈칸 추론 3문항",
    description:
      "빈칸 추론 + 요지/주장 + 내용 일치 — 핵심 논리와 세부 근거를 함께 묻는 킬러형 세트.",
    structuralMode: "NONE",
    members: [
      {
        typeId: "BLANK_INFERENCE",
        difficulty: "KILLER",
        typeSettings: { pointFocus: true, paraphraseAnswer: true },
      },
      { typeId: "MAIN_IDEA" },
      { typeId: "CONTENT_MATCH" },
    ],
    minSentences: 5,
    minWords: 120,
    tier: 1,
  },
  {
    id: "grammar-judgment-3",
    label: "어법 판단 3문항",
    description:
      "어법 판단 + 지칭 + 내용 일치 — 문장 단위 어법과 지문 이해를 함께 점검하는 내신형 세트.",
    structuralMode: "NONE",
    members: [
      { typeId: "GRAMMAR_ERROR", typeSettings: { pointFocus: true } },
      { typeId: "REFERENCE" },
      { typeId: "CONTENT_MATCH" },
    ],
    minSentences: 5,
    minWords: 120,
    tier: 1,
  },
  {
    id: "grammar-correction-3",
    label: "어법 수정 3문항",
    description:
      "어법 수정 + 요지/주장 + 내용 일치 — 서술형 어법 수정과 독해 확인을 묶은 내신 고난도 세트.",
    structuralMode: "NONE",
    members: [
      { typeId: "GRAMMAR_CORRECTION", typeSettings: { pointFocus: true } },
      { typeId: "MAIN_IDEA" },
      { typeId: "CONTENT_MATCH" },
    ],
    minSentences: 5,
    minWords: 120,
    tier: 1,
  },
] as const;

const PRESET_BY_ID: Map<string, SetPreset> = new Map(
  SET_PRESETS.map((p) => [p.id, p]),
);

/** 프리셋 id → 정의. 없으면 null. */
export function resolvePreset(id: string | null | undefined): SetPreset | null {
  if (!id) return null;
  return PRESET_BY_ID.get(id) ?? null;
}

// ── 지문 분량 측정 (적용 가능성 판정용) ──────────────────────────────────────
export function countPassageSentences(passage: string): number {
  return splitIntoSentences(passage).length;
}

export function countPassageWords(passage: string): number {
  const trimmed = passage.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export interface PresetFeasibility {
  ok: boolean;
  /** 부족 시 한국어 사유(UI/에러에 그대로 노출 가능). */
  reason?: string;
  sentences: number;
  words: number;
}

/** 이 지문이 프리셋의 최소 분량을 충족하는가(장문 강제 아님, 동작 최소 구조). */
export function passageMeetsPreset(
  passage: string,
  preset: SetPreset,
): PresetFeasibility {
  const sentences = countPassageSentences(passage);
  const words = countPassageWords(passage);
  if (sentences < preset.minSentences || words < preset.minWords) {
    return {
      ok: false,
      reason: `'${preset.label}'은(는) 최소 ${preset.minSentences}문장·${preset.minWords}단어 지문이 필요합니다(현재 ${sentences}문장·${words}단어).`,
      sentences,
      words,
    };
  }
  return { ok: true, sentences, words };
}

/** 이 지문에 적용 가능한 프리셋만(분량 충족) 반환 — UI 메뉴 필터. */
export function availablePresetsForPassage(
  passage: string,
  opts?: { tier?: 1 | 2 },
): SetPreset[] {
  return SET_PRESETS.filter((p) => {
    if (opts?.tier && p.tier !== opts.tier) return false;
    return passageMeetsPreset(passage, p).ok;
  });
}

/**
 * 프리셋 정의 자체가 valid한가(빌드/계약테스트용). 기존 자유조합 게이트
 * (validateSetComposition)를 등록 시점 1회 검증으로 재사용 — "레지스트리에 든
 * 프리셋은 항상 valid" 불변식을 고정한다.
 */
export function validatePresetDefinition(preset: SetPreset): {
  ok: boolean;
  errors: string[];
} {
  return validateSetComposition(
    preset.members.map((m) => ({ typeId: m.typeId })),
    preset.structuralMode,
  );
}
