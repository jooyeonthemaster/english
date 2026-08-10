"use client";

// ============================================================================
// 학생 상세 허브 — 셸 (탭 URL 동기화 + 공용 과제 컴포저)
//
// 학생의 모든 데이터가 이 허브로 모인다(관제 스펙 §4.1 탭 사전). 탭은 세 묶음:
//   제작 콘텐츠(선생님이 만든 것) — 학습지 · 시험
//   내장 프로그램(스모트 커리큘럼) — 어법 훈련
//   운영 — 과제 · 출결 · 수납 · 상담 · 학부모
// 묶음 사이에는 얇은 구분선. 리포트는 별도 탭이 아니라 **시험 탭 내부 세그먼트**
// (성적 분석 | 리포트) — 리포트는 시험 도메인의 산출물이지 독립 도메인이 아니다.
// ?tab= 딥링크 지원: 구 grammar-lab 상세 → ?tab=grammar, 구 리포트 탭 링크
// ?tab=reports 는 시험 탭 리포트 세그먼트로 별칭 해석(key 불변 원칙의 확장).
// ============================================================================

import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Info } from "lucide-react";
import type { GrammarLabStudentDetail } from "@/actions/grammar-drill-admin";
import type { StudentExamReportRow } from "@/actions/students/exam-reports";
import type { AnalysisSeed, StudentStudyTaskRow } from "@/lib/study-assignments/types";
import type { WeakSpot } from "@/lib/student-analytics/types";
import { HUB_TAB_ONELINERS } from "@/lib/wording/director-glossary";
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
import { StudentExamTab } from "./exam-tab/exam-tab";
import { SegmentPills } from "./analytics/kit";
import { cn } from "@/lib/utils";
import { StudentHubHeader, type StudentHubHeaderData } from "./hub-header";
import {
  StudentOverviewTab,
  type GrammarSnapshot,
  type StudentHubOverviewData,
  type StudentHubStats,
} from "./overview-tab";
import { StudentGrammarTab, collectWeakConcepts } from "./grammar-tab";
import { StudentVocabTab } from "./vocab-tab";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { StudentStudyAnalyticsTab } from "./study-analytics-tab";
import { StudentTasksTab, type StudentTaskFilter } from "./tasks-tab";
import { StudentReportsTab } from "./reports-tab";

export type HubTabKey =
  | "overview"
  | "study"
  | "exams"
  | "grammar"
  | "vocab"
  | "tasks"
  | "reports"
  | "attendance"
  | "billing"
  | "consult"
  | "parent";

