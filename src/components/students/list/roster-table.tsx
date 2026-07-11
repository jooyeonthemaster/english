"use client";

// ============================================================================
// 학생 로스터 테이블 — 선택 / 학생 / 학교·학년 / 반 / 상태 / 연락처 / 접속 기기 / 이번 달 수납
//
// getStudents 반환 필드 범위 내에서만 표시한다. 행 클릭 → 학생 상세 허브
// (/director/students/[id]). 디자인 바이블 §2 테이블 언어(헤더 bg-slate-50,
// 행 hover:bg-blue-50/40, 수치 tabular-nums) + 페이지네이션 내장.
// 기기·수납·연락처 셀은 인라인 팝오버로 그 자리에서 내용 확인.
// 첫 컬럼 체크박스 = 벌크 선택(과제 배포·반 편성) — 선택 상태는 부모
// (students-roster-client)가 페이지 전환에도 유지한다.
// ============================================================================

import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { toast } from "sonner";
import { StatusPill, type PillTone } from "@/components/layout/page-frame";
import { cn, getGradeLabel, getInitials } from "@/lib/utils";
import type { StudentsResult } from "@/app/(director)/director/tutor/_components/types";
import { InlineBillingPopover } from "./inline-billing-popover";
import { InlineDevicePopover } from "./inline-device-popover";
import { InlineContactPopover } from "./inline-contact-popover";

const STATUS_META: Record<string, { label: string; tone: PillTone }> = {
  ACTIVE: { label: "재원", tone: "emerald" },
  PAUSED: { label: "휴원", tone: "slate" },
  WAITING: { label: "대기", tone: "violet" },
  WITHDRAWN: { label: "퇴원", tone: "rose" },
};

/** 로스터 정렬 키 — URL ?sort= 와 StudentFilters.sort 미러. */
export type RosterSort = "recent" | "name" | "grade";

/** 정렬 가능 헤더 버튼 — 활성 시 blue, 재클릭 = 기본(recent)으로 해제. */
function SortHeadButton({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: "name" | "grade";
  sort: RosterSort;
  onSort: (key: "name" | "grade") => void;
}) {
  const active = sort === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={`${label} 기준 정렬${active ? " 해제" : ""}`}
      className={cn(
        "inline-flex items-center gap-1 transition-colors",
        active ? "text-blue-600" : "hover:text-slate-700",
      )}
    >
      {label}
      <ArrowUpDown className="size-3" aria-hidden />
    </button>
  );
}

/** 학생 앱 로그인이 코드 기반이라 데스크 최빈 동작 — 원클릭 복사. */
async function copyStudentCode(e: MouseEvent, code: string) {
  e.stopPropagation();
  try {
    await navigator.clipboard.writeText(code);
    toast.success("학생 코드를 복사했습니다.");
  } catch {
    // http 로컬 등 clipboard API 불가 환경 폴백(임시 textarea + execCommand)
    try {
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast.success("학생 코드를 복사했습니다.");
    } catch {
      toast.error("복사에 실패했습니다.");
    }
  }
}

