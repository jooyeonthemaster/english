import type { PassageItem } from "../generate-page-types";
import type { QuestionTypeGenerationSettings } from "@/lib/question-type-generation-settings";
import { formatExtractedTextForDisplay } from "../../passages/import/_components/extraction-manage-client/utils/display-text";

// ============================================================================
// 지문 워크스페이스 — 문제 생성 전에 지문을 불러와 편집·AI 변형·범위 지정·
// 지문별 유형 지정을 하는 작업 공간의 상태 모델.
// ============================================================================

/** 지문별 유형/난이도 오버라이드. null 이면 우측 "유형 설정" 전체 설정을 따른다. */
export interface RowOverride {
  /**
   * 이 지문에 개별 지정된 생성 모드. null/undefined → '미설정'(전체 공통 설정을
   * 따름). 지문을 선택해 우측 패널에서 모드를 고르면 그 지문에만 저장된다.
   * - auto: 자동 생성(autoCount 만큼)
   * - manual: 지정된 유형(typeCounts)
   * - set: 장문 세트(우측 세트 빌더에서 단독 생성)
   */
  mode?: "auto" | "manual" | "set" | null;
  /** null/undefined → 전체 설정의 생성 플랜(일반/프리미엄) 사용. */
  generationPlan?: "STANDARD" | "PREMIUM" | null;
  typeCounts: Record<string, number>;
  /** null → 전체 설정의 난이도 사용. */
  difficulty: "BASIC" | "INTERMEDIATE" | "KILLER" | null;
  /**
   * 유형별 세부옵션(빈칸 수·선택지 수 등) 오버라이드. typeId → 설정.
   * 전체 설정과 다른 유형만 담는다 (없는 유형은 전체 설정을 따른다).
   */
  questionTypeSettings?: QuestionTypeGenerationSettings;
  /**
   * 장문 세트(mode === "set") 구성 — 이 지문에 묶을 문항들(순서 있음).
   * 자동/유형지정의 typeCounts 처럼 세트 구성도 지문별로 저장한다.
   */
  setMembers?: {
    typeId: string;
    difficulty: "BASIC" | "INTERMEDIATE" | "KILLER";
  }[];
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
  /** 변형(paraphrase) 전의 원문 — 하이라이트 호버 시 툴팁으로 보여준다. */
  original?: string;
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
  // 추출 지문은 OCR이 원본 이미지의 물리적 줄바꿈을 그대로 담고 있어 에디터
  // 폭과 무관하게 중간에서 꺾인다 — 소프트 줄바꿈만 공백으로 접는다(문단
  // 구분·보기 행은 보존). isRowDirty 는 공백 무시 비교라 수정 오탐 없음.
  const content = formatExtractedTextForDisplay(passage.content);
  return {
    localId:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `ws-${Math.random().toString(36).slice(2)}`,
    passageId: passage.id,
    title: passage.title,
    content,
    savedContent: content,
    range: null,
    // 기본값: 워크스페이스에 들어오면 '유형 지정' 모드로 연다 — 사용자가 유형을
    // 고른 뒤 생성한다(자동 생성 아님). 난이도·생성 플랜은 null 로 두어 전체
    // 공통값(기본 중급·일반)을 따른다. 유형 미선택 상태는 생성에서 제외된다.
    override: { mode: "manual", typeCounts: {}, difficulty: null },
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

/**
 * 본문이 oldStr → newStr 로 바뀌었을 때 출제 범위 오프셋을 보정한다.
 * adjustHighlights 와 같은 단일 변경 구간 규칙 — AI 변형/앞 맥락 추가가
 * 범위 밖이면 그대로(또는 평행이동), 겹치면 살아남은 구간만 남긴다.
 * 보정 결과가 effectiveRowContent 최소 길이(20자)에 못 미치면 해제한다.
 */
export function adjustRange(
  oldStr: string,
  newStr: string,
  range: RowRange | null,
): RowRange | null {
  if (!range) return null;
  if (oldStr === newStr) return range;
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
  let start: number;
  let end: number;
  if (range.end <= p) {
    ({ start, end } = range);
  } else if (range.start >= oldEnd) {
    start = range.start + delta;
    end = range.end + delta;
  } else {
    // 변경 구간과 겹침 — 범위가 변경 구간을 포함하면 늘어난 채 유지
    // (범위 안 문장 변형), 일부만 겹치면 살아남은 앞부분만.
    start = Math.min(range.start, p);
    end = range.end >= oldEnd ? range.end + delta : Math.min(range.end, p);
  }
  start = Math.max(0, start);
  end = Math.min(end, newStr.length);
  if (newStr.slice(start, end).trim().length < 20) return null;
  return { start, end };
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

/** 오버라이드에 유형별 세부옵션이 하나라도 들어있는지. */
export function overrideHasTypeSettings(override: RowOverride | null): boolean {
  return (
    !!override &&
    !!override.questionTypeSettings &&
    Object.keys(override.questionTypeSettings).length > 0
  );
}

/** 비어 있는(=전체 설정과 동일한) 오버라이드인지 — 비면 null 로 저장한다. */
export function isOverrideEmpty(override: RowOverride): boolean {
  return (
    override.mode == null &&
    override.generationPlan == null &&
    Object.keys(override.typeCounts).length === 0 &&
    override.difficulty == null &&
    (override.setMembers?.length ?? 0) === 0 &&
    !overrideHasTypeSettings(override)
  );
}

/**
 * 이 행에 실제로 적용될 생성 모드 — 개별 모드 지정이 있으면 그것을, 없으면
 * (유형 개수만 지정된 레거시 행은 manual 로) 전체 공통 모드를 따른다.
 */
export function effectiveRowMode(
  override: RowOverride | null,
  globalMode: "auto" | "manual" | "set",
): "auto" | "manual" | "set" {
  if (override?.mode) return override.mode;
  if (overrideHasTypeCounts(override)) return "manual";
  return globalMode;
}

/**
 * 전체 설정과 다른 유형의 세부옵션만 추린다 — 전체 설정과 같은 유형은
 * 제외해 "전체 설정 따름"으로 남긴다 (이후 전체 설정이 바뀌면 같이 반영).
 */
export function diffQuestionTypeSettings(
  next: QuestionTypeGenerationSettings,
  global: QuestionTypeGenerationSettings,
): QuestionTypeGenerationSettings {
  const out: QuestionTypeGenerationSettings = {};
  for (const key of Object.keys(next)) {
    if (JSON.stringify(next[key]) !== JSON.stringify(global[key])) {
      out[key] = next[key];
    }
  }
  return out;
}

/**
 * 행 하나가 생성할 문제 수.
 * - 개별 유형 지정(typeCounts 오버라이드)이 있으면 그 합.
 * - 자동 생성 모드면 모든 지문에 autoCount 만큼.
 * - 그 외(수동·세트인데 개별 유형 지정 없음)는 0 — 지정하지 않은 지문은
 *   전체 설정으로 폴백하지 않고 생성에서 제외한다.
 */
export function rowQuestionCount(
  row: WorkspaceRow,
  global: { genMode: "auto" | "manual" | "set"; autoCount: number; totalQuestions: number },
): number {
  const mode = effectiveRowMode(row.override, global.genMode);
  if (mode === "manual") {
    return overrideHasTypeCounts(row.override)
      ? Object.values(row.override!.typeCounts).reduce((a, b) => a + b, 0)
      : 0;
  }
  if (mode === "auto") return Math.max(0, global.autoCount);
  // 장문 세트 — 구성한 문항(멤버) 수만큼.
  if (mode === "set") return row.override?.setMembers?.length ?? 0;
  return 0;
}
