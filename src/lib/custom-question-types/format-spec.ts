import { z } from "zod";

// ============================================================================
// FormatSpec — 커스텀 유형의 "시각·구조 포맷" 스펙 (specFormat 2 의 핵심)
// ============================================================================
// 기존 CompiledCustomType 은 출제 '내용' 지식(invariants/variableAxes/prompt)만 담았다.
// FormatSpec 은 원본 문항의 '생김새'를 강박적으로 캡처한다: 마커 스킴, 선지 배치(1/2/3단·표),
// 페어/조합 선지, 빈칸 수·라벨·표현, 박스(조건/보기/단어은행), 서술형 답란, 표 구조 등.
// 이 스펙이 1) 생성 프롬프트의 형식 계약, 2) 생성 결과의 구조 검증 게이트,
// 3) 스튜디오 라이브 미리보기의 투영 규칙, 4) 해부 뷰의 카드 데이터가 된다.
//
// Gemini 구조화 출력은 enum 외 제약(min/max/length)을 강제하지 않으므로 모든 leaf 에
// .catch 폴백을 두어 일부 필드가 어긋나도 전체 파싱이 죽지 않게 한다(분석 스키마와 동일 원칙).

export const FORMAT_SPEC_VERSION = 1;

// ── 마커 스킴 — 선지/라벨/밑줄 마커의 표기 방식 ──
export const MARKER_STYLES = [
  "CIRCLED_NUM", // ① ② ③
  "PAREN_NUM", // (1) (2) (3)
  "PLAIN_NUM", // 1. 2. 3.
  "PAREN_ALPHA_UPPER", // (A) (B) (C)
  "PAREN_ALPHA_LOWER", // (a) (b) (c)
  "CIRCLED_ALPHA_LOWER", // ⓐ ⓑ ⓒ
  "ALPHA_UPPER_DOT", // A. B. C.
  "KOREAN_GANADA", // 가. 나. 다.
  "CIRCLED_KOREAN", // ㉠ ㉡ ㉢
  "NONE",
] as const;
export type MarkerStyle = (typeof MARKER_STYLES)[number];

const markerStyleSchema = z.enum(MARKER_STYLES).catch("CIRCLED_NUM").default("CIRCLED_NUM");

// ── 선지 배치 ──
export const CHOICE_LAYOUTS = [
  "VERTICAL", // 세로 1열(기본)
  "TWO_COLUMN", // 2단
  "THREE_COLUMN", // 3단
  "INLINE", // 한 줄 가로 나열 (①  ②  ③  ④  ⑤)
  "TABLE", // 표 형태 (열 헤더 + 행 선지)
] as const;
export type ChoiceLayout = (typeof CHOICE_LAYOUTS)[number];

// ── 선지 1개의 내부 구조 ──
export const CHOICE_ITEM_PATTERNS = [
  "TEXT", // 단일 텍스트
  "PAIR", // 두 칸 페어 "A — B" (예: (X)-(Y) 조합, 단어-뜻)
  "TRIPLE", // 세 칸 "(X)-(Y)-(Z)"
  "COMBINATION", // 조합형 "ⓐ, ⓒ" / "①, ③"
  "SEQUENCE", // 순서 "(A)-(C)-(B)"
  "TABLE_ROW", // 표의 행 (columnHeaders 와 1:1 셀)
] as const;
export type ChoiceItemPattern = (typeof CHOICE_ITEM_PATTERNS)[number];

// ── 보조 박스 종류 ──
export const BOX_KINDS = [
  "GIVEN", // 주어진 문장
  "CONDITIONS", // 조건
  "EXAMPLE", // <보기>
  "WORD_BANK", // 어휘 상자
  "SUMMARY", // 요약문
  "REFERENCE", // 참고/안내
  "ANSWER_FORM", // 답안 작성란(서술형 빈칸 양식)
  "TABLE", // 표 박스
  "NOTE", // 기타 박스
] as const;
export type BoxKind = (typeof BOX_KINDS)[number];

// ── 빈칸 표기 ──
export const BLANK_RENDER_STYLES = [
  "UNDERSCORES", // ______
  "LABELED_UNDERSCORES", // (A)______
  "PAREN", // (        )
  "BOX", // □ 빈 박스
] as const;
export type BlankRenderStyle = (typeof BLANK_RENDER_STYLES)[number];

const languageSchema = z.enum(["ko", "en", "mixed"]).catch("mixed").default("mixed");

const freeText = (max: number) => z.string().max(max).catch("").default("");
const freeTextList = (maxItemLen: number, maxItems: number) =>
  z.array(z.string().max(maxItemLen).catch("")).max(maxItems).catch([]).default([]);
const countField = (max: number, fallback = 0) =>
  z.number().int().min(0).max(max).catch(fallback).default(fallback);

