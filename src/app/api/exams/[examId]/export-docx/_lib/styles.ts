// ---------------------------------------------------------------------------
// Constants — Real Korean Exam Grade Styles (수능 / 내신 표준)
// ---------------------------------------------------------------------------

// 미리보기 / HWPX / DOCX 세 가지 출력물의 글꼴을 "맑은 고딕"으로 통일한다.
// 맑은 고딕은 Windows(한글·Word 가 도는 환경)에 기본 번들되어 별도 설치 없이
// 동일하게 렌더링된다. 한글/Word 글꼴 목록에 표시되는 한국어 이름을 그대로 사용.
// docx 라이브러리는 문자열 font 값을 w:ascii/w:hAnsi/w:eastAsia/w:cs 전부에 적용하므로
// 영문·한글이 모두 맑은 고딕으로 출력된다.
export const DEFAULT_FONT = "맑은 고딕";

// 영문(ASCII)·한글 폰트 식별자 — 둘 다 맑은 고딕으로 통일.
export const FONT = DEFAULT_FONT;
export const KR_FONT = DEFAULT_FONT;

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
