"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { createAssignment } from "@/actions/assignments";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ClassOption {
  id: string;
  name: string;
}

interface Props {
  academyId: string;
  classes: ClassOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AssignmentFormDialog({
  academyId,
  classes,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [classId, setClassId] = useState<string>("");
  const [targetType, setTargetType] = useState("CLASS");
  const [dueDate, setDueDate] = useState("");
  const [maxScore, setMaxScore] = useState("");

  function reset() {
    setTitle("");
    setDescription("");
    setClassId("");
    setTargetType("CLASS");
    setDueDate("");
    setMaxScore("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim()) {
      toast.error("과제명을 입력하세요.");
      return;
    }
    if (!dueDate) {
      toast.error("마감일을 선택하세요.");
      return;
    }

    startTransition(async () => {
      const result = await createAssignment(academyId, {
        title: title.trim(),
        description: description.trim() || undefined,
        classId: classId || null,
        targetType,
        dueDate,
        maxScore: maxScore ? parseInt(maxScore) : null,
      });

      if (result.success) {
        toast.success("과제가 등록되었습니다.");
        reset();
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error || "과제 등록에 실패했습니다.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>과제 등록</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ass-title">과제명 *</Label>
            <Input
              id="ass-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: Unit 3 독해 과제"
              className="border-[#E5E8EB]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ass-desc">설명</Label>
            <Textarea
              id="ass-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="과제 내용을 설명하세요..."
              className="border-[#E5E8EB] h-24 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>대상 유형</Label>
              <Select value={targetType} onValueChange={setTargetType}>
                <SelectTrigger className="border-[#E5E8EB]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLASS">반 전체</SelectItem>
                  <SelectItem value="INDIVIDUAL">개별 학생</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>반</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger className="border-[#E5E8EB]">
                  <SelectValue placeholder="반 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">전체</SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ass-due">마감일 *</Label>
              <Input
                id="ass-due"
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="border-[#E5E8EB]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ass-score">만점 (선택)</Label>
              <Input
                id="ass-score"
                type="number"
                min={0}
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
                placeholder="100"
                className="border-[#E5E8EB]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-[#E5E8EB]">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-[#E5E8EB]"
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-[#3182F6] hover:bg-[#1B64DA]"
            >
              <Plus className="size-4 mr-1.5" />
              {isPending ? "등록 중..." : "등록하기"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