// ── 발문(stem) 포맷 ──
const stemFormatSchema = z
  .object({
    // 발문 문구 패턴(인스턴스 소재를 일반화한 형태. 예: "다음 글의 ⓐ~ⓔ 중, 어법상 틀린 것끼리 짝지어진 것은?")
    pattern: freeText(400),
    language: languageSchema,
    pointsVisible: z.boolean().catch(false).default(false),
    points: z.number().min(0).max(100).nullable().catch(null).default(null),
    // 부정형 발문("틀린 것", "적절하지 않은 것")
    negativeForm: z.boolean().catch(false).default(false),
    // 발문 안에서 강조(밑줄/굵게)된 토큰들
    emphasis: freeTextList(60, 8),
  })
  .catch({
    pattern: "",
    language: "mixed",
    pointsVisible: false,
    points: null,
    negativeForm: false,
    emphasis: [],
  });

// ── 자료(stimulus) 포맷 ──
export const STIMULUS_FORMS = [
  "PASSAGE", // 일반 산문 지문
  "LETTER", // 편지 (Dear ..., Sincerely)
  "NOTICE", // 안내문/포스터 (제목+불릿 섹션)
  "DIALOGUE", // 대화
  "SENTENCES", // 독립 문장 목록
  "WORD_LIST", // 단어/어휘 목록
  "TABLE", // 표 자체가 자료
  "NONE", // 자료 없음
  "OTHER",
] as const;
export type StimulusForm = (typeof STIMULUS_FORMS)[number];

const stimulusFormatSchema = z
  .object({
    present: z.boolean().catch(true).default(true),
    form: z.enum(STIMULUS_FORMS).catch("PASSAGE").default("PASSAGE"),
    boxed: z.boolean().catch(false).default(false),
    // 자료 내부 제목 라인(예: "Food Truck Festival")의 존재
    titleLine: z.boolean().catch(false).default(false),
    // (A)(B)(C) 분할 단락(순서배열류)
    paragraphLabels: z
      .object({ count: countField(10), style: markerStyleSchema })
      .catch({ count: 0, style: "PAREN_ALPHA_UPPER" }),
    // ⓐ~ⓔ 등 라벨 밑줄 표시
    underlineMarks: z
      .object({
        count: countField(15),
        labelStyle: markerStyleSchema,
        // 밑줄 대상(어법 요소/어휘/구 등 — 무엇에 밑줄을 치는가)
        target: freeText(200),
      })
      .catch({ count: 0, labelStyle: "CIRCLED_ALPHA_LOWER", target: "" }),
    // 지문 속 빈칸
    blanks: z
      .object({
        count: countField(10),
        labelStyle: markerStyleSchema,
        renderStyle: z.enum(BLANK_RENDER_STYLES).catch("UNDERSCORES").default("UNDERSCORES"),
      })
      .catch({ count: 0, labelStyle: "NONE", renderStyle: "UNDERSCORES" }),
    // ①~⑤ 문장 앞 번호(무관문장/삽입 위치)
    numberedSentences: z
      .object({ present: z.boolean().catch(false).default(false), style: markerStyleSchema })
      .catch({ present: false, style: "CIRCLED_NUM" }),
    // 안내문류 불릿 섹션(• August 16, ...)
    bulletSections: z
      .object({
        present: z.boolean().catch(false).default(false),
        headerCount: countField(10),
        bulletMarker: freeText(8),
      })
      .catch({ present: false, headerCount: 0, bulletMarker: "" }),
    language: languageSchema,
    notes: freeText(600),
  })
  .catch({
    present: true,
    form: "PASSAGE",
    boxed: false,
    titleLine: false,
    paragraphLabels: { count: 0, style: "PAREN_ALPHA_UPPER" },
    underlineMarks: { count: 0, labelStyle: "CIRCLED_ALPHA_LOWER", target: "" },
    blanks: { count: 0, labelStyle: "NONE", renderStyle: "UNDERSCORES" },
    numberedSentences: { present: false, style: "CIRCLED_NUM" },
    bulletSections: { present: false, headerCount: 0, bulletMarker: "" },
    language: "mixed",
    notes: "",
  });

// ── 보조 박스 ──
const boxFormatSchema = z.object({
  kind: z.enum(BOX_KINDS).catch("NOTE").default("NOTE"),
  // 화면에 보이는 라벨(예: "조건", "<보기>", "Word / Phrase"). 없으면 빈 문자열.
  label: freeText(80),
  ordered: z.boolean().catch(false).default(false),
  itemCount: countField(20),
  columnHeaders: freeTextList(60, 6),
  notes: freeText(400),
});
export type BoxFormat = z.infer<typeof boxFormatSchema>;

