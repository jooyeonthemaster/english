"use client";

import type { ComponentType } from "react";
import type { BannerRendererProps } from "@/lib/site-banners/types";
import { AnnouncementBanner } from "./templates/announcement";
import { FeedbackInviteBanner } from "./templates/feedback-invite";

/** templateKey → renderer. Shared by the live host and the admin preview. */
export const TEMPLATE_RENDERERS: Record<string, ComponentType<BannerRendererProps>> = {
  announcement: AnnouncementBanner,
  "feedback-invite": FeedbackInviteBanner,
};
