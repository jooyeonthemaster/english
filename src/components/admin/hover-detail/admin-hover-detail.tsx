"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
} from "react";
import { X } from "lucide-react";
import { Slot } from "radix-ui";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { AdminDetail, AdminDetailRowActionHandler } from "@/lib/admin-detail-types";
import { AdminDetailView } from "./admin-detail-view";
import { invalidateAdminDetailCache, useAdminDetail } from "./use-admin-detail";

const OPEN_DELAY_MS = 350;
const CLOSE_DELAY_MS = 150;

/** 이 위에 커서가 있으면 팝오버를 띄우지 않고, 클릭해도 상세 팝업을 열지 않는다. */
const INTERACTIVE_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "textarea",
  "select",
  "label",
  "[role='switch']",
  "[role='checkbox']",
  "[role='menuitem']",
  "[role='tab']",
  "[contenteditable='true']",
  "[data-no-detail]",
].join(",");

function isOnInteractive(target: EventTarget | null, root: Element) {
  if (!(target instanceof Element)) return false;
  const hit = target.closest(INTERACTIVE_SELECTOR);
  // 블록 자신이 버튼·링크인 경우(리더보드 행 등)는 막지 않는다.
  return Boolean(hit && hit !== root && root.contains(hit));
}

type Props = {
  /** 상세를 붙일 요소 하나(tr·div·li·button 등). 이벤트·클래스는 그대로 합쳐진다. */
  children: ReactElement;
  /** 상세가 아직 없을 때(로딩) 보여줄 제목 */
  title: string;
  /** 이미 가진 데이터로 만든 상세(조회 없음) */
  detail?: AdminDetail | null;
  /** 서버에서 가져올 상세 — 처음 열릴 때 조회 */
  load?: () => Promise<AdminDetail>;
  cacheKey?: string;
  /**
   * "dialog" = 클릭 시 상세 팝업(기본). "none" = 요소의 기존 클릭 동작(편집창·페이지 이동 등)을
   * 그대로 두고 호버 팝오버만 붙인다.
   */
  click?: "dialog" | "none";
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  disabled?: boolean;
  /** 상세 표의 rowAction 버튼 동작(클릭 팝업에서만). 처리 후 다음 열람 때 새로 조회한다. */
  onRowAction?: AdminDetailRowActionHandler;
};

/**
 * 관리자 화면 공용 — 마우스를 올리면 상세 팝오버, 클릭하면 상세 팝업.
 * 행 안의 버튼·입력칸 위에서는 뜨지 않아 기존 조작을 방해하지 않는다.
 * 터치 기기는 호버가 없으므로 탭=팝업(click="dialog"일 때)만 동작한다.
 */
export function AdminHoverDetail({
  children,
  title,
  detail: staticDetail,
  load,
  cacheKey,
  click = "dialog",
  side = "bottom",
  align = "start",
  disabled = false,
  onRowAction,
}: Props) {
  const { detail, error, loading, ensure } = useAdminDetail(staticDetail, load, cacheKey);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clearTimer, []);

  if (disabled) return children;

  const handleRowAction: AdminDetailRowActionHandler | undefined = onRowAction
    ? async (rowId, done) => {
        await onRowAction(rowId, done);
        // 열려 있는 팝업은 처리 표시를 유지하고, 다시 열 때 최신 목록을 받는다.
        if (cacheKey) invalidateAdminDetailCache(cacheKey);
      }
    : undefined;

  const scheduleOpen = () => {
    if (timer.current || hoverOpen || dialogOpen) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      setHoverOpen(true);
      ensure();
    }, OPEN_DELAY_MS);
  };
  const scheduleClose = () => {
    clearTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      setHoverOpen(false);
    }, CLOSE_DELAY_MS);
  };
  const closeNow = () => {
    clearTimer();
    setHoverOpen(false);
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse") return;
    if (isOnInteractive(e.target, e.currentTarget)) {
      closeNow();
      return;
    }
    if (!hoverOpen) scheduleOpen();
    else clearTimer();
  };

  const openDialog = () => {
    closeNow();
    setDialogOpen(true);
    ensure();
  };

  const onClick = (e: MouseEvent<HTMLElement>) => {
    closeNow();
    if (click !== "dialog" || e.defaultPrevented) return;
    if (isOnInteractive(e.target, e.currentTarget)) return;
    // 글자를 드래그해 복사하는 중이면 팝업을 열지 않는다.
    if (window.getSelection()?.toString()) return;
    openDialog();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (click !== "dialog" || e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDialog();
    }
  };

  return (
    <>
      <Popover open={hoverOpen} onOpenChange={setHoverOpen}>
        <PopoverAnchor asChild>
          <Slot.Root
            onPointerMove={onPointerMove}
            onPointerLeave={scheduleClose}
            onClick={onClick}
            {...(click === "dialog"
              ? { onKeyDown, tabIndex: 0, "data-admin-detail": "" }
              : { "data-admin-detail": "hover" })}
          >
            {children}
          </Slot.Root>
        </PopoverAnchor>
        <PopoverContent
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onPointerEnter={clearTimer}
          onPointerLeave={scheduleClose}
          className="max-h-(--radix-popover-content-available-height) w-auto max-w-[min(960px,calc(100vw-2rem))] min-w-[min(360px,calc(100vw-2rem))] overflow-y-auto p-4"
        >
          <div className="mb-3 text-[13px] font-semibold text-gray-900">
            {detail?.title ?? title}
          </div>
          <AdminDetailView
            detail={detail}
            loading={loading}
            error={error}
            preview
            showClickHint={click === "dialog"}
          />
        </PopoverContent>
      </Popover>

      {click === "dialog" && dialogOpen && (
        <Dialog open onOpenChange={setDialogOpen}>
          <DialogContent showCloseButton={false} className="gap-0 p-0 sm:max-w-3xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <div className="min-w-0">
                <DialogTitle className="text-[16px] font-semibold text-gray-900">
                  {detail?.title ?? title}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-[12px] text-gray-400">
                  {detail?.subtitle ?? "상세 내역"}
                </DialogDescription>
              </div>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                aria-label="닫기"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="max-h-[70dvh] overflow-y-auto px-5 py-4">
              <AdminDetailView
                detail={detail}
                loading={loading}
                error={error}
                onRowAction={handleRowAction}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
