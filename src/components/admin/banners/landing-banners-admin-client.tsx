"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setLandingBanners } from "@/actions/admin-settings";
import type { LandingBannerItem } from "@/lib/platform-settings";
import { LandingBannerEditorModal } from "./landing-banner-editor-modal";

/**
 * 랜딩 헤더 배너 목록(우선순위 순). 랜딩 팝업 배너와 동일한 UX:
 * 위/아래 정렬, 활성 토글, 수정(편집 팝업), 삭제, 새 배너 편집 모달.
 * 실제 노출은 활성+내용 있는 최상위 1개. 모든 변경은 전체 목록을 통째로 저장한다.
 */
export function LandingBannersAdminClient({ initial }: { initial: LandingBannerItem[] }) {
  const [items, setItems] = useState<LandingBannerItem[]>(initial);
  const [saving, startSaving] = useTransition();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<LandingBannerItem | null>(null);

  function persist(next: LandingBannerItem[], okMsg?: string) {
    const prev = items;
    setItems(next);
    startSaving(async () => {
      const res = await setLandingBanners(next);
      if (!res.success) {
        toast.error(res.error);
        setItems(prev);
      } else if (okMsg) {
        toast.success(okMsg);
      }
    });
  }

  function openCreate() {
    setEditing(null);
    setEditorOpen(true);
  }
  function openEdit(item: LandingBannerItem) {
    setEditing(item);
    setEditorOpen(true);
  }

  function handleSave(item: LandingBannerItem) {
    const exists = items.some((b) => b.id === item.id);
    const next = exists ? items.map((b) => (b.id === item.id ? item : b)) : [...items, item];
    persist(next, exists ? "배너를 수정했어요." : "배너를 추가했어요.");
    setEditorOpen(false);
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    persist(next);
  }

  function toggle(item: LandingBannerItem) {
    persist(items.map((b) => (b.id === item.id ? { ...b, enabled: !b.enabled } : b)));
  }

  function remove(item: LandingBannerItem) {
    if (!window.confirm(`"${item.text || "문구 없는 배너"}" 배너를 삭제할까요?`)) return;
    persist(
      items.filter((b) => b.id !== item.id),
      "배너를 삭제했어요.",
    );
  }

  // 실제 노출되는(활성+문구 있는 최상위) 배너 id — 목록에 '현재 노출' 표시.
  const activeId = items.find((b) => b.enabled && b.text.trim())?.id ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-slate-400">
          맨 위 활성 배너 하나가 랜딩 최상단에 노출됩니다. 위/아래로 우선순위를 바꾸세요.
        </p>
        <Button onClick={openCreate} disabled={saving}>
          <Plus className="size-4" />새 배너
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center">
          <p className="text-[14px] font-semibold text-slate-600">아직 헤더 배너가 없어요</p>
          <p className="mt-1 text-[12.5px] text-slate-400">
            새 배너를 만들어 랜딩 최상단에 안내를 띄워보세요.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm"
            >
              {/* Reorder */}
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0 || saving}
                  className="flex size-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                  aria-label="위로"
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1 || saving}
                  className="flex size-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                  aria-label="아래로"
                >
                  <ChevronDown className="size-4" />
                </button>
              </div>

              {/* Icon */}
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Megaphone className="size-5" />
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[14px] font-bold text-slate-900">
                    {item.text || "문구 없는 배너"}
                  </p>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold",
                      item.enabled ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400",
                    )}
                  >
                    {item.enabled ? "노출 중" : "비활성"}
                  </span>
                  {item.id === activeId && (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-600">
                      현재 노출
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-slate-400">
                  <span>우선순위 {index + 1}</span>
                  <span>·</span>
                  <span className="truncate">
                    {item.ctaLabel || "신청하기"} → {item.href}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  role="switch"
                  aria-checked={item.enabled}
                  onClick={() => toggle(item)}
                  disabled={saving}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
                    item.enabled ? "bg-blue-600" : "bg-slate-300",
                  )}
                  aria-label={item.enabled ? "비활성화" : "활성화"}
                >
                  <span
                    className={cn(
                      "inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
                      item.enabled ? "translate-x-[22px]" : "translate-x-0.5",
                    )}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  className="flex size-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="수정"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(item)}
                  className="flex size-8 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label="삭제"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <LandingBannerEditorModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editing}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  );
}
