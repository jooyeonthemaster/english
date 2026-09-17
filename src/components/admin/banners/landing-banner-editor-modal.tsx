"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminDialog, StatusBadge } from "@/components/admin/kit";
import { activeFlag } from "@/lib/admin-labels";
import type { LandingBannerItem } from "@/lib/platform-settings";
import {
  LandingBannerStripInner,
  LandingBannerStripPreview,
} from "@/components/landing/landing-banner-strip-view";
import { Field, PreviewCanvas, ToggleRow } from "./banner-editor-modal-parts/editor-widgets";

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

/** 랜딩 헤더 배너 1건 편집 — 좌측 실시간 스트립 미리보기 + 우측 편집 폼(팝업 편집기와 동일 구조). */
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
      <AdminDialog
        open={open}
        onOpenChange={(next) => {
          // "실제 위치로 보기" 레이어가 떠 있으면 ESC·바깥 클릭은 그 레이어만 닫는다.
          if (!next && livePreview) {
            setLivePreview(false);
            return;
          }
          onOpenChange(next);
        }}
        size="lg"
        title={
          <span className="flex items-center gap-2">
            {editing ? "헤더 배너 수정" : "새 헤더 배너"}
            <StatusBadge status={activeFlag(draft.enabled)} />
          </span>
        }
        description="홈(/) 최상단 스트립 배너의 문구·버튼·링크를 설정합니다."
        bodyClassName="flex h-[min(70dvh,560px)] flex-col overflow-hidden p-0 md:flex-row"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              취소
            </Button>
            <Button size="sm" onClick={submit} disabled={saving}>
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              저장
            </Button>
          </>
        }
      >
        <PreviewCanvas
          zoom={zoom}
          baseZoom={1}
          onZoom={setZoom}
          onLive={() => setLivePreview(true)}
          liveLabel="실제 위치로 보기"
          frameClassName="w-[720px] max-w-full"
        >
          {/* 브라우저 상단에 붙은 스트립처럼 보이는 목업 */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <LandingBannerStripPreview banner={previewBanner} />
            <div className="space-y-2 p-5">
              <div className="h-2.5 w-24 rounded bg-gray-200" />
              <div className="h-2 w-2/3 rounded bg-gray-100" />
              <div className="h-2 w-1/2 rounded bg-gray-100" />
            </div>
          </div>
        </PreviewCanvas>

        <aside className="flex w-full shrink-0 flex-col border-t border-gray-100 bg-white md:w-[320px] md:border-l md:border-t-0">
          <div className="shrink-0 border-b border-gray-100 px-4 py-3">
            <ToggleRow
              label="노출 활성화"
              desc="끄면 저장돼도 랜딩에 뜨지 않아요."
              checked={draft.enabled}
              onChange={(v) => patch({ enabled: v })}
            />
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <Field label="배너 문구">
              <Input
                value={draft.text}
                onChange={(e) => patch({ text: e.target.value })}
                placeholder="예: 단체 세미나 모집 중! 스모트 AI 활용 세미나"
                className="text-[13px]"
              />
            </Field>
            <Field label="버튼 텍스트">
              <Input
                value={draft.ctaLabel}
                onChange={(e) => patch({ ctaLabel: e.target.value })}
                placeholder="신청하기"
                className="text-[13px]"
              />
            </Field>
            <Field
              label="이동 링크"
              hint={
                <>
                  <b>/seminar</b>로 두면 비회원 단체 세미나 신청 페이지로 연결됩니다.
                </>
              }
            >
              <Input
                value={draft.href}
                onChange={(e) => patch({ href: e.target.value })}
                placeholder="/seminar"
                className="text-[13px]"
              />
            </Field>
          </div>
        </aside>
      </AdminDialog>

      {/* 실제 위치로 보기 — 화면 최상단에 스트립을 고정 노출(편집창 위에 겹치는 레이어) */}
      {livePreview && (
        <div
          className="pointer-events-auto fixed inset-0 z-[130] bg-gray-900/40 backdrop-blur-[2px]"
          onClick={() => setLivePreview(false)}
        >
          <div
            className="relative flex h-11 items-center justify-center gap-2 bg-gray-950 px-12 text-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <LandingBannerStripInner banner={previewBanner} placeholder />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setLivePreview(false)}
              aria-label="미리보기 닫기"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full text-white/70 hover:bg-white/15 hover:text-white"
            >
              <X className="size-4" />
            </Button>
          </div>
          <p className="pointer-events-none mt-3 text-center text-[12px] font-medium text-white/80">
            실제 랜딩 최상단 노출 위치입니다 · 바깥을 누르면 닫힙니다
          </p>
        </div>
      )}
    </>
  );
}
