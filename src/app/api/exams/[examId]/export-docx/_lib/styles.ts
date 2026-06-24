// ---------------------------------------------------------------------------
// Constants — Real Korean Exam Grade Styles (수능 / 내신 표준)
// ---------------------------------------------------------------------------

// 미리보기 / HWPX / DOCX 세 가지 출력물의 글꼴을 "맑은 고딕"으로 통일한다.
// 맑은 고딕은 Windows(한글·Word 가 도는 환경)에 기본 번들되어 별도 설치 없이
// docx 라이브러리는 문자열 font 값을 w:ascii/w:hAnsi/w:eastAsia/w:cs 전부에 적용하므로
// 영문·한글이 모두 맑은 고딕으로 출력된다.
// NOTE: Noto Sans/Serif KR 통일은 미완 기능이라 보류 — 폰트값은 맑은 고딕으로 되돌리되
// bodyFontForTemplate/SERIF_FONT plumbing 은 남겨 추후 완성 시 재사용한다.
export const DEFAULT_FONT = "맑은 고딕";

// 영문(ASCII)·한글 폰트 식별자 — 둘 다 맑은 고딕으로 통일.
export const FONT = DEFAULT_FONT;
export const KR_FONT = DEFAULT_FONT;

// 세리프(명조) 템플릿 분기 plumbing(미완) — 보류 중이라 본문 글꼴은 맑은 고딕으로 일치.
// 추후 Noto Serif KR 로 완성 시 이 값만 바꾸면 된다.
export const SERIF_FONT = "맑은 고딕";
const SERIF_TEMPLATE_IDS = new Set(["mock", "classic"]);
export function bodyFontForTemplate(template: string | null | undefined): string {
  return template && SERIF_TEMPLATE_IDS.has(template) ? SERIF_FONT : DEFAULT_FONT;
}

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
  // 미리보기 마커/밑줄 색 — renderFormattedInline 과 일치.
  markerBlue: "1D4ED8",      // (A)·동그라미 마커 = text-blue-700
  underlineBlue: "3B82F6",   // __밑줄__ = decoration-blue-500
  // 미리보기 박스 테두리색.
  slate400: "94A3B8",        // 지문 박스 = border-slate-400
  slate300: "CBD5E1",        // given/summary 박스 = border-slate-300
} as const;
