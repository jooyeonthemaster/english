"use client";

// 학생 상세 허브 — 과제 탭.
// 통합 과제(시험/학습지/문제/어법) + 직접 배포분 유니온 타임라인.
// 새 과제는 컴포저(이 학생 프리셀렉트)로, 취약 개념 프리셋 원클릭 지원.
// 행 드릴다운은 허브 이탈 없이: 과제 소속 → 상세 모달(허브 리프트),
// 직접 배포 EXAM → 응시 상세 모달, 직접 배포 GRAMMAR → 어법 탭.
//
// 2607 §4 — 「목록 | 달력」 두 뷰. 달력 뷰는 과제 달력 보드를 임베드하지 않고
// 프레젠테이션 컴포넌트 AssignmentsCalendar 만 재사용한다(보드는 syncUrl 이
// ?tab=tasks 를 지우고, 서버 재조회가 DIRECT 배포를 놓쳐 건수가 어긋난다).
// 달력·우측 목록은 **같은 filtered 배열**에서 나오므로 두 패널 모집단이 항상
// 일치하고, 월 이동은 로컬 setState 뿐이라 서버 왕복이 0이다.
//
// 스코프 규약(달력 뷰): 상태 칩 숫자와 우측 목록은 **표시 월**로 좁고, 달력
// 칩의 원천(calendarRows)만 전 기간이다(월을 넘겨도 그 달이 보여야 하므로).
// 우측 목록 헤더는 자기 스코프(월 또는 선택 날짜)를 라벨에 명시한다.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookA,
  BookOpenCheck,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  FileText,
  Link2,
  ListChecks,
  Plus,
  SpellCheck,
  Target,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { StatusPill, type PillTone } from "@/components/layout/page-frame";
import { SubmissionDetailModal } from "@/components/exams/exam-detail-client-parts/deployment-tab-parts/submission-detail-modal";
import { AssignmentsCalendar } from "@/components/study-assignments/assignments-calendar";
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
import {
  initialTaskMonth,
  taskDateKey,
  taskMonthKey,
  tasksToCalendarRows,
} from "@/lib/study-assignments/task-calendar";
import {
  CTA_LABELS,
  FILTER_COPY,
  TASK_PERIOD_AXIS_HINT,
  TASK_STATUS_LABELS,
  TASK_VIEW_LABELS,
} from "@/lib/wording/director-glossary";
import { CardEmpty, SegmentPills, TabEmpty, type SegmentPillOption } from "./analytics/kit";
import { cn, formatRelativeTime } from "@/lib/utils";

const KIND_ICON: Record<StudyAssignmentKind, typeof FileText> = {
  EXAM: FileText,
  WORKSHEET: BookOpenCheck,
  QUESTIONS: ListChecks,
  GRAMMAR: SpellCheck,
  VOCAB: BookA,
};

/** 상태 필터 — 헤더 퀵스탯 점프(student-hub-client)와 공유하는 controlled 축 */
export type StudentTaskFilter = "ALL" | "OPEN" | "OVERDUE" | "DONE";

/** 보기 축 — 상태·유형·기간 필터와 직교(어느 뷰든 같은 모집단을 본다) */
type TaskView = "list" | "calendar";

const VIEW_OPTIONS: readonly SegmentPillOption<TaskView>[] = [
  { value: "list", label: TASK_VIEW_LABELS.list },
  { value: "calendar", label: TASK_VIEW_LABELS.calendar },
];

