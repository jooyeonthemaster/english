"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Clock,
  Eye,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  Maximize2,
  Minus,
  Pencil,
  Plus,
  Upload,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AUDIENCE_LABELS,
  BANNER_TEMPLATES,
  DISMISS_MODES,
  dismissButtonLabel,
  getTemplate,
  withTemplateDefaults,
  type BannerAudience,
  type BannerDismissMode,
  type BannerType,
} from "@/lib/site-banners/templates";
import type { SiteBannerView } from "@/lib/site-banners/types";
import { createBanner, updateBanner } from "@/actions/admin-banners";
import type { AdminBannerDto } from "@/actions/admin-banners";
import { BannerView } from "@/components/site-banners/banner-view";
import { TEMPLATE_RENDERERS } from "@/components/site-banners/template-renderers";
import { BannerTargetPicker } from "./banner-target-picker";

interface Draft {
  title: string;
  type: BannerType;
  templateKey: string;
  content: Record<string, string>;
  imageUrl: string;
  imageAlt: string;
  linkUrl: string;
  audiences: BannerAudience[];
  priority: number;
  isActive: boolean;
  dismissMode: BannerDismissMode;
  showDismissButton: boolean;
  targetMode: "ALL" | "SPECIFIC";
  targetAcademyIds: string[];
  startsAt: string;
  endsAt: string;
  autoOpenOnLowCredit: boolean;
}

// ── ISO ↔ datetime-local input ─────────────────────────────────────────────
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function draftFromDto(dto: AdminBannerDto | null): Draft {
  if (!dto) {
    return {
      title: "",
      type: "TEMPLATE",
      templateKey: "announcement",
      content: { ...(getTemplate("announcement")?.defaultContent ?? {}) },
      imageUrl: "",
      imageAlt: "",
      linkUrl: "",
      audiences: ["DIRECTOR"],
      priority: 0,
      isActive: false,
      dismissMode: "DAILY",
      showDismissButton: true,
      targetMode: "ALL",
      targetAcademyIds: [],
      startsAt: "",
      endsAt: "",
      autoOpenOnLowCredit: false,
    };
  }
  return {
    title: dto.title,
    type: dto.type,
    templateKey: dto.templateKey ?? "announcement",
    content: withTemplateDefaults(dto.templateKey, dto.content),
    imageUrl: dto.imageUrl ?? "",
    imageAlt: dto.imageAlt ?? "",
    linkUrl: dto.linkUrl ?? "",
    audiences: dto.audiences.length ? dto.audiences : ["DIRECTOR"],
    priority: dto.priority,
    isActive: dto.isActive,
    dismissMode: dto.dismissMode,
    showDismissButton: dto.showDismissButton,
    targetMode: dto.targetMode,
    targetAcademyIds: dto.targetAcademyIds,
    startsAt: isoToLocalInput(dto.startsAt),
    endsAt: isoToLocalInput(dto.endsAt),
    autoOpenOnLowCredit: dto.autoOpenOnLowCredit,
  };
}

const FIELD_LABEL = "block text-[12px] font-semibold text-slate-600 mb-1";
const FIELD_INPUT =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

