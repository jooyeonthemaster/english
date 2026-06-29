"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { confirmNative } from "@/lib/browser-confirm";
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
  // open이 false→true로 바뀐 첫 렌더에서만 네이티브 확인창을 띄운다.
  const handledRef = useRef(false);

  useEffect(() => {
    if (!open || !device) {
      handledRef.current = false;
      return;
    }
    if (handledRef.current) return;
    handledRef.current = true;

    const label = parseUserAgent(device.userAgent).label;
    const confirmed = confirmNative(
      "이 기기를 해제할까요?",
      `${label} 기기의 로그인이 끊겨요. 학생은 코드로 다시 로그인할 수 있어요.`,
    );

    if (!confirmed) {
      onOpenChange(false);
      return;
    }

    const deviceId = device.id;
    void (async () => {
      const result = await revokeStudentDevice(studentId, deviceId);
      if (result.success) {
        toast.success("기기를 해제했어요. 학생은 다시 로그인해야 해요.");
        onOpenChange(false);
        onDone();
      } else {
        toast.error(result.error || "기기 해제에 실패했어요.");
        onOpenChange(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, device]);

  return null;
}
