"use client";

// 학생 상세 허브 — 과제 탭.
// 통합 과제(시험/학습지/문제/어법) + 직접 배포분 유니온 타임라인.
// 새 과제는 컴포저(이 학생 프리셀렉트)로, 취약 개념 프리셋 원클릭 지원.
// 행 드릴다운은 허브 이탈 없이: 과제 소속 → 상세 모달(허브 리프트),
// 직접 배포 EXAM → 채점 검토 드로어, 직접 배포 GRAMMAR → 어법 탭.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenCheck,
  CalendarClock,
  ClipboardList,
  FileText,
  Link2,
  ListChecks,
  Plus,
  SpellCheck,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { StatusPill, type PillTone } from "@/components/layout/page-frame";
import { ReviewDrawer } from "@/components/exams/exam-detail-client-parts/deployment-tab-parts/review-drawer";
import {
  AssignmentComposer,
  type ComposerPreset,
} from "@/components/study-assignments/assignment-composer";
import type { WeakConceptPreset } from "@/components/study-assignments/composer-grammar-spec";
import type { WeakSpot } from "@/lib/student-analytics/types";
import type {
  StudentStudyTaskRow,
  StudyAssignmentKind,
} from "@/lib/study-assignments/types";
import { STUDY_KIND_META } from "@/lib/study-assignments/types";
import { dDayLabel, seoulDayDiff } from "@/lib/study-assignments/status";
import { CTA_LABELS } from "@/lib/wording/director-glossary";
import { cn, formatRelativeTime } from "@/lib/utils";

const KIND_ICON: Record<StudyAssignmentKind, typeof FileText> = {
  EXAM: FileText,
  WORKSHEET: BookOpenCheck,
  QUESTIONS: ListChecks,
  GRAMMAR: SpellCheck,
};

/** 상태 필터 — 헤더 퀵스탯 점프(student-hub-client)와 공유하는 controlled 축 */
export type StudentTaskFilter = "ALL" | "OPEN" | "OVERDUE" | "DONE";

// 라벨 의미 계약: 미완료(기한 내) + 기한 지남 + 완료 = 전체 (파티션 — 헤더
// 퀵스탯 "미완료 과제"는 기한 지남 포함이므로 별도 축).
const FILTERS: { key: StudentTaskFilter; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "OPEN", label: "미완료" },
  { key: "OVERDUE", label: "기한 지남" },
  { key: "DONE", label: "완료" },
];

type PeriodFilter = "ALL" | "7D" | "30D" | "MONTH";

const PERIOD_OPTIONS: { key: PeriodFilter; label: string }[] = [
  { key: "ALL", label: "전체 기간" },
  { key: "7D", label: "최근 7일" },
  { key: "30D", label: "최근 30일" },
  { key: "MONTH", label: "이번 달" },
];

