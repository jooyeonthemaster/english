"use client";

// ============================================================================
// 어법 훈련 현황 — 학생별 진행·취약 개념 모니터링 목록 (디자인 바이블 §2 재스킨)
//
// KPI 스트립 + 검색/반·학년·정체 필터 툴바(grammar-lab-toolbar) + 정렬 헤더
// 테이블(grammar-lab-table) + 학원 취약 개념 랭킹(grammar-lab-concept-ranking).
// 행 클릭은 학생 상세 허브의 어법 탭(/director/students/{id}?tab=grammar)으로
// 이어진다 — 구 grammar-lab/[studentId] 직행 링크의 후계 동선.
//
// embedded 계약(v3 C-1): embedded=true 면 자체 PageShell·SectionCard 타이틀 계층
// (「학생 앱 열기」 헤더 액션 포함)을 렌더하지 않고 내용부(헤더리스 카드+개념
// 랭킹+팝오버+컴포저)만 렌더한다 — 공통 셸(PageShell·페이지 헤더·뷰 스위처)은
// C-2 (manage) layout 담당. false/미지정이면 현행과 픽셀 동일(무회귀 — 기존
// page.tsx 소비처 무변경).
// ============================================================================

import { type ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ExternalLink, SpellCheck } from "lucide-react";

import type { GrammarLabStudentRow } from "@/actions/grammar-drill-admin";
import type { AcademyConceptRankingRow } from "@/actions/grammar-drill-insights";
import {
  PageShell,
  SectionCard,
  StatStrip,
  StatTile,
} from "@/components/layout/page-frame";
import {
  AssignmentComposer,
  type ComposerPreset,
} from "@/components/study-assignments/assignment-composer";
import {
  CONCEPT_SKELETON_BY_ID,
  GRAMMAR_UNITS,
} from "@/lib/grammar-drill/curriculum";
import { CTA_LABELS, METRIC_LABELS } from "@/lib/wording/director-glossary";
import { cn } from "@/lib/utils";
import { GrammarLabConceptRanking } from "./grammar-lab-concept-ranking";
import {
  GrammarLabTable,
  SORT_DEFAULT_DIR,
  isStalled,
  sortRows,
  type SortDir,
  type SortKey,
} from "./grammar-lab-table";
import {
  GrammarLabToolbar,
  UNASSIGNED_CLASS,
  type ClassFilter,
  type ClassOption,
} from "./grammar-lab-toolbar";

const TOTAL_UNITS = GRAMMAR_UNITS.length; // 12

/** 취약 개념 칩 팝오버 앵커 상태 — fixed 좌표(overflow-x-auto 테이블 클리핑 우회) */
interface WeakestPopoverState {
  studentId: string;
  weakest: NonNullable<GrammarLabStudentRow["weakest"]>;
  left: number;
  top: number;
}

const POPOVER_WIDTH = 288; // w-72
const POPOVER_EST_HEIGHT = 208;

