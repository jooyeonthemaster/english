"use client";

// ============================================================================
// /g/home — 학습 OS 첫 화면.
//
// 오늘의 한 수(원포인트 CTA) → 계기판·주간 리듬 → 오늘 할 일(통합 과제) →
// 4트랙 카드 → 취약 개념.
//
// "오늘의 한 수"는 화면 전체에서 **단 하나의 답**이다(docs/study-os-spec.md §4.1).
// 우선순위 ① 마감 임박 과제 → ② 진행 중 유닛의 다음 단계(레슨 미완이면 레슨)
// → ③ 취약 개념 복습 → ④ 다음 유닛 개념 학습 → ⑤ 복합 세트·오늘의 드릴.
// ②~⑤ 는 서버(buildHomePayload)가 계산해 home.nextStep 으로 내려주고,
// ① 은 과제 유니온(StudentTaskCard)을 가진 이 컴포넌트가 덮어쓴다.
//
// 여백 리듬: 카드 간 gap-2.5(10px), 섹션 간 mt-6(24px).
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChevronRight,
  Flame,
  RotateCcw,
  Target,
  Zap,
} from "lucide-react";
import type { HomeNextStep, HomePayload } from "@/lib/grammar-drill/payload";
import type { StudentTaskCard } from "@/lib/study-assignments/types";
import { STUDY_TRACKS } from "@/lib/study-os/tracks";
import { dDayLabel, dueCountdownText } from "@/lib/study-assignments/status";
import { DueAlertBanner, diffUnseenResults, useMinuteNow } from "../tasks/task-card";
import { Gauge, TodoCard, TrackCard } from "./home-cards";

