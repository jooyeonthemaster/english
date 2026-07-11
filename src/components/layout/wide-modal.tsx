"use client";

// ============================================================================
// 와이드 모달 셸 정본 — "좁은 모달 금지" 계약의 공유 구현
//
// question-review-modal 의 프레임 패턴(fixed inset-0 + 백드롭 블러 + 라운드
// 컨테이너 + 고정 헤더/푸터 + 본문 스크롤)을 컴포넌트화. 배포 위저드·상세
// 뷰 등 큰 작업창은 전부 이 셸을 쓴다. ESC/백드롭 닫기 + body 스크롤락 +
// 포털 내장.
// ============================================================================

import { useEffect } from "react";
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="닫기"
        className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-[2px]"
        onClick={disableBackdropClose ? undefined : onClose}
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
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
