"use client";

import { ArrowRight, Megaphone } from "lucide-react";
import type { BannerRendererProps } from "@/lib/site-banners/types";
import { BANNER_FOCUS_RING } from "../banner-modal-shell";

/**
 * General-purpose announcement template — eyebrow chip, heading, body, and an
 * optional primary CTA. Content keys: eyebrow, heading, body, primaryLabel,
 * primaryUrl.
 */
export function AnnouncementBanner({
  content,
  labelledById,
  dismissLabel,
  onDismiss,
}: BannerRendererProps) {
  const eyebrow = content.eyebrow?.trim();
  const heading = content.heading?.trim() || "새로운 소식";
  const body = content.body?.trim();
  const primaryLabel = content.primaryLabel?.trim();
  const primaryUrl = content.primaryUrl?.trim();
  const hasCta = Boolean(primaryLabel && primaryUrl);

  return (
    <div>
      {eyebrow && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold tracking-[0.02em] text-blue-700">
          <Megaphone className="size-3.5" aria-hidden="true" />
          {eyebrow}
        </span>
      )}
      <h2
        id={labelledById}
        className="mt-3 text-[21px] font-bold leading-snug tracking-tight text-slate-900 break-keep"
      >
        {heading}
      </h2>

      {body && (
        <p className="mt-3 whitespace-pre-line text-[14px] leading-[1.6] text-slate-500 break-keep">
          {body}
        </p>
      )}

      {hasCta && (
        <a
          href={primaryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`group mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-[15px] font-bold text-white shadow-[0_8px_20px_-6px_rgba(37,99,235,0.5)] transition-all hover:bg-blue-700 active:scale-[0.99] ${BANNER_FOCUS_RING}`}
        >
          {primaryLabel}
          <ArrowRight
            className="size-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </a>
      )}

      {dismissLabel && (
        <div className="mt-2.5 flex items-center justify-center">
          <button
            type="button"
            onClick={onDismiss}
            className={`rounded px-1.5 py-1 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-600 ${BANNER_FOCUS_RING}`}
          >
            {dismissLabel}
          </button>
        </div>
      )}
    </div>
  );
}
