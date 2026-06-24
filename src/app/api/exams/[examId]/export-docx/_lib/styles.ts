// ---------------------------------------------------------------------------
// Constants — Real Korean Exam Grade Styles (수능 / 내신 표준)
// ---------------------------------------------------------------------------

// 미리보기 / HWPX / DOCX 세 가지 출력물의 글꼴을 "Noto Sans KR"(무료·OFL)로 통일한다.
// 미리보기(브라우저)·DOCX(Word)·HWPX(한글)가 모두 같은 글꼴로 렌더되어 줄바꿈·페이지
// 넘김이 동일해진다(맥에 맑은 고딕이 없어 미리보기가 다른 글꼴로 폴백하던 불일치 해소).
// Noto Sans KR 은 한·영 글리프를 모두 포함하므로 한 글꼴로 통일 가능.
// docx 라이브러리는 문자열 font 값을 w:ascii/w:hAnsi/w:eastAsia/w:cs 전부에 적용한다.
export const DEFAULT_FONT = "Noto Sans KR";

// 영문(ASCII)·한글 폰트 식별자 — 둘 다 Noto Sans KR 로 통일.
export const FONT = DEFAULT_FONT;
export const KR_FONT = DEFAULT_FONT;

// 세리프(명조) 템플릿: 미리보기에서 본문을 font-serif 로 렌더하므로(수능 지문 느낌),
// 다운로드도 같은 세리프(Noto Serif KR)로 맞춰야 줄바꿈·페이지넘김이 일치한다.
// templates.ts 의 mainClass:"font-serif" 인 템플릿 id 와 일치시킨다.
export const SERIF_FONT = "Noto Serif KR";
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
