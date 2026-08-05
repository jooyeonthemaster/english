"use client";

// ============================================================================
// 과제 보드 필터 보조 — 학생/반 대상 인라인 패널 + KPI 스트립 (유저 확정 기능)
//
// AssignmentsTargetFilter: "이 학생/이 반에 배포된 과제만" 상호 배타 단일 선택.
// spec §5.2 A 재작성 — 구 구현은 부모 PopoverContent(w-64=256px) 안에서 자체
// absolute 드롭다운(w-72=288px)을 띄워 팝오버 밖으로 삐져나가고 가로 스크롤이
// 생겼다(팝오버 안 팝오버 = 금지 패턴). 이제 패널 본문을 문서 흐름 안에서 그대로
// 렌더하므로 폭은 부모가 정한다. 바깥 클릭 닫기·포커스 관리도 팝오버 소유로
// 넘겼다(자체 리스너·autoFocus 제거 — Radix 포커스 관리와 충돌했다).
// 로스터는 패널 마운트(=팝오버 오픈) 또는 ?student= 딥링크 이름 해석 시
// getAssignTargets 1회 lazy 로드(loadPromiseRef 로 중복 호출 0).
// 서버 재조회(listStudyAssignments({studentId|classId}))·URL 동기화·선택 후
// 팝오버 닫기는 부모(assignments-board-client) 소관 — 여기는 선택 UI 만 담당한다.
// BoardKpiStrip: 목록 KPI 4타일 — 타일 클릭이 곧 필터/정렬 적용 진입점이라
// 대상 필터와 같은 "필터 보조" 파일에 함께 둔다.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Search, X } from "lucide-react";
import {
  getAssignTargets,
  type AssignTargetsData,
} from "@/actions/study-assignments";
import { SegmentPills } from "@/components/students/hub/analytics/kit";
import { StatStrip, StatTile } from "@/components/layout/page-frame";
import type { StudyAssignmentListRow } from "@/lib/study-assignments/types";
import { FILTER_COPY, TASK_STATUS_LABELS } from "@/lib/wording/director-glossary";
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

type TargetAxis = BoardTargetFilter["type"];

/** 축 세그먼트 — 라벨은 glossary 단일 소스(리터럴 직접 표기 금지) */
const AXIS_OPTIONS = [
  { value: "STUDENT" as const, label: FILTER_COPY.STUDENT },
  { value: "CLASS" as const, label: FILTER_COPY.CLASS },
];

/** 선택 상태 칩 — 보드 selectedDate 칩과 동일 화음(blue=선택) */
const CHIP_CLASS =
  "inline-flex max-w-full items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700";

/** 리스트 행에 실리는 최소 표시 계약 — 학생/반 분기를 한 렌더 경로로 합친다 */
interface TargetItem {
  id: string;
  name: string;
  /** 우측 보조 표기 — 학생은 학번, 반은 인원 */
  aside: string;
  /** 호버 툴팁 — 학생의 소속 반 */
  title?: string;
}

