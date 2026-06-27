import { type ReactNode } from "react";
import { type AnalysisSection, type CustomBlock, type FontRun, type ReportMeta } from "@/lib/passage-report/analysis-report/schema";

// ─── 편집 컨텍스트 ────────────────────────────────────────────────────────────
export interface SectionEdit {
  commit: (next: AnalysisSection) => void;
}
export interface MetaEdit {
  commit: (next: ReportMeta) => void;
}

/**
 * 줄(문장/표행/도식노드) 단위 flow item.
 * - wrap: 같은 (sectionIndex, wrap) 의 연속 item 은 한 박스/표로 합쳐 렌더.
 * - node: wrap 에 맞는 "내부 콘텐츠" (li 내부 / tr 의 td 들 / 독립 박스 전체).
 */
export type WrapKind =
  | "title"
  | "meta"
  | "note"
  | "passage"
  | "summary"
  | "thesis"
  | "logic"
  | "grammar"
  | "vocab"
  | "vocab-grid"
  | "exam"
  | "reading"
  | "parse"
  | "map"
  | "secheader"
  | "spacer"
  | "activity"
  | "custom-text"
  | "image"
  | "cover";

export interface FlowItem {
  id: string;
  sectionIndex: number; // -1 = 타이틀/커스텀/표지
  kind: AnalysisSection["kind"] | "title" | "custom" | "cover";
  no: number;
  wrap: WrapKind;
  node: ReactNode;
  /** 표 행일 때 숨긴 열 키 (thead 와 행이 같은 기준으로 열 생략) */
  hiddenCols?: string[];
  /** 이 블록(보통 섹션 헤더) 앞에서 페이지 강제 분할 — 구조도/필기 섹션을 새 페이지에서 시작 */
  breakBefore?: boolean;
  /** 섹션 헤더의 '섹션마다 새 페이지' 강제 분할을 면제 — 앞 섹션과 같은 페이지에 이어 붙인다.
   *  (예: 지문 논리 구조 분석을 핵심 요약과 같은 페이지에 두기) */
  keepWithPrev?: boolean;
  /** Page-splittable fragments can keep one logical block id for ordering/editing. */
  orderId?: string;
  editId?: string;
  showGrip?: boolean;
  resizable?: boolean;
}

// ─── 부분 글자 크기(폰트 런) — 블록 메타에 범위로 저장, 평문 값은 불변 ───────────
// f = 블록 안 편집 필드 순서, s/e = 그 필드 평문 기준 글자 offset, pt = 크기.
export interface FieldFontContextValue {
  /** 필드 순서(f) → 그 필드의 런 목록 */
  runsByOrd: Map<number, FontRun[]>;
  /** 한 필드의 런 전체를 교체(blur 시 DOM 에서 다시 읽어 커밋) */
  commit: (ord: number, runs: FontRun[]) => void;
}

export type TableColResize = {
  overrides?: Record<string, number>;
  onDraft?: (widths: Record<string, number>) => void;
  onCommit?: (widths: Record<string, number>) => void;
};

export type VocabularyRow = Extract<AnalysisSection, { kind: "vocabulary" }>["rows"][number];
export type PassageSection = Extract<AnalysisSection, { kind: "passage" }>;
type GrammarSection = Extract<AnalysisSection, { kind: "grammar" }>;
export type ExamFocusSection = Extract<AnalysisSection, { kind: "exam-focus" }>;
type VocabularySection = Extract<AnalysisSection, { kind: "vocabulary" }>;
type ParsingSection = Extract<AnalysisSection, { kind: "parsing" }>;
export type LearningWorksheetSection = Extract<AnalysisSection, { kind: "learning-worksheet" }>;
type WorksheetQuestion = LearningWorksheetSection["questions"][number];
type WorksheetInferenceQuestion = NonNullable<LearningWorksheetSection["inferenceSet"]>["questions"][number];
export type WorksheetQuestionView = WorksheetQuestion | WorksheetInferenceQuestion;
export type WorksheetQuestionPatch = Partial<WorksheetQuestion> & Partial<Pick<WorksheetInferenceQuestion, "typeLabel">>;
export type SectionFlowOptions = {
  vocabTestOnly?: boolean;
  allSections?: AnalysisSection[];
  sectionEdit?: (i: number) => SectionEdit;
  skipWorksheetLogic?: boolean;
  /** 01 원문 렌더 모드. "legacy" 면 구 스택 카드, 그 외(기본)면 신규 필기 캔버스. */
  passageLayout?: "hlc" | "legacy";
  /** passage 섹션 렌더 뷰. "clean"=원문+해석만, "annotated"=필기 캔버스(기본). */
  passageRenderMode?: "clean" | "annotated";
};

export type SectionFlowCtx = {
  si: number;
  no: number;
  editable: boolean;
  commit: (next: AnalysisSection) => void;
  push: (wrap: WrapKind, key: string, node: ReactNode, extra?: Partial<FlowItem>) => void;
  options?: SectionFlowOptions;
  sed?: SectionEdit;
};


export type GrammarNoteRef = {
  sectionIndex: number;
  rowIndex: number;
  section: GrammarSection;
  row: GrammarSection["rows"][number];
};

export type LogicNoteRef = {
  sectionIndex: number;
  rowIndex: number;
  section: LearningWorksheetSection;
  row: LearningWorksheetSection["logicRows"][number];
};

export type ExamNoteRef = {
  sectionIndex: number;
  rowIndex: number;
  section: ExamFocusSection;
  row: ExamFocusSection["rows"][number];
};
export type VocabularyNoteRef = {
  sectionIndex: number;
  rowIndex: number;
  section: VocabularySection;
  row: VocabularyRow;
};

export type ParsingNoteRef = {
  sectionIndex: number;
  itemIndex: number;
  section: ParsingSection;
  item: ParsingSection["items"][number];
};

export type GrammarNotePart =
  | { kind: "label" }
  | { kind: "target" }
  | { kind: "body"; index: number; parts: string[] }
  | { kind: "trap" };

export type ExamNotePart =
  | { kind: "label" }
  | { kind: "target" }
  | { kind: "body"; index: number; parts: string[] };

export type ParsingNotePart =
  | { kind: "part"; index: number }
  | { kind: "translation" };

export type CanvasNoteRef =
  | { kind: "grammar"; ref: GrammarNoteRef }
  | { kind: "exam"; ref: ExamNoteRef }
  | { kind: "logic"; ref: LogicNoteRef }
  | { kind: "parsing"; ref: ParsingNoteRef };

export interface ConnectorPath {
  d: string;
  color: string;
  hx: number;
  hy: number;
}

export type CustomEdit = (id: string, patch: Partial<CustomBlock>) => void;
