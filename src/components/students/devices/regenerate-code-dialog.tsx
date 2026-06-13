"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { reissueStudentCode } from "@/actions/students";

export function RegenerateCodeDialog({
  open,
  onOpenChange,
  studentId,
  onReissued,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  onReissued: (newCode: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function confirm(e: React.MouseEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await reissueStudentCode(studentId);
      if (result.success && result.studentCode) {
        toast.success("새 코드가 발급됐어요. 등록된 기기가 모두 해제됐습니다.");
        onReissued(result.studentCode);
        onOpenChange(false);
      } else {
        toast.error(result.error || "코드 재발급에 실패했어요.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>학생 코드를 재발급할까요?</AlertDialogTitle>
          <AlertDialogDescription>
            기존 코드는 즉시 무효화되고, <span className="font-bold text-[#4E5968]">등록된 기기가 모두
            해제</span>돼요. 학생에게 새 코드를 다시 알려줘야 해요.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>취소</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirm}
            disabled={isPending}
            className="bg-[#3182F6] text-white hover:bg-[#2272EB]"
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            재발급
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
