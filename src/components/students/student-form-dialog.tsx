"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { GRADES } from "@/lib/constants";

// Local schema avoids z.coerce which causes type conflicts with react-hook-form + Zod v4
const studentFormSchema = z.object({
  name: z.string().min(1, "이름을 입력하세요").max(50, "이름은 50자 이내로 입력하세요"),
  birthDate: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  phone: z.string().optional(),
  schoolId: z.string().optional(),
  grade: z.number().int().min(1, "학년을 선택하세요").max(3, "학년을 선택하세요"),
  memo: z.string().optional(),
  parentName: z.string().optional(),
  parentPhone: z.string().optional(),
  parentRelation: z.enum(["MOTHER", "FATHER", "GUARDIAN", "OTHER"]).optional(),
  emergencyContact: z.string().optional(),
});
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
/* eslint-disable @typescript-eslint/no-explicit-any */

interface StudentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: any | null;
  schools: any[];
}

type FormValues = z.infer<typeof studentFormSchema>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function StudentFormDialog({
  open,
  onOpenChange,
  student,
  schools,
}: StudentFormDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isEditing = !!student;

  const parentInfo = student?.parentLinks?.[0]?.parent;

  const form = useForm<FormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      name: student?.name ?? "",
      birthDate: student?.birthDate
        ? new Date(student.birthDate).toISOString().split("T")[0]
        : "",
      gender: (student?.gender as "MALE" | "FEMALE") ?? undefined,
      phone: student?.phone ?? "",
      schoolId: student?.schoolId ?? "",
      grade: student?.grade ?? 1,
      memo: student?.memo ?? "",
      parentName: parentInfo?.name ?? "",
      parentPhone: parentInfo?.phone ?? "",
      parentRelation: (parentInfo?.relation as "MOTHER" | "FATHER" | "GUARDIAN" | "OTHER") ?? undefined,
      emergencyContact: parentInfo?.emergencyContact ?? "",
    },
  });

  // Reset form when student changes
  // (handled by key prop or when dialog opens)

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      try {
        if (isEditing && student) {
          const result = await updateStudent(student.id, {
            name: values.name,
            birthDate: values.birthDate || undefined,
            gender: values.gender || undefined,
            phone: values.phone || undefined,
            schoolId: values.schoolId || undefined,
            grade: values.grade,
            memo: values.memo || undefined,
            parentName: values.parentName || undefined,
            parentPhone: values.parentPhone || undefined,
            parentRelation: values.parentRelation || undefined,
            emergencyContact: values.emergencyContact || undefined,
          });
          if (result.success) {
            toast.success("학생 정보가 수정되었습니다.");
            onOpenChange(false);
            router.refresh();
          } else {
            toast.error(result.error || "수정에 실패했습니다.");
          }
        } else {
          // Get academyId from the current session (passed through action)
          const result = await createStudent("__CURRENT__", {
            name: values.name,
            birthDate: values.birthDate || undefined,
            gender: values.gender || undefined,
            phone: values.phone || undefined,
            schoolId: values.schoolId || undefined,
            grade: values.grade,
            memo: values.memo || undefined,
            parentName: values.parentName || undefined,
            parentPhone: values.parentPhone || undefined,
            parentRelation: values.parentRelation || undefined,
            emergencyContact: values.emergencyContact || undefined,
          });
          if (result.success) {
            toast.success("학생이 등록되었습니다.");
            form.reset();
            onOpenChange(false);
            router.refresh();
          } else {
            toast.error(result.error || "등록에 실패했습니다.");
          }
        }
      } catch {
        toast.error("오류가 발생했습니다.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-[#191F28]">
            {isEditing ? "학생 정보 수정" : "학생 등록"}
          </DialogTitle>
          <DialogDescription className="text-sm text-[#8B95A1]">
            {isEditing
              ? "학생 정보를 수정합니다."
              : "새로운 학생을 등록합니다. 학생코드는 자동 생성됩니다."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="basic" className="flex-1">
                  기본 정보
                </TabsTrigger>
                <TabsTrigger value="parent" className="flex-1">
                  학부모 정보
                </TabsTrigger>
                <TabsTrigger value="memo" className="flex-1">
                  메모
                </TabsTrigger>
              </TabsList>

              {/* ===== Tab: Basic Info ===== */}
              <TabsContent value="basic" className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>이름 *</FormLabel>
                        <FormControl>
                          <Input placeholder="홍길동" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="birthDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>생년월일</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>성별</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value ?? ""}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="선택" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="MALE">남</SelectItem>
                            <SelectItem value="FEMALE">여</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>전화번호</FormLabel>
                        <FormControl>
                          <Input placeholder="010-0000-0000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="schoolId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>학교</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value ?? ""}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="학교 선택" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {schools.map((school) => (
                              <SelectItem key={school.id} value={school.id}>
                                {school.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="grade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>학년 *</FormLabel>
                        <Select
                          onValueChange={(val) => field.onChange(parseInt(val))}
                          value={field.value?.toString() ?? ""}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="학년 선택" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {GRADES.map((g) => (
                              <SelectItem
                                key={g.value}
                                value={g.value.toString()}
                              >
                                {g.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              {/* ===== Tab: Parent Info ===== */}
              <TabsContent value="parent" className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="parentName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>학부모 이름</FormLabel>
                        <FormControl>
                          <Input placeholder="학부모 이름" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="parentPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>학부모 전화번호</FormLabel>
                        <FormControl>
                          <Input placeholder="010-0000-0000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="parentRelation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>관계</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value ?? ""}
                        >
                          <FormControl>
                            <SelectTrigger>
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
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="emergencyContact"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>긴급연락처</FormLabel>
                        <FormControl>
                          <Input placeholder="010-0000-0000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              {/* ===== Tab: Memo ===== */}
              <TabsContent value="memo" className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="memo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>특이사항</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="알레르기, 성격, 학습 특이사항 등을 메모하세요."
                          className="min-h-[160px] resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>
            </Tabs>

            {/* ===== Submit ===== */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                취소
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="bg-[#3182F6] hover:bg-[#1B64DA] text-white"
              >
                {isPending && <Loader2 className="size-4 mr-1.5 animate-spin" />}
                {isEditing ? "수정" : "등록"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
