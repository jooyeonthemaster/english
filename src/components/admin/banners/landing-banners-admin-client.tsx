"use client";

import { useState, useTransition } from "react";
import { Megaphone, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AdminEmptyState, SectionCard, StatusBadge, useConfirm } from "@/components/admin/kit";
import { setLandingBanners } from "@/actions/admin-settings";
import type { LandingBannerItem } from "@/lib/platform-settings";
import { LandingBannerEditorModal } from "./landing-banner-editor-modal";
import { BannerListRow } from "./banners-admin-client-parts/banner-list-row";

/**
 * 랜딩 헤더 배너 목록(우선순위 순). 랜딩 팝업 배너와 동일한 UX:
 * 위/아래 정렬, 활성 토글, 수정(편집 팝업), 삭제, 새 배너 편집 모달.
 * 실제 노출은 활성+내용 있는 최상위 1개. 모든 변경은 전체 목록을 통째로 저장한다.
 */
export function LandingBannersAdminClient({ initial }: { initial: LandingBannerItem[] }) {
  const confirm = useConfirm();
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

  async function remove(item: LandingBannerItem) {
    const ok = await confirm({
      title: `"${item.text || "문구 없는 배너"}" 배너를 삭제할까요?`,
      description: "삭제하면 되돌릴 수 없습니다.",
      confirmLabel: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    persist(
      items.filter((b) => b.id !== item.id),
      "배너를 삭제했어요.",
    );
  }

  // 실제 노출되는(활성+문구 있는 최상위) 배너 id — 목록에 '현재 노출' 표시.
  const activeId = items.find((b) => b.enabled && b.text.trim())?.id ?? null;

  return (
    <>
      <SectionCard
        title="랜딩 헤더 배너"
        description="홈(/) 최상단 스트립 배너. 여러 개를 우선순위로 등록하면 맨 위 활성 배너 하나가 노출됩니다. 위/아래로 우선순위를 바꾸세요."
        actions={
          <Button size="sm" onClick={openCreate} disabled={saving}>
            <Plus className="size-4" />새 배너
          </Button>
        }
        padded={false}
      >
        {items.length === 0 ? (
          <AdminEmptyState
            icon={Megaphone}
            title="아직 헤더 배너가 없어요"
            description="새 배너를 만들어 랜딩 최상단에 안내를 띄워보세요."
          />
        ) : (
          <ul className={saving ? "divide-y divide-gray-50 opacity-60" : "divide-y divide-gray-50"}>
            {items.map((item, index) => (
              <BannerListRow
                key={item.id}
                thumb={<Megaphone className="size-5" />}
                title={item.text || "문구 없는 배너"}
                active={item.enabled}
                badges={
                  item.id === activeId && (
                    <StatusBadge status={{ label: "현재 노출", tone: "blue" }} />
                  )
                }
                meta={[`우선순위 ${index + 1}`, `${item.ctaLabel || "신청하기"} → ${item.href}`]}
                index={index}
                count={items.length}
                disabled={saving}
                onMove={(dir) => move(index, dir)}
                onToggle={() => toggle(item)}
                onEdit={() => openEdit(item)}
                onDelete={() => remove(item)}
              />
            ))}
          </ul>
        )}
      </SectionCard>

      <LandingBannerEditorModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editing}
        onSave={handleSave}
        saving={saving}
      />
    </>
  );
}
