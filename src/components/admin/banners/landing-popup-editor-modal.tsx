"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdminDialog, StatusBadge } from "@/components/admin/kit";
import { activeFlag } from "@/lib/admin-labels";
import { cn } from "@/lib/utils";
import type { LandingPopupItem } from "@/lib/platform-settings";
import { LandingPopupCardView } from "@/components/landing/landing-popup-view";
import {
  Field,
  PreviewCanvas,
  SectionLabel,
  ToggleRow,
} from "./banner-editor-modal-parts/editor-widgets";

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

/** 랜딩 팝업 1건 편집 — 좌측 실시간 미리보기 + 우측 편집 폼(앱 배너 편집기와 동일 구조). */
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
      <AdminDialog
        open={open}
        onOpenChange={(next) => {
          // "실제 모달로 보기" 레이어가 떠 있으면 ESC·바깥 클릭은 그 레이어만 닫는다.
          if (!next && livePreview) {
            setLivePreview(false);
            return;
          }
          onOpenChange(next);
        }}
        size="lg"
        title={
          <span className="flex items-center gap-2">
            {editing ? "팝업 수정" : "새 팝업"}
            <StatusBadge status={activeFlag(draft.enabled)} />
          </span>
        }
        description="홈(/) 진입 시 뜨는 팝업의 이미지·문구·버튼을 설정합니다."
        bodyClassName="flex h-[min(70dvh,600px)] flex-col overflow-hidden p-0 md:flex-row"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              취소
            </Button>
            <Button size="sm" onClick={submit} disabled={saving || uploading}>
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              저장
            </Button>
          </>
        }
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

        <PreviewCanvas
          zoom={zoom}
          baseZoom={0.9}
          onZoom={setZoom}
          onLive={() => setLivePreview(true)}
          liveLabel="실제 모달로 보기"
          frameClassName="w-[440px] max-w-full"
          frameProps={{
            onDragOver: (e) => {
              e.preventDefault();
              setDragging(true);
            },
            onDragLeave: (e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
            },
            onDrop: (e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void handleUpload(f);
            },
          }}
        >
          <div className={cn("rounded-2xl transition-shadow", dragging && "ring-2 ring-blue-300 ring-offset-2")}>
            <LandingPopupCardView popup={previewPopup} />
          </div>
          {dragging && (
            <p className="mt-2 text-center text-[12px] font-semibold text-blue-600">
              <Upload className="mr-1 inline size-3.5" />
              여기에 놓아서 이미지 업로드
            </p>
          )}
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
            <div>
              <SectionLabel>팝업 이미지 (선택)</SectionLabel>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  {draft.imageUrl ? "이미지 교체" : "이미지 업로드"}
                </Button>
                {draft.imageUrl && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={draft.imageUrl}
                      alt=""
                      className="size-11 rounded-md border border-gray-200 object-cover"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => patch({ imageUrl: "" })}
                      className="text-[12px] text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      제거
                    </Button>
                  </>
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-gray-400">
                미리보기 카드에 파일을 드래그&드롭해도 업로드됩니다. JPG·PNG, 5MB 이하.
              </p>
            </div>

            <Field label="상단 태그 (선택)" hint="제목 위 파란 칩(📣)으로 표시됩니다.">
              <Input
                value={draft.eyebrow}
                onChange={(e) => patch({ eyebrow: e.target.value })}
                placeholder="예: 공지 · 이벤트"
                className="text-[13px]"
              />
            </Field>

            <Field label="제목 (선택)">
              <Input
                value={draft.title}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder="예: 단체 세미나 모집"
                className="text-[13px]"
              />
            </Field>

            <Field label="문구 (선택)">
              <Textarea
                value={draft.text}
                onChange={(e) => patch({ text: e.target.value })}
                placeholder="예: 스모트 AI 활용 세미나 · 선착순 신청"
                className="min-h-[80px] resize-y text-[13px]"
              />
            </Field>

            <Field label="버튼 문구">
              <Input
                value={draft.ctaLabel}
                onChange={(e) => patch({ ctaLabel: e.target.value })}
                placeholder="자세히 보기"
                className="text-[13px]"
              />
            </Field>

            <Field
              label="버튼 링크"
              hint={
                <>
                  비우면 버튼이 표시되지 않습니다. <b>/seminar</b>로 두면 단체 세미나 신청으로
                  연결됩니다.
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

      {/* 실제 모달로 보기 — 랜딩과 동일한 오버레이(편집창 위에 겹치는 레이어) */}
      {livePreview && (
        <div
          className="pointer-events-auto fixed inset-0 z-[130] flex items-center justify-center bg-gray-900/50 px-4 py-6 backdrop-blur-[3px]"
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
