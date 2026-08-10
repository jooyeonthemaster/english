"use client";

// ============================================================================
// 와이드 모달 셸 정본 — "좁은 모달 금지" 계약의 공유 구현
//
// question-review-modal 의 프레임 패턴(fixed inset-0 + 백드롭 블러 + 라운드
// 컨테이너 + 고정 헤더/푸터 + 본문 스크롤)을 컴포넌트화. 배포 위저드·상세
// 뷰 등 큰 작업창은 전부 이 셸을 쓴다. ESC/백드롭 닫기 + body 스크롤락 +
// 포털 내장 + 포커스 트랩/복원(2026-07-25 추가 — 트랩이 없어 Tab 이 배경
// 사이드바·푸터로 새어 나가고, 닫아도 포커스가 트리거로 돌아오지 않았다).
// ============================================================================

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function WideModal({
  open,
  onClose,
  icon: Icon,
  title,
  description,
  children,
  footer,
  maxWidthClassName = "max-w-[1100px]",
  bodyClassName,
  disableBackdropClose = false,
}: {
  open: boolean;
  onClose: () => void;
  icon?: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
  /** 고정 푸터 슬롯(액션 바) — 없으면 미렌더 */
  footer?: ReactNode;
  /** 기본 max-w-[1100px] — 필요 시 max-w-[1400px] 등으로 */
  maxWidthClassName?: string;
  bodyClassName?: string;
  disableBackdropClose?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // 열기 전 포커스를 기억했다가 닫을 때 되돌린다 — 없으면 키보드 사용자가
    // 모달을 닫은 뒤 문서 처음부터 다시 Tab 해 내려와야 한다.
    const restoreTo = document.activeElement as HTMLElement | null;

    /** 패널 안에서 실제로 포커스를 받을 수 있는 요소 */
    const focusables = (): HTMLElement[] => {
      const root = panelRef.current;
      if (!root) return [];
      return [
        ...root.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null || el === document.activeElement);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // 포커스 트랩 — 없으면 화면엔 모달이 떠 있는데 Tab 이 뒤에 깔린
      // 사이드바·푸터 링크로 새어 보이지 않는 곳을 조작하게 된다.
      if (e.key !== "Tab") return;
      const root = panelRef.current;
      if (!root) return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!root.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // 초기 포커스는 패널 자체 — 스크린리더가 dialog 라벨을 읽고 시작한다.
    const raf = requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      restoreTo?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      {/* 백드롭 — 헤더 닫기 버튼과 접근성 이름이 겹치지 않게 보조기술에서 숨긴다
          (닫기 수단은 헤더 버튼과 ESC 가 정본) */}
      <button
        type="button"
        aria-hidden="true"
        className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-[2px]"
        onClick={disableBackdropClose ? undefined : onClose}
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "outline-none",
          "relative flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)]",
          maxWidthClassName,
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon ? (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                <Icon className="size-5" aria-hidden="true" />
              </span>
            ) : null}
            <div className="min-w-0">
              <h2 className="truncate text-[14px] font-bold text-slate-900">{title}</h2>
              {description ? (
                <p className="truncate text-[12px] font-medium text-slate-400">{description}</p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex size-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className={cn("min-h-0 flex-1 overflow-y-auto bg-[#F8FAFB]", bodyClassName)}>
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 sm:px-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/**
 * 닫힘 확인 카드 — 작성 중 데이터가 있는 모달의 requestClose 흐름 전용.
 * WideModal 위(z-[60])에 뜨며, 열림 중 ESC 는 캡처 단계에서 가로채 카드만
 * 닫는다(그대로 두면 WideModal 의 document 리스너까지 닿아 모달 전체가 닫힘).
 */
export function ModalCloseGuardCard({
  open,
  message,
  onStay,
  onDiscard,
}: {
  open: boolean;
  /** 본문 안내 — 예: "닫으면 입력한 내용이 사라집니다." */
  message: string;
  /** 계속 작성(카드만 닫기) */
  onStay: () => void;
  /** 정말 닫기(모달까지 닫기) */
  onDiscard: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onStay();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onStay]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="닫기 확인"
        className="w-full max-w-[360px] rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
      >
        <p className="text-[14px] font-bold text-slate-900">작성을 중단할까요?</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">{message}</p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onDiscard}
            className="h-8 rounded-md border border-slate-200 bg-white px-3.5 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            닫기
          </button>
          <button
            type="button"
            autoFocus
            onClick={onStay}
            className="h-8 rounded-md bg-blue-600 px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-blue-700"
          >
            계속 작성
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
