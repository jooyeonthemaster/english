"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";

/**
 * 전체 페이지형 편집기용 — 미저장 변경이 있을 때 브라우저 탭 닫기/새로고침/외부 이동에
 * 대해 경고한다. 이 경로는 **브라우저 기본 다이얼로그**만 띄울 수 있어(커스텀 디자인 불가)
 * 모달의 `useUnsavedCloseGuard` 와 디자인을 맞출 수 없는 브라우저 제약이 있다.
 */
export function useBeforeUnloadWarning(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [enabled]);
}

/**
 * 편집 화면 공통 — 미저장 변경이 있으면 닫기/나가기 전에 **표준 경고 다이얼로그**를 띄운다.
 *
 * 모든 닫기 경로(X 버튼·ESC·배경 클릭·뒤로가기 등)에서 `requestClose()` 를 호출하고,
 * 반환된 `dialog` 를 컴포넌트에 한 번 렌더하면 된다. dirty 가 아니면 즉시 닫고,
 * dirty 면 "변경사항이 있습니다" 경고를 띄워 확인 시에만 닫는다.
 *
 * `isDirty`/`onClose` 는 매 렌더 최신값을 ref 로 읽으므로 `requestClose` 는 안정적이다
 * (keydown 리스너 등 effect 의존성에 그대로 넣어도 안전).
 */
export function useUnsavedCloseGuard(opts: {
  isDirty: boolean;
  onClose: () => void;
}): { requestClose: () => void; dialog: ReactNode } {
  const [open, setOpen] = useState(false);
  const dirtyRef = useRef(opts.isDirty);
  dirtyRef.current = opts.isDirty;
  const closeRef = useRef(opts.onClose);
  closeRef.current = opts.onClose;

  const requestClose = useCallback(() => {
    if (dirtyRef.current) {
      setOpen(true);
      return;
    }
    closeRef.current();
  }, []);

  const dialog = (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title="변경사항이 있습니다"
      description="저장하지 않은 변경사항이 있습니다. 그래도 닫으시겠습니까?"
      confirmText="닫기"
      cancelText="취소"
      variant="destructive"
      onConfirm={() => closeRef.current()}
    />
  );

  return { requestClose, dialog };
}
