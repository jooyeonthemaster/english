"use client";

// 과제 컴포저 — 대상 선택(반 원클릭 + 학생 다중선택 + 검색).
// 반 카드 토글 = 그 반 재원생 전체 배포(서버에서 전개·dedupe).
// 파워툴: 전체 선택/해제(검색 스코프)·활성 반 "개별로 전환"·선택만 보기.

import { useMemo, useState } from "react";
import { Search, Users, UserRound, CheckCircle2 } from "lucide-react";
import type { AssignTargetsData } from "@/actions/study-assignments";
import { cn } from "@/lib/utils";

export interface TargetSelection {
  classIds: Set<string>;
  studentIds: Set<string>;
}

export function selectionCount(
  data: AssignTargetsData | null,
  sel: TargetSelection,
): number {
  if (!data) return 0;
  const ids = new Set<string>();
  // 반→학생 확장은 classIds 직접 매칭 — 서버 전개(정본)와 같은 id 기준이라
  // 동명 반 오카운트가 없다(과거 classNames 근사 매칭을 교체).
  for (const s of data.students) {
    if (sel.studentIds.has(s.id)) ids.add(s.id);
    else if (s.classIds.some((cid) => sel.classIds.has(cid))) ids.add(s.id);
  }
  return ids.size;
}

