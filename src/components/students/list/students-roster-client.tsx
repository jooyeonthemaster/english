"use client";

// ============================================================================
// /director/students 정본 로스터 허브 — 학생 관리 계층의 진입점
//
// 구 StudentListClient(토스 스킨)를 대체하는 신식 로스터. 디자인 바이블 §2
// (PageShell + SectionCard + StatTile/StatusPill, slate/blue 언어)로 재구축.
// KPI 스트립 클릭 = URL 필터 드릴다운, 행 클릭 → 학생 상세 허브.
// 등록 다이얼로그(단건/대량)는 기존 tutor 허브 자산을 임포트만으로 재사용.
// 벌크 선택(Map<id,이름>)은 페이지·필터 전환에도 유지 — 선택 바(sticky)에서
// 과제 배포(AssignmentComposer)·반 편성으로 이어진다.
// ============================================================================

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchX, Upload, UserPlus, Users } from "lucide-react";
import {
  PageShell,
  SectionCard,
  StatStrip,
  StatTile,
  type PillTone,
} from "@/components/layout/page-frame";
import { StudentFormDialog } from "@/components/students/student-form-dialog";
import { StudentBulkImportDialog } from "@/app/(director)/director/tutor/_components/student-bulk-import-dialog";
import { AssignmentComposer } from "@/components/study-assignments/assignment-composer";
import {
  UNASSIGNED_CLASS_ID,
  type HubClass,
  type HubFilters,
  type HubSchool,
  type HubStats,
  type StudentsResult,
} from "@/app/(director)/director/tutor/_components/types";
import { cn } from "@/lib/utils";
import { RosterToolbar } from "./roster-toolbar";
import { RosterTable, type RosterSort } from "./roster-table";
import { RosterSelectionBar } from "./roster-selection-bar";

/** 행 밀도(좁게) 선호 저장 키 */
const DENSE_STORAGE_KEY = "students:roster:dense";

const BASE_PATH = "/director/students";

interface KpiDef {
  key: string;
  label: string;
  value: number;
  sub?: string;
  tone: PillTone;
  active: boolean;
  onClick: () => void;
}

