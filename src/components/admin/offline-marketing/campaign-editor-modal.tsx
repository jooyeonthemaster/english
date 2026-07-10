"use client";

// ============================================================================
// 홍보(캠페인) 등록/수정 모달 — 이름·분류·설명·활성만 다룬다.
// 파일(PDF)은 등록 후 홍보를 펼쳐 개별 업로드로 추가한다.
// ============================================================================

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addOfflineMarketingCategory,
  createOfflineMarketingCampaign,
  removeOfflineMarketingCategory,
  updateOfflineMarketingCampaign,
  type OfflineMarketingCampaignDto,
} from "@/actions/admin-offline-marketing";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null 이면 신규, 값이 있으면 수정. */
  campaign: OfflineMarketingCampaignDto | null;
  /** 관리 중인 분류(태그) 목록. */
  categories: string[];
  /** 분류 추가/삭제로 목록이 바뀌면 상위에 반영. */
  onCategoriesChange: (next: string[]) => void;
  onSaved: () => void;
}

export function CampaignEditorModal({
  open,
  onOpenChange,
  campaign,
  categories,
  onCategoriesChange,
  onSaved,
}: Props) {
  const isEdit = !!campaign;
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("기타");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [newTag, setNewTag] = useState("");
  const [tagBusy, setTagBusy] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    // 수정: 기존 분류, 신규: 첫 분류(없으면 "기타").
    setCategory(campaign?.category ?? categories[0] ?? "기타");
    setTitle(campaign?.title ?? "");
    setDescription(campaign?.description ?? "");
    setIsActive(campaign?.isActive ?? true);
    setNewTag("");
    // open/campaign 변경 시에만 초기화(categories 변화로는 리셋하지 않음).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, campaign]);

  async function handleAddTag() {
    const value = newTag.trim();
    if (!value) return;
    if (categories.includes(value)) {
      setCategory(value);
      setNewTag("");
      return;
    }
    setTagBusy(true);
    const res = await addOfflineMarketingCategory(value);
    setTagBusy(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    onCategoriesChange(res.categories);
    setCategory(value);
    setNewTag("");
  }

  async function handleRemoveTag(tag: string) {
    if (!window.confirm(`"${tag}" 분류를 목록에서 삭제할까요?`)) return;
    setTagBusy(true);
    const res = await removeOfflineMarketingCategory(tag);
    setTagBusy(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    onCategoriesChange(res.categories);
    if (category === tag) setCategory(res.categories[0] ?? "기타");
  }

  function handleSave() {
    if (!title.trim()) {
      toast.error("홍보 이름을 입력하세요.");
      return;
    }
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      category: category.trim() || "기타",
      isActive,
    };
    startTransition(async () => {
      const res = isEdit
        ? await updateOfflineMarketingCampaign(campaign.id, payload)
        : await createOfflineMarketingCampaign(payload);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(isEdit ? "수정했어요." : "홍보를 만들었어요.");
      onSaved();
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !isPending && onOpenChange(o)}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-gray-100 px-5 py-4">
          <DialogTitle className="text-[16px] font-bold text-gray-900">
            {isEdit ? "홍보 수정" : "새 홍보 만들기"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-gray-600">
              홍보 이름 <span className="text-rose-500">*</span>
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 2027 봄 전단지 캠페인"
              disabled={isPending}
              maxLength={150}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-gray-600">
              분류 <span className="text-gray-300">(태그를 눌러 선택)</span>
            </label>

            {/* 분류 태그 칩 — 클릭으로 선택, × 로 삭제 */}
            <div className="flex flex-wrap gap-1.5">
              {categories.length === 0 && (
                <span className="text-[12px] text-gray-400">
                  분류가 없어요. 아래에서 추가하세요.
                </span>
              )}
              {categories.map((c) => {
                const selected = category === c;
                return (
                  <span
                    key={c}
                    className={`group inline-flex items-center gap-1 rounded-full border py-1 pl-2.5 pr-1.5 text-[11px] font-medium transition-colors ${
                      selected
                        ? "border-blue-300 bg-blue-50 text-blue-600"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setCategory(c)}
                      disabled={isPending || tagBusy}
                      className="inline-flex items-center gap-1"
                    >
                      {selected && <Check className="size-3" />}
                      {c}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(c)}
                      disabled={isPending || tagBusy}
                      title="분류 삭제"
                      className="grid size-4 place-items-center rounded-full text-gray-300 hover:bg-rose-100 hover:text-rose-500 disabled:opacity-50"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                );
              })}
            </div>

            {/* 새 분류(태그) 추가 */}
            <div className="mt-2 flex items-center gap-1.5">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAddTag();
                  }
                }}
                placeholder="새 분류 추가 (예: 배너)"
                disabled={isPending || tagBusy}
                maxLength={60}
                className="h-9"
              />
              <button
                type="button"
                onClick={() => void handleAddTag()}
                disabled={isPending || tagBusy || !newTag.trim()}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl border border-gray-200 px-3 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {tagBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                추가
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-gray-600">
              설명 · 메모 <span className="text-gray-300">(선택)</span>
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="배포처, 용도, 기간 등 내부 메모"
              disabled={isPending}
              maxLength={1000}
              rows={2}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={isPending}
              className="size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-[13px] font-medium text-gray-700">
              활성 (목록 상단에 노출)
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3.5">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="h-9 rounded-xl border border-gray-200 px-4 text-[13px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending && <Loader2 className="size-3.5 animate-spin" />}
            {isEdit ? "저장" : "만들기"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
