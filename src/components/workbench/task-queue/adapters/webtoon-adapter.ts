import type { BaseTask, TaskAdapter, TaskStatus } from "../types";
import {
  webtoonRoutes,
  type WebtoonSubjectScope,
} from "@/app/(director)/director/workbench/webtoon/webtoon-routes";

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

/**
 * 작업 드로어의 웹툰 과목 스코프 — 현재 워크스페이스(경로) 기준(extraction-adapter
 * 의 extractionJobsListUrl 미러). 드로어는 director 전역에 마운트되므로 두 과목을
 * 합치면 영어 화면에 국어 웹툰이(그 반대도) 샌다. 국어 라우트(/director/korean/**)
 * 에서만 KOREAN, 그 외는 미지정 = 서버 기본(국어 지문 웹툰 제외).
 */
function currentWebtoonScope(): WebtoonSubjectScope {
  const pathname = typeof window === "undefined" ? "" : window.location.pathname;
  return pathname.startsWith("/director/korean") ? "KOREAN" : undefined;
}

async function fetchRows(
  scope: WebtoonSubjectScope,
  signal?: AbortSignal,
): Promise<WebtoonRow[]> {
  const scopeQuery = scope === "KOREAN" ? "&scope=KOREAN" : "";
  const res = await fetch(
    `/api/webtoons/list?limit=50&view=summary${scopeQuery}`,
    {
      credentials: "include",
      cache: "no-store",
      signal,
    },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: WebtoonRow[] };
  return data.items ?? [];
}

function toTask(row: WebtoonRow, scope: WebtoonSubjectScope): BaseTask {
  const status = mapStatus(row.status);
  // Webtoon DELETE endpoint refuses in-flight rows (PENDING/GENERATING)
  // and there is no cancel endpoint, so we omit onDelete entirely for
  // those — the trash icon will be hidden until the row terminalizes.
  const canDelete = status !== "pending" && status !== "processing";
  return {
    id: row.id,
    domain: "webtoon",
    title: buildTitle(row),
    subtitle: buildSubtitle(row),
    status,
    createdAt: row.createdAt,
    // 과목별 웹툰 관리(보관함)로 보낸다 — 예전 `?passageId=` 는 어느 화면도
    // 읽지 않았고, 국어 웹툰이 영어 화면에 착륙했다.
    href: webtoonRoutes(scope).library,
    onDelete: canDelete
      ? async () => {
          await fetch(`/api/webtoons/${row.id}`, {
            method: "DELETE",
            credentials: "include",
          });
        }
      : undefined,
  };
}

export const webtoonAdapter: TaskAdapter = {
  domain: "webtoon",
  async fetchTasks(signal): Promise<BaseTask[]> {
    // 마운트된 워크스페이스의 과목만 한 번 조회한다(링크도 같은 과목 보관함).
    const scope = currentWebtoonScope();
    const rows = await fetchRows(scope, signal);
    return rows.map((row) => toTask(row, scope));
  },
};