// ── 선지 포맷 ──
const choicesFormatSchema = z
  .object({
    present: z.boolean().catch(true).default(true),
    count: countField(20, 5),
    markerStyle: markerStyleSchema,
    layout: z.enum(CHOICE_LAYOUTS).catch("VERTICAL").default("VERTICAL"),
    itemPattern: z.enum(CHOICE_ITEM_PATTERNS).catch("TEXT").default("TEXT"),
    // PAIR/TRIPLE/SEQUENCE 의 칸 구분자(예: " — ", " - ", " / ")
    pairSeparator: freeText(8),
    // TABLE/PAIR 의 열 헤더(예: ["(X)","(Y)","(Z)"], ["Word / Phrase","Meaning"])
    columnHeaders: freeTextList(60, 6),
    language: languageSchema,
    itemLengthHint: z.enum(["SHORT", "MEDIUM", "LONG"]).catch("MEDIUM").default("MEDIUM"),
    notes: freeText(600),
  })
  .catch({
    present: true,
    count: 5,
    markerStyle: "CIRCLED_NUM",
    layout: "VERTICAL",
    itemPattern: "TEXT",
    pairSeparator: "",
    columnHeaders: [],
    language: "mixed",
    itemLengthHint: "MEDIUM",
    notes: "",
  });

// ── 정답/답안 포맷 ──
const answerFormatSchema = z
  .object({
    shape: z
      .enum(["MULTIPLE_CHOICE", "SHORT_ANSWER", "MIXED"])
      .catch("MULTIPLE_CHOICE")
      .default("MULTIPLE_CHOICE"),
    correctCount: z.number().int().min(1).max(20).catch(1).default(1),
    multipleAnswers: z.boolean().catch(false).default(false),
    subjective: z
      .object({
        // 답 작성용 괘선(밑줄) 줄 수. 0 = 없음.
        answerLineCount: countField(12),
        // 작성해야 할 빈칸/답 슬롯 수(예: ⓐ, ⓑ 두 단어 답)
        answerBlankCount: countField(10),
        blankLabelStyle: markerStyleSchema,
        // 답 형태 서술(예: "한 단어씩 2개", "완전한 문장 1개", "기호 2개와 고친 표현")
        answerFormat: freeText(300),
        conditionsCount: countField(10),
      })
      .catch({
        answerLineCount: 0,
        answerBlankCount: 0,
        blankLabelStyle: "NONE",
        answerFormat: "",
        conditionsCount: 0,
      }),
  })
  .catch({
    shape: "MULTIPLE_CHOICE",
    correctCount: 1,
    multipleAnswers: false,
    subjective: {
      answerLineCount: 0,
      answerBlankCount: 0,
      blankLabelStyle: "NONE",
      answerFormat: "",
      conditionsCount: 0,
    },
  });

// ── FormatSpec 본체 ──
export const formatSpecSchema = z.object({
  version: z.number().int().catch(FORMAT_SPEC_VERSION).default(FORMAT_SPEC_VERSION),
  stem: stemFormatSchema,
  stimulus: stimulusFormatSchema,
  boxes: z.array(boxFormatSchema).max(8).catch([]).default([]),
  choices: choicesFormatSchema,
  answer: answerFormatSchema,
  // 위 구조 필드로 표현 못 한 강박적 관찰(생성 시 반드시 지킬 형식 디테일)
  layoutNotes: freeTextList(400, 16),
});
export type FormatSpec = z.infer<typeof formatSpecSchema>;

/** 손상/부분 데이터에서도 최대한 복구해 FormatSpec 으로 파싱. */
export function parseFormatSpec(value: unknown): FormatSpec {
  return formatSpecSchema.parse(value ?? {});
}

// ── 해부(Anatomy) 뷰 어노테이션 — 이미지 위 핀/영역 + 설명 카드 ──
export const ANNOTATION_CATEGORIES = [
  "STEM", // 발문
  "STIMULUS", // 자료/지문
  "CHOICE", // 선지(개별/전체)
  "BOX", // 보조 박스
  "MARKER", // 마커/라벨 체계
  "BLANK", // 빈칸
  "ANSWER", // 정답/답안 형식
  "SCORING", // 배점
  "TRAP", // 함정 설계
  "LAYOUT", // 배치/단 구성
] as const;
export type AnnotationCategory = (typeof ANNOTATION_CATEGORIES)[number];

const annotationBoxSchema = z
  .object({
    x: z.number().min(0).max(1).catch(0).default(0),
    y: z.number().min(0).max(1).catch(0).default(0),
    width: z.number().min(0).max(1).catch(0).default(0),
    height: z.number().min(0).max(1).catch(0).default(0),
  })
  .nullable()
  .catch(null)
  .optional();

export const formatAnnotationSchema = z.object({
  category: z.enum(ANNOTATION_CATEGORIES).catch("LAYOUT").default("LAYOUT"),
  title: freeText(80),
  detail: freeText(500),
  // 크롭 이미지 기준 정규화 좌표(0..1). 못 찾으면 null → 카드만 표시.
  region: annotationBoxSchema,
});
export type FormatAnnotation = z.infer<typeof formatAnnotationSchema>;

