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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NOTICE_TARGET_TYPES } from "@/lib/constants";
import { createNotice, updateNotice } from "@/actions/communication";
import { toast } from "sonner";
import { Pin, Send, Bell } from "lucide-react";

interface NoticeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notice?: {
    id: string;
    title: string;
    content: string;
    targetType: string;
    targetId: string | null;
    isPinned: boolean;
    publishAt: Date;
  } | null;
  classes?: { id: string; name: string }[];
}

export function NoticeFormDialog({
  open,
  onOpenChange,
  notice,
  classes = [],
}: NoticeFormDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [targetType, setTargetType] = useState(notice?.targetType || "ALL");
  const [isPinned, setIsPinned] = useState(notice?.isPinned || false);
  const [sendKakao, setSendKakao] = useState(false);
  const [useSchedule, setUseSchedule] = useState(false);

  const isEdit = !!notice;

  function handleSubmit(formData: FormData) {
    formData.set("targetType", targetType);
    formData.set("isPinned", String(isPinned));
    formData.set("sendKakao", String(sendKakao));

    if (!useSchedule) {
      formData.delete("publishAt");
    }

    startTransition(async () => {
      try {
        if (isEdit) {
          await updateNotice(notice.id, formData);
          toast.success("공지사항이 수정되었습니다.");
        } else {
          await createNotice(formData);
          toast.success("공지사항이 등록되었습니다.");
        }
        onOpenChange(false);
      } catch {
        toast.error("오류가 발생했습니다.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "공지 수정" : "공지 작성"}</DialogTitle>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-5">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="notice-title">제목</Label>
            <Input
              id="notice-title"
              name="title"
              placeholder="공지 제목을 입력하세요"
              defaultValue={notice?.title || ""}
              required
            />
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="notice-content">내용</Label>
            <Textarea
              id="notice-content"
              name="content"
              placeholder="공지 내용을 입력하세요"
              defaultValue={notice?.content || ""}
              rows={8}
              className="resize-y"
              required
            />
          </div>

          {/* Target Type */}
          <div className="space-y-3">
            <Label>대상</Label>
            <RadioGroup
              value={targetType}
              onValueChange={setTargetType}
              className="flex flex-wrap gap-4"
            >
              {NOTICE_TARGET_TYPES.map((type) => (
                <div key={type.value} className="flex items-center gap-2">
                  <RadioGroupItem value={type.value} id={`target-${type.value}`} />
                  <Label htmlFor={`target-${type.value}`} className="font-normal cursor-pointer">
                    {type.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Class select when CLASS target */}
          {targetType === "CLASS" && classes.length > 0 && (
            <div className="space-y-2">
              <Label>반 선택</Label>
              <Select name="targetId" defaultValue={notice?.targetId || ""}>
                <SelectTrigger>
                  <SelectValue placeholder="반을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Student search when INDIVIDUAL target */}
          {targetType === "INDIVIDUAL" && (
            <div className="space-y-2">
              <Label htmlFor="notice-student">학생 검색</Label>
              <Input
                id="notice-student"
                name="targetId"
                placeholder="학생 이름 또는 ID를 입력하세요"
                defaultValue={notice?.targetId || ""}
              />
            </div>
          )}

          {/* Options row */}
          <div className="flex flex-wrap gap-6">
            {/* Pin toggle */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="notice-pin"
                checked={isPinned}
                onCheckedChange={(checked) => setIsPinned(!!checked)}
              />
              <Label htmlFor="notice-pin" className="font-normal cursor-pointer flex items-center gap-1.5">
                <Pin className="size-3.5" />
                상단 고정
              </Label>
            </div>

            {/* Kakao notification */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="notice-kakao"
                checked={sendKakao}
                onCheckedChange={(checked) => setSendKakao(!!checked)}
              />
              <Label htmlFor="notice-kakao" className="font-normal cursor-pointer flex items-center gap-1.5">
                <Bell className="size-3.5" />
                카카오 알림톡 발송
              </Label>
            </div>

            {/* Schedule */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="notice-schedule"
                checked={useSchedule}
                onCheckedChange={(checked) => setUseSchedule(!!checked)}
              />
              <Label htmlFor="notice-schedule" className="font-normal cursor-pointer flex items-center gap-1.5">
                <Send className="size-3.5" />
                예약 발송
              </Label>
            </div>
          </div>

          {/* Schedule datetime */}
          {useSchedule && (
            <div className="space-y-2">
              <Label htmlFor="notice-publish">발송 일시</Label>
              <Input
                id="notice-publish"
                name="publishAt"
                type="datetime-local"
                defaultValue={
                  notice?.publishAt
                    ? new Date(notice.publishAt).toISOString().slice(0, 16)
                    : ""
                }
              />
            </div>
          )}

          <DialogFooter>
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