export function AssignmentsTargetFilter({
  value,
  onChange,
  locked = false,
}: {
  value: BoardTargetFilter | null;
  /** 같은 대상의 name 해석(딥링크)도 이 콜백으로 온다 — 부모가 same-id 판정 */
  onChange: (next: BoardTargetFilter | null) => void;
  /** 읽기 전용 — 대상이 화면 맥락으로 이미 고정된 임베드용(칩만 렌더) */
  locked?: boolean;
}) {
  // 축은 로컬 상태 — 선택이 있어도 자유롭게 바꿀 수 있어야 한다(구 구현은 선택
  // 즉시 트리거가 사라져 해제해야만 축을 바꿀 수 있었다). 초기값만 현재 선택을
  // 따른다(?student= 딥링크로 들어오면 학생 축에서 시작).
  const [axis, setAxis] = useState<TargetAxis>(value?.type ?? "STUDENT");
  const [targets, setTargets] = useState<AssignTargetsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const loadPromiseRef = useRef<Promise<AssignTargetsData | null> | null>(null);
  const resolvingRef = useRef(false);

  /** 로스터 lazy 1회 로드 — 패널 마운트와 딥링크 이름 해석이 공유(중복 호출 0) */
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

  // 인라인 패널은 열리자마자 목록이 보여야 하므로 마운트 시 로드한다. 이 컴포넌트는
  // 팝오버 안에서만 쓰이고 Radix 는 닫히면 언마운트하므로 "오픈 시 lazy 로드" 계약이
  // 그대로 유지된다(닫힌 채 페이지가 뜨면 요청 0). locked 는 목록을 안 쓰므로 제외.
  useEffect(() => {
    if (locked) return;
    void ensureTargets();
  }, [locked]);

  const q = query.trim().toLowerCase();
  const items = useMemo<TargetItem[]>(() => {
    if (axis === "STUDENT") {
      const students = targets?.students ?? [];
      return students
        .filter(
          (s) =>
            !q || s.name.toLowerCase().includes(q) || s.studentCode.toLowerCase().includes(q),
        )
        .map((s) => ({
          id: s.id,
          name: s.name,
          aside: s.studentCode,
          title: s.classNames.join(" · ") || undefined,
        }));
    }
    const classes = targets?.classes ?? [];
    return classes
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .map((c) => ({ id: c.id, name: c.name, aside: `${c.studentCount}명` }));
  }, [targets, axis, q]);

  /** 선택 요약 칩의 축 라벨 — value.type 은 현재 보고 있는 axis 와 다를 수 있다 */
  const selectedAxisLabel =
    value?.type === "CLASS" ? FILTER_COPY.CLASS : FILTER_COPY.STUDENT;

  // 읽기 전용 — 세그먼트·검색·리스트·해제 X 를 모두 감춘다(맥락상 대상이 고정된 표면)
  if (locked) {
    if (!value) return null;
    return (
      <span className={CHIP_CLASS}>
        <span className="opacity-70">{selectedAxisLabel}</span>
        <span className="truncate">{value.name || FILTER_COPY.LOADING}</span>
      </span>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* 축 전환 — 선택이 걸린 상태에서도 항상 노출된다 */}
      <SegmentPills<TargetAxis>
        options={AXIS_OPTIONS}
        value={axis}
        onChange={(next) => {
          setAxis(next);
          setQuery("");
        }}
        ariaLabel={FILTER_COPY.TARGET}
        className="self-start"
      />

      <p className="text-[12px] leading-relaxed text-slate-400">
        {axis === "STUDENT" ? FILTER_COPY.STUDENT_HINT : FILTER_COPY.CLASS_HINT}
      </p>

      {/* 선택 상태 요약 — 리스트 위에 두어 무엇이 걸렸는지 항상 보이게 한다 */}
      {value ? (
        <span className={CHIP_CLASS}>
          <span className="opacity-70">{selectedAxisLabel}</span>
          <span className="min-w-0 truncate">{value.name || FILTER_COPY.LOADING}</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`${FILTER_COPY.TARGET} ${FILTER_COPY.RESET}`}
            className="shrink-0 rounded-full text-blue-500 transition-colors hover:text-blue-700"
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ) : null}

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-300"
          aria-hidden
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            axis === "STUDENT" ? FILTER_COPY.SEARCH_STUDENT : FILTER_COPY.SEARCH_CLASS
          }
          aria-label={axis === "STUDENT" ? FILTER_COPY.SEARCH_STUDENT : FILTER_COPY.SEARCH_CLASS}
          className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-2 text-[12px] text-slate-700 placeholder:text-slate-300 focus:border-blue-300 focus:outline-none"
        />
      </div>

      <div className="max-h-56 min-w-0 overflow-y-auto">
        {loading && items.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-slate-400">{FILTER_COPY.LOADING}</p>
        ) : items.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-slate-400">{FILTER_COPY.NO_RESULT}</p>
        ) : (
          items.map((item) => {
            // 축이 다른 선택(학생 선택 중 반 목록 열람)은 체크가 걸리지 않는다
            const selected = value?.type === axis && value.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={selected}
                title={item.title}
                // 같은 항목 재클릭 = 해제(토글) — 해제 경로를 리스트 안에도 둔다
                onClick={() =>
                  onChange(selected ? null : { type: axis, id: item.id, name: item.name })
                }
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                  selected ? "bg-blue-50 text-blue-700" : "hover:bg-blue-50/60",
                )}
              >
                {/* 체크는 항상 고정 폭 슬롯으로 — 선택 시에만 노드를 끼우면
                    그 줄만 오른쪽으로 튀어 인접 행과 세로 정렬이 깨졌다 */}
                <span className="flex size-3.5 shrink-0 items-center justify-center">
                  {selected ? (
                    <Check className="size-3.5 text-blue-600" aria-hidden />
                  ) : null}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[13px] font-semibold",
                    selected ? "text-blue-700" : "text-slate-700",
                  )}
                >
                  {item.name}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-[12px] tabular-nums",
                    selected ? "text-blue-500" : "text-slate-400",
                  )}
                >
                  {item.aside}
                </span>
              </button>
            );
          })
        )}
      </div>
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
      /** 평균의 모수 — 캡션이 "무엇의 평균인지"를 말하도록 함께 내보낸다 */
      avgBase: pctCount,
      avgPct: pctCount > 0 ? Math.round((pctSum / pctCount) * 100) : null,
    };
  }, [rows, todayKey]);

  const [, tm, td] = todayKey.split("-").map(Number);
  // sub 는 위 숫자를 설명하는 데이터 캡션으로만 쓴다 — 「완료율 낮은순 정렬」처럼
  // 클릭 결과를 캡션에 적으면 그 숫자가 정렬 기준으로 계산된 값처럼 오독된다.
  // 동작 안내는 hint(=title 툴팁)로 분리하고, 클릭 가능함은 우상단 ChevronRight
  // 로 정지 화면에서도 드러낸다(구 구현은 호버 테두리뿐이라 아무 신호가 없었다).
  const tiles = [
    {
      label: TASK_STATUS_LABELS.IN_PROGRESS,
      value: `${kpi.active}`,
      sub: "종료 전 과제",
      hint: "진행 중 과제만 보기",
      tone: "blue" as const,
      onClick: onShowActive,
    },
    {
      label: "오늘 마감",
      value: `${kpi.dueToday}`,
      sub: `${tm}월 ${td}일 마감`,
      hint: "오늘 날짜로 이동",
      // violet 은 「예약」(아직 시작 전) 전용 신호로 확정돼 있다 — 마감 임박과
      // 시작 전은 긴급도가 정반대라 같은 색을 쓰면 사용자를 반대로 이끈다.
      tone: "blue" as const,
      onClick: onShowToday,
    },
    {
      label: TASK_STATUS_LABELS.OVERDUE,
      value: `${kpi.overdueAssignments}`,
      sub: `학생 ${kpi.overdueStudents}명`,
      hint: `${TASK_STATUS_LABELS.OVERDUE} 과제만 보기`,
      tone: "rose" as const,
      onClick: onShowOverdue,
    },
    {
      label: "평균 완료율",
      value: kpi.avgPct === null ? "—" : `${kpi.avgPct}%`,
      sub: `과제 ${kpi.avgBase}건 평균`,
      hint: "완료율 낮은순으로 정렬",
      tone: "emerald" as const,
      onClick: onSortByProgress,
    },
  ];

  return (
    <StatStrip className="mb-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
      {tiles.map((t) => (
        <button
          key={t.label}
          type="button"
          onClick={t.onClick}
          title={t.hint}
          aria-label={`${t.label} ${t.value} — ${t.hint}`}
          className="group relative min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        >
          <StatTile
            label={t.label}
            value={t.value}
            sub={t.sub}
            tone={t.tone}
            className="h-full transition-colors group-hover:border-blue-300"
          />
          <ChevronRight
            aria-hidden
            className="pointer-events-none absolute right-2 top-2.5 size-3.5 text-slate-300 transition-colors group-hover:text-blue-500"
          />
        </button>
      ))}
    </StatStrip>
  );
}
