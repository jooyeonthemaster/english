/**
 * 시험지 디자인 토큰.
 * DOCX 와 같은 시각 비율을 유지하기 위해 pt/색상을 동일하게 맞춤.
 */

export const COLORS = {
  black: "#000000",
  darkGray: "#333333",
  gray: "#666666",
  lightGray: "#999999",
  separator: "#CCCCCC",
  errorLeft: "#FF0000",
  answerBg: "#F5F5F5",
  // DOCX/미리보기와 동일한 마커·박스 색 (parse-formatted-text.ts / a4-paper-page.tsx).
  markerBlue: "#1D4ED8", // 동그라미 숫자 ①·(A) 마커 (blue-700)
  underlineBlue: "#3B82F6", // __밑줄__ 데코레이션 (blue-500)
  slate400: "#94A3B8", // 지문 boxed 테두리
  slate300: "#CBD5E1", // 주어진문장/요약 박스 테두리, 답란 밑줄
  slate50: "#F8FAFC", // 주어진문장/요약 박스 배경
} as const;

// pt 단위.
// 값은 미리보기(A4PaperPage / page-header)의 CSS px 를 pt 로 환산했다.
// 미리보기는 "가상 A4" 모델: 페이지 폭 = PREVIEW_PAGE_WIDTH(760px) = 210mm.
// (pagination.ts 가 pageWidth = 760 * widthRatio, contentWidth = pageWidth - 좌우padding 으로
//  줄넘김을 계산하므로, 760px == 210mm 가 미리보기의 실제 스케일이다.)
// 따라서 96dpi(px*0.75)가 아니라 px * (210/760)/0.352778 = px * 0.783257 로 환산해야
// 본문 글자크기 → 칸당 글자수 → 줄넘김이 미리보기와 맞는다.
//   pt/px = (210/760) / 0.352778 = 0.783257
// pt 단위. 값은 DOCX 골드(build-builder-document.ts)의 half-pt 와 정확히 일치시킨다
// (pt = DOCX_half-pt / 2). DOCX 가 미리보기와 픽셀 검증된 기준이므로 HWPX 도 동일 값을 쓴다.
// HWPX charPr height(1/100pt) = pt*100 = half-pt*50.
export const SIZE = {
  title: 22.0, // h2 28px → DOCX 44 half-pt
  titleCompact: 17.0, // compact 22px → 34
  subtitle: 7.0, // 9px → 14
  info: 8.0, // 학교/반/이름 10px → 16
  instructions: 8.0, // 안내문 10px → 16
  qNum: 10.0, // 문항번호 13px → 20
  qNumCompact: 9.5, // compact 12px → 19
  meta: 7.0, // [점·유형] 9px → 14
  body: 9.0, // 본문 11.5px → 18
  bodyCompact: 8.0, // compact 10.5px → 16
  options: 8.5, // 선지 11px → 17
  optionsCompact: 8.0, // compact 선지 10px → 16
  passageTitle: 7.0, // 10px(uppercase 라벨) → 14
  continued: 8.0, // 2페이지~ 미니헤더 10px → 16
  footer: 8.0, // 푸터 - N / M - 10px → 16
  answerLabel: 8.0, // → 16
  answerValue: 11.0, // 정답값 → 22
  explainLabel: 8.0, // → 16
  explainBody: 9.0, // → 18
} as const;

export const SUBTYPE_LABELS: Record<string, string> = {
  BLANK_INFERENCE: "빈칸 추론",
  GRAMMAR_ERROR: "어법 판단",
  GRAMMAR_CHOICE_COMBO: "네모 어법",
  VOCAB_CHOICE: "어휘 적절성",
  SENTENCE_ORDER: "글의 순서",
  SENTENCE_INSERT: "문장 삽입",
  TOPIC: "주제 추론",
  MAIN_IDEA: "요지/주장",
  TOPIC_MAIN_IDEA: "주제/요지",
  TITLE: "제목 추론",
  IMPLIED_MEANING: "함축 의미 추론",
  REFERENCE: "지칭 추론",
  CONTENT_MATCH: "내용 일치",
  SUMMARY_COMPLETE_MC: "요약문 완성(객관식)",
  IRRELEVANT: "무관한 문장",
  CONDITIONAL_WRITING: "조건부 영작",
  SENTENCE_TRANSFORM: "문장 전환",
  FILL_BLANK_KEY: "핵심 표현 빈칸",
  SUMMARY_COMPLETE: "요약문 완성",
  SUMMARY_WRITING: "요약문 영작",
  WORD_ORDER: "배열 영작",
  TOPIC_SENTENCE_WRITING: "주제문 영작",
  GRAMMAR_CORRECTION: "문법 오류 수정",
  CONTEXT_MEANING: "문맥 속 의미",
  SYNONYM: "동의어",
  ANTONYM: "반의어",
  CUSTOM: "커스텀",
  CUSTOM_LAYOUT: "커스텀",
};
