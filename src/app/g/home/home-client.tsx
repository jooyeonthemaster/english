"use client";

// ============================================================================
// /g/home — 홈 탭: "오늘의 학습" 대시보드.
//
// 인사말 → 오늘 계기판(오늘 푼 문항·정답률·연속 학습) → 오늘 할 일(통합 과제
// 미완료 상위 3 — 기한 지남·오늘 마감 우선) → 오늘의 드릴 CTA·보조 버튼 →
// 취약 개념 → 훈련 탭 연결 카드.
//
// 유닛맵·복합세트 섹션은 /g/train 으로 이관됐고, 구 "선생님 배정 학습" 섹션은
// 통합 과제 유니온(StudentTaskCard — 고아 GrammarDrillAssignment 포함)이
// 흡수했다. 어법 배정의 진입 경로(/g/drill?mode=assignment&assignmentId=…)는
// actionHref 로 동일하게 유지된다(기능 손실 없음).
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpenCheck,
  CalendarClock,
  ChevronRight,
  Dumbbell,
  FileText,
  Flame,
  ListChecks,
  RotateCcw,
  SpellCheck,
  Target,
  Zap,
} from "lucide-react";
import type { HomePayload } from "@/lib/grammar-drill/payload";
import type {
  StudentTaskCard,
  StudyAssignmentKind,
} from "@/lib/study-assignments/types";
import { dDayLabel, dueCountdownText } from "@/lib/study-assignments/status";
import { DueAlertBanner, diffUnseenResults, useMinuteNow } from "../tasks/task-card";

const KIND_ICON: Record<StudyAssignmentKind, typeof FileText> = {
  EXAM: FileText,
  WORKSHEET: BookOpenCheck,
  QUESTIONS: ListChecks,
  GRAMMAR: SpellCheck,
};

