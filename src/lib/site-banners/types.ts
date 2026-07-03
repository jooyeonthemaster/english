import type { BannerDismissMode, BannerType } from "./templates";

/**
 * The banner shape delivered by `GET /api/site-banners` to the client host.
 * Content is already normalized to a string map (template defaults merged in).
 */
export interface SiteBannerView {
  id: string;
  type: BannerType;
  templateKey: string | null;
  content: Record<string, string>;
  imageUrl: string | null;
  imageAlt: string | null;
  linkUrl: string | null;
  dismissMode: BannerDismissMode;
  showDismissButton: boolean;
  priority: number;
  /** ISO updatedAt — part of the localStorage dismiss key so edits re-surface. */
  version: string;
  /** When true, show regardless of prior dismissal (e.g. low-credit override). */
  forceShow: boolean;
}

export interface SiteBannersResponse {
  banners: SiteBannerView[];
}

/** Props every template renderer receives from the host / admin preview. */
export interface BannerRendererProps {
  content: Record<string, string>;
  labelledById: string;
  /** Label for the explicit dismiss affordance; null when mode is ALWAYS. */
  dismissLabel: string | null;
  /** Close + persist dismissal per the banner's mode + advance the queue. */
  onDismiss: () => void;
  /** feedback-invite only: which step to open on (1 = intro, 2 = phone reveal). */
  initialStep?: number;
}
