"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { feedbackStore } from "@/lib/feedback-store";
import type { SiteBannerView, SiteBannersResponse } from "@/lib/site-banners/types";
import { BannerView } from "./banner-view";

/**
 * Mounts once per surface (director / teacher / student layout). Fetches the
 * viewer's active banners from `/api/site-banners`, then shows them one at a
 * time in priority order — dismissing the current one advances to the next
 * (the "close one → the next opens" queue).
 *
 * The sidebar "무료 크레딧 신청하기" CTA still works: it flips {@link feedbackStore},
 * which we treat as an on-demand request to open the feedback-invite banner at
 * its phone-reveal step, overriding the queue.
 */

function todayStamp(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function keyFor(b: SiteBannerView): string {
  return `smoat:banner:${b.id}:${b.version}`;
}

function isDismissed(b: SiteBannerView): boolean {
  if (b.forceShow || b.dismissMode === "ALWAYS") return false;
  try {
    if (b.dismissMode === "SESSION") return sessionStorage.getItem(keyFor(b)) !== null;
    const val = localStorage.getItem(keyFor(b));
    if (b.dismissMode === "ONCE") return val !== null;
    if (b.dismissMode === "DAILY") return val === todayStamp();
  } catch {
    return false;
  }
  return false;
}

function recordDismiss(b: SiteBannerView): void {
  if (b.dismissMode === "ALWAYS") return;
  try {
    if (b.dismissMode === "SESSION") {
      sessionStorage.setItem(keyFor(b), "1");
    } else if (b.dismissMode === "ONCE") {
      localStorage.setItem(keyFor(b), "1");
    } else if (b.dismissMode === "DAILY") {
      localStorage.setItem(keyFor(b), todayStamp());
    }
  } catch {
    // ignore — closing for this session is still respected via queue advance.
  }
}

export function SiteBannerHost() {
  // Hydration gate — no banners on the server / first hydration pass.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const [banners, setBanners] = useState<SiteBannerView[]>([]);
  const [queue, setQueue] = useState<SiteBannerView[]>([]);
  const [index, setIndex] = useState(0);

  const feedback = useSyncExternalStore(
    feedbackStore.subscribe,
    feedbackStore.getSnapshot,
    feedbackStore.getServerSnapshot,
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/site-banners", { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<SiteBannersResponse>) : null))
      .then((data) => {
        if (!data) return;
        setBanners(data.banners);
        setQueue(data.banners.filter((b) => !isDismissed(b)));
        setIndex(0);
      })
      .catch(() => {
        // best-effort — no banners on failure.
      });
    return () => controller.abort();
  }, []);

  if (!hydrated) return null;

  // On-demand open (sidebar CTA) overrides the auto queue.
  const feedbackBanner = banners.find((b) => b.templateKey === "feedback-invite");
  if (feedback.open && feedbackBanner) {
    return (
      <BannerView
        key={`ondemand-${feedbackBanner.id}`}
        banner={feedbackBanner}
        open
        initialStep={feedback.step}
        onDismiss={() => feedbackStore.close()}
      />
    );
  }

  const current = queue[index];
  if (!current) return null;

  return (
    <BannerView
      key={current.id}
      banner={current}
      open
      onDismiss={() => {
        recordDismiss(current);
        setIndex((i) => i + 1);
      }}
    />
  );
}
