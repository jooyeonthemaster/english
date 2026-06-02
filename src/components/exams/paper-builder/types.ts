export type OptionItem = { label: string; text: string };

export type BuilderQuestion = {
  id: string;
  type: string;
  subType: string | null;
  questionText: string;
  structuredData?: unknown;
  options: string | null;
  correctAnswer: string;
  points: number;
  difficulty: string;
  tags: string | null;
  aiGenerated: boolean;
  approved: boolean;
  starred: boolean;
  createdAt: Date | string;
  passage: {
    id: string;
    title: string;
    content: string;
    grade: number | null;
    semester: string | null;
    publisher: string | null;
    school: { id: string; name: string } | null;
  } | null;
  explanation: {
    id: string;
    content: string;
    keyPoints: string | null;
    wrongOptionExplanations: string | null;
  } | null;
  collectionItems: { collectionId: string }[];
  examLinks: { exam: { id: string; title: string; createdAt: Date | string } }[];
  _count: { examLinks: number };
};

export type QuestionCollection = {
  id: string;
  name: string;
  color: string | null;
  parentId: string | null;
  _count: { items: number; children: number };
};

export type ClassOption = { id: string; name: string };
export type SchoolOption = { id: string; name: string };

export type PaperTemplate = "clean" | "mock" | "worksheet" | "minimal" | "academy" | "modern" | "classic" | "colorband";
export type Density = "comfortable" | "compact";
export type PassageStyle = "boxed" | "plain" | "underlined";
export type PaperSize = "A4" | "B4";

// ─── 표지(COVER) ──────────────────────────────────────────────────────────────
// 켜면 시험지 첫 장 앞에 별도의 표지 페이지가 생긴다. 표지는 본문 페이지 번호에
// 포함되지 않으며, 끄더라도 아래 설정값은 그대로 보존된다.
export type PaperCoverTemplate = "classic" | "band" | "minimal";

export type PaperCover = {
  enabled: boolean;
  template: PaperCoverTemplate;
  // 큰 제목 위에 들어가는 작은 라벨(예: 학원·시리즈명). 비우면 표시 안 함.
  eyebrow: string;
  // 표지 하단 문구(예: 문서번호·슬로건). 비우면 표시 안 함.
  footnote: string;
  // 학원 로고(헤더와 공유) 표시 여부.
  showLogo: boolean;
  // 학교/반/이름/시험일 정보 박스 표시 여부.
  showInfo: boolean;
};

export const DEFAULT_PAPER_COVER: PaperCover = {
  enabled: false,
  template: "classic",
  eyebrow: "",
  footnote: "",
  showLogo: true,
  showInfo: true,
};

export const PAPER_COVER_TEMPLATE_LABELS: Record<PaperCoverTemplate, string> = {
  classic: "클래식",
  band: "밴드",
  minimal: "미니멀",
};

export type BreakBefore = "auto" | "column" | "page";
export type PaperBlockType = "question" | "text" | "section" | "divider" | "spacer" | "image";
export type InsertablePaperBlockType = Exclude<PaperBlockType, "question">;
export type PaperBlockAlign = "left" | "center" | "right";
export type PaperBlockFontSize = "sm" | "md" | "lg";
export type PaperBlockDividerStyle = "solid" | "dashed" | "dotted";

export type PaperItem = {
  localId: string;
  questionId: string;
  sourceQuestion: BuilderQuestion;
  orderNum: number;
  points: number;
  groupId: string | null;
  includePassage: boolean;
  passageTitle: string;
  passageContent: string;
  questionText: string;
  options: OptionItem[];
  correctAnswer: string;
  answerSpaceLines: number;
  objectiveAnswerSlots: number;
  objectiveAnswerTexts: string[];
  sectionTitle: string;
  teacherNote: string;
  breakBefore: BreakBefore;
  keepWithPrev: boolean;
  blockType: PaperBlockType;
  locked: boolean;
  blockTitle: string;
  blockText: string;
  blockAlign: PaperBlockAlign;
  blockFontSize: PaperBlockFontSize;
  blockAccentColor: string;
  dividerStyle: PaperBlockDividerStyle;
  dividerThickness: number;
  spacerHeight: number;
  imageDataUrl: string | null;
  imageAlt: string;
  imageWidth: number;
};

export type PaperBlock = PaperItem;

export type PaperGroup = {
  id: string;
  items: PaperItem[];
  passageTitle: string;
  passageContent: string;
  includePassage: boolean;
};

export type RenderOption = { option: OptionItem; originalIndex: number };

// 구조화 본문(지문/요약/given 박스·↓·순서 단락)을 줄 단위로 흘려 칸 경계에서
// 쪼갤 수 있게 하는 행 단위 표현.
export type StructRowStyle = "passage" | "summary" | "given" | "arrow" | "para" | "text";
export type StructRow = {
  segIndex: number;
  style: StructRowStyle;
  paraLabel?: string;
  line: string;
  isSegStart: boolean; // 세그먼트(박스/단락)의 전역 첫 줄인지
  isSegEnd: boolean; // 세그먼트의 전역 마지막 줄인지
};

export type RenderItemPart = {
  source: PaperItem;
  partKey: string;
  showHeader: boolean;
  showAnswer: boolean;
  showObjectiveAnswer: boolean;
  showCustomBlock: boolean;
  questionRenderedLines: string[];
  questionStartLineIndex: number;
  questionTotalLines: number;
  structRows: StructRow[];
  options: RenderOption[];
  isStart: boolean;
  isContinuation: boolean;
};

export type RenderFragment = {
  id: string;
  passageTitle: string;
  passageContent: string;
  includePassage: boolean;
  usesSentenceInsertMarkers: boolean;
  passageRenderedLines: string[];
  passageStartLineIndex: number;
  passageTotalLines: number;
  groupSourceId: string;
  parts: RenderItemPart[];
};

export type PaperPage = RenderFragment[][];

export type PaginationSettings = {
  paperSize: PaperSize;
  columns: 1 | 2;
  density: Density;
  passageStyle: PassageStyle;
  showAnswerSpace: boolean;
  showPassageTitle: boolean;
  showQuestionMeta: boolean;
  template: PaperTemplate;
  // 켜면 자동 흐름/분할 대신 한 칸(섹션)당 문항(그룹) 1개씩 강제 배치한다.
  // 2단 레이아웃에서 "페이지당 2문제" 효과. 기본(undefined/false)은 기존 동작 유지.
  forceTwoPerPage?: boolean;
};

export type HeaderPatch = Partial<{
  title: string;
  subtitle: string;
  instructions: string;
  studentNameLabel: string;
  academyLogoDataUrl: string | null;
}>;

export type DropPlacement = "before" | "after";