export function StudentsRosterClient({
  academyId,
  studentsData,
  schools,
  classes,
  stats,
  filters,
  sort,
  isDirector,
  showBilling,
}: {
  academyId: string;
  studentsData: StudentsResult;
  schools: HubSchool[];
  classes: HubClass[];
  stats: HubStats;
  filters: HubFilters;
  sort: RosterSort;
  isDirector: boolean;
  showBilling: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // isPending — 필터·페이지 전환 중 테이블 디밍 + 툴바 스핀(무반응 이중 클릭 방지)
  const [isPending, startTransition] = useTransition();

  const [studentDialogOpen, setStudentDialogOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  // 벌크 선택 — id→이름. URL(페이지·필터) 전환에도 컴포넌트가 유지되므로
  // 여러 페이지를 오가며 모은 선택이 그대로 남는다(선택 바가 실명으로 노출).
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [composerOpen, setComposerOpen] = useState(false);

  // 행 밀도 — 마운트 후 localStorage 로드(SSR 하이드레이션 미스매치 회피)
  const [dense, setDense] = useState(false);
  useEffect(() => {
    try {
      setDense(localStorage.getItem(DENSE_STORAGE_KEY) === "1");
    } catch {
      /* localStorage 접근 불가 환경 무시 */
    }
  }, []);
  function toggleDense() {
    setDense((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(DENSE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* noop */
      }
      return next;
    });
  }

  const noStudentsAtAll = stats.totalStudents === 0;

  function updateParams(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value && value !== "ALL") params.set(key, value);
      else params.delete(key);
    }
    if (!("page" in updates)) params.delete("page");
    startTransition(() => {
      const query = params.toString();
      router.push(query ? `${BASE_PATH}?${query}` : BASE_PATH);
    });
  }

  function resetFilters() {
    startTransition(() => router.push(BASE_PATH));
  }

  function refresh() {
    startTransition(() => router.refresh());
  }

  function toggleSelect(id: string, name: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, name);
      return next;
    });
  }

  function togglePage(rows: { id: string; name: string }[], select: boolean) {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const r of rows) {
        if (select) next.set(r.id, r.name);
        else next.delete(r.id);
      }
      return next;
    });
  }

  // ── KPI 스트립 (getTutorHubStats 소스, 클릭=필터) ──────────────────────────
  const kpis: KpiDef[] = [
    {
      key: "active",
      label: "재원",
      value: stats.activeStudents,
      sub: `전체 ${stats.totalStudents.toLocaleString()}명`,
      tone: "blue",
      active: filters.status === "ACTIVE" && !filters.classId && !filters.billing,
      onClick: () =>
        updateParams({
          status: filters.status === "ACTIVE" ? undefined : "ACTIVE",
          classId: undefined,
          billing: undefined,
        }),
    },
    {
      key: "unassigned",
      label: "미배정",
      value: stats.unassignedCount,
      sub: "반 미편성 재원생",
      tone: stats.unassignedCount > 0 ? "rose" : "slate",
      active: filters.classId === UNASSIGNED_CLASS_ID,
      onClick: () => {
        const on = filters.classId === UNASSIGNED_CLASS_ID;
        updateParams({
          classId: on ? undefined : UNASSIGNED_CLASS_ID,
          // KPI(unassignedCount)는 ACTIVE 스코프 — 목록도 ACTIVE로 맞춰
          // 칩 숫자와 노출 행수를 일치시킨다(토글 해제 시 함께 비운다).
          status: on ? undefined : "ACTIVE",
          billing: undefined,
        });
      },
    },
    ...(showBilling
      ? [
          {
            key: "unpaid",
            label: "미납·연체",
            value: stats.unpaidCount,
            sub: "이번 청구 기준",
            tone: (stats.unpaidCount > 0 ? "rose" : "slate") as PillTone,
            active: filters.billing === "unpaid",
            onClick: () =>
              updateParams({
                billing: filters.billing === "unpaid" ? undefined : "unpaid",
                classId: undefined,
              }),
          } satisfies KpiDef,
        ]
      : []),
    {
      key: "paused",
      label: "휴원·대기",
      value: stats.pausedWaitingCount,
      sub: "휴원·대기 합산",
      tone: "slate",
      // 칩 숫자는 PAUSED+WAITING 합산 — 목록도 가상 상태값으로 두 상태를 함께 건다.
      active: filters.status === "PAUSED_WAITING",
      onClick: () =>
        updateParams({
          status: filters.status === "PAUSED_WAITING" ? undefined : "PAUSED_WAITING",
          classId: undefined,
          billing: undefined,
        }),
    },
  ];

  const headerActions = (
    <>
      <button
        type="button"
        onClick={() => setBulkImportOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
      >
        <Upload className="size-3.5" aria-hidden />
        대량 등록
      </button>
      <button
        type="button"
        onClick={() => setStudentDialogOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-blue-700"
      >
        <UserPlus className="size-3.5" aria-hidden />
        학생 등록
      </button>
    </>
  );

  return (
    <PageShell>
      <SectionCard
        icon={Users}
        title="학생 관리"
        description="원생 등록·반 편성·학습 현황을 한 곳에서 관리합니다."
        actions={headerActions}
        bodyClassName="p-0"
      >
        {noStudentsAtAll ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16">
            <span className="flex size-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <Users className="size-6" aria-hidden />
            </span>
            <div className="text-center">
              <p className="text-[14px] font-bold text-slate-900">
                아직 등록된 학생이 없습니다
              </p>
              <p className="mt-1 text-[12.5px] text-slate-400">
                학생을 등록하면 반 편성·과제 배포·학습 현황 관리를 시작할 수 있습니다.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBulkImportOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                <Upload className="size-3.5" aria-hidden />
                대량 등록
              </button>
              <button
                type="button"
                onClick={() => setStudentDialogOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700"
              >
                <UserPlus className="size-3.5" aria-hidden />
                첫 학생 등록
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* KPI 스트립 — 클릭 = 필터 드릴다운 */}
            <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3">
              <StatStrip
                className={cn(
                  "sm:grid-cols-2",
                  showBilling
                    ? "lg:grid-cols-4 xl:grid-cols-4"
                    : "lg:grid-cols-3 xl:grid-cols-3",
                )}
              >
                {kpis.map((kpi) => (
                  <button
                    key={kpi.key}
                    type="button"
                    onClick={kpi.onClick}
                    aria-pressed={kpi.active}
                    className="min-w-0 text-left"
                  >
                    <StatTile
                      label={kpi.label}
                      value={kpi.value.toLocaleString()}
                      sub={kpi.sub}
                      tone={kpi.value === 0 ? "slate" : kpi.tone}
                      className={cn(
                        "h-full transition-colors",
                        kpi.active
                          ? "border-blue-400 ring-1 ring-blue-200"
                          : "hover:border-slate-300",
                      )}
                    />
                  </button>
                ))}
              </StatStrip>
            </div>

            <RosterToolbar
              filters={filters}
              classes={classes}
              schools={schools}
              sort={sort}
              isPending={isPending}
              dense={dense}
              onToggleDense={toggleDense}
              updateParams={updateParams}
              onRefresh={refresh}
            />

            {studentsData.students.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-14">
                <SearchX className="size-8 text-slate-300" aria-hidden />
                <p className="text-[13px] text-slate-400">조건에 맞는 학생이 없습니다.</p>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-[12.5px] font-semibold text-blue-600 transition-colors hover:text-blue-700"
                >
                  필터 초기화
                </button>
              </div>
            ) : (
              // 전환 중 디밍 — 필터·페이지 클릭 후 무반응(이중 클릭) 방지 피드백
              <div
                aria-busy={isPending}
                className={cn(
                  "transition-opacity",
                  isPending && "pointer-events-none opacity-60",
                )}
              >
                <RosterTable
                  studentsData={studentsData}
                  showBilling={showBilling}
                  dense={dense}
                  sort={sort}
                  onSort={(key) =>
                    updateParams({ sort: sort === key ? undefined : key })
                  }
                  selected={selected}
                  onToggleSelect={toggleSelect}
                  onTogglePage={togglePage}
                  onPage={(page) => updateParams({ page: page.toString() })}
                />
              </div>
            )}
          </>
        )}
      </SectionCard>

      {/* 벌크 선택 바 — SectionCard 가 overflow-hidden 이라 카드 밖에서 sticky */}
      <RosterSelectionBar
        selected={selected}
        classes={classes}
        isDirector={isDirector}
        onAssign={() => setComposerOpen(true)}
        onClear={() => setSelected(new Map())}
        onEnrolled={() => {
          setSelected(new Map());
          refresh();
        }}
      />

      {/* 과제 배포 — 선택 학생 프리셀렉트(성공 토스트는 컴포저가 담당) */}
      <AssignmentComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        preset={null}
        defaultStudentIds={[...selected.keys()]}
        onCreated={() => {
          setSelected(new Map());
          refresh();
        }}
      />

      <StudentFormDialog
        open={studentDialogOpen}
        onOpenChange={setStudentDialogOpen}
        student={null}
        schools={schools}
        classes={classes}
        showBilling={showBilling}
        isDirector={isDirector}
      />

      <StudentBulkImportDialog
        open={bulkImportOpen}
        onOpenChange={setBulkImportOpen}
        academyId={academyId}
      />
    </PageShell>
  );
}
