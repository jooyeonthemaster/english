"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CALENDAR_EVENT_TYPES } from "@/lib/constants";
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "@/actions/communication";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

interface CalendarEventFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: {
    id: string;
    title: string;
    description: string | null;
    startDate: Date;
    endDate: Date | null;
    allDay: boolean;
    type: string;
    color: string | null;
  } | null;
  defaultDate?: string; // ISO date string for pre-filling
}

export function CalendarEventFormDialog({
  open,
  onOpenChange,
  event,
  defaultDate,
}: CalendarEventFormDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [allDay, setAllDay] = useState(event?.allDay || false);
  const [eventType, setEventType] = useState(event?.type || "EVENT");

  const isEdit = !!event;

  function handleSubmit(formData: FormData) {
    formData.set("allDay", String(allDay));
    formData.set("type", eventType);

    startTransition(async () => {
      try {
        if (isEdit) {
          await updateCalendarEvent(event.id, formData);
          toast.success("일정이 수정되었습니다.");
        } else {
          await createCalendarEvent(formData);
          toast.success("일정이 등록되었습니다.");
        }
        onOpenChange(false);
      } catch {
        toast.error("오류가 발생했습니다.");
      }
    });
  }

  function handleDelete() {
    if (!event || !confirm("이 일정을 삭제하시겠습니까?")) return;
    startTransition(async () => {
      try {
        await deleteCalendarEvent(event.id);
        toast.success("일정이 삭제되었습니다.");
        onOpenChange(false);
      } catch {
        toast.error("삭제 중 오류가 발생했습니다.");
      }
    });
  }

  const defaultStartDate = event
    ? new Date(event.startDate).toISOString().slice(0, allDay ? 10 : 16)
    : defaultDate || new Date().toISOString().slice(0, allDay ? 10 : 16);

  const defaultEndDate = event?.endDate
    ? new Date(event.endDate).toISOString().slice(0, allDay ? 10 : 16)
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "일정 수정" : "일정 추가"}</DialogTitle>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="event-title">제목</Label>
            <Input
              id="event-title"
              name="title"
              placeholder="일정 제목"
              defaultValue={event?.title || ""}
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="event-desc">설명</Label>
            <Textarea
              id="event-desc"
              name="description"
              placeholder="일정 설명 (선택)"
              defaultValue={event?.description || ""}
              rows={3}
            />
          </div>

          {/* Event Type */}
          <div className="space-y-2">
            <Label>유형</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CALENDAR_EVENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <div className="flex items-center gap-2">
                      <span
                        className={`size-2.5 rounded-full ${t.dotColor}`}
                      />
                      {t.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* All day toggle */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="event-allday"
              checked={allDay}
              onCheckedChange={(checked) => setAllDay(!!checked)}
            />
            <Label htmlFor="event-allday" className="font-normal cursor-pointer">
              종일
            </Label>
          </div>

          {/* Start / End */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="event-start">시작</Label>
              <Input
                id="event-start"
                name="startDate"
                type={allDay ? "date" : "datetime-local"}
                defaultValue={defaultStartDate}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-end">종료</Label>
              <Input
                id="event-end"
                name="endDate"
                type={allDay ? "date" : "datetime-local"}
                defaultValue={defaultEndDate}
              />
            </div>
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label htmlFor="event-color">색상 (선택)</Label>
            <Input
              id="event-color"
              name="color"
              type="color"
              defaultValue={event?.color || "#3B82F6"}
              className="h-9 w-20 p-1 cursor-pointer"
            />
          </div>

          <DialogFooter className="flex justify-between">
            {isEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 mr-auto"
                onClick={handleDelete}
                disabled={isPending}
              >
                <Trash2 className="size-3.5" />
                삭제
              </Button>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                취소
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "저장 중..." : isEdit ? "수정" : "등록"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
