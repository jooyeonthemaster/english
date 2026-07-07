import type { BaseTask, TaskAdapter, TaskStatus } from "../types";

// workbench_ai_jobs summary 응답 행(EXAM_REPORT / EXAM_STUDENT_REPORT 공용).
// workbench-ai-adapter 와 동일 API(`/api/workbench/ai-jobs?view=summary`)를
// 사용하므로 행 형태도 동일하다.
interface ExamReportJobRow {
  id: string;
  domain: string;
  status: string;
  title: string;
  requestedCount: number;
  successCount: number;
  failedCount: number;
  resultCount: number;
  errorMessage: string | null;
  createdAt: string;
  config?: Record<string, unknown> | null;
}

type ExamReportApiDomain = "EXAM_REPORT" | "EXAM_STUDENT_REPORT";

function mapStatus(raw: string): TaskStatus {
  switch (raw) {
    case "PENDING":
      return "pending";
    case "PROCESSING":
      return "processing";
    case "COMPLETED":
      return "completed";
    case "PARTIAL":
      return "partial";
    case "FAILED":
      return "failed";
    case "CANCELLED":
      return "cancelled";
    default:
      return "pending";
  }
}

/** 잡 config(JSON)에서 문자열 값을 안전하게 꺼낸다(형식이 다르면 null). */
function readConfigString(
  config: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!config || typeof config !== "object") return null;
  const value = config[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * 클릭 목적지. 분석 잡은 해당 분석 워크스페이스로, 학생 리포트 잡은
 * 학생 워크스페이스까지 딥링크한다(config 에 id 가 없으면 허브로 폴백).
 */
function buildHref(job: ExamReportJobRow): string {
  const examAnalysisId = readConfigString(job.config, "examAnalysisId");
  if (!examAnalysisId) return "/director/workbench/exam-report";
  if (job.domain === "EXAM_STUDENT_REPORT") {
    const studentId = readConfigString(job.config, "studentId");
    if (studentId) {
      return `/director/workbench/exam-report/${examAnalysisId}/students/${studentId}`;
    }
  }
  return `/director/workbench/exam-report/${examAnalysisId}`;
}

function buildSubtitle(
  job: ExamReportJobRow,
  apiDomain: ExamReportApiDomain,
): string {
  if (apiDomain === "EXAM_REPORT") {
    if (job.status === "COMPLETED") return "분석 완료";
    if (job.status === "FAILED") return "분석 실패";
    if (job.status === "PENDING") return "분석 대기 중";
    return "시험지 분석 진행 중";
  }
  if (job.status === "COMPLETED") return "학생 리포트 완료";
  if (job.status === "FAILED") return "학생 리포트 실패";
  if (job.status === "PENDING") return "학생 리포트 대기 중";
  return "학생 리포트 생성 중";
}

function buildDescription(
  job: ExamReportJobRow,
  apiDomain: ExamReportApiDomain,
): string {
  if (job.errorMessage) return job.errorMessage;
  if (apiDomain === "EXAM_REPORT") {
    return job.status === "COMPLETED"
      ? "문항 분석 결과가 시험 리포트에 저장되었습니다."
      : "AI가 시험지를 문항 단위로 분석하고 있습니다.";
  }
  return job.status === "COMPLETED"
    ? "학생 상담 리포트가 저장되었습니다."
    : "학생 상담 리포트를 생성하고 있습니다.";
}

/** 문항 분석(EXAM_REPORT) 잡에만 붙는 카운트 스탯. */
function buildAnalysisStats(
  job: ExamReportJobRow,
  status: TaskStatus,
): BaseTask["stats"] {
  return [
    {
      label: "분석 문항",
      // requestedCount 0 = 잡 생성 직후 examMap 문항 수가 확정되기 전 단계.
      value:
        job.requestedCount > 0
          ? `${job.successCount}/${job.requestedCount}`
          : "문항 인식 중",
      tone: status === "failed" ? "red" : "blue",
    },
    {
      label: "판정",
      value: `${job.resultCount}건`,
      tone: job.resultCount > 0 ? "emerald" : "slate",
    },
  ];
}

async function fetchJobs(
  apiDomain: ExamReportApiDomain,
  signal?: AbortSignal,
): Promise<ExamReportJobRow[]> {
  // 카드에는 카운트/상태 스칼라만 쓰므로 summary 뷰로 페이로드를 최소화한다.
  const res = await fetch(
    `/api/workbench/ai-jobs?domain=${apiDomain}&limit=50&view=summary`,
    {
      credentials: "include",
      cache: "no-store",
      signal,
    },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { jobs?: ExamReportJobRow[] };
  return data.jobs ?? [];
}

function toTask(job: ExamReportJobRow, apiDomain: ExamReportApiDomain): BaseTask {
  const status = mapStatus(job.status);
  return {
    id: job.id,
    domain: "exam-report",
    title: job.title,
    subtitle: buildSubtitle(job, apiDomain),
    description: buildDescription(job, apiDomain),
    // 학생 리포트 잡은 카운트 개념이 없어(요청 1건 고정) 스탯 대신
    // description 문구만 노출한다.
    stats:
      apiDomain === "EXAM_REPORT" ? buildAnalysisStats(job, status) : undefined,
    status,
    errorBadge: status === "failed" ? "오류" : undefined,
    createdAt: job.createdAt,
    href: buildHref(job),
    // 취소/삭제 API 가 없는 도메인이라 onDelete 는 제공하지 않는다
    // (스테일 잡 정리는 workbench-ai-job-stale-cleanup 리퍼가 담당).
  };
}

/**
 * 시험 리포트 도메인 어댑터 — 문항 분석(EXAM_REPORT)과 학생 리포트
 * (EXAM_STUDENT_REPORT) 두 잡 도메인을 하나의 큐 탭으로 합쳐 노출한다.
 * 한쪽 fetch 가 실패해도 다른 쪽 결과는 살린다(개별 [] 강등).
 */
export const examReportAdapter: TaskAdapter = {
  domain: "exam-report",
  async fetchTasks(signal): Promise<BaseTask[]> {
    const [analysisJobs, studentJobs] = await Promise.all([
      fetchJobs("EXAM_REPORT", signal).catch(() => [] as ExamReportJobRow[]),
      fetchJobs("EXAM_STUDENT_REPORT", signal).catch(
        () => [] as ExamReportJobRow[],
      ),
    ]);
    return [
      ...analysisJobs.map((job) => toTask(job, "EXAM_REPORT")),
      ...studentJobs.map((job) => toTask(job, "EXAM_STUDENT_REPORT")),
    ];
  },
};
