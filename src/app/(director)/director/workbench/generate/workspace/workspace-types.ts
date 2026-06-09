import type { PassageItem } from "../generate-page-types";

// ============================================================================
// 지문 워크스페이스 — 문제 생성 전에 지문을 불러와 편집·AI 변형·범위 지정·
// 지문별 유형 지정을 하는 작업 공간의 상태 모델.
// ============================================================================

/** 지문별 유형/난이도 오버라이드. null 이면 우측 "유형 설정" 전체 설정을 따른다. */
export interface RowOverride {
  typeCounts: Record<string, number>;
  /** null → 전체 설정의 난이도 사용. */
  difficulty: "BASIC" | "INTERMEDIATE" | "KILLER" | null;
}

/** 출제 범위 — content 기준 문자 오프셋 (start < end). */
export interface RowRange {
  start: number;
  end: number;
}

export interface WorkspaceRow {
  /** 행 식별자 (클라이언트 전용). */
  localId: string;
  /** 현재 이 행이 가리키는 Passage id (변형본 저장 후엔 변형본 id). */
  passageId: string;
  /** 변형본으로 저장된 경우 원본 Passage id. */
  variantOfId?: string;
  title: string;
  /** 에디터의 현재 본문 (수정 가능). */
  content: string;
  /** passageId 가 DB에 갖고 있는 본문 — dirty 판정 기준. */
  savedContent: string;
  /** 출제 범위 (지정 시 해당 구간만으로 문제 생성). */
  range: RowRange | null;
  /** 지문별 유형/난이도 오버라이드. */
  override: RowOverride | null;
  collapsed: boolean;
}

export function makeWorkspaceRow(passage: PassageItem): WorkspaceRow {
  return {
    localId:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `ws-${Math.random().toString(36).slice(2)}`,
    passageId: passage.id,
    title: passage.title,
    content: passage.content,
    savedContent: passage.content,
    range: null,
    override: null,
    collapsed: false,
  };
}

const normalizeText = (s: string) => s.replace(/\s+/g, " ").trim();

/** 본문이 DB 저장본과 달라졌는지 (변형본 저장이 필요한지). */
export function isRowDirty(row: WorkspaceRow): boolean {
  return normalizeText(row.content) !== normalizeText(row.savedContent);
}

/** 생성에 실제로 쓰일 본문 — 범위 지정 시 해당 구간만. */
export function effectiveRowContent(row: WorkspaceRow): string {
  if (row.range) {
    const sliced = row.content.slice(row.range.start, row.range.end).trim();
    if (sliced.length >= 20) return sliced;
  }
  return row.content.trim();
}

/** 범위까지 반영했을 때 변형본 저장이 필요한지. */
export function rowNeedsVariant(row: WorkspaceRow): boolean {
  return (
    normalizeText(effectiveRowContent(row)) !== normalizeText(row.savedContent)
  );
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** 오버라이드에 실제 유형 개수가 들어있는지 (난이도만 지정한 경우 false). */
export function overrideHasTypeCounts(override: RowOverride | null): boolean {
  return (
    !!override &&
    Object.values(override.typeCounts).some((n) => Number(n) > 0)
  );
}

/**
 * 행 하나가 생성할 문제 수.
 * 오버라이드에 유형이 있으면 그 합 — 난이도만 지정한 오버라이드는 "전체 설정의
 * 유형 + 이 난이도"를 의미하므로 전체 설정 개수로 폴백한다 (조용한 0개 제외 방지).
 */
export function rowQuestionCount(
  row: WorkspaceRow,
  global: { genMode: "auto" | "manual" | "set"; autoCount: number; totalQuestions: number },
): number {
  if (overrideHasTypeCounts(row.override)) {
    return Object.values(row.override!.typeCounts).reduce((a, b) => a + b, 0);
  }
  if (global.genMode === "auto") return Math.max(0, global.autoCount);
  if (global.genMode === "manual") return global.totalQuestions;
  return 0;
}
