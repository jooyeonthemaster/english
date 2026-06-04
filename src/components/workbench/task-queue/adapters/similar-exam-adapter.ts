import type { BaseTask, TaskAdapter, TaskStatus } from "../types";

interface SimilarExamJobRow {
  id: string;
  status: string;
  stage: string;
  title: string;
  originalFileName: string | null;
  totalPages: number;
  generatedExamId: string | null;
  errorMessage: string | null;
  result: unknown;
  createdAt: string;
}

function mapStatus(raw: string): TaskStatus {
  switch (raw) {
    case "PENDING":
      return "pending";
    case "PROCESSING":
      return "processing";
    case "COMPLETED":
      return "completed";
    case "FAILED":
      return "failed";
    case "CANCELLED":
      return "cancelled";
    default:
      return "pending";
  }
}

function readQuestionCount(result: unknown): number {
  if (!result || typeof result !== "object" || Array.isArray(result)) return 0;
  const value = (result as { questionCount?: unknown }).questionCount;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function subtitleFor(job: SimilarExamJobRow, status: TaskStatus) {
  if (status === "completed") return "패턴 기반 시험지 생성 완료";
  if (status === "failed") return "패턴 기반 시험지 생성 실패";
  if (job.stage.startsWith("ANALYZING_PATTERN")) return "시험지 패턴 분석 중";
  if (job.stage === "ASSIGNING_PASSAGES") return "선택 지문 배정 중";
  if (job.stage === "GENERATING_QUESTIONS") return "문항 생성 중";
  if (job.stage === "SAVING") return "시험지 저장 중";
  return "대기 중";
}

export const similarExamAdapter: TaskAdapter = {
  domain: "exam-generation",
  async fetchTasks(signal): Promise<BaseTask[]> {
    const res = await fetch("/api/similar-exams/jobs?limit=50", {
      credentials: "include",
      cache: "no-store",
      signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { jobs?: SimilarExamJobRow[] };

    return (data.jobs ?? []).map<BaseTask>((job) => {
      const status = mapStatus(job.status);
      const questionCount = readQuestionCount(job.result);
      return {
        id: job.id,
        domain: "exam-generation",
        title: job.title || job.originalFileName || "패턴 기반 시험지",
        subtitle: subtitleFor(job, status),
        description:
          job.errorMessage ??
          "업로드한 시험지의 출제 패턴을 분석하고 선택 지문으로 새 시험지를 생성합니다.",
        stats: [
          { label: "페이지", value: `${job.totalPages}p`, tone: "slate" },
          {
            label: "문항",
            value: questionCount > 0 ? `${questionCount}` : "-",
            tone: questionCount > 0 ? "emerald" : "slate",
          },
        ],
        status,
        errorBadge: status === "failed" ? "오류" : undefined,
        createdAt: job.createdAt,
        href: job.generatedExamId
          ? `/director/exams/${job.generatedExamId}`
          : "/director/workbench/similar-exams",
        onDelete:
          status === "processing" || status === "pending"
            ? undefined
            : async () => {
                await fetch(`/api/similar-exams/jobs/${job.id}`, {
                  method: "DELETE",
                  credentials: "include",
                });
              },
      };
    });
  },
};
