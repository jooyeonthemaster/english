"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Loader2, Maximize2, Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LandingBannerItem } from "@/lib/platform-settings";
import {
  LandingBannerStripInner,
  LandingBannerStripPreview,
} from "@/components/landing/landing-banner-strip-view";

const FIELD_LABEL = "block text-[12px] font-semibold text-slate-600 mb-1";
const FIELD_INPUT =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

interface Draft {
  enabled: boolean;
  text: string;
  href: string;
  ctaLabel: string;
}

function draftFrom(editing: LandingBannerItem | null): Draft {
  return {
    enabled: editing?.enabled ?? true,
    text: editing?.text ?? "",
    href: editing?.href ?? "/seminar",
    ctaLabel: editing?.ctaLabel ?? "신청하기",
  };
}

/** 랜딩 헤더 배너 1건 편집 모달 — 좌측 실시간 스트립 미리보기 + 우측 편집 폼(팝업 편집기와 동일 구조). */
export function LandingBannerEditorModal({
  open,
  onOpenChange,
  editing,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: LandingBannerItem | null;
  onSave: (item: LandingBannerItem) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(editing));
  const [zoom, setZoom] = useState(1);
  const [livePreview, setLivePreview] = useState(false);

  const seededFor = useRef<string | null>(null);
  const currentKey = editing?.id ?? "__new__";
  if (open && seededFor.current !== currentKey) {
    seededFor.current = currentKey;
    setDraft(draftFrom(editing));
    setZoom(1);
    setLivePreview(false);
  }
  useEffect(() => {
    if (!open) seededFor.current = null;
  }, [open]);

  function patch(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function submit() {
    if (draft.enabled && !draft.text.trim()) {
      toast.error("배너 문구를 입력하세요.");
      return;
    }
    onSave({
      id: editing?.id ?? `ban_${Math.random().toString(36).slice(2, 10)}`,
      enabled: draft.enabled,
      text: draft.text.trim(),
      href: draft.href.trim() || "/seminar",
      ctaLabel: draft.ctaLabel.trim() || "신청하기",
    });
  }

  const previewBanner = useMemo(
    () => ({ text: draft.text, ctaLabel: draft.ctaLabel }),
    [draft.text, draft.ctaLabel],
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
          {/* Header */}
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 py-3 pl-5 pr-4">
            <DialogTitle className="min-w-0 truncate text-[15px] font-bold text-slate-900">
              {editing ? "헤더 배너 수정" : "새 헤더 배너"}
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
            <section className="relative flex min-h-[200px] min-w-0 flex-1 flex-col bg-slate-100/70">
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
                  실제 위치로 보기
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
                    onClick={() => setZoom(1)}
                    disabled={zoom === 1}
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

                {/* 브라우저 상단에 붙은 스트립처럼 보이는 목업 */}
                <div className="flex min-h-full items-start justify-center p-8">
                  <div
                    className="w-[720px] max-w-full transition-transform duration-150"
                    style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
                  >
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                      <LandingBannerStripPreview banner={previewBanner} />
                      {/* 아래는 페이지 상단을 암시하는 옅은 목업 */}
                      <div className="space-y-2 p-5">
                        <div className="h-2.5 w-24 rounded bg-slate-200" />
                        <div className="h-2 w-2/3 rounded bg-slate-100" />
                        <div className="h-2 w-1/2 rounded bg-slate-100" />
                      </div>
                    </div>
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
                {/* 배너 문구 */}
                <div>
                  <label className={FIELD_LABEL}>배너 문구</label>
                  <input
                    className={FIELD_INPUT}
                    value={draft.text}
                    onChange={(e) => patch({ text: e.target.value })}
                    placeholder="예: 단체 세미나 모집 중! 스모트 AI 활용 세미나"
                  />
                </div>

                {/* 버튼 텍스트 */}
                <div>
                  <label className={FIELD_LABEL}>버튼 텍스트</label>
                  <input
                    className={FIELD_INPUT}
                    value={draft.ctaLabel}
                    onChange={(e) => patch({ ctaLabel: e.target.value })}
                    placeholder="신청하기"
                  />
                </div>

                {/* 이동 링크 */}
                <div>
                  <label className={FIELD_LABEL}>이동 링크</label>
                  <input
                    className={FIELD_INPUT}
                    value={draft.href}
                    onChange={(e) => patch({ href: e.target.value })}
                    placeholder="/seminar"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    <b>/seminar</b>로 두면 비회원 단체 세미나 신청 페이지로 연결됩니다.
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
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              저장
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 실제 위치로 보기 — 화면 최상단에 스트립을 고정 노출 */}
      {livePreview && (
        <div
          className="pointer-events-auto fixed inset-0 z-[130] bg-slate-900/40 backdrop-blur-[2px]"
          onClick={() => setLivePreview(false)}
        >
          <div
            className="relative flex h-11 items-center justify-center gap-2 bg-slate-950 px-12 text-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <LandingBannerStripInner banner={previewBanner} placeholder />
            <button
              type="button"
              onClick={() => setLivePreview(false)}
              aria-label="미리보기 닫기"
              className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/15 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="pointer-events-none mt-3 text-center text-[12px] font-medium text-white/80">
            실제 랜딩 최상단 노출 위치입니다 · 바깥을 누르면 닫힙니다
          </p>
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
