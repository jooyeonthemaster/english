"use client";

// ============================================================================
// 학생 입력 필드 공용 블록 — 로스터 등록/수정 다이얼로그와 시험 리포트의
// "학생 추가"가 **같은 수준의 정보**를 받도록 필드 정의를 한 곳에 모은다.
//
// 스키마·기본값·payload 변환까지 여기서 내보내, 두 화면이 갈라지지 않게 한다.
// 학교 인라인 추가(앱에 학교 관리 화면이 없어 유일한 생성 경로)도 이 블록이
// 자기 상태로 소유한다 — 쓰는 쪽은 <StudentFields form={form} schools={...} /> 만.
// ============================================================================

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ChevronDown, Loader2, Plus, Users } from "lucide-react";

import { cn, formatPhone } from "@/lib/utils";
import { GRADES } from "@/lib/constants";
import { createSchool } from "@/actions/students";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { HubSchool, HubStudent } from "@/app/(director)/director/tutor/_components/types";

export const studentFormSchema = z.object({
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

export type StudentFormValues = z.infer<typeof studentFormSchema>;

export function deriveStudentDefaults(student: HubStudent | null): StudentFormValues {
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
      (parent?.relation as "MOTHER" | "FATHER" | "GUARDIAN" | "OTHER" | undefined) ??
      undefined,
    emergencyContact: parent?.emergencyContact ?? "",
  };
}

/** 폼 값 → createStudent/updateStudent 페이로드(빈 문자열은 undefined 로). */
export function toStudentPayload(values: StudentFormValues) {
  return {
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
}

/** 학생 폼 훅 — 스키마·리졸버·기본값을 쓰는 쪽마다 반복하지 않게 묶는다. */
export function useStudentForm(student: HubStudent | null = null) {
  return useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: deriveStudentDefaults(student),
  });
}

