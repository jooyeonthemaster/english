"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { confirmNative } from "@/lib/browser-confirm";
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
  // open이 false→true로 바뀐 첫 렌더에서만 네이티브 확인창을 띄운다.
  const handledRef = useRef(false);

  useEffect(() => {
    if (!open) {
      handledRef.current = false;
      return;
    }
    if (handledRef.current) return;
    handledRef.current = true;

    const confirmed = confirmNative(
      "학생 코드를 재발급할까요?",
      "기존 코드는 즉시 무효화되고, 등록된 기기가 모두 해제돼요. 학생에게 새 코드를 다시 알려줘야 해요.",
    );

    if (!confirmed) {
      onOpenChange(false);
      return;
    }

    void (async () => {
      const result = await reissueStudentCode(studentId);
      if (result.success && result.studentCode) {
        toast.success("새 코드가 발급됐어요. 등록된 기기가 모두 해제됐습니다.");
        onReissued(result.studentCode);
        onOpenChange(false);
      } else {
        toast.error(result.error || "코드 재발급에 실패했어요.");
        onOpenChange(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return null;
}
