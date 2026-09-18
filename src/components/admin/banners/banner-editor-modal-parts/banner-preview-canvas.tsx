"use client";

import { Image as ImageIcon, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TEMPLATE_RENDERERS } from "@/components/site-banners/template-renderers";
import type { BannerDraft } from "./banner-editor-draft";
import { PreviewCanvas } from "./editor-widgets";

/** 앱 배너 편집기의 미리보기 — 실제 배너 모달과 같은 440px 카드. 이미지 배너는 드래그&드롭 업로드 영역을 겸한다. */
export function BannerPreviewCanvas({
  draft,
  zoom,
  onZoom,
  onLive,
  uploading,
  dragging,
  onDragging,
  onPickFile,
  onDropFile,
  dismissLabel,
}: {
  draft: BannerDraft;
  zoom: number;
  onZoom: (zoom: number) => void;
  onLive: () => void;
  uploading: boolean;
  dragging: boolean;
  onDragging: (v: boolean) => void;
  onPickFile: () => void;
  onDropFile: (file: File | undefined) => void;
  dismissLabel: string | null;
}) {
  const isImage = draft.type === "IMAGE";
  const PreviewRenderer = isImage ? undefined : TEMPLATE_RENDERERS[draft.templateKey];

  return (
    <PreviewCanvas
      zoom={zoom}
      baseZoom={0.9}
      onZoom={onZoom}
      onLive={onLive}
      liveLabel="실제 모달로 보기"
    >
      <div
        className={cn(
          "relative w-[440px] overflow-hidden rounded-2xl border bg-white shadow-[0_24px_70px_-18px_rgba(15,23,42,0.4)] transition-colors",
          dragging && isImage ? "border-blue-400 ring-2 ring-blue-200" : "border-gray-200",
        )}
        onDragOver={
          isImage
            ? (e) => {
                e.preventDefault();
                onDragging(true);
              }
            : undefined
        }
        onDragLeave={
          isImage
            ? (e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) onDragging(false);
              }
            : undefined
        }
        onDrop={
          isImage
            ? (e) => {
                e.preventDefault();
                onDragging(false);
                onDropFile(e.dataTransfer.files?.[0]);
              }
            : undefined
        }
      >
        {/* 닫기 X — 실제 배너와 같은 자리 */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute right-3.5 top-3.5 z-10 flex size-8 items-center justify-center rounded-full",
            isImage ? "bg-white/85 text-gray-600 shadow-sm backdrop-blur-sm" : "text-gray-400",
          )}
        >
          <X className="size-[18px]" />
        </span>

        {isImage ? (
          <>
            {draft.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.imageUrl} alt={draft.imageAlt} className="block h-auto w-full" />
            ) : (
              <Button
                variant="ghost"
                onClick={onPickFile}
                disabled={uploading}
                className="h-56 w-full flex-col gap-2 rounded-none text-gray-300 hover:bg-gray-50"
              >
                {uploading ? (
                  <Loader2 className="size-8 animate-spin text-gray-300" />
                ) : (
                  <ImageIcon className="size-8" />
                )}
                <span className="text-[13px] font-semibold text-gray-500">이미지를 업로드하세요</span>
                <span className="text-[11px] font-normal text-gray-400">
                  클릭하거나 파일을 여기로 드래그&드롭
                </span>
              </Button>
            )}
            {dismissLabel && (
              <div className="flex items-center justify-center border-t border-gray-100 py-2.5">
                <span className="text-[13px] font-medium text-gray-400">{dismissLabel}</span>
              </div>
            )}
          </>
        ) : PreviewRenderer ? (
          <>
            <div className="h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-400" />
            <div className="px-6 pb-6 pt-5">
              <PreviewRenderer
                content={draft.content}
                labelledById="preview-title"
                dismissLabel={dismissLabel}
                onDismiss={() => {}}
                initialStep={1}
              />
            </div>
          </>
        ) : null}

        {dragging && isImage && (
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 bg-blue-50/85 text-blue-600">
            <Upload className="size-7" />
            <span className="text-[13px] font-bold">여기에 놓아서 업로드</span>
          </div>
        )}
      </div>
    </PreviewCanvas>
  );
}
