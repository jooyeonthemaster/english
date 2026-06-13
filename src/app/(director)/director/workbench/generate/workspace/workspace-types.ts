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

/** AI가 만든/바꾼 구간 표시 — content 기준 문자 오프셋. */
export interface RowHighlight {
  start: number;
  end: number;
  kind: "prepend" | "paraphrase";
}

/** undo/redo 스냅샷 — 본문과 하이라이트를 함께 복원한다. */
export interface RowSnapshot {
  content: string;
  highlights: RowHighlight[];
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
  /** AI가 추가/변형한 구간 (본문 하이라이트 표시용). */
  highlights: RowHighlight[];
  /** 되돌리기 스택 (오래된 것 → 최신). */
  past: RowSnapshot[];
  /** 다시 실행 스택 (최신 → 오래된 것). */
  future: RowSnapshot[];
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
    highlights: [],
    past: [],
    future: [],
  };
}

/**
 * 본문이 oldStr → newStr 로 바뀌었을 때 하이라이트 오프셋을 보정한다.
 * 공통 접두/접미를 제외한 단일 변경 구간을 찾아(타이핑·붙여넣기·splice 모두
 * 이 형태) 구간 앞은 유지, 뒤는 평행이동, 겹치면 살아남은 부분만 남긴다.
 */
export function adjustHighlights(
  oldStr: string,
  newStr: string,
  highlights: RowHighlight[],
): RowHighlight[] {
  if (highlights.length === 0 || oldStr === newStr) return highlights;
  let p = 0;
  const maxP = Math.min(oldStr.length, newStr.length);
  while (p < maxP && oldStr[p] === newStr[p]) p += 1;
  let s = 0;
  while (
    s < oldStr.length - p &&
    s < newStr.length - p &&
    oldStr[oldStr.length - 1 - s] === newStr[newStr.length - 1 - s]
  )
    s += 1;
  const oldEnd = oldStr.length - s;
  const delta = newStr.length - oldStr.length;
  const out: RowHighlight[] = [];
  for (const h of highlights) {
    if (h.end <= p) {
      out.push(h);
    } else if (h.start >= oldEnd) {
      out.push({ ...h, start: h.start + delta, end: h.end + delta });
    } else {
      // 변경 구간과 겹침 — 하이라이트가 변경 구간을 포함하면 늘어난 채 유지
      // (하이라이트 안에서 타이핑), 일부만 겹치면 살아남은 앞부분만.
      const start = Math.min(h.start, p);
      const end = h.end >= oldEnd ? h.end + delta : Math.min(h.end, p);
      if (end - start >= 4) {
        out.push({ ...h, start: Math.max(0, start), end });
      }
    }
  }
  return out;
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
