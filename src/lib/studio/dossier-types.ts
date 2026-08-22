// 지문 도시에(§3.9) 공유 타입 정본 — 서버 액션(actions/studio/dossier.ts)과
// 우측 패널(passage-dossier-pane.tsx)이 이 파일 하나에 맞춘다.
// 순수 타입만 — 런타임 코드 금지(클라·서버 양쪽 import).

import type { StudioModuleId } from "@/lib/studio/modules";

/** 과제 1건의 학생별 상태 행 */
export interface DossierStudentRow {
  studentId: string;
  /** 학원 스코프 밖이면 "(삭제된 학생)" 폴백(study-stats 정본) */
  name: string;
  /** StudyAssignmentTask.status — 문자열 enum */
  status: "ASSIGNED" | "IN_PROGRESS" | "DONE";
  /**
   * 정답률(0~100, 소수 1자리) — WORKSHEET 는 stageStates 재계산(첫 시도 정본),
   * QUESTIONS 는 responses 정오 집계. 산출 불가(미응시 등)면 null.
   */
  scorePct: number | null;
}

/** 지문 기준 역조회된 배정(과제) 1건 */
export interface DossierAssignment {
  id: string;
  kind: "WORKSHEET" | "QUESTIONS";
  title: string;
  createdAt: string; // ISO
  dueAt: string | null; // ISO
  /** payload.studio.classId → Class.name 해석. 없으면 null(개별 배정) */
  className: string | null;
  /** WORKSHEET 전용 — payload.studio.modules */
  modules: StudioModuleId[] | null;
  /** QUESTIONS 전용 — 이 지문 문항과의 교집합 수 */
  questionCount: number | null;
  taskCount: number;
  doneCount: number;
  inProgressCount: number;
  /** WORKSHEET 전용 — avgFirstTryPctByAssignment 정본(스냅샷 금지). */
  avgFirstTryPct: number | null;
  students: DossierStudentRow[];
}

/** 유형별 문제 카운트(가로 바 리스트 재료) */
export interface DossierQuestionTypeCount {
  /** 화면 표기 라벨(예: 빈칸추론) */
  label: string;
  count: number;
}

/** 도시에의 문제 행(슬림 — 상세는 QuestionCardItem 을 별도 조회 없이 재사용) */
export interface DossierQuestionRow {
  id: string;
  type: string;
  subType: string | null;
  difficulty: string | null;
  approved: boolean;
  /**
   * 프리미엄 생성 여부 — 문항 tags 의 플랜 태그 우선(상세 모달 배지와 동일 정본),
   * 플랜 태그 없는 구세대 행만 WorkbenchAiJob(PREMIUM) result.questionIds
   * 역교집합 폴백(§3.10.11-e).
   */
  premium: boolean;
  /** 문두 1줄용 절단본(서버에서 ~120자) */
  stem: string;
  createdAt: string; // ISO
}

/**
 * 클래스 평면 전체보기(§3.10.16-b)의 문제 행 — 도시에 행과 배지·절단 규칙을
 * 공유하되(불일치 = 두 표면 배지 어긋남), 지문 축이 없는 평면 목록이라
 * 소속 지문 식별 2필드만 추가한다.
 */
export interface StudioClassQuestionRow extends DossierQuestionRow {
  passageId: string;
  passageTitle: string;
}

/**
 * 도시에 「학습지」 섹션의 완성 학습지 행(§3.10.19 E19-6) — PassageReport 중
 * PRIME 계열 마커 보유분. 종류·상태 배지 라벨은 `lib/studio/sheet-products.ts` 의
 * SHEET_PLAN_LABEL / SHEET_STATUS_BADGE **정본**을 공유한다(표면이 갈리면 같은 문서가
 * 다른 이름으로 보인다). pages/theme 은 절대 싣지 않는다(수 MB — §12 슬림 계약).
 */
export interface DossierSheetRow {
  reportId: string;
  /** "PRIME" | "PRIME_KO" | "PRIME_FINAL" — 미지 마커는 표시부가 원문 폴백 */
  planMarker: string;
  title: string;
  /** "DRAFT" | "PUBLISHED" | "ARCHIVED" — DB 컬럼은 String(schema 주석 계약) */
  status: string;
  updatedAt: string; // ISO
}

export interface PassageDossier {
  passage: {
    id: string;
    title: string;
    createdAt: string; // ISO
    updatedAt: string; // ISO
  };
  analysis: {
    analyzed: boolean;
    /** 본문 수정으로 기존 분석 무효(§3.4 스테일 정본 술어) */
    stale: boolean;
    /** 보유 섹션에서 파생한 사용 가능 모듈(exam 제외 6종) */
    readyModules: StudioModuleId[];
    /** 실전 문제(worksheet-grade) 보유 */
    hasExam: boolean;
    /** 분석 리포트 최신 갱신 시각 */
    lastAnalyzedAt: string | null; // ISO
  };
  questions: {
    total: number;
    approvedCount: number;
    byType: DossierQuestionTypeCount[];
    /** 최신순 최대 50 */
    rows: DossierQuestionRow[];
  };
  /**
   * 완성 학습지 행(§3.10.19 E19-6) — updatedAt desc, 최대 10.
   * 구 응답(부재)은 소비처가 빈 배열로 폴백한다(무회귀).
   */
  sheets: DossierSheetRow[];
  /** createdAt desc. WORKSHEET 최근 30 + QUESTIONS 최근 200 스캔 교집합(§3.9.4) */
  assignments: DossierAssignment[];
}