// 탭별 한 줄 설명(관제 스펙 §4.1 "의미" 열)은 HUB_TAB_ONELINERS(director-glossary)
// 단일 소스 — 활성 탭 패널 상단 공통 위치에 상시 노출(로컬 사본 금지, v3 §D6).

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
  /** vocab 은 과도기 optional — 미전달 시 클라이언트 플래그로 판정(셸 무접촉) */
  flags: { examHistory: boolean; grammar: boolean; vocab?: boolean };
  isDirector: boolean;
  initialTab: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const vocabEnabled = flags.vocab ?? FEATURE_FLAGS.ENABLE_VOCAB_DRILL;

  const tabs = useMemo(() => {
    const pendingTasks = tasks.filter((t) => t.liveStatus !== "DONE").length;
    // divider = 묶음 시작(제작 콘텐츠 ‖ 내장 프로그램 ‖ 운영) — 헤더 주석 참조
    const list: { key: HubTabKey; label: string; badge?: number; divider?: boolean }[] = [
      { key: "overview", label: "개요" },
    ];
    // 학습지 탭은 항상(v3 §D1-2) — 드릴 플래그와의 커플링 절단. 탭은 자체 로드라
    // 서버 프리로드 정합 문제 없음. 시험 탭도 항상(리포트 세그먼트가 플래그 무관).
    // exams 배지 제거(R8) — 문서 수는 세그 라벨 「리포트 N」이 표기.
    list.push({ key: "study", label: "학습지" }, { key: "exams", label: "시험" });
    if (flags.grammar) list.push({ key: "grammar", label: "어법 훈련", divider: true });
    // 단어 훈련 — 내장 프로그램 묶음. 어법이 꺼져 있으면 이 탭이 묶음 구분선을 진다.
    if (vocabEnabled) list.push({ key: "vocab", label: "단어 훈련", divider: !flags.grammar });
    list.push(
      { key: "tasks", label: "과제", badge: pendingTasks || undefined, divider: true },
      { key: "attendance", label: "출결" },
      { key: "billing", label: "수납" },
      { key: "consult", label: "상담" },
      { key: "parent", label: "학부모" },
    );
    return list;
  }, [flags, vocabEnabled, tasks]);

  const isValidTab = useCallback(
    (t: string | null): t is HubTabKey => !!t && tabs.some((tab) => tab.key === t),
    [tabs],
  );
  // 구 "내신 리포트" 탭 딥링크(?tab=reports) → 시험 탭 리포트 세그먼트 별칭
  const resolvedInitial: HubTabKey =
    initialTab === "reports" ? "exams" : isValidTab(initialTab) ? initialTab : "overview";
  const [tab, setTab] = useState<HubTabKey>(resolvedInitial);
  const [visited, setVisited] = useState<Set<HubTabKey>>(() => new Set([resolvedInitial]));
  /** 시험 탭 내부 세그먼트 — 성적 분석(history) | 리포트 문서(reports) */
  const [examView, setExamView] = useState<"history" | "reports">(
    initialTab === "reports" || !flags.examHistory ? "reports" : "history",
  );

  const goTab = useCallback(
    (next: string) => {
      // reports 별칭 — 시험 탭을 열고 리포트 세그먼트로 (복귀 링크 호환을 위해 URL 은 유지)
      if (next === "reports") {
        setTab("exams");
        setExamView("reports");
        router.replace(`${pathname}?tab=reports`, { scroll: false });
        return;
      }
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

  // 공용 컴포저 — 헤더 CTA(자유 구성) + 어법 취약 프리셋 + 취약점 CTA(§D2-1) +
  // 상세 모달 복제 재배포(D4). studentIds 미지정 진입은 defaultStudentIds=[header.id].
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerPreset, setComposerPreset] = useState<ComposerPreset | null>(null);
  const [composerStudentIds, setComposerStudentIds] = useState<string[] | null>(null);
  const openComposer = (preset: ComposerPreset | null, studentIds?: string[]) => {
    setComposerPreset(preset);
    setComposerStudentIds(studentIds && studentIds.length > 0 ? studentIds : null);
    setComposerOpen(true);
  };
  const openWeakComposer = (weak: WeakConceptPreset[]) =>
    openComposer({ kind: "GRAMMAR", weakConcepts: weak, grammarSpec: { count: 20 } });

  /**
   * 취약점 → 과제 원클릭(§D2-1) — 3탭 onDeploy 가 모이는 단일 배포 진입점.
   * deploy 종별 ComposerPreset 을 구성하고 analysisSeed(컨텍스트 스트립 데이터원)를
   * 동반한다. 시드 진입은 defaultStudentIds=[header.id] 필수(스트립이 [0]으로 조회).
   */
  const openDeployComposer = (spots: WeakSpot[], source: "study" | "exam" | "grammar") => {
    const analysisSeed: AnalysisSeed = { spots, source };
    // 빈 spots + source "exam" = 시험 탭 빈 상태 CTA — EXAM kind 배포 의도(계약)
    if (spots.length === 0) {
      openComposer(source === "exam" ? { kind: "EXAM", analysisSeed } : null);
      return;
    }
    const deploy = spots[0].deploy;
    if (!deploy) {
      // deploy null 은 CTA 미렌더 계약이라 도달하지 않지만 — 방어적 자유 구성 폴백
      openComposer(null);
      return;
    }
    if (deploy.kind === "GRAMMAR") {
      // 복수 spot 이면 conceptIds 합집합(순서 보존 dedupe) · weakConcepts 는 flatMap
      const grammarDeploys = spots.flatMap((s) =>
        s.deploy?.kind === "GRAMMAR" ? [s.deploy] : [],
      );
      const conceptIds = [
        ...new Set(grammarDeploys.flatMap((d) => d.grammarSpec.conceptIds ?? [])),
      ];
      openComposer({
        kind: "GRAMMAR",
        grammarSpec:
          spots.length > 1 && conceptIds.length > 0
            ? { ...deploy.grammarSpec, conceptIds }
            : deploy.grammarSpec,
        weakConcepts: grammarDeploys.flatMap((d) => d.weakConcepts),
        analysisSeed,
      });
      return;
    }
    if (deploy.kind === "QUESTIONS") {
      // questionIds 없이 — 피커 + initialSubTypes(spots 의 subTypes 합집합) 자동(B-2)
      openComposer({ kind: "QUESTIONS", analysisSeed });
      return;
    }
    // WORKSHEET — content.refId 는 PassageReport.id 직결(assignmentId 대체 금지 계약)
    openComposer({ kind: "WORKSHEET", content: deploy.content, analysisSeed });
  };

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
        // M-10 — 시험 탭과 동일 모집단(aggregateStudentExamHistory→summarize)의
        // 평균 점수율. 확정 점수 없는 응시만 있으면 값 "—" + sub 「응시 N회」.
        label: "평균 점수율",
        value: stats.examAvgScorePct != null ? `${stats.examAvgScorePct}%` : "—",
        sub: stats.examSittings > 0 ? `응시 ${stats.examSittings}회` : undefined,
        onSelect: flags.examHistory ? () => goTab("exams") : undefined,
      },
      {
        label: "어법 정답률",
        value: grammarSnapshot?.accuracy !== null && grammarSnapshot ? `${grammarSnapshot.accuracy}%` : "—",
        // 점수 임계는 허브 단일 축(kit scoreText: <50 rose · <80 blue · ≥80
        // emerald)을 따른다. 여기만 70/50 이던 탓에 같은 정답률이 탭마다 다른
        // 등급 색으로 보였다.
        tone:
          grammarSnapshot?.accuracy != null
            ? grammarSnapshot.accuracy >= 80
              ? ("emerald" as const)
              : grammarSnapshot.accuracy < 50
                ? ("rose" as const)
                : ("blue" as const)
            : undefined,
        onSelect: flags.grammar ? () => goTab("grammar") : undefined,
      },
      {
        label: "미완료 과제",
        value: `${pending}건`,
        // 이 타일의 축(liveStatus!==DONE)은 기한 지남을 포함한다. 과제 탭 칩
        // 「미완료(기한 내)」와 숫자가 달라 한 화면에서 4와 5가 동시에 보였던
        // 결함 — sub 로 축을 명기하고, 탭 목록 헤더의 산식 캡션이 둘을 잇는다.
        sub: "기한 지남 포함",
        tone: pending > 0 ? ("blue" as const) : undefined,
        onSelect: () => {
          // M-9 — 카운트 정의(liveStatus!==DONE)는 기한 지남을 포함하는데 OPEN
          // 필터는 이를 제외해 착지 행 수가 타일 수치와 어긋났다. ALL 착지로
          // 목록=카운트 일치(가장 급한 기한 지남 보존).
          setTaskFilter("ALL");
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
              <Fragment key={t.key}>
                {t.divider ? (
                  <span aria-hidden className="mx-1 h-4 w-px shrink-0 self-center bg-slate-200" />
                ) : null}
              <button
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
                    // 배지 숫자의 축을 밝힌다 — 퀵스탯 「미완료 과제」와 같은
                    // 정의(기한 지남 포함)이지 과제 탭 칩 「미완료(기한 내)」가 아니다
                    title={t.key === "tasks" ? "미완료 과제(기한 지남 포함)" : undefined}
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
              </Fragment>
            ))}
          </div>
        </div>

        <div role="tabpanel" className="min-w-0 p-4 sm:p-5">
          {/* 탭별 한 줄 설명(§4.1) — HUB_TAB_ONELINERS 단일 소스, 공통 위치 단일
              렌더. study 탭만 예외: 갱신 스트립과 세로 이중 헤더가 되지 않게 탭
              컴포넌트가 한 줄로 합쳐 렌더한다 */}
          {tab !== "study" ? (
            <p className="mb-4 flex items-center gap-1.5 text-[13px] text-slate-500">
              <Info className="size-3.5 shrink-0 text-slate-300" aria-hidden />
              {tab === "exams" && examView === "reports"
                ? HUB_TAB_ONELINERS.reports
                : HUB_TAB_ONELINERS[tab]}
            </p>
          ) : null}

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

          {/* 학습 분석 — 학생 축 실시간 관제(§4.2). 자체 폴링 탭이라 이탈 시
              언마운트해 백그라운드 폴링을 남기지 않는다 */}
          {tab === "study" ? (
            <StudentStudyAnalyticsTab
              studentId={header.id}
              studentName={header.name}
              onDeploy={openDeployComposer}
            />
          ) : null}

          {/* 시험 — 성적 분석 | 리포트 세그먼트. R7 마운트 규약: 진입 마운트·이탈
              언마운트(구 visited keep-mounted 폐기 — 타 탭 체류 중 폴링 누수 제거) */}
          {tab === "exams" ? (
            <div>
              {/* N-20 — 세그는 kit SegmentPills 단일 정본(R3, 수제 복제 폐기) */}
              {flags.examHistory ? (
                <SegmentPills<"history" | "reports">
                  options={[
                    { value: "history", label: "성적 분석" },
                    { value: "reports", label: "리포트", count: reports.length || null },
                  ]}
                  value={examView}
                  onChange={setExamView}
                  ariaLabel="시험 보기 전환"
                  className="mb-4"
                />
              ) : null}
              {flags.examHistory ? (
                <div hidden={examView !== "history"}>
                  <StudentExamTab studentId={header.id} onDeploy={openDeployComposer} />
                </div>
              ) : null}
              {examView === "reports" ? <StudentReportsTab reports={reports} /> : null}
            </div>
          ) : null}

          {tab === "grammar" && flags.grammar ? (
            grammar ? (
              <StudentGrammarTab
                detail={grammar}
                onOpenWeakComposer={openWeakComposer}
                onDeploy={openDeployComposer}
              />
            ) : (
              <p className="py-12 text-center text-[13px] text-slate-400">
                어법 훈련 데이터를 불러오지 못했습니다.
              </p>
            )
          ) : null}

          {tab === "vocab" && vocabEnabled ? (
            <StudentVocabTab studentId={header.id} />
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
        // 복제 재배포(onDuplicate)만 대상 학생을 지정 — 그 외(시드 진입 포함)는
        // 이 학생 1인([header.id], §D2-3 컨텍스트 스트립 계약)
        defaultStudentIds={composerStudentIds ?? [header.id]}
        onCreated={() => router.refresh()}
      />

      <AssignmentDetailModal
        assignmentId={detailAssignmentId}
        onClose={() => setDetailAssignmentId(null)}
        onChanged={() => router.refresh()}
        // 복제해 새 과제/미완료 재배포 편집(D4 — 보드 handleDuplicate 동형):
        // 상세를 닫고 buildDuplicatePreset(footer 소관) 결과로 컴포저를 연다
        onDuplicate={(preset, studentIds) => {
          setDetailAssignmentId(null);
          openComposer(preset, studentIds);
        }}
      />
    </PageShell>
  );
}
