"use client";

// ============================================================================
// 홍보(캠페인) 등록/수정 팝업 — 이름·분류·설명·활성만 다룬다.
// 파일(PDF)은 등록 후 홍보를 펼쳐 개별 업로드로 추가한다.
// ============================================================================

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AdminDialog, FilterChip, useConfirm } from "@/components/admin/kit";
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
  const confirm = useConfirm();
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
    const ok = await confirm({
      title: `"${tag}" 분류를 목록에서 삭제할까요?`,
      description: "사용 중인 분류는 삭제할 수 없습니다.",
      confirmLabel: "삭제",
      tone: "danger",
    });
    if (!ok) return;
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
    <AdminDialog
      open={open}
      onOpenChange={(o) => !isPending && onOpenChange(o)}
      size="md"
      title={isEdit ? "홍보 수정" : "새 홍보 만들기"}
      description="이름·분류·설명을 정하고, 파일은 만든 뒤 홍보를 펼쳐 추가합니다."
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isPending}>
            취소
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="size-3.5 animate-spin" />}
            {isEdit ? "저장" : "만들기"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label className="mb-1 text-[12px] font-semibold text-gray-600">
            홍보 이름 <span className="text-rose-500">*</span>
          </Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 2027 봄 전단지 캠페인"
            disabled={isPending}
            maxLength={150}
            className="text-[13px]"
          />
        </div>

        <div>
          <Label className="mb-1 text-[12px] font-semibold text-gray-600">
            분류 <span className="font-normal text-gray-400">(태그를 눌러 선택)</span>
          </Label>

          {/* 분류 태그 칩 — 클릭으로 선택, × 로 삭제 */}
          <div className="flex flex-wrap gap-1.5">
            {categories.length === 0 && (
              <span className="text-[12px] text-gray-400">분류가 없어요. 아래에서 추가하세요.</span>
            )}
            {categories.map((c) => (
              <span key={c} className="group relative inline-flex">
                <FilterChip active={category === c} onClick={() => setCategory(c)} label={c} />
                {/* 마우스를 올리면 오른쪽 위에 삭제 버튼(사용 중인 분류는 서버가 차단) */}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => void handleRemoveTag(c)}
                  disabled={isPending || tagBusy}
                  aria-label={`${c} 분류 삭제`}
                  title="분류 삭제"
                  className="absolute -right-1 -top-1 hidden size-4 rounded-full border border-gray-200 bg-white text-gray-400 shadow-sm hover:bg-rose-50 hover:text-rose-600 group-hover:inline-flex"
                >
                  <X className="size-2.5" />
                </Button>
              </span>
            ))}
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
              aria-label="새 분류 이름"
              disabled={isPending || tagBusy}
              maxLength={60}
              className="h-9 text-[13px]"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleAddTag()}
              disabled={isPending || tagBusy || !newTag.trim()}
            >
              {tagBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              추가
            </Button>
          </div>
        </div>

        <div>
          <Label className="mb-1 text-[12px] font-semibold text-gray-600">
            설명 · 메모 <span className="font-normal text-gray-400">(선택)</span>
          </Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="배포처, 용도, 기간 등 내부 메모"
            disabled={isPending}
            maxLength={1000}
            rows={2}
            className="text-[13px]"
          />
        </div>

        <div className="flex items-center gap-2.5">
          <Switch
            checked={isActive}
            onCheckedChange={setIsActive}
            disabled={isPending}
            aria-label={isActive ? "노출 끄기" : "노출 켜기"}
          />
          <span className="text-[13px] text-gray-600">활성 (목록 상단에 노출)</span>
        </div>
      </div>
    </AdminDialog>
  );
}