// 라벨 의미 계약: 미완료(기한 내) + 기한 지남 + 완료 = 전체 (파티션).
// 칩 라벨이 그냥 「미완료」였을 때 헤더 퀵스탯 「미완료 과제 5건」(기한 지남 포함)과
// 같은 낱말이 한 화면에서 4와 5를 동시에 주장했다 — 축을 라벨에 박아 분리하고,
// 두 정의는 툴바 아래 산식 캡션(미완료 5 = 기한 내 4 + 기한 지남 1)이 화해시킨다.
const FILTERS: { key: StudentTaskFilter; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "OPEN", label: "미완료(기한 내)" },
  { key: "OVERDUE", label: TASK_STATUS_LABELS.OVERDUE },
  { key: "DONE", label: TASK_STATUS_LABELS.DONE },
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
  // 학습지는 중립 slate 라 비활성(테두리 있는 흰 칩)과 대비가 거의 없었다 — 한 단 진하게
  WORKSHEET: "border-slate-400 bg-slate-200 text-slate-800",
  QUESTIONS: "border-indigo-200 bg-indigo-50 text-indigo-700",
  GRAMMAR: "border-emerald-200 bg-emerald-50 text-emerald-700",
  VOCAB: "border-teal-200 bg-teal-50 text-teal-700",
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

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/**
 * "2026-07-25" → "7월 25일(토)". 키가 이미 서울 달력일이므로 UTC 자정으로
 * 해석해야 요일이 하루 어긋나지 않는다(로컬 파싱 금지).
 */
function seoulDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  return `${m}월 ${d}일(${WEEKDAY_LABELS[at.getUTCDay()]})`;
}