export function BannerEditorModal({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: AdminBannerDto | null;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFromDto(editing));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [livePreview, setLivePreview] = useState(false);
  const [tab, setTab] = useState<"edit" | "settings">("edit");
  const [zoom, setZoom] = useState(0.9);
  const [editingTitle, setEditingTitle] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);

  // Focus the title input the moment editing is turned on.
  useEffect(() => {
    if (editingTitle) titleRef.current?.focus();
  }, [editingTitle]);

  // Re-seed the draft whenever the editor opens for a (different) banner.
  const seededFor = useRef<string | null>(editing?.id ?? "__new__");
  const currentKey = editing?.id ?? "__new__";
  if (open && seededFor.current !== currentKey) {
    seededFor.current = currentKey;
    setDraft(draftFromDto(editing));
    setTab("edit");
    setZoom(0.9);
    setEditingTitle(false);
    setTargetPickerOpen(false);
  }

  const template = getTemplate(draft.templateKey);

  function patch(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }));
  }
  function patchContent(key: string, value: string) {
    setDraft((d) => ({ ...d, content: { ...d.content, [key]: value } }));
  }
  function selectTemplate(key: string) {
    setDraft((d) => ({
      ...d,
      templateKey: key,
      content: withTemplateDefaults(key, d.content),
    }));
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

  /** Validate + upload a picked/dropped file (used by click, input, and drop). */
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
      const result = editing
        ? await updateBanner(editing.id, payload)
        : await createBanner(payload);
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

  // Synthesize a SiteBannerView for the preview from the current draft.
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

  const PreviewRenderer =
    draft.type === "TEMPLATE" ? TEMPLATE_RENDERERS[draft.templateKey] : undefined;
  const previewDismissLabel = draft.showDismissButton
    ? dismissButtonLabel(draft.dismissMode)
    : null;
  const showLowCreditOption = draft.audiences.includes("DIRECTOR");

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="flex h-[calc(100dvh-3rem)] w-[calc(100vw-3rem)] max-w-[1180px] flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-3rem)] sm:max-w-[1180px] sm:p-0"
          onInteractOutside={(e) => {
            // Don't let clicks on nested overlays (live preview / target picker)
            // close the editor.
            if (livePreview || targetPickerOpen) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            // ESC should close the nested overlay first, not the editor.
            if (livePreview || targetPickerOpen) e.preventDefault();
          }}
        >
          {/* Single hidden file input — always mounted so both the settings
              upload button and the preview drop zone can trigger it. */}
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

          {/* Header — the management title is edited inline here. */}
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 py-3 pl-5 pr-14">
            <DialogTitle className="sr-only">
              {editing ? "배너 수정" : "새 배너"}
            </DialogTitle>
            {editingTitle ? (
              <input
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
                className="min-w-0 flex-1 border-0 bg-transparent px-0 text-[15px] font-bold text-slate-900 outline-none placeholder:font-semibold placeholder:text-slate-300 sm:max-w-[280px]"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                title="관리용 제목 수정"
                className="group flex min-w-0 items-center gap-1.5 text-left"
              >
                <span
                  className={cn(
                    "min-w-0 truncate text-[15px] font-bold",
                    draft.title ? "text-slate-900" : "text-slate-300",
                  )}
                >
                  {draft.title || "배너 제목 (관리용)"}
                </span>
                <Pencil className="size-3.5 shrink-0 text-slate-400 transition-colors group-hover:text-slate-600" />
              </button>
            )}
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold",
                draft.isActive ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400",
              )}
            >
              {draft.isActive ? "노출 중" : "비활성"}
            </span>

            {/* 배너 종류 — 헤더 우측, 닫기(X) 왼쪽 */}
            <div className="ml-auto flex shrink-0 items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => patch({ type: "TEMPLATE" })}
                className={cn(
                  "flex h-7 items-center gap-1 rounded-md px-2.5 text-[12px] font-bold transition-colors",
                  draft.type === "TEMPLATE"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700",
                )}
              >
                <LayoutTemplate className="size-3.5" />
                템플릿
              </button>
              <button
                type="button"
                onClick={() => patch({ type: "IMAGE" })}
                className={cn(
                  "flex h-7 items-center gap-1 rounded-md px-2.5 text-[12px] font-bold transition-colors",
                  draft.type === "IMAGE"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700",
                )}
              >
                <ImageIcon className="size-3.5" />
                이미지
              </button>
            </div>
          </div>

          {/* Body: preview canvas + settings panel */}
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
                  <span className="h-4 w-px bg-slate-200" />
                  <ZoomBtn label="원래 크기" onClick={() => setZoom(0.9)}>
                    <Maximize2 className="size-4" />
                  </ZoomBtn>
                </div>

                <div className="flex min-h-full items-start justify-center p-8">
                  <div
                    className="transition-transform duration-150"
                    style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
                  >
                    <div
                      className={cn(
                        "relative w-[440px] overflow-hidden rounded-2xl border bg-white shadow-[0_24px_70px_-18px_rgba(15,23,42,0.4)] transition-colors",
                        dragging && draft.type === "IMAGE"
                          ? "border-blue-400 ring-2 ring-blue-200"
                          : "border-slate-200",
                      )}
                      onDragOver={
                        draft.type === "IMAGE"
                          ? (e) => {
                              e.preventDefault();
                              setDragging(true);
                            }
                          : undefined
                      }
                      onDragLeave={
                        draft.type === "IMAGE"
                          ? (e) => {
                              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                setDragging(false);
                              }
                            }
                          : undefined
                      }
                      onDrop={
                        draft.type === "IMAGE"
                          ? (e) => {
                              e.preventDefault();
                              setDragging(false);
                              acceptFile(e.dataTransfer.files?.[0]);
                            }
                          : undefined
                      }
                    >
                      {/* Close X — always present, mirrors the real banner. */}
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute right-3.5 top-3.5 z-10 flex size-8 items-center justify-center rounded-full",
                          draft.type === "IMAGE"
                            ? "bg-white/85 text-slate-600 shadow-sm backdrop-blur-sm"
                            : "text-slate-400",
                        )}
                      >
                        <X className="size-[18px]" />
                      </span>

                      {draft.type === "IMAGE" ? (
                        <>
                          {draft.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={draft.imageUrl}
                              alt={draft.imageAlt}
                              className="block h-auto w-full"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={openFilePicker}
                              disabled={uploading}
                              className="flex h-56 w-full flex-col items-center justify-center gap-2 text-slate-300 transition-colors hover:bg-slate-50 disabled:opacity-60"
                            >
                              {uploading ? (
                                <Loader2 className="size-8 animate-spin text-slate-300" />
                              ) : (
                                <ImageIcon className="size-8" />
                              )}
                              <span className="text-[13px] font-semibold text-slate-500">
                                이미지를 업로드하세요
                              </span>
                              <span className="text-[11px] text-slate-400">
                                클릭하거나 파일을 여기로 드래그&드롭
                              </span>
                            </button>
                          )}
                          {previewDismissLabel && (
                            <div className="flex items-center justify-center border-t border-slate-100 py-2.5">
                              <span className="text-[13px] font-medium text-slate-400">
                                {previewDismissLabel}
                              </span>
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
                              dismissLabel={previewDismissLabel}
                              onDismiss={() => {}}
                              initialStep={1}
                            />
                          </div>
                        </>
                      ) : null}

                      {dragging && draft.type === "IMAGE" && (
                        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 bg-blue-50/85 text-blue-600">
                          <Upload className="size-7" />
                          <span className="text-[13px] font-bold">여기에 놓아서 업로드</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ── Settings panel ── */}
            <aside className="flex w-full shrink-0 flex-col border-t border-slate-200 bg-white md:w-[360px] md:border-l md:border-t-0">
              {/* Tabs */}
              <div className="shrink-0 border-b border-slate-200 px-3 py-2">
                <div
                  role="tablist"
                  aria-label="배너 편집 패널"
                  className="relative grid grid-cols-2 overflow-hidden rounded-md border border-blue-200 bg-white p-1"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "pointer-events-none absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded bg-blue-600 shadow-sm shadow-blue-600/20 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                      tab === "settings" && "translate-x-full",
                    )}
                  />
                  {(["edit", "settings"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={tab === t}
                      onClick={() => setTab(t)}
                      className={cn(
                        "relative z-10 h-8 rounded px-2 text-[12px] font-black transition-colors duration-200",
                        tab === t ? "text-white" : "text-blue-700 hover:text-blue-900",
                      )}
                    >
                      {t === "edit" ? "편집" : "설정"}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 truncate text-[11px] font-semibold text-slate-400">
                  {draft.type === "IMAGE" ? "이미지 배너" : (template?.name ?? "템플릿")} ·{" "}
                  {draft.audiences.map((a) => AUDIENCE_LABELS[a]).join("·") || "대상 없음"} · 우선순위{" "}
                  {draft.priority}
                </p>
              </div>

              {/* Scrollable content */}
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
                {tab === "edit" ? (
                  <>
                    {draft.type === "TEMPLATE" ? (
                      <>
                        {template?.fields.map((field) => (
                          <div key={field.key}>
                            <label className={FIELD_LABEL}>
                              {field.label}
                              {field.required && <span className="text-rose-500"> *</span>}
                            </label>
                            {field.type === "textarea" ? (
                              <textarea
                                className={cn(FIELD_INPUT, "min-h-[80px] resize-y")}
                                value={draft.content[field.key] ?? ""}
                                onChange={(e) => patchContent(field.key, e.target.value)}
                                placeholder={field.placeholder}
                              />
                            ) : (
                              <input
                                className={FIELD_INPUT}
                                value={draft.content[field.key] ?? ""}
                                onChange={(e) => patchContent(field.key, e.target.value)}
                                placeholder={field.placeholder}
                              />
                            )}
                            {field.help && (
                              <p className="mt-1 text-[11px] text-slate-400">{field.help}</p>
                            )}
                          </div>
                        ))}
                      </>
                    ) : (
                      <>
                        <div>
                          <SectionLabel>이미지</SectionLabel>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={openFilePicker}
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
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={draft.imageUrl}
                                alt=""
                                className="h-11 w-11 rounded-md border border-slate-200 object-cover"
                              />
                            )}
                          </div>
                          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
                            <p className="font-bold text-slate-600">권장 이미지 크기</p>
                            <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                              <li>가로 <b className="text-slate-700">960px</b> 내외 (실제 표시 480px · 2배 해상도로 선명하게)</li>
                              <li>세로/정사각형 권장 · 세로가 너무 길면 잘릴 수 있어요 (가로:세로 ≈ 4:5 ~ 1:1)</li>
                              <li>JPG·PNG·WebP·GIF, 5MB 이하</li>
                            </ul>
                          </div>
                        </div>
                        <div>
                          <label className={FIELD_LABEL}>대체 텍스트 (접근성)</label>
                          <input
                            className={FIELD_INPUT}
                            value={draft.imageAlt}
                            onChange={(e) => patch({ imageAlt: e.target.value })}
                            placeholder="이미지 설명"
                          />
                        </div>
                      </>
                    )}

                    <div>
                      <label className={FIELD_LABEL}>
                        클릭 링크 {draft.type === "TEMPLATE" && "(선택)"}
                      </label>
                      <input
                        className={FIELD_INPUT}
                        value={draft.linkUrl}
                        onChange={(e) => patch({ linkUrl: e.target.value })}
                        placeholder="https://…"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {draft.type === "TEMPLATE" && (
                      <div>
                        <SectionLabel>템플릿</SectionLabel>
                        <div className="grid gap-2">
                          {BANNER_TEMPLATES.map((tpl) => (
                            <button
                              key={tpl.key}
                              type="button"
                              onClick={() => selectTemplate(tpl.key)}
                              className={cn(
                                "rounded-lg border px-3 py-2.5 text-left transition-all",
                                draft.templateKey === tpl.key
                                  ? "border-blue-300 bg-blue-50 shadow-sm"
                                  : "border-slate-200 bg-white hover:bg-slate-50",
                              )}
                            >
                              <p
                                className={cn(
                                  "text-[12.5px] font-black",
                                  draft.templateKey === tpl.key ? "text-blue-700" : "text-slate-900",
                                )}
                              >
                                {tpl.name}
                              </p>
                              <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                                {tpl.description}
                              </p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 노출 대상 — 역할 + 범위(전체/특정)를 한 곳에서 설정 */}
                    <div>
                      <SectionLabel>
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3" />
                          노출 대상
                        </span>
                      </SectionLabel>
                      <button
                        type="button"
                        onClick={() => setTargetPickerOpen(true)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                      >
                        <span className="min-w-0">
                          <span className="block text-[13px] font-bold text-slate-800">
                            {draft.audiences.map((a) => AUDIENCE_LABELS[a]).join(" · ") ||
                              "역할 미선택"}
                          </span>
                          <span className="mt-0.5 block text-[11.5px] text-slate-400">
                            {draft.targetMode === "ALL"
                              ? "전체 학원에 노출"
                              : `특정 ${draft.targetAcademyIds.length}명에게 노출`}
                          </span>
                        </span>
                        <span className="shrink-0 text-[12px] font-bold text-blue-600">설정</span>
                      </button>
                      {draft.audiences.length === 0 && (
                        <p className="mt-1.5 text-[11px] leading-snug text-amber-600">
                          역할이 선택되지 않아 아무에게도 노출되지 않아요.
                        </p>
                      )}
                      {draft.targetMode === "SPECIFIC" &&
                        draft.targetAcademyIds.length === 0 && (
                          <p className="mt-1.5 text-[11px] leading-snug text-amber-600">
                            선택된 대상이 없어 아무에게도 노출되지 않아요.
                          </p>
                        )}
                    </div>

                    <div>
                      <SectionLabel>닫기 방식</SectionLabel>
                      <div className="grid grid-cols-2 gap-1.5">
                        {DISMISS_MODES.map((m) => (
                          <button
                            key={m.value}
                            type="button"
                            onClick={() => patch({ dismissMode: m.value })}
                            title={m.description}
                            className={cn(
                              "flex min-h-9 items-center justify-center rounded-md border px-1.5 py-1.5 text-center text-[11px] font-bold leading-tight transition-colors",
                              draft.dismissMode === m.value
                                ? "border-blue-300 bg-blue-50 text-blue-700"
                                : "border-slate-200 text-slate-500 hover:bg-slate-50",
                            )}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <SectionLabel>우선순위 (낮을수록 먼저)</SectionLabel>
                      <input
                        type="number"
                        min={0}
                        className={FIELD_INPUT}
                        value={draft.priority}
                        onChange={(e) => patch({ priority: Number(e.target.value) })}
                      />
                    </div>

                    <div>
                      <SectionLabel>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          노출 기간 (선택)
                        </span>
                      </SectionLabel>
                      <div className="grid grid-cols-1 gap-2">
                        <div>
                          <label className={FIELD_LABEL}>시작</label>
                          <input
                            type="datetime-local"
                            className={FIELD_INPUT}
                            value={draft.startsAt}
                            onChange={(e) => patch({ startsAt: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className={FIELD_LABEL}>종료</label>
                          <input
                            type="datetime-local"
                            className={FIELD_INPUT}
                            value={draft.endsAt}
                            onChange={(e) => patch({ endsAt: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <ToggleRow
                        label="'오늘 하루 보지 않기' 버튼 표시"
                        desc="끄면 우측 상단 X·바깥 클릭으로만 닫을 수 있어요. (닫기 방식은 그대로 적용)"
                        checked={draft.showDismissButton}
                        onChange={(v) => patch({ showDismissButton: v })}
                      />
                      <ToggleRow
                        label="지금 활성화"
                        desc="켜면 노출 기간·대상 조건을 만족하는 사용자에게 바로 뜹니다."
                        checked={draft.isActive}
                        onChange={(v) => patch({ isActive: v })}
                      />
                      {showLowCreditOption && (
                        <ToggleRow
                          label="저크레딧 시 자동 노출"
                          desc="원장의 크레딧 잔액이 낮으면 닫았어도 다시 띄웁니다."
                          checked={draft.autoOpenOnLowCredit}
                          onChange={(v) => patch({ autoOpenOnLowCredit: v })}
                        />
                      )}
                    </div>
                  </>
                )}
              </div>
            </aside>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {editing ? "저장" : "만들기"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
      {children}
    </p>
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
  children: ReactNode;
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

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left hover:bg-slate-50"
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-slate-800">{label}</span>
        <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-400">{desc}</span>
      </span>
      <span
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-blue-600" : "bg-slate-300",
        )}
      >
        <span
          className={cn(
            "inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}
