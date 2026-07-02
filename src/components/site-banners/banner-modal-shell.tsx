"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";

/**
 * Generic entry-banner modal chrome — overlay, focus trap, ESC-to-close, body
 * scroll-lock, and the SMOAT gradient top rail. Generalized from the original
 * feedback-event modal so every banner template shares identical behavior.
 */

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const BANNER_FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

export function BannerModalShell({
  open,
  onClose,
  labelledById,
  children,
  maxWidthClass = "max-w-[440px]",
  padded = true,
  showTopRail = true,
  showClose = true,
  solidClose = false,
}: {
  open: boolean;
  onClose: () => void;
  labelledById?: string;
  children: ReactNode;
  maxWidthClass?: string;
  /** Add default inner padding (off for edge-to-edge image banners). */
  padded?: boolean;
  showTopRail?: boolean;
  showClose?: boolean;
  /** Give the close button an opaque backdrop so it stays visible over images. */
  solidClose?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const close = useCallback(() => onClose(), [onClose]);

  // Body scroll lock + focus capture/restore.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  // Initial focus on the panel (so no button shows a ring on open).
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => panelRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  // ESC to close + Tab focus trap.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      const items = panel
        ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
            (el) => el.offsetParent !== null,
          )
        : [];
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || active === panel) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  const cardMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 16, scale: 0.97 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 10, scale: 0.98 },
      };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="site-banner-overlay"
          className="pointer-events-auto fixed inset-0 z-[120] flex items-center justify-center px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledById}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="닫기"
            onClick={close}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[3px]"
          />

          <motion.div
            ref={panelRef}
            tabIndex={-1}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className={`relative w-full ${maxWidthClass} overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_-18px_rgba(15,23,42,0.4)] outline-none`}
            {...cardMotion}
          >
            {showTopRail && (
              <div
                aria-hidden="true"
                className="h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-400"
              />
            )}

            {showClose && (
              <button
                type="button"
                onClick={close}
                aria-label="닫기"
                className={`absolute right-3.5 top-3.5 z-10 flex size-8 items-center justify-center rounded-full transition-colors ${
                  solidClose
                    ? "bg-white/85 text-slate-600 shadow-sm backdrop-blur-sm hover:bg-white hover:text-slate-900"
                    : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                } ${BANNER_FOCUS_RING}`}
              >
                <X className="size-[18px]" aria-hidden="true" />
              </button>
            )}

            <div className={padded ? "px-6 pb-6 pt-5 sm:px-7 sm:pb-7" : ""}>{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
