"use client";

// ============================================================================
// 학생 시험 리포트 — 학생 추가 다이얼로그 (students-tab 에서 분리)
//
// 플로우 개편(26-07-08): 사진 업로드 경로 폐기. 이름 + 입력 주체 선택만 받는다.
//   ㉠ 학생이 직접 입력(기본) — 추가와 동시에 답안 링크(/a/{token})를 발급하고
//      다이얼로그 안에서 링크 + 복사 버튼 + 전달 안내를 즉시 보여준다.
//   ㉡ 선생님이 직접 입력 — 추가 후 정오표(학생 워크스페이스)로 안내한다.
// "한 명 더 추가"로 다건 등록 흐름을 잇는다(입력 주체 선택은 유지).
//
// 로스터 기준 통합(26-07-18): 이름 자유입력을 폐기하고 학원 로스터(Student)
// 에서 고른다. 고른 학생은 studentId 로 귀속돼 학생 관리 화면과 같은 학생을
// 가리키고 응시 이력이 축적된다. 로스터에 없는 이름은 이 자리에서 로스터에
// 등록(학생코드 발급)한 뒤 담는다 — 두 화면이 갈라지지 않는 단일 경로.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ClipboardList, Copy, Loader2, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { OptionRadioCard } from "@/components/workbench/shared/option-radio-card";
import {
  StudentFields,
  toStudentPayload,
  useStudentForm,
  type StudentFormValues,
} from "@/components/students/student-fields";
import {
  addExamStudentFromRoster,
  createRosterStudentForExam,
  enableAnswerLink,
  listAcademySchools,
  searchRosterStudents,
  type RosterStudentPick,
} from "@/actions/exam-report";
import type { ExamAnalysisStudentRow } from "../ui-contracts";
import { examReportBasePrefix } from "../grading/grading-shared";

interface AddStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysisId: string;
  /** 로스터 신규 등록 시 학년 기본값 — 분석의 학년에서 파싱해 넘긴다(없으면 1). */
  defaultGrade?: number;
  onAdded: (row: ExamAnalysisStudentRow) => void;
}

/** 입력 주체 — student: 학생이 링크로 직접 입력(기본) / teacher: 선생님이 정오표에 직접 입력 */
type EntryMode = "student" | "teacher";

/** 추가 완료 화면에 필요한 스냅샷 — 폼이 리셋돼도 안내가 유지되게 분리 보관. */
interface AddedResult {
  studentId: string;
  studentName: string;
  mode: EntryMode;
  /** ㉠에서 발급된 답안 링크 전체 URL — 발급 실패 시 null */
  answerUrl: string | null;
}

