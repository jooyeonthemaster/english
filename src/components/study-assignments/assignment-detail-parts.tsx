"use client";

// ============================================================================
// 과제 상세 모달 — 학생 행 드릴다운 파트 (assignment-detail-modal 전용 분리)
//
//  - TaskTable: 학생별 태스크 테이블. 상태 필터·정렬·이름 검색 툴바
//    (./task-table-toolbar)를 로컬 state 로 구동. EXAM 행 "답안 검토"
//    (ReviewDrawer 오픈은 부모 콜백), GRAMMAR 행 "훈련 기록" 링크, QUESTIONS
//    DONE 행 클릭 시 colSpan 확장 행으로 문항별 학생답 vs 정답 대조
//    (./task-responses-panel).
//  - TargetPopover: "대상" 메타 타일 클릭 → detail.targets 전체(CLASS/STUDENT 칩).
//  - GrammarSpecSummary · MetaTile · fmtDateTime: 모달에서 이관한 공용 파트.
// ============================================================================

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Copy,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { StatusPill, type PillTone } from "@/components/layout/page-frame";
import type {
  StudyAssignmentKind,
  StudyTargetSnapshot,
  StudyTaskDirectorRow,
  StudyTaskStatus,
} from "@/lib/study-assignments/types";
import { cn } from "@/lib/utils";
import { TaskResponsesPanel } from "./task-responses-panel";
import {
  applyTaskFilters,
  sortTaskRows,
  TaskTableToolbar,
  type TaskSortKey,
  type TaskStatusFilter,
} from "./task-table-toolbar";

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function taskPill(status: StudyTaskStatus, overdue: boolean) {
  if (overdue) return { tone: "rose" as PillTone, label: "기한 지남", pulse: false };
  if (status === "DONE") return { tone: "emerald" as PillTone, label: "완료", pulse: false };
  if (status === "IN_PROGRESS") return { tone: "blue" as PillTone, label: "진행 중", pulse: true };
  return { tone: "slate" as PillTone, label: "대기", pulse: false };
}

export function MetaTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-slate-200 bg-white px-3.5 py-3">
      <span className="text-[12px] font-medium text-slate-400">{label}</span>
      <div className="min-w-0 text-[14px] font-semibold text-slate-800">{children}</div>
    </div>
  );
}

