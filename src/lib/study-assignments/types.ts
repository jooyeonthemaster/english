// ============================================================================
// 통합 학습 과제(StudyAssignment) — 타입 계약 (플레인 모듈, 클라이언트 공유 가능)
//
// 시험지(EXAM)·학습지(WORKSHEET)·문제세트(QUESTIONS)·어법훈련(GRAMMAR)을
// 학생/반 단위로 배포하는 통합 과제 레이어의 직렬화 가능한 계약 정본.
// 라이브 상태 계산 규칙은 ./status.ts, 서버 조립은 ./task-union.ts(서버 전용).
// DB 계약은 prisma/schema.prisma 의 StudyAssignment/StudyAssignmentTask 주석 참조.
// ============================================================================

import type { WeakSpot } from "@/lib/student-analytics/types";

export type StudyAssignmentKind = "EXAM" | "WORKSHEET" | "QUESTIONS" | "GRAMMAR";

export type StudyAssignmentStatus = "ACTIVE" | "CLOSED" | "ARCHIVED";

/** 태스크 상태 — EXAM/GRAMMAR 는 브리지 조인으로 계산된 라이브 값이 정본 */
export type StudyTaskStatus = "ASSIGNED" | "IN_PROGRESS" | "DONE";

// ── 배포 대상 ────────────────────────────────────────────────────────────────

export interface StudyTargetInput {
  type: "CLASS" | "STUDENT";
  id: string;
}

/** study_assignments.targets jsonb 원소 — 배포 시점 스냅샷(이후 반 변동 무영향) */
export interface StudyTargetSnapshot {
  type: "CLASS" | "STUDENT";
  id: string;
  name: string;
}

// ── kind 별 payload 계약 (study_assignments.payload jsonb) ──────────────────

export interface ExamAssignmentPayload {
  mode: "TABLET" | "OMR";
  /** 제한시간 오버라이드(분, 1~600) — 없으면 시험지 duration 이 그대로 적용 */
  durationMin?: number;
}

/** payload.durationMin 방어 파스 — 1~600 범위의 유한수만 인정(그 외 null) */
export function examPayloadDurationMin(payload: unknown): number | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const v = (payload as { durationMin?: unknown }).durationMin;
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n >= 1 && n <= 600 ? n : null;
}

export interface WorksheetAssignmentPayload {
  /** 표시 캐시 — 원본 삭제 시에도 카드 제목 유지 */
  passageTitle?: string;
  /**
   * 모바일 스터디 모드 설정 — docs/worksheet-study-spec.md §3.
   * 부재(기배포 과제) = { mode: "standard", required: false } 로 해석:
   * 스터디는 제공하되 완료는 기존 "다 확인했습니다" 유지(무회귀).
   * 해석은 resolveStudyConfig(@/lib/worksheet-study/types)가 정본.
   */
  study?: {
    mode: "off" | "light" | "standard" | "intense";
    required: boolean;
  };
}

export interface QuestionsAssignmentPayload {
  /** 배포 시점 문항 id 스냅샷 — 이후 삭제된 문항은 렌더 시 제외 */
  questionIds: string[];
}

/** GrammarDrillAssignment.spec 동형 — 어법 드릴 엔진 큐 편성 스펙 */
export interface GrammarAssignmentPayload {
  unitIds?: string[];
  conceptIds?: string[];
  itemTypes?: string[];
  difficulties?: number[];
  count: number;
}

// ── 분석 시드 (컴포저 analysisSeed 계약 — v3 design D2-3) ────────────────────

/**
 * 취약점 CTA 진입 시 컴포저에 주입되는 분석 컨텍스트 시드.
 * 컨텍스트 스트립·프리셋 채움의 데이터원 — 시드 없는 기존 진입은 미렌더(무회귀).
 */
export interface AnalysisSeed {
  spots: WeakSpot[];
  source: "study" | "exam" | "grammar";
}

// ── kind 메타(라벨·톤) — 아이콘은 소비처가 lucide 로 매핑 ───────────────────

export type StudyKindTone = "blue" | "teal" | "slate" | "indigo" | "emerald";

export const STUDY_KIND_META: Record<
  StudyAssignmentKind,
  { label: string; tone: StudyKindTone }
> = {
  EXAM: { label: "시험", tone: "blue" },
  WORKSHEET: { label: "학습지", tone: "slate" },
  QUESTIONS: { label: "문제 세트", tone: "indigo" },
  GRAMMAR: { label: "어법 훈련", tone: "emerald" },
};

