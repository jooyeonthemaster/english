"use client";

// ============================================================================
// 과제 관리 보드 — /director/students/assignments 본체 (설계 §5)
//
// 좌(lg) = 월 캘린더(assignments-calendar, ◀▶ 이동 시 listStudyAssignments
// ({month}) 재조회·월별 캐시), 우 = 과제 목록 카드(assignment-list-card).
// 카드 클릭 → 상세 와이드 모달(assignment-detail-modal). ?open={id} 딥링크는
// 학생 상세 과제 탭에서 오고, ?student={id} 딥링크(학생별 필터)와 함께
// router.replace 로 URL 을 동기화한다. 학생/반 대상 필터는 서버 재조회
// (listStudyAssignments({studentId|classId})), 종류·상태·검색·정렬은 클라 처리.
//
// embedded 계약(v3 C-1): embedded=true 면 자체 PageShell·SectionCard 타이틀 계층
// (「새 과제」 헤더 액션 포함)을 렌더하지 않고 내용부(헤더리스 카드+모달)만 렌더
// 한다 — 공통 셸(PageShell·페이지 헤더·뷰 스위처)은 C-2 (manage) layout 담당.
// URL 동기화·딥링크(?open=·?student=)는 embedded 여부와 무관하게 동일 동작.
// false/미지정이면 현행과 픽셀 동일(무회귀 — 기존 page.tsx 소비처 무변경).
// ============================================================================

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { ClipboardList, ListFilter, Plus, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { listStudyAssignments } from "@/actions/study-assignments";
import { PageShell, SectionCard } from "@/components/layout/page-frame";
import {
  AssignmentComposer,
  type ComposerPreset,
} from "@/components/study-assignments/assignment-composer";
import type {
  StudyAssignmentKind,
  StudyAssignmentListRow,
} from "@/lib/study-assignments/types";
import { STUDY_KIND_META } from "@/lib/study-assignments/types";
import { CTA_LABELS } from "@/lib/wording/director-glossary";
import { cn } from "@/lib/utils";
import { AssignmentsCalendar, seoulDateKey } from "./assignments-calendar";
import { AssignmentDetailModal } from "./assignment-detail-modal";
import {
  AssignmentListPanel,
  CHIP_ACTIVE,
  CHIP_IDLE,
  compareBoardRows,
  isActionNeeded,
  type BoardSortKey,
} from "./assignment-list-card";
import {
  AssignmentsTargetFilter,
  BoardKpiStrip,
  type BoardTargetFilter,
} from "./assignments-target-filter";

type KindFilter = StudyAssignmentKind | "ALL";
/** OVERDUE 는 서버 상태가 아닌 가상 키 — ACTIVE && overdueCount>0 클라 판정 */
type StatusFilter = "ALL" | "ACTIVE" | "CLOSED" | "OVERDUE";

const KIND_FILTERS: { key: KindFilter; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "EXAM", label: STUDY_KIND_META.EXAM.label },
  { key: "WORKSHEET", label: STUDY_KIND_META.WORKSHEET.label },
  { key: "QUESTIONS", label: STUDY_KIND_META.QUESTIONS.label },
  { key: "GRAMMAR", label: STUDY_KIND_META.GRAMMAR.label },
];

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "ACTIVE", label: "진행 중" },
  { key: "OVERDUE", label: "기한 지남" },
  { key: "CLOSED", label: "종료" },
];

/** 기한 지남 칩만 rose 활성 변형 — 상태 칩의 유일한 예외(플랜 합의) */
const CHIP_ACTIVE_ROSE = "border-rose-600 bg-rose-50/40 text-rose-700 shadow-sm";

const SORT_STORAGE_KEY = "smoat.assignmentsBoard.sort";

/** 선택 날짜 매칭 — dueAt 기준, 마감 없는 과제는 시작일(availableFrom) 셀 소속 */
function matchesSelectedDate(r: StudyAssignmentListRow, date: string): boolean {
  return r.dueAt ? seoulDateKey(r.dueAt) === date : seoulDateKey(r.availableFrom) === date;
}

