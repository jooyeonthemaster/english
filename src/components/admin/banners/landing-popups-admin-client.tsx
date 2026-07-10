"use client";

import { useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  MessageSquareText,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setLandingPopups } from "@/actions/admin-settings";
import type { LandingPopupItem } from "@/lib/platform-settings";
import { LandingPopupEditorModal } from "./landing-popup-editor-modal";

/**
 * 랜딩 진입 팝업 배너 목록(우선순위 순). 앱 진입 배너(SiteBanner)와 동일한 UX:
 * 위/아래 정렬, 활성 토글, 수정, 삭제, 새 팝업 편집 모달.
 * 모든 변경은 전체 목록을 setLandingPopups로 통째로 저장한다.
 */
export function LandingPopupsAdminClient({ initial }: { initial: LandingPopupItem[] }) {
  const [items, setItems] = useState<LandingPopupItem[]>(initial);
  const [saving, startSaving] = useTransition();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<LandingPopupItem | null>(null);

  /** 낙관적 갱신 + 서버 저장. 실패 시 롤백. */
  function persist(next: LandingPopupItem[], okMsg?: string) {
    const prev = items;
    setItems(next);
    startSaving(async () => {
      const res = await setLandingPopups(next);
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
  function openEdit(item: LandingPopupItem) {
    setEditing(item);
    setEditorOpen(true);
  }

  function handleSave(item: LandingPopupItem) {
    const exists = items.some((p) => p.id === item.id);
    const next = exists
      ? items.map((p) => (p.id === item.id ? item : p))
      : [...items, item];
    persist(next, exists ? "팝업을 수정했어요." : "팝업을 추가했어요.");
    setEditorOpen(false);
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    persist(next);
  }

  function toggle(item: LandingPopupItem) {
    persist(items.map((p) => (p.id === item.id ? { ...p, enabled: !p.enabled } : p)));
  }

  function remove(item: LandingPopupItem) {
    if (!window.confirm(`"${item.title || "제목 없는 팝업"}" 팝업을 삭제할까요?`)) return;
    persist(
      items.filter((p) => p.id !== item.id),
      "팝업을 삭제했어요.",
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-slate-400">
          위에 있는 팝업부터 먼저 노출되고, 하나를 닫으면 다음 팝업이 열립니다.
        </p>
        <Button onClick={openCreate} disabled={saving}>
          <Plus className="size-4" />새 팝업
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center">
          <p className="text-[14px] font-semibold text-slate-600">아직 팝업이 없어요</p>
          <p className="mt-1 text-[12.5px] text-slate-400">
            새 팝업을 만들어 랜딩 진입 시 안내를 띄워보세요.
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

              {/* Thumb / icon */}
              <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt="" className="size-full object-cover" />
                ) : (
                  <MessageSquareText className="size-5 text-slate-400" />
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[14px] font-bold text-slate-900">
                    {item.title || item.text || "제목 없는 팝업"}
                  </p>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold",
                      item.enabled ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400",
                    )}
                  >
                    {item.enabled ? "노출 중" : "비활성"}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-slate-400">
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-500">
                    {item.imageUrl ? (
                      <>
                        <ImageIcon className="size-3" />
                        이미지
                      </>
                    ) : (
                      "텍스트"
                    )}
                  </span>
                  <span>·</span>
                  <span>우선순위 {index + 1}</span>
                  {item.href && (
                    <>
                      <span>·</span>
                      <span className="truncate">{item.ctaLabel} → {item.href}</span>
                    </>
                  )}
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

      <LandingPopupEditorModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editing}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  );
}
