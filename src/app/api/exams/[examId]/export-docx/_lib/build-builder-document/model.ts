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

// =============================================================================
// 주제문 영작 (TOPIC_SENTENCE_WRITING) — questionText 블록 파싱 (신규 전용)
// =============================================================================
// 듀얼모드 직렬화 형태(SW-LEAK-1, topicSentenceWritingStudentParts):
//   {direction}\n\n[주제 힌트] <한국어>\n\n
//   (scrambled) [배열 단어] w1 / w2 / ...
//   (cloze)     [주제문] (A) _____ , ...\n\n[보기] w1 / w2
// cloze 면 summary(=[주제문])가 채워지고, scrambled 면 scrambled(=[배열 단어])가 채워진다.
// 정답계열(modelAnswer/blanks[].answer 등)은 직렬화에 미포함이므로 여기서 절대 등장하지 않는다.

export interface TopicSentenceWritingDocBlocks {
  gloss: string;     // [주제 힌트] (회색 slate, 한국어 단서)
  summary: string;   // [주제문] (cloze 모드 — (A)(B) 마커 + 빈칸선)
  wordBank: string;  // [보기] (cloze 모드 — 칩/인라인)
  scrambled: string; // [배열 단어] (scrambled 모드 — 칩/인라인)
}

// cloze 모드 판별: 직렬화에 [주제문] 마커가 있으면 cloze. (이 경로는 structuredData 가 아닌
// questionText 를 소비하므로 마커 존재 여부로 모드를 판정한다.)
export function parseTopicSentenceWritingBlocks(
  questionText: string,
): TopicSentenceWritingDocBlocks {
  const blocks = questionText.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const result: TopicSentenceWritingDocBlocks = {
    gloss: "",
    summary: "",
    wordBank: "",
    scrambled: "",
  };
  const take = (block: string, marker: string) =>
    block.slice(marker.length).replace(/^\s*/, "").trim();
  for (const block of blocks) {
    if (block.startsWith("[주제 힌트]")) result.gloss = take(block, "[주제 힌트]");
    else if (block.startsWith("[주제문]")) result.summary = take(block, "[주제문]");
    else if (block.startsWith("[보기]")) result.wordBank = take(block, "[보기]");
    else if (block.startsWith("[배열 단어]")) result.scrambled = take(block, "[배열 단어]");
  }
  return result;
}
