"use client";

// ============================================================================
// 과제 상세 — 배정 현황 테이블 툴바 (assignment-detail-parts 전용 분리)
//
//  - 상태 세그먼트 칩(전체/대기/진행 중/완료)·정렬 셀렉트·이름 검색 — 전부
//    TaskTable(부모) 로컬 state 의 컨트롤드 입력. 서버 재조회 없음.
//  - 우측: 리마인드 복사(미완료 학생 대상 합니다체 안내문)·미완료 명단 복사·
//    현재 필터·정렬 적용분 TSV 표 복사. clipboard+toast 패턴은 copyTokenLink 미러.
//  - 필터/정렬 순수 함수(applyTaskFilters/sortTaskRows)도 여기서 export — 부모가
//    useMemo 로 소비한다.
// ============================================================================

import { ClipboardCopy, Megaphone, Table2 } from "lucide-react";
import { toast } from "sonner";
import type {
  StudyAssignmentKind,
  StudyTaskDirectorRow,
} from "@/lib/study-assignments/types";
import { cn } from "@/lib/utils";

export type TaskStatusFilter = "ALL" | "ASSIGNED" | "IN_PROGRESS" | "DONE";

export type TaskSortKey = "PENDING_FIRST" | "NAME" | "SCORE" | "COMPLETED_AT";

const SORT_LABELS: Record<TaskSortKey, string> = {
  PENDING_FIRST: "미완료 우선",
  NAME: "이름순",
  SCORE: "점수 낮은순",
  COMPLETED_AT: "완료 최신순",
};

const FILTER_LABELS: [TaskStatusFilter, string][] = [
  ["ALL", "전체"],
  ["ASSIGNED", "대기"],
  ["IN_PROGRESS", "진행 중"],
  ["DONE", "완료"],
];

