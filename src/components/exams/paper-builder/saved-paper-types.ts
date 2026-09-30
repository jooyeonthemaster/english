// ============================================================================
// saved-paper-types — 저장된 시험지 설정(빌더 v1/v2 · similar-v1)과 시험 문항 입력의 최소 공통형.
// saved-paper-items.ts(→ PaperItem[])가 소비한다. 웹 ExamQuestion · 서버 ExamQuestionData(Prisma include)
// 모두 SavedPaperExamQuestion 에 구조적으로 대입된다. JSX·window 의존 없음.
// ============================================================================
import type {
  BreakBefore,
  BuilderQuestionSetRender,
  Density,
  PaperCover,
  PaperItem,
  PaperSize,
  PassageStyle,
} from "./types";

export type SavedPaperItem = {
  localId?: string;
  blockType?: "question";
  questionId?: string;
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
  breakBefore?: BreakBefore;
  keepWithPrev?: boolean;
};

export type SavedPaperBlock = Omit<SavedPaperItem, "blockType"> & {
  localId?: string;
  blockType?: PaperItem["blockType"];
  locked?: boolean;
  blockTitle?: string;
  blockText?: string;
  blockAlign?: PaperItem["blockAlign"];
  blockFontSize?: PaperItem["blockFontSize"];
  blockBold?: boolean;
  blockItalic?: boolean;
  blockFontPt?: number | null;
  blockAccentColor?: string;
  dividerStyle?: PaperItem["dividerStyle"];
  dividerThickness?: number;
  spacerHeight?: number;
  imageDataUrl?: string | null;
  imageAlt?: string;
  imageWidth?: number;
};

export type SavedPaperSettings = {
  source?: string;
  version?: number;
  template?: string;
  scoring?: { autoPointTotal?: number | null };
  layout?: {
    columns?: 1 | 2;
    paperSize?: PaperSize;
    density?: Density;
    forceTwoPerPage?: boolean;
    showAnswerSpace?: boolean;
    showPassageTitle?: boolean;
    showQuestionMeta?: boolean;
    passageStyle?: PassageStyle;
  };
  header?: {
    subtitle?: string;
    studentNameLabel?: string;
    instructions?: string;
    academyLogoDataUrl?: string | null;
  };
  cover?: Partial<PaperCover>;
  items?: SavedPaperItem[];
  blocks?: SavedPaperBlock[];
};

/** 시험 문항 입력의 최소 공통형 — 웹 ExamQuestion · 서버 ExamQuestionData 모두 대입 가능. */
export type SavedPaperExamQuestion = {
  orderNum?: number | null;
  points?: number | null;
  question: {
    id: string;
    type: string;
    subType: string | null;
    questionText: string;
    structuredData?: unknown;
    options: string | null;
    correctAnswer: string;
    points?: number | null;
    difficulty?: string | null;
    tags?: string | null;
    aiGenerated?: boolean;
    approved?: boolean;
    starred?: boolean;
    createdAt?: Date | string;
    setId?: string | null;
    setRender?: BuilderQuestionSetRender | null;
    passage: {
      id?: string | null;
      title?: string | null;
      content?: string | null;
      grade?: number | null;
      semester?: string | null;
      publisher?: string | null;
      school?: { id: string; name: string } | null;
    } | null;
    explanation?: {
      id?: string | null;
      content?: string | null;
      keyPoints?: string | null;
      wrongOptionExplanations?: string | null;
    } | null;
    collectionItems?: { collectionId: string }[];
    _count?: { examLinks: number };
  };
};

/** settings(문자열 JSON 또는 이미 파싱된 객체) → 저장 설정. 파싱 불가·객체 아님이면 null. */
export function parseSavedPaperSettings(raw: unknown): SavedPaperSettings | null {
  if (!raw) return null;
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as SavedPaperSettings)
    : null;
}
