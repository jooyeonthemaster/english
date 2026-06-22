// 수능·모평 영어 기출 "지문" 코퍼스 — 공유 타입.
// 데이터 원본: src/data/exam-passages/passages.json (1635개, 2003~2027학년도).
// 이 파일은 클라이언트/서버 양쪽에서 안전하게 import 된다(순수 타입·상수만).

/** 정답: 단일 객관식 번호 또는 장문처럼 문항별 정답 맵({"41":1,"42":5}). */
export type ExamAnswer = number | Record<string, number> | null;

/** 한 지문 레코드(복원 완료된 완전한 영어 지문 + 메타). */
export interface ExamPassage {
  /** 안정 식별자 e.g. "2024_SN_5xxxxxx-q31". */
  id: string;
  /** 시험(form) 식별자 — 같은 시험지의 지문 그룹핑. */
  examId: string;
  /** 학년도(2003~2027). */
  year: number;
  /** 시험 회차: "수능" | "9월" | "6월" | "예비". */
  exam: string;
  /** 수준별(2014) A/B form. 보통 "". */
  form: string;
  /** 출처 게시판: "대학수학능력시험"(본수능) | "수능모의평가"(모평). */
  board: string;
  /** 시대: "modern"(2015~) | "ab2014" | "foreign_pdf" | "foreign_old". */
  era: string;
  /** 이 지문이 속한 문항번호(장문은 다수). */
  qNumbers: number[];
  /** 세부 유형(예: "장문(41-42)"). */
  type: string;
  /** 묶음 유형(필터용, 예: "장문"). */
  typeGroup: string;
  /** 공식 정답. */
  answer: ExamAnswer;
  /** 복원 종류: none|blank|order|insertion|irrelevant|grammar_error|vocab_error. */
  reconstructionKind: string;
  /** 복원 신뢰도: high|medium|low. */
  confidence: string;
  /** 어법/어휘처럼 의도된 오류가 심긴 지문 여부. */
  hasDeliberateError: boolean;
  /** 단어 수. */
  wordCount: number;
  /** 학년: "고1" | "고2" | "고3". 수능·모평은 고3. 교육청 학평은 고1/고2/고3. */
  grade?: string;
  /** 복원 완료된 완전한 영어 지문 본문. */
  text: string;
}

/** 코퍼스 facet(필터 옵션 + 전체 카운트). facets.json 모양. */
export interface ExamPassageFacets {
  total: number;
  years: number[];
  exams: string[];
  /** 학년 목록(고3/고2/고1). */
  grades: string[];
  boards: string[];
  eras: string[];
  typeGroups: string[];
  reconKinds: string[];
  counts: {
    typeGroup: Record<string, number>;
    reconstructionKind: Record<string, number>;
    era: Record<string, number>;
    exam: Record<string, number>;
    board: Record<string, number>;
    grade: Record<string, number>;
  };
}

/** 브라우저 → 서버 질의 파라미터. */
export interface ExamPassageQuery {
  /** 본문/제목 검색어. */
  q?: string;
  /** 학년도(복수 가능). */
  years?: number[];
  /** 시험 회차(복수 가능). */
  exams?: string[];
  /** 학년(복수 가능). */
  grades?: string[];
  /** 출처 게시판. */
  boards?: string[];
  /** 묶음 유형(복수 가능). */
  typeGroups?: string[];
  /** 복원 종류(복수 가능). */
  reconKinds?: string[];
  /** 페이지(1-base). */
  page?: number;
  /** 페이지 크기. */
  pageSize?: number;
  /** 특정 id 목록만(선택분 일괄 조회). 주면 페이지네이션·필터 무시. */
  ids?: string[];
}

/** 서버 → 브라우저 목록 응답. */
export interface ExamPassageListResponse {
  items: ExamPassage[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets: ExamPassageFacets;
}

/**
 * 호스트(문제생성/학습지생성/웹툰)가 "불러오기"로 받는 한 지문.
 * 브라우저가 emit 하며, 각 호스트가 자기 로딩 경로(DB 등록 / 입력 스택 행)로 변환한다.
 */
export interface ExamPassagePick {
  id: string;
  title: string;
  content: string;
  year: number;
  exam: string;
  type: string;
  typeGroup: string;
  reconstructionKind: string;
}

/** 페이지 크기 상한(서버·클라 공통). */
export const EXAM_PAGE_SIZE = 24;
export const EXAM_MAX_IDS = 300;