export function AssignmentsBoardClient({
  initialMonth,
  initialMonthRows,
  initialRows,
  openAssignmentId,
  initialStudentId,
  embedded = false,
}: {
  /** 서울 기준 이번 달 — "YYYY-MM" */
  initialMonth: string;
  /** 이번 달 캘린더 데이터(서버 초기 적재 — ?student= 필터 반영분) */
  initialMonthRows: StudyAssignmentListRow[];
  /** 전체 최근 과제(목록 패널, 서버 초기 적재 — ?student= 필터 반영분) */
  initialRows: StudyAssignmentListRow[];
  /** ?open= 딥링크 — 상세 모달 자동 오픈 */
  openAssignmentId: string | null;
  /** ?student= 딥링크 — 학생별 필터(이름은 클라에서 로스터 로드 후 해석) */
  initialStudentId: string | null;
  /** true: C-2 (manage) layout 셸에 얹히는 내용부 전용 렌더(상단 계약 주석 참조) */
  embedded?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [listRows, setListRows] = useState<StudyAssignmentListRow[]>(initialRows);
  const [month, setMonth] = useState(initialMonth);
  const [rowsByMonth, setRowsByMonth] = useState<Record<string, StudyAssignmentListRow[]>>({
    [initialMonth]: initialMonthRows,
  });
  const [monthLoading, startMonthLoad] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const [kindFilter, setKindFilter] = useState<KindFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [targetFilter, setTargetFilter] = useState<BoardTargetFilter | null>(
    initialStudentId ? { type: "STUDENT", id: initialStudentId, name: "" } : null,
  );
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<BoardSortKey>("recent");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(openAssignmentId);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerPreset, setComposerPreset] = useState<ComposerPreset | null>(null);
  const [composerStudentIds, setComposerStudentIds] = useState<string[] | undefined>(undefined);
  const [composerDefaultDue, setComposerDefaultDue] = useState<string | undefined>(undefined);

  // ?open= 딥링크 → 모달 동기화 (학생 상세 과제 탭에서 링크로 진입)
  useEffect(() => {
    setDetailId(openAssignmentId);
  }, [openAssignmentId]);

  // 정렬 복원 — SSR 하이드레이션 미스매치 회피를 위해 마운트 후 1회
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SORT_STORAGE_KEY);
      if (saved === "recent" || saved === "due" || saved === "progress") setSortKey(saved);
    } catch {
      /* 접근 불가(프라이빗 모드 등) — 기본값 유지 */
    }
  }, []);

  /** URL 동기화 — ?open(상세)·?student(학생 필터) 두 파라미터를 함께 관리 */
  const syncUrl = useCallback(
    (open: string | null, student: string | null) => {
      const params = new URLSearchParams();
      if (student) params.set("student", student);
      if (open) params.set("open", open);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const studentParam = targetFilter?.type === "STUDENT" ? targetFilter.id : null;

  const openDetail = useCallback(
    (id: string) => {
      setDetailId(id);
      syncUrl(id, studentParam);
    },
    [studentParam, syncUrl],
  );

  const closeDetail = useCallback(() => {
    setDetailId(null);
    syncUrl(null, studentParam);
  }, [studentParam, syncUrl]);

  // 서버 필터 인자 정본 — 목록·월 캐시·refresh 세 경로가 전부 이 객체 하나를
  // 스프레드한다(경로별 필터 누락 방지, 플랜 합의).
  const serverFilter = useMemo<{ studentId?: string; classId?: string }>(() => {
    if (!targetFilter) return {};
    return targetFilter.type === "STUDENT"
      ? { studentId: targetFilter.id }
      : { classId: targetFilter.id };
  }, [targetFilter]);

  /** 목록+현재 달 동시 재조회 — 타 월 캐시는 무효화(현재 달만 남김) */
  const reloadWithFilter = useCallback(
    (filter: { studentId?: string; classId?: string }) => {
      startRefresh(async () => {
        const [allRes, monthRes] = await Promise.all([
          listStudyAssignments({ ...filter }),
          listStudyAssignments({ ...filter, month }),
        ]);
        if (allRes.success) setListRows(allRes.data ?? []);
        if (monthRes.success) setRowsByMonth({ [month]: monthRes.data ?? [] });
      });
    },
    [month, startRefresh],
  );

  /** 변경(생성·마감·종료/재개·삭제) 후 — 현재 대상 필터를 유지한 채 재조회 */
  const refresh = useCallback(
    () => reloadWithFilter(serverFilter),
    [reloadWithFilter, serverFilter],
  );

  /** 대상 필터 적용 — 같은 대상이면 딥링크 이름 해석(라벨 갱신)만, 재조회 생략 */
  const applyTargetFilter = useCallback(
    (next: BoardTargetFilter | null) => {
      const sameTarget =
        !!next && !!targetFilter && next.type === targetFilter.type && next.id === targetFilter.id;
      setTargetFilter(next);
      if (sameTarget) return;
      syncUrl(detailId, next?.type === "STUDENT" ? next.id : null);
      reloadWithFilter(
        next === null
          ? {}
          : next.type === "STUDENT"
            ? { studentId: next.id }
            : { classId: next.id },
      );
    },
    [detailId, reloadWithFilter, syncUrl, targetFilter],
  );

  const changeMonth = useCallback(
    (next: string) => {
      setMonth(next);
      setSelectedDate(null);
      if (!rowsByMonth[next]) {
        startMonthLoad(async () => {
          const res = await listStudyAssignments({ ...serverFilter, month: next });
          if (res.success) {
            setRowsByMonth((cur) => ({ ...cur, [next]: res.data ?? [] }));
          }
        });
      }
    },
    [rowsByMonth, serverFilter, startMonthLoad],
  );

  const changeSort = useCallback((key: BoardSortKey) => {
    setSortKey(key);
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, key);
    } catch {
      /* 저장 불가 — 세션 내 상태만 유지 */
    }
  }, []);

  /** KPI "오늘 마감" — 오늘이 속한 달로 이동(캐시 시 즉시) 후 날짜 선택 */
  const jumpToToday = useCallback(() => {
    const key = seoulDateKey(new Date());
    const m = key.slice(0, 7);
    if (m !== month) changeMonth(m);
    // KPI "오늘 마감" 타일은 무필터 전체 집계 — 도착 화면 필터도 무필터로 맞춘다
    setKindFilter("ALL");
    setStatusFilter("ALL");
    setQuery("");
    setSelectedDate(key); // changeMonth 의 setSelectedDate(null)보다 나중 커밋
  }, [changeMonth, month]);

  const openComposer = useCallback(
    (preset: ComposerPreset | null, studentIds?: string[], defaultDue?: string) => {
      setComposerPreset(preset);
      setComposerStudentIds(studentIds && studentIds.length > 0 ? studentIds : undefined);
      setComposerDefaultDue(defaultDue);
      setComposerOpen(true);
    },
    [],
  );

  /** U4 상세 모달 "복제해 새 과제/미완료 재배포" — 플랜 합의 시그니처 */
  const handleDuplicate = useCallback(
    (preset: ComposerPreset, studentIds: string[]) => {
      closeDetail();
      openComposer(preset, studentIds);
    },
    [closeDetail, openComposer],
  );

  const q = query.trim().toLowerCase();
  const matchesFilters = useCallback(
    (r: StudyAssignmentListRow) => {
      if (kindFilter !== "ALL" && r.kind !== kindFilter) return false;
      if (statusFilter === "OVERDUE") {
        if (!isActionNeeded(r)) return false;
      } else if (statusFilter !== "ALL" && r.status !== statusFilter) {
        return false;
      }
      if (q) {
        // 클라 검색 캐빗: 무필터 목록은 최신 200건(월 조회 500건)만 적재된 상태라
        // 그보다 오래된 과제는 잡히지 않는다 — 반 이름(targetSummary) 검색이 핵심.
        if (
          !r.title.toLowerCase().includes(q) &&
          !(r.targetSummary ?? "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    },
    [kindFilter, statusFilter, q],
  );

  const calendarRows = useMemo(
    () => (rowsByMonth[month] ?? []).filter(matchesFilters),
    [rowsByMonth, month, matchesFilters],
  );

  // 핀 파티션 후 그룹 내 정렬(플랜 합의) — "조치 필요" 핀은 날짜 필터 없는
  // 기본 뷰에서만. 날짜 선택 시에는 그 날짜 과제를 단일 그룹으로 정렬만 한다.
  const { pinnedRows, restRows } = useMemo(() => {
    const base = selectedDate
      ? calendarRows.filter((r) => matchesSelectedDate(r, selectedDate))
      : listRows.filter(matchesFilters);
    const sorted = [...base].sort((a, b) => compareBoardRows(a, b, sortKey));
    if (selectedDate) return { pinnedRows: [] as StudyAssignmentListRow[], restRows: sorted };
    return {
      pinnedRows: sorted.filter(isActionNeeded),
      restRows: sorted.filter((r) => !isActionNeeded(r)),
    };
  }, [selectedDate, calendarRows, listRows, matchesFilters, sortKey]);

  const kindCounts = useMemo(() => {
    const counts: Record<KindFilter, number> = {
      ALL: listRows.length,
      EXAM: 0,
      WORKSHEET: 0,
      QUESTIONS: 0,
      GRAMMAR: 0,
    };
    for (const r of listRows) counts[r.kind] += 1;
    return counts;
  }, [listRows]);

  // 대상 필터가 걸려 있으면 결과 0건이어도 필터 UI 가 있는 일반 뷰를 유지한다
  const showGlobalEmpty = listRows.length === 0 && targetFilter === null;
  const now = new Date();
  const todayKey = seoulDateKey(now);

  return (
    <BoardShell embedded={embedded}>
      <BoardCard
        embedded={embedded}
        actions={
          <button
            type="button"
            onClick={() => openComposer(null)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-blue-700"
          >
            <Plus className="size-3.5" aria-hidden />
            {CTA_LABELS.NEW_TASK}
          </button>
        }
      >
        {/* KPI 스트립 — 타일 클릭 = 필터/정렬 적용 */}
        {listRows.length > 0 ? (
          <BoardKpiStrip
            rows={listRows}
            todayKey={todayKey}
            onShowActive={() => {
              setKindFilter("ALL");
              setQuery("");
              setStatusFilter("ACTIVE");
              setSelectedDate(null);
            }}
            onShowToday={jumpToToday}
            onShowOverdue={() => {
              setKindFilter("ALL");
              setQuery("");
              setStatusFilter("OVERDUE");
              setSelectedDate(null);
            }}
            onSortByProgress={() => changeSort("progress")}
          />
        ) : null}

        {/* 필터 바 — 종류 탭(좌) + 우측 끝 고정 [필터·검색] 아이콘 팝오버 (어드민 공용 규약) */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {KIND_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setKindFilter(f.key)}
                aria-pressed={kindFilter === f.key}
                className={cn(
                  "h-8 rounded-md border px-3 text-[12.5px] font-semibold transition-colors",
                  kindFilter === f.key ? CHIP_ACTIVE : CHIP_IDLE,
                )}
              >
                {f.label}
                <span className="ml-1 text-[11px] tabular-nums opacity-70">
                  {kindCounts[f.key]}
                </span>
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <Popover>
              <PopoverTrigger
                title="필터"
                aria-label="필터"
                className="relative flex size-7 shrink-0 items-center justify-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] outline-none hover:bg-slate-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <ListFilter className="size-3.5 shrink-0" />
                {statusFilter !== "ALL" || targetFilter !== null ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-1 right-1 inline-block size-1.5 rounded-full bg-blue-500"
                  />
                ) : null}
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-3">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium text-slate-600">상태</span>
                    <div className="flex flex-wrap gap-1.5">
                      {STATUS_FILTERS.map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => setStatusFilter(f.key)}
                          aria-pressed={statusFilter === f.key}
                          className={cn(
                            "h-7 rounded-md border px-2.5 text-[12px] font-semibold transition-colors",
                            statusFilter === f.key
                              ? f.key === "OVERDUE"
                                ? CHIP_ACTIVE_ROSE
                                : CHIP_ACTIVE
                              : CHIP_IDLE,
                          )}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium text-slate-600">대상</span>
                    <AssignmentsTargetFilter
                      value={targetFilter}
                      onChange={applyTargetFilter}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger
                title="검색"
                aria-label="검색"
                className="relative flex size-7 shrink-0 items-center justify-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] outline-none hover:bg-slate-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Search className="size-3.5 shrink-0" />
                {query ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-1 right-1 inline-block size-1.5 rounded-full bg-blue-500"
                  />
                ) : null}
              </PopoverTrigger>
              <PopoverContent align="end" className="w-60 p-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium text-slate-600">검색</span>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
                      aria-hidden
                    />
                    <input
                      autoFocus
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="제목·대상 검색"
                      aria-label="과제 검색"
                      className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-2.5 text-[13px] text-slate-700 outline-none placeholder:text-slate-300 focus:border-blue-400"
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {showGlobalEmpty ? (
          /* 빈 상태 — 아직 과제 0건(대상 필터 없음) */
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-16">
            <ClipboardList className="size-10 text-slate-300" aria-hidden />
            <p className="text-[13.5px] font-semibold text-slate-500">
              아직 배포한 과제가 없습니다
            </p>
            <p className="text-[12px] text-slate-400">
              시험지·학습지·문제·어법 훈련을 학생의 학습 앱으로 배포해 보세요.
            </p>
            <button
              type="button"
              onClick={() => openComposer(null)}
              className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700"
            >
              <Plus className="size-4" aria-hidden />
              {CTA_LABELS.NEW_TASK}
            </button>
          </div>
        ) : (
          // 캘린더를 넓게(좌우 동등 폭) + 좌우 컬럼 높이 고정으로 아래 끝선 정렬 —
          // 목록은 컬럼 안에서 내부 스크롤한다(spec §6 섹션 높이 정합).
          <div className="grid grid-cols-1 items-start gap-4 lg:h-[660px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-stretch xl:h-[700px]">
            {/* 좌: 월 캘린더 */}
            <AssignmentsCalendar
              month={month}
              rows={calendarRows}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onMonthChange={changeMonth}
              loading={monthLoading}
            />

            {/* 우: 과제 목록(카운트·정렬·핀 그룹·카드) — assignment-list-card */}
            <AssignmentListPanel
              pinnedRows={pinnedRows}
              restRows={restRows}
              now={now}
              refreshing={refreshing}
              selectedDate={selectedDate}
              sortKey={sortKey}
              onChangeSort={changeSort}
              onClearDate={() => setSelectedDate(null)}
              onCreateForDate={(date) => openComposer(null, undefined, date)}
              onOpen={openDetail}
            />
          </div>
        )}
      </BoardCard>

      <AssignmentComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        preset={composerPreset}
        defaultStudentIds={composerStudentIds}
        onCreated={() => refresh()}
        // U2 계약(defaultDue?: "YYYY-MM-DD") 선배선 — 스프레드는 TS 초과 prop
        // 검사를 우회하므로 U2 랜딩 전에도 컴파일 안전, 랜딩 시 그대로 소비된다.
        {...{ defaultDue: composerDefaultDue }}
      />

      <AssignmentDetailModal
        assignmentId={detailId}
        onClose={closeDetail}
        onChanged={refresh}
        // U4 계약(onDuplicate?: (preset, studentIds) => void) 선배선 — 위와 같은
        // 스프레드 패턴. 시그니처는 플랜에서 U3·U4 사전 합의 완료.
        {...{ onDuplicate: handleDuplicate }}
      />
    </BoardShell>
  );
}

// ── C-1 embedded 셸 분기 — 조건은 여기서만, 내용부는 위에서 단일 소스 ─────────────

/** false: 현행 PageShell(픽셀 동일) / true: layout 셸 아래 형제 간격만 미러한 div */
function BoardShell({
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
function BoardCard({
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
        icon={ClipboardList}
        title="과제 관리"
        description="배포한 시험·학습지·문제·어법 훈련 과제의 마감과 진행을 한눈에 관리합니다."
        actions={actions}
        bodyClassName="p-4 sm:p-5"
      >
        {children}
      </SectionCard>
    );
  }
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="min-w-0 p-4 sm:p-5">{children}</div>
    </section>
  );
}