export const formatAnnotationsSchema = z
  .array(formatAnnotationSchema)
  .max(40)
  .catch([])
  .default([]);

export function parseFormatAnnotations(value: unknown): FormatAnnotation[] {
  return formatAnnotationsSchema.parse(value ?? []);
}

// ── 마커 라벨 생성(렌더러/검증/프롬프트 공용) ──
const CIRCLED_NUMS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
const CIRCLED_ALPHA_LOWER = "ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣ";
const CIRCLED_KOREAN = "㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩㉪㉫㉬㉭";
const KOREAN_GANADA = ["가", "나", "다", "라", "마", "바", "사", "아", "자", "차", "카", "타", "파", "하"];

/** index(0-base) → 해당 스킴의 마커 라벨. 범위를 벗어나면 "(n)" 폴백. */
export function markerLabel(style: MarkerStyle, index: number): string {
  if (index < 0) return "";
  switch (style) {
    case "CIRCLED_NUM":
      return CIRCLED_NUMS[index] ?? `(${index + 1})`;
    case "PAREN_NUM":
      return `(${index + 1})`;
    case "PLAIN_NUM":
      return `${index + 1}.`;
    case "PAREN_ALPHA_UPPER":
      return index < 26 ? `(${String.fromCharCode(65 + index)})` : `(${index + 1})`;
    case "PAREN_ALPHA_LOWER":
      return index < 26 ? `(${String.fromCharCode(97 + index)})` : `(${index + 1})`;
    case "CIRCLED_ALPHA_LOWER":
      return CIRCLED_ALPHA_LOWER[index] ?? `(${String.fromCharCode(97 + index)})`;
    case "ALPHA_UPPER_DOT":
      return index < 26 ? `${String.fromCharCode(65 + index)}.` : `${index + 1}.`;
    case "KOREAN_GANADA":
      return KOREAN_GANADA[index] ? `${KOREAN_GANADA[index]}.` : `${index + 1}.`;
    case "CIRCLED_KOREAN":
      return CIRCLED_KOREAN[index] ?? `(${index + 1})`;
    case "NONE":
      return "";
  }
}

/** 스킴의 처음 count 개 라벨 나열(프롬프트 계약·검증용). */
export function markerLabels(style: MarkerStyle, count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => markerLabel(style, i));
}

export const MARKER_STYLE_LABELS: Record<MarkerStyle, string> = {
  CIRCLED_NUM: "①②③ 원형 숫자",
  PAREN_NUM: "(1)(2)(3) 괄호 숫자",
  PLAIN_NUM: "1. 2. 3. 숫자",
  PAREN_ALPHA_UPPER: "(A)(B)(C) 대문자",
  PAREN_ALPHA_LOWER: "(a)(b)(c) 소문자",
  CIRCLED_ALPHA_LOWER: "ⓐⓑⓒ 원형 소문자",
  ALPHA_UPPER_DOT: "A. B. C. 대문자",
  KOREAN_GANADA: "가. 나. 다.",
  CIRCLED_KOREAN: "㉠㉡㉢ 원형 한글",
  NONE: "마커 없음",
};

export const CHOICE_LAYOUT_LABELS: Record<ChoiceLayout, string> = {
  VERTICAL: "세로 1열",
  TWO_COLUMN: "2단",
  THREE_COLUMN: "3단",
  INLINE: "한 줄 나열",
  TABLE: "표",
};

export const CHOICE_ITEM_PATTERN_LABELS: Record<ChoiceItemPattern, string> = {
  TEXT: "단일 텍스트",
  PAIR: "페어 (A — B)",
  TRIPLE: "3칸 조합",
  COMBINATION: "기호 조합 (ⓐ, ⓒ)",
  SEQUENCE: "순서 (A)-(C)-(B)",
  TABLE_ROW: "표의 행",
};

export const BOX_KIND_LABELS: Record<BoxKind, string> = {
  GIVEN: "주어진 문장",
  CONDITIONS: "조건",
  EXAMPLE: "보기",
  WORD_BANK: "어휘 상자",
  SUMMARY: "요약문",
  REFERENCE: "참고/안내",
  ANSWER_FORM: "답안 작성란",
  TABLE: "표",
  NOTE: "기타 박스",
};

export const STIMULUS_FORM_LABELS: Record<StimulusForm, string> = {
  PASSAGE: "산문 지문",
  LETTER: "편지",
  NOTICE: "안내문/포스터",
  DIALOGUE: "대화",
  SENTENCES: "문장 목록",
  WORD_LIST: "단어 목록",
  TABLE: "표",
  NONE: "자료 없음",
  OTHER: "기타",
};