/** 점수 정렬 키 — U1 scorePercent 우선, 없으면 scoreText 선두 숫자 폴백 */
export function taskScoreValue(t: StudyTaskDirectorRow): number | null {
  if (t.scorePercent != null) return t.scorePercent;
  if (t.scoreText) {
    const n = parseFloat(t.scoreText);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function applyTaskFilters(
  tasks: StudyTaskDirectorRow[],
  filter: TaskStatusFilter,
  query: string,
): StudyTaskDirectorRow[] {
  const q = query.trim().toLowerCase();
  return tasks.filter((t) => {
    if (filter !== "ALL" && t.liveStatus !== filter) return false;
    if (!q) return true;
    return (
      t.studentName.toLowerCase().includes(q) ||
      t.studentCode.toLowerCase().includes(q)
    );
  });
}

/** 미완료 우선 랭크 — 기한 지남 → 대기 → 진행 → 완료 */
function pendingRank(t: StudyTaskDirectorRow): number {
  if (t.overdue && t.liveStatus !== "DONE") return 0;
  if (t.liveStatus === "ASSIGNED") return 1;
  if (t.liveStatus === "IN_PROGRESS") return 2;
  return 3;
}

export function sortTaskRows(
  rows: StudyTaskDirectorRow[],
  sort: TaskSortKey,
): StudyTaskDirectorRow[] {
  const sorted = [...rows];
  if (sort === "NAME") {
    sorted.sort((a, b) => a.studentName.localeCompare(b.studentName, "ko"));
  } else if (sort === "SCORE") {
    // 낮은 점수 우선(취약 학생 먼저) — 미채점(null)은 뒤로
    sorted.sort((a, b) => {
      const av = taskScoreValue(a) ?? Infinity;
      const bv = taskScoreValue(b) ?? Infinity;
      if (av !== bv) return av - bv;
      return a.studentName.localeCompare(b.studentName, "ko");
    });
  } else if (sort === "COMPLETED_AT") {
    sorted.sort((a, b) => {
      const av = a.completedAt ? new Date(a.completedAt).getTime() : -Infinity;
      const bv = b.completedAt ? new Date(b.completedAt).getTime() : -Infinity;
      if (av !== bv) return bv - av;
      return a.studentName.localeCompare(b.studentName, "ko");
    });
  } else {
    sorted.sort((a, b) => {
      const ar = pendingRank(a);
      const br = pendingRank(b);
      if (ar !== br) return ar - br;
      return a.studentName.localeCompare(b.studentName, "ko");
    });
  }
  return sorted;
}

/** "7월 14일(월) 23:59" — 서울(UTC+9) 고정, 리마인드 안내문용 */
function fmtRemindDue(iso: string): string {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")}월 ${get("day")}일(${get("weekday")}) ${get("hour")}:${get("minute")}`;
}

function fmtCell(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(t: StudyTaskDirectorRow): string {
  if (t.overdue && t.liveStatus !== "DONE") return "기한 지남";
  if (t.liveStatus === "DONE") return "완료";
  if (t.liveStatus === "IN_PROGRESS") return "진행 중";
  return "대기";
}

async function copyText(text: string, successMsg: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMsg);
  } catch {
    toast.error("복사에 실패했습니다. 다시 시도해 주세요.");
  }
}

export function TaskTableToolbar({
  kind,
  title,
  dueAt,
  tasks,
  visibleTasks,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  query,
  onQueryChange,
}: {
  kind: StudyAssignmentKind;
  /** 리마인드 안내문의 과제 제목·마감 */
  title: string;
  dueAt: string | null;
  /** 전체 태스크 — 카운트·리마인드 대상 계산용 */
  tasks: StudyTaskDirectorRow[];
  /** 현재 필터·정렬 적용분 — TSV 표 복사 범위 */
  visibleTasks: StudyTaskDirectorRow[];
  filter: TaskStatusFilter;
  onFilterChange: (v: TaskStatusFilter) => void;
  sort: TaskSortKey;
  onSortChange: (v: TaskSortKey) => void;
  query: string;
  onQueryChange: (v: string) => void;
}) {
  const pending = tasks.filter((t) => t.liveStatus !== "DONE");

  const countOf = (key: TaskStatusFilter) =>
    key === "ALL" ? tasks.length : tasks.filter((t) => t.liveStatus === key).length;

  // 리마인드 안내문 — 학생 대면 문구는 합니다체. EXAM 은 학생별 응시 링크 줄.
  const copyRemind = () => {
    const header =
      `[과제 안내] "${title}" 과제가 아직 완료되지 않았습니다.` +
      (dueAt ? ` ${fmtRemindDue(dueAt)}까지 제출 바랍니다.` : "");
    const body =
      kind === "EXAM"
        ? pending
            .map((t) =>
              t.tokenPath
                ? `${t.studentName}: ${window.location.origin}${t.tokenPath}`
                : t.studentName,
            )
            .join("\n")
        : `대상: ${pending.map((t) => t.studentName).join(", ")} (${pending.length}명)`;
    void copyText(`${header}\n\n${body}`, `리마인드 안내문을 복사했습니다. (${pending.length}명)`);
  };

  const copyRoster = () => {
    void copyText(
      pending.map((t) => t.studentName).join(", "),
      `미완료 학생 ${pending.length}명 명단을 복사했습니다.`,
    );
  };

  // 현재 필터·정렬 적용분만 TSV 로 — 복사 범위를 토스트에 명시한다.
  const copyTsv = () => {
    const head = ["학생", "학년", "학번", "상태", "점수", "시작", "완료"].join("\t");
    const lines = visibleTasks.map((t) =>
      [
        t.studentName,
        t.grade > 0 ? `${t.grade}학년` : "",
        t.studentCode,
        statusLabel(t),
        t.scoreText ?? "",
        fmtCell(t.startedAt),
        fmtCell(t.completedAt),
      ].join("\t"),
    );
    void copyText(
      [head, ...lines].join("\n"),
      `현재 필터가 적용된 ${visibleTasks.length}명을 표로 복사했습니다.`,
    );
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTER_LABELS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onFilterChange(key)}
            aria-pressed={filter === key}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11.5px] font-semibold transition-colors",
              filter === key
                ? "border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm"
                : "border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600",
            )}
          >
            {label}
            <span className="tabular-nums">{countOf(key)}</span>
          </button>
        ))}
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as TaskSortKey)}
          aria-label="정렬 기준"
          className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-[11.5px] font-medium text-slate-600 outline-none focus:border-blue-400"
        >
          {(Object.keys(SORT_LABELS) as TaskSortKey[]).map((key) => (
            <option key={key} value={key}>
              {SORT_LABELS[key]}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="이름 검색"
          aria-label="학생 이름 검색"
          className="h-7 w-40 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 outline-none placeholder:text-slate-300 focus:border-blue-400"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={copyRemind}
          disabled={pending.length === 0}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 text-[11.5px] font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-40"
        >
          <Megaphone className="size-3" aria-hidden />
          리마인드 복사 ({pending.length}명)
        </button>
        <button
          type="button"
          onClick={copyRoster}
          disabled={pending.length === 0}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40"
        >
          <ClipboardCopy className="size-3" aria-hidden />
          미완료 명단 복사
        </button>
        <button
          type="button"
          onClick={copyTsv}
          disabled={visibleTasks.length === 0}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40"
        >
          <Table2 className="size-3" aria-hidden />
          표 복사
        </button>
      </div>
    </div>
  );
}
