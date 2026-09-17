"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Image as ImageIcon, LayoutTemplate, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminDialog, StatusBadge } from "@/components/admin/kit";
import { activeFlag } from "@/lib/admin-labels";
import { cn } from "@/lib/utils";
import {
  dismissButtonLabel,
  getTemplate,
  withTemplateDefaults,
  type BannerType,
} from "@/lib/site-banners/templates";
import type { SiteBannerView } from "@/lib/site-banners/types";
import { createBanner, updateBanner, type AdminBannerDto } from "@/actions/admin-banners";
import { BannerView } from "@/components/site-banners/banner-view";
import { BannerTargetPicker } from "./banner-target-picker";
import {
  draftFromDto,
  draftFromPrefill,
  localInputToIso,
  type BannerDraft,
  type BannerPrefill,
} from "./banner-editor-modal-parts/banner-editor-draft";
import { BannerPreviewCanvas } from "./banner-editor-modal-parts/banner-preview-canvas";
import {
  BannerSettingsPanel,
  type SettingsTab,
} from "./banner-editor-modal-parts/banner-settings-panel";

// 초안 모델·변환은 banner-editor-modal-parts/banner-editor-draft 가 원본이다.
export type { BannerPrefill };

const TYPE_OPTIONS: ReadonlyArray<{ value: BannerType; label: string; icon: typeof ImageIcon }> = [
  { value: "TEMPLATE", label: "템플릿", icon: LayoutTemplate },
  { value: "IMAGE", label: "이미지", icon: ImageIcon },
];

/**
 * 앱 진입 배너 편집기 — 왼쪽 미리보기 캔버스 + 오른쪽 설정 패널.
 * 미리보기(실제 모달)·대상 선택은 편집창 위에 겹쳐 뜨는 별도 레이어이고,
 * 그 레이어가 열려 있는 동안의 ESC·바깥 클릭은 편집창이 아니라 레이어만 닫는다.
 */
