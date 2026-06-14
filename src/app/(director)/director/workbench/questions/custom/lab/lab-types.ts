import {
  type AnnotationCategory,
  type FormatAnnotation,
  type FormatSpec,
} from "@/lib/custom-question-types/format-spec";
import { describeFormatDelta } from "@/lib/custom-question-types/format-intent";
import type { CompiledCustomType } from "@/lib/custom-question-types/types";

// 유형 실험실(랩) 공유 타입·헬퍼 — 컨테이너/해부 뷰/스튜디오가 함께 쓴다.

export type LabTab = "anatomy" | "studio";

export interface LabTypeInfo {
  id: string;
  name: string;
  status: string;
  nearestBuiltin: string | null;
  matchConfidence: string | null;
}

export interface LabVersionRow {
  id: string;
  version: number;
  note: string | null;
  createdAt: string;
  isActive: boolean;
}

// ── 해부 뷰: 어노테이션 카테고리 순서/라벨 + 카드↔영역 공통 번호 부여 ──

export const ANNOTATION_CATEGORY_ORDER: AnnotationCategory[] = [
  "LAYOUT",
  "STEM",
  "STIMULUS",
  "CHOICE",
  "MARKER",
  "BOX",
  "BLANK",
  "ANSWER",
  "SCORING",
  "TRAP",
];

export const ANNOTATION_CATEGORY_LABELS: Record<AnnotationCategory, string> = {
  LAYOUT: "레이아웃",
  STEM: "발문",
  STIMULUS: "자료",
  CHOICE: "선지",
  MARKER: "마커",
  BOX: "박스",
  BLANK: "빈칸",
  ANSWER: "정답",
  SCORING: "배점",
  TRAP: "함정",
};

export interface NumberedAnnotation {
  /** 카드·핀 공통 번호(1-base, 카테고리 그룹 순). */
  index: number;
  annotation: FormatAnnotation;
}

/** 어노테이션을 카테고리 그룹 순서로 정렬하고 번호를 부여한다(카드 번호 = 이미지 핀 번호). */
export function orderAnnotations(annotations: FormatAnnotation[]): NumberedAnnotation[] {
  const rank = new Map(ANNOTATION_CATEGORY_ORDER.map((c, i) => [c, i] as const));
  return annotations
    .map((annotation, orig) => ({ annotation, orig }))
    .sort(
      (a, b) =>
        (rank.get(a.annotation.category) ?? 99) - (rank.get(b.annotation.category) ?? 99) ||
        a.orig - b.orig,
    )
    .map((entry, i) => ({ index: i + 1, annotation: entry.annotation }));
}

// ── 해부 뷰: 원본 분석(QuestionAnalysis)에서 선지 해부 카드 데이터 추출 ──

export interface SourceOptionRow {
  label: string;
  text: string;
  isCorrect: boolean;
  rationale: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function readSourceOptions(analysis: Record<string, unknown> | null): SourceOptionRow[] {
  if (!analysis || !isRecord(analysis.source)) return [];
  const src = analysis.source;
  const correct = new Set(
    Array.isArray(src.correctAnswerLabels)
      ? src.correctAnswerLabels
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
      : [],
  );
  if (!Array.isArray(src.options)) return [];
  return src.options.flatMap((raw): SourceOptionRow[] => {
    if (!isRecord(raw)) return [];
    const label = typeof raw.label === "string" ? raw.label : "";
    const text = typeof raw.text === "string" ? raw.text : "";
    if (!label && !text) return [];
    return [
      {
        label,
        text,
        isCorrect: raw.isCorrect === true || (!!label.trim() && correct.has(label.trim())),
        rationale: typeof raw.rationale === "string" ? raw.rationale : "",
      },
    ];
  });
}

// ── 스튜디오: FormatSpec 편집 → CompiledCustomType 1급 필드 동기화 ──

export const ANSWER_SHAPE_KO: Record<string, string> = {
  MULTIPLE_CHOICE: "객관식",
  SHORT_ANSWER: "서술형/단답",
  MIXED: "혼합",
};

/** format 변경을 spec 에 반영하면서 검증 게이트가 보는 1급 구조 필드도 함께 동기화한다. */
export function applyFormatToSpec(spec: CompiledCustomType, format: FormatSpec): CompiledCustomType {
  const shape = format.answer.shape;
  const objective = shape !== "SHORT_ANSWER" && format.choices.present;
  return {
    ...spec,
    format,
    answerShape: shape === "MIXED" ? "OTHER" : shape,
    optionCount: objective ? format.choices.count : 0,
    correctAnswerCount: format.answer.correctCount,
    multipleAnswers: format.answer.multipleAnswers,
  };
}

// ── AI 어시스턴트: 이전/이후 format 의 모든 시각 필드 비교(한국어 변경 요약) ──
// 단일 출처(describeFormatDelta)에 위임 — 밑줄/박스테두리/번호/배점 등 전 필드를 빠짐없이 포착.

export function summarizeFormatChanges(
  prev: FormatSpec | null,
  next: FormatSpec | null,
): string[] {
  if (!prev || !next) return [];
  return describeFormatDelta(prev, next);
}