export function HomeClient({
  studentId,
  home,
  tasks,
}: {
  /** "새 결과" localStorage 키 스코프 — 공용 태블릿 학생 전환 오점등 방지 */
  studentId: string;
  home: HomePayload;
  tasks: StudentTaskCard[];
}) {
  const router = useRouter();
  const now = useMinuteNow();
  const accuracy =
    home.todaySolved > 0
      ? Math.round((home.todayCorrect / home.todaySolved) * 100)
      : null;

  // /t 응시 후 뒤로가기(bfcache 복원) — 서버 조립 홈이 stale 이므로 재조회.
  // pageshow(persisted)에서만 발화해 일반 내비게이션 중복 refresh 를 피한다.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) router.refresh();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [router]);

  // "새 결과" 원탭 행 — 공개된 시험 결과 중 이 기기 미확인분(localStorage,
  // 마운트 후에만 판정 — SSR 미스매치 회피). 확인 기록은 /g/tasks 완료 탭이 담당.
  const [newResult, setNewResult] = useState<StudentTaskCard | null>(null);
  useEffect(() => {
    const results = tasks.filter(
      (t) => t.kind === "EXAM" && t.status === "DONE" && t.scoreText,
    );
    const unseen = diffUnseenResults(studentId, results.map((t) => t.taskId));
    setNewResult(results.find((t) => unseen.has(t.taskId)) ?? null);
  }, [tasks, studentId]);

  // 오늘 할 일 — 미완료·진입 가능 과제만, 기한 지남(음수 D-day)→오늘 마감(0)
  // →가까운 마감→마감 없음 순. 동률은 최근 배포 우선. 상위 3개만 노출.
  const openCount = useMemo(
    () => tasks.filter((t) => t.status !== "DONE").length,
    [tasks],
  );
  const overdueCount = useMemo(
    () => tasks.filter((t) => t.status !== "DONE" && t.overdue).length,
    [tasks],
  );
  const todayDueCount = useMemo(
    () => tasks.filter((t) => t.status !== "DONE" && !t.overdue && t.dDay === 0).length,
    [tasks],
  );
  const todo = useMemo(() => {
    return tasks
      .filter((t) => t.status !== "DONE" && !t.locked)
      .sort((a, b) => {
        const da = a.dDay ?? Number.POSITIVE_INFINITY;
        const db = b.dDay ?? Number.POSITIVE_INFINITY;
        if (da !== db) return da - db;
        return +new Date(b.assignedAt) - +new Date(a.assignedAt);
      })
      .slice(0, 3);
  }, [tasks]);

  return (
    <div className="mx-auto max-w-md px-5 pb-6 pt-5">
      {/* ── 인사말 ── */}
      <header>
        <h1 className="gd-t-xl font-bold tracking-tight">
          {home.studentName}님, 반갑습니다
        </h1>
        <p className="gd-t-2xs mt-1" style={{ color: "var(--gd-ink-3)" }}>
          오늘 할 일과 훈련을 여기에서 시작합니다
        </p>
      </header>

      {/* ── 기한지남/오늘마감 배너(홈은 헤더 높이 가변 — 일반 배치) ── */}
      {overdueCount > 0 || todayDueCount > 0 ? (
        <div className="mt-3">
          <DueAlertBanner
            overdueCount={overdueCount}
            todayCount={todayDueCount}
            href="/g/tasks"
          />
        </div>
      ) : null}

      {/* ── 오늘 계기판 ── */}
      <div
        className="gd-card mt-4 grid grid-cols-3 divide-x p-0"
        style={{ borderColor: "var(--gd-line)" }}
      >
        <Gauge label="오늘 푼 문항" value={String(home.todaySolved)} />
        <Gauge label="오늘 정답률" value={accuracy === null ? "—" : `${accuracy}%`} />
        <Gauge
          label="연속 학습"
          value={`${home.streakDays}일`}
          icon={
            home.streakDays >= 2 ? (
              <Flame
                className="h-3.5 w-3.5"
                style={{ color: "var(--gd-blue)" }}
                strokeWidth={2}
              />
            ) : undefined
          }
        />
      </div>

      {/* ── 주간 학습 리듬(월~일 7도트 — 서버 파생 week 소비) ── */}
      <div className="gd-card mt-2 px-3.5 py-3">
        <div className="flex items-center justify-between">
          <p className="gd-t-2xs font-semibold" style={{ color: "var(--gd-ink-2)" }}>
            주간 학습 리듬
          </p>
          <p className="gd-t-2xs" style={{ color: "var(--gd-ink-3)" }}>
            이번 주{" "}
            <span className="gd-mono font-bold" style={{ color: "var(--gd-ink)" }}>
              {home.weekActiveDays}
            </span>
            일 학습
          </p>
        </div>
        <div className="mt-2.5 flex items-center justify-between px-0.5">
          {home.week.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  background: d.active ? "var(--gd-blue)" : "var(--gd-line)",
                  boxShadow: d.isToday
                    ? "0 0 0 2px var(--gd-card), 0 0 0 3.5px var(--gd-blue-line)"
                    : undefined,
                }}
                aria-hidden
              />
              <span
                className="gd-t-3xs"
                style={
                  d.isToday
                    ? { color: "var(--gd-blue)", fontWeight: 700 }
                    : { color: "var(--gd-ink-3)" }
                }
              >
                {d.weekday}
              </span>
            </div>
          ))}
        </div>
        <p className="sr-only">
          이번 주 {home.weekActiveDays}일 학습했습니다
        </p>
      </div>

      {/* ── 연속 학습 넛지 — 연속 2일 이상인데 오늘 0문항이면 ── */}
      {home.streakDays >= 2 && home.todaySolved === 0 ? (
        <div
          className="mt-2 rounded-xl px-3.5 py-2.5"
          style={{ background: "var(--gd-blue-soft)" }}
        >
          <p className="gd-t-xs font-medium" style={{ color: "var(--gd-blue)" }}>
            오늘 1문항만 풀어도 연속 {home.streakDays + 1}일이 이어집니다
          </p>
        </div>
      ) : null}

      {/* ── 오늘 할 일 ── */}
      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <p className="gd-label">오늘 할 일</p>
          <Link
            href="/g/tasks"
            className="gd-t-2xs -m-2 p-2 font-semibold"
            style={{ color: "var(--gd-blue)" }}
          >
            전체 보기 →
          </Link>
        </div>
        {todo.length === 0 ? (
          <div className="gd-card px-3.5 py-5 text-center">
            <p className="gd-t-xs" style={{ color: "var(--gd-ink-3)" }}>
              {openCount > 0
                ? "지금 진행할 수 있는 과제가 없습니다. 과제 탭에서 예정 과제를 확인합니다."
                : "지금 해야 할 과제가 없습니다. 오늘의 드릴로 학습을 이어 갑니다."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {todo.map((t) => (
              <TodoCard key={t.taskId} task={t} now={now} />
            ))}
            {/* 상위 3건 밖에도 진행 가능 과제가 남아 있으면 전체 이동 행 */}
            {openCount > todo.length ? (
              <Link
                href="/g/tasks"
                className="gd-t-xs flex items-center justify-center gap-1 rounded-xl py-2.5 font-semibold"
                style={{ color: "var(--gd-blue)" }}
              >
                외 {openCount - todo.length}건 과제 보기
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ) : null}
          </div>
        )}

        {/* ── 새 결과 발견성 — 공개된 시험 결과 원탭 행(기기 로컬 표시 장치) ── */}
        {newResult ? (
          <Link href="/g/tasks" className="gd-card mt-2 flex items-center gap-3 px-3.5 py-3">
            <span
              className="h-2 w-2 shrink-0 animate-pulse rounded-full"
              style={{ background: "var(--gd-blue)" }}
              aria-hidden
            />
            <p className="gd-t-xs min-w-0 flex-1 truncate" style={{ color: "var(--gd-ink-2)" }}>
              시험 결과가 공개되었습니다 —{" "}
              <span className="font-semibold" style={{ color: "var(--gd-ink)" }}>
                {newResult.title}
              </span>
            </p>
            <ChevronRight
              className="h-4 w-4 shrink-0"
              style={{ color: "var(--gd-ink-3)" }}
              aria-hidden
            />
          </Link>
        ) : null}
      </section>

      {/* ── 오늘의 드릴 CTA — 주 라벨/부가 설명 2행 스택(minHeight 3.25rem 유지) ── */}
      <Link
        href="/g/drill?mode=smart"
        className="gd-btn gd-btn-primary mt-6 w-full"
        style={{ minHeight: "3.25rem" }}
      >
        <span className="flex min-w-0 flex-col items-center gap-0.5 py-1.5">
          <span className="flex items-center gap-1.5 font-semibold leading-tight">
            <Zap className="h-4.5 w-4.5" strokeWidth={2} />
            오늘의 드릴 시작
          </span>
          {/* 11px 고정 — text-[11px] 는 body.smoat-large-ui 가 14px 로 강제 확대하므로
              rem 기반 gd-t-2xs(0.6875rem = 11px)로 픽셀 스펙을 지킨다 */}
          <span className="gd-t-2xs font-medium leading-tight opacity-75">
            취약 개념 자동 편성
          </span>
        </span>
      </Link>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Link href="/g/drill?mode=review" className="gd-btn gd-btn-ghost">
          <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
          오답 복습
        </Link>
        <Link href="/g/me" className="gd-btn gd-btn-ghost">
          <Target className="h-4 w-4" strokeWidth={1.75} />
          취약점 보기
        </Link>
      </div>

      {/* ── 취약 개념 ── */}
      {home.weakest.length > 0 && (
        <section className="mt-6">
          <p className="gd-label mb-2">지금 가장 약한 개념</p>
          <div className="flex flex-col gap-2">
            {home.weakest.map((w) => (
              <Link
                key={w.conceptId}
                href={`/g/drill?mode=drill&unitId=${w.unitId}&conceptId=${w.conceptId}`}
                className="gd-card flex items-center gap-3 px-3.5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="gd-t-sm truncate font-semibold">{w.title}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="gd-meter flex-1">
                      <span style={{ width: `${w.score}%` }} />
                    </div>
                    <span className="gd-t-3xs shrink-0" style={{ color: "var(--gd-ink-3)" }}>
                      숙달도 <span className="gd-mono">{w.score}</span>
                    </span>
                  </div>
                </div>
                <span
                  className="gd-t-2xs shrink-0 font-semibold"
                  style={{ color: "var(--gd-blue)" }}
                >
                  집중 드릴
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── 훈련 탭 연결 카드(유닛맵·복합세트 이관 안내) ── */}
      <section className="mt-6">
        <Link href="/g/train" className="gd-card flex items-center gap-3 p-3.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }}
          >
            <Dumbbell className="h-4.5 w-4.5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="gd-t-sm truncate font-semibold">유닛별 학습</p>
            <p className="gd-t-2xs mt-0.5" style={{ color: "var(--gd-ink-3)" }}>
              유닛맵과 누적 복합 세트는 훈련 탭에서 이어 갑니다
            </p>
          </div>
          <ChevronRight
            className="h-4 w-4 shrink-0"
            style={{ color: "var(--gd-ink-3)" }}
          />
        </Link>
      </section>

      <p className="gd-t-3xs mt-8 text-center" style={{ color: "var(--gd-ink-3)" }}>
        {home.academyName} · 총 {home.totalSolved.toLocaleString()}문항 풀이 · 오늘 질문{" "}
        {home.chatRemainingToday}회 남았습니다
      </p>
    </div>
  );
}

function Gauge({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center py-3.5" style={{ borderColor: "var(--gd-line)" }}>
      <div className="flex items-center gap-1">
        {icon}
        <p className="gd-mono gd-t-lg font-bold">{value}</p>
      </div>
      <p className="gd-t-3xs mt-0.5" style={{ color: "var(--gd-ink-3)" }}>
        {label}
      </p>
    </div>
  );
}

function TodoCard({ task, now }: { task: StudentTaskCard; now: Date | null }) {
  const Icon = KIND_ICON[task.kind];
  const dday = dDayLabel(task.dDay);
  // 정밀 카운트다운 — D-0·기한 지남에서만(24시간 창은 dueCountdownText 가 판정)
  const countdown =
    now && (task.overdue || task.dDay === 0)
      ? dueCountdownText(task.dueAt, now)
      : null;
  return (
    <Link
      href={task.actionHref ?? "/g/tasks"}
      className="gd-card flex items-center gap-3 p-3.5"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={
          task.overdue
            ? { background: "var(--gd-bad-soft)", color: "var(--gd-bad)" }
            : task.kind === "GRAMMAR"
              ? { background: "var(--gd-good-soft)", color: "var(--gd-good)" }
              : { background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }
        }
      >
        <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="gd-t-sm truncate font-semibold">{task.title}</p>
        <p className="gd-t-2xs mt-0.5 truncate" style={{ color: "var(--gd-ink-3)" }}>
          {task.kindLabel}
          {task.progressText ? ` · ${task.progressText}` : ""}
          {task.status === "IN_PROGRESS" ? " · 진행 중" : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {dday ? (
          <span className="flex flex-col items-end gap-0.5">
            {/* 과제 탭(TaskCard)의 D-day pill 과 픽셀 동일 마크업 — D-0 만 blue-soft 틴트,
                overdue 는 기존 gd-bad 전경색 유지(신규 적색 배경 틴트 도입 금지) */}
            <span
              className="gd-t-2xs gd-mono inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-bold"
              style={
                task.overdue
                  ? { color: "var(--gd-bad)" }
                  : task.dDay === 0
                    ? { background: "var(--gd-blue-soft)", color: "var(--gd-blue)" }
                    : { color: "var(--gd-ink-2)" }
              }
            >
              <CalendarClock className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
              {dday}
            </span>
            {countdown ? (
              <span
                className="gd-t-3xs font-bold"
                style={{ color: task.overdue ? "var(--gd-bad)" : "var(--gd-blue)" }}
              >
                {countdown}
              </span>
            ) : null}
          </span>
        ) : null}
        <ChevronRight className="h-4 w-4" style={{ color: "var(--gd-ink-3)" }} />
      </div>
    </Link>
  );
}
