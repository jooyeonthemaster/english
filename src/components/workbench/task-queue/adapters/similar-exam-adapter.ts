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

function readNum(result: unknown, key: string): number | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const value = (result as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readPassageCount(result: unknown): number | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const value = (result as { selectedPassageIds?: unknown }).selectedPassageIds;
  return Array.isArray(value) ? value.length : null;
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
      const questionCount = readNum(job.result, "questionCount");
      const patternCount = readNum(job.result, "patternQuestionCount");
      const passageCount = readPassageCount(job.result);
      const stats: NonNullable<BaseTask["stats"]> = [
        { label: "페이지", value: `${job.totalPages}p`, tone: "slate" },
      ];
      if (questionCount != null) {
        stats.push({ label: "생성", value: `${questionCount}문항`, tone: "emerald" });
      }
      if (patternCount != null) {
        stats.push({ label: "패턴", value: `${patternCount}문항`, tone: "blue" });
      }
      if (passageCount != null) {
        stats.push({ label: "지문", value: `${passageCount}개`, tone: "slate" });
      }
      return {
        id: job.id,
        domain: "exam-generation",
        title: job.title || job.originalFileName || "패턴 기반 시험지",
        subtitle: subtitleFor(job, status),
        description:
          job.errorMessage ??
          "업로드한 시험지의 출제 패턴을 분석하고 선택 지문으로 새 시험지를 생성합니다.",
        stats,
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
