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
  /**
   * 쪽당 문제 수 고정(빌더 「쪽당 N문제」 토글). 미리보기 paginateGroups 와 같은 규칙으로,
   * 단 예산(1단=1문항, 2단=2문항)을 넘기는 그룹 앞에서 쪽을 넘긴다.
   * 저장: src/actions/exam-paper-builder.ts 의 `normalizedLayout`(= input.layout 스프레드)
   *       ← exam-paper-builder-client-parts/save-draft.ts 의 `layout.forceTwoPerPage`.
   * HWPX 는 이 값을 문단 단위 columnBreak/pageBreak 로 번역할 수밖에 없다 — 한컴은
   * 본문 중간 colPr(신문 다단)을 무시해서 구역을 안 나누면 단 수를 못 바꾼다.
   */
  forceTwoPerPage?: boolean;
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
  /**
   * 이 항목 앞에서 강제로 나눈다. 저장: exam-paper-builder.ts 의 `normalizedItems[].breakBefore`
   * ("column"/"page" 외 값은 서버가 "auto" 로 정규화) ← save-draft.ts 의 `items[].breakBefore`.
   * HWPX 2단 구역에서 "column" 은 columnBreak, "page" 는 pageBreak 로 번역한다.
   * 1단 구역에서는 columnBreak 가 무의미하므로 "column" 도 pageBreak 로 승격한다.
   */
  breakBefore?: "auto" | "column" | "page";
  /**
   * 앞 항목에 붙여 둔다 — true 면 forceTwoPerPage 의 자동 나눔을 적용하지 않는다(미리보기와 동일).
   * 저장: exam-paper-builder.ts 의 `normalizedItems[].keepWithPrev`(Boolean 강제)
   *       ← save-draft.ts 의 `items[].keepWithPrev`.
   */
  keepWithPrev?: boolean;
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

/**
 * 표지 설정. 저장: exam-paper-builder.ts 의 settings.cover
 * (input.cover 가 없으면 키 자체가 빠지므로 BuilderSettings.cover 는 optional)
 *   ← save-draft.ts 의 `cover: input.cover`. 원본 타입은
 *     src/components/exams/paper-builder/types.ts 의 `PaperCover` 와 같은 모양이다.
 *
 * 주의: HWPX 표지 구역(section0)은 `enabled` 와 무관하게 **항상** 그린다.
 * `enabled=false` 는 "표지 없음"이 아니라 "기본 구성(classic · showLogo · showInfo ·
 * eyebrow=header.subtitle · footnote 없음)으로 그린다"는 뜻이다.
 */
export interface BuilderCover {
  enabled: boolean;
  template: "classic" | "band" | "minimal";
  /** 큰 제목 위 작은 라벨. 빈 문자열이면 header.subtitle 로 대체된다. */
  eyebrow: string;
  /** 표지 하단 문구. 빈 문자열이면 표시하지 않는다. */
  footnote: string;
  /** header.academyLogoDataUrl 을 표지에 얹을지. */
  showLogo: boolean;
  /** 학교/반/이름/시험일 정보 박스 표시 여부. */
  showInfo: boolean;
}

export interface BuilderSettings {
  source: string;
  version?: number;
  template?: string;
  /**
   * 자동 배점 총점. 저장: exam-paper-builder.ts 의 `normalizedScoring`
   * (1~999 로 클램프, 유효하지 않으면 null) ← save-draft.ts 의 `scoring.autoPointTotal`.
   * scoring 도입 이전 저장분에는 키 자체가 없어서 optional 이다.
   */
  scoring?: { autoPointTotal?: number | null };
  layout?: BuilderLayout;
  header?: BuilderHeader;
  cover?: BuilderCover;
  items: BuilderItem[];
  blocks?: BuilderBlock[];
  /**
   * 저장 시각 ISO 문자열. 저장: exam-paper-builder.ts 의 `savedAt: new Date().toISOString()`
   * (동형 생성 경로 src/lib/similar-exam-generation/persistence.ts 도 같은 키로 쓴다).
   */
  savedAt?: string;
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
