// ============================================================================
// 마커 유형 렌더 스킴 — 수능 모의고사 표준값 (단일 설정 테이블)
//
// "지문에 마커가 박히는" 유형들의 렌더 형식을 한 곳에 명시한다.
//   - mode          : 인라인 단독 / 단일밑줄+보기리스트 / 라벨+보기리스트
//   - passageMarker : 지문 안 마커 표기 (원형숫자 / 알파벳괄호 / 단일밑줄 …)
//   - optionList    : 보기 리스트 표기 (없음 / 원형숫자 / 원형숫자+알파벳참조)
//
// 표준값은 **수능/모의고사 기준**. 추후 다른 형식(내신·교재 등)으로 바꿀 수 있도록
// resolveMarkerScheme(subType, override) 로 **per-call override** 길을 열어둔다.
//
// normalizeImplemented=true 인 유형만 시험지 렌더 정규화(normalizePaperFields)가
// 실제로 표기를 정본화한다. false 는 표준값만 문서화하고 현 동작 유지(점진 롤아웃).
// ============================================================================

export type MarkerRenderMode =
  | "inline-marked" // 지문 안 마커만, 별도 보기 리스트 없음 (어법·어휘·무관·삽입)
  | "single-underline-list" // 지문에 밑줄 1개 + 보기 리스트 (함축·문맥·동의어 등)
  | "labeled-list" // 지문에 라벨 마커 (A)~(E) + 보기 리스트 (지칭·반의어)
  | "none"; // 마커 유형 아님

export type PassageMarkerScheme =
  | "circled-num" // ①②③④⑤ — 표현/단어에 밑줄+원형숫자
  | "circled-num-sentence" // 문장마다 ①②③④⑤ (밑줄 없음, 무관한 문장)
  | "circled-num-gap" // 빈칸 위치에 ①②③④⑤ (문장 삽입)
  | "alpha-paren" // (A)(B)(C)(D)(E) 밑줄
  | "single-underline" // 밑줄 1개, 라벨 없음
  | "none";

export type OptionListScheme =
  | "none" // 보기 리스트 미렌더
  | "circled-num" // ① 답텍스트
  | "circled-num-with-alpha-ref"; // ① (A) — 지문 라벨 참조

export interface MarkerRenderScheme {
  mode: MarkerRenderMode;
  passageMarker: PassageMarkerScheme;
  optionList: OptionListScheme;
  /** true 인 유형만 normalizePaperFields 가 표기 정본화(점진 롤아웃). */
  normalizeImplemented: boolean;
}

const NONE_SCHEME: MarkerRenderScheme = {
  mode: "none",
  passageMarker: "none",
  optionList: "none",
  normalizeImplemented: false,
};

// ── 수능/모의고사 표준값 ──────────────────────────────────────────────────────
export const SUNEUNG_MARKER_SCHEME: Record<string, MarkerRenderScheme> = {
  // 인라인 단독 — 지문 ①②③④⑤, 보기 리스트 없음
  GRAMMAR_ERROR: { mode: "inline-marked", passageMarker: "circled-num", optionList: "none", normalizeImplemented: true },
  VOCAB_CHOICE: { mode: "inline-marked", passageMarker: "circled-num", optionList: "none", normalizeImplemented: true },
  IRRELEVANT: { mode: "inline-marked", passageMarker: "circled-num-sentence", optionList: "none", normalizeImplemented: false },
  SENTENCE_INSERT: { mode: "inline-marked", passageMarker: "circled-num-gap", optionList: "none", normalizeImplemented: false },

  // 단일 밑줄 + 보기 리스트 — 지문 밑줄 1개, 보기 ①②③④⑤(답)
  IMPLIED_MEANING: { mode: "single-underline-list", passageMarker: "single-underline", optionList: "circled-num", normalizeImplemented: false },
  CONTEXT_MEANING: { mode: "single-underline-list", passageMarker: "single-underline", optionList: "circled-num", normalizeImplemented: false },
  SYNONYM: { mode: "single-underline-list", passageMarker: "single-underline", optionList: "circled-num", normalizeImplemented: false },
  // 지칭 추론: 수능 표준은 (a)~(e) 라벨이지만 현 생성 데이터는 밑줄 1개+답텍스트라
  // 데이터에 맞춰 single-underline-list. 라벨형 데이터 도입 시 labeled-list 로 전환.
  REFERENCE: { mode: "single-underline-list", passageMarker: "single-underline", optionList: "circled-num", normalizeImplemented: false },

  // 라벨 + 보기 리스트 — 지문 (A)~(E) 밑줄, 보기 ①②③④⑤(+(A) 참조)
  // 반의어는 수능 비표준이나 현 데이터가 (A)~(E) 다중마커라 labeled-list.
  ANTONYM: { mode: "labeled-list", passageMarker: "alpha-paren", optionList: "circled-num-with-alpha-ref", normalizeImplemented: true },
};

/**
 * 마커 렌더 스킴 해석. 표준값(SUNEUNG_MARKER_SCHEME)을 기본으로,
 * override 로 일부 필드를 덮어쓴다(추후 내신·교재 등 다른 형식 상호변경용 길).
 */
export function resolveMarkerScheme(
  subType: string | null | undefined,
  override?: Partial<MarkerRenderScheme>,
): MarkerRenderScheme {
  const base = (subType && SUNEUNG_MARKER_SCHEME[subType]) || NONE_SCHEME;
  return override ? { ...base, ...override } : base;
}

/** 이 유형이 마커 유형(지문에 마커가 박히는 유형)인지. */
export function isMarkerSubtype(subType: string | null | undefined): boolean {
  return resolveMarkerScheme(subType).mode !== "none";
}
