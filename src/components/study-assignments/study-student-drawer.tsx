"use client";

// ============================================================================
// 학습 현황 — 학생별 취약 단어 드릴다운 드로어 (WORKSHEET 스터디 모드)
//
// getStudentWeakWords 소비: 학생 1명의 어휘 오답 이력을 이 과제만/전체 누적
// 토글로 조회한다. 단어 행 클릭 → 발생 이력 아코디언. 디렉터면 shadcn/slate
// 관례(학생 gd-* 클래스 미사용).
// ============================================================================

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, Loader2, RotateCcw, XCircle } from "lucide-react";
import {
  getStudentWeakWords,
  type StudentWeakWordRow,
} from "@/actions/study-assignments/study-stats";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** "7/20 14:32" — 서울(UTC+9 고정) 절대 시각 */
const KST_OFFSET = 9 * 3_600_000;
function fmtAt(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const d = new Date(t + KST_OFFSET);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${hh}:${mm}`;
}
function fmtDay(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const d = new Date(t + KST_OFFSET);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

type Scope = "assignment" | "all";

export function StudyStudentVocabDrawer({
  open,
  onClose,
  studentId,
  studentName,
  assignmentId,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string | null;
  studentName: string;
  assignmentId: string;
}) {
  // scope·expanded 는 학생마다 새로 시작해야 한다 — 부모가 studentId 를 key 로
  // 리마운트하므로(스터디 리포트 탭) 초기값만 두면 되고 별도 리셋 이펙트는 없다.
  const [scope, setScope] = useState<Scope>("assignment");
  const [rows, setRows] = useState<StudentWeakWordRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!open || !studentId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const res = await getStudentWeakWords({
        studentId,
        assignmentId: scope === "assignment" ? assignmentId : undefined,
      });
      if (cancelled) return;
      if (res.success && res.data) {
        setRows(res.data.entries);
      } else {
        setRows(null);
        setError(res.error ?? "취약 단어를 불러오지 못했습니다.");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, studentId, scope, assignmentId, reloadTick]);

  const recoveredCount = rows?.filter((r) => r.recovered).length ?? 0;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:w-[560px] sm:max-w-[560px]">
        <SheetHeader className="border-b border-slate-100 px-5 pb-3 pt-5">
          <SheetTitle className="text-[15px] text-slate-900">
            {studentName} · 취약 단어
          </SheetTitle>
          <SheetDescription asChild>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              {/* 스코프 세그먼트 토글 */}
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                {(
                  [
                    ["assignment", "이 과제만"],
                    ["all", "전체 누적"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={scope === value}
                    onClick={() => setScope(value)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors",
                      scope === value
                        ? "bg-white text-blue-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-700",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {rows && rows.length > 0 ? (
                <span className="text-[12px] tabular-nums text-slate-400">
                  오답 <span className="font-bold text-rose-600">{rows.length}</span>개 · 극복{" "}
                  <span className="font-bold text-emerald-600">{recoveredCount}</span>개
                </span>
              ) : null}
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[12.5px] text-slate-400">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              취약 단어를 불러오는 중입니다
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <p className="text-[13px] text-slate-500">{error}</p>
              <button
                type="button"
                onClick={() => setReloadTick((t) => t + 1)}
                className="h-8 rounded-md border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                다시 시도
              </button>
            </div>
          ) : !rows || rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <CheckCircle2 className="size-9 text-emerald-500" strokeWidth={1.5} aria-hidden />
              <p className="text-[13px] font-semibold text-slate-600">
                {scope === "assignment"
                  ? "이 과제에서 틀린 단어가 없습니다"
                  : "아직 틀린 단어가 없습니다"}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {rows.map((row) => {
                const isOpen = expanded === row.word;
                return (
                  <li
                    key={row.word}
                    className={cn(
                      "overflow-hidden rounded-lg border transition-colors",
                      row.recovered ? "border-slate-100 bg-slate-50/50" : "border-slate-200 bg-white",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : row.word)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="font-serif text-[15px] font-semibold text-slate-900">
                            {row.word}
                          </span>
                          {row.recovered ? (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
                              <RotateCcw className="size-2.5" strokeWidth={2.5} aria-hidden />
                              다시 맞힘
                            </span>
                          ) : null}
                        </span>
                        {row.meaning ? (
                          <p className="mt-0.5 truncate text-[12px] text-slate-500">{row.meaning}</p>
                        ) : (
                          <p className="mt-0.5 text-[12px] text-slate-400">뜻 정보 없음</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="flex flex-col items-end">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
                              row.recovered
                                ? "bg-slate-100 text-slate-500"
                                : "bg-rose-50 text-rose-600",
                            )}
                          >
                            오답 {row.wrongCount}회
                          </span>
                          <span className="mt-0.5 text-[11px] tabular-nums text-slate-400">
                            {fmtDay(row.lastWrongAt)}
                          </span>
                        </div>
                        <ChevronDown
                          className={cn(
                            "size-4 shrink-0 text-slate-300 transition-transform",
                            isOpen && "rotate-180",
                          )}
                          strokeWidth={2}
                          aria-hidden
                        />
                      </div>
                    </button>

                    {isOpen ? (
                      <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2.5">
                        <ul className="flex flex-col gap-1.5">
                          {row.occurrences.map((occ, i) => (
                            <li key={i} className="flex items-start gap-2">
                              {occ.correct ? (
                                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" strokeWidth={2} aria-hidden />
                              ) : (
                                <XCircle className="mt-0.5 size-3.5 shrink-0 text-rose-500" strokeWidth={2} aria-hidden />
                              )}
                              <div className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-1.5">
                                  <span className="min-w-0 truncate text-[12px] font-semibold text-slate-700">
                                    {occ.worksheetTitle}
                                  </span>
                                  {occ.attempt >= 2 ? (
                                    <span className="rounded bg-blue-50 px-1 py-0.5 text-[10px] font-bold text-blue-600">
                                      재도전
                                    </span>
                                  ) : null}
                                </span>
                                <span className="text-[11px] tabular-nums text-slate-400">
                                  {fmtAt(occ.at)}
                                </span>
                                {occ.response ? (
                                  <p className="mt-0.5 text-[12.5px] text-slate-500">
                                    답: <span className="font-serif">{occ.response}</span>
                                  </p>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
