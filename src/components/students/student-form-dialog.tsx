"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, ListPlus, Loader2, UserRound, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createStudent, updateStudent } from "@/actions/students";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  StudentFields,
  deriveStudentDefaults,
  toStudentPayload,
  useStudentForm,
  type StudentFormValues,
} from "./student-fields";
import { StudentFormSuccessStep } from "./student-form-success-step";
import type {
  HubClass,
  HubSchool,
  HubStudent,
} from "@/app/(director)/director/tutor/_components/types";


interface StudentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: HubStudent | null;
  schools: HubSchool[];
  /** Optional — the teacher student list omits this; success step falls back to "no classes". */
  classes?: HubClass[];
  showBilling?: boolean;
  isDirector?: boolean;
}

/** 큐 항목에 부가정보가 실려 있는지 (우측 리스트 칩 표시용) */
function hasDetails(v: StudentFormValues) {
  return !!(v.birthDate || v.gender || v.phone || v.schoolId || v.memo);
}
function hasParent(v: StudentFormValues) {
  return !!(v.parentName || v.parentPhone);
}

type BatchOutcome = {
  codes: { id: string; name: string; code: string }[];
  errors: { name: string; reason: string }[];
};

const GENDER_LABEL: Record<string, string | undefined> = {
  MALE: "남",
  FEMALE: "여",
};
const RELATION_LABEL: Record<string, string | undefined> = {
  MOTHER: "어머니",
  FATHER: "아버지",
  GUARDIAN: "보호자",
  OTHER: "기타",
};

/** 큐 상세 팝오버의 한 줄 — 값이 없으면 줄 자체를 그리지 않는다. */
function QueueDetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-[12px]">
      <dt className="w-[72px] shrink-0 font-bold text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-slate-700">{value}</dd>
    </div>
  );
}

