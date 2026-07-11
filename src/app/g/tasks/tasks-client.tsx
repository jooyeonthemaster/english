"use client";

// ============================================================================
// /g/tasks — 과제 타임라인 (gd 언어 · 모바일 퍼스트)
//
// GET /api/g/tasks 클라이언트 로드(스켈레톤·에러 재시도). 필터 세그먼트
// (해야 할 과제/완료) + kind 칩(AND 결합) + 그룹핑(기한 지남 → 오늘 마감 →
// 이번 주 → 나중에). 카드·빈 상태·스켈레톤은 ./task-card 참조.
// /t 응시 후 뒤로가기(bfcache)·탭 복귀의 stale 목록은 silent 재조회로
// 교체한다(30초 스로틀 — 과다 폴링 요금 사고 전례).
// GShell 배지는 fetch 결과의 미완료 수에서 파생.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GShell } from "@/components/grammar-drill/g-shell";
import type {
  StudentTaskCard,
  StudyAssignmentKind,
} from "@/lib/study-assignments/types";
import { STUDY_KIND_META } from "@/lib/study-assignments/types";
import {
  DueAlertBanner,
  EmptyState,
  ErrorCard,
  KIND_CHIP,
  Skeleton,
  TaskCard,
  diffUnseenResults,
  markResultsSeen,
  useMinuteNow,
} from "./task-card";

type Filter = "TODO" | "DONE";

type GroupKey = "OVERDUE" | "TODAY" | "WEEK" | "LATER";

const GROUP_META: Record<GroupKey, { label: string; rose?: boolean }> = {
  OVERDUE: { label: "기한 지남", rose: true },
  TODAY: { label: "오늘 마감" },
  WEEK: { label: "이번 주" },
  LATER: { label: "나중에 · 마감 없음" },
};

function groupOf(t: StudentTaskCard): GroupKey {
  if (t.overdue) return "OVERDUE";
  if (t.dDay === 0) return "TODAY";
  if (t.dDay !== null && t.dDay >= 1 && t.dDay <= 7) return "WEEK";
  return "LATER";
}

const KIND_ORDER: StudyAssignmentKind[] = [
  "EXAM",
  "WORKSHEET",
  "QUESTIONS",
  "GRAMMAR",
];

