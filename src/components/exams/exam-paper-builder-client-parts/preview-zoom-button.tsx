"use client";

import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// 미리보기 줌 컨트롤 안의 단일 버튼
// ---------------------------------------------------------------------------

interface PreviewZoomButtonProps {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: ReactNode;
}

export function PreviewZoomButton({
  onClick,
  disabled,
  label,
  children,
}: PreviewZoomButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex size-6 cursor-pointer items-center justify-center rounded text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-default disabled:text-slate-300 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
