"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Grip, PlayCircle, X } from "lucide-react";

const POPUP_W_KEY = "smoat.extraction.tutorialVideoPopupWidth.v1";
const DEFAULT_POPUP_W = 760;
const MIN_POPUP_W = 520;
const MIN_RESPONSIVE_POPUP_W = 320;
const MAX_POPUP_W = 1040;
const VIDEO_ASPECT = 16 / 9;

function clampPopupWidth(width: number, max = MAX_POPUP_W) {
  return Math.min(max, Math.max(MIN_POPUP_W, Math.round(width)));
}

export function TutorialVideoPopup({
  durationLabel,
  title,
  description,
  closeLabel,
  onClose,
  onHidePermanently,
  children,
}: {
  durationLabel: string;
  title: string;
  description: string;
  closeLabel: string;
  onClose: () => void;
  onHidePermanently?: () => void;
  children: ReactNode;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [popupWidth, setPopupWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_POPUP_W;
    const raw = window.localStorage.getItem(POPUP_W_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isNaN(n) ? DEFAULT_POPUP_W : clampPopupWidth(n);
  });
  const [responsiveMaxWidth, setResponsiveMaxWidth] =
    useState<number>(MAX_POPUP_W);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const measure = () => {
      const rect = overlay.getBoundingClientRect();
      const headerH = headerRef.current?.offsetHeight ?? 0;
      const footerH = footerRef.current?.offsetHeight ?? 0;
      const videoBodyPaddingY = 16;
      const videoBodyPaddingX = 16;
      const availableVideoH = Math.max(
        80,
        rect.height - headerH - footerH - videoBodyPaddingY,
      );
      const maxByHeight = availableVideoH * VIDEO_ASPECT + videoBodyPaddingX;
      const maxByWidth = Math.max(MIN_RESPONSIVE_POPUP_W, rect.width - 16);
      setResponsiveMaxWidth(
        Math.max(
          MIN_RESPONSIVE_POPUP_W,
          Math.min(MAX_POPUP_W, maxByWidth, maxByHeight),
        ),
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(overlay);
    if (headerRef.current) observer.observe(headerRef.current);
    if (footerRef.current) observer.observe(footerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [onHidePermanently]);

  const beginResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const rect = popupRef.current?.getBoundingClientRect();
      const parentRect = popupRef.current?.parentElement?.getBoundingClientRect();
      const startW = rect?.width ?? popupWidth;
      const startX = event.clientX;
      const startY = event.clientY;
      const maxW = Math.max(
        MIN_POPUP_W,
        Math.min(MAX_POPUP_W, (parentRect?.width ?? window.innerWidth) - 16),
      );
      let latest = clampPopupWidth(startW, maxW);

      document.body.style.cursor = "nwse-resize";
      document.body.style.userSelect = "none";

      const move = (e: PointerEvent) => {
        e.preventDefault();
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const delta = Math.abs(dx) >= Math.abs(dy) ? dx : dy * 1.35;
        latest = clampPopupWidth(startW + delta, maxW);
        setPopupWidth(latest);
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        try {
          window.localStorage.setItem(POPUP_W_KEY, String(latest));
        } catch {
          /* ignore */
        }
      };

      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", finish, { once: true });
      window.addEventListener("pointercancel", finish, { once: true });
    },
    [popupWidth],
  );

  const effectivePopupWidth = Math.min(popupWidth, responsiveMaxWidth);

  return (
    <div
      ref={overlayRef}
      className="pointer-events-none absolute inset-x-3 bottom-4 top-4 z-30 flex items-start justify-center"
    >
      <div
        ref={popupRef}
        className="pointer-events-auto relative flex max-h-full flex-col overflow-hidden rounded-lg border border-blue-200 bg-white/78 shadow-2xl shadow-blue-950/20 ring-1 ring-blue-100 backdrop-blur-[2px]"
        style={{ width: effectivePopupWidth }}
      >
        <div
          ref={headerRef}
          className="relative shrink-0 bg-white/55 px-4 pb-3 pt-3 pr-11"
        >
          <div className="inline-flex w-fit items-center gap-1.5 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white">
            <PlayCircle className="size-3.5" aria-hidden="true" />
            {durationLabel}
          </div>
          <h3 className="mt-2 text-[15px] font-extrabold leading-snug text-slate-950">
            {title}
          </h3>
          <p className="mt-1 text-[11.5px] font-semibold leading-relaxed text-slate-500">
            {description}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            title="닫기"
            className="absolute right-2 top-2 inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-blue-400 transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 shrink bg-slate-950 p-2">{children}</div>

        {onHidePermanently ? (
          <div
            ref={footerRef}
            className="flex shrink-0 justify-end border-t border-blue-100 bg-white/55 px-3 py-2 pr-10"
          >
            <button
              type="button"
              onClick={onHidePermanently}
              className="rounded-md px-1.5 py-1 text-[11px] font-bold text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              다시는 보지 않기
            </button>
          </div>
        ) : (
          <span ref={footerRef} className="hidden" aria-hidden="true" />
        )}
        <button
          type="button"
          onPointerDown={beginResize}
          aria-label="사용법 영상 팝업 크기 조절"
          title="드래그하여 팝업 크기 조절"
          className="absolute bottom-1.5 right-1.5 inline-flex size-7 cursor-nwse-resize touch-none select-none items-center justify-center rounded-md bg-white/95 text-slate-400 shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <Grip className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
