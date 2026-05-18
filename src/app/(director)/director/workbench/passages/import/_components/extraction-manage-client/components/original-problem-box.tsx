"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FileText,
  Image as ImageIcon,
} from "lucide-react";

import type { M1PassageDraftWithJob } from "../types";
import type { InlineRestorationChange } from "../utils/restoration-changes";
import { HighlightedRawText } from "./highlighted-raw-text";
import { ImagePages, type PageImage } from "./image-carousel";

type ViewMode = "text" | "image";

interface OriginalProblemBoxProps {
  draft: M1PassageDraftWithJob;
  changes: InlineRestorationChange[];
  hoveredChangeId: string | null;
  activeChangeId: string | null;
  onHoverChange: (id: string | null) => void;
  onSelectChange: (id: string | null) => void;
}

export function OriginalProblemBox({
  draft,
  changes,
  hoveredChangeId,
  activeChangeId,
  onHoverChange,
  onSelectChange,
}: OriginalProblemBoxProps) {
  const [mode, setMode] = useState<ViewMode>("text");
  const [pages, setPages] = useState<PageImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Ref-as-state so children can portal their floating controls into a
  // layer that lives OUTSIDE the scroll container — guarantees the
  // controls don't move when the image is scrolled.
  const [overlayEl, setOverlayEl] = useState<HTMLDivElement | null>(null);

  // The draft carries `sourcePageIndex: number[]` — one or more page indices
  // that this passage was extracted from. When the teacher toggles into
  // image mode, we lazily fetch the signed URLs for exactly those pages.
  const indicesKey = useMemo(
    () => [...draft.sourcePageIndex].sort((a, b) => a - b).join(","),
    [draft.sourcePageIndex],
  );

  // Fetch image URLs only when the teacher actually switches to image mode.
  // Keeping this lazy lets the detail modal open immediately on text mode;
  // signed URL generation and image preloading otherwise compete with the
  // first paint of the popup.
  useEffect(() => {
    if (mode !== "image") return;
    if (!draft.jobId) return;
    if (!indicesKey) return;
    if (pages.length > 0) return;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/extraction/jobs/${draft.jobId}/pages?indices=${indicesKey}`,
          { credentials: "include", cache: "no-store" },
        );
        if (!res.ok) throw new Error("페이지 이미지를 불러오지 못했습니다.");
        const data = (await res.json()) as { pages?: PageImage[] };
        if (cancelled) return;
        const fetched = data.pages ?? [];
        setPages(fetched);
        // Warm browser cache for the visible images.
        if (typeof window !== "undefined") {
          for (const p of fetched) {
            if (!p.signedUrl) continue;
            const img = new window.Image();
            img.src = p.signedUrl;
          }
        }
      } catch (err) {
        if (cancelled) return;
        setFetchError(
          err instanceof Error
            ? err.message
            : "페이지 이미지를 불러오지 못했습니다.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.jobId, indicesKey, mode, pages.length]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-slate-900">
            문제 원문
          </span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600">
            RAW
          </span>
        </div>
        <div className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5">
          <ViewModeButton
            active={mode === "text"}
            onClick={() => setMode("text")}
            icon={<FileText className="size-3.5" aria-hidden="true" />}
            label="텍스트"
          />
          <ViewModeButton
            active={mode === "image"}
            onClick={() => setMode("image")}
            icon={<ImageIcon className="size-3.5" aria-hidden="true" />}
            label="이미지"
          />
        </div>
      </div>
      {/* Body wrapper — relative parent for both the scroll container and
          the floating-controls overlay. Constraining the overlay to this
          wrapper (instead of the entire box) keeps the default controls
          position over the image area, not on top of the header toggle. */}
      <div className="relative flex min-h-0 min-w-0 flex-1">
        <div
          data-pannable-scroll
          className="absolute inset-0 overflow-auto px-4 py-3"
        >
          {mode === "text" ? (
            <div className="whitespace-pre-wrap text-[14px] leading-7 text-slate-800">
              <HighlightedRawText
                rawText={draft.rawText}
                teacherText={draft.teacherText}
                changes={changes}
                hoveredChangeId={hoveredChangeId}
                activeChangeId={activeChangeId}
                onHoverChange={onHoverChange}
                onSelectChange={onSelectChange}
              />
            </div>
          ) : (
            <ImagePages
              pages={pages}
              loading={loading}
              error={fetchError}
              expectedCount={draft.sourcePageIndex.length}
              overlayEl={overlayEl}
            />
          )}
        </div>
        {/* Overlay layer for floating controls — sits OUTSIDE the scroll
            container as a sibling, so children that portal here are not
            scrolled with the image. `pointer-events-none` lets clicks pass
            through except where the controls themselves opt back in. */}
        <div
          ref={setOverlayEl}
          className="pointer-events-none absolute inset-0 z-10"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function ViewModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded px-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
        (active
          ? "bg-white text-blue-700 shadow-sm"
          : "text-slate-500 hover:text-slate-800")
      }
    >
      {icon}
      {label}
    </button>
  );
}