/** "2026-07" → "2026년 7월". 달력 뷰의 스코프를 우측 목록 헤더에 명시하는 데 쓴다 */
function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${y}년 ${m}월`;
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

/**
 * 상태 필 판정 — 기한 지남 > 완료 > 예약 > 진행 중 > 대기.
 *
 * 「예약」(availableFrom 미래 = 아직 학생에게 열리지 않음)은 개요 탭
 * (overview-tab.tsx:212-244)·과제 상세 모달과 같은 violet 신호를 쓴다. 이 분기가
 * 없던 동안 예약 배포가 「대기」로 보여 강사가 학생의 미착수로 오해했다.
 * 완료/기한 지남을 먼저 판정하는 이유: 예약 시각이 잘못 들어간 과제라도
 * 실제 수행 결과가 있으면 결과가 정본이다.
 *
 * `now` 를 인자로 받는 이유: 렌더 중 Date.now() 를 직접 부르면 판정 시점이
 * 비결정적이어서(무관한 리렌더에 필이 예고 없이 바뀜) 순수성이 깨진다.
 * 소비처가 60초 틱 상태를 주입한다.
 */
function statusPill(row: StudentStudyTaskRow, now: number) {
  if (row.overdue)
    return { tone: "rose" as PillTone, label: TASK_STATUS_LABELS.OVERDUE, pulse: false };
  if (row.liveStatus === "DONE")
    return { tone: "emerald" as PillTone, label: TASK_STATUS_LABELS.DONE, pulse: false };
  if (row.availableFrom && new Date(row.availableFrom).getTime() > now)
    return { tone: "violet" as PillTone, label: "예약", pulse: false };
  if (row.liveStatus === "IN_PROGRESS")
    return { tone: "blue" as PillTone, label: TASK_STATUS_LABELS.IN_PROGRESS, pulse: true };
  return { tone: "slate" as PillTone, label: TASK_STATUS_LABELS.ASSIGNED, pulse: false };
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
  /** 직접 배포 EXAM 드릴다운 — 응시 상세 모달(submissionId 자가로드) */
  const [reviewSubmissionId, setReviewSubmissionId] = useState<string | null>(null);
  /** 보기 축 — 로컬 상태(탭 언마운트 시 목록으로 초기화 허용, URL 오염 없음) */
  const [view, setView] = useState<TaskView>("list");
  /**
   * 달력 표시 월 — 초기값은 과제가 실제로 있는 달(빈 달 헛걸음 방지).
   * lazy 초기화라 tasks 가 바뀌어도 강사가 보던 달을 빼앗지 않는다.
   */
  const [month, setMonth] = useState<string>(() => initialTaskMonth(tasks));
  /** 달력에서 고른 날짜 "YYYY-MM-DD" — 우측 목록의 추가 필터 */
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  /**
   * 시각 기준선 — 기간 컷오프·예약 판정·D-day 가 모두 이 값을 쓴다.
   * 렌더 중 Date.now() 를 부르면 useMemo deps 에 시각이 없어 탭을 열어 둔 채
   * 자정을 넘겨도 칩 숫자가 갱신되지 않았다(칩↔목록 정합 계약 위반).
   */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // 유형·기간(assignedAt) 필터 선적용.
  const base = useMemo(() => {
    const cutoff = periodCutoff(period, now);
    return tasks.filter(
      (t) =>
        (!kindFilter || t.kind === kindFilter) &&
        (cutoff === 0 || new Date(t.assignedAt).getTime() >= cutoff),
    );
  }, [tasks, kindFilter, period, now]);

  // 달력 뷰에서는 **표시 월**이 모집단의 스코프다 — 칩 숫자·우측 목록·달력이
  // 한 달을 함께 말한다. 이전에는 8월로 넘겨도 칩과 우측 목록이 전 기간
  // 13건을 그대로 주장해 강사가 그것을 8월 건수로 읽었다.
  const countBase = useMemo(
    () => (view === "calendar" ? base.filter((t) => taskMonthKey(t) === month) : base),
    [base, view, month],
  );

  const counts = useMemo(() => {
    const open = countBase.filter((t) => t.liveStatus !== "DONE" && !t.overdue).length;
    const overdue = countBase.filter((t) => t.overdue).length;
    const done = countBase.filter((t) => t.liveStatus === "DONE").length;
    return { ALL: countBase.length, OPEN: open, OVERDUE: overdue, DONE: done };
  }, [countBase]);

  const filtered = useMemo(() => {
    if (filter === "OPEN") return base.filter((t) => t.liveStatus !== "DONE" && !t.overdue);
    if (filter === "OVERDUE") return base.filter((t) => t.overdue);
    if (filter === "DONE") return base.filter((t) => t.liveStatus === "DONE");
    return base;
  }, [base, filter]);

  // 달력 행 = 목록과 **같은** filtered 배열의 변환. 두 패널의 모집단이 갈라지면
  // 같은 화면에서 건수가 어긋나므로 다른 원천을 쓰지 않는다(2607 §4.3 정합 계약).
  // 월 스코프는 여기 걸지 않는다 — 걸면 다른 달로 넘겼을 때 달력이 텅 빈다.
  const calendarRows = useMemo(() => tasksToCalendarRows(filtered), [filtered]);

  // 우측 목록 = 표시 월(달력 뷰) → 선택 날짜 순으로 좁힌다.
  // 날짜축은 캘린더 버킷과 같은 taskDateKey/taskMonthKey 를 공유한다.
  const dayRows = useMemo(() => {
    const scoped =
      view === "calendar" ? filtered.filter((t) => taskMonthKey(t) === month) : filtered;
    return selectedDate ? scoped.filter((t) => taskDateKey(t) === selectedDate) : scoped;
  }, [filtered, view, month, selectedDate]);

  // 날짜 선택도 「필터」다 — 빠져 있던 탓에 날짜만 걸린 상태에서는 초기화
  // 버튼이 뜨지 않고, 초기화를 눌러도 날짜가 남아 목록이 계속 좁혀져 있었다.
  const hasActiveFilter =
    filter !== "ALL" || kindFilter !== null || period !== "ALL" || selectedDate !== null;
  const resetFilters = () => {
    onFilterChange("ALL");
    setKindFilter(null);
    setPeriod("ALL");
    setSelectedDate(null);
  };

  // 헤더 퀵스탯 「미완료 과제 N건」(기한 지남 포함)과 칩 「미완료(기한 내)」를
  // 한 산식으로 잇는 캡션 데이터. 달력 뷰는 월 스코프이므로 스코프도 명시한다.
  const pendingTotal = counts.OPEN + counts.OVERDUE;
  const countScopeNote =
    view === "calendar"
      ? `${monthLabel(month)} · `
      : kindFilter !== null || period !== "ALL"
        ? "현재 필터 기준 · "
        : "";

  const openComposer = (preset: ComposerPreset | null) => {
    setComposerPreset(preset);
    setComposerOpen(true);
  };

  /**
   * 과제 행 렌더러 — 목록 뷰와 달력 뷰 우측 패널이 **공유**한다.
   * 두 벌로 복제하면 상태 필·D-day·링크 복사 규칙이 갈라지므로 단일 함수로 둔다.
   */
  const renderTaskRow = (row: StudentStudyTaskRow) => {
    const Icon = KIND_ICON[row.kind];
    const pill = statusPill(row, now);
    // D-day 는 **미완료 행 전용**이다. 이전에는 overdue 만 억제해, 완료 과제에
    // 「D+14」(연체 신호)가 붙고 정작 기한 지남 행에는 D-day 가 없는 신호 역전이
    // 있었다. 이제 완료 행은 날짜만, 기한 지남 행은 rose D+N 을 보여 우측 열만
    // 훑어도 연체가 읽힌다. 「마감 없음」 폴백은 dueAt null 행 전용(M-2).
    const dday =
      row.dueAt && row.liveStatus !== "DONE"
        ? dDayLabel(seoulDayDiff(new Date(now), new Date(row.dueAt)))
        : null;
    // 행 드릴다운 대상 결정 — 과제 소속 > 직접 EXAM(응시 상세 모달) >
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
    return (
      <li key={row.taskId}>
        {/* 행 전체가 버튼이면 내부 보조 액션(링크 복사)이 중첩 버튼이 되므로
            role="button" div + 키보드 핸들러로 드릴다운을 건다. */}
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
            {/* 보조 메타는 12px·slate-500 하한 — 11.5px/slate-400 은 스펙 타이포
                하한(§1.1)과 명도대비 4.5:1 을 동시에 밑돌았다 */}
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-slate-500">
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
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[12px] font-bold tabular-nums",
                  // 연체는 상태 필(rose)과 같은 색으로 — 우측 열 단독 스캔에서도
                  // 경고가 전달되게 한다
                  row.overdue ? "text-rose-600" : "text-slate-600",
                )}
              >
                <CalendarClock className="size-3.5" aria-hidden />
                {dday}
              </span>
            ) : !row.dueAt ? (
              <span className="text-[12px] text-slate-500">마감 없음</span>
            ) : null}
            {row.dueAt ? (
              <span className="text-[12px] text-slate-500">
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
          {/* 드릴다운 어포던스 — hover 로만 갈리면 터치 기기에서 발견성이 0이다.
              같은 허브의 실시간 학습 피드 행과 동일한 상시 셰브런으로 맞춘다 */}
          {onRowClick ? (
            <ChevronRight className="size-4 shrink-0 text-slate-300" aria-hidden />
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* 보기 전환 — 상태 칩과 같은 행 왼쪽. 세로 구분선으로 축이 다름을 알린다 */}
          <SegmentPills
            options={VIEW_OPTIONS}
            value={view}
            onChange={(next) => {
              setView(next);
              // 목록 뷰에는 날짜축이 없다 — 숨은 날짜 선택을 남기지 않는다.
              if (next === "list") setSelectedDate(null);
            }}
            ariaLabel="과제 보기 전환"
          />
          <span className="hidden h-5 w-px bg-slate-200 sm:block" aria-hidden />
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
              // 비활성에도 테두리·배경을 준다 — 테두리 없는 회색 텍스트일 때
              // 옆의 정적 캡션과 구분되지 않아 필터인 줄 모른다
              "h-7 rounded-full border px-2.5 text-[12px] font-medium transition-colors",
              kindFilter === kind
                ? KIND_CHIP_ACTIVE[kind]
                : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700",
            )}
          >
            {STUDY_KIND_META[kind].label}
          </button>
        ))}
        {/* 기간 축은 마감이 아니라 배포일(assignedAt) — 캡션으로 명시하지 않으면
            "최근 7일"을 마감 기준으로 오해한다. 활성 시 blue 보더로 표시 */}
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as PeriodFilter)}
          aria-label="배포 기간 필터"
          className={cn(
            "ml-1 h-7 rounded-md border bg-white px-2 text-[12px] font-medium outline-none focus:border-blue-400",
            period === "ALL"
              ? "border-slate-200 text-slate-600"
              : "border-blue-400 text-blue-700",
          )}
        >
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        {/* 축 표기를 「기간 필터」에 묶는다 — 그냥 「배포일 기준」이면 바로 아래
            달력(마감일 축)의 설명으로 오독된다 */}
        <span className="text-[12px] text-slate-500">
          기간 필터 · {TASK_PERIOD_AXIS_HINT}
        </span>
        {/* 초기화는 빈 상태 안에만 두면 결과가 1건이라도 있을 때 빠져나갈 길이
            없다 — 활성 필터가 있으면 툴바에 항상 노출한다(2607 §4.4) */}
        {hasActiveFilter ? (
          <button
            type="button"
            onClick={resetFilters}
            className="ml-auto inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-blue-600 transition-colors hover:bg-blue-50"
          >
            <X className="size-3" aria-hidden />
            {FILTER_COPY.TITLE} {FILTER_COPY.RESET}
          </button>
        ) : null}
      </div>

      {/* 「미완료」 두 정의(헤더 퀵스탯 = 기한 지남 포함 / 칩 = 기한 내)를 한 줄
          산식으로 화해시킨다 — 퀵스탯을 눌러 ALL 로 착지해도 5가 어디서 온
          숫자인지 이 캡션만 읽으면 안다 */}
      {tasks.length > 0 && pendingTotal > 0 ? (
        <p className="text-[12px] text-slate-500">
          {countScopeNote}미완료 과제 {pendingTotal}건 = 미완료(기한 내){" "}
          {counts.OPEN} + {TASK_STATUS_LABELS.OVERDUE} {counts.OVERDUE}
        </p>
      ) : null}

      {tasks.length === 0 ? (
        /* 배포 이력 자체가 없는 빈 상태 — 빈 상태 규범 2종(TabEmpty/CardEmpty)의
           TabEmpty. 빈 달력을 띄워도 볼 것이 없으므로 뷰와 무관하게 우선한다 */
        <TabEmpty
          icon={ClipboardList}
          title="아직 배포한 과제가 없습니다."
          description="시험지·학습지·문제 세트·어법 훈련을 이 학생에게 배포하면 진행 상황이 여기에 모입니다."
          cta={
            <button
              type="button"
              onClick={() => openComposer(null)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-blue-700"
            >
              <Plus className="size-3.5" aria-hidden />
              {CTA_LABELS.NEW_TASK}
            </button>
          }
        />
      ) : view === "calendar" ? (
        /* 달력 뷰 — 좌 캘린더 / 우 목록. lg 에서만 두 패널 높이를 묶어 나란히
           세우고, 목록은 그 안에서만 스크롤한다(페이지 스크롤 오염 방지).
           높이를 620→560 으로 낮춘 이유: 상단 빈 주가 auto-rows-fr 로 같은 높이를
           배분받아 좌측은 비고 우측은 스크롤 밖으로 밀리는 불균형이 있었다.
           lg 미만은 1열로 쌓이며 높이 제약 없이 자연 흐른다 */
        <div className="grid grid-cols-1 gap-4 lg:h-[560px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-stretch">
          <div className="flex min-h-0 flex-col gap-1.5">
            <div className="min-h-0 flex-1">
              <AssignmentsCalendar
                month={month}
                rows={calendarRows}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                onMonthChange={(next) => {
                  // 데이터는 이미 전부 prop 으로 와 있다 — 표시 월만 옮기고 서버는 부르지 않는다.
                  setMonth(next);
                  // 다른 달로 넘어가면 이전 달의 날짜 선택은 빈 목록만 남긴다 — 함께 해제.
                  setSelectedDate(null);
                }}
              />
            </div>
            {/* 달력 축 고지 — 툴바의 「기간 필터 · 배포일 기준」과 축이 다르다.
                이 캡션이 없으면 강사가 달력을 배포일 달력으로 읽는다 */}
            <p className="shrink-0 text-[12px] text-slate-500">
              달력은 마감일 기준 · 마감 없는 과제는 시작일에 표시
            </p>
          </div>
          {/* 우측 목록도 카드 프레임으로 감싸 캘린더와 높이·격을 맞춘다.
              하단 페이드(after)로 스크롤 가능함을 알린다 — 마지막 행이 경계에서
              잘린 것이 유일한 신호이던 결함 */}
          <div className="relative flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-6 after:bg-gradient-to-t after:from-white after:to-transparent">
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-3 py-2.5">
              {/* 스코프를 라벨에 박는다 — 「과제 13건」만 있으면 8월 달력 옆에서
                  8월 건수로 읽힌다 */}
              <span className="text-[13px] font-semibold text-slate-700">
                {selectedDate ? seoulDateLabel(selectedDate) : monthLabel(month)} 과제{" "}
                {dayRows.length}건
              </span>
              {selectedDate ? (
                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  aria-label={`${seoulDateLabel(selectedDate)} 선택 해제`}
                  className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11.5px] font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                >
                  {seoulDateLabel(selectedDate)}
                  <X className="size-3 shrink-0" aria-hidden />
                </button>
              ) : null}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-6">
              {dayRows.length === 0 ? (
                /* 0건의 원인을 날짜/월로 구분한다 — 「조건에 맞는 과제가
                   없습니다」 하나면 사용자가 필터를 의심하며 툴바를 뒤진다 */
                <div className="flex flex-col items-center gap-1">
                  <CardEmpty
                    text={
                      selectedDate
                        ? `${seoulDateLabel(selectedDate)}에 해당하는 과제가 없습니다.`
                        : `${monthLabel(month)}에 해당하는 과제가 없습니다.`
                    }
                  />
                  <button
                    type="button"
                    onClick={() => (selectedDate ? setSelectedDate(null) : setView("list"))}
                    className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-blue-600 transition-colors hover:bg-blue-50"
                  >
                    {selectedDate ? `${monthLabel(month)} 전체 보기` : "전체 기간 목록 보기"}
                  </button>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">{dayRows.map(renderTaskRow)}</ul>
              )}
            </div>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        /* 필터 결과 0건 — 빈 상태 규범 2종 중 CardEmpty(초기화 버튼은 툴바에
           상시 노출되므로 여기서 CTA 를 중복하지 않는다, 2607 §4.4) */
        <CardEmpty text="조건에 맞는 과제가 없습니다." />
      ) : (
        /* 전폭 1열이면 제목과 마감일 사이가 1000px 넘게 비어 시선이 화면을
           가로지른다 — 분석 그리드 골격(lg:grid-cols-2)과 같은 2열로 밀도를 맞춘다 */
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">{filtered.map(renderTaskRow)}</ul>
      )}

      <AssignmentComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        preset={composerPreset}
        defaultStudentIds={[studentId]}
        onCreated={() => router.refresh()}
      />

      {/* 직접 배포 EXAM 답안 검토 — 응시 상세 와이드 모달 재사용(신규 렌더러 금지).
          구 ReviewDrawer(640px Sheet)의 후계로 props 계약은 동일하다 */}
      <SubmissionDetailModal
        submissionId={reviewSubmissionId}
        onClose={() => setReviewSubmissionId(null)}
        onMutated={() => router.refresh()}
      />
    </div>
  );
}
