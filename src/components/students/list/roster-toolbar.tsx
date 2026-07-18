"use client";

// ============================================================================
// 학생 로스터 툴바 — [과제 배포·반 추가] 액션 + 우측 [CSV·필터·검색] 아이콘
//
// 상태(전체/재원/휴원/퇴원/대기)·학년·학교는 모두 필터 팝오버 안으로 접었다.
//
// 레이아웃 규약은 과제 관리 보드(assignments-board-client)와 통일한다.
//
// 단일 소스는 URL 쿼리(updateParams 드릴다운) — 필터 상태를 서버 페이지가
// 다시 읽어 getStudents 를 재조회한다. 디자인 바이블 §2 필터 칩 언어.
// 검색은 '/' 단축키로 포커스, X 로 즉시 클리어(디바운스 건너뜀).
// ============================================================================

import { useEffect, useRef, useState, useTransition } from "react";
import {
  ClipboardList,
  Download,
  ListFilter,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { GRADES, STUDENT_STATUSES } from "@/lib/constants";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { exportStudentsRosterCsv, type StudentFilters } from "@/actions/students";
import { createClass } from "@/actions/classes";
import { cn } from "@/lib/utils";
import { triggerHintGlow } from "@/lib/hint-glow";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
// 필터 칩 활성·비활성 톤 — 과제 관리 보드와 같은 단일 소스(통일감 유지).
import { CHIP_ACTIVE, CHIP_IDLE } from "@/components/study-assignments/assignment-list-card";
import {
  type HubFilters,
  type HubSchool,
  type UpdateParams,
} from "@/app/(director)/director/tutor/_components/types";
import type { RosterSort } from "./roster-table";

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "ALL", label: "전체" },
  ...STUDENT_STATUSES.map((s) => ({ value: s.value, label: s.label })),
];

/** 우측 유틸 아이콘 버튼 — 필터·검색 팝오버 트리거와 같은 size-7 규격. */
const ICON_BTN =
  "relative flex size-7 shrink-0 items-center justify-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] outline-none hover:bg-slate-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** 활성 표시 파란 점 — 팝오버 안에 걸린 조건이 있음을 트리거에서 알린다. */
function ActiveDot() {
  return (
    <span
      aria-hidden="true"
      className="absolute top-1 right-1 inline-block size-1.5 rounded-full bg-blue-500"
    />
  );
}

const selectClass =
  "h-8 shrink-0 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-600 outline-none transition-colors focus:border-blue-400";