export function TasksClient({
  studentId,
  studentName,
  academyName,
  chatRemainingToday,
}: {
  /** "새 결과" localStorage 키 스코프 — 공용 태블릿 학생 전환 오점등 방지 */
  studentId: string;
  studentName: string;
  academyName: string;
  /** 햄버거 시트 "오늘 질문 N회" — 서버 조회 실패 시 undefined(행 생략) */
  chatRemainingToday?: number;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<StudentTaskCard[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("TODO");
  const [kindFilter, setKindFilter] = useState<StudyAssignmentKind | null>(null);
  const [newResultIds, setNewResultIds] = useState<Set<string>>(() => new Set());
  const lastLoadAtRef = useRef(0);
  const now = useMinuteNow();

  // silent 모드: setTasks(null) 없이 도착 시 교체 — 복귀 재조회가 화면을 비우지
  // 않게 한다. silent 실패는 기존 목록 유지(에러 화면 미전환).
  const load = useCallback(
    (opts?: { silent?: boolean }) => {
      lastLoadAtRef.current = Date.now();
      if (!opts?.silent) setFailed(false);
      fetch("/api/g/tasks")
        .then((r) => {
          if (r.status === 401) {
            router.replace("/g");
            return null;
          }
          return r.json();
        })
        .then((d) => {
          if (!d) return;
          if (d.ok && Array.isArray(d.tasks)) setTasks(d.tasks as StudentTaskCard[]);
          else if (!opts?.silent) setFailed(true);
        })
        .catch(() => {
          if (!opts?.silent) setFailed(true);
        });
    },
    [router],
  );

  useEffect(() => {
    load();
  }, [load]);

  // /t 응시 후 뒤로가기가 bfcache 복원으로 제출한 시험을 "대기"로 남기는 stale
  // 박멸 — pageshow(persisted)·visibilitychange(visible)에서 silent 재조회.
  // 최소 간격 30초 스로틀 필수(과다 폴링 요금 사고 전례).
  useEffect(() => {
    const refreshIfStale = () => {
      if (Date.now() - lastLoadAtRef.current < 30_000) return;
      load({ silent: true });
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) refreshIfStale();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshIfStale();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  const retry = () => {
    setTasks(null);
    load();
  };

  const todoAll = useMemo(
    () => (tasks ?? []).filter((t) => t.status !== "DONE"),
    [tasks],
  );
  // 완료 탭은 완료 시각 내림차순(U1 completedAt 직렬화 — 없으면 배포일 폴백)
  const doneAll = useMemo(
    () =>
      (tasks ?? [])
        .filter((t) => t.status === "DONE")
        .sort(
          (a, b) =>
            Date.parse(b.completedAt ?? b.assignedAt) -
            Date.parse(a.completedAt ?? a.assignedAt),
        ),
    [tasks],
  );
  const todo = useMemo(
    () => (kindFilter ? todoAll.filter((t) => t.kind === kindFilter) : todoAll),
    [todoAll, kindFilter],
  );
  const done = useMemo(
    () => (kindFilter ? doneAll.filter((t) => t.kind === kindFilter) : doneAll),
    [doneAll, kindFilter],
  );

  const groups = useMemo(() => {
    const map: Record<GroupKey, StudentTaskCard[]> = {
      OVERDUE: [],
      TODAY: [],
      WEEK: [],
      LATER: [],
    };
    for (const t of todo) map[groupOf(t)].push(t);
    return map;
  }, [todo]);

  // 헤더 요약·배너는 kind 필터 무관(전체 기준)
  const todayCount = useMemo(
    () => todoAll.filter((t) => t.dDay === 0 && !t.overdue).length,
    [todoAll],
  );
  const weekCount = useMemo(
    () => todoAll.filter((t) => t.dDay !== null && t.dDay >= 1 && t.dDay <= 7).length,
    [todoAll],
  );
  const overdueCount = useMemo(
    () => todoAll.filter((t) => t.overdue).length,
    [todoAll],
  );

  // 존재하는 kind 만 칩으로 — 1종이면 행 자체를 생략
  const kinds = useMemo(
    () => KIND_ORDER.filter((k) => (tasks ?? []).some((t) => t.kind === k)),
    [tasks],
  );

  // "새 결과" — 공개된 시험 결과 중 이 기기 미확인분(localStorage 표시 장치)
  const resultIds = useMemo(
    () => doneAll.filter((t) => t.kind === "EXAM" && t.scoreText).map((t) => t.taskId),
    [doneAll],
  );
  useEffect(() => {
    if (!tasks) return;
    setNewResultIds((prev) => {
      const next = diffUnseenResults(studentId, resultIds);
      // 세션 내 점등 유지 — silent 재조회·확인 기록 후에도 pill 은 남긴다
      for (const id of prev) next.add(id);
      return next;
    });
  }, [tasks, resultIds, studentId]);
  // 완료 탭을 연 시점에 확인한 것으로 기록(다음 방문부터 미점등)
  useEffect(() => {
    if (filter !== "DONE" || resultIds.length === 0) return;
    markResultsSeen(studentId, resultIds);
  }, [filter, resultIds, studentId]);

  const allDone = todoAll.length === 0 && doneAll.length > 0;

  return (
    <GShell
      studentName={studentName}
      academyName={academyName}
      tasksBadgeCount={tasks ? todoAll.length : undefined}
      chatRemainingToday={chatRemainingToday}
    >
      <div className="mx-auto max-w-md px-5 pb-6 pt-5">
        {/* ── 페이지 타이틀 + 요약 ── */}
        <header>
          <h1 className="gd-t-xl font-bold tracking-tight">과제</h1>
          <p className="gd-t-2xs mt-1" style={{ color: "var(--gd-ink-3)" }}>
            {tasks
              ? `오늘 마감 ${todayCount}건 · 이번 주 ${weekCount}건`
              : "선생님이 배포한 과제를 확인합니다"}
          </p>
        </header>

        {/* ── 기한지남/오늘마감 배너(셸 헤더 아래 sticky) ── */}
        {tasks ? (
          <div className="mt-3 empty:hidden">
            <DueAlertBanner overdueCount={overdueCount} todayCount={todayCount} sticky />
          </div>
        ) : null}

        {/* ── 필터 세그먼트 — 탭이 아닌 토글이므로 aria-pressed 로 상태 전달 ── */}
        <div
          className="mt-4 flex rounded-xl border p-1"
          style={{ borderColor: "var(--gd-line)", background: "var(--gd-card)" }}
          aria-label="과제 필터"
        >
          {(
            [
              ["TODO", "해야 할 과제", todo.length],
              ["DONE", "완료", done.length],
            ] as const
          ).map(([key, label, count]) => {
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(key)}
                className="gd-t-xs flex-1 rounded-lg py-2 font-semibold transition-colors"
                style={
                  active
                    ? { background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }
                    : { color: "var(--gd-ink-3)" }
                }
              >
                {label}
                {tasks ? (
                  <span className="gd-mono ml-1.5 opacity-80">{count}</span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* ── kind 필터 칩(존재하는 종류가 2개 이상일 때만·상태 필터와 AND) ── */}
        {kinds.length >= 2 ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <KindFilterChip
              label="전체"
              count={(filter === "TODO" ? todoAll : doneAll).length}
              active={kindFilter === null}
              tint={{ bg: "var(--gd-blue-soft)", fg: "var(--gd-blue)" }}
              onClick={() => setKindFilter(null)}
            />
            {kinds.map((k) => (
              <KindFilterChip
                key={k}
                label={STUDY_KIND_META[k].label}
                count={(filter === "TODO" ? todoAll : doneAll).filter((t) => t.kind === k).length}
                active={kindFilter === k}
                tint={KIND_CHIP[k]}
                onClick={() => setKindFilter((prev) => (prev === k ? null : k))}
              />
            ))}
          </div>
        ) : null}

        {/* ── 본문 ── */}
        <div className="mt-4">
          {failed ? (
            <ErrorCard onRetry={retry} />
          ) : !tasks ? (
            <Skeleton />
          ) : filter === "TODO" ? (
            todo.length === 0 ? (
              allDone && kindFilter === null ? (
                <EmptyState message="모든 과제를 마쳤습니다. 훌륭합니다." celebrate />
              ) : (
                <EmptyState
                  message="지금 해야 할 과제가 없습니다. 훈련 탭에서 자유 학습을 이어가 보세요."
                  showTrainLink
                />
              )
            ) : (
              (Object.keys(GROUP_META) as GroupKey[]).map((key) =>
                groups[key].length > 0 ? (
                  <TaskGroup key={key} groupKey={key} items={groups[key]} now={now} />
                ) : null,
              )
            )
          ) : done.length === 0 ? (
            <EmptyState message="아직 완료한 과제가 없습니다." />
          ) : (
            <ul className="flex flex-col gap-2">
              {done.map((t) => (
                <li key={t.taskId}>
                  <TaskCard card={t} now={now} isNewResult={newResultIds.has(t.taskId)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </GShell>
  );
}

// ── kind 필터 칩 ─────────────────────────────────────────────────────────────

function KindFilterChip({
  label,
  count,
  active,
  tint,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  tint: { bg: string; fg: string };
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="gd-t-2xs inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold"
      style={
        active
          ? { background: tint.bg, color: tint.fg, borderColor: "transparent" }
          : {
              background: "var(--gd-card)",
              color: "var(--gd-ink-3)",
              borderColor: "var(--gd-line)",
            }
      }
    >
      {label}
      <span className="gd-mono opacity-80">{count}</span>
    </button>
  );
}

// ── 그룹 섹션 ────────────────────────────────────────────────────────────────

function TaskGroup({
  groupKey,
  items,
  now,
}: {
  groupKey: GroupKey;
  items: StudentTaskCard[];
  now: Date | null;
}) {
  const meta = GROUP_META[groupKey];
  return (
    <section className="mb-5 last:mb-0">
      <div className="mb-2 flex items-center gap-1.5">
        <p
          className="gd-label"
          style={meta.rose ? { color: "var(--gd-bad)" } : undefined}
        >
          {meta.label}
        </p>
        <span className="gd-t-3xs gd-mono" style={{ color: "var(--gd-ink-3)" }}>
          {items.length}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((t) => (
          <li key={t.taskId}>
            {/* "나중에 · 마감 없음" 그룹에서는 카드의 "마감 없음" 라벨이 중복이라 억제 */}
            <TaskCard card={t} hideNoDueLabel={groupKey === "LATER"} now={now} />
          </li>
        ))}
      </ul>
    </section>
  );
}
