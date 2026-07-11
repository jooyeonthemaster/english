"use client";

// ============================================================================
// 과제 보드 필터 보조 — 학생/반 대상 필터 팝오버 + KPI 스트립 (유저 확정 기능)
//
// AssignmentsTargetFilter: "이 학생/이 반에 배포된 과제만" 상호 배타 단일 선택.
// 로스터는 첫 팝오버 오픈(또는 ?student= 딥링크 이름 해석) 시 getAssignTargets
// 1회 lazy 로드. 서버 재조회(listStudyAssignments({studentId|classId}))·URL
// 동기화는 부모(assignments-board-client) 소관 — 여기는 선택 UI 만 담당한다.
// BoardKpiStrip: 목록 KPI 4타일 — 타일 클릭이 곧 필터/정렬 적용 진입점이라
// 대상 필터와 같은 "필터 보조" 파일에 함께 둔다.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import {
  getAssignTargets,
  type AssignTargetsData,
} from "@/actions/study-assignments";
import { StatStrip, StatTile } from "@/components/layout/page-frame";
import type { StudyAssignmentListRow } from "@/lib/study-assignments/types";
import { cn } from "@/lib/utils";
import { seoulDateKey } from "./assignments-calendar";
import { isActionNeeded } from "./assignment-list-card";

// ── 학생/반 대상 필터 ────────────────────────────────────────────────────────

export interface BoardTargetFilter {
  type: "STUDENT" | "CLASS";
  id: string;
  /** 칩 라벨 — ?student= 딥링크 진입 직후엔 "" 로 들어와 로스터 로드 후 해석된다 */
  name: string;
}

const TRIGGER_CLASS =
  "inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700";

