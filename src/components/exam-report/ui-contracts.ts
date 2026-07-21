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

/** 학생 워크스페이스 스테퍼 4단계(답안 수집 → 채점 → 분석 → AI 리포트). */
export type ExamStudentStep = "read" | "verdict" | "analysis" | "report";

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
  /** 로스터(Student.id) 귀속 — null 이면 학생 관리에 없는 학생(구 자유입력 데이터) */
  studentId?: string | null;
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
 * INTERNAL(자체 시험지) 응시 메타 — 분석 탭 헤더의 "언제 봤고 언제까지였는지" 소스.
 * ExamSubmission(응시 수명주기) + StudyAssignment(통합 과제 마감) 조인 결과.
 * 사진 업로드 리포트 등 제출 링크가 없으면 null.
 */
export interface ExamSubmissionMeta {
  submissionId: string;
  /** "ASSIGNED" | "IN_PROGRESS" | "SUBMITTED" | "GRADED" */
  status: string;
  /** "TABLET"(웹 응시) | "OMR"(답안 입력) | null */
  mode: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  gradedAt: string | null;
  /** 통합 과제 연결 시 마감(없으면 null — "마감 없음") */
  dueAt: string | null;
  /** 통합 과제 제목(연결 시) */
  assignmentTitle: string | null;
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
  /** INTERNAL 응시 메타(응시일·마감·과제) — 제출 링크 없으면 null */
  submissionMeta: ExamSubmissionMeta | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ── 문항 원본 리뷰 페이로드(정오표 상세보기·필터·취약점 대시보드) ──────────
//
// v3 정오표는 채점 최소지도(ExamMap)만 갖는다. 서비스가 생성한 시험지(INTERNAL)는
// ExamAnalysis.sourceExamId → Exam → Question 으로 문항 전문·선지·지문·해설을 AI 0콜로
// 재조회할 수 있다. 아래 페이로드가 그 재조회 결과다(GET analyses/[id]/questions).
// 사진 업로드(VISION 등 비INTERNAL) 리포트는 원본이 없어 detailAvailable:false 로 강등된다.

export interface ExamReviewPassage {
  id: string;
  title: string;
  content: string;
  grade?: number | null;
  semester?: string | null;
  publisher?: string | null;
}

export interface ExamReviewExplanation {
  /** Rich HTML 해설 본문 */
  content?: string | null;
  /** JSON string[] */
  keyPoints?: string | null;
  /** JSON {"1":"..."} 또는 [{label,explanation}] */
  wrongOptionExplanations?: string | null;
}

/**
 * 문항 1개 원본 — QuestionCard 에 그대로 주입 가능한 형태 + 조인/필터 축.
 * number(=String(orderNum))가 examMap·responses·perQuestion 과 잇는 단일 조인키다.
 */
export interface ExamReviewQuestion {
  number: string;
  questionId: string;
  type: string;
  subType: string | null;
  questionText: string;
  /** JSON [{label,text}] */
  options: string | null;
  correctAnswer: string;
  /** "BASIC" | "INTERMEDIATE" | "KILLER" */
  difficulty: string;
  /** JSON string[] */
  tags: string | null;
  aiGenerated: boolean;
  approved: boolean;
  /** ISO 문자열(직렬화). QuestionCard 는 Date|string 모두 수용. */
  createdAt: string;
  structuredData: unknown;
  passageId: string | null;
  passage: ExamReviewPassage | null;
  explanation: ExamReviewExplanation | null;
  setId: string | null;
  setLabel: string | null;
}

/**
 * GET /api/exam-report/analyses/[id]/questions 응답.
 * INTERNAL 만 원본 재사용 가능(detailAvailable). 비INTERNAL/문항0 은 강등.
 */
export interface ExamReviewPayload {
  source: "INTERNAL" | "OTHER";
  detailAvailable: boolean;
  /** number(String(orderNum)) → 문항 원본 */
  items: Record<string, ExamReviewQuestion>;
}

// ── 스텝 컴포넌트 props (분석 워크스페이스) ─────────────────────────────────

export interface AnalysisStepProps {
  detail: ExamAnalysisDetail;
  onDetailChange: (next: ExamAnalysisDetail) => void;
  /** 분석 완료 후 학생 관리 탭으로 진행 */
  onAdvance: () => void;
  /**
   * 시험지 총평 시트 — 트리거 버튼은 상위(워크스페이스 헤더의 「시험지 원본」 옆)에
   * 있지만, 총평 편집 저장은 이 스텝의 저장 파이프라인을 타야 버전 충돌이 없다.
   * 그래서 시트 콘텐츠는 여기서 렌더하고 열림 상태만 상위가 제어한다.
   */
  overviewOpen?: boolean;
  onOverviewOpenChange?: (open: boolean) => void;
}

export interface StudentsTabProps {
  detail: ExamAnalysisDetail;
  onDetailChange: (next: ExamAnalysisDetail) => void;
  /** 하단 고정 바의 「이전」 — 문항 분석 탭으로 되돌린다(analysis-step 의 역방향) */
  onBack?: () => void;
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