export function RosterTable({
  studentsData,
  showBilling,
  dense,
  sort,
  onSort,
  selected,
  onToggleSelect,
  onTogglePage,
  onPage,
}: {
  studentsData: StudentsResult;
  showBilling: boolean;
  /** 행 밀도(좁게) — 툴바 토글, localStorage 유지 */
  dense: boolean;
  sort: RosterSort;
  onSort: (key: "name" | "grade") => void;
  /** 벌크 선택 — id→이름(선택 바 이름 칩 표시용) */
  selected: ReadonlyMap<string, string>;
  onToggleSelect: (id: string, name: string) => void;
  onTogglePage: (rows: { id: string; name: string }[], select: boolean) => void;
  onPage: (page: number) => void;
}) {
  const router = useRouter();
  const { students, page, pageSize, total, totalPages } = studentsData;

  const goDetail = (id: string) => router.push(`/director/students/${id}`);

  const headCell = "px-4 py-2.5 text-left text-[12px] font-semibold text-slate-500";
  const cellPad = dense ? "px-4 py-1.5" : "px-4 py-2.5";

  const pageRows = students.map((s) => ({ id: s.id, name: s.name }));
  const allSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const someSelected = pageRows.some((r) => selected.has(r.id));

  const codeBadge = (code: string, name: string) => (
    <button
      type="button"
      onClick={(e) => copyStudentCode(e, code)}
      aria-label={`${name} 학생 코드 ${code} 복사`}
      className="inline-flex items-center gap-1 rounded bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 ring-1 ring-slate-100 transition-colors hover:bg-slate-100 hover:text-slate-600"
    >
      {code}
      <Copy
        className="size-3 opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </button>
  );

  return (
    <div className="min-w-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className={cn(headCell, "w-10 min-w-[40px]")}>
                <input
                  type="checkbox"
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  checked={allSelected}
                  onChange={() => onTogglePage(pageRows, !allSelected)}
                  aria-label="이 페이지 학생 전체 선택"
                  className="size-3.5 cursor-pointer accent-blue-600 align-middle"
                />
              </th>
              <th
                className={cn(headCell, "w-[26%] min-w-[210px]")}
                aria-sort={sort === "name" ? "ascending" : undefined}
              >
                <SortHeadButton label="학생" sortKey="name" sort={sort} onSort={onSort} />
              </th>
              <th
                className={cn(headCell, "w-[15%] min-w-[140px]")}
                aria-sort={sort === "grade" ? "ascending" : undefined}
              >
                <SortHeadButton label="학교·학년" sortKey="grade" sort={sort} onSort={onSort} />
              </th>
              <th className={cn(headCell, "w-[15%] min-w-[140px]")}>반</th>
              <th className={cn(headCell, "w-[10%] min-w-[76px]")}>상태</th>
              <th className={cn(headCell, "w-[10%] min-w-[84px]")}>연락처</th>
              <th className={cn(headCell, "w-[10%] min-w-[92px]")}>접속 기기</th>
              {showBilling ? (
                <th className={cn(headCell, "w-[12%] min-w-[124px]")}>이번 달 수납</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {students.map((student) => {
              const enrolled = student.classEnrollments.map((e) => e.class);
              const statusMeta = STATUS_META[student.status] ?? STATUS_META.ACTIVE;
              const deviceCount = student._count.tutorStudentSessions;
              const isSelected = selected.has(student.id);
              return (
                <tr
                  key={student.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${student.name} 상세 보기`}
                  onClick={() => goDetail(student.id)}
                  onKeyDown={(e) => {
                    // 셀 안 팝오버 트리거에서의 Enter/Space가 행 이동으로
                    // 새지 않도록 행 자신에 포커스가 있을 때만 이동한다.
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      goDetail(student.id);
                    }
                  }}
                  className={cn(
                    "group cursor-pointer border-b border-slate-50 transition-colors last:border-b-0 hover:bg-blue-50/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500",
                    isSelected && "bg-blue-50/30",
                  )}
                >
                  {/* 선택 체크박스 — 클릭이 행 이동으로 새지 않게 셀에서 차단 */}
                  <td className={cellPad} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(student.id, student.name)}
                      aria-label={`${student.name} 선택`}
                      className="size-3.5 cursor-pointer accent-blue-600 align-middle"
                    />
                  </td>

                  <td className={cellPad}>
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          "flex shrink-0 items-center justify-center rounded-full bg-blue-50 font-bold text-blue-600 ring-1 ring-blue-100",
                          dense ? "size-7 text-[10px]" : "size-9 text-[12px]",
                        )}
                      >
                        {getInitials(student.name)}
                      </span>
                      {dense ? (
                        // 좁게 모드: 이름·코드를 한 줄에
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate text-[13px] font-semibold text-slate-800">
                            {student.name}
                          </p>
                          {codeBadge(student.studentCode, student.name)}
                        </div>
                      ) : (
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-slate-800">
                            {student.name}
                          </p>
                          {codeBadge(student.studentCode, student.name)}
                        </div>
                      )}
                    </div>
                  </td>

                  <td className={cn(cellPad, "text-[12.5px] text-slate-500")}>
                    <span className="block max-w-[160px] truncate">
                      {student.school?.name ?? "학교 미등록"}
                      <span className="text-slate-300"> · </span>
                      {getGradeLabel(student.grade)}
                    </span>
                  </td>

                  <td className={cellPad}>
                    {enrolled.length === 0 ? (
                      <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                        미배정
                      </span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1">
                        {enrolled.slice(0, 2).map((c) => (
                          <span
                            key={c.id}
                            className="max-w-[110px] truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500"
                          >
                            {c.name}
                          </span>
                        ))}
                        {enrolled.length > 2 ? (
                          <span
                            title={enrolled.map((c) => c.name).join(", ")}
                            className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-400 tabular-nums"
                          >
                            +{enrolled.length - 2}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </td>

                  <td className={cellPad}>
                    <StatusPill tone={statusMeta.tone}>{statusMeta.label}</StatusPill>
                  </td>

                  <td className={cellPad}>
                    <InlineContactPopover
                      studentName={student.name}
                      phone={student.phone}
                      parentLinks={student.parentLinks}
                    />
                  </td>

                  <td className={cellPad}>
                    <InlineDevicePopover
                      studentId={student.id}
                      studentName={student.name}
                      deviceCount={deviceCount}
                    />
                  </td>

                  {showBilling ? (
                    <td className={cellPad}>
                      <InlineBillingPopover
                        studentId={student.id}
                        studentName={student.name}
                        invoices={student.invoices}
                      />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 푸터: 건수 + 페이지네이션 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5">
        <p className="text-[11.5px] text-slate-400 tabular-nums">
          {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / 전체{" "}
          {total.toLocaleString()}명
        </p>
        {totalPages > 1 ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
              aria-label="이전 페이지"
              className="flex size-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="size-3.5" aria-hidden />
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) pageNum = i + 1;
              else if (page <= 4) pageNum = i + 1;
              else if (page >= totalPages - 3) pageNum = totalPages - 6 + i;
              else pageNum = page - 3 + i;
              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => onPage(pageNum)}
                  aria-label={`${pageNum}페이지`}
                  aria-current={pageNum === page ? "page" : undefined}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md border text-[12px] font-semibold tabular-nums transition-colors",
                    pageNum === page
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                  )}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPage(page + 1)}
              aria-label="다음 페이지"
              className="flex size-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="size-3.5" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
