// ---------------------------------------------------------------------------
// Constants — Real Korean Exam Grade Styles (수능 / 내신 표준)
// ---------------------------------------------------------------------------

export const FONT = "Times New Roman";
export const KR_FONT = "바탕"; // The absolute standard for Korean printed exam papers

// Half-point sizes: multiply pt by 2
export const TITLE_SIZE = 36; // 18pt
export const QUESTION_SIZE = 22; // 11pt (Direction text)
export const QUESTION_NUM_SIZE = 24; // 12pt (Question number is slightly larger)
export const PASSAGE_SIZE = 22; // 11pt (Passage and options)
export const SMALL_SIZE = 18; // 9pt (Points, hints)
export const LABEL_SIZE = 20; // 10pt (Subtitles, labels)
export const SUBTITLE_SIZE = 22; // 11pt

export const COLOR = {
  black: "000000",
  darkGray: "333333",
  gray: "666666",
  lightGray: "999999",
  separator: "CCCCCC",
  errorLeft: "FF0000",
  answerBg: "F9F9F9",
} as const;