export function HomeClient({
  studentId,
  home,
  tasks,
  vocabProgress,
}: {
  /** "새 결과" localStorage 키 스코프 — 공용 태블릿 학생 전환 오점등 방지 */
  studentId: string;
  home: HomePayload;
  tasks: StudentTaskCard[];
  /** 어휘 트랙 카드 진행 요약 — 플래그 off·조회 실패면 null/undefined */
  vocabProgress?: { pct: number; done: number; total: number; nextLabel: string } | null;
}) {
  const router = useRouter();
  const now = useMinuteNow();
  const accuracy =
    home.todaySolved > 0
      ? Math.round((home.todayCorrect / home.todaySolved) * 100)
      : null;

  // /t 응시 후 뒤로가기(bfcache 복원) — 서버 조립 홈이 stale 이므로 재조회.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) router.refresh();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [router]);

  // "새 결과" 원탭 행 — 공개된 시험 결과 중 이 기기 미확인분(localStorage,
  // 마운트 후에만 판정 — SSR 미스매치 회피).
  const [newResult, setNewResult] = useState<StudentTaskCard | null>(null);
  useEffect(() => {
    const results = tasks.filter(
      (t) => t.kind === "EXAM" && t.status === "DONE" && t.scoreText,
    );
    const unseen = diffUnseenResults(studentId, results.map((t) => t.taskId));
    setNewResult(results.find((t) => unseen.has(t.taskId)) ?? null);
  }, [tasks, studentId]);

  // 오늘 할 일 — 미완료·진입 가능 과제만, 기한 지남 → 오늘 마감 → 가까운 마감 순.
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

  // ① 마감 임박 과제 — 기한 지남 또는 D-1 이내. 있으면 오늘의 한 수를 덮어쓴다.
  const urgentTask = useMemo(
    () =>
      todo.find(
        (t) => t.overdue || (t.dDay !== null && t.dDay <= 1),
      ) ?? null,
    [todo],
  );

  const next: HomeNextStep = urgentTask
    ? {
        label: urgentTask.overdue ? "기한이 지난 과제부터" : "마감이 임박한 과제부터",
        target: urgentTask.title,
        // 카운트다운은 now 가 잡힌 뒤에만 붙인다(SSR 하이드레이션 미스매치 회피)
        reason: [
          urgentTask.kindLabel,
          dDayLabel(urgentTask.dDay),
          now && (urgentTask.overdue || urgentTask.dDay === 0)
            ? dueCountdownText(urgentTask.dueAt, now)
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
        href: urgentTask.actionHref ?? "/g/tasks",
        kind: "ASSIGNMENT",
        cta: "과제 시작",
      }
    : home.nextStep;

  return (
    <div className="gd-page px-5 pb-6 pt-5">
      {/* ── 인사말 ── */}
      <header>
        <h1 className="gd-t-xl font-bold tracking-tight">
          {home.studentName}님, 반갑습니다
        </h1>
        <p className="gd-t-2xs mt-1" style={{ color: "var(--gd-ink-3)" }}>
          오늘 할 일과 훈련을 여기에서 시작합니다
        </p>
      </header>

      {/* ── 오늘의 한 수 — 화면 첫 픽셀의 주인공 ── */}
      <section className="gd-block mt-4" data-tone="accent">
        <p className="gd-label mb-1.5" style={{ color: "var(--gd-blue)" }}>
          오늘의 한 수
        </p>
        <p className="gd-prose font-bold">{next.label}</p>
        <p
          className="gd-prose-2 mt-0.5"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {next.target}
        </p>
        <p className="gd-t-xs mt-1" style={{ color: "var(--gd-ink-3)" }}>
          {next.reason}
        </p>
        <Link href={next.href} className="gd-btn gd-btn-primary mt-3 w-full">
          {next.cta}
          <ArrowRight className="h-4 w-4" strokeWidth={2} />
        </Link>
      </section>

      {/* ── 기한 지남/오늘 마감 배너 ── */}
      {overdueCount > 0 || todayDueCount > 0 ? (
        <div className="mt-2.5">
          <DueAlertBanner
            overdueCount={overdueCount}
            todayCount={todayDueCount}
            href="/g/tasks"
          />
        </div>
      ) : null}

      {/* ── 오늘 계기판 ── */}
      <div
        className="gd-card mt-2.5 grid grid-cols-3 divide-x p-0"
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
      <div className="gd-card mt-2.5 px-3.5 py-3">
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
        <p className="sr-only">이번 주 {home.weekActiveDays}일 학습했습니다</p>
      </div>

      {/* ── 연속 학습 넛지 — 연속 2일 이상인데 오늘 0문항이면 ── */}
      {home.streakDays >= 2 && home.todaySolved === 0 ? (
        <div
          className="mt-2.5 rounded-xl px-3.5 py-2.5"
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
          <div className="gd-card px-3.5 py-4">
            <p className="gd-t-xs" style={{ color: "var(--gd-ink-2)" }}>
              {openCount > 0
                ? "지금 진행할 수 있는 과제가 없습니다. 예정 과제는 과제 탭에서 확인합니다."
                : "선생님이 배정한 과제가 없습니다. 위의 오늘의 한 수로 학습을 이어 갑니다."}
            </p>
            <Link
              href={openCount > 0 ? "/g/tasks" : next.href}
              className="gd-btn gd-btn-ghost mt-2.5 w-full"
            >
              {openCount > 0 ? "예정 과제 보기" : next.cta}
              <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {todo.map((t) => (
              <TodoCard key={t.taskId} task={t} now={now} />
            ))}
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

        {/* ── 새 결과 발견성 — 공개된 시험 결과 원탭 행 ── */}
        {newResult ? (
          <Link
            href="/g/tasks"
            className="gd-card mt-2.5 flex items-center gap-3 px-3.5 py-3"
          >
            <span
              className="h-2 w-2 shrink-0 animate-pulse rounded-full"
              style={{ background: "var(--gd-blue)" }}
              aria-hidden
            />
            <p
              className="gd-t-xs min-w-0 flex-1 truncate"
              style={{ color: "var(--gd-ink-2)" }}
            >
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

      {/* ── 학습 트랙 4종 ── */}
      <section className="mt-6">
        <p className="gd-label mb-2">학습 트랙</p>
        <div className="grid grid-cols-2 gap-2.5">
          {STUDY_TRACKS.map((t) => (
            <TrackCard
              key={t.id}
              track={t}
              grammar={home.grammar}
              progress={t.id === "vocab" ? vocabProgress ?? undefined : undefined}
            />
          ))}
        </div>
      </section>

      {/* ── 빠른 훈련 ── */}
      <section className="mt-6">
        <p className="gd-label mb-2">빠른 훈련</p>
        <div className="grid grid-cols-3 gap-2.5">
          <Link href="/g/drill?mode=smart" className="gd-btn gd-btn-ghost">
            <Zap className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            오늘의 드릴
          </Link>
          <Link href="/g/drill?mode=review" className="gd-btn gd-btn-ghost">
            <RotateCcw className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            오답 복습
          </Link>
          <Link href="/g/me" className="gd-btn gd-btn-ghost">
            <Target className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            내 기록
          </Link>
        </div>
      </section>

      {/* ── 취약 개념 ── */}
      {home.weakest.length > 0 && (
        <section className="mt-6">
          <p className="gd-label mb-2">지금 가장 약한 개념</p>
          <div className="flex flex-col gap-2.5 md:grid md:grid-cols-2">
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
                    <span
                      className="gd-t-3xs shrink-0"
                      style={{ color: "var(--gd-ink-3)" }}
                    >
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

      <p className="gd-t-3xs mt-8 text-center" style={{ color: "var(--gd-ink-3)" }}>
        {home.academyName} · 총 {home.totalSolved.toLocaleString()}문항 풀이 · 오늘 질문{" "}
        {home.chatRemainingToday}회 남았습니다
      </p>
    </div>
  );
}
