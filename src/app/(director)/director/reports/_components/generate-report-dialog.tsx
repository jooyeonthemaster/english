"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface GenerateReportPayload {
  type: "WEEKLY" | "MONTHLY";
  scope: string;
  classId: string;
  studentId: string;
}

interface GenerateReportDialogProps {
  open: boolean;
  isPending: boolean;
  classes: { id: string; name: string }[];
  students: { id: string; name: string }[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: GenerateReportPayload) => void;
}

export function GenerateReportDialog({
  open,
  isPending,
  classes,
  students,
  onOpenChange,
  onSubmit,
}: GenerateReportDialogProps) {
  const [type, setType] = useState<"WEEKLY" | "MONTHLY">("WEEKLY");
  const [scope, setScope] = useState("ALL");
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>리포트 생성</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              리포트 유형
            </label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as "WEEKLY" | "MONTHLY")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WEEKLY">주간 리포트</SelectItem>
                <SelectItem value="MONTHLY">월간 리포트</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">대상</label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">전체 학생</SelectItem>
                <SelectItem value="CLASS">반별</SelectItem>
                <SelectItem value="STUDENT">개별 학생</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === "CLASS" && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                반 선택
              </label>
              <Select value={classId} onValueChange={setClassId}>
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

          {scope === "STUDENT" && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                학생 선택
              </label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger>
                  <SelectValue placeholder="학생을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={() => onSubmit({ type, scope, classId, studentId })}
            disabled={isPending}
            className="gradient-primary text-white"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin mr-1.5" />
                생성 중...
              </>
            ) : (
              "생성하기"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
