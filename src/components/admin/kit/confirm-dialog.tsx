"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = 삭제·회수처럼 되돌리기 어려운 동작(빨간 주 버튼) */
  tone?: "default" | "danger";
};

/**
 * 확인 팝업 — window.confirm/alert 대체. 취소 → 주 버튼 순, danger 는 빨간 주 버튼.
 * 대개는 useConfirm() 으로 쓰고, 진행 중 상태가 필요하면 직접 렌더한다.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  tone = "default",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmOptions & {
  open: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !loading && onCancel()}>
      <AlertDialogContent className="gap-0 p-0 sm:max-w-[440px]">
        <div className="px-5 pt-5 pb-4">
          <AlertDialogTitle className="text-[16px] font-semibold text-gray-900">{title}</AlertDialogTitle>
          <AlertDialogDescription
            className={cn("mt-1.5 text-[13px] leading-relaxed text-gray-500", !description && "sr-only")}
          >
            {description ?? title}
          </AlertDialogDescription>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onConfirm}
            disabled={loading}
            className={cn(tone === "danger" && "bg-rose-600 text-white hover:bg-rose-700")}
          >
            {loading && <Loader2 className="size-3.5 animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmCtx = createContext<ConfirmFn | null>(null);

/** 셸에 한 번 마운트. 페이지는 `const confirm = useConfirm(); if (await confirm({...}))` 로 쓴다. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{
    options: ConfirmOptions;
    resolve: (ok: boolean) => void;
  } | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setPending({ options, resolve })),
    [],
  );
  const settle = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={pending !== null}
        title={pending?.options.title ?? ""}
        description={pending?.options.description}
        confirmLabel={pending?.options.confirmLabel}
        cancelLabel={pending?.options.cancelLabel}
        tone={pending?.options.tone}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmCtx.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmCtx);
  if (fn) return fn;
  // 프로바이더 밖(관리자 셸 외부)에서는 브라우저 confirm 으로 대체한다.
  return async ({ title, description }) =>
    window.confirm(typeof description === "string" ? `${title}\n\n${description}` : title);
}
