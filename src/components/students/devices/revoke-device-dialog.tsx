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
import { parseUserAgent } from "@/lib/tutor/parse-user-agent";
import { revokeStudentDevice, type StudentDeviceItem } from "@/actions/students";

export function RevokeDeviceDialog({
  open,
  onOpenChange,
  studentId,
  device,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  device: StudentDeviceItem | null;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const label = device ? parseUserAgent(device.userAgent).label : "";

  function confirm(e: React.MouseEvent) {
    e.preventDefault();
    if (!device) return;
    startTransition(async () => {
      const result = await revokeStudentDevice(studentId, device.id);
      if (result.success) {
        toast.success("기기를 해제했어요. 학생은 다시 로그인해야 해요.");
        onOpenChange(false);
        onDone();
      } else {
        toast.error(result.error || "기기 해제에 실패했어요.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>이 기기를 해제할까요?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-bold text-[#4E5968]">{label}</span> 기기의 로그인이 끊겨요. 학생은
            코드로 다시 로그인할 수 있어요.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>취소</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirm}
            disabled={isPending}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            해제하기
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