export function isStudyAssignmentKind(v: unknown): v is StudyAssignmentKind {
  return v === "EXAM" || v === "WORKSHEET" || v === "QUESTIONS" || v === "GRAMMAR";
}

// ── 디렉터면 계약 (서버 액션 반환 — 직렬화 가능) ────────────────────────────

export interface StudyAssignmentListRow {
  id: string;
  kind: StudyAssignmentKind;
  title: string;
  refId: string | null;
  status: StudyAssignmentStatus;
  availableFrom: string; // ISO
  dueAt: string | null;
  targetSummary: string | null;
  instructions: string | null;
  createdAt: string;
  taskCount: number;
  doneCount: number;
  inProgressCount: number;
  /** 마감 지남 && 미완료 태스크 수 */
  overdueCount: number;
}

export interface StudyTaskDirectorRow {
  taskId: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  grade: number;
  liveStatus: StudyTaskStatus;
  overdue: boolean;
  startedAt: string | null;
  completedAt: string | null;
  /** "85 / 100점" 등 표시 캐시 — 없으면 null */
  scoreText: string | null;
  /** 백분위 점수(0~100, 소수 1자리) — EXAM=총점/만점, GRAMMAR=정답/문항, QUESTIONS=result.percent */
  scorePercent: number | null;
  /** EXAM: 응시 링크 상대경로(/t/{token}) — 강사 복사용 */
  tokenPath: string | null;
  /** EXAM 브리지 — 있으면 채점 검토 드로어(ReviewDrawer) 진입 가능 */
  examSubmissionId: string | null;
  /** GRAMMAR 브리지 — 훈련 기록 드릴다운용 */
  grammarAssignmentId: string | null;
  /** QUESTIONS: 저장된 답안(responses)이 있어 문항별 답안 대조 가능 */
  hasResponses: boolean;
}

export interface StudyAssignmentDetail extends StudyAssignmentListRow {
  targets: StudyTargetSnapshot[];
  payload:
    | ExamAssignmentPayload
    | WorksheetAssignmentPayload
    | QuestionsAssignmentPayload
    | GrammarAssignmentPayload
    | Record<string, never>;
  tasks: StudyTaskDirectorRow[];
}

/** 학생 상세 "과제" 탭 행 — 과제 소속 + 고아 배포(DIRECT) 유니온 */
export interface StudentStudyTaskRow {
  taskId: string;
  source: "ASSIGNMENT" | "DIRECT";
  assignmentId: string | null;
  kind: StudyAssignmentKind;
  title: string;
  liveStatus: StudyTaskStatus;
  overdue: boolean;
  dueAt: string | null;
  availableFrom: string | null;
  assignedAt: string;
  completedAt: string | null;
  scoreText: string | null;
  progressText: string | null;
  /** EXAM: 응시 링크 상대경로(/t/{token}) — 링크 복사용, 접근 비활성이면 null */
  tokenPath: string | null;
  /** EXAM 브리지 — 있으면 채점 검토 드로어 진입 가능 */
  examSubmissionId: string | null;
  /** GRAMMAR 브리지 — 훈련 기록 드릴다운용 */
  grammarAssignmentId: string | null;
}

// ── 학생면 계약 (/api/g/tasks — 학생 앱 카드) ───────────────────────────────

export interface StudentTaskCard {
  taskId: string;
  source: "ASSIGNMENT" | "DIRECT";
  kind: StudyAssignmentKind;
  kindLabel: string;
  title: string;
  instructions: string | null;
  dueAt: string | null;
  /** 마감까지 남은 일수(서울 달력일) — 음수=지남, null=마감 없음 */
  dDay: number | null;
  overdue: boolean;
  /** availableFrom 이 미래 — 목록에 노출하되 진입 잠금 */
  locked: boolean;
  /** availableFrom ISO — 잠금 해제 시각 안내용(정답성 데이터 아님, DIRECT 는 null) */
  availableFrom: string | null;
  /** 완료 시각 ISO — 완료 탭 정렬·"7. 9. 완료" 표기용 */
  completedAt: string | null;
  status: StudyTaskStatus;
  /** "12/20 문항" 등 진행 캐시 */
  progressText: string | null;
  /** 점수 공개 조건 충족 시에만 — "85점 / 100점" */
  scoreText: string | null;
  /** 진입 경로 — EXAM:/t/{token}, QUESTIONS:/g/q/{id}, WORKSHEET:/g/w/{id},
   *  GRAMMAR:/g/drill?mode=assignment&assignmentId=… 진입 불가 시 null */
  actionHref: string | null;
  assignedAt: string;
}
