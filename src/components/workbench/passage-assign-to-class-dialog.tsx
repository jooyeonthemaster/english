"use client";

// ---------------------------------------------------------------------------
// Passage → Assignment dispatch dialog
//
// The original "반 과제로 배포" button pushed to
// `/director/assignments?passageIds=...` which was ignored — teachers landed on
// the assignments list with no pre-filled context. This dialog fetches the
// academy's active classes via `getClassesForFilter` (server action, already
// academy-scoped), lets the user pick a class + due date + optional note, and
// creates the assignment inline through `createAssignment`. On success we
// redirect to the assignment detail page so the teacher can verify dispatch.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { getClassesForFilter } from "@/actions/exams";
import { createAssignment } from "@/actions/assignments";

interface ClassOption {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  academyId: string;
  passageId: string;
  passageTitle: string;
}

export function PassageAssignToClassDialog({
  open,
  onOpenChange,
  academyId,
  passageId,
  passageTitle,
}: Props) {
  const router = useRouter();
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Default due-date: 7 days from now (ISO `YYYY-MM-DDTHH:mm` for <input type=datetime-local>).
  const defaultDueDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(23, 59, 0, 0);
    // Produce local-time string without timezone suffix — the input expects it.
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours(),
    )}:${pad(d.getMinutes())}`;
  }, []);

  useEffect(() => {
    if (!open) return;
    setSelectedClassId("");
    setDueDate(defaultDueDate);
    setNote("");
  }, [open, defaultDueDate]);

  // Class list fetch — academy-scoped, run once per open session.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingClasses(true);
    getClassesForFilter(academyId)
      .then((rows) => {
        if (cancelled) return;
        setClasses(rows as ClassOption[]);
      })
      .catch(() => {
        if (cancelled) return;
        setClasses([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingClasses(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, academyId]);

  const disabled = submitting || !selectedClassId || !dueDate;

  const handleSubmit = useCallback(async () => {
    if (!selectedClassId || !dueDate) return;
    setSubmitting(true);
    try {
      // Preserve the passage link in the description so the assignment detail
      // view can render a deep-link back to the source. attachments field
      // carries a small JSON reference so future UIs can parse it structurally.
      const description = [
        `지문: ${passageTitle}`,
        note.trim() ? note.trim() : null,
      ]
        .filter(Boolean)
        .join("\n\n");

      const attachments = JSON.stringify([
        { kind: "passage", passageId, title: passageTitle },
      ]);

      const result = await createAssignment(academyId, {
        title: `[지문 과제] ${passageTitle}`,
        description,
        classId: selectedClassId,
        targetType: "CLASS",
        dueDate,
        attachments,
      });

      if (!result.success || !result.id) {
        toast.error(result.error || "과제 배포에 실패했습니다.");
        return;
      }
      toast.success("반 과제가 배포되었습니다.");
      onOpenChange(false);
      router.push(`/director/assignments/${result.id}`);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "과제 배포 중 오류가 발생했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    academyId,
    dueDate,
    note,
    onOpenChange,
    passageId,
    passageTitle,
    router,
    selectedClassId,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Users className="w-4 h-4 text-sky-600" />
            반 과제로 배포
          </DialogTitle>
          <DialogDescription className="text-[12px] text-slate-500">
            &ldquo;{passageTitle}&rdquo; 지문을 선택한 반에 과제로 배포합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Class picker */}
          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-500">
              대상 반
            </span>
            {loadingClasses ? (
              <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-[12px] text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                반 목록 불러오는 중...
              </div>
            ) : classes.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-[12px] text-slate-500">
                활성화된 반이 없습니다. 먼저 &lsquo;반 관리&rsquo;에서 반을
                생성해 주세요.
              </div>
            ) : (
              <Select
                value={selectedClassId}
                onValueChange={setSelectedClassId}
              >
                <SelectTrigger className="h-9 text-[13px]">
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
            )}
          </label>

          {/* Due date */}
          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-500">
              마감일
            </span>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full h-9 px-3 text-[13px] rounded-lg border border-slate-200 bg-white outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-500/10"
            />
          </label>

          {/* Optional note */}
          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-500">
              과제 안내 (선택)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="학생에게 전달할 추가 안내를 입력하세요."
              rows={3}
              className="w-full px-3 py-2 text-[13px] rounded-lg border border-slate-200 bg-white outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-500/10 placeholder:text-slate-300 resize-none"
            />
          </label>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              취소
            </Button>
            <Button
              size="sm"
              className="bg-sky-600 hover:bg-sky-700"
              onClick={handleSubmit}
              disabled={disabled}
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Users className="w-3.5 h-3.5 mr-1" />
              )}
              과제 배포
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
