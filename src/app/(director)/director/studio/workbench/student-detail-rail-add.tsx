"use client";

// ============================================================================
// 「학생 관리」 우측 레일 — **인라인 학생 추가 패널**(mode:"add") (26-09-02)
// 정본: docs/exam-analysis-v4-spec.md §1-6 「모달 0(추가 폼은 레일 인라인)」 ·
//       §3 U6-4 「student-add-modal.tsx 의 검색+이름폼 로직을 레일 인라인 폼으로
//       이식 — 모달 사용 금지」
//
// c/[classId]/student-add-modal.tsx 의 두 경로를 그대로 옮겼다:
//   상단 = 기존 학원 학생 검색(searchAcademyStudents, 300ms 디바운스, 늦은 응답
//          seq 폐기) → [연결] = attachStudentsToStudioClass(중복 계정 방지)
//   하단 = 신규 등록(이름 + 학년 칩) → addStudioStudent(코드 자동 발급) → 토스트에
//          발급 코드 표기 · Enter 연속 등록
// 성공마다 onChanged() — 셸이 로스터·클래스 카운트·리포트 현황을 재조회한다.
// 폭 계약: 레일 플로어 296px — 전 행 truncate/break-keep, 표 금지.
// ============================================================================

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Plus, Search, UserRoundPlus, X } from "lucide-react";
import { toast } from "sonner";
import { GRADES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  addStudioStudent,
  attachStudentsToStudioClass,
  searchAcademyStudents,
  type StudioStudentSearchRow,
} from "@/actions/studio/students";
import { gradeLabel } from "./students-shared";

const INPUT_CLASS =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[12.5px] text-slate-900 outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10";