export function GrammarLabListClient({
  students,
  conceptRanking,
  embedded = false,
}: {
  students: GrammarLabStudentRow[];
  conceptRanking: AcademyConceptRankingRow[];
  /** true: C-2 (manage) layout 셸에 얹히는 내용부 전용 렌더(상단 계약 주석 참조) */
  embedded?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);
  const [stalledOnly, setStalledOnly] = useState(false);
  const [classFilter, setClassFilter] = useState<ClassFilter>(null);
  const [gradeFilter, setGradeFilter] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [popover, setPopover] = useState<WeakestPopoverState | null>(null);
  // 컴포저 — 팝오버 '이 범위로 과제 보내기' · 다중 선택 '어법 과제 보내기' 공용
  const [composer, setComposer] = useState<{
    preset: ComposerPreset;
    studentIds: string[];
  } | null>(null);

  useEffect(() => {
    if (!popover) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopover(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popover]);

  const openWeakestPopover = (
    e: React.MouseEvent<HTMLButtonElement>,
    row: GrammarLabStudentRow,
  ) => {
    e.stopPropagation();
    if (!row.weakest) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const left = Math.max(
      12,
      Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 12),
    );
    const top =
      rect.bottom + 6 + POPOVER_EST_HEIGHT > window.innerHeight
        ? Math.max(12, rect.top - 6 - POPOVER_EST_HEIGHT)
        : rect.bottom + 6;
    setPopover({ studentId: row.studentId, weakest: row.weakest, left, top });
  };

  const stats = useMemo(() => {
    const active = students.filter((s) => s.totalAttempts > 0);
    const accuracies = active
      .map((s) => s.accuracy)
      .filter((a): a is number => a !== null);
    const avgAccuracy =
      accuracies.length > 0
        ? Math.round(accuracies.reduce((sum, a) => sum + a, 0) / accuracies.length)
        : null;
    return {
      activeCount: active.length,
      totalCount: students.length,
      totalAttempts: students.reduce((sum, s) => sum + s.totalAttempts, 0),
      avgAccuracy,
      masteredUnits: students.reduce((sum, s) => sum + s.unitsMastered, 0),
      openAssignments: students.reduce((sum, s) => sum + s.openAssignments, 0),
      stalledCount: students.filter(isStalled).length,
    };
  }, [students]);

  // 반/학년 칩 데이터 — rows 에 실존하는 값만 도출(서버 확장 0)
  const classData = useMemo(() => {
    const map = new Map<string, ClassOption>();
    let unassigned = 0;
    for (const s of students) {
      if (s.classes.length === 0) unassigned++;
      for (const c of s.classes) {
        const cur = map.get(c.id) ?? { id: c.id, name: c.name, count: 0 };
        cur.count++;
        map.set(c.id, cur);
      }
    }
    const classes = [...map.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "ko"),
    );
    return { classes, unassigned };
  }, [students]);

  const grades = useMemo(
    () => [...new Set(students.map((s) => s.grade))].sort((a, b) => a - b),
    [students],
  );

  const filtered = useMemo(() => {
    let rows = students;
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.studentCode.toLowerCase().includes(q),
      );
    }
    if (onlyActive) rows = rows.filter((s) => s.totalAttempts > 0);
    if (stalledOnly) rows = rows.filter(isStalled);
    if (classFilter === UNASSIGNED_CLASS)
      rows = rows.filter((s) => s.classes.length === 0);
    else if (classFilter)
      rows = rows.filter((s) => s.classes.some((c) => c.id === classFilter));
    if (gradeFilter !== null) rows = rows.filter((s) => s.grade === gradeFilter);
    return sortRows(rows, sortKey, sortDir);
  }, [students, query, onlyActive, stalledOnly, classFilter, gradeFilter, sortKey, sortDir]);

  const hasFilter =
    query.trim() !== "" ||
    onlyActive ||
    stalledOnly ||
    classFilter !== null ||
    gradeFilter !== null;

  const changeSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(SORT_DEFAULT_DIR[key]);
    }
  };

  const toggleSelect = (studentId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });

  // 표시 행 기준 전체 선택/해제 — 전부 선택돼 있으면 표시 행만 해제
  const toggleSelectAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      const allVisible =
        filtered.length > 0 && filtered.every((s) => next.has(s.studentId));
      for (const s of filtered) {
        if (allVisible) next.delete(s.studentId);
        else next.add(s.studentId);
      }
      return next;
    });

  const goStudent = (studentId: string) =>
    router.push(`/director/students/${studentId}?tab=grammar`);

  const openAssignSelected = () =>
    setComposer({
      preset: { kind: "GRAMMAR", grammarSpec: { count: 20 } },
      studentIds: [...selected],
    });

  // 팝오버 → 해당 개념 프리셋 배정 — 학생 허브 보충 과제 보내기 프리셋과 동일 계약
  const openAssignConcept = () => {
    if (!popover) return;
    setComposer({
      preset: {
        kind: "GRAMMAR",
        weakConcepts: [
          {
            conceptId: popover.weakest.conceptId,
            title: popover.weakest.title,
            score: popover.weakest.score,
          },
        ],
        grammarSpec: { conceptIds: [popover.weakest.conceptId], count: 20 },
      },
      studentIds: [popover.studentId],
    });
    setPopover(null);
  };

  return (
    <LabShell embedded={embedded}>
      <LabCard
        embedded={embedded}
        actions={
          <a
            href="/g"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            학생 앱 열기
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        }
      >
        {/* KPI 스트립 — 로스터 정본과 동일하게 카드 헤더 아래 내부 배치 */}
        <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3">
          <StatStrip className="lg:grid-cols-3 xl:grid-cols-6">
            <StatTile
              label="학습 학생"
              value={`${stats.activeCount}명`}
              sub={`전체 ${stats.totalCount}명`}
            />
            <StatTile
              label="누적 풀이"
              value={stats.totalAttempts.toLocaleString()}
              sub="문항"
            />
            <StatTile
              label="평균 정답률"
              value={stats.avgAccuracy === null ? "—" : `${stats.avgAccuracy}%`}
              sub="학습 학생 기준"
              tone={
                stats.avgAccuracy === null
                  ? "slate"
                  : stats.avgAccuracy >= 70
                    ? "emerald"
                    : stats.avgAccuracy < 50
                      ? "rose"
                      : "slate"
              }
            />
            <StatTile
              label="마스터 유닛"
              value={stats.masteredUnits.toLocaleString()}
              sub={`학생별 ${TOTAL_UNITS}유닛 기준`}
              tone={stats.masteredUnits > 0 ? "blue" : "slate"}
            />
            <StatTile
              label={METRIC_LABELS.INCOMPLETE_TASKS}
              value={`${stats.openAssignments}건`}
              tone={stats.openAssignments > 0 ? "blue" : "slate"}
            />
            {/* 정체 학생 타일 — 클릭 시 '정체 학생만' 필터 토글 */}
            <button
              type="button"
              onClick={() => setStalledOnly((v) => !v)}
              aria-pressed={stalledOnly}
              className="min-w-0 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
            >
              <StatTile
                label="정체 학생"
                value={`${stats.stalledCount}명`}
                sub="7일 이상 무활동"
                tone={stats.stalledCount > 0 ? "rose" : "slate"}
                className={cn(
                  "h-full transition-colors",
                  stalledOnly
                    ? "border-rose-300 bg-rose-50/40"
                    : "hover:border-rose-200",
                )}
              />
            </button>
          </StatStrip>
        </div>

        <GrammarLabToolbar
          query={query}
          onQueryChange={setQuery}
          onlyActive={onlyActive}
          onOnlyActiveChange={setOnlyActive}
          stalledOnly={stalledOnly}
          onStalledOnlyChange={setStalledOnly}
          classOptions={classData.classes}
          unassignedCount={classData.unassigned}
          classFilter={classFilter}
          onClassFilterChange={setClassFilter}
          grades={grades}
          gradeFilter={gradeFilter}
          onGradeFilterChange={setGradeFilter}
          resultRows={filtered}
          selectedCount={selected.size}
          onAssignSelected={openAssignSelected}
          onClearSelection={() => setSelected(new Set())}
        />

        <GrammarLabTable
          rows={filtered}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortChange={changeSort}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onRowClick={goStudent}
          onOpenWeakestPopover={openWeakestPopover}
          emptyMessage={
            hasFilter ? "조건에 맞는 학생이 없습니다." : "표시할 학생이 없습니다."
          }
        />
      </LabCard>

      <GrammarLabConceptRanking ranking={conceptRanking} />

      {/* 취약 개념 팝오버 — 개념 정의 1줄 + 시도·정답 근거 + 배정/그리드 링크 */}
      {popover && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => {
              e.stopPropagation();
              setPopover(null);
            }}
            aria-hidden
          />
          <div
            role="dialog"
            aria-label={`${METRIC_LABELS.WEAK} 개념 — ${popover.weakest.title}`}
            className="fixed z-50 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
            style={{ left: popover.left, top: popover.top }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="flex items-center gap-1.5 text-[12px] font-bold text-slate-800">
              <span className="truncate">{popover.weakest.title}</span>
              <span className="shrink-0 rounded-full bg-rose-50 px-1.5 py-px text-[10px] font-semibold tabular-nums text-rose-600">
                숙달도 {popover.weakest.score}점
              </span>
            </p>
            <p className="mt-1.5 break-keep text-[12px] leading-relaxed text-slate-600">
              {CONCEPT_SKELETON_BY_ID.get(popover.weakest.conceptId)
                ?.oneLiner ?? "개념 정의를 찾을 수 없습니다."}
            </p>
            <p className="mt-2 text-[11px] font-medium tabular-nums text-slate-500">
              시도 {popover.weakest.attempts}회 · 정답{" "}
              {popover.weakest.correct}회
            </p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={openAssignConcept}
                className="inline-flex h-7 items-center rounded-md border border-blue-200 bg-blue-50 px-2.5 text-[12px] font-semibold text-blue-700 transition-colors hover:bg-blue-100"
              >
                {CTA_LABELS.SEND_TASK_SCOPED}
              </button>
              <Link
                href={`/director/students/${popover.studentId}?tab=grammar`}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 transition-colors hover:text-blue-700"
              >
                개념 그리드
                <ChevronRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          </div>
        </>
      )}

      <AssignmentComposer
        open={composer !== null}
        onClose={() => setComposer(null)}
        preset={composer?.preset ?? null}
        defaultStudentIds={composer?.studentIds}
        onCreated={() => {
          setSelected(new Set());
          router.refresh();
        }}
      />
    </LabShell>
  );
}

// ── C-1 embedded 셸 분기 — 조건은 여기서만, 내용부는 위에서 단일 소스 ─────────────

/** false: 현행 PageShell(픽셀 동일) / true: layout 셸 아래 형제 간격만 미러한 div */
function LabShell({
  embedded,
  children,
}: {
  embedded: boolean;
  children: ReactNode;
}) {
  if (!embedded) return <PageShell>{children}</PageShell>;
  return <div className="flex w-full min-w-0 flex-col gap-4">{children}</div>;
}

/** false: 현행 SectionCard(픽셀 동일) / true: 타이틀 계층 없는 동일 카드 프레임 */
function LabCard({
  embedded,
  actions,
  children,
}: {
  embedded: boolean;
  actions: ReactNode;
  children: ReactNode;
}) {
  if (!embedded) {
    return (
      <SectionCard
        icon={SpellCheck}
        title="어법 훈련 현황"
        description={`학생별 어법 훈련 진행과 ${METRIC_LABELS.WEAK} 개념을 모니터링합니다. 상세 분석은 학생 카드에서 이어집니다.`}
        actions={actions}
        bodyClassName="p-0"
      >
        {children}
      </SectionCard>
    );
  }
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="min-w-0 p-0">{children}</div>
    </section>
  );
}
