// 2027학년도 EBS 수능완성 국어 "독서" 지문 코퍼스 — 공유 타입(클라이언트/서버 공용).
// 데이터: src/data/suneung-wanseong/{passages.json, problems.json, links.json, facets.json}.
//
// 수능완성 실전 모의고사 1~5회 독서 파트의 지문 18개를 페이지 이미지에서 축자 전사하고,
// 기출 지문과 동일한 스키마(KoAnalysis)로 심층 분석한 뒤,
// 국어 기출 독서 지문 코퍼스(src/data/exam-passages-korean)와 주제·제재·개념 축으로 연계한다.

import type { KoAnalysis, KoPassage } from "@/lib/korean-exam-passages/types";

/** (가)/(나) 복합 지문의 개별 본문과 본문 단위 심층 분석. */
export interface SwPassagePart {
  label: string;
  text: string;
  analysis?: KoAnalysis;
}

/** 수능완성 지문 한 세트(지문 1 + 딸린 문항 범위 + 분석). */
export interface SwPassage {
  /** 예: "SW2027_DS_R1_Q01-03". */
  id: string;
  subject: "KOREAN";
  /** "2027 수능완성 독서". */
  source: string;
  /** 실전 모의고사 회차(1~5). */
  roundNo: number;
  /** "실전 모의고사 1회". */
  roundLabel: string;
  qFrom: number;
  qTo: number;
  qNumbers: number[];
  /** "수능완성 1회 [1~3]". */
  title: string;
  /** 원본 PDF 파일의 1-based 페이지 범위. */
  pdfPageFrom?: number;
  pdfPageTo?: number;
  /** PDF에 인쇄된 교재 쪽수 범위. */
  printPageFrom?: number;
  printPageTo?: number;
  /** 항상 "독서". */
  galae: string;
  /** "인문(철학)" · "사회(법)" · "과학(생명과학)" · "기술" · "예술" · "주제통합(…)". */
  subGenre: string | null;
  jaejae: string | null;
  difficulty: string | null;
  /** (가)/(나) 복합 지문 여부. */
  isPaired: boolean;
  /** 복합 지문일 때 각 부분. */
  parts: SwPassagePart[];
  /** 각주(어휘 풀이). */
  footnotes: string[];
  passageText: string;
  wordCount: number;
  nProblems: number;
  analysis: KoAnalysis;
  /** 연계된 기출 지문 수(links.json 기준, 미리 계산). */
  linkCount: number;
}

/** 수능완성 원문 문항(정답은 별책 해설이라 이 PDF에 없음 → answerKey 없음). */
export interface SwProblem {
  qNum: number;
  /** EBS 문항코드 "26051-0061". */
  code: string;
  point: number;
  stem: string;
  bogi: string | null;
  choices: string[];
}

/** 연계 강도. */
export type SwLinkStrength = "강" | "중" | "약";

/** 연계 축 — 왜 묶였는지의 분류. */
export type SwRelationType =
  | "주제"
  | "제재"
  | "핵심개념"
  | "논지구조"
  | "배경지식"
  | "출제유형"
  | "관점대립";

/** 수능완성 지문 → 기출 지문 1건의 연계. */
export interface SwLink {
  /** 기출 코퍼스(KoPassage)의 id. */
  examPassageId: string;
  /** 이 연계가 근거로 삼는 수능완성 본문 부분. 예: ["(가)"], ["(가)", "(나)"]. */
  sourceParts: string[];
  strength: SwLinkStrength;
  /** 결정론 후보검색 점수(참고용, 정렬 보조). */
  retrievalScore: number;
  relationTypes: SwRelationType[];
  /** 두 지문이 공유하는 개념어. */
  sharedConcepts: string[];
  /** 두 지문이 공유하는 키워드. */
  sharedKeywords: string[];
  /** 축자 키워드가 다를 때의 개념 대응. 각 용어는 해당 원문에 실제로 존재한다. */
  conceptMappings: { swTerm: string; examTerm: string; relationship: string }[];
  /** 지정된 수능완성 sourceParts 안에서 축자 추출한 연계 근거. */
  swEvidence: string[];
  /** 기출 원문에서 축자 추출한 연계 근거. */
  examEvidence: string[];
  /** 왜 이 둘이 묶였는가 — 사람이 읽는 근거 서술. */
  rationale: string;
  /** 무엇이 다른가 — 수능완성 지문 대비 기출의 차이·확장. */
  difference: string;
  /** 함께 보면 무엇이 남는가 — 학습 포인트. */
  studyPoint: string;
}

/** 연계 + 기출 지문 스냅샷(서버 조인 결과). 목록/상세 표시용. */
export interface SwLinkedExam extends SwLink {
  exam: Pick<
    KoPassage,
    | "id"
    | "title"
    | "board"
    | "grade"
    | "year"
    | "siheng"
    | "subGenre"
    | "jaejae"
    | "difficulty"
    | "qFrom"
    | "qTo"
    | "wordCount"
    | "nProblems"
  > & {
    핵심주제: string;
    요약: string;
    핵심키워드: string[];
  };
}

/** 상세 응답 — 지문 + 원문 문항 + 연계 기출(조인). */
export interface SwDetail {
  passage: SwPassage;
  problems: SwProblem[];
  links: SwLinkedExam[];
}

/** 연계된 기출 지문 원문(모달용). */
export interface SwExamFull {
  passage: KoPassage;
}

/** 필터 옵션. */
export interface SwFacets {
  /** 문제 세트 수. */
  total: number;
  /** (가)/(나)를 각각 센 실제 본문 수. */
  totalTexts?: number;
  /** 연계 총 건수. */
  totalLinks: number;
  rounds: number[];
  subGenres: string[];
  difficulties: string[];
  relationTypes: SwRelationType[];
  counts: {
    round: Record<string, number>;
    subGenre: Record<string, number>;
    difficulty: Record<string, number>;
    relationType: Record<string, number>;
  };
  topKeywords: { kw: string; count: number }[];
}

/** 목록 질의. */
export interface SwQuery {
  q?: string;
  rounds?: number[];
  subGenres?: string[];
  difficulties?: string[];
  relationTypes?: SwRelationType[];
  keywords?: string[];
}

export interface SwListResponse {
  items: SwPassage[];
  total: number;
  facets: SwFacets;
}

export const SW_RELATION_TYPES: SwRelationType[] = [
  "주제",
  "제재",
  "핵심개념",
  "논지구조",
  "배경지식",
  "출제유형",
  "관점대립",
];
