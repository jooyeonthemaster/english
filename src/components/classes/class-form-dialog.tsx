"use client";

import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClass, updateClass, getStaffList } from "@/actions/classes";
import type { ScheduleEntry } from "@/actions/classes";

const DAY_OPTIONS = [
  { value: "MON", label: "월" },
  { value: "TUE", label: "화" },
  { value: "WED", label: "수" },
  { value: "THU", label: "목" },
  { value: "FRI", label: "금" },
  { value: "SAT", label: "토" },
  { value: "SUN", label: "일" },
];

const classSchema = z.object({
  name: z.string().min(1, "반명을 입력해주세요"),
  teacherId: z.string().optional(),
  capacity: z.coerce.number().min(1, "정원은 1명 이상이어야 합니다"),
  fee: z.coerce.number().min(0, "수강료는 0 이상이어야 합니다"),
  room: z.string().optional(),
  schedule: z.array(
    z.object({
      day: z.string().min(1, "요일을 선택해주세요"),
      startTime: z.string().min(1, "시작 시간을 입력해주세요"),
      endTime: z.string().min(1, "종료 시간을 입력해주세요"),
    })
  ),
  isActive: z.boolean().default(true),
});

type ClassFormValues = z.infer<typeof classSchema>;

interface ClassFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  academyId: string;
  editData?: {
    id: string;
    name: string;
    teacherId: string | null;
    capacity: number;
    fee: number;
    room: string | null;
    schedule: ScheduleEntry[];
    isActive: boolean;
  } | null;
}

export function ClassFormDialog({
  open,
  onOpenChange,
  academyId,
  editData,
}: ClassFormDialogProps) {
  const [staffList, setStaffList] = useState<
    Array<{ id: string; name: string; role: string; avatarUrl: string | null }>
  >([]);
  const [loading, setLoading] = useState(false);

  const form = useForm<ClassFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(classSchema) as any,
    defaultValues: {
      name: "",
      teacherId: "",
      capacity: 20,
      fee: 0,
      room: "",
      schedule: [{ day: "MON", startTime: "14:00", endTime: "16:00" }],
      isActive: true,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "schedule",
  });

  // Load staff list
  useEffect(() => {
    if (open) {
      getStaffList(academyId).then(setStaffList);
    }
  }, [open, academyId]);

  // Reset form when editData changes
  useEffect(() => {
    if (editData) {
      form.reset({
        name: editData.name,
        teacherId: editData.teacherId || "",
        capacity: editData.capacity,
        fee: editData.fee,
        room: editData.room || "",
        schedule:
          editData.schedule.length > 0
            ? editData.schedule
            : [{ day: "MON", startTime: "14:00", endTime: "16:00" }],
        isActive: editData.isActive,
      });
    } else {
      form.reset({
        name: "",
        teacherId: "",
        capacity: 20,
        fee: 0,
        room: "",
        schedule: [{ day: "MON", startTime: "14:00", endTime: "16:00" }],
        isActive: true,
      });
    }
  }, [editData, form]);

  async function onSubmit(values: ClassFormValues) {
    setLoading(true);
    try {
      const data = {
        name: values.name,
        teacherId: values.teacherId || null,
        capacity: values.capacity,
        fee: values.fee,
        room: values.room || null,
        schedule: values.schedule,
        isActive: values.isActive,
      };

      const result = editData
        ? await updateClass(editData.id, data)
        : await createClass(academyId, data);

      if (result.success) {
        toast.success(editData ? "반이 수정되었습니다." : "반이 추가되었습니다.");
        onOpenChange(false);
      } else {
        toast.error(result.error || "오류가 발생했습니다.");
      }
    } catch {
      toast.error("오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-gray-900">
            {editData ? "반 수정" : "반 추가"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 mt-2">
          {/* Class name */}
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-sm font-medium text-gray-700">
              반명 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              placeholder="예: 중등 심화반 A"
              {...form.register("name")}
              className="h-10"
            />
            {form.formState.errors.name && (
              <p className="text-xs text-red-500">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          {/* Teacher */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-gray-700">담당 강사</Label>
            <Select
              value={form.watch("teacherId") || ""}
              onValueChange={(v) => form.setValue("teacherId", v === "none" ? "" : v)}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="강사를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">미지정</SelectItem>
                {staffList
                  .filter((s) => s.role === "TEACHER" || s.role === "DIRECTOR")
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Capacity & Fee */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="capacity" className="text-sm font-medium text-gray-700">
                정원 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="capacity"
                type="number"
                min={1}
                {...form.register("capacity")}
                className="h-10"
              />
              {form.formState.errors.capacity && (
                <p className="text-xs text-red-500">
                  {form.formState.errors.capacity.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fee" className="text-sm font-medium text-gray-700">
                수강료 (원)
              </Label>
              <Input
                id="fee"
                type="number"
                min={0}
                step={10000}
                {...form.register("fee")}
                className="h-10"
              />
            </div>
          </div>

          {/* Room */}
          <div className="space-y-1.5">
            <Label htmlFor="room" className="text-sm font-medium text-gray-700">
              교실
            </Label>
            <Input
              id="room"
              placeholder="예: 201호"
              {...form.register("room")}
              className="h-10"
            />
          </div>

          {/* Schedule Builder */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-gray-700">
                시간표 설정
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({ day: "MON", startTime: "14:00", endTime: "16:00" })
                }
                className="h-7 text-xs gap-1"
              >
                <Plus className="h-3 w-3" />
                추가
              </Button>
            </div>

            <div className="space-y-2">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50/50 p-2.5"
                >
                  {/* Day */}
                  <Select
                    value={form.watch(`schedule.${index}.day`)}
                    onValueChange={(v) =>
                      form.setValue(`schedule.${index}.day`, v)
                    }
                  >
                    <SelectTrigger className="h-8 w-[72px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAY_OPTIONS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Start time */}
                  <Input
                    type="time"
                    {...form.register(`schedule.${index}.startTime`)}
                    className="h-8 w-[110px] text-xs"
                  />

                  <span className="text-xs text-gray-400">~</span>

                  {/* End time */}
                  <Input
                    type="time"
                    {...form.register(`schedule.${index}.endTime`)}
                    className="h-8 w-[110px] text-xs"
                  />

                  {/* Remove button */}
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                      className="h-7 w-7 shrink-0 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-10"
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="h-10 bg-blue-500 hover:bg-blue-600"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editData ? "수정" : "추가"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
