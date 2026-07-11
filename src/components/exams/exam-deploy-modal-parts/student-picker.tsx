"use client";

// ---------------------------------------------------------------------------
// 시험 배포 모달 — 학생 추가 영역(검색 + 반 필터 + 체크리스트 + 모드 세그먼트 +
// 할당 버튼). 데이터 로드·서버 액션은 exam-deploy-modal.tsx 가 소유하고, 이
// 컴포넌트는 표시·선택만 담당한다(선택 상태는 부모 제어 — controlled).
// 필터링은 클라이언트에서 수행(ACTIVE 로스터는 한 번에 전량 로드됨).
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Search, UserRoundPlus, Users } from "lucide-react";
import type {
  AssignableStudentsData,
  ExamAssignMode,
} from "@/actions/exams/assignments";
import { cn } from "@/lib/utils";
import { assignmentStatusMeta, MODE_OPTIONS } from "./deploy-status";

interface StudentPickerProps {
  roster: AssignableStudentsData;
  selectedIds: ReadonlySet<string>;
  onToggleStudent: (studentId: string) => void;
  mode: ExamAssignMode;
  onModeChange: (mode: ExamAssignMode) => void;
  onAssign: () => void;
  pending: boolean;
}

export function StudentPicker({
  roster,
  selectedIds,
  onToggleStudent,
  mode,
  onModeChange,
  onAssign,
  pending,
}: StudentPickerProps) {
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");

  const filteredStudents = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return roster.students.filter((student) => {
      if (
        keyword &&
        !student.name.toLowerCase().includes(keyword) &&
        !student.studentCode.toLowerCase().includes(keyword)
      ) {
        return false;
      }
      if (
        classFilter &&
        !student.classes.some((cls) => cls.id === classFilter)
      ) {
        return false;
      }
      return true;
    });
  }, [roster.students, search, classFilter]);

  if (roster.students.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[#E5E8EB] bg-slate-50/60 px-4 py-10 text-center">
        <Users className="h-8 w-8 text-slate-300" aria-hidden="true" />
        <p className="text-[13px] font-semibold text-[#8B95A1]">
          등록된 학생이 없습니다. 학생을 먼저 등록해 주세요.
        </p>
        <Link
          href="/director/students"
          className="inline-flex h-11 items-center justify-center rounded-lg border border-[#3182F6]/45 bg-white px-4 text-[13px] font-bold text-[#3182F6] transition-colors hover:bg-blue-50"
        >
          학생 관리로 이동
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 검색 + 반 필터 */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="학생 이름 검색"
            aria-label="학생 이름 검색"
            className="h-11 w-full rounded-lg border border-[#E5E8EB] bg-white pl-9 pr-3 text-[13px] font-medium text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#3182F6]"
          />
        </div>
        <select
          value={classFilter}
          onChange={(event) => setClassFilter(event.target.value)}
          aria-label="반 필터"
          className="h-11 rounded-lg border border-[#E5E8EB] bg-white px-3 text-[13px] font-semibold text-slate-700 outline-none transition-colors focus:border-[#3182F6] sm:w-44"
        >
          <option value="">전체 반</option>
          {roster.classes.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name}
            </option>
          ))}
        </select>
      </div>

      {/* 학생 체크리스트 */}
      <div className="max-h-56 overflow-y-auto rounded-lg border border-[#E5E8EB]">
        {filteredStudents.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12px] font-semibold text-[#8B95A1]">
            조건에 맞는 학생이 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredStudents.map((student) => {
              const meta = [
                student.schoolName,
                student.grade ? `${student.grade}학년` : null,
                ...student.classes.map((cls) => cls.name),
              ]
                .filter(Boolean)
                .join(" · ");
              const statusMeta = student.alreadyAssigned
                ? assignmentStatusMeta(student.assignmentStatus)
                : null;
              return (
                <li key={student.id}>
                  <label
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 transition-colors",
                      student.alreadyAssigned
                        ? "cursor-default bg-slate-50/70"
                        : "hover:bg-blue-50/40",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={
                        student.alreadyAssigned || selectedIds.has(student.id)
                      }
                      disabled={student.alreadyAssigned || pending}
                      onChange={() => onToggleStudent(student.id)}
                      className="h-4 w-4 shrink-0 accent-[#3182F6]"
                      aria-label={`${student.name} 선택`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold text-slate-800">
                        {student.name}
                      </span>
                      {meta && (
                        <span className="block truncate text-[11px] font-medium text-[#8B95A1]">
                          {meta}
                        </span>
                      )}
                    </span>
                    {/* 학생 응시 코드 — 공유 QR 자기등록 시 학생이 입력. 교사가 읽어줄 수
                        있게 모노폰트로 선택·복사 가능하게 노출한다. */}
                    {student.studentCode && (
                      <span
                        className="shrink-0 select-all rounded-md bg-slate-100 px-2 py-1 font-mono text-[12px] font-bold tracking-wider text-slate-700"
                        title="학생 응시 코드"
                      >
                        {student.studentCode}
                      </span>
                    )}
                    {statusMeta && (
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                          statusMeta.chipClass,
                        )}
                      >
                        할당됨 · {statusMeta.label}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 모드 세그먼트 */}
      <div
        role="radiogroup"
        aria-label="응시 모드 선택"
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        {MODE_OPTIONS.map((option) => {
          const selected = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={pending}
              onClick={() => onModeChange(option.value)}
              className={cn(
                "min-h-11 rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                selected
                  ? "border-[#3182F6] bg-blue-50/60"
                  : "border-[#E5E8EB] bg-white hover:border-slate-300",
              )}
            >
              <span
                className={cn(
                  "block text-[13px] font-bold",
                  selected ? "text-[#3182F6]" : "text-slate-700",
                )}
              >
                {option.label}
              </span>
              <span className="mt-0.5 block text-[11px] font-medium leading-relaxed text-[#8B95A1]">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>

      {/* 할당 버튼 */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold text-[#8B95A1]">
          {selectedIds.size > 0
            ? `학생 ${selectedIds.size}명을 선택했습니다.`
            : "할당할 학생을 선택해 주세요."}
        </p>
        <button
          type="button"
          onClick={onAssign}
          disabled={pending || selectedIds.size === 0}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#3182F6] px-5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <UserRoundPlus className="h-4 w-4" aria-hidden="true" />
          )}
          할당
        </button>
      </div>
    </div>
  );
}
