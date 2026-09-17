"use client";

// ============================================================================
// 레일 [학생] 탭 — **인라인 학생 추가 패널**(rail-student-section 에서 분리,
// 26-09-05 · 500줄 상한).
//
// 검색은 **학원 전체 범위**다(searchRosterStudents) — 그래서 이 패널이 곧 「다른
// 반 학생을 이 시험에 담는 경로」다(목록 기본 범위는 우리 반이므로).
// 자체 시험지(INTERNAL)에서는 「명단에 없는 학생 새로 등록」 폼을 감춘다 —
// 서버 가드가 자유입력 추가를 거부하므로(assertStudentAddAllowed mode="freeform")
// 눌러 봐야 실패하는 버튼을 두지 않는다.
// 상태는 전부 이 컴포넌트 안에서 닫힌다 — 부모는 열림 여부만 안다.
// ============================================================================

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  addExamStudentFromRoster,
  createRosterStudentForExam,
  searchRosterStudents,
  type RosterStudentPick,
} from "@/actions/exam-report";
import { cn } from "@/lib/utils";

export function RailStudentAddPanel({
  analysisId,
  isInternal,
  onAdded,
}: {
  analysisId: string;
  isInternal: boolean;
  /** 담기·등록 성공 후 상세 재조회(목록에 즉시 반영) */
  onAdded: () => void;
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<RosterStudentPick[] | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGrade, setNewGrade] = useState(1);
  const [newBusy, setNewBusy] = useState(false);

  // 검색 페치는 **상호작용 구동**(디바운스 250ms) — 숨은 인스턴스는 침묵한다.
  useEffect(() => {
    const q = query.trim();
    setSearching(true);
    const t = window.setTimeout(() => {
      void searchRosterStudents(analysisId, q)
        .then((list) => setResults(list))
        .catch(() => setResults(null))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(t);
  }, [query, analysisId]);

  const handleAdd = async (pick: RosterStudentPick) => {
    if (pick.alreadyAdded || addingId) return;
    setAddingId(pick.id);
    try {
      await addExamStudentFromRoster(analysisId, pick.id);
      toast.success(`${pick.name} 학생을 등록했어요.`);
      setResults((rs) =>
        rs
          ? rs.map((r) => (r.id === pick.id ? { ...r, alreadyAdded: true } : r))
          : rs,
      );
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "학생 등록에 실패했습니다.");
    } finally {
      setAddingId(null);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || newBusy) return;
    setNewBusy(true);
    try {
      const res = await createRosterStudentForExam(analysisId, {
        name,
        grade: newGrade,
      });
      toast.success(
        `${name} 학생을 명단에 등록하고 담았어요 (학생코드 ${res.studentCode}).`,
      );
      setNewName("");
      setNewOpen(false);
      setQuery("");
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "학생 등록에 실패했습니다.");
    } finally {
      setNewBusy(false);
    }
  };

  return (
    <div className="min-w-0 space-y-2 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2">
      <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2">
        <Search className="size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="학생 이름 검색"
          className="h-7 w-full min-w-0 bg-transparent text-[12px] text-slate-700 outline-none placeholder:text-slate-300"
        />
        {searching ? (
          <Loader2 className="size-3 shrink-0 animate-spin text-slate-300" aria-hidden="true" />
        ) : null}
      </div>
      {results && results.length > 0 ? (
        <div className="max-h-48 space-y-0.5 overflow-y-auto overscroll-contain">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={r.alreadyAdded || addingId !== null}
              onClick={() => void handleAdd(r)}
              className={cn(
                "flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                r.alreadyAdded ? "cursor-default opacity-50" : "hover:bg-white",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-700">
                {r.name}
              </span>
              <span className="shrink-0 text-[11px] text-slate-400">
                {r.grade}학년
              </span>
              {r.schoolName ? (
                <span
                  className="max-w-[6rem] shrink-0 truncate text-[11px] text-slate-400"
                  title={r.schoolName}
                >
                  {r.schoolName}
                </span>
              ) : null}
              {addingId === r.id ? (
                <Loader2 className="size-3 shrink-0 animate-spin text-blue-500" aria-hidden="true" />
              ) : r.alreadyAdded ? (
                <span className="shrink-0 text-[11px] font-medium text-slate-400">
                  담김
                </span>
              ) : (
                <span className="shrink-0 text-[11px] font-medium text-blue-600">
                  담기
                </span>
              )}
            </button>
          ))}
        </div>
      ) : results && results.length === 0 && !searching ? (
        <p className="break-keep px-1 py-1 text-[11px] leading-relaxed text-slate-400">
          검색 결과가 없어요
        </p>
      ) : null}
      {isInternal ? null : newOpen ? (
        <div className="min-w-0 space-y-1.5 rounded-md border border-slate-200 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            새 학생 등록
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="이름"
              className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 outline-none placeholder:text-slate-300 focus:border-blue-300"
            />
            <div className="flex shrink-0 items-center gap-1">
              {[1, 2, 3].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setNewGrade(g)}
                  className={cn(
                    "flex h-7 cursor-pointer items-center rounded px-2 text-[11px] font-semibold tabular-nums transition-colors",
                    newGrade === g
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-500 ring-1 ring-inset ring-slate-200 hover:ring-slate-300",
                  )}
                >
                  {g}학년
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={newBusy || !newName.trim()}
              onClick={() => void handleCreate()}
              className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md bg-blue-600 px-2.5 text-[11.5px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {newBusy ? (
                <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden="true" />
              ) : null}
              등록
            </button>
          </div>
          <p className="break-keep text-[10.5px] leading-relaxed text-slate-400">
            학생 명단에 함께 등록되고 학생코드가 발급됩니다
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="cursor-pointer text-[11px] font-medium text-blue-600 underline-offset-2 transition-colors hover:text-blue-700 hover:underline"
        >
          명단에 없는 학생인가요? 새로 등록
        </button>
      )}
    </div>
  );
}
