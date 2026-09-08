// 수능·모평·학평 영어 **기출 문항 은행** — 공유 타입(순수 타입·상수만, 클라이언트/서버 양쪽 import 안전).
// 데이터 원본: src/data/exam-passages/questions.json (scripts/gichul-bank 결정론 빌더 + 검증 함대 산출).
// 정본 문서: docs/gichul-question-bank-spec.md §3.
//
// 지문 코퍼스(`./types.ts` ExamPassage)와의 관계: 은행 항목 1건 = 코퍼스 지문 1건(passageId 공유) + 그 지문의
// 인쇄 문항 원형(발문·선지·정답·마커). 반입 시 Passage 행은 기출 지문 반입(kice:<passageId>)과 **같은 행**을 쓴다.

/** 시험지 빌더 subType(src/lib/constants.ts QUESTION_SUBTYPES) 중 은행이 내보내는 값 */
export type ExamBankSubType =
  | "BLANK_INFERENCE"
  | "GRAMMAR_ERROR"
  | "VOCAB_CHOICE"
  | "SENTENCE_ORDER"
  | "SENTENCE_INSERT"
  | "IRRELEVANT"
  | "SUMMARY_COMPLETE_MC"
  | "TOPIC"
  | "MAIN_IDEA"
  | "TITLE"
  | "CONTENT_MATCH"
  | "IMPLIED_MEANING"
  /** 장문 세트 44번(지칭 추론, §12) — 세트 멤버로만 나온다 */
  | "REFERENCE";

export interface ExamBankOption {
  label: string;
  text: string;
  /** 요약문(SUMMARY_COMPLETE_MC) 전용 — (A)/(B) 값 */
  blankValues?: { label: string; value: string }[];
  blankA?: string;
  blankB?: string;
}

/** 은행 항목 1건 — 시험지 빌더가 기대하는 직렬화 완성본을 그대로 담는다(반입 액션은 컬럼에 옮겨 적기만 한다). */
export interface ExamBankItem {
  /** bankId — 코퍼스 passage id 와 같다(예: "2024_SN_5086091-q31") */
  id: string;
  passageId: string;
  examId: string;
  year: number;
  /** "수능" | "6월" | "9월" | "3월" … */
  exam: string;
  /** "대학수학능력시험" | "수능모의평가" | "학력평가" */
  board: string;
  /** "고1" | "고2" | "고3" */
  grade: string;
  era: string;
  form: string;
  /** 인쇄 문항 번호 */
  qNum: number;
  /** 코퍼스 묶음 유형(필터 축: 빈칸추론·문장삽입·글의순서 …) */
  typeGroup: string;
  subType: ExamBankSubType;
  /** 원본 배점(2 | 3, 구형 1) */
  points: number;
  /** 발문(인쇄본 또는 수능 고정 지시문) */
  direction: string;
  /** 빌더 직렬화 완성본 — buildGeneratedQuestionText 동형 */
  questionText: string;
  options: ExamBankOption[];
  correctAnswer: string;
  /** 렌더가 읽는 최소 키만(passageWithBlank·passageWithMarkers·paragraphs·givenSentence·summaryWithBlanks·blanks·markedExpressions 등) */
  structuredData: Record<string, unknown>;
  /** Passage.title 정본(formatExamTitle) — Passage.content 는 코퍼스(passages.json)에서 해석한다(중복 적재 금지) */
  passageTitle: string;
  /**
   * 코퍼스 본문이 절단된 지문(각주 컷 결손)만 원형(PDF) 복원본을 싣는다 — 지문 행 생성 시 본문 대체.
   * 없으면 코퍼스 본문 그대로(중복 적재 금지 원칙은 유지).
   */
  passageContentOverride?: string | null;
  footnotes: string[];
  /** 문두 미리보기(목록 행용, ~140자) */
  preview: string;
  /** 검증 이력 — 어떤 게이트를 통과했는가 */
  verified: string[];
  /**
   * 장문 세트 멤버(§12.2, additive) — 세트 키(= 코퍼스 세트 지문 id, question-sets.json 의 ExamBankSet.key).
   * 단일 문항은 없다. 멤버 bankId 는 `<setKey>#<qNum>`.
   */
  setKey?: string;
  /** 세트 표시 라벨("43~45") */
  setLabel?: string;
  /** 세트 전체 문항 번호([43,44,45]) — 부분 세트여도 원형 전체 */
  setQNums?: number[];
}

