// ============================================================================
// 학생 시험 리포트 — UI 계약 단일 소스 (v3)
//
// 팬아웃 유닛이 구현할 모든 컴포넌트의 props 인터페이스를 여기서 정의한다.
// 유닛 컴포넌트는 이 파일의 props 타입에만 의존하고, 데이터 조립·스텝 전환은
// spine 셸(workspace-client / student-workspace-client)이 담당한다.
//
// v3: 구조화/문항 렌더 폐기. 중간 산물은 ExamMap(채점 최소 지도)뿐. 학생은
// 본인 마킹 사진을 업로드하고(readState), AI 답안 판독 → 강사 정오표 확정 흐름.
// ============================================================================

import type {
  ExamAiMeta,
  ExamAnalysisResult,
  ExamAnalysisStatus,
  ExamMap,
  ExamReviewState,
  ExamSourceType,
  ExamType,
  ReadState,
  ScoreSummary,
  StudentResponse,
  StudentReportStatus,
} from "@/lib/exam-report/types";
import type { StudentReportDoc } from "@/lib/exam-report/report-schema";

// ── 워크스페이스 스텝 ───────────────────────────────────────────────────────

/** 분석 워크스페이스 탭 2개(구조검수 폐기). */
export type ExamWorkspaceStep = "analysis" | "students";

/** 학생 워크스페이스 스테퍼 3단계. */
export type ExamStudentStep = "read" | "verdict" | "report";

// ── 상세 GET 응답 형태 ──────────────────────────────────────────────────────

/** 업로드된 원본 페이지 참조 (ExamAnalysis.sourceFiles / ExamReportStudent.sourceFiles) */
export interface ExamSourceFile {
  path: string;
  page?: number;
}

/** 학생 메타 (ExamReportStudent.studentMeta) */
export interface ExamStudentMeta {
  school?: string;
  grade?: string;
  classroom?: string;
  note?: string;
}

/** 상세 GET 응답의 학생 요약 행 — 학생 관리 탭 테이블 소스 */
export interface ExamAnalysisStudentRow {
  id: string;
  studentName: string;
  scoreSummary: ScoreSummary | null;
  gradingConfirmed: boolean;
  reportStatus: StudentReportStatus;
  shareEnabled: boolean;
  /** 답안 판독 상태 스냅샷(NONE/READING/READ/FAILED + 재실행 횟수) */
  readState: ReadState;
  /** 이 학생이 올린 마킹 사진 페이지 수(원본 JSON 은 egress 절약 위해 미포함) */
  sourceFileCount: number;
  /** 학생 답안입력 링크(/a/[token]) — 미발급이면 null */
  answerToken: string | null;
  answerEnabled: boolean;
  /** 학생이 마지막으로 답안을 제출한 시각(ISO) — null = 미제출 */
  answerSubmittedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * GET /api/exam-report/analyses/[id] 응답 형태.
 * 워크스페이스 셸이 로드해 각 스텝 컴포넌트에 전달한다.
 */
export interface ExamAnalysisDetail {
  id: string;
  title: string;
  schoolName: string | null;
  grade: string | null;
  subject: string;
  examType: ExamType;
  examYear: number | null;
  semester: string | null;
  status: ExamAnalysisStatus;
  sourceType: ExamSourceType;
  sourceFiles: ExamSourceFile[] | null;
  /** v3 채점 최소 지도(v2 structure 대체) */
  examMap: ExamMap | null;
  analysis: ExamAnalysisResult | null;
  reviewState: ExamReviewState;
  aiMeta: ExamAiMeta;
  version: number;
  createdAt: string;
  updatedAt: string;
  students: ExamAnalysisStudentRow[];
}

/**
 * GET /api/exam-report/students/[studentId] 응답(`{ student }` 래핑)의 student 형태.
 * report 는 재생성 롤백 envelope 의 current 문서만(previous 슬롯은 서버 보관).
 */
export interface ExamStudentDetail {
  id: string;
  examAnalysisId: string;
  studentName: string;
  studentMeta: ExamStudentMeta | null;
  /** 학생 본인 마킹 사진 페이지(답안 판독 대상) */
  sourceFiles: ExamSourceFile[] | null;
  responses: StudentResponse[];
  scoreSummary: ScoreSummary | null;
  /** 답안 판독 상태(판독 스텝·정오표 uncertainties 소스) */
  readState: ReadState;
  gradingConfirmed: boolean;
  report: StudentReportDoc | null;
  /** 재생성 롤백 가능 여부 (envelope.previous 존재) — previous 본문은 서버 보관 */
  hasPreviousReport: boolean;
  reportStatus: StudentReportStatus;
  shareToken: string | null;
  shareEnabled: boolean;
  sharedAt: string | null;
  /** 학생 답안입력 링크(/a/[token]) — 미발급이면 null */
  answerToken: string | null;
  answerEnabled: boolean;
  /** 학생이 마지막으로 답안을 제출한 시각(ISO) — null = 미제출 */
  answerSubmittedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ── 스텝 컴포넌트 props (분석 워크스페이스) ─────────────────────────────────

export interface AnalysisStepProps {
  detail: ExamAnalysisDetail;
  onDetailChange: (next: ExamAnalysisDetail) => void;
  /** 분석 완료 후 학생 관리 탭으로 진행 */
  onAdvance: () => void;
}

export interface StudentsTabProps {
  detail: ExamAnalysisDetail;
  onDetailChange: (next: ExamAnalysisDetail) => void;
}

// ── 채점/리포트 컴포넌트 props (학생 워크스페이스) ──────────────────────────

export interface ReportEditorProps {
  analysis: ExamAnalysisDetail;
  student: ExamStudentDetail;
  onStudentChange: (next: ExamStudentDetail) => void;
}

// ── 자체 페치 컴포넌트 props (허브/라이브러리) ──────────────────────────────
// 이 두 컴포넌트는 URL·전용 GET 으로 자체 페치하므로 props 를 받지 않는다.

export type HubClientProps = Record<string, never>;
export type LibraryClientProps = Record<string, never>;
