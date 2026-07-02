"use client";

import { dismissButtonLabel } from "@/lib/site-banners/templates";
import type { SiteBannerView } from "@/lib/site-banners/types";
import { BannerModalShell } from "./banner-modal-shell";
import { TEMPLATE_RENDERERS } from "./template-renderers";

/**
 * Renders a single banner in its modal shell. Used by both the live host and
 * the admin editor preview. `onDismiss` closes + advances the queue; the shell's
 * X/overlay/ESC route to the same handler.
 */
export function BannerView({
  banner,
  open,
  onDismiss,
  initialStep,
}: {
  banner: SiteBannerView;
  open: boolean;
  onDismiss: () => void;
  initialStep?: number;
}) {
  const labelledById = `site-banner-${banner.id}-title`;
  const dismissLabel = banner.showDismissButton
    ? dismissButtonLabel(banner.dismissMode)
    : null;

  if (banner.type === "IMAGE") {
    const img = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={banner.imageUrl ?? ""}
        alt={banner.imageAlt ?? ""}
        className="block h-auto w-full"
      />
    );
    return (
      <BannerModalShell
        open={open}
        onClose={onDismiss}
        labelledById={labelledById}
        maxWidthClass="max-w-[480px]"
        padded={false}
        showTopRail={false}
        solidClose
      >
        <h2 id={labelledById} className="sr-only">
          {banner.imageAlt || "배너"}
        </h2>
        {banner.linkUrl ? (
          <a
            href={banner.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
            onClick={() => onDismiss()}
          >
            {img}
          </a>
        ) : (
          img
        )}
        {dismissLabel && (
          <div className="flex items-center justify-center border-t border-slate-100 py-2.5">
            <button
              type="button"
              onClick={onDismiss}
              className="rounded px-1.5 py-1 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-600"
            >
              {dismissLabel}
            </button>
          </div>
        )}
      </BannerModalShell>
    );
  }

  const Renderer = banner.templateKey ? TEMPLATE_RENDERERS[banner.templateKey] : undefined;
  if (!Renderer) return null;

  return (
    <BannerModalShell open={open} onClose={onDismiss} labelledById={labelledById}>
      <Renderer
        content={banner.content}
        labelledById={labelledById}
        dismissLabel={dismissLabel}
        onDismiss={onDismiss}
        initialStep={initialStep}
      />
    </BannerModalShell>
  );
}
