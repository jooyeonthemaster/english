// 국어 기출 "지문" 코퍼스 — 공유 타입(클라이언트/서버 공용, 순수 타입·상수만).
// 데이터: src/data/exam-passages-korean/{passages.json, facets.json, problems.json}.
// 수능·평가원·교육청(학평) 국어 지문 1,400여 개 + 지문별 Sonnet 최대상세 분석.

/** 지문별 심층 분석(Sonnet 5 최대상세). 키는 한국어. */
export interface KoAnalysis {
  "갈래": string; // 독서|문학|화법|작문|문법|매체
  "세부영역": string;
  "제재": string;
  "핵심주제": string;
  "요약": string;
  "핵심개념": { "용어": string; "정의": string }[];
  "핵심키워드": string[];
  "고유명사_인물_이론": string[];
  "논지전개구조": string;
  "서술방식": string[];
  "정보구조유형": string;
  "배경지식영역": string;
  "난이도": string; // 상|중|하
  "난이도근거": string;
  "딸린문항유형": { "번호": number; "유형": string }[];
  "출제의도": string;
  "오답함정유형": string;
  "연계배경지식": string[];
  "상호텍스트": string | null;
  "핵심문장": string[];
  "추출품질": string; // good|leaked|truncated|broken
}

/** 국어 지문 한 세트(한 지문 + 딸린 문항 범위 + 분석). */
export interface KoPassage {
  id: string;
  subject: "KOREAN";
  /** "KICE" | "EBSi(교육청)" | "KICE(OCR)" 등. */
  sourceKind: string;
  /** "대학수학능력시험" | "수능모의평가" | "학력평가". */
  board: string;
  /** "고1" | "고2" | "고3". */
  grade: string;
  year: number;
  /** 회차: "수능" | "6월" | "9월" | "3월" 등. */
  siheng: string;
  examId: string;
  qFrom: number;
  qTo: number;
  qNumbers: number[];
  /** 사람이 읽는 제목. */
  title: string;
  /** 갈래(분석 기준, 정규화). */
  galae: string;
  /** 세부영역(인문/사회/과학/현대시/고전소설 등). */
  subGenre: string | null;
  /** 제재·소재. */
  jaejae: string | null;
  /** 난이도 상|중|하. */
  difficulty: string | null;
  isPaired: boolean;
  parts: string[];
  confidence: string;
  wordCount: number;
  passageText: string;
  /** 딸린 문항 수(원문 문제는 problems.json 에 별도). */
  nProblems: number;
  analysis: KoAnalysis | null;
}

/** 원문 문제 상세(problems.json). id → { rawProblems, answerKey }. */
export interface KoProblemDetail {
  rawProblems: {
    qNum: number;
    stem: string;
    choices: string[];
    point: number | null;
    bogi: string | null;
  }[];
  answerKey: Record<string, number>;
}

/** 코퍼스 facet(필터 옵션 + 카운트). facets.json 모양. */
export interface KoFacets {
  total: number;
  boards: string[];
  grades: string[];
  years: number[];
  sihengs: string[];
  sourceKinds: string[];
  galaes: string[];
  subGenres: string[];
  difficulties: string[];
  counts: {
    board: Record<string, number>;
    grade: Record<string, number>;
    year: Record<string, number>;
    siheng: Record<string, number>;
    sourceKind: Record<string, number>;
    galae: Record<string, number>;
    subGenre: Record<string, number>;
    difficulty: Record<string, number>;
  };
  topKeywords: { kw: string; count: number }[];
}

/** 브라우저 → 서버 질의 파라미터. */
export interface KoQuery {
  q?: string;
  boards?: string[];
  grades?: string[];
  years?: number[];
  sihengs?: string[];
  galaes?: string[];
  subGenres?: string[];
  difficulties?: string[];
  keywords?: string[];
  page?: number;
  pageSize?: number;
  ids?: string[];
}

/** 서버 → 브라우저 목록 응답. */
export interface KoListResponse {
  items: KoPassage[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets: KoFacets;
}

export const KO_PAGE_SIZE = 24;
export const KO_MAX_IDS = 300;
