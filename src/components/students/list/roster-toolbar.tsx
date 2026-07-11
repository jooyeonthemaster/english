"use client";

// ============================================================================
// 학생 로스터 툴바 — 검색(이름/코드/전화) + 상태·학년·학교 필터 + 반 칩 필터
//                  + 행 밀도 토글 + CSV 내보내기 + 새로고침
//
// 단일 소스는 URL 쿼리(updateParams 드릴다운) — 필터 상태를 서버 페이지가
// 다시 읽어 getStudents 를 재조회한다. 디자인 바이블 §2 필터 칩 언어.
// 검색은 '/' 단축키로 포커스, X 로 즉시 클리어(디바운스 건너뜀).
// ============================================================================

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Download, Loader2, RotateCw, Rows3, Search, X } from "lucide-react";
import { toast } from "sonner";
import { GRADES, STUDENT_STATUSES } from "@/lib/constants";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { exportStudentsRosterCsv, type StudentFilters } from "@/actions/students";
import { cn } from "@/lib/utils";
import {
  type HubClass,
  type HubFilters,
  type HubSchool,
  type UpdateParams,
} from "@/app/(director)/director/tutor/_components/types";
import type { RosterSort } from "./roster-table";
import { RosterClassChips } from "./roster-class-chips";

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "ALL", label: "전체" },
  ...STUDENT_STATUSES.map((s) => ({ value: s.value, label: s.label })),
];

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-7 whitespace-nowrap rounded-full border px-3 text-[12px] font-semibold transition-colors",
        active
          ? "border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm"
          : "border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600",
      )}
    >
      {children}
    </button>
  );
}

const selectClass =
  "h-8 shrink-0 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-600 outline-none transition-colors focus:border-blue-400";

export function RosterToolbar({
  filters,
  classes,
  schools,
  sort,
  isPending,
  dense,
  isDirector,
  onToggleDense,
  updateParams,
  onRefresh,
}: {
  filters: HubFilters;
  classes: HubClass[];
  schools: HubSchool[];
  sort: RosterSort;
  /** 필터·페이지 전환 중 — 새로고침 아이콘 스핀으로 진행 피드백 */
  isPending: boolean;
  dense: boolean;
  /** 반 생성·관리·드롭 편성은 원장 전용(서버에서도 검증) */
  isDirector: boolean;
  onToggleDense: () => void;
  updateParams: UpdateParams;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState(filters.search ?? "");
  const [exporting, setExporting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
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
      searchRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      // 현재 화면 필터 그대로 — 서버가 같은 where 빌더를 공유한다.
      const exportFilters: StudentFilters = {
        status: filters.status,
        schoolId: filters.schoolId,
        classId: filters.classId,
        grade: filters.grade,
        search: filters.search,
        billing: filters.billing,
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
        `학생 ${res.totalRows.toLocaleString()}명을 내보냈습니다.${
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
      {/* 검색 + 상태 필터 + 학년·학교 셀렉트 + 우측 유틸 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative shrink-0">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-300"
            aria-hidden
          />
          <input
            ref={searchRef}
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
              "h-8 w-44 rounded-md border border-slate-200 bg-white pl-8 text-[12.5px] text-slate-700 outline-none placeholder:text-slate-300 focus:border-blue-400 sm:w-60",
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

        <div className="hidden h-4 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />

        <div className="flex flex-wrap items-center gap-1">
          {STATUS_TABS.map((s) => (
            <FilterChip
              key={s.value}
              active={(filters.status || "ALL") === s.value}
              onClick={() =>
                updateParams({
                  status: s.value === "ALL" ? undefined : s.value,
                  page: undefined,
                })
              }
            >
              {s.label}
            </FilterChip>
          ))}
        </div>

        {/* 학년·학교 — getStudents 가 이미 처리하는 필터의 UI 노출 */}
        <select
          value={filters.grade?.toString() ?? "ALL"}
          onChange={(e) => updateParams({ grade: e.target.value, page: undefined })}
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
        {schools.length > 0 ? (
          <select
            value={filters.schoolId ?? "ALL"}
            onChange={(e) => updateParams({ schoolId: e.target.value, page: undefined })}
            aria-label="학교 필터"
            className={cn(selectClass, "max-w-[150px]")}
          >
            <option value="ALL">전체 학교</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : null}

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleDense}
            aria-label="행 밀도 좁게 보기"
            aria-pressed={dense}
            className={cn(
              "flex size-8 items-center justify-center rounded-md border transition-colors",
              dense
                ? "border-blue-200 bg-blue-50/40 text-blue-600"
                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-600",
            )}
          >
            <Rows3 className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            aria-label="현재 필터로 CSV 내보내기"
            className="flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Download className="size-3.5" aria-hidden />
            )}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            aria-label="새로고침"
            className="flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-600"
          >
            <RotateCw className={cn("size-3.5", isPending && "animate-spin")} aria-hidden />
          </button>
        </div>
      </div>

      {/* 반 칩 — 폴더 관리 문법(필터+생성+이름변경/삭제+드롭 편성) */}
      <RosterClassChips
        filters={filters}
        classes={classes}
        isDirector={isDirector}
        updateParams={updateParams}
        onMutated={onRefresh}
      />
    </div>
  );
}