/**
 * 장문 세트 정본(§12.2) — `src/data/exam-passages/question-sets.json`. 멤버 항목은 questions.json 에 그대로 있고
 * setKey 로 연결된다. 표시 베이스(displayedPassage, 인쇄본 그대로: (a)~(e) 라벨 평문 · (A)~(D) 셔플 단락 · 빈칸 _____)와
 * 정본 지문(canonicalPassage, 코퍼스: 라벨 없음 · 정답 순서 · 교정 원문)은 **다르다**. Passage 행 본문은 canonical.
 */
export interface ExamBankSet {
  /** = 코퍼스 세트 지문 id("2026_SN_5093799-q43-44-45" / "ebsi_go1_20260324-q41-42") */
  key: string;
  /** = key (Passage 행 kice:<passageId>) */
  passageId: string;
  examId: string;
  year: number;
  exam: string;
  board: string;
  grade: string;
  era: string;
  form: string;
  /** 원형 문항 번호 전체([43,44,45]) */
  qNums: number[];
  /** "43~45" */
  label: string;
  /** 멤버 bankId, qNum 오름차순(부분 세트면 빠진 번호 없음) */
  memberIds: string[];
  /** 파싱 실패로 빠진 멤버 번호(부분 세트) */
  unsupportedQNums: number[];
  /** 인쇄본 표시 베이스 — 세트 그룹 머리 1박스가 이걸 그린다(멤버 _spans 병합) */
  displayedPassage: string;
  /** 코퍼스 정본(라벨 없음 · 정답 순서 · 교정 원문) — QuestionSet.canonicalPassage */
  canonicalPassage: string;
  /**
   * QuestionSet.displayedPassageLayout 과 같은 모양(src/lib/question-sets/types.ts LayoutDescriptor).
   * 43-45: type "SENTENCE_ORDER" + blocks[(A)~(D), displayOrder=인쇄 순서, canonicalIndex=정답 순서] + fullPassage.
   * 41-42: type "NONE" + fullPassage. correctOrder 는 서버 전용이라 여기 없다(반입 액션이 정답으로 재구성).
   */
  layout: {
    type: "NONE" | "SENTENCE_ORDER";
    givenSentence?: string;
    blocks?: { label: string; text: string; canonicalIndex: number; displayOrder: number }[];
    fullPassage: string;
    fingerprintHash: string;
  };
  footnotes: string[];
  /** formatExamTitle 정본("2026학년도 수능 영어 43-45번 · 장문") */
  passageTitle: string;
  provenance: {
    textSource: "origin" | "corpus+origin";
    answerSource: string;
    vocabCorrection?: { planted: string; original: string; evidence: string } | null;
  };
}

/** 은행 facet(필터 옵션 + 카운트) — questions-facets.json 모양 */
/** 단일 문항 번호 또는 장문 세트의 원본 번호 범위. */
export type ExamBankQNum = number | `${number}~${number}`;

export interface ExamBankFacets {
  total: number;
  years: number[];
  exams: string[];
  grades: string[];
  boards: string[];
  typeGroups: string[];
  /** 목록과 동일한 단위의 번호(예: 40, "41~42", "43~45"). */
  qNums: ExamBankQNum[];
  counts: {
    year: Record<string, number>;
    exam: Record<string, number>;
    grade: Record<string, number>;
    board: Record<string, number>;
    typeGroup: Record<string, number>;
    qNum: Record<string, number>;
  };
}