export function StudentRailAddPanel({
  classId,
  onClose,
  onChanged,
}: {
  classId: string;
  onClose: () => void;
  /** 연결·등록 성공 — 셸이 로스터·카운트·현황 재조회 */
  onChanged: () => void;
}) {
  // ── 기존 학생 검색 ─────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudioStudentSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const searchSeq = useRef(0);

  // ── 신규 등록 폼 ───────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [grade, setGrade] = useState<number>(GRADES[0].value);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // 300ms 디바운스 검색 — 늦게 도착한 응답은 seq 로 폐기(모달 원본 그대로).
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++searchSeq.current;
    const timer = window.setTimeout(async () => {
      const res = await searchAcademyStudents({ classId, search: trimmed });
      if (seq !== searchSeq.current) return;
      setSearching(false);
      if (!res.success) {
        toast.error(res.error ?? "학생 검색에 실패했습니다.");
        return;
      }
      setResults(res.data ?? []);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, classId]);

  const attach = (row: StudioStudentSearchRow) => {
    if (row.alreadyEnrolled || attachingId) return;
    setAttachingId(row.studentId);
    void (async () => {
      try {
        const res = await attachStudentsToStudioClass({
          classId,
          studentIds: [row.studentId],
        });
        if (!res.success) {
          toast.error(res.error ?? "학생 연결에 실패했습니다.");
          return;
        }
        toast.success(`「${row.name}」 학생을 클래스에 연결했습니다.`);
        setResults((prev) =>
          prev.map((r) =>
            r.studentId === row.studentId ? { ...r, alreadyEnrolled: true } : r,
          ),
        );
        onChanged();
      } catch {
        // 네트워크·액션 예외 — 무음이면 스피너가 영구 고착된다(finally 가 푼다).
        toast.error("학생 연결에 실패했습니다.");
      } finally {
        setAttachingId(null);
      }
    })();
  };

  const submitNew = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("학생 이름을 입력해 주세요.");
      nameInputRef.current?.focus();
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    startTransition(async () => {
      try {
        const res = await addStudioStudent({ classId, name: trimmed, grade });
        if (!res.success || !res.data) {
          toast.error(res.error ?? "학생 등록에 실패했습니다.");
          return;
        }
        toast.success(
          `「${trimmed}」 학생을 등록했습니다 · 코드 ${res.data.studentCode}`,
        );
        // 연속 등록 — 인풋 초기화·포커스 유지(학년은 유지 — 같은 반 연속 등록).
        setName("");
        nameInputRef.current?.focus();
        onChanged();
      } catch {
        toast.error("학생 등록에 실패했습니다.");
      } finally {
        inFlight.current = false;
      }
    });
  };

  return (
    <div
      data-student-rail
      data-student-rail-mode="add"
      className="flex h-full min-h-0 flex-col"
    >
      {/* 헤더 — 분석 레일과 같은 위계(아이콘 칩 + 제목 + 닫기) */}
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-3 py-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
          <UserRoundPlus className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-slate-900">
            학생 추가
          </p>
          <p className="truncate text-[11px] text-slate-400">
            기존 학생을 찾아 연결하거나, 새로 등록합니다
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="학생 추가 닫기"
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* ── 기존 학생 검색 ── */}
        <div className="flex h-8 items-center bg-slate-100 px-3 text-[11px] font-semibold text-slate-500">
          기존 학생 검색
        </div>
        <div className="p-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-slate-300"
              aria-hidden="true"
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름으로 검색"
              className={cn(INPUT_CLASS, "pl-8")}
            />
          </div>
          {query.trim() ? (
            <div className="mt-2 overflow-hidden rounded-md border border-slate-200">
              {searching ? (
                <div className="flex items-center gap-2 px-3 py-2.5 text-[11.5px] text-slate-400">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  검색 중입니다…
                </div>
              ) : results.length === 0 ? (
                <p className="break-keep px-3 py-2.5 text-[11.5px] text-slate-400">
                  일치하는 학생이 없습니다 — 아래에서 새로 등록해 주세요.
                </p>
              ) : (
                results.map((r) => (
                  <button
                    key={r.studentId}
                    type="button"
                    disabled={r.alreadyEnrolled || attachingId !== null}
                    onClick={() => attach(r)}
                    className="flex w-full min-w-0 items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 enabled:cursor-pointer enabled:hover:bg-blue-50/50 disabled:cursor-not-allowed"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span
                        className={cn(
                          "truncate text-[12.5px] font-medium",
                          r.alreadyEnrolled ? "text-slate-400" : "text-slate-800",
                        )}
                      >
                        {r.name}
                      </span>
                      <span className="truncate text-[11px] text-slate-400">
                        {gradeLabel(r.grade)} ·{" "}
                        <span className="font-mono tracking-wider">
                          {r.studentCode}
                        </span>
                      </span>
                    </span>
                    {r.alreadyEnrolled ? (
                      <span className="shrink-0 text-[11px] text-slate-400">
                        이미 이 클래스에 있습니다
                      </span>
                    ) : attachingId === r.studentId ? (
                      <Loader2
                        className="size-3.5 shrink-0 animate-spin text-blue-500"
                        aria-hidden="true"
                      />
                    ) : (
                      <span className="shrink-0 text-[11px] font-semibold text-blue-600">
                        연결
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        {/* ── 새로 등록 ── */}
        <div className="flex h-8 items-center bg-slate-100 px-3 text-[11px] font-semibold text-slate-500">
          새로 등록
        </div>
        <div className="flex flex-col gap-3 p-3">
          <div>
            <label className="text-[11px] font-semibold text-slate-500">
              이름
            </label>
            <input
              ref={nameInputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submitNew();
                }
              }}
              maxLength={50}
              placeholder="학생 이름"
              className={cn(INPUT_CLASS, "mt-1.5")}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-500">
              학년
            </label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {GRADES.map((g) => {
                const activeChip = grade === g.value;
                return (
                  <button
                    key={g.value}
                    type="button"
                    aria-pressed={activeChip}
                    onClick={() => setGrade(g.value)}
                    className={cn(
                      "flex h-7 cursor-pointer items-center rounded-md border px-2.5 text-[11.5px] font-medium transition-colors",
                      activeChip
                        ? "border-slate-800 bg-slate-800 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800",
                    )}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={submitNew}
            disabled={pending}
            className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-blue-600 text-[12.5px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-default disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="size-4" aria-hidden="true" />
            )}
            등록
          </button>
          <p className="break-keep text-[11px] leading-relaxed text-slate-400">
            Enter 로 연속 등록할 수 있습니다 · 학생 코드는 자동 발급됩니다
          </p>
        </div>
      </div>
    </div>
  );
}
