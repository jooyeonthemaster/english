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
};

export type HeaderPatch = Partial<{
  title: string;
  subtitle: string;
  instructions: string;
  studentNameLabel: string;
  academyLogoDataUrl: string | null;
}>;

export type DropPlacement = "before" | "after";