/** GRAMMAR 과제의 출제 범위 요약 — spec payload 를 사람이 읽는 칩으로 */
export function GrammarSpecSummary({ payload }: { payload: unknown }) {
  const spec = (payload ?? {}) as {
    unitIds?: string[];
    conceptIds?: string[];
    itemTypes?: string[];
    difficulties?: number[];
    count?: number;
  };
  const rows: { label: string; values: string[] }[] = [
    { label: "문항 수", values: [`${spec.count ?? 0}문항`] },
    { label: "유닛", values: spec.unitIds?.length ? spec.unitIds : ["전체"] },
    { label: "세부 개념", values: spec.conceptIds?.length ? spec.conceptIds : ["유닛 전체"] },
    { label: "문항 유형", values: spec.itemTypes?.length ? spec.itemTypes : ["전체"] },
    {
      label: "난이도",
      values: spec.difficulties?.length
        ? spec.difficulties.map((d) => `D${d}`)
        : ["전체"],
    },
  ];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="mb-3 text-[12px] font-semibold text-slate-500">
        출제 범위
        <span className="ml-1.5 font-normal text-slate-400">
          — 이 조건에서 학생마다 보충 필요 우선 문항이 자동 편성됩니다
        </span>
      </p>
      <dl className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start gap-3">
            <dt className="w-16 shrink-0 pt-0.5 text-[11.5px] font-medium text-slate-400">
              {r.label}
            </dt>
            <dd className="flex flex-wrap gap-1.5">
              {r.values.map((v) => (
                <span
                  key={v}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11.5px] font-medium text-slate-600"
                >
                  {v}
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ── 대상 팝오버 — "요약만 보고 판단" 금지: 전체 대상을 그 자리에서 확인 ──────

export function TargetPopover({
  targets,
  summary,
}: {
  targets: StudyTargetSnapshot[];
  summary: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    // ESC 는 캡처 단계에서 가로채 팝오버만 닫는다 — WideModal 의 document
    // keydown(버블)까지 흘러가면 모달 전체가 함께 닫혀 버린다. 닫은 뒤
    // 트리거로 포커스 복귀.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, { capture: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [open]);

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="배포 대상 전체 보기"
        className="flex w-full min-w-0 items-center gap-1 text-left transition-colors hover:text-blue-700"
      >
        <span className="min-w-0 truncate">{summary}</span>
        {open ? (
          <ChevronUp className="size-3.5 shrink-0 text-slate-400" aria-hidden />
        ) : (
          <ChevronDown className="size-3.5 shrink-0 text-slate-400" aria-hidden />
        )}
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1.5 max-h-64 w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
          <p className="mb-2 text-[11px] font-semibold text-slate-400">
            배포 대상 전체 ({targets.length})
          </p>
          {targets.length === 0 ? (
            <p className="text-[12px] font-normal text-slate-400">
              대상 스냅샷이 없습니다.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {targets.map((t) => (
                <span
                  key={`${t.type}:${t.id}`}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    t.type === "CLASS"
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-slate-50 text-slate-600",
                  )}
                >
                  <span className="font-semibold">
                    {t.type === "CLASS" ? "반" : "학생"}
                  </span>
                  {t.name}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── 학생별 태스크 테이블 ─────────────────────────────────────────────────────

/** DONE 행 소요 시간 — 시작·완료가 모두 있을 때만("· 23분" sub) */
function elapsedText(t: StudyTaskDirectorRow): string | null {
  if (t.liveStatus !== "DONE" || !t.startedAt || !t.completedAt) return null;
  const ms = new Date(t.completedAt).getTime() - new Date(t.startedAt).getTime();
  if (ms <= 0) return null;
  const min = Math.round(ms / 60_000);
  if (min < 1) return "1분 미만";
  if (min >= 60) return `${Math.floor(min / 60)}시간 ${min % 60}분`;
  return `${min}분`;
}

export function TaskTable({
  kind,
  title,
  dueAt,
  examMode,
  tasks,
  questionIds,
  onOpenReview,
}: {
  kind: StudyAssignmentKind;
  /** 리마인드 안내문 조립용 — 과제 제목·마감 */
  title: string;
  dueAt: string | null;
  /** EXAM 응시 모드 — OMR 은 강사 일괄 입력이라 소요 시간 표시를 억제 */
  examMode?: "TABLET" | "OMR" | null;
  tasks: StudyTaskDirectorRow[];
  /** QUESTIONS 답안 대조용 — 그 외 kind 는 빈 배열 */
  questionIds: string[];
  /** EXAM: 채점 검토 드로어 오픈(부모가 ReviewDrawer 소유) */
  onOpenReview: (submissionId: string) => void;
}) {
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [filter, setFilter] = useState<TaskStatusFilter>("ALL");
  const [sort, setSort] = useState<TaskSortKey>("PENDING_FIRST");
  const [query, setQuery] = useState("");
  const hasTrailing = kind === "EXAM" || kind === "GRAMMAR" || kind === "QUESTIONS";
  const colCount = hasTrailing ? 6 : 5;

  const rows = useMemo(
    () => sortTaskRows(applyTaskFilters(tasks, filter, query), sort),
    [tasks, filter, query, sort],
  );

  // 필터·검색으로 확장 행이 목록에서 사라지면 접는다 — colSpan 잔상 방지
  useEffect(() => {
    if (expandedTaskId && !rows.some((r) => r.taskId === expandedTaskId)) {
      setExpandedTaskId(null);
    }
  }, [rows, expandedTaskId]);

  const copyTokenLink = async (tokenPath: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${tokenPath}`);
      toast.success("응시 링크를 복사했습니다. 학생에게 전달하세요.");
    } catch {
      toast.error("링크 복사에 실패했습니다. 다시 시도해 주세요.");
    }
  };

  const toggleExpand = (taskId: string) => {
    setExpandedTaskId((cur) => (cur === taskId ? null : taskId));
  };

  return (
    <div>
      <TaskTableToolbar
        kind={kind}
        title={title}
        dueAt={dueAt}
        tasks={tasks}
        visibleTasks={rows}
        filter={filter}
        onFilterChange={setFilter}
        sort={sort}
        onSortChange={setSort}
        query={query}
        onQueryChange={setQuery}
      />
      <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 text-[12px] text-slate-500">
            <th className="px-3 py-2 font-medium">학생</th>
            <th className="px-3 py-2 font-medium">상태</th>
            <th className="px-3 py-2 font-medium">점수</th>
            <th className="px-3 py-2 font-medium">시작</th>
            <th className="px-3 py-2 font-medium">완료</th>
            {kind === "EXAM" ? (
              <th className="px-3 py-2 font-medium">응시 링크 · 검토</th>
            ) : kind === "GRAMMAR" ? (
              <th className="px-3 py-2 font-medium">훈련 기록</th>
            ) : kind === "QUESTIONS" ? (
              <th className="px-3 py-2 font-medium">답안 대조</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const pill = taskPill(t.liveStatus, t.overdue);
            // OMR 은 강사가 일괄 입력 — 시작~완료 간격이 응시 시간이 아니다
            const elapsed =
              kind === "EXAM" && examMode === "OMR" ? null : elapsedText(t);
            const expandable =
              kind === "QUESTIONS" && t.liveStatus === "DONE" && t.hasResponses;
            const expanded = expandedTaskId === t.taskId;
            return (
              <Fragment key={t.taskId}>
                <tr
                  onClick={expandable ? () => toggleExpand(t.taskId) : undefined}
                  className={cn(
                    "border-b border-slate-50 text-[13px] text-slate-700 transition-colors last:border-0 hover:bg-blue-50/40",
                    expandable && "cursor-pointer",
                    expanded && "bg-blue-50/40",
                  )}
                >
                  <td className="px-3 py-2">
                    {/* 학생 허브 과제 탭으로 — 행 확장 클릭과 분리(stopPropagation) */}
                    <Link
                      href={`/director/students/${t.studentId}?tab=tasks`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-semibold text-slate-800 transition-colors hover:text-blue-700 hover:underline"
                    >
                      {t.studentName}
                    </Link>
                    <span className="ml-1.5 text-[11px] text-slate-400">
                      {t.grade > 0 ? `${t.grade}학년` : ""}
                      {t.studentCode ? ` · ${t.studentCode}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill tone={pill.tone} pulse={pill.pulse}>
                      {pill.label}
                    </StatusPill>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {t.scoreText ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-[12px] tabular-nums text-slate-500">
                    {fmtDateTime(t.startedAt)}
                  </td>
                  <td className="px-3 py-2 text-[12px] tabular-nums text-slate-500">
                    {fmtDateTime(t.completedAt)}
                    {elapsed ? (
                      <span className="ml-1 text-[11px] text-slate-400">· {elapsed}</span>
                    ) : null}
                  </td>
                  {kind === "EXAM" ? (
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {t.tokenPath ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (t.tokenPath) void copyTokenLink(t.tokenPath);
                            }}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                          >
                            <Copy className="size-3" aria-hidden />
                            복사
                          </button>
                        ) : null}
                        {t.examSubmissionId ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (t.examSubmissionId) onOpenReview(t.examSubmissionId);
                            }}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 text-[11.5px] font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                          >
                            <ClipboardCheck className="size-3" aria-hidden />
                            답안 검토
                          </button>
                        ) : null}
                        {!t.tokenPath && !t.examSubmissionId ? (
                          <span className="text-[11px] text-slate-300">링크 없음</span>
                        ) : null}
                      </div>
                    </td>
                  ) : kind === "GRAMMAR" ? (
                    <td className="px-3 py-2">
                      <Link
                        href={`/director/students/${t.studentId}?tab=grammar`}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                      >
                        <History className="size-3" aria-hidden />
                        훈련 기록
                      </Link>
                    </td>
                  ) : kind === "QUESTIONS" ? (
                    <td className="px-3 py-2">
                      {expandable ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(t.taskId);
                          }}
                          aria-expanded={expanded}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                        >
                          {expanded ? (
                            <ChevronUp className="size-3" aria-hidden />
                          ) : (
                            <ChevronDown className="size-3" aria-hidden />
                          )}
                          {expanded ? "접기" : "답안 보기"}
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-300">
                          {t.liveStatus === "DONE" ? "답안 없음" : "제출 전"}
                        </span>
                      )}
                    </td>
                  ) : null}
                </tr>
                {expanded ? (
                  <tr className="border-b border-slate-50 last:border-0">
                    <td colSpan={colCount} className="bg-slate-50/60 px-3 py-3">
                      <div role="region" aria-label={`${t.studentName} 답안 대조`}>
                        <TaskResponsesPanel taskId={t.taskId} questionIds={questionIds} />
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={colCount}
                className="px-3 py-8 text-center text-[12.5px] text-slate-400"
              >
                {tasks.length === 0
                  ? "배정된 학생이 없습니다."
                  : "조건에 맞는 학생이 없습니다."}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      </div>
    </div>
  );
}
