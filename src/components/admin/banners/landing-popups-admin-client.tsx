"use client";

import { useState, useTransition } from "react";
import { Image as ImageIcon, MessageSquareText, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AdminEmptyState, SectionCard, useConfirm } from "@/components/admin/kit";
import { setLandingPopups } from "@/actions/admin-settings";
import type { LandingPopupItem } from "@/lib/platform-settings";
import { LandingPopupEditorModal } from "./landing-popup-editor-modal";
import { BannerListRow } from "./banners-admin-client-parts/banner-list-row";

/**
 * 랜딩 진입 팝업 배너 목록(우선순위 순). 앱 진입 배너(SiteBanner)와 동일한 UX:
 * 위/아래 정렬, 활성 토글, 수정, 삭제, 새 팝업 편집 모달.
 * 모든 변경은 전체 목록을 setLandingPopups 로 통째로 저장한다.
 */
export function LandingPopupsAdminClient({ initial }: { initial: LandingPopupItem[] }) {
  const confirm = useConfirm();
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
    const next = exists ? items.map((p) => (p.id === item.id ? item : p)) : [...items, item];
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

  async function remove(item: LandingPopupItem) {
    const ok = await confirm({
      title: `"${item.title || "제목 없는 팝업"}" 팝업을 삭제할까요?`,
      description: "삭제하면 되돌릴 수 없습니다.",
      confirmLabel: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    persist(
      items.filter((p) => p.id !== item.id),
      "팝업을 삭제했어요.",
    );
  }

  return (
    <>
      <SectionCard
        title="랜딩 팝업 배너"
        description="홈(/) 진입 시 뜨는 팝업. 여러 개를 우선순위로 등록하면 위에 있는 팝업부터 먼저 노출되고, 하나를 닫으면 다음 팝업이 열립니다."
        actions={
          <Button size="sm" onClick={openCreate} disabled={saving}>
            <Plus className="size-4" />새 팝업
          </Button>
        }
        padded={false}
      >
        {items.length === 0 ? (
          <AdminEmptyState
            icon={MessageSquareText}
            title="아직 팝업이 없어요"
            description="새 팝업을 만들어 랜딩 진입 시 안내를 띄워보세요."
          />
        ) : (
          <ul className={saving ? "divide-y divide-gray-50 opacity-60" : "divide-y divide-gray-50"}>
            {items.map((item, index) => (
              <BannerListRow
                key={item.id}
                thumb={
                  item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <MessageSquareText className="size-5" />
                  )
                }
                title={item.title || item.text || "제목 없는 팝업"}
                active={item.enabled}
                meta={[
                  <span key="kind" className="inline-flex items-center gap-1 font-medium text-gray-500">
                    {item.imageUrl ? (
                      <>
                        <ImageIcon className="size-3" />
                        이미지
                      </>
                    ) : (
                      "텍스트"
                    )}
                  </span>,
                  `우선순위 ${index + 1}`,
                  item.href && `${item.ctaLabel} → ${item.href}`,
                ]}
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

      <LandingPopupEditorModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editing}
        onSave={handleSave}
        saving={saving}
      />
    </>
  );
}
