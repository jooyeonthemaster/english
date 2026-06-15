"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ChevronDown, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { GRADES } from "@/lib/constants";
import { createStudent, updateStudent } from "@/actions/students";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { StudentFormSuccessStep } from "./student-form-success-step";
import type {
  HubClass,
  HubSchool,
  HubStudent,
} from "@/app/(director)/director/tutor/_components/types";

const studentFormSchema = z.object({
  name: z.string().min(1, "이름을 입력하세요").max(50, "이름은 50자 이내로 입력하세요"),
  grade: z.number().int().min(1, "학년을 선택하세요").max(3, "학년을 선택하세요"),
  birthDate: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  phone: z.string().optional(),
  schoolId: z.string().optional(),
  memo: z.string().optional(),
  parentName: z.string().optional(),
  parentPhone: z.string().optional(),
  parentRelation: z.enum(["MOTHER", "FATHER", "GUARDIAN", "OTHER"]).optional(),
  emergencyContact: z.string().optional(),
});

type FormValues = z.infer<typeof studentFormSchema>;

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

function deriveDefaults(student: HubStudent | null): FormValues {
  const parent = student?.parentLinks?.[0]?.parent;
  return {
    name: student?.name ?? "",
    grade: student?.grade ?? 1,
    birthDate: student?.birthDate
      ? new Date(student.birthDate).toISOString().split("T")[0]
      : "",
    gender: (student?.gender as "MALE" | "FEMALE" | undefined) ?? undefined,
    phone: student?.phone ?? "",
    schoolId: student?.schoolId ?? "",
    memo: student?.memo ?? "",
    parentName: parent?.name ?? "",
    parentPhone: parent?.phone ?? "",
    parentRelation:
      (parent?.relation as "MOTHER" | "FATHER" | "GUARDIAN" | "OTHER" | undefined) ?? undefined,
    emergencyContact: parent?.emergencyContact ?? "",
  };
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
  const [step, setStep] = useState<"form" | "done">("form");
  const [created, setCreated] = useState<{ id: string; code: string; name: string } | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [parentOpen, setParentOpen] = useState(false);
  const inFlight = useRef(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: deriveDefaults(student),
  });

  // Reset on open / student change — fixes stale values when re-opening to edit.
  useEffect(() => {
    if (open) {
      form.reset(deriveDefaults(student));
      setStep("form");
      setCreated(null);
      setDetailsOpen(false);
      setParentOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, student]);

  function onSubmit(values: FormValues) {
    if (inFlight.current) return; // synchronous double-submit guard (isPending lags a tick)
    inFlight.current = true;
    startTransition(async () => {
      try {
        const payload = {
          name: values.name,
          grade: values.grade,
          birthDate: values.birthDate || undefined,
          gender: values.gender || undefined,
          phone: values.phone || undefined,
          schoolId: values.schoolId || undefined,
          memo: values.memo || undefined,
          parentName: values.parentName || undefined,
          parentPhone: values.parentPhone || undefined,
          parentRelation: values.parentRelation || undefined,
          emergencyContact: values.emergencyContact || undefined,
        };

        if (isEditing && student) {
          const result = await updateStudent(student.id, payload);
          if (result.success) {
            toast.success("학생 정보를 수정했어요.");
            onOpenChange(false);
            router.refresh();
          } else {
            toast.error(result.error || "수정에 실패했어요.");
          }
          return;
        }

        const result = await createStudent("__CURRENT__", payload);
        if (result.success && result.studentId && result.studentCode) {
          setCreated({ id: result.studentId, code: result.studentCode, name: values.name });
          setStep("done");
        } else {
          toast.error(result.error || "등록에 실패했어요.");
        }
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Top-anchored (top-[6vh] translate-y-0) so expanding the Collapsibles
          grows the dialog downward instead of recentering = no vertical jitter. */}
      <DialogContent className="top-[6vh] max-h-[88vh] translate-y-0 overflow-y-auto rounded-xl sm:max-w-[520px]">
        {step === "done" && created ? (
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
                form.reset(deriveDefaults(null));
                setCreated(null);
                setStep("form");
                setDetailsOpen(false);
                setParentOpen(false);
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
                  : "이름과 학년만 입력하면 됩니다. 학생 코드는 자동으로 발급돼요."}
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Required: name */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-bold text-[#4E5968]">이름 *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="홍길동"
                          autoFocus
                          className="h-11 rounded-lg text-base"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Required: grade (segmented) */}
                <FormField
                  control={form.control}
                  name="grade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-bold text-[#4E5968]">학년 *</FormLabel>
                      <FormControl>
                        <div
                          role="radiogroup"
                          aria-label="학년"
                          className="grid grid-cols-3 gap-2"
                          onKeyDown={(e) => {
                            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                              e.preventDefault();
                              field.onChange(Math.min(3, (field.value || 1) + 1));
                            } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                              e.preventDefault();
                              field.onChange(Math.max(1, (field.value || 1) - 1));
                            }
                          }}
                        >
                          {GRADES.map((g) => {
                            const on = field.value === g.value;
                            return (
                              <button
                                key={g.value}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                tabIndex={on ? 0 : -1}
                                onClick={() => field.onChange(g.value)}
                                className={cn(
                                  "h-11 rounded-lg border text-sm font-bold transition",
                                  on
                                    ? "border-blue-600 bg-blue-50 text-blue-700"
                                    : "border-[#E5E8EB] text-[#4E5968] hover:bg-[#F7F8FA]",
                                )}
                              >
                                {g.label}
                              </button>
                            );
                          })}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Progressive disclosure: 추가 정보 */}
                <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg bg-[#F7F8FA] px-3 py-2.5 text-sm font-bold text-[#4E5968] transition hover:bg-[#F2F4F6]"
                    >
                      추가 정보 <span className="font-medium text-[#AEB5BC]">학교·생년월일·성별·연락처·특이사항</span>
                      <ChevronDown
                        className={cn("size-4 transition-transform", detailsOpen && "rotate-180")}
                      />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 pt-4">
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="schoolId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-bold text-[#6B7684]">학교</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ?? ""}>
                              <FormControl>
                                <SelectTrigger className="h-10 rounded-lg">
                                  <SelectValue placeholder="학교 선택" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {schools.map((s) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="birthDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-bold text-[#6B7684]">생년월일</FormLabel>
                            <FormControl>
                              <Input type="date" className="h-10 rounded-lg" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="gender"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-bold text-[#6B7684]">성별</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ?? ""}>
                              <FormControl>
                                <SelectTrigger className="h-10 rounded-lg">
                                  <SelectValue placeholder="선택" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="MALE">남</SelectItem>
                                <SelectItem value="FEMALE">여</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-bold text-[#6B7684]">전화번호</FormLabel>
                            <FormControl>
                              <Input placeholder="010-0000-0000" className="h-10 rounded-lg" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="memo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold text-[#6B7684]">특이사항</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="알레르기, 성격, 학습 특이사항 등"
                              className="min-h-[80px] resize-none rounded-lg"
                              {...field}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </CollapsibleContent>
                </Collapsible>

                {/* Progressive disclosure: 학부모 정보 */}
                <Collapsible open={parentOpen} onOpenChange={setParentOpen}>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg bg-[#F7F8FA] px-3 py-2.5 text-sm font-bold text-[#4E5968] transition hover:bg-[#F2F4F6]"
                    >
                      <span className="flex items-center gap-1.5">
                        <Users className="size-4 text-[#8B95A1]" /> 학부모 정보
                      </span>
                      <ChevronDown
                        className={cn("size-4 transition-transform", parentOpen && "rotate-180")}
                      />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 pt-4">
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="parentName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-bold text-[#6B7684]">학부모 이름</FormLabel>
                            <FormControl>
                              <Input placeholder="학부모 이름" className="h-10 rounded-lg" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="parentRelation"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-bold text-[#6B7684]">관계</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ?? ""}>
                              <FormControl>
                                <SelectTrigger className="h-10 rounded-lg">
                                  <SelectValue placeholder="관계 선택" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="MOTHER">어머니</SelectItem>
                                <SelectItem value="FATHER">아버지</SelectItem>
                                <SelectItem value="GUARDIAN">보호자</SelectItem>
                                <SelectItem value="OTHER">기타</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="parentPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-bold text-[#6B7684]">학부모 전화번호</FormLabel>
                            <FormControl>
                              <Input placeholder="010-0000-0000" className="h-10 rounded-lg" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="emergencyContact"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-bold text-[#6B7684]">긴급연락처</FormLabel>
                            <FormControl>
                              <Input placeholder="010-0000-0000" className="h-10 rounded-lg" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-lg border-[#E5E8EB] font-bold text-[#4E5968]"
                    onClick={() => onOpenChange(false)}
                  >
                    취소
                  </Button>
                  <Button
                    type="submit"
                    disabled={isPending}
                    className="h-10 rounded-lg bg-blue-600 font-bold text-white hover:bg-blue-700"
                  >
                    {isPending && <Loader2 className="size-4 animate-spin" />}
                    {isEditing ? "수정" : "등록하고 코드 발급"}
                  </Button>
                </div>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
