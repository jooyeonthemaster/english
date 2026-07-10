"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Loader2, Maximize2, Minus, Plus, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LandingPopupItem } from "@/lib/platform-settings";
import { LandingPopupCardView } from "@/components/landing/landing-popup-view";

const FIELD_LABEL = "block text-[12px] font-semibold text-slate-600 mb-1";
const FIELD_INPUT =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

interface Draft {
  enabled: boolean;
  eyebrow: string;
  title: string;
  text: string;
  imageUrl: string;
  href: string;
  ctaLabel: string;
}

function draftFrom(editing: LandingPopupItem | null): Draft {
  return {
    enabled: editing?.enabled ?? true,
    eyebrow: editing?.eyebrow ?? "",
    title: editing?.title ?? "",
    text: editing?.text ?? "",
    imageUrl: editing?.imageUrl ?? "",
    href: editing?.href ?? "/seminar",
    ctaLabel: editing?.ctaLabel ?? "자세히 보기",
  };
}

/** 랜딩 팝업 1건 편집 모달 — 좌측 실시간 미리보기 + 우측 편집 폼(앱 배너 편집기와 동일 구조). */
export function LandingPopupEditorModal({
  open,
  onOpenChange,
  editing,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: LandingPopupItem | null;
  onSave: (item: LandingPopupItem) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(editing));
  const [uploading, setUploading] = useState(false);
  const [zoom, setZoom] = useState(0.9);
  const [livePreview, setLivePreview] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 열릴 때(또는 다른 항목으로 바뀔 때) draft 재시드.
  const seededFor = useRef<string | null>(null);
  const currentKey = editing?.id ?? "__new__";
  if (open && seededFor.current !== currentKey) {
    seededFor.current = currentKey;
    setDraft(draftFrom(editing));
    setZoom(0.9);
    setLivePreview(false);
  }
  useEffect(() => {
    if (!open) seededFor.current = null;
  }, [open]);

  function patch(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  async function handleUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 업로드할 수 있어요.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/site-banners/upload", { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !data?.url) {
        toast.error(data?.error ?? "이미지 업로드에 실패했습니다.");
        return;
      }
      patch({ imageUrl: data.url });
      toast.success("이미지를 업로드했어요.");
    } catch {
      toast.error("이미지 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    if (draft.enabled && !draft.title.trim() && !draft.text.trim() && !draft.imageUrl.trim()) {
      toast.error("제목·문구·이미지 중 하나는 입력하세요.");
      return;
    }
    onSave({
      id: editing?.id ?? `pop_${Math.random().toString(36).slice(2, 10)}`,
      enabled: draft.enabled,
      eyebrow: draft.eyebrow.trim(),
      title: draft.title.trim(),
      text: draft.text.trim(),
      imageUrl: draft.imageUrl.trim(),
      href: draft.href.trim(),
      ctaLabel: draft.ctaLabel.trim() || "자세히 보기",
    });
  }

  const previewPopup = useMemo(
    () => ({
      eyebrow: draft.eyebrow,
      title: draft.title,
      text: draft.text,
      imageUrl: draft.imageUrl,
      href: draft.href,
      ctaLabel: draft.ctaLabel,
    }),
    [draft],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[calc(100dvh-3rem)] w-[calc(100vw-3rem)] max-w-[1080px] flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-3rem)] sm:max-w-[1080px] sm:p-0"
          onInteractOutside={(e) => {
            if (livePreview) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (livePreview) e.preventDefault();
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
              e.target.value = "";
            }}
          />

          {/* Header */}
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 py-3 pl-5 pr-4">
            <DialogTitle className="min-w-0 truncate text-[15px] font-bold text-slate-900">
              {editing ? "팝업 수정" : "새 팝업"}
            </DialogTitle>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold",
                draft.enabled ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400",
              )}
            >
              {draft.enabled ? "노출 중" : "비활성"}
            </span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="닫기"
              className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Body: preview canvas + form */}
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            {/* ── Preview canvas ── */}
            <section className="relative flex min-h-[240px] min-w-0 flex-1 flex-col bg-slate-100/70">
              <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white/70 px-4 py-2 backdrop-blur-sm">
                <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-slate-500">
                  <Eye className="size-3.5" />
                  미리보기
                </span>
                <button
                  type="button"
                  onClick={() => setLivePreview(true)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold text-blue-600 transition-colors hover:bg-blue-50"
                >
                  <Maximize2 className="size-3.5" />
                  실제 모달로 보기
                </button>
              </div>

              <div className="relative min-h-0 flex-1 overflow-auto">
                {/* Zoom controls */}
                <div className="pointer-events-auto absolute right-4 top-4 z-20 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white/95 p-1 shadow-md backdrop-blur-sm">
                  <ZoomBtn
                    label="축소"
                    onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
                    disabled={zoom <= 0.5}
                  >
                    <Minus className="size-4" />
                  </ZoomBtn>
                  <button
                    type="button"
                    onClick={() => setZoom(0.9)}
                    disabled={zoom === 0.9}
                    title="원래 크기"
                    className="inline-flex h-6 min-w-[42px] items-center justify-center rounded px-1.5 text-[11px] font-bold tabular-nums text-slate-700 transition-colors hover:bg-slate-100 disabled:text-slate-400 disabled:hover:bg-transparent"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <ZoomBtn
                    label="확대"
                    onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}
                    disabled={zoom >= 1.5}
                  >
                    <Plus className="size-4" />
                  </ZoomBtn>
                </div>

                <div className="flex min-h-full items-start justify-center p-8">
                  <div
                    className="w-[440px] transition-transform duration-150"
                    style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f) void handleUpload(f);
                    }}
                  >
                    <div
                      className={cn(
                        "rounded-2xl transition-shadow",
                        dragging && "ring-2 ring-blue-300 ring-offset-2",
                      )}
                    >
                      <LandingPopupCardView popup={previewPopup} />
                    </div>
                    {dragging && (
                      <p className="mt-2 text-center text-[12px] font-bold text-blue-600">
                        <Upload className="mr-1 inline size-3.5" />
                        여기에 놓아서 이미지 업로드
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* ── Form panel ── */}
            <aside className="flex w-full shrink-0 flex-col border-t border-slate-200 bg-white md:w-[360px] md:border-l md:border-t-0">
              {/* 활성 토글 */}
              <div className="shrink-0 border-b border-slate-200 px-4 py-3">
                <button
                  type="button"
                  onClick={() => patch({ enabled: !draft.enabled })}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-slate-800">노출 활성화</span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-400">
                      끄면 저장돼도 랜딩에 뜨지 않아요.
                    </span>
                  </span>
                  <span
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                      draft.enabled ? "bg-blue-600" : "bg-slate-300",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
                        draft.enabled ? "translate-x-[22px]" : "translate-x-0.5",
                      )}
                    />
                  </span>
                </button>
              </div>

              {/* Scrollable fields */}
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                {/* 이미지 */}
                <div>
                  <label className={FIELD_LABEL}>팝업 이미지 (선택)</label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                    >
                      {uploading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Upload className="size-4" />
                      )}
                      {draft.imageUrl ? "이미지 교체" : "이미지 업로드"}
                    </button>
                    {draft.imageUrl && (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={draft.imageUrl}
                          alt=""
                          className="h-11 w-11 rounded-md border border-slate-200 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => patch({ imageUrl: "" })}
                          className="text-[12px] font-semibold text-slate-400 hover:text-rose-600"
                        >
                          제거
                        </button>
                      </>
                    )}
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    미리보기 카드에 파일을 드래그&드롭해도 업로드됩니다. JPG·PNG, 5MB 이하.
                  </p>
                </div>

                {/* 상단 태그 */}
                <div>
                  <label className={FIELD_LABEL}>상단 태그 (선택)</label>
                  <input
                    className={FIELD_INPUT}
                    value={draft.eyebrow}
                    onChange={(e) => patch({ eyebrow: e.target.value })}
                    placeholder="예: 공지 · 이벤트"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    제목 위 파란 칩(📣)으로 표시됩니다.
                  </p>
                </div>

                {/* 제목 */}
                <div>
                  <label className={FIELD_LABEL}>제목 (선택)</label>
                  <input
                    className={FIELD_INPUT}
                    value={draft.title}
                    onChange={(e) => patch({ title: e.target.value })}
                    placeholder="예: 단체 세미나 모집"
                  />
                </div>

                {/* 문구 */}
                <div>
                  <label className={FIELD_LABEL}>문구 (선택)</label>
                  <textarea
                    className={cn(FIELD_INPUT, "min-h-[80px] resize-y")}
                    value={draft.text}
                    onChange={(e) => patch({ text: e.target.value })}
                    placeholder="예: 스모트 AI 활용 세미나 · 선착순 신청"
                  />
                </div>

                {/* 버튼 문구 */}
                <div>
                  <label className={FIELD_LABEL}>버튼 문구</label>
                  <input
                    className={FIELD_INPUT}
                    value={draft.ctaLabel}
                    onChange={(e) => patch({ ctaLabel: e.target.value })}
                    placeholder="자세히 보기"
                  />
                </div>

                {/* 버튼 링크 */}
                <div>
                  <label className={FIELD_LABEL}>버튼 링크</label>
                  <input
                    className={FIELD_INPUT}
                    value={draft.href}
                    onChange={(e) => patch({ href: e.target.value })}
                    placeholder="/seminar"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    비우면 버튼이 표시되지 않습니다. <b>/seminar</b>로 두면 단체 세미나 신청으로
                    연결됩니다.
                  </p>
                </div>
              </div>
            </aside>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              취소
            </Button>
            <Button onClick={submit} disabled={saving || uploading}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              저장
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 실제 모달로 보기 — 랜딩과 동일한 오버레이 */}
      {livePreview && (
        <div
          className="pointer-events-auto fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/50 px-4 py-6 backdrop-blur-[3px]"
          onClick={() => setLivePreview(false)}
        >
          <div className="w-full max-w-[440px]" onClick={(e) => e.stopPropagation()}>
            <LandingPopupCardView
              popup={previewPopup}
              interactive
              disableLink
              onClose={() => setLivePreview(false)}
              onDismissToday={() => setLivePreview(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}

function ZoomBtn({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="inline-flex size-6 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
