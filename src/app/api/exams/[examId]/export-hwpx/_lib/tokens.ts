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
} as const;

// pt 단위.
// 값은 미리보기(A4PaperPage / page-header)의 CSS px 를 pt 로 환산했다.
// 미리보기는 "가상 A4" 모델: 페이지 폭 = PREVIEW_PAGE_WIDTH(760px) = 210mm.
// (pagination.ts 가 pageWidth = 760 * widthRatio, contentWidth = pageWidth - 좌우padding 으로
//  줄넘김을 계산하므로, 760px == 210mm 가 미리보기의 실제 스케일이다.)
// 따라서 96dpi(px*0.75)가 아니라 px * (210/760)/0.352778 = px * 0.783257 로 환산해야
// 본문 글자크기 → 칸당 글자수 → 줄넘김이 미리보기와 맞는다.
//   pt/px = (210/760) / 0.352778 = 0.783257
export const SIZE = {
  title: 21.9, // h2 28px
  titleCompact: 17.2, // compact 22px
  subtitle: 7.0, // 9px
  info: 7.8, // 학교/반/이름 10px
  instructions: 7.8, // 안내문 10px
  qNum: 10.2, // 문항번호 13px
  qNumCompact: 9.4, // compact 12px
  meta: 7.0, // [점·유형] 9px
  body: 9.0, // 본문 11.5px (≈9.007pt)
  bodyCompact: 8.2, // compact 10.5px (≈8.224pt)
  options: 8.6, // 선지 11px
  optionsCompact: 7.8, // compact 선지 10px
  passageTitle: 7.0, // 10px (uppercase 트래킹 라벨)
  continued: 7.8, // 2페이지~ 미니헤더 10px
  footer: 7.8, // 푸터 - N / M - 10px
  answerLabel: 8.4,
  answerValue: 9.0,
  explainLabel: 8.4,
  explainBody: 8.8,
} as const;

export const SUBTYPE_LABELS: Record<string, string> = {
  BLANK_INFERENCE: "빈칸 추론",
  GRAMMAR_ERROR: "어법 판단",
  VOCAB_CHOICE: "어휘 적절성",
  SENTENCE_ORDER: "글의 순서",
  SENTENCE_INSERT: "문장 삽입",
  TOPIC_MAIN_IDEA: "주제/요지",
  TITLE: "제목 추론",
  IMPLIED_MEANING: "함축 의미 추론",
  REFERENCE: "지칭 추론",
  CONTENT_MATCH: "내용 일치",
  IRRELEVANT: "무관한 문장",
  CONDITIONAL_WRITING: "조건부 영작",
  SENTENCE_TRANSFORM: "문장 전환",
  FILL_BLANK_KEY: "핵심 표현 빈칸",
  SUMMARY_COMPLETE: "요약문 완성",
  WORD_ORDER: "배열 영작",
  GRAMMAR_CORRECTION: "문법 오류 수정",
  CONTEXT_MEANING: "문맥 속 의미",
  SYNONYM: "동의어",
  ANTONYM: "반의어",
};