export function StudentFields({
  form,
  schools,
  autoFocusName = true,
}: {
  form: UseFormReturn<StudentFormValues>;
  schools: HubSchool[];
  autoFocusName?: boolean;
}) {
  const router = useRouter();
  const [parentOpen, setParentOpen] = useState(false);

  // 학교 인라인 추가 — 추가분은 서버 재검증을 기다리지 않고 로컬 목록에 얹어
  // 방금 만든 학교를 즉시 선택할 수 있게 한다.
  const [addedSchools, setAddedSchools] = useState<HubSchool[]>([]);
  const [schoolAddOpen, setSchoolAddOpen] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState("");
  const [newSchoolType, setNewSchoolType] = useState<"MIDDLE" | "HIGH" | "ELEMENTARY">(
    "MIDDLE",
  );
  const [schoolSaving, setSchoolSaving] = useState(false);

  // id 기준 중복 제거 필수 — router.refresh() 로 서버 목록에 방금 만든 학교가
  // 들어오면 addedSchools 와 겹쳐 같은 id 가 두 번 렌더되고, Radix Select 가
  // 둘 다 선택 상태로 보고 표시 텍스트를 이어붙인다("보성고보성고").
  const schoolOptions = useMemo(() => {
    const byId = new Map<string, HubSchool>();
    for (const s of [...schools, ...addedSchools]) byId.set(s.id, s);
    return [...byId.values()];
  }, [schools, addedSchools]);

  const parentFilled = !!(form.watch("parentName") || form.watch("parentPhone"));

  async function handleAddSchool() {
    const name = newSchoolName.trim();
    if (name.length < 2 || schoolSaving) return;
    setSchoolSaving(true);
    try {
      const result = await createSchool({ name, type: newSchoolType });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (!schoolOptions.some((s) => s.id === result.school.id)) {
        setAddedSchools((prev) => [...prev, result.school]);
      }
      form.setValue("schoolId", result.school.id, { shouldDirty: true });
      toast.success(
        result.existed
          ? "이미 등록된 학교예요. 선택했습니다."
          : `"${result.school.name}" 학교를 추가했어요.`,
      );
      setSchoolAddOpen(false);
      setNewSchoolName("");
      router.refresh();
    } finally {
      setSchoolSaving(false);
    }
  }

  return (
    <>
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
                autoFocus={autoFocusName}
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

      {/* 추가 정보 — 항상 노출 (학년 아래로 쭉 이어지는 선택 입력) */}
      <div className="space-y-4">
        <p className="text-sm font-bold text-[#4E5968]">
          추가 정보 <span className="font-medium text-[#AEB5BC]">(선택)</span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="schoolId"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold text-[#6B7684]">학교</FormLabel>
                <Select onValueChange={field.onChange} value={field.value ?? ""}>
                  <FormControl>
                    {/* w-full 필수 — SelectTrigger 기본값이 w-fit 이라 그리드 셀을
                        안 채우고 내용 폭만 차지한다. */}
                    <SelectTrigger className="h-10 w-full rounded-lg">
                      <SelectValue placeholder="학교 선택" />
                    </SelectTrigger>
                  </FormControl>
                  {/* position="popper" 필수 — 기본 item-aligned 는 목록을 위로 끌어
                      올려, 학교가 많으면 맨 위 「학교 추가」가 화면 밖으로 밀린다. */}
                  <SelectContent position="popper">
                    <div className="mb-1 border-b border-[#F2F4F6] pb-1">
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          // Select 가 포커스를 되가져가기 전에 열어야 한다.
                          e.preventDefault();
                          setSchoolAddOpen(true);
                        }}
                        className="flex w-full cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm font-bold text-blue-600 hover:bg-blue-50"
                      >
                        <Plus className="size-3.5" />
                        학교 추가
                      </button>
                    </div>
                    {schoolOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                    {schoolOptions.length === 0 && (
                      <p className="px-2 py-3 text-center text-xs text-[#8B95A1]">
                        등록된 학교가 없어요
                      </p>
                    )}
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
                  {/* min/max 필수 — 없으면 크롬 연도 칸이 6자리까지 받아 날짜가
                      통째로 무효가 된다. */}
                  <Input
                    type="date"
                    min="1900-01-01"
                    max="2099-12-31"
                    className="h-10 rounded-lg"
                    {...field}
                  />
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
                    <SelectTrigger className="h-10 w-full rounded-lg">
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
                  {/* 자동 하이픈 — 숫자만 받아 3-4-4 로 붙인다(02 는 예외). */}
                  <Input
                    placeholder="010-0000-0000"
                    inputMode="numeric"
                    maxLength={13}
                    className="h-10 rounded-lg"
                    {...field}
                    onChange={(e) => field.onChange(formatPhone(e.target.value))}
                  />
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
      </div>

      {/* 학부모 정보 — 팝오버로 열림 (선택 입력) */}
      <Popover open={parentOpen} onOpenChange={setParentOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg bg-[#F7F8FA] px-3 py-2.5 text-sm font-bold text-[#4E5968] transition hover:bg-[#F2F4F6]"
          >
            <span className="flex items-center gap-1.5">
              <Users className="size-4 text-[#8B95A1]" /> 학부모 정보
              {parentFilled ? (
                <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[11px] font-bold text-blue-600">
                  입력됨
                </span>
              ) : (
                <span className="font-medium text-[#AEB5BC]">(선택)</span>
              )}
            </span>
            <ChevronDown
              className={cn("size-4 transition-transform", parentOpen && "rotate-180")}
            />
          </button>
        </PopoverTrigger>
        {/* 폭은 트리거 너비에 맞춘다 — 고정폭이면 폼 칸들과 좌우가 어긋난다. */}
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] space-y-4 p-4"
        >
          <p className="flex items-center gap-1.5 text-[13px] font-bold text-[#4E5968]">
            <Users className="size-3.5 text-[#8B95A1]" /> 학부모 정보
          </p>
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
                      <SelectTrigger className="h-10 w-full rounded-lg">
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
                  <FormLabel className="text-xs font-bold text-[#6B7684]">
                    학부모 전화번호
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="010-0000-0000"
                      inputMode="numeric"
                      maxLength={13}
                      className="h-10 rounded-lg"
                      {...field}
                      onChange={(e) => field.onChange(formatPhone(e.target.value))}
                    />
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
                    <Input
                      placeholder="010-0000-0000"
                      inputMode="numeric"
                      maxLength={13}
                      className="h-10 rounded-lg"
                      {...field}
                      onChange={(e) => field.onChange(formatPhone(e.target.value))}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-lg border-[#E5E8EB] font-bold text-[#4E5968]"
              onClick={() => setParentOpen(false)}
            >
              확인
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* 학교 추가 — 학생 폼 위에 겹치는 작은 다이얼로그. 앱에 학교 관리 화면이
          따로 없어서, 목록에 없는 학교는 여기가 유일한 생성 경로다. */}
      <Dialog open={schoolAddOpen} onOpenChange={setSchoolAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">학교 추가</DialogTitle>
            <DialogDescription className="text-[13px]">
              추가한 학교는 학원 전체에서 쓸 수 있어요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-[#6B7684]">학교 이름</p>
              <Input
                autoFocus
                value={newSchoolName}
                onChange={(e) => setNewSchoolName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAddSchool();
                  }
                }}
                placeholder="예: 강동중"
                className="h-10 rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-[#6B7684]">학교급</p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["ELEMENTARY", "초등학교"],
                    ["MIDDLE", "중학교"],
                    ["HIGH", "고등학교"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={newSchoolType === value}
                    onClick={() => setNewSchoolType(value)}
                    className={cn(
                      "h-10 cursor-pointer rounded-lg border text-sm font-bold transition",
                      newSchoolType === value
                        ? "border-blue-400 bg-blue-50 text-blue-600"
                        : "border-[#E5E8EB] bg-white text-[#6B7684] hover:bg-[#F7F8FA]",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSchoolAddOpen(false)}
                disabled={schoolSaving}
              >
                취소
              </Button>
              <Button
                type="button"
                onClick={() => void handleAddSchool()}
                disabled={newSchoolName.trim().length < 2 || schoolSaving}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {schoolSaving && <Loader2 className="size-4 animate-spin" />}
                추가
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
