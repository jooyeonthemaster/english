"use client";

// ============================================================================
// 클래스 스튜디오 — 학생 등록 모달 (docs/class-studio-spec.md §3.2 학생 등록 모달)
//
// 상단: 기존 학원 학생 검색(searchAcademyStudents, 300ms 디바운스) → 선택 시
// attachStudentsToStudioClass 로 연결(중복 계정 방지). 이미 편성된 학생은 비활성.
// 하단: 신규 등록 폼 — 이름 1필드(스펙 §0·§3.2, ERP 필드 미노출 → 학년 선택 없음.
// grade 미지정 시 서버가 기본 1로 처리). 엔터 연속 등록 지원.
// addStudioStudent 성공 시 onAdded(studentId) → 부모가 초대 키트 시트를 연다.
// ============================================================================

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Plus, Search, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { GRADES } from "@/lib/constants";
import {
  addStudioStudent,
  attachStudentsToStudioClass,
  searchAcademyStudents,
  type StudioStudentSearchRow,
} from "@/actions/studio/students";

export function StudentAddModal({
  open,
  classId,
  onClose,
  onAdded,
  onAttached,
}: {
  open: boolean;
  classId: string;
  onClose: () => void;
  /** 신규 등록 성공 — 부모가 목록 갱신 + 초대 키트 시트 오픈 */
  onAdded: (studentId: string) => void;
  /** 기존 학생 연결 성공 — 부모가 목록 갱신 */
  onAttached: () => void;
}) {
  // ── 기존 학생 검색 ─────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudioStudentSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const searchSeq = useRef(0);

  // ── 신규 등록 폼 ───────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // 열 때마다 초기화
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setName("");
    setAttachingId(null);
  }, [open]);

  // 300ms 디바운스 검색 — 늦게 도착한 응답은 seq 로 폐기
  useEffect(() => {
    if (!open) return;
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
  }, [open, query, classId]);

  if (!open) return null;

  const attach = (row: StudioStudentSearchRow) => {
    if (row.alreadyEnrolled || attachingId) return;
    setAttachingId(row.studentId);
    void (async () => {
      const res = await attachStudentsToStudioClass({
        classId,
        studentIds: [row.studentId],
      });
      setAttachingId(null);
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
      onAttached();
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
        const res = await addStudioStudent({ classId, name: trimmed });
        if (!res.success || !res.data) {
          toast.error(res.error ?? "학생 등록에 실패했습니다.");
          return;
        }
        toast.success(
          `「${trimmed}」 학생을 등록했습니다 · 코드 ${res.data.studentCode}`,
        );
        // 연속 등록 — 인풋 초기화·포커스 유지
        setName("");
        nameInputRef.current?.focus();
        onAdded(res.data.studentId);
      } finally {
        inFlight.current = false;
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="학생 등록"
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 p-6 pb-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
            <UserRoundPlus className="h-4.5 w-4.5 text-blue-600" />
          </span>
          <div>
            <h2 className="text-[15px] font-bold text-slate-900">학생 등록</h2>
            <p className="text-xs text-slate-400">
              기존 학생을 찾아 연결하거나, 새로 등록해 주세요.
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {/* 기존 학생 검색 */}
          <div>
            <label className="text-xs font-semibold text-slate-500">
              기존 학생 검색
            </label>
            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름으로 검색"
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3.5 text-sm text-slate-900 outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {query.trim() && (
              <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
                {searching && (
                  <div className="flex items-center gap-2 px-3.5 py-3 text-xs text-slate-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    검색 중입니다…
                  </div>
                )}
                {!searching && results.length === 0 && (
                  <p className="px-3.5 py-3 text-xs text-slate-400">
                    일치하는 학생이 없습니다 — 아래에서 새로 등록해 주세요.
                  </p>
                )}
                {!searching &&
                  results.map((r) => (
                    <button
                      key={r.studentId}
                      type="button"
                      disabled={r.alreadyEnrolled || attachingId !== null}
                      onClick={() => attach(r)}
                      className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5 text-left last:border-b-0 enabled:hover:bg-blue-50/50 disabled:cursor-not-allowed"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={`truncate text-sm font-medium ${
                            r.alreadyEnrolled ? "text-slate-400" : "text-slate-800"
                          }`}
                        >
                          {r.name}
                        </span>
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {GRADES.find((g) => g.value === r.grade)?.label ??
                            `${r.grade}학년`}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] tracking-wider text-slate-400">
                          {r.studentCode}
                        </span>
                      </span>
                      {r.alreadyEnrolled ? (
                        <span className="shrink-0 text-[11px] text-slate-400">
                          이미 이 클래스에 있습니다
                        </span>
                      ) : attachingId === r.studentId ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-500" />
                      ) : (
                        <span className="shrink-0 text-[11px] font-semibold text-blue-600">
                          연결
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* 구분선 */}
          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-slate-100" />
            <span className="text-[11px] font-semibold text-slate-400">
              또는 새로 등록
            </span>
            <span className="h-px flex-1 bg-slate-100" />
          </div>

          {/* 신규 등록 폼 */}
          <div>
            <label className="text-xs font-semibold text-slate-500">이름</label>
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
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />

            <div className="mt-3 flex items-center justify-end">
              <button
                type="button"
                onClick={submitNew}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                등록
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Enter 로 연속 등록할 수 있습니다 · 학생 코드는 자동 발급됩니다
            </p>
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