export function StudentFormDialog({
  open,
  onOpenChange,
  student,
  schools,
  classes = [],
}: StudentFormDialogProps) {
  const router = useRouter();
  const isEditing = !!student;
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<"form" | "done" | "batch-done">("form");
  const [created, setCreated] = useState<{ id: string; code: string; name: string } | null>(null);
  const [batch, setBatch] = useState<BatchOutcome | null>(null);
  const [queue, setQueue] = useState<StudentFormValues[]>([]);
  // 큐 카드 수정 중인 인덱스 — null 이면 새로 담는 중.
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  // 상세 팝오버가 열린 카드 인덱스(한 번에 하나만).
  const [openCardIndex, setOpenCardIndex] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const inFlight = useRef(false);

  // 큐 카드 상세에 학교를 이름으로 보여주기 위한 조회 목록. 학교 인라인 추가는
  // StudentFields 가 소유하며, 새로 만든 학교는 router.refresh() 로 이 prop 에
  // 반영된다.
  const schoolOptions = schools;

  const form = useStudentForm(student);

  // Reset on open / student change — fixes stale values when re-opening to edit.
  useEffect(() => {
    if (open) {
      form.reset(deriveStudentDefaults(student));
      setStep("form");
      setCreated(null);
      setBatch(null);
      setQueue([]);
      setCopied(false);
      setEditingIndex(null);
      setOpenCardIndex(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, student]);

  /** 큐 카드 상세에 학교를 id 가 아닌 이름으로 보여주기 위한 조회. */
  const schoolNameOf = (id?: string) =>
    id ? schoolOptions.find((s) => s.id === id)?.name : undefined;

  function submitEdit(values: StudentFormValues) {
    if (!student) return;
    if (inFlight.current) return; // synchronous double-submit guard (isPending lags a tick)
    inFlight.current = true;
    startTransition(async () => {
      try {
        const result = await updateStudent(student.id, toStudentPayload(values));
        if (result.success) {
          toast.success("학생 정보를 수정했어요.");
          onOpenChange(false);
          router.refresh();
        } else {
          toast.error(result.error || "수정에 실패했어요.");
        }
      } finally {
        inFlight.current = false;
      }
    });
  }

  /**
   * 좌측 폼 → 우측 큐. 새로 담을 땐 뒤에 추가하고, 카드 수정 중이면 그 자리를
   * 교체한다(순서 유지). 담은 뒤엔 학년만 남기고 비워 연속 입력을 잇는다.
   */
  function addToQueue(values: StudentFormValues) {
    if (editingIndex !== null) {
      const at = editingIndex;
      setQueue((q) => q.map((row, i) => (i === at ? values : row)));
      setEditingIndex(null);
      toast.success(`${values.name} 학생 정보를 수정했어요.`);
    } else {
      setQueue((q) => [...q, values]);
    }
    form.reset({ ...deriveStudentDefaults(null), grade: values.grade });
    form.setFocus("name");
  }

  /** 카드 → 좌측 폼으로 불러와 수정. 폼이 곧 편집기라 필드 중복 없이 재사용한다. */
  function startEditQueueItem(index: number) {
    const row = queue[index];
    if (!row) return;
    form.reset(row);
    setEditingIndex(index);
    setOpenCardIndex(null);
    form.setFocus("name");
  }

  /** 수정 취소 — 폼을 비우고 새로 담기 모드로 되돌린다(큐는 그대로). */
  function cancelEditQueueItem() {
    setEditingIndex(null);
    form.reset(deriveStudentDefaults(null));
  }

  function removeFromQueue(index: number) {
    setQueue((q) => q.filter((_, i) => i !== index));
    setOpenCardIndex(null);
    // 수정 중이던 카드가 사라지면 편집 상태도 함께 정리(인덱스 밀림 방지).
    setEditingIndex((cur) => {
      if (cur === null) return null;
      if (cur === index) {
        form.reset(deriveStudentDefaults(null));
        return null;
      }
      return cur > index ? cur - 1 : cur;
    });
  }

  /** 큐에 담긴 학생만 순차 등록 (좌측 입력 중인 값은 포함하지 않는다 — 반드시
      "목록에 추가"로 명시 합류시킨 것만 등록되는 예측 가능한 모델). */
  function registerAll() {
    if (inFlight.current) return;
    if (queue.length === 0) return;
    inFlight.current = true;
    startTransition(async () => {
      try {
        const outcome: BatchOutcome = { codes: [], errors: [] };
        // 순차 등록 — 학생코드 발급이 학원 스코프 중복 검사를 하므로 병렬 금지.
        for (const row of queue) {
          const result = await createStudent("__CURRENT__", toStudentPayload(row));
          if (result.success && result.studentId && result.studentCode) {
            outcome.codes.push({ id: result.studentId, name: row.name, code: result.studentCode });
          } else {
            outcome.errors.push({ name: row.name, reason: result.error || "등록 실패" });
          }
        }

        if (outcome.codes.length === 0) {
          toast.error(outcome.errors[0]?.reason || "등록에 실패했어요.");
          return;
        }
        if (outcome.codes.length === 1 && outcome.errors.length === 0) {
          // 1명 등록은 기존 성공 스텝(반 배정 포함) 그대로.
          const only = outcome.codes[0];
          setCreated({ id: only.id, code: only.code, name: only.name });
          setStep("done");
        } else {
          setBatch(outcome);
          setStep("batch-done");
        }
        setQueue([]);
        router.refresh();
      } finally {
        inFlight.current = false;
      }
    });
  }

  function copyBatchCodes() {
    if (!batch) return;
    const text = batch.codes.map((c) => `${c.name}\t${c.code}`).join("\n");
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  const onSubmit = isEditing ? submitEdit : addToQueue;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Top-anchored (top-[6vh] translate-y-0) so expanding the Collapsibles
          grows the dialog downward instead of recentering = no vertical jitter. */}
      <DialogContent
        className={cn(
          "top-[3vh] max-h-[94vh] translate-y-0 overflow-y-auto rounded-xl",
          isEditing || step !== "form"
            ? "sm:max-w-[520px]"
            : "flex h-[94vh] w-[96vw] max-w-[1400px] flex-col sm:max-w-[1400px]",
        )}
      >
        {step === "batch-done" && batch ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg font-black text-[#191F28]">
                {batch.codes.length}명 등록 완료
              </DialogTitle>
              <DialogDescription className="text-sm font-medium text-[#8B95A1]">
                학생 코드가 발급됐어요. 학생 앱 로그인에 사용됩니다.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[46vh] overflow-y-auto rounded-lg border border-slate-200">
              {batch.codes.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 border-b border-slate-100 px-3.5 py-2.5 last:border-0"
                >
                  <span className="min-w-0 truncate text-[13.5px] font-bold text-slate-800">
                    {c.name}
                  </span>
                  <code className="shrink-0 rounded-md bg-slate-100 px-2 py-1 font-mono text-[12.5px] font-semibold tracking-wide text-slate-700">
                    {c.code}
                  </code>
                </div>
              ))}
            </div>
            {batch.errors.length > 0 ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5">
                <p className="text-[12px] font-bold text-rose-700">
                  등록하지 못한 학생 {batch.errors.length}명
                </p>
                <ul className="mt-1 space-y-0.5">
                  {batch.errors.map((e, i) => (
                    <li key={`${e.name}-${i}`} className="text-[12px] text-rose-600">
                      {e.name} — {e.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={copyBatchCodes}
                className="h-10 rounded-lg border-[#E5E8EB] font-bold text-[#4E5968]"
              >
                {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                {copied ? "복사됨" : "이름·코드 전체 복사"}
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-lg border-[#E5E8EB] font-bold text-[#4E5968]"
                  onClick={() => {
                    setBatch(null);
                    setStep("form");
                  }}
                >
                  계속 등록
                </Button>
                <Button
                  type="button"
                  className="h-10 rounded-lg bg-blue-600 font-bold text-white hover:bg-blue-700"
                  onClick={() => onOpenChange(false)}
                >
                  완료
                </Button>
              </div>
            </div>
          </>
        ) : step === "done" && created ? (
          <>
            <DialogHeader className="sr-only">
              <DialogTitle>학생 등록 완료</DialogTitle>
              <DialogDescription>발급된 학생 코드와 반 배정</DialogDescription>
            </DialogHeader>
            <StudentFormSuccessStep
              studentId={created.id}
              studentName={created.name}
              studentCode={created.code}
              classes={classes}
              onAddAnother={() => {
                form.reset(deriveStudentDefaults(null));
                setCreated(null);
                setStep("form");
                                  }}
              onClose={() => onOpenChange(false)}
            />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg font-black text-[#191F28]">
                {isEditing ? "학생 정보 수정" : "학생 등록"}
              </DialogTitle>
              <DialogDescription className="text-sm font-medium text-[#8B95A1]">
                {isEditing
                  ? "학생 정보를 수정합니다."
                  : "왼쪽에서 입력해 목록에 추가하세요. 한 명이든 여러 명이든 한 번에 등록되고, 학생 코드는 자동으로 발급돼요."}
              </DialogDescription>
            </DialogHeader>

            <div
              className={cn(
                !isEditing &&
                  "grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(440px,540px)_minmax(0,1fr)]",
              )}
            >
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <StudentFields form={form} schools={schools} />

                <div className="flex justify-end gap-2 pt-1">
                  {isEditing ? (
                    <Button
                      type="submit"
                      disabled={isPending}
                      className="h-10 rounded-lg bg-blue-600 font-bold text-white hover:bg-blue-700"
                    >
                      {isPending && <Loader2 className="size-4 animate-spin" />}
                      수정
                    </Button>
                  ) : editingIndex !== null ? (
                    /* 카드 수정 중 — 담기 대신 「수정 완료」로 바뀌고 취소를 함께 준다. */
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={cancelEditQueueItem}
                        className="h-10 rounded-lg font-bold text-slate-500"
                      >
                        취소
                      </Button>
                      <Button
                        type="submit"
                        disabled={isPending}
                        className="h-10 rounded-lg bg-blue-600 font-bold text-white hover:bg-blue-700"
                      >
                        <Check className="size-4" />
                        수정 완료
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="submit"
                      disabled={isPending}
                      variant="outline"
                      className="h-10 rounded-lg border-blue-200 font-bold text-blue-700 hover:bg-blue-50"
                    >
                      <ListPlus className="size-4" />
                      목록에 추가
                    </Button>
                  )}
                </div>
              </form>
            </Form>

            {/* 우측 패널 — 추가한 학생이 쌓이는 큐 (자료 추출 UX 문법) */}
            {!isEditing ? (
              <aside className="flex min-h-[300px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60 lg:min-h-0">
                <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3.5 py-2.5">
                  <span className="text-[12.5px] font-bold text-slate-700">추가한 학생</span>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11.5px] font-bold tabular-nums text-blue-700">
                    {queue.length}명
                  </span>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  {queue.length === 0 ? (
                    <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 px-4 text-center">
                      <span className="flex size-9 items-center justify-center rounded-full bg-white text-slate-300 ring-1 ring-slate-200">
                        <UserRound className="size-4.5" aria-hidden />
                      </span>
                      <p className="text-[12px] leading-5 text-slate-400">
                        왼쪽에서 학생을 입력하고
                        <br />
                        <b className="font-bold text-slate-500">목록에 추가</b>를 누르면 여기에 쌓여요
                      </p>
                    </div>
                  ) : (
                    <ul className="space-y-1.5">
                      {queue.map((q, i) => (
                        <li key={`${q.name}-${i}`}>
                          {/* 카드 클릭 → 입력값 상세 팝오버(확인) → 「수정」이면 좌측
                              폼으로 불러온다. 팝오버 안에 폼을 또 그리지 않는 이유:
                              학교 추가·학부모 정보가 이미 팝오버라 중첩되고, 필드
                              10여 개를 복제하면 좌측 폼과 곧 어긋난다. */}
                          <Popover
                            open={openCardIndex === i}
                            onOpenChange={(o) => setOpenCardIndex(o ? i : null)}
                          >
                            <PopoverTrigger asChild>
                              <div
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setOpenCardIndex(i);
                                  }
                                }}
                                className={cn(
                                  "group flex cursor-pointer items-center gap-2.5 rounded-lg border bg-white px-3 py-2 transition-colors",
                                  editingIndex === i
                                    ? "border-blue-400 ring-2 ring-blue-200/60"
                                    : "border-slate-200 hover:border-blue-300 hover:bg-blue-50/30",
                                )}
                              >
                                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-black tabular-nums text-blue-600">
                                  {i + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[13px] font-bold text-slate-800">
                                    {q.name}
                                  </p>
                                  <p className="mt-px flex items-center gap-1.5 text-[11px] text-slate-400">
                                    {q.grade}학년
                                    {hasDetails(q) ? <span>· 추가 정보</span> : null}
                                    {hasParent(q) ? <span>· 학부모</span> : null}
                                    {editingIndex === i ? (
                                      <span className="font-bold text-blue-600">· 수정 중</span>
                                    ) : null}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeFromQueue(i);
                                  }}
                                  aria-label={`${q.name} 제거`}
                                  className="flex size-6 shrink-0 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600"
                                >
                                  <X className="size-3.5" aria-hidden />
                                </button>
                              </div>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              className="w-[min(92vw,320px)] p-0"
                            >
                              <div className="border-b border-slate-100 px-3.5 py-2.5">
                                <p className="text-[13px] font-bold text-slate-900">{q.name}</p>
                                <p className="text-[11.5px] text-slate-400">
                                  {q.grade}학년 · 입력한 내용
                                </p>
                              </div>
                              <dl className="max-h-[260px] space-y-1.5 overflow-y-auto px-3.5 py-3">
                                <QueueDetailRow label="학교" value={schoolNameOf(q.schoolId)} />
                                <QueueDetailRow label="생년월일" value={q.birthDate} />
                                <QueueDetailRow label="성별" value={GENDER_LABEL[q.gender ?? ""]} />
                                <QueueDetailRow label="전화번호" value={q.phone} />
                                <QueueDetailRow label="특이사항" value={q.memo} />
                                <QueueDetailRow label="학부모" value={q.parentName} />
                                <QueueDetailRow
                                  label="관계"
                                  value={RELATION_LABEL[q.parentRelation ?? ""]}
                                />
                                <QueueDetailRow label="학부모 연락처" value={q.parentPhone} />
                                <QueueDetailRow label="긴급연락처" value={q.emergencyContact} />
                                {!hasDetails(q) && !hasParent(q) ? (
                                  <p className="py-2 text-center text-[12px] text-slate-400">
                                    이름·학년 외에는 입력한 내용이 없어요.
                                  </p>
                                ) : null}
                              </dl>
                              <div className="flex justify-end gap-2 border-t border-slate-100 px-3.5 py-2.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => removeFromQueue(i)}
                                  className="border-rose-200 text-rose-600 hover:bg-rose-50"
                                >
                                  <X className="size-3.5" />
                                  삭제
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => startEditQueueItem(i)}
                                  className="bg-blue-600 hover:bg-blue-700"
                                >
                                  수정
                                </Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="border-t border-slate-200 bg-white p-2.5">
                  <Button
                    type="button"
                    onClick={registerAll}
                    disabled={isPending || queue.length === 0}
                    className="h-10 w-full rounded-lg bg-blue-600 font-bold text-white hover:bg-blue-700"
                  >
                    {isPending && <Loader2 className="size-4 animate-spin" />}
                    {queue.length > 0
                      ? `${queue.length}명 등록하고 코드 발급`
                      : "등록하고 코드 발급"}
                  </Button>
                </div>
              </aside>
            ) : null}
            </div>
          </>
        )}
      </DialogContent>

    </Dialog>
  );
}
