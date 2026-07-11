"use client";

// ============================================================================
// /t/[token] 응시면 다이얼로그 공통 a11y 훅 — ESC 닫기·초기 포커스·Tab 트랩
//
// ConfirmIncompleteDialog·ExitConfirmDialog·NavigatorSheet 에 적용한다.
// TimeUpOverlay 는 의도적으로 제외 — 자동 제출 중에는 사용자가 닫을 수 없어야
// 한다. ESC 는 캡처 단계에서 가로채 다른 리스너로의 전파를 차단하고, 초기
// 포커스는 닫기(취소) 버튼에 준다(실수 제출 방지). 언마운트 시 이전 포커스 복귀.
// ============================================================================

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogA11y({ onClose }: { onClose?: () => void }) {
  /** 다이얼로그 루트(백드롭 포함) — Tab 트랩 경계 */
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** 초기 포커스 대상 — 닫기/취소 버튼에 달아라 */
  const initialFocusRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    initialFocusRef.current?.focus();

    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !container.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !container.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => {
      document.removeEventListener("keydown", handler, true);
      previous?.focus();
    };
  }, []);

  return { containerRef, initialFocusRef };
}