/** 브라우저 → 서버 질의 */
export interface ExamBankQuery {
  q?: string;
  /** 학년도 범위(양끝 포함) */
  yearFrom?: number;
  yearTo?: number;
  exams?: string[];
  grades?: string[];
  boards?: string[];
  typeGroups?: string[];
  /** 배점 필터(2·3, 구형 1) — §11.3-7. facet 카운트는 계산하지 않는다(축 없음). */
  points?: number[];
  /** 단일 번호·장문 범위 선택. 세트 소문항을 개별 번호로 검색하지 않는다. */
  qNums?: ExamBankQNum[];
  /**
   * 정렬 — "latest"(기본) = 은행 정준 순(연도↓·회차·학년·번호↑, 조립 시 확정) ·
   * "exam" = 회차(examId 오름차순) → 문항 번호 오름차순. 클라이언트 정렬 금지(§11.3).
   */
  sort?: "latest" | "exam";
  page?: number;
  pageSize?: number;
  /** 특정 id 목록만(선택분 일괄 조회 — 필터·페이지 무시) */
  ids?: string[];
}

/** 목록 행(경량 — 본문 없음) */
export interface ExamBankRow {
  id: string;
  passageId: string;
  examId: string;
  year: number;
  exam: string;
  board: string;
  grade: string;
  qNum: number;
  typeGroup: string;
  subType: ExamBankSubType;
  points: number;
  passageTitle: string;
  preview: string;
  /** 장문 세트 멤버(§12.2, additive) — 세트 키·라벨·전체 번호. 목록은 세트 멤버를 인접 행으로 내려 세트 카드로 묶는다 */
  setKey?: string;
  setLabel?: string;
  setQNums?: number[];
  /** 장문 한 행을 체크/해제할 때 함께 처리하는 전체 멤버. */
  memberIds?: string[];
}

export interface ExamBankListResponse {
  items: ExamBankRow[];
  /** 이 응답의 행이 참조하는 세트(§12.2, additive) — key → ExamBankSet. 세트 멤버 행이 없으면 생략 */
  sets?: Record<string, ExamBankSet>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets: ExamBankFacets;
  /** 현재 필터의 전체 id(「현재 조건 전체 선택」용, 상한 EXAM_BANK_SELECT_ALL_MAX) */
  allIds: string[];
  allIdsTruncated: boolean;
  /** `ids` 모드 + `full=1` — 조판 프리페치용 전체 항목(본문 제외 지문은 /api/exam-passages 로) */
  fullItems?: ExamBankItem[];
}

export const EXAM_BANK_PAGE_SIZE = 40;
/** 한 번에 담을 수 있는 문항 상한(서버 액션·전체 선택 공통) */
export const EXAM_BANK_IMPORT_MAX = 150;
export const EXAM_BANK_SELECT_ALL_MAX = 150;

/** 유형 필터 정준 순서(수능 문항 순) */
export const EXAM_BANK_TYPE_GROUPS = [
  "주장",
  "함축의미",
  "요지",
  "주제",
  "제목",
  "내용일치",
  "어법",
  "어휘",
  "빈칸추론",
  "무관한문장",
  "글의순서",
  "문장삽입",
  "요약문",
  /** 장문 세트(§12) — 「장문」 = 세트 멤버 전부, 「지칭」 = 44번 멤버 */
  "지칭",
  "장문",
] as const;

/** 회차 정준 순서 */
/** 회차 정렬 — 평가원 회차(6월·9월·수능·예비) 먼저, 그 뒤 교육청 학평을 달력순으로. (빈도순은 사용자에게 무작위로 보인다.) */
export const EXAM_BANK_EXAMS = ["6월", "9월", "수능", "예비", "3월", "4월", "5월", "7월", "8월", "10월", "11월", "12월"] as const;