export function RosterToolbar({
  filters,
  schools,
  sort,
  isDirector,
  selectedIds,
  onOpenComposer,
  onClearSelection,
  updateParams,
  onRefresh,
}: {
  filters: HubFilters;
  schools: HubSchool[];
  sort: RosterSort;
  /** 반 생성은 원장 전용(서버에서도 검증) */
  isDirector: boolean;
  /** 체크된 학생 id — 과제 배포·CSV 내보내기 대상 */
  selectedIds: string[];
  /** 과제 배포 컴포저 열기(선택 1명 이상일 때만 호출된다) */
  onOpenComposer: () => void;
  /** 선택 전체 해제 */
  onClearSelection: () => void;
  updateParams: UpdateParams;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState(filters.search ?? "");
  const [exporting, setExporting] = useState(false);
  // 검색 팝오버 열림 — '/' 단축키가 여는 대상(입력은 마운트 시 autoFocus).
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  // 필터 트리거 파란 점 판정 — 팝오버가 닫혀 있어도 걸린 조건을 알린다.
  const hasSelection = selectedIds.length > 0;
  const gradeActive = filters.grade != null;
  const schoolActive = Boolean(filters.schoolId);
  const statusActive = Boolean(filters.status) && filters.status !== "ALL";
  // 반 인라인 생성 — 구 반 칩 줄에 있던 흐름을 상태 탭 옆으로 옮겨왔다.
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, startCreate] = useTransition();

  function submitCreate() {
    const name = newName.trim();
    if (!name) {
      setAdding(false);
      return;
    }
    startCreate(async () => {
      const res = await createClass("__CURRENT__", {
        name,
        capacity: 20,
        fee: 0,
        schedule: [],
      });
      if (res.success) {
        toast.success(`"${name}" 반을 만들었습니다.`);
        setNewName("");
        setAdding(false);
        onRefresh();
      } else {
        toast.error(res.error ?? "반 생성에 실패했습니다.");
      }
    });
  }
  // 타이핑 즉시(라이브) 검색 — 입력 멈추면 커밋, Enter 는 즉시 커밋.
  const { schedule, flush } = useSearchDebounce((v) =>
    updateParams({ search: v || undefined, page: undefined }),
  );

  // '/' 단축키 → 검색 포커스 (입력 요소에 포커스 중일 땐 무시)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      // 검색이 팝오버로 접혔으므로 먼저 연다 — 입력의 autoFocus 가 포커스를 받는다.
      setSearchOpen(true);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function handleExport() {
    if (exporting || selectedIds.length === 0) return;
    setExporting(true);
    try {
      // 체크한 학생만 — 화면 필터는 걸지 않는다(선택이 이미 명시적 대상).
      // academyId 는 서버가 세션에서 붙이므로 남의 학원 학생은 섞일 수 없다.
      const exportFilters: StudentFilters = {
        ids: selectedIds,
        sort: sort === "recent" ? undefined : sort,
      };
      const res = await exportStudentsRosterCsv(exportFilters);
      const bytes = Uint8Array.from(atob(res.contentBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: res.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(
        `선택한 학생 ${res.totalRows.toLocaleString()}명을 내보냈습니다.${
          res.capped ? " (상한 5,000명 — 초과분은 제외)" : ""
        }`,
      );
    } catch {
      toast.error("내보내기에 실패했습니다.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5 border-b border-slate-100 px-4 py-3">
      {/* 필터 바 — 상태 탭(좌) + 우측 끝 고정 [필터·검색] 아이콘 팝오버 + 유틸.
          과제 관리 보드(assignments-board-client)와 동일 규약으로 통일했다. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* 과제 배포 — 선택 여부와 무관하게 자리를 지키는 상시 액션.
              선택이 없으면 "비활성처럼" 보이되 네이티브 disabled 는 쓰지 않는다.
              클릭 이벤트가 살아 있어야 아래 힌트 글로우로 체크박스를 가리킬 수
              있기 때문(lib/hint-glow 규약). */}
          <button
            type="button"
            aria-disabled={!hasSelection || undefined}
            onClick={() => {
              if (!hasSelection) {
                // 무엇을 눌러야 열리는지 — 행 체크박스 열을 파랗게 반짝인다.
                triggerHintGlow(
                  document.querySelectorAll("[data-roster-select]"),
                  { scrollBlock: "center" },
                );
                return;
              }
              onOpenComposer();
            }}
            title={hasSelection ? undefined : "학생을 먼저 선택하세요"}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[12.5px] font-semibold transition-colors",
              hasSelection
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : // 비활성 톤은 CSV 버튼과 동일 — 같은 "선택 필요" 상태라 같게 보인다.
                  "cursor-not-allowed border border-slate-200 bg-white text-slate-600 opacity-40",
            )}
          >
            <ClipboardList className="size-3.5" aria-hidden />
            과제 배포
            {hasSelection ? (
              <span className="tabular-nums">{selectedIds.length}</span>
            ) : null}
          </button>

          {/* 선택 해제 — 하단 선택 바를 걷어내며 유일한 "한 번에 비우기" 경로가
              여기로 왔다. 선택은 페이지를 넘어 유지되므로(다른 페이지에서 고른
              학생은 화면에 안 보인다) 비우는 수단이 없으면 갇힌다. */}
          {hasSelection ? (
            <button
              type="button"
              onClick={onClearSelection}
              aria-label={`선택한 ${selectedIds.length}명 모두 해제`}
              title="선택 해제"
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}

          {/* 반 추가 — 반 칩 줄을 걷어내며 이리로 옮겼다(과제 배포 오른쪽).
              첫 반 생성 진입점이라 반이 0개여도 원장에게는 보인다. */}
          {isDirector ? (
            adding ? (
              <span className="inline-flex items-center gap-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitCreate();
                    if (e.key === "Escape") {
                      setNewName("");
                      setAdding(false);
                    }
                  }}
                  onBlur={submitCreate}
                  placeholder="반 이름"
                  aria-label="새 반 이름"
                  className="h-8 w-28 rounded-md border border-blue-300 bg-white px-2.5 text-[12.5px] text-slate-700 outline-none placeholder:text-slate-300 focus:border-blue-400"
                />
                {creating ? (
                  <Loader2 className="size-3.5 animate-spin text-blue-500" aria-hidden />
                ) : null}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-md border border-dashed border-blue-200 bg-white px-2.5 text-[12.5px] font-semibold text-blue-500 transition-colors hover:border-blue-300 hover:bg-blue-50/70"
              >
                <Plus className="size-3" aria-hidden />반 추가
              </button>
            )
          ) : null}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {/* 선택 학생 CSV — 선택이 없으면 받을 대상이 없으므로 비활성.
              필터가 아니라 액션이라 필터 아이콘 왼쪽에 둔다. */}
          {/* CSV — 과제 배포와 같은 규약. 선택이 없을 때 네이티브 disabled 를 쓰면
              클릭이 죽어 힌트를 못 띄우므로 aria-disabled 로 "비활성처럼"만 만든다.
              내보내는 중(exporting)은 진짜 disabled — 힌트가 아니라 중복 실행 차단. */}
          <button
            type="button"
            onClick={() => {
              if (!hasSelection) {
                triggerHintGlow(
                  document.querySelectorAll("[data-roster-select]"),
                  { scrollBlock: "center" },
                );
                return;
              }
              void handleExport();
            }}
            disabled={exporting}
            aria-disabled={!hasSelection || undefined}
            title={
              hasSelection
                ? `선택한 ${selectedIds.length}명 CSV 내보내기`
                : "내보낼 학생을 먼저 선택하세요"
            }
            aria-label="선택한 학생 CSV 내보내기"
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-600 transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              hasSelection ? "hover:bg-slate-50" : "cursor-not-allowed opacity-40",
            )}
          >
            {exporting ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Download className="size-3.5" aria-hidden />
            )}
            CSV
          </button>

          {/* 필터 — 학년·학교(getStudents 가 이미 처리하는 필터의 UI 노출) */}
          <Popover>
            <PopoverTrigger title="필터" aria-label="필터" className={ICON_BTN}>
              <ListFilter className="size-3.5 shrink-0" />
              {gradeActive || schoolActive || statusActive ? <ActiveDot /> : null}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-3">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium text-slate-600">상태</span>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS_TABS.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() =>
                          updateParams({
                            status: s.value === "ALL" ? undefined : s.value,
                            page: undefined,
                          })
                        }
                        aria-pressed={(filters.status || "ALL") === s.value}
                        className={cn(
                          "h-7 rounded-md border px-2.5 text-[12px] font-semibold transition-colors",
                          (filters.status || "ALL") === s.value
                            ? CHIP_ACTIVE
                            : CHIP_IDLE,
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium text-slate-600">학년</span>
                  <select
                    value={filters.grade?.toString() ?? "ALL"}
                    onChange={(e) =>
                      updateParams({ grade: e.target.value, page: undefined })
                    }
                    aria-label="학년 필터"
                    className={selectClass}
                  >
                    <option value="ALL">전체 학년</option>
                    {GRADES.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>
                {schools.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium text-slate-600">학교</span>
                    <select
                      value={filters.schoolId ?? "ALL"}
                      onChange={(e) =>
                        updateParams({ schoolId: e.target.value, page: undefined })
                      }
                      aria-label="학교 필터"
                      className={selectClass}
                    >
                      <option value="ALL">전체 학교</option>
                      {schools.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            </PopoverContent>
          </Popover>

          {/* 검색 — '/' 단축키가 이 팝오버를 열고 입력에 포커스한다 */}
          <Popover open={searchOpen} onOpenChange={setSearchOpen}>
            <PopoverTrigger title="검색" aria-label="검색" className={ICON_BTN}>
              <Search className="size-3.5 shrink-0" />
              {search ? <ActiveDot /> : null}
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
                    ref={searchRef}
                    autoFocus
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      schedule(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") flush(search);
                    }}
                    placeholder="이름·코드·전화 검색"
                    aria-label="학생 검색"
                    className={cn(
                      "h-8 w-full rounded-md border border-slate-200 bg-white pl-7 text-[13px] text-slate-700 outline-none placeholder:text-slate-300 focus:border-blue-400",
                      search ? "pr-7" : "pr-2.5",
                    )}
                  />
                  {search ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch("");
                        flush("");
                        searchRef.current?.focus();
                      }}
                      aria-label="검색어 지우기"
                      className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  ) : null}
                </div>
              </div>
            </PopoverContent>
          </Popover>

        </div>
      </div>

    </div>
  );
}
