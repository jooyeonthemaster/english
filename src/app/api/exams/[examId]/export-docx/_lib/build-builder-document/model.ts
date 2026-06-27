import type { ExamQuestionData } from "../types";



export interface BuilderHeader {
  subtitle?: string;
  schoolName?: string;
  className?: string;
  studentNameLabel?: string;
  instructions?: string;
  academyLogoDataUrl?: string | null;
}

export interface BuilderLayout {
  paperSize?: "A4" | "B4";
  columns?: 1 | 2;
  density?: "comfortable" | "compact";
  showAnswerSpace?: boolean;
  showPassageTitle?: boolean;
  showQuestionMeta?: boolean;
  passageStyle?: "boxed" | "underlined" | "plain";
  pageNumberStyle?: "center" | "outside" | "none";
}

export interface BuilderItem {
  localId?: string;
  blockType?: "question";
  questionId: string;
  orderNum?: number;
  points?: number;
  groupId?: string | null;
  includePassage?: boolean;
  passageTitle?: string;
  passageContent?: string;
  questionText?: string;
  options?: Array<{ label: string; text: string }>;
  correctAnswer?: string;
  answerSpaceLines?: number;
  objectiveAnswerSlots?: number;
  objectiveAnswerTexts?: string[];
  sectionTitle?: string;
  teacherNote?: string;
}

export type BuilderBlockType = "question" | "text" | "section" | "divider" | "spacer" | "image";

export interface BuilderBlock extends Omit<Partial<BuilderItem>, "blockType"> {
  localId: string;
  blockType: BuilderBlockType;
  breakBefore?: "auto" | "column" | "page";
  keepWithPrev?: boolean;
  locked?: boolean;
  blockTitle?: string;
  blockText?: string;
  blockAlign?: "left" | "center" | "right";
  blockFontSize?: "sm" | "md" | "lg";
  blockBold?: boolean;
  blockItalic?: boolean;
  blockFontPt?: number | null;
  blockAccentColor?: string;
  dividerStyle?: "solid" | "dashed" | "dotted";
  dividerThickness?: number;
  spacerHeight?: number;
  imageDataUrl?: string | null;
  imageAlt?: string;
  imageWidth?: number;
}

export interface BuilderSettings {
  source: string;
  version?: number;
  template?: string;
  layout?: BuilderLayout;
  header?: BuilderHeader;
  items: BuilderItem[];
  blocks?: BuilderBlock[];
}

export interface BuilderItemResolved extends BuilderItem {
  // 문항 단위 서식(블록 서식 툴바) — 미리보기와 동일하게 다운로드에도 반영.
  blockFontPt?: number | null;
  blockBold?: boolean;
  blockItalic?: boolean;
  blockAlign?: "left" | "center" | "right";
  sourceQuestion: ExamQuestionData["question"];
}

// =============================================================================
// 요약문 영작 (SUMMARY_WRITING) — questionText 블록 파싱
// =============================================================================
// 직렬화 형태(SW-LEAK-1, summaryWritingStudentParts):
//   {direction}\n\n[해석] ...\n\n[빈칸 해석] (A) ...\n\n[요약문] (A) _____ , ...\n\n[보기] w1 / w2\n\n[앞글자] (A) p s d
// 정답계열([빈칸 정답]/modelAnswer 등)은 직렬화에 미포함이므로 여기서 절대 등장하지 않는다.

export interface SummaryWritingDocBlocks {
  gloss: string;        // [해석] (회색 slate)
  blankGloss: string;   // [빈칸 해석] (회색 slate)
  summary: string;      // [요약문] ((A)(B) 마커 + 빈칸선)
  wordBank: string;     // [보기] (칩/인라인)
  firstLetters: string; // [앞글자] (작은 회색)
}
