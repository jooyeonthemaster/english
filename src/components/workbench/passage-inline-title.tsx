"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { renamePassage } from "@/actions/workbench";

/**
 * 지문/학습지 카드 제목의 인라인 수정 — 제목 오른쪽에 **상시 노출** 연필.
 * 클릭하면 input 으로 바뀌고 Enter/blur 저장, Escape 취소. 제목 전용
 * `renamePassage` 로 즉시 저장하며 낙관적으로 반영한다.
 *
 * 카드 click(선택)·doubleClick(상세 열기) 이벤트와 충돌하지 않도록 input/연필에
 * stopPropagation 을 건다. 카드 루트는 `<button>` 이 아니라 `<div role="button">`
 * 이어야 한다(중첩 인터랙티브 요소 금지).
 */
export function PassageInlineTitle({
  passageId,
  title: titleProp,
  onRenamed,
  titleClassName = "text-[13px] font-semibold text-slate-800 truncate",
}: {
  passageId: string;
  title: string;
  onRenamed?: (passageId: string, title: string) => void;
  titleClassName?: string;
}) {
  const [title, setTitle] = useState(titleProp);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(titleProp);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(titleProp);
  }, [passageId, titleProp]);

  const save = async () => {
    const next = draft.trim();
    if (!next || next === title) {
      setEditing(false);
      setDraft(title);
      return;
    }
    const prev = title;
    setTitle(next);
    setEditing(false);
    setSaving(true);
    try {
      const res = await renamePassage(passageId, next);
      if (!res.success) {
        setTitle(prev);
        toast.error(res.error || "제목 수정에 실패했습니다.");
      } else {
        onRenamed?.(passageId, next);
        toast.success("제목을 변경했습니다.");
      }
    } catch (err) {
      setTitle(prev);
      toast.error(
        err instanceof Error ? err.message : "제목 수정에 실패했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            void save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
            setDraft(title);
          }
        }}
        onBlur={() => void save()}
        disabled={saving}
        placeholder="지문 제목"
        className="w-full rounded-md border border-blue-300 bg-white px-1.5 py-0.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 disabled:opacity-60"
      />
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <span className={titleClassName}>{title}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setDraft(title);
          setEditing(true);
        }}
        title="제목 수정"
        aria-label="제목 수정"
        className="inline-flex size-5 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
      >
        {saving ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Pencil className="size-3" />
        )}
      </button>
    </div>
  );
}