// 유형 칩 활성 톤 — 정본 STUDY_KIND_META tone 의 3톤 필(완성 문자열만)
const KIND_CHIP_ACTIVE: Record<StudyAssignmentKind, string> = {
  EXAM: "border-blue-200 bg-blue-50 text-blue-700",
  WORKSHEET: "border-slate-300 bg-slate-100 text-slate-600",
  QUESTIONS: "border-indigo-200 bg-indigo-50 text-indigo-700",
  GRAMMAR: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

/** 기간 필터 하한(ms epoch) — "이번 달"은 Asia/Seoul 달력월 1일 00:00 고정 해석 */
function periodCutoff(period: PeriodFilter, now: number): number {
  if (period === "7D") return now - 7 * 86_400_000;
  if (period === "30D") return now - 30 * 86_400_000;
  if (period === "MONTH") {
    const SEOUL_MS = 9 * 3_600_000;
    const seoul = new Date(now + SEOUL_MS);
    return Date.UTC(seoul.getUTCFullYear(), seoul.getUTCMonth(), 1) - SEOUL_MS;
  }
  return 0;
}

/** EXAM 응시 링크 복사 — 행 클릭(드릴다운)과 분리된 보조 액션 */
async function copyTakeLink(tokenPath: string) {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}${tokenPath}`);
    toast.success("응시 링크를 복사했습니다.");
  } catch {
    toast.error("복사하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}

/**
 * 취약 프리셋 → WeakSpot 사상(M-3) — 어법 랭킹 행 진입(A-4 openDeployComposer,
 * §D2-2 매핑표 「conceptIds:[해당], count 10」)과 동형. 컨텍스트 스트립
 * (analysisSeed) 데이터원 — 계약은 lib/student-analytics/types 정본.
 */
function toConceptSpots(weak: WeakConceptPreset[]): WeakSpot[] {
  return weak.map((w) => ({
    domain: "grammar",
    axis: "concept",
    key: w.conceptId,
    label: w.title,
    metric: { kind: "mastery", value: w.score },
    evidence: { attempts: w.attempts ?? 0, wrong: w.wrongCount ?? w.wrong ?? 0 },
    deploy: {
      kind: "GRAMMAR",
      grammarSpec: { conceptIds: [w.conceptId], count: 10 },
      weakConcepts: [w],
    },
  }));
}

function statusPill(row: StudentStudyTaskRow) {
  if (row.overdue) return { tone: "rose" as PillTone, label: "기한 지남", pulse: false };
  if (row.liveStatus === "DONE")
    return { tone: "emerald" as PillTone, label: "완료", pulse: false };
  if (row.liveStatus === "IN_PROGRESS")
    return { tone: "blue" as PillTone, label: "진행 중", pulse: true };
  return { tone: "slate" as PillTone, label: "대기", pulse: false };
}

export function StudentTasksTab({
  studentId,
  tasks,
  weakConcepts,
  filter,
  onFilterChange,
  onOpenAssignment,
  onGoTab,
}: {
  studentId: string;
  tasks: StudentStudyTaskRow[];
  weakConcepts: WeakConceptPreset[];
  /** 상태 필터 — 허브로 리프트(헤더 퀵스탯 점프가 세팅) */
  filter: StudentTaskFilter;
  onFilterChange: (filter: StudentTaskFilter) => void;
  /** 과제 소속 행 클릭 — 허브 리프트된 과제 상세 모달 오픈 */
  onOpenAssignment: (assignmentId: string) => void;
  /** 직접 배포 GRAMMAR 행 클릭 — 어법 훈련 탭 이동 */
  onGoTab: (tab: string) => void;
}) {
  const router = useRouter();
  const [kindFilter, setKindFilter] = useState<StudyAssignmentKind | null>(null);
  const [period, setPeriod] = useState<PeriodFilter>("ALL");
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerPreset, setComposerPreset] = useState<ComposerPreset | null>(null);
  /** 직접 배포 EXAM 드릴다운 — 기존 채점 검토 드로어(submissionId 자가로드) */
  const [reviewSubmissionId, setReviewSubmissionId] = useState<string | null>(null);

  // 유형·기간(assignedAt) 필터 선적용 — 상태 칩 카운트는 이 베이스 기준이라
  // 칩 숫자와 목록이 항상 정합한다.
  const base = useMemo(() => {
    const cutoff = periodCutoff(period, Date.now());
    return tasks.filter(
      (t) =>
        (!kindFilter || t.kind === kindFilter) &&
        (cutoff === 0 || new Date(t.assignedAt).getTime() >= cutoff),
    );
  }, [tasks, kindFilter, period]);

  const counts = useMemo(() => {
    const open = base.filter((t) => t.liveStatus !== "DONE" && !t.overdue).length;
    const overdue = base.filter((t) => t.overdue).length;
    const done = base.filter((t) => t.liveStatus === "DONE").length;
    return { ALL: base.length, OPEN: open, OVERDUE: overdue, DONE: done };
  }, [base]);

  const filtered = useMemo(() => {
    if (filter === "OPEN") return base.filter((t) => t.liveStatus !== "DONE" && !t.overdue);
    if (filter === "OVERDUE") return base.filter((t) => t.overdue);
    if (filter === "DONE") return base.filter((t) => t.liveStatus === "DONE");
    return base;
  }, [base, filter]);

  const hasActiveFilter = filter !== "ALL" || kindFilter !== null || period !== "ALL";
  const resetFilters = () => {
    onFilterChange("ALL");
    setKindFilter(null);
    setPeriod("ALL");
  };

  const openComposer = (preset: ComposerPreset | null) => {
    setComposerPreset(preset);
    setComposerOpen(true);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => onFilterChange(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                "h-8 rounded-md border px-3 text-[12.5px] font-semibold transition-colors",
                filter === f.key
                  ? "border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm"
                  : "border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600",
              )}
            >
              {f.label}
              <span className="ml-1 text-[11px] tabular-nums opacity-70">
                {counts[f.key]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {weakConcepts.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                // A-4 착지와 동형(M-3): 추천 개념을 conceptIds 로 프리체크하고
                // analysisSeed 를 동봉 — 전체 범위 어법 과제 오배포 경로 차단.
                openComposer({
                  kind: "GRAMMAR",
                  weakConcepts,
                  grammarSpec: {
                    count: 20,
                    conceptIds: weakConcepts.map((w) => w.conceptId),
                  },
                  analysisSeed: { spots: toConceptSpots(weakConcepts), source: "grammar" },
                })
              }
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 text-[12.5px] font-semibold text-rose-700 transition-colors hover:bg-rose-100"
            >
              <Target className="size-3.5" aria-hidden />
              {CTA_LABELS.SEND_WEAK_TASK}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => openComposer(null)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-blue-700"
          >
            <Plus className="size-3.5" aria-hidden />
            {CTA_LABELS.NEW_TASK}
          </button>
        </div>
      </div>

      {/* 유형(STUDY_KIND_META 정본)·기간(assignedAt) 필터 — 상태 축과 AND 결합 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(Object.keys(STUDY_KIND_META) as StudyAssignmentKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setKindFilter((prev) => (prev === kind ? null : kind))}
            aria-pressed={kindFilter === kind}
            className={cn(
              "h-7 rounded-full border px-2.5 text-[11.5px] font-medium transition-colors",
              kindFilter === kind
                ? KIND_CHIP_ACTIVE[kind]
                : "border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600",
            )}
          >
            {STUDY_KIND_META[kind].label}
          </button>
        ))}
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as PeriodFilter)}
          aria-label="배포 기간 필터"
          className="ml-1 h-7 rounded-md border border-slate-200 bg-white px-2 text-[11.5px] font-medium text-slate-600 outline-none focus:border-blue-400"
        >
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        tasks.length === 0 ? (
          /* 배포 이력 자체가 없는 빈 상태 — reports-tab 선례 미러(CTA 내장) */
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-14">
            <ClipboardList className="size-8 text-slate-300" aria-hidden />
            <p className="text-[13.5px] font-medium text-slate-500">
              아직 배포한 과제가 없습니다.
            </p>
            <p className="max-w-md text-center text-[12px] leading-relaxed text-slate-400">
              시험지·학습지·문제 세트·어법 훈련을 이 학생에게 배포하면 진행 상황이
              여기에 모입니다.
            </p>
            <button
              type="button"
              onClick={() => openComposer(null)}
              className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-blue-700"
            >
              <Plus className="size-3.5" aria-hidden />
              {CTA_LABELS.NEW_TASK}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-12">
            <ClipboardList className="size-8 text-slate-300" aria-hidden />
            <p className="text-[13px] text-slate-400">조건에 맞는 과제가 없습니다.</p>
            {hasActiveFilter ? (
              <button
                type="button"
                onClick={resetFilters}
                className="text-[12.5px] font-semibold text-blue-600 transition-colors hover:text-blue-700"
              >
                필터 초기화
              </button>
            ) : null}
          </div>
        )
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((row) => {
            const Icon = KIND_ICON[row.kind];
            const pill = statusPill(row);
            // 기한 지남이면 D-day 라벨 억제 — 상태 pill("기한 지남")이 정본 신호,
            // 우측은 날짜만 남긴다. 「마감 없음」 폴백은 dueAt null 행 전용(M-2).
            const dday =
              row.dueAt && !row.overdue
                ? dDayLabel(seoulDayDiff(new Date(), new Date(row.dueAt)))
                : null;
            // 행 드릴다운 대상 결정 — 과제 소속 > 직접 EXAM(검토 드로어) >
            // 직접 GRAMMAR(어법 탭). 그 외(원본 유실 등)는 클릭 없음.
            const { assignmentId, examSubmissionId } = row;
            const onRowClick =
              assignmentId != null
                ? () => onOpenAssignment(assignmentId)
                : row.kind === "EXAM" && examSubmissionId != null
                  ? () => setReviewSubmissionId(examSubmissionId)
                  : row.kind === "GRAMMAR"
                    ? () => onGoTab("grammar")
                    : null;
            // 행 전체가 버튼이면 내부 보조 액션(링크 복사)이 중첩 버튼이 되므로
            // role="button" div + 키보드 핸들러로 드릴다운을 건다.
            const inner = (
              <div
                role={onRowClick ? "button" : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ?? undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        // 내부 요소(링크 복사 버튼 등)에서 버블링된 키 이벤트는
                        // 드릴다운으로 처리하지 않는다 — 행 자체 포커스일 때만.
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick();
                        }
                      }
                    : undefined
                }
                className={cn(
                  "flex items-center gap-3 rounded-lg border bg-white p-3 transition-colors",
                  onRowClick
                    ? "cursor-pointer border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                    : "border-slate-200",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg ring-1",
                    // 유형색 정본 = STUDY_KIND_META (학습지는 slate 중립)
                    row.kind === "EXAM" && "bg-blue-50 text-blue-600 ring-blue-100",
                    row.kind === "WORKSHEET" && "bg-slate-100 text-slate-600 ring-slate-200",
                    row.kind === "QUESTIONS" && "bg-indigo-50 text-indigo-600 ring-indigo-100",
                    row.kind === "GRAMMAR" && "bg-emerald-50 text-emerald-600 ring-emerald-100",
                  )}
                >
                  <Icon className="size-4.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13.5px] font-semibold text-slate-800">
                      {row.title}
                    </span>
                    <StatusPill tone={pill.tone} pulse={pill.pulse}>
                      {pill.label}
                    </StatusPill>
                    {row.source === "DIRECT" ? (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-400">
                        직접 배포
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] text-slate-400">
                    <span>{STUDY_KIND_META[row.kind].label}</span>
                    <span>배포 {formatRelativeTime(row.assignedAt)}</span>
                    {row.progressText ? <span>{row.progressText}</span> : null}
                    {row.scoreText ? (
                      <span className="font-semibold text-slate-600">{row.scoreText}</span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {dday ? (
                    <span className="inline-flex items-center gap-1 text-[12px] font-bold tabular-nums text-slate-600">
                      <CalendarClock className="size-3.5" aria-hidden />
                      {dday}
                    </span>
                  ) : !row.dueAt ? (
                    <span className="text-[11px] text-slate-300">마감 없음</span>
                  ) : null}
                  {row.dueAt ? (
                    <span className="text-[10.5px] text-slate-300">
                      {new Date(row.dueAt).toLocaleDateString("ko-KR", {
                        month: "numeric",
                        day: "numeric",
                        weekday: "short",
                      })}
                    </span>
                  ) : null}
                  {/* EXAM 미완료 — 응시 링크 복사(행 드릴다운과 분리, U1 tokenPath) */}
                  {row.kind === "EXAM" && row.liveStatus !== "DONE" && row.tokenPath ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void copyTakeLink(row.tokenPath as string);
                      }}
                      title="응시 링크 복사"
                      className="inline-flex h-6 items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-blue-600"
                    >
                      <Link2 className="size-3" aria-hidden />
                      링크
                    </button>
                  ) : null}
                </div>
              </div>
            );
            return <li key={row.taskId}>{inner}</li>;
          })}
        </ul>
      )}

      <AssignmentComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        preset={composerPreset}
        defaultStudentIds={[studentId]}
        onCreated={() => router.refresh()}
      />

      {/* 직접 배포 EXAM 답안 검토 — 기존 채점 검토 드로어 재사용(신규 렌더러 금지) */}
      <ReviewDrawer
        submissionId={reviewSubmissionId}
        onClose={() => setReviewSubmissionId(null)}
        onMutated={() => router.refresh()}
      />
    </div>
  );
}
