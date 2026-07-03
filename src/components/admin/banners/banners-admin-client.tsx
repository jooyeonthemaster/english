"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  LayoutTemplate,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AUDIENCE_LABELS,
  DISMISS_MODES,
  getTemplate,
} from "@/lib/site-banners/templates";
import {
  deleteBanner,
  reorderBanners,
  toggleBannerActive,
  type AdminBannerDto,
} from "@/actions/admin-banners";
import { BannerEditorModal } from "./banner-editor-modal";

function dismissLabel(mode: string): string {
  return DISMISS_MODES.find((m) => m.value === mode)?.label ?? mode;
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BannersAdminClient({ initialBanners }: { initialBanners: AdminBannerDto[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialBanners);
  const [, startTransition] = useTransition();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AdminBannerDto | null>(null);

  // Re-sync when the server sends a fresh list (after router.refresh()).
  useEffect(() => {
    setItems(initialBanners);
  }, [initialBanners]);

  function openCreate() {
    setEditing(null);
    setEditorOpen(true);
  }
  function openEdit(banner: AdminBannerDto) {
    setEditing(banner);
    setEditorOpen(true);
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    startTransition(async () => {
      const result = await reorderBanners(next.map((b) => b.id));
      if (!result.success) {
        toast.error(result.error);
        setItems(items);
      } else {
        router.refresh();
      }
    });
  }

  function toggle(banner: AdminBannerDto) {
    const nextActive = !banner.isActive;
    setItems((prev) =>
      prev.map((b) => (b.id === banner.id ? { ...b, isActive: nextActive } : b)),
    );
    startTransition(async () => {
      const result = await toggleBannerActive(banner.id, nextActive);
      if (!result.success) {
        toast.error(result.error);
        setItems((prev) =>
          prev.map((b) => (b.id === banner.id ? { ...b, isActive: banner.isActive } : b)),
        );
      } else {
        router.refresh();
      }
    });
  }

  function remove(banner: AdminBannerDto) {
    if (!window.confirm(`"${banner.title}" 배너를 삭제할까요?`)) return;
    setItems((prev) => prev.filter((b) => b.id !== banner.id));
    startTransition(async () => {
      const result = await deleteBanner(banner.id);
      if (!result.success) {
        toast.error(result.error);
        router.refresh();
      } else {
        toast.success("배너를 삭제했어요");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="size-4" />새 배너
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <p className="text-[14px] font-semibold text-slate-600">아직 배너가 없어요</p>
          <p className="mt-1 text-[12.5px] text-slate-400">
            새 배너를 만들어 사용자에게 안내를 띄워보세요.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((banner, index) => {
            const start = fmtDate(banner.startsAt);
            const end = fmtDate(banner.endsAt);
            const tplName = getTemplate(banner.templateKey)?.name;
            return (
              <li
                key={banner.id}
                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm"
              >
                {/* Reorder */}
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="flex size-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                    aria-label="위로"
                  >
                    <ChevronUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === items.length - 1}
                    className="flex size-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                    aria-label="아래로"
                  >
                    <ChevronDown className="size-4" />
                  </button>
                </div>

                {/* Thumb / icon */}
                <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                  {banner.type === "IMAGE" && banner.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={banner.imageUrl} alt="" className="size-full object-cover" />
                  ) : banner.type === "IMAGE" ? (
                    <ImageIcon className="size-5 text-slate-400" />
                  ) : (
                    <LayoutTemplate className="size-5 text-slate-400" />
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[14px] font-bold text-slate-900">{banner.title}</p>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold",
                        banner.isActive
                          ? "bg-blue-50 text-blue-600"
                          : "bg-slate-100 text-slate-400",
                      )}
                    >
                      {banner.isActive ? "노출 중" : "비활성"}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-slate-400">
                    <span className="font-semibold text-slate-500">
                      {banner.type === "IMAGE" ? "이미지" : (tplName ?? "템플릿")}
                    </span>
                    <span>·</span>
                    <span>{banner.audiences.map((a) => AUDIENCE_LABELS[a]).join("·") || "대상 없음"}</span>
                    <span>·</span>
                    <span className={banner.targetMode === "SPECIFIC" ? "font-semibold text-blue-500" : undefined}>
                      {banner.targetMode === "SPECIFIC"
                        ? `특정 ${banner.targetAcademyIds.length}명`
                        : "전체 노출"}
                    </span>
                    <span>·</span>
                    <span>{dismissLabel(banner.dismissMode)}</span>
                    {(start || end) && (
                      <>
                        <span>·</span>
                        <span>
                          {start ?? "상시"} ~ {end ?? "상시"}
                        </span>
                      </>
                    )}
                    {banner.autoOpenOnLowCredit && (
                      <>
                        <span>·</span>
                        <span className="text-amber-500">저크레딧 자동노출</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={banner.isActive}
                    onClick={() => toggle(banner)}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                      banner.isActive ? "bg-blue-600" : "bg-slate-300",
                    )}
                    aria-label={banner.isActive ? "비활성화" : "활성화"}
                  >
                    <span
                      className={cn(
                        "inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
                        banner.isActive ? "translate-x-[22px]" : "translate-x-0.5",
                      )}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(banner)}
                    className="flex size-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="수정"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(banner)}
                    className="flex size-8 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label="삭제"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <BannerEditorModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editing}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
