"use client";

// ============================================================================
// 학생 상세 허브 — 셸 (탭 URL 동기화 + 공용 과제 컴포저)
//
// 학생의 모든 데이터가 이 허브로 모인다(설계 §5): 개요/응시 이력/어법 훈련/
// 과제/시험 리포트/출결/수납/상담/학부모. 어법 훈련소·리포트 관리로 흩어져
// 있던 학생 단위 시야를 여기로 통합한 후계 화면. ?tab= 쿼리로 딥링크 지원
// (구 grammar-lab 상세가 ?tab=grammar 로 리다이렉트).
// ============================================================================

import { useCallback, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { GrammarLabStudentDetail } from "@/actions/grammar-drill-admin";
import type { StudentExamReportRow } from "@/actions/students/exam-reports";
import type { StudentStudyTaskRow } from "@/lib/study-assignments/types";
import { PageShell } from "@/components/layout/page-frame";
import {
  AssignmentComposer,
  type ComposerPreset,
} from "@/components/study-assignments/assignment-composer";
import { AssignmentDetailModal } from "@/components/study-assignments/assignment-detail-modal";
import type { WeakConceptPreset } from "@/components/study-assignments/composer-grammar-spec";
import { StudentBillingSection } from "@/components/students/billing/student-billing-section";
import { StudentDetailAttendanceTab } from "@/components/students/student-detail-attendance-tab";
import { StudentDetailConsultationTab } from "@/components/students/student-detail-consultation-tab";
import { StudentDetailParentTab } from "@/components/students/student-detail-parent-tab";
import { StudentExamHistoryTab } from "@/components/students/student-exam-history-tab";
import { cn } from "@/lib/utils";
import { StudentHubHeader, type StudentHubHeaderData } from "./hub-header";
import {
  StudentOverviewTab,
  type GrammarSnapshot,
  type StudentHubOverviewData,
  type StudentHubStats,
} from "./overview-tab";
import { StudentGrammarTab, collectWeakConcepts } from "./grammar-tab";
import { StudentTasksTab, type StudentTaskFilter } from "./tasks-tab";
import { StudentReportsTab } from "./reports-tab";

export type HubTabKey =
  | "overview"
  | "exams"
  | "grammar"
  | "tasks"
  | "reports"
  | "attendance"
  | "billing"
  | "consult"
  | "parent";

export function StudentHubClient({
  header,
  overview,
  stats,
  grammar,
  tasks,
  reports,
  legacyStats,
  legacyStudent,
  flags,
  isDirector,
  initialTab,
}: {
  header: StudentHubHeaderData;
  overview: StudentHubOverviewData;
  stats: StudentHubStats;
  grammar: GrammarLabStudentDetail | null;
  tasks: StudentStudyTaskRow[];
  reports: StudentExamReportRow[];
  /** 레거시 출결·상담 탭이 소비하는 원본 stats(any 계약) */
  legacyStats: unknown;
  /** 레거시 학부모 탭이 소비하는 원본 student(any 계약) */
  legacyStudent: unknown;
  flags: { examHistory: boolean; grammar: boolean };
  isDirector: boolean;
  initialTab: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const tabs = useMemo(() => {
    const pendingTasks = tasks.filter((t) => t.liveStatus !== "DONE").length;
    const list: { key: HubTabKey; label: string; badge?: number }[] = [
      { key: "overview", label: "개요" },
    ];
    if (flags.examHistory) list.push({ key: "exams", label: "응시 이력" });
    if (flags.grammar) list.push({ key: "grammar", label: "어법 훈련" });
    list.push(
      { key: "tasks", label: "과제", badge: pendingTasks || undefined },
      { key: "reports", label: "시험 리포트", badge: reports.length || undefined },
      { key: "attendance", label: "출결" },
      { key: "billing", label: "수납" },
      { key: "consult", label: "상담" },
      { key: "parent", label: "학부모" },
    );
    return list;
  }, [flags, tasks, reports]);

  const isValidTab = useCallback(
    (t: string | null): t is HubTabKey => !!t && tabs.some((tab) => tab.key === t),
    [tabs],
  );
  const [tab, setTab] = useState<HubTabKey>(
    isValidTab(initialTab) ? initialTab : "overview",
  );
  const [visited, setVisited] = useState<Set<HubTabKey>>(
    () => new Set([isValidTab(initialTab) ? initialTab : "overview"]),
  );

  const goTab = useCallback(
    (next: string) => {
      if (!isValidTab(next)) return;
      setTab(next);
      setVisited((prev) => new Set(prev).add(next));
      router.replace(`${pathname}?tab=${next}`, { scroll: false });
    },
    [isValidTab, pathname, router],
  );

  // 탭 네비 a11y — 좌우 화살표 로빙 포커스(활성 탭만 tabIndex 0). 시각 변화 0.
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const onTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const idx = tabs.findIndex((t) => t.key === tab);
      if (idx < 0) return;
      const next =
        e.key === "ArrowRight" ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
      goTab(tabs[next].key);
      const buttons = tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      buttons?.[next]?.focus();
    },
    [tabs, tab, goTab],
  );

  // 공용 컴포저 — 헤더 CTA(자유 구성) + 어법 취약 프리셋
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerPreset, setComposerPreset] = useState<ComposerPreset | null>(null);
  const openComposer = (preset: ComposerPreset | null) => {
    setComposerPreset(preset);
    setComposerOpen(true);
  };
  const openWeakComposer = (weak: WeakConceptPreset[]) =>
    openComposer({ kind: "GRAMMAR", weakConcepts: weak, grammarSpec: { count: 20 } });

  // 과제 상세 모달 — 개요/과제 탭 행 드릴다운 공용 (컴포저와 동일 리프트 패턴).
  // 딥링크 이탈 없이 허브 안에서 과제 상세(학생별 진행·마감 관리)를 연다.
  const [detailAssignmentId, setDetailAssignmentId] = useState<string | null>(null);

  // 과제 탭 상태 필터 — 헤더 퀵스탯 점프가 세팅하므로 허브로 리프트
  const [taskFilter, setTaskFilter] = useState<StudentTaskFilter>("ALL");

  const grammarSnapshot: GrammarSnapshot | null = useMemo(() => {
    if (!grammar) return null;
    const solved = grammar.totals.solved;
    return {
      solved,
      accuracy: solved > 0 ? Math.round((grammar.totals.correct / solved) * 100) : null,
      weak: collectWeakConcepts(grammar),
      days: grammar.days,
    };
  }, [grammar]);

  // 마지막 학습 활동 — 프리로드 payload(어법 시도·과제 completedAt)만으로 계산.
  // 아무 기록 없는 신입생은 null → 헤더 신호 미렌더.
  const lastActivityAt = useMemo(() => {
    let max = 0;
    if (grammar) {
      for (const a of grammar.recentAttempts) {
        const t = Date.parse(a.createdAt);
        if (Number.isFinite(t) && t > max) max = t;
      }
    }
    for (const row of tasks) {
      if (!row.completedAt) continue;
      const t = Date.parse(row.completedAt);
      if (Number.isFinite(t) && t > max) max = t;
    }
    return max > 0 ? new Date(max).toISOString() : null;
  }, [grammar, tasks]);

  const quickStats = useMemo(() => {
    const pending = tasks.filter((t) => t.liveStatus !== "DONE").length;
    const overdue = tasks.filter((t) => t.overdue).length;
    return [
      { label: "출석률 (30일)", value: `${stats.attendanceRate}%`, onSelect: () => goTab("attendance") },
      { label: "연속 학습", value: `${stats.streak}일` },
      {
        label: "평균 시험 점수",
        value: stats.examCount > 0 ? `${stats.averageScore}점` : "—",
        sub: stats.examCount > 0 ? `응시 ${stats.examCount}회` : undefined,
        onSelect: flags.examHistory ? () => goTab("exams") : undefined,
      },
      {
        label: "어법 정답률",
        value: grammarSnapshot?.accuracy !== null && grammarSnapshot ? `${grammarSnapshot.accuracy}%` : "—",
        tone:
          grammarSnapshot?.accuracy != null
            ? grammarSnapshot.accuracy >= 70
              ? ("emerald" as const)
              : grammarSnapshot.accuracy < 50
                ? ("rose" as const)
                : undefined
            : undefined,
        onSelect: flags.grammar ? () => goTab("grammar") : undefined,
      },
      {
        label: "미완료 과제",
        value: `${pending}건`,
        tone: pending > 0 ? ("blue" as const) : undefined,
        onSelect: () => {
          setTaskFilter("OPEN");
          goTab("tasks");
        },
      },
      {
        label: "기한 지남",
        value: `${overdue}건`,
        tone: overdue > 0 ? ("rose" as const) : undefined,
        onSelect: () => {
          setTaskFilter("OVERDUE");
          goTab("tasks");
        },
      },
    ];
  }, [stats, tasks, grammarSnapshot, flags, goTab]);

  return (
    <PageShell>
      <StudentHubHeader
        student={header}
        quickStats={quickStats}
        lastActivityAt={lastActivityAt}
        isDirector={isDirector}
        onOpenComposer={() => openComposer(null)}
        onGoTab={goTab}
      />

      {/* 탭 네비 + 콘텐츠 카드 */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto border-b border-slate-100">
          <div
            ref={tabListRef}
            role="tablist"
            aria-label="학생 데이터 탭"
            onKeyDown={onTabKeyDown}
            className="flex min-w-max items-center gap-1 px-2"
          >
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                tabIndex={tab === t.key ? 0 : -1}
                onClick={() => goTab(t.key)}
                className={cn(
                  "relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold transition-colors",
                  tab === t.key ? "text-blue-700" : "text-slate-400 hover:text-slate-600",
                )}
              >
                {t.label}
                {t.badge ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                      tab === t.key
                        ? "bg-blue-100 text-blue-700"
                        : "bg-slate-100 text-slate-400",
                    )}
                  >
                    {t.badge}
                  </span>
                ) : null}
                {tab === t.key ? (
                  <span
                    className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-blue-600"
                    aria-hidden
                  />
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div role="tabpanel" className="min-w-0 p-4 sm:p-5">
          {tab === "overview" ? (
            <StudentOverviewTab
              student={overview}
              stats={stats}
              tasks={tasks}
              grammar={grammarSnapshot}
              isDirector={isDirector}
              onGoTab={goTab}
              onOpenAssignment={setDetailAssignmentId}
            />
          ) : null}

          {/* 클라이언트 자체 로드 탭은 방문 후 keep-mounted (재조회 방지) */}
          {visited.has("exams") && flags.examHistory ? (
            <div hidden={tab !== "exams"}>
              <StudentExamHistoryTab studentId={header.id} />
            </div>
          ) : null}

          {tab === "grammar" && flags.grammar ? (
            grammar ? (
              <StudentGrammarTab detail={grammar} onOpenWeakComposer={openWeakComposer} />
            ) : (
              <p className="py-12 text-center text-[13px] text-slate-400">
                어법 훈련 데이터를 불러오지 못했습니다.
              </p>
            )
          ) : null}

          {tab === "tasks" ? (
            <StudentTasksTab
              studentId={header.id}
              tasks={tasks}
              weakConcepts={grammarSnapshot?.weak ?? []}
              filter={taskFilter}
              onFilterChange={setTaskFilter}
              onOpenAssignment={setDetailAssignmentId}
              onGoTab={goTab}
            />
          ) : null}

          {tab === "reports" ? <StudentReportsTab reports={reports} /> : null}

          {tab === "attendance" ? (
            <StudentDetailAttendanceTab stats={legacyStats} />
          ) : null}

          {visited.has("billing") ? (
            <div hidden={tab !== "billing"}>
              <StudentBillingSection studentId={header.id} isDirector={isDirector} />
            </div>
          ) : null}

          {tab === "consult" ? (
            <StudentDetailConsultationTab stats={legacyStats} />
          ) : null}

          {tab === "parent" ? <StudentDetailParentTab student={legacyStudent} /> : null}
        </div>
      </section>

      <AssignmentComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        preset={composerPreset}
        defaultStudentIds={[header.id]}
        onCreated={() => router.refresh()}
      />

      <AssignmentDetailModal
        assignmentId={detailAssignmentId}
        onClose={() => setDetailAssignmentId(null)}
        onChanged={() => router.refresh()}
      />
    </PageShell>
  );
}
