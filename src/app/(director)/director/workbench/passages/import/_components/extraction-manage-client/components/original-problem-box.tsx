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
  // 추출 소스 타입을 주면 텍스트/이미지 토글을 숨기고 소스에 맞는 단일 뷰만
  // 보여준다: "TEXT" → 텍스트, "PDF"/"IMAGES" → 원본 이미지. 미지정(null/undefined)
  // 이면 토글을 유지한다(검수 비교에서 복원 변경점을 텍스트로 확인해야 하므로).
  sourceType?: string | null;
}

export function OriginalProblemBox({
  draft,
  changes,
  hoveredChangeId,
  activeChangeId,
  onHoverChange,
  onSelectChange,
  sourceType,
}: OriginalProblemBoxProps) {
  // 소스 타입이 주어지면 그에 맞는 단일 모드로 고정하고 토글을 감춘다.
  const lockedMode: ViewMode | null =
    sourceType == null ? null : sourceType === "TEXT" ? "text" : "image";
  const [mode, setMode] = useState<ViewMode>(lockedMode ?? "text");
  const effectiveMode = lockedMode ?? mode;
  const showToggle = lockedMode === null;
  const [pages, setPages] = useState<PageImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Ref-as-state so the image carousel can portal its zoom/page controls
  // into the header's right slot (instead of floating over the image).
  const [headerControlsEl, setHeaderControlsEl] =
    useState<HTMLDivElement | null>(null);

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
    if (effectiveMode !== "image") return;
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
  }, [draft.jobId, indicesKey, effectiveMode, pages.length]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col rounded-lg border border-slate-200 bg-white">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4">
        <span className="text-[13px] font-bold text-slate-900">
          문제 원문
        </span>
        <div className="flex items-center gap-2">
          {showToggle && (
            <div className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5">
              <ViewModeButton
                active={mode === "text"}
                onClick={() => setMode("text")}
                icon={<FileText className="size-3" aria-hidden="true" />}
                label="텍스트"
              />
              <ViewModeButton
                active={mode === "image"}
                onClick={() => setMode("image")}
                icon={<ImageIcon className="size-3" aria-hidden="true" />}
                label="이미지"
              />
            </div>
          )}
          {/* 이미지 모드 줌/페이지 컨트롤이 portal 되는 헤더 우측 슬롯. */}
          <div ref={setHeaderControlsEl} className="inline-flex items-center" />
        </div>
      </div>
      {/* Body wrapper — relative parent for the scroll container. The
          zoom/page controls now live in the header (portaled to the
          header slot), not floating over the image. */}
      <div className="relative flex min-h-0 min-w-0 flex-1">
        <div
          data-pannable-scroll
          className="absolute inset-0 overflow-auto px-4 py-3"
        >
          {effectiveMode === "text" ? (
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
              controlsEl={headerControlsEl}
            />
          )}
        </div>
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
        "inline-flex h-6 cursor-pointer items-center gap-1 rounded px-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
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
