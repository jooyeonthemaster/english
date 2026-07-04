import { LineRuleType } from "docx";
import { KR_FONT } from "../styles";
import { koTypeLabelMap } from "@/lib/korean/registry";



// 템플릿(세리프/산세리프)에 따라 본문 글꼴이 달라진다. buildBuilderExamDocument 시작 시
// settings.template 로 1회 설정하고(동기 빌드라 레이스 없음) 모든 텍스트 런에서 사용한다.
export let bodyFont: string = KR_FONT;
/** 분리 모듈 간 ES live-binding 으로 갱신 전파 — buildBuilderExamDocument 시작 시 1회 호출. */
export function setBodyFont(font: string): void {
  bodyFont = font;
}

/*
 * 빌더 미리보기(A4PaperPage)와 1:1로 매칭되는 시험지 DOCX 빌더.
 * - 1페이지 상단: 로고 + (소제목/큰제목) | (학교/반/이름) 박스
 * - 그 아래: 안내문(왼쪽) | 날짜(오른쪽)
 * - 본문: 1단/2단 + 지문(boxed/underlined/plain) + 문항번호[점·유형] + 옵션 + 답란
 * - 푸터: - N / M -
 * - 2페이지 이후 상단 미니헤더: 제목 - N / M
 */

export const SUBTYPE_LABELS_DOCX: Record<string, string> = {
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
  // 국어(KO_*) 유형 라벨을 레지스트리에서 병합 (영어 라벨 무변경).
  ...koTypeLabelMap(),
};

// 미리보기 px 기준값 → docx half-point.
// 미리보기 text-[11.5px] ≈ 본문 10pt, [10.5px] ≈ 9.5pt
export const SIZE_TITLE = 44;        // 22pt (미리보기 h2 28px → 28×0.78325=21.9pt)
export const SIZE_TITLE_COMPACT = 34; // 17pt (compact 22px)
export const SIZE_SUBTITLE = 14;     // 7pt (subtitle 9px)
export const SIZE_INFO = 16;         // 8pt (학교/반/이름)
export const SIZE_INSTRUCTIONS = 16; // 8pt
// 미리보기 a4-paper-page 의 px 폰트를 가상 A4(760px=210mm) 스케일로 물리 pt 환산:
//   pt = px × (210/760) / (25.4/72) = px × 0.78325,  half-pt = px × 1.5665.
// 번호 13px→20, compact 12px→19 / 본문·지시문·선지 11.5px→18, compact 10.5px→16.
export const SIZE_QNUM = 20;         // 10pt (미리보기 번호 13px)
export const SIZE_QNUM_COMPACT = 19; // 9.5pt (compact 12px)
export const SIZE_META = 14;         // 7pt (미리보기 메타 9px)
export const SIZE_BODY = 18;         // 9pt (미리보기 본문 11.5px)
export const SIZE_BODY_COMPACT = 16; // 8pt (compact 10.5px)
export const SIZE_OPTION = 17;       // 8.5pt (미리보기 선지 text-[11px] → 11×0.78325=8.6pt)
export const SIZE_OPTION_COMPACT = 16; // 8pt (compact text-[10px])
export const SIZE_PASSAGE_TITLE = 14; // 7pt
export const SIZE_CONTINUED = 16;    // 8pt
export const SIZE_FOOTER = 16;       // 8pt
export const SIZE_ANSWER_LABEL = 16; // 8pt
export const SIZE_ANSWER_VALUE = 22; // 11pt
export const SIZE_EXPLAIN_LABEL = 16; // 8pt
export const SIZE_EXPLAIN_BODY = 18; // 9pt

// 미리보기 본문 행간(leading)과 1:1 로 맞춘다. a4-paper-page:
//   comfortable leading-[1.58], compact leading-[1.46].
export const BODY_LINE_HEIGHT = 1.58;
export const BODY_LINE_HEIGHT_COMPACT = 1.46;
// CSS line-height(고정 행간)를 그대로 재현하려면 EXACT 행간을 써야 한다.
// (AUTO/multiple 은 글꼴 고유 leading 이 더해져 더 벌어진다.)
// line(트윕) = pt × lineHeight × 20,  pt = halfPt / 2.
export function exactLineSpacing(halfPt: number, lineHeight: number) {
  return { line: Math.round((halfPt / 2) * lineHeight * 20), lineRule: LineRuleType.EXACT };
}

export function mmToDxa(value: number) {
  return Math.round((value / 25.4) * 1440);
}

export const DOCX_PAPER_SIZES = {
  A4: { width: mmToDxa(210), height: mmToDxa(297) },
  B4: { width: mmToDxa(257), height: mmToDxa(364) },
} as const;
