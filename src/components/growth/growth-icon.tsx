"use client";

import {
  UserPlus,
  Gift,
  Share2,
  CalendarCheck,
  Building2,
  Rocket,
  Coins,
  Megaphone,
  CreditCard,
  Bell,
  ShieldCheck,
  CircleCheck,
  type LucideIcon,
} from "lucide-react";

// Professional, monochrome tool-style icons only (no emoji / sparkles / orange).
const ICONS: Record<string, LucideIcon> = {
  "user-plus": UserPlus,
  gift: Gift,
  "share-2": Share2,
  "calendar-check": CalendarCheck,
  "building-2": Building2,
  rocket: Rocket,
  coins: Coins,
  megaphone: Megaphone,
  "credit-card": CreditCard,
  bell: Bell,
  "shield-check": ShieldCheck,
  check: CircleCheck,
};

export function resolveGrowthIcon(iconKey?: string | null): LucideIcon {
  return (iconKey && ICONS[iconKey]) || Bell;
}

export function GrowthIcon({
  iconKey,
  className,
  strokeWidth = 1.8,
}: {
  iconKey?: string | null;
  className?: string;
  strokeWidth?: number;
}) {
  // Icons are stable module-level refs from ICONS (not components created during
  // render), so dynamic selection here is safe.
  const Icon = resolveGrowthIcon(iconKey);
  // eslint-disable-next-line react-hooks/static-components
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
}
