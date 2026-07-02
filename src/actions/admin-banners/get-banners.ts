"use server";

import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import {
  parseAudiences,
  type BannerAudience,
  type BannerDismissMode,
  type BannerType,
} from "@/lib/site-banners/templates";

export interface AdminBannerDto {
  id: string;
  title: string;
  type: BannerType;
  templateKey: string | null;
  content: Record<string, string>;
  imageUrl: string | null;
  imageAlt: string | null;
  linkUrl: string | null;
  audiences: BannerAudience[];
  priority: number;
  isActive: boolean;
  dismissMode: BannerDismissMode;
  showDismissButton: boolean;
  startsAt: string | null;
  endsAt: string | null;
  autoOpenOnLowCredit: boolean;
  createdAt: string;
  updatedAt: string;
}

function toContent(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/** Full banner list for the admin console, ordered by priority then recency. */
export async function getBanners(): Promise<AdminBannerDto[]> {
  await requireAdminAuth();

  const rows = await prisma.siteBanner.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  return rows.map((b) => ({
    id: b.id,
    title: b.title,
    type: b.type as BannerType,
    templateKey: b.templateKey,
    content: toContent(b.content),
    imageUrl: b.imageUrl,
    imageAlt: b.imageAlt,
    linkUrl: b.linkUrl,
    audiences: parseAudiences(b.audiences),
    priority: b.priority,
    isActive: b.isActive,
    dismissMode: b.dismissMode as BannerDismissMode,
    showDismissButton: b.showDismissButton,
    startsAt: b.startsAt ? b.startsAt.toISOString() : null,
    endsAt: b.endsAt ? b.endsAt.toISOString() : null,
    autoOpenOnLowCredit: b.autoOpenOnLowCredit,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  }));
}