export function ComposerTargetPicker({
  data,
  loading,
  selection,
  onChange,
}: {
  data: AssignTargetsData | null;
  loading: boolean;
  selection: TargetSelection;
  onChange: (next: TargetSelection) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);

  const filteredStudents = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.students;
    return data.students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.studentCode.toLowerCase().includes(q) ||
        s.classNames.some((n) => n.toLowerCase().includes(q)),
    );
  }, [data, query]);

  // "선택만 보기" — 직접 체크 + 반 선택 포함을 모두 선택으로 본다
  const visibleStudents = useMemo(() => {
    if (!selectedOnly) return filteredStudents;
    return filteredStudents.filter(
      (s) =>
        selection.studentIds.has(s.id) ||
        s.classIds.some((cid) => selection.classIds.has(cid)),
    );
  }, [filteredStudents, selectedOnly, selection]);

  const toggleClass = (id: string) => {
    const next = new Set(selection.classIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...selection, classIds: next });
  };
  const toggleStudent = (id: string) => {
    const next = new Set(selection.studentIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...selection, studentIds: next });
  };

  // 반 선택 → 학생 개별 선택으로 전개(반 해제 + 재원생 id 추가).
  // data.students 는 ACTIVE 재원생만이라 서버 전개와 같은 집합이 된다.
  const convertClassToStudents = (classId: string) => {
    if (!data) return;
    const nextClasses = new Set(selection.classIds);
    nextClasses.delete(classId);
    const nextStudents = new Set(selection.studentIds);
    for (const s of data.students) {
      if (s.classIds.includes(classId)) nextStudents.add(s.id);
    }
    onChange({ classIds: nextClasses, studentIds: nextStudents });
  };

  // 전체 선택/해제 — 화면에 보이는 목록(검색·선택만 보기 반영) 기준, 직접 체크만 조작
  const allVisibleSelected =
    visibleStudents.length > 0 &&
    visibleStudents.every((s) => selection.studentIds.has(s.id));
  const toggleAllVisible = () => {
    if (visibleStudents.length === 0) return;
    const next = new Set(selection.studentIds);
    if (allVisibleSelected) {
      for (const s of visibleStudents) next.delete(s.id);
    } else {
      for (const s of visibleStudents) next.add(s.id);
    }
    onChange({ ...selection, studentIds: next });
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
    );
  }
  if (!data) {
    return (
      <p className="p-6 text-center text-[13px] text-slate-400">
        대상 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-5">
      {data.classes.length > 0 ? (
        <div>
          {/* 캡션은 좁은 패널(리사이즈 최소 240px)에서 단어 단위로만 줄바꿈 */}
          <p className="mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 break-keep text-[12px] font-semibold text-slate-500">
            <span className="flex shrink-0 items-center gap-1.5">
              <Users className="size-3.5" aria-hidden /> 반 단위 배포
            </span>
            <span className="font-normal text-slate-400">— 반을 누르면 재원생 전체가 포함됩니다</span>
          </p>
          {/* auto-fill 그리드 — 패널 폭(240~560px 가변)에 맞춰 카드 수가 자연 조절 */}
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
            {data.classes.map((c) => {
              const active = selection.classIds.has(c.id);
              return (
                <div key={c.id} className="group relative">
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleClass(c.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
                      active
                        ? "border-blue-600 bg-blue-50/60 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300",
                    )}
                  >
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block truncate text-[13px] font-semibold",
                          active ? "text-blue-700" : "text-slate-700",
                        )}
                      >
                        {c.name}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        재원 {c.studentCount}명
                      </span>
                    </span>
                    <CheckCircle2
                      className={cn(
                        "size-4 shrink-0",
                        active ? "text-blue-600" : "text-slate-200",
                      )}
                      aria-hidden
                    />
                  </button>
                  {/* 활성 반에서만 — 반 선택을 학생 개별 체크로 풀어 미세 조정 */}
                  {active ? (
                    <button
                      type="button"
                      onClick={() => convertClassToStudents(c.id)}
                      title="반 선택을 학생 개별 선택으로 풀어 넣습니다"
                      className="pointer-events-none absolute bottom-1 right-1 rounded border border-blue-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 opacity-0 shadow-sm transition-opacity hover:bg-blue-50 focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
                    >
                      개별로 전환
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-col">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
            <UserRound className="size-3.5" aria-hidden /> 학생 개별 선택
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-pressed={selectedOnly}
              onClick={() => setSelectedOnly((v) => !v)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
                selectedOnly
                  ? "border-blue-600 bg-blue-50/40 text-blue-700"
                  : "border-slate-200 bg-white text-slate-400 hover:text-slate-600",
              )}
            >
              선택만 보기
            </button>
            <button
              type="button"
              onClick={toggleAllVisible}
              disabled={visibleStudents.length === 0}
              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-40"
            >
              {allVisibleSelected ? "전체 해제" : "전체 선택"}
            </button>
          </div>
        </div>
        <div className="relative mb-2">
          <Search
            className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름·코드·반 검색"
            className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-2 text-[12.5px] text-slate-700 outline-none placeholder:text-slate-300 focus:border-blue-400"
          />
        </div>
        {/* 콘텐츠 기반 수축 — 학생이 적으면 목록이 내용 높이만큼만 차지한다 */}
        <div className="max-h-[420px] overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {visibleStudents.length === 0 ? (
            <p className="p-6 text-center text-[13px] text-slate-400">
              {selectedOnly
                ? "선택한 학생이 없습니다."
                : query
                  ? "검색 결과가 없습니다."
                  : "재원 중인 학생이 없습니다."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {visibleStudents.map((s) => {
                const checked = selection.studentIds.has(s.id);
                const viaClass =
                  !checked && s.classIds.some((cid) => selection.classIds.has(cid));
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => toggleStudent(s.id)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-300",
                        checked ? "bg-blue-50/50" : "hover:bg-slate-50",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border",
                          checked
                            ? "border-blue-600 bg-blue-600"
                            : "border-slate-300 bg-white",
                        )}
                        aria-hidden
                      >
                        {checked ? (
                          <svg viewBox="0 0 10 10" className="size-2.5 fill-none stroke-white stroke-[1.8]">
                            <path d="M1.5 5.2 4 7.5 8.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-[13px] font-medium text-slate-800">
                            {s.name}
                          </span>
                          <span className="shrink-0 text-[11px] text-slate-400">
                            {s.grade}학년
                            {s.schoolName ? ` · ${s.schoolName}` : ""}
                          </span>
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {s.classNames.slice(0, 2).map((n) => (
                          <span
                            key={n}
                            className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500"
                          >
                            {n}
                          </span>
                        ))}
                        {viaClass ? (
                          <span className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                            반 선택에 포함
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
