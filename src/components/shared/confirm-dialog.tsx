"use client";

import { useEffect } from "react";

import { confirmNative } from "@/lib/browser-confirm";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  /** @deprecated 브라우저 네이티브 경고창에서는 버튼 라벨을 바꿀 수 없다(확인/취소 고정). */
  confirmText?: string;
  /** @deprecated 브라우저 네이티브 경고창에서는 버튼 라벨을 바꿀 수 없다(확인/취소 고정). */
  cancelText?: string;
  /** @deprecated 네이티브 경고창은 variant 스타일을 입힐 수 없다. */
  variant?: "default" | "destructive";
}

/**
 * 확인 다이얼로그 — 브라우저 네이티브 경고창(window.confirm)으로 동작한다.
 *
 * 기존 커스텀 모달 API(open/onOpenChange/onConfirm)를 그대로 유지하므로 호출부 변경이 없다.
 * `open` 이 true 로 바뀌면 즉시 window.confirm 을 띄우고, 확인 시 onConfirm 을 호출한 뒤
 * 어느 경우든 onOpenChange(false) 로 상태를 닫는다. 렌더링되는 DOM 은 없다.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const ok = confirmNative(title, description);
    if (ok) onConfirm();
    onOpenChange(false);
    // open 전환 시에만 실행 — title/description 은 그 시점 값을 사용한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return null;
}