export function AssignmentsTargetFilter({
  value,
  onChange,
}: {
  value: BoardTargetFilter | null;
  /** 같은 대상의 name 해석(딥링크)도 이 콜백으로 온다 — 부모가 same-id 판정 */
  onChange: (next: BoardTargetFilter | null) => void;
}) {
  const [panel, setPanel] = useState<"STUDENT" | "CLASS" | null>(null);
  const [targets, setTargets] = useState<AssignTargetsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const loadPromiseRef = useRef<Promise<AssignTargetsData | null> | null>(null);
  const resolvingRef = useRef(false);

  /** 로스터 lazy 1회 로드 — 팝오버 첫 오픈과 딥링크 이름 해석이 공유(중복 호출 0) */
  const ensureTargets = () => {
    if (!loadPromiseRef.current) {
      setLoading(true);
      loadPromiseRef.current = getAssignTargets()
        .then((res) => {
          const data = res.success ? (res.data ?? null) : null;
          setTargets(data);
          return data;
        })
        .finally(() => setLoading(false));
    }
    return loadPromiseRef.current;
  };

  // ?student= 딥링크 — 부모가 name:"" 로 내려보내면 로스터를 로드해 라벨을 해석.
  // 로스터에 없으면(퇴원·삭제) 빈 결과로 침묵하는 대신 필터를 해제한다.
  useEffect(() => {
    if (!value || value.name !== "" || resolvingRef.current) return;
    resolvingRef.current = true;
    void ensureTargets().then((data) => {
      resolvingRef.current = false;
      if (!data) return;
      const found =
        value.type === "STUDENT"
          ? data.students.find((s) => s.id === value.id)
          : data.classes.find((c) => c.id === value.id);
      onChange(found ? { ...value, name: found.name } : null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // 바깥 클릭 닫기 — TargetPopover(assignment-detail-parts) 패턴 미러
  useEffect(() => {
    if (!panel) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setPanel(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [panel]);

  const openPanel = (type: "STUDENT" | "CLASS") => {
    setQuery("");
    setPanel((cur) => (cur === type ? null : type));
    void ensureTargets();
  };

  const q = query.trim().toLowerCase();
  const filteredStudents = useMemo(() => {
    const students = targets?.students ?? [];
    if (!q) return students;
    return students.filter(
      (s) => s.name.toLowerCase().includes(q) || s.studentCode.toLowerCase().includes(q),
    );
  }, [targets, q]);
  const filteredClasses = useMemo(() => {
    const classes = targets?.classes ?? [];
    if (!q) return classes;
    return classes.filter((c) => c.name.toLowerCase().includes(q));
  }, [targets, q]);

  return (
    <div ref={rootRef} className="relative flex items-center gap-1.5">
      {value ? (
        /* 선택 칩 — 보드 selectedDate 칩과 동일 패턴(클릭 = 해제) */
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="대상 필터 해제"
          className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-100"
        >
          <span className="opacity-70">{value.type === "STUDENT" ? "학생" : "반"}</span>
          {value.name || "불러오는 중…"}
          <X className="size-3" aria-hidden />
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => openPanel("STUDENT")}
            aria-expanded={panel === "STUDENT"}
            className={cn(TRIGGER_CLASS, panel === "STUDENT" && "border-blue-300 text-blue-600")}
          >
            학생
            <ChevronDown className="size-3.5 text-slate-400" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => openPanel("CLASS")}
            aria-expanded={panel === "CLASS"}
            className={cn(TRIGGER_CLASS, panel === "CLASS" && "border-blue-300 text-blue-600")}
          >
            반
            <ChevronDown className="size-3.5 text-slate-400" aria-hidden />
          </button>
        </>
      )}

      {panel ? (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
          <p className="px-1 pb-1.5 text-[11px] text-slate-400">
            {panel === "STUDENT"
              ? "이 학생에게 배정된 과제만 표시"
              : "반 단위 배포 기준 — 개별 배포 과제는 학생 필터로"}
          </p>
          <div className="relative mb-1.5">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-300"
              aria-hidden
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={panel === "STUDENT" ? "이름·학번 검색" : "반 이름 검색"}
              className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-2 text-[12px] text-slate-700 placeholder:text-slate-300 focus:border-blue-300 focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {loading ? (
              <p className="py-4 text-center text-[12px] text-slate-400">불러오는 중…</p>
            ) : panel === "STUDENT" ? (
              filteredStudents.length === 0 ? (
                <p className="py-4 text-center text-[12px] text-slate-400">검색 결과가 없습니다.</p>
              ) : (
                filteredStudents.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      onChange({ type: "STUDENT", id: s.id, name: s.name });
                      setPanel(null);
                    }}
                    title={s.classNames.join(" · ") || undefined}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-blue-50/60"
                  >
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-700">
                      {s.name}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                      {s.studentCode}
                    </span>
                  </button>
                ))
              )
            ) : filteredClasses.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-slate-400">검색 결과가 없습니다.</p>
            ) : (
              filteredClasses.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onChange({ type: "CLASS", id: c.id, name: c.name });
                    setPanel(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-blue-50/60"
                >
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-700">
                    {c.name}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                    {c.studentCount}명
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── KPI 스트립 — 타일 클릭 = 필터/정렬 적용 ─────────────────────────────────

export function BoardKpiStrip({
  rows,
  todayKey,
  onShowActive,
  onShowToday,
  onShowOverdue,
  onSortByProgress,
}: {
  /** 현재 서버 필터(대상) 스코프의 전체 목록 — 클라 계산(추가 쿼리 0) */
  rows: StudyAssignmentListRow[];
  /** 서울 오늘 — "YYYY-MM-DD" */
  todayKey: string;
  onShowActive: () => void;
  onShowToday: () => void;
  onShowOverdue: () => void;
  onSortByProgress: () => void;
}) {
  const kpi = useMemo(() => {
    let active = 0;
    let dueToday = 0;
    let overdueAssignments = 0;
    let overdueStudents = 0;
    let pctSum = 0;
    let pctCount = 0;
    for (const r of rows) {
      if (r.status === "ACTIVE") {
        active += 1;
        if (r.dueAt && seoulDateKey(r.dueAt) === todayKey) dueToday += 1;
      }
      if (isActionNeeded(r)) {
        overdueAssignments += 1;
        overdueStudents += r.overdueCount;
      }
      if (r.taskCount > 0) {
        pctSum += r.doneCount / r.taskCount;
        pctCount += 1;
      }
    }
    return {
      active,
      dueToday,
      overdueAssignments,
      overdueStudents,
      avgPct: pctCount > 0 ? Math.round((pctSum / pctCount) * 100) : null,
    };
  }, [rows, todayKey]);

  const [, tm, td] = todayKey.split("-").map(Number);
  const tiles = [
    { label: "진행 중", value: `${kpi.active}`, sub: "종료 전 과제", tone: "blue" as const, onClick: onShowActive },
    { label: "오늘 마감", value: `${kpi.dueToday}`, sub: `${tm}월 ${td}일 마감`, tone: "violet" as const, onClick: onShowToday },
    { label: "기한 지남", value: `${kpi.overdueAssignments}`, sub: `학생 ${kpi.overdueStudents}명`, tone: "rose" as const, onClick: onShowOverdue },
    { label: "평균 완료율", value: kpi.avgPct === null ? "—" : `${kpi.avgPct}%`, sub: "완료율 낮은순 정렬", tone: "emerald" as const, onClick: onSortByProgress },
  ];

  return (
    <StatStrip className="mb-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
      {tiles.map((t) => (
        <button
          key={t.label}
          type="button"
          onClick={t.onClick}
          className="group min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        >
          <StatTile
            label={t.label}
            value={t.value}
            sub={t.sub}
            tone={t.tone}
            className="h-full transition-colors group-hover:border-blue-300"
          />
        </button>
      ))}
    </StatStrip>
  );
}
