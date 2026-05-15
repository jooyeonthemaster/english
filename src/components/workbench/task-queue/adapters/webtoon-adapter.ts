import type { BaseTask, TaskAdapter, TaskStatus } from "../types";

interface WebtoonRow {
  id: string;
  passageId: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  passage: { id: string; title: string | null } | null;
  createdBy: { id: string; name: string | null } | null;
}

function mapStatus(raw: string): TaskStatus {
  switch (raw) {
    case "PENDING":
      return "pending";
    case "GENERATING":
      return "processing";
    case "COMPLETED":
      return "completed";
    case "FAILED":
      return "failed";
    default:
      return "pending";
  }
}

function buildTitle(row: WebtoonRow): string {
  const passageTitle = row.passage?.title?.trim();
  if (passageTitle) return passageTitle;
  return "지문 미지정 웹툰";
}

function buildSubtitle(row: WebtoonRow): string {
  if (row.errorMessage) return row.errorMessage;
  if (row.createdBy?.name) return `${row.createdBy.name} 생성`;
  return "";
}

export const webtoonAdapter: TaskAdapter = {
  domain: "webtoon",
  async fetchTasks(signal): Promise<BaseTask[]> {
    const res = await fetch("/api/webtoons/list?limit=50", {
      credentials: "include",
      cache: "no-store",
      signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: WebtoonRow[] };
    const items = data.items ?? [];

    return items.map<BaseTask>((row) => ({
      id: row.id,
      domain: "webtoon",
      title: buildTitle(row),
      subtitle: buildSubtitle(row),
      status: mapStatus(row.status),
      createdAt: row.createdAt,
      href: row.passageId
        ? `/director/workbench/webtoon?passageId=${row.passageId}`
        : "/director/workbench/webtoon",
      onDelete: async () => {
        await fetch(`/api/webtoons/${row.id}`, {
          method: "DELETE",
          credentials: "include",
        });
      },
    }));
  },
};