export function BannerEditorModal({
  open,
  onOpenChange,
  editing,
  onSaved,
  prefill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: AdminBannerDto | null;
  onSaved: () => void;
  /** 신규 작성 시 초기값(공지 → 배너 원클릭). editing 이 있으면 무시. */
  prefill?: BannerPrefill | null;
}) {
  const [draft, setDraft] = useState<BannerDraft>(() =>
    editing ? draftFromDto(editing) : prefill ? draftFromPrefill(prefill) : draftFromDto(null),
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [livePreview, setLivePreview] = useState(false);
  const [tab, setTab] = useState<SettingsTab>("edit");
  const [zoom, setZoom] = useState(0.9);
  const [editingTitle, setEditingTitle] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);

  // 제목 편집으로 바꾸는 순간 입력칸에 포커스.
  useEffect(() => {
    if (editingTitle) titleRef.current?.focus();
  }, [editingTitle]);

  // 편집창이 (다른) 배너로 열릴 때마다 초안을 다시 시드한다.
  const seededFor = useRef<string | null>(editing?.id ?? "__new__");
  const currentKey = editing?.id ?? (prefill ? "__prefill__" : "__new__");
  if (open && seededFor.current !== currentKey) {
    seededFor.current = currentKey;
    setDraft(
      editing ? draftFromDto(editing) : prefill ? draftFromPrefill(prefill) : draftFromDto(null),
    );
    setTab("edit");
    setZoom(0.9);
    setEditingTitle(false);
    setTargetPickerOpen(false);
  }

  const template = getTemplate(draft.templateKey);

  function patch(p: Partial<BannerDraft>) {
    setDraft((d) => ({ ...d, ...p }));
  }
  function patchContent(key: string, value: string) {
    setDraft((d) => ({ ...d, content: { ...d.content, [key]: value } }));
  }
  function selectTemplate(key: string) {
    setDraft((d) => ({ ...d, templateKey: key, content: withTemplateDefaults(key, d.content) }));
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/site-banners/upload", { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !data?.url) {
        toast.error(data?.error ?? "이미지 업로드에 실패했습니다");
        return;
      }
      patch({ imageUrl: data.url });
      toast.success("이미지를 업로드했어요");
    } catch {
      toast.error("이미지 업로드에 실패했습니다");
    } finally {
      setUploading(false);
    }
  }

  /** 클릭·파일 선택·드롭이 모두 거치는 검증 + 업로드. */
  function acceptFile(file: File | undefined | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 업로드할 수 있어요");
      return;
    }
    void handleUpload(file);
  }

  function openFilePicker() {
    fileRef.current?.click();
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        title: draft.title,
        type: draft.type,
        templateKey: draft.type === "TEMPLATE" ? draft.templateKey : null,
        content: draft.content,
        imageUrl: draft.type === "IMAGE" ? draft.imageUrl || null : null,
        imageAlt: draft.imageAlt || null,
        linkUrl: draft.linkUrl || "",
        audiences: draft.audiences,
        priority: Number(draft.priority) || 0,
        isActive: draft.isActive,
        dismissMode: draft.dismissMode,
        showDismissButton: draft.showDismissButton,
        targetMode: draft.targetMode,
        targetAcademyIds: draft.targetAcademyIds,
        startsAt: localInputToIso(draft.startsAt) || "",
        endsAt: localInputToIso(draft.endsAt) || "",
        autoOpenOnLowCredit: draft.autoOpenOnLowCredit,
      };
      const result = editing ? await updateBanner(editing.id, payload) : await createBanner(payload);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(editing ? "배너를 수정했어요" : "배너를 만들었어요");
      onOpenChange(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  // 현재 초안으로 "실제 모달로 보기" 용 배너 뷰를 합성한다.
  const previewBanner = useMemo<SiteBannerView>(
    () => ({
      id: "preview",
      type: draft.type,
      templateKey: draft.type === "TEMPLATE" ? draft.templateKey : null,
      content: draft.content,
      imageUrl: draft.imageUrl || null,
      imageAlt: draft.imageAlt || null,
      linkUrl: draft.linkUrl || null,
      dismissMode: draft.dismissMode,
      showDismissButton: draft.showDismissButton,
      priority: draft.priority,
      version: "preview",
      forceShow: true,
    }),
    [draft],
  );

  const previewDismissLabel = draft.showDismissButton ? dismissButtonLabel(draft.dismissMode) : null;

  return (
    <>
      <AdminDialog
        open={open}
        onOpenChange={(next) => {
          // 겹친 레이어가 열려 있으면 ESC·바깥 클릭은 그 레이어만 닫는다.
          if (!next && (livePreview || targetPickerOpen)) {
            if (livePreview) setLivePreview(false);
            return;
          }
          onOpenChange(next);
        }}
        size="xl"
        title={editing ? "배너 수정" : "새 배너"}
        description="앱(로그인 사용자) 진입 배너의 문구·이미지와 노출 조건을 설정합니다."
        bodyClassName="flex h-[min(70dvh,620px)] flex-col overflow-hidden p-0"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              취소
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              {editing ? "저장" : "만들기"}
            </Button>
          </>
        }
      >
        {/* 숨은 파일 입력 하나 — 설정 패널의 업로드 버튼과 미리보기 드롭존이 함께 쓴다. */}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            acceptFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        {/* 관리용 제목(제자리 편집) · 노출 상태 · 배너 종류 */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-2.5">
          {editingTitle ? (
            <Input
              ref={titleRef}
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") {
                  e.preventDefault();
                  setEditingTitle(false);
                }
              }}
              placeholder="배너 제목 (관리용)"
              aria-label="배너 제목 (관리용)"
              className="h-8 w-full max-w-[280px] text-[13px]"
            />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditingTitle(true)}
              title="관리용 제목 수정"
              className="max-w-[280px] px-2 text-[13px] font-semibold text-gray-900"
            >
              <span className={cn("truncate", !draft.title && "font-medium text-gray-400")}>
                {draft.title || "배너 제목 (관리용)"}
              </span>
              <Pencil className="size-3.5 text-gray-400" />
            </Button>
          )}
          <StatusBadge status={activeFlag(draft.isActive)} />

          <div className="ml-auto flex shrink-0 items-center gap-1">
            {TYPE_OPTIONS.map(({ value, label, icon: Icon }) => {
              const selected = draft.type === value;
              return (
                <Button
                  key={value}
                  variant="outline"
                  size="sm"
                  aria-pressed={selected}
                  onClick={() => patch({ type: value })}
                  className={cn(
                    "text-[12px]",
                    selected
                      ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-50 hover:text-blue-700"
                      : "text-gray-500",
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </Button>
              );
            })}
          </div>
        </div>

        {/* 미리보기 캔버스 + 설정 패널 */}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <BannerPreviewCanvas
            draft={draft}
            zoom={zoom}
            onZoom={setZoom}
            onLive={() => setLivePreview(true)}
            uploading={uploading}
            dragging={dragging}
            onDragging={setDragging}
            onPickFile={openFilePicker}
            onDropFile={acceptFile}
            dismissLabel={previewDismissLabel}
          />
          <BannerSettingsPanel
            draft={draft}
            template={template}
            tab={tab}
            onTab={setTab}
            patch={patch}
            patchContent={patchContent}
            selectTemplate={selectTemplate}
            uploading={uploading}
            onPickFile={openFilePicker}
            onOpenTargetPicker={() => setTargetPickerOpen(true)}
          />
        </div>
      </AdminDialog>

      {/* 편집창 위에 겹치는 레이어 — 편집창 바깥(z-[120]·별도 팝업)이라야 화면 전체를 덮는다. */}
      {livePreview && (
        <BannerView banner={previewBanner} open onDismiss={() => setLivePreview(false)} />
      )}

      <BannerTargetPicker
        open={targetPickerOpen}
        onOpenChange={setTargetPickerOpen}
        audiences={draft.audiences}
        targetMode={draft.targetMode}
        selectedIds={draft.targetAcademyIds}
        onConfirm={(sel) =>
          patch({
            audiences: sel.audiences,
            targetMode: sel.targetMode,
            targetAcademyIds: sel.academyIds,
          })
        }
      />
    </>
  );
}