export function AddStudentDialog({
  open,
  onOpenChange,
  analysisId,
  defaultGrade = 1,
  onAdded,
}: AddStudentDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const base = examReportBasePrefix(pathname ?? "");

  const [query, setQuery] = useState("");
  const [roster, setRoster] = useState<RosterStudentPick[]>([]);
  const [searching, setSearching] = useState(false);
  // 신규 등록 폼 — 학생 관리와 동일한 필드 세트를 공용 블록으로 렌더한다.
  const [creating, setCreating] = useState(false);
  const [schools, setSchools] = useState<{ id: string; name: string; type: string }[]>([]);
  const newForm = useStudentForm();
  const [mode, setMode] = useState<EntryMode>("student");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AddedResult | null>(null);
  const [copied, setCopied] = useState(false);

  // 로스터 검색 — 열릴 때 1회 + 입력 디바운스(250ms). 최신 요청만 반영한다.
  useEffect(() => {
    if (!open || result != null) return;
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      void searchRosterStudents(analysisId, query)
        .then((rows) => {
          if (!cancelled) setRoster(rows);
        })
        .catch(() => {
          if (!cancelled) setRoster([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, analysisId, query, result]);

  // 학교 선택지는 신규 등록 패널을 처음 열 때만 가져온다(피커만 쓸 땐 불필요).
  useEffect(() => {
    if (!creating || schools.length > 0) return;
    void listAcademySchools()
      .then(setSchools)
      .catch(() => setSchools([]));
  }, [creating, schools.length]);

  const trimmed = query.trim();
  // 검색어와 정확히 같은 이름이 로스터에 없을 때만 "새 학생으로 등록"을 제안한다.
  const exactExists = roster.some((r) => r.name === trimmed);
  const canCreateNew = trimmed.length > 0 && !exactExists && !searching;

  function resetAll() {
    setQuery("");
    setRoster([]);
    setCreating(false);
    newForm.reset({ ...newForm.getValues(), name: "", grade: defaultGrade });
    setMode("student");
    setResult(null);
    setCopied(false);
  }

  function handleClose(next: boolean) {
    if (busy) return;
    if (!next) resetAll();
    onOpenChange(next);
  }

  /** "한 명 더 추가" — 입력 주체 선택은 유지한 채 피커로 되돌린다. */
  function handleAddAnother() {
    setQuery("");
    setCreating(false);
    setResult(null);
    setCopied(false);
  }

  /** 추가된 학생을 목록에 반영하고 결과 화면으로 — 로스터/신규 경로 공용 후처리. */
  const finishAdd = useCallback(
    async (
      student: { id: string; studentName: string },
      rosterStudentId: string,
      extraToast?: string,
    ) => {
      // ㉠ 학생 직접 입력 — 추가와 동시에 답안 링크 발급(실패해도 추가는 성공 처리).
      let answerToken: string | null = null;
      let answerUrl: string | null = null;
      if (mode === "student") {
        try {
          const { token } = await enableAnswerLink(student.id);
          answerToken = token;
          answerUrl = `${window.location.origin}/a/${token}`;
        } catch {
          toast.error("답안 링크 발급에 실패했습니다. 목록에서 다시 발급하세요.");
        }
      }

      const now = new Date().toISOString();
      onAdded({
        id: student.id,
        studentName: student.studentName,
        studentId: rosterStudentId,
        scoreSummary: null,
        gradingConfirmed: false,
        reportStatus: "NONE",
        shareEnabled: false,
        readState: { status: "NONE", readRuns: 0, uncertainties: [] },
        sourceFileCount: 0,
        answerToken,
        answerEnabled: answerToken != null,
        answerSubmittedAt: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      toast.success(extraToast ?? `${student.studentName} 학생을 추가했습니다.`);
      setResult({
        studentId: student.id,
        studentName: student.studentName,
        mode,
        answerUrl,
      });
      setQuery("");
      setCopied(false);
      // 로스터가 바뀌었을 수 있다(신규 등록) — 학생 관리 화면 재검증.
      router.refresh();
    },
    [mode, onAdded, router],
  );

  /** 로스터 학생 선택 → studentId 로 귀속시켜 담는다. */
  async function handlePick(pick: RosterStudentPick) {
    if (pick.alreadyAdded || busy) return;
    setBusy(true);
    try {
      const { student } = await addExamStudentFromRoster(analysisId, pick.id);
      await finishAdd(student, pick.id);
    } catch {
      toast.error("학생 추가에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  /** 로스터에 없는 이름 → 학생 관리에 먼저 등록(코드 발급)하고 담는다. */
  async function handleCreateNew(values: StudentFormValues) {
    if (busy) return;
    setBusy(true);
    try {
      const { student, rosterStudentId, studentCode } =
        await createRosterStudentForExam(analysisId, toStudentPayload(values));
      await finishAdd(
        student,
        rosterStudentId,
        `${student.studentName} 학생을 학생 관리에도 등록했어요 (코드 ${studentCode})`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "학생 등록에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("답안 입력 링크를 복사했어요. 학생에게 전달하세요.");
    } catch {
      toast.error("복사에 실패했습니다. 링크를 길게 눌러 직접 복사해 주세요.");
    }
  }

  function goToVerdict(studentId: string) {
    resetAll();
    onOpenChange(false);
    // ?step=verdict — 무응답 학생의 기본 착지는 '답안 수집'(deriveInitialStep)이라
    // "정오표에서 답안 입력" 라벨 약속대로 정오표 스텝에 바로 착지시킨다.
    router.push(
      `${base}/workbench/exam-report/${analysisId}/students/${studentId}?step=verdict`,
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        {result == null ? (
          <>
            <DialogHeader>
              <DialogTitle>학생 추가</DialogTitle>
              <DialogDescription>
                학생 관리에 등록된 학생 중에서 고르세요. 목록에 없으면 이름을 입력해
                바로 등록할 수 있어요.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">
                  답안 입력 방식
                </label>
                <div
                  role="radiogroup"
                  aria-label="답안 입력 방식"
                  className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                >
                  <OptionRadioCard
                    checked={mode === "student"}
                    onSelect={() => setMode("student")}
                    title="학생이 직접 입력"
                    description="답안 링크를 바로 발급해 학생에게 보내면, 학생이 휴대폰으로 전 문항을 입력합니다."
                    badge="추천"
                    disabled={busy}
                  />
                  <OptionRadioCard
                    checked={mode === "teacher"}
                    onSelect={() => setMode("teacher")}
                    title="선생님이 직접 입력"
                    description="시험지를 보고 채점 화면에서 문항별 선지를 선생님이 직접 입력합니다."
                    disabled={busy}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">
                  학생 선택
                </label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
                    aria-hidden
                  />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="이름으로 검색"
                    disabled={busy}
                    autoFocus
                    className="pl-8!"
                  />
                </div>

                <div className="mt-2 max-h-[240px] overflow-y-auto rounded-lg border border-slate-200">
                  {searching && roster.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 px-3 py-8 text-[12.5px] text-slate-400">
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      불러오는 중…
                    </div>
                  ) : roster.length === 0 ? (
                    <div className="px-3 py-8 text-center text-[12.5px] text-slate-400">
                      {trimmed
                        ? "검색 결과가 없습니다."
                        : "학생 관리에 등록된 학생이 없습니다."}
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {roster.map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => void handlePick(s)}
                            disabled={busy || s.alreadyAdded}
                            className={cn(
                              "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                              s.alreadyAdded
                                ? "cursor-not-allowed bg-slate-50/60"
                                : "hover:bg-blue-50/60 disabled:cursor-not-allowed",
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <p
                                className={cn(
                                  "truncate text-[13.5px] font-bold",
                                  s.alreadyAdded ? "text-slate-400" : "text-slate-800",
                                )}
                              >
                                {s.name}
                              </p>
                              <p className="mt-px truncate text-[11.5px] text-slate-400">
                                {s.grade}학년
                                {s.schoolName ? ` · ${s.schoolName}` : ""} ·{" "}
                                <span className="font-mono">{s.studentCode}</span>
                              </p>
                            </div>
                            {s.alreadyAdded ? (
                              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-400">
                                담김
                              </span>
                            ) : (
                              <span className="shrink-0 text-[11.5px] font-bold text-blue-600">
                                추가
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* 로스터에 없는 이름 — 학생 관리와 동일한 폼으로 여기서 등록한다 */}
              {!creating && canCreateNew && (
                <button
                  type="button"
                  onClick={() => {
                    newForm.reset({
                      ...newForm.getValues(),
                      name: trimmed,
                      grade: defaultGrade,
                    });
                    setCreating(true);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2.5 text-left transition-colors hover:bg-blue-50"
                >
                  <UserPlus className="size-4 shrink-0 text-blue-600" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-bold text-slate-700">
                      &lsquo;{trimmed}&rsquo; 학생을 새로 등록
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-slate-500">
                      학생 관리에 등록하고 이 시험에 담습니다. 학생 코드는 자동 발급돼요.
                    </span>
                  </span>
                </button>
              )}

              {creating && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3.5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-[12.5px] font-bold text-slate-700">
                      새 학생 등록
                    </p>
                    <button
                      type="button"
                      onClick={() => setCreating(false)}
                      disabled={busy}
                      className="text-[11.5px] font-semibold text-slate-400 transition-colors hover:text-slate-600"
                    >
                      취소
                    </button>
                  </div>
                  <Form {...newForm}>
                    <form
                      onSubmit={newForm.handleSubmit(handleCreateNew)}
                      className="space-y-4"
                    >
                      <StudentFields
                        form={newForm}
                        schools={schools}
                        autoFocusName={false}
                      />
                      <Button
                        type="submit"
                        disabled={busy}
                        className="h-10 w-full bg-blue-600 text-[13px] font-bold hover:bg-blue-700"
                      >
                        {busy ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <UserPlus className="size-4" aria-hidden />
                        )}
                        학생 관리에 등록하고 추가
                      </Button>
                    </form>
                  </Form>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={busy}
              >
                닫기
              </Button>
            </DialogFooter>
          </>
        ) : result.mode === "student" ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {result.answerUrl != null
                  ? `${result.studentName} 학생의 답안 링크가 준비됐어요`
                  : `${result.studentName} 학생을 추가했습니다`}
              </DialogTitle>
              <DialogDescription>
                {result.answerUrl != null
                  ? "이 링크를 학생에게 보내주세요. 학생이 전 문항을 입력하면 제출됨 표시가 뜹니다."
                  : "답안 링크 발급에 실패했습니다. 학생 목록의 링크 복사 버튼으로 다시 발급할 수 있습니다."}
              </DialogDescription>
            </DialogHeader>

            {result.answerUrl != null && (
              <div className="space-y-2.5">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">
                    답안 입력 링크
                  </label>
                  <Input
                    readOnly
                    value={result.answerUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="font-mono text-[12px] text-slate-600"
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => void handleCopy(result.answerUrl as string)}
                  className="h-11 w-full bg-blue-600 text-[13.5px] font-semibold hover:bg-blue-700"
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copied ? "복사됨 — 학생에게 보내주세요" : "링크 복사"}
                </Button>
                <p className="text-[12px] leading-relaxed text-slate-500">
                  학생이 링크에서 전 문항을 입력해 제출하면 목록의 답안 수집
                  상태가 <span className="font-medium text-emerald-600">제출됨</span>
                  으로 바뀝니다.
                </p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleAddAnother}>
                한 명 더 추가
              </Button>
              <Button
                type="button"
                onClick={() => handleClose(false)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                완료
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{result.studentName} 학생을 추가했습니다</DialogTitle>
              <DialogDescription>
                채점 화면에서 문항별 선지를 직접 입력해주세요. 입력한 답은 자동으로
                채점됩니다.
              </DialogDescription>
            </DialogHeader>

            <Button
              type="button"
              onClick={() => goToVerdict(result.studentId)}
              className="h-11 w-full bg-blue-600 text-[13.5px] font-semibold hover:bg-blue-700"
            >
              <ClipboardList className="h-4 w-4" />
              채점에서 답안 입력
            </Button>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleAddAnother}>
                한 명 더 추가
              </Button>
              <Button
                type="button"
                onClick={() => handleClose(false)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                완료
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
