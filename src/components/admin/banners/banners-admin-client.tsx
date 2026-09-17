"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Image as ImageIcon, LayoutTemplate, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AdminEmptyState, SectionCard, useConfirm } from "@/components/admin/kit";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import { AUDIENCE_LABELS, DISMISS_MODES, getTemplate } from "@/lib/site-banners/templates";
import {
  deleteBanner,
  reorderBanners,
  toggleBannerActive,
  type AdminBannerDto,
} from "@/actions/admin-banners";
import { BannerEditorModal, type BannerPrefill } from "./banner-editor-modal";
import { bannerRowDetail } from "./banners-admin-client-parts/banner-hover-detail";
import { BannerListRow } from "./banners-admin-client-parts/banner-list-row";

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

/** 앱 진입 배너(SiteBanner) 목록 — 우선순위 순, 위/아래 정렬·노출 토글·수정·삭제. */
export function BannersAdminClient({ initialBanners }: { initialBanners: AdminBannerDto[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const [items, setItems] = useState(initialBanners);
  const [, startTransition] = useTransition();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AdminBannerDto | null>(null);
  const [prefill, setPrefill] = useState<BannerPrefill | null>(null);

  // router.refresh() 로 서버 목록이 새로 오면 동기화.
  useEffect(() => {
    setItems(initialBanners);
  }, [initialBanners]);

  // 공지 "배너로 띄우기" → /admin/banners?prefill=announcement&... 로 진입하면
  // announcement 템플릿을 프리필한 새 배너 편집기를 자동으로 연다(1회, URL 은 앱 탭만 남기고 정리).
  useEffect(() => {
    if (searchParams.get("prefill") !== "announcement") return;
    setPrefill({
      title: searchParams.get("title") ?? undefined,
      eyebrow: searchParams.get("eyebrow") ?? undefined,
      heading: searchParams.get("heading") ?? searchParams.get("title") ?? undefined,
      body: searchParams.get("body") ?? undefined,
    });
    setEditing(null);
    setEditorOpen(true);
    router.replace("/admin/banners?tab=app");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function openCreate() {
    setEditing(null);
    setPrefill(null);
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

  async function remove(banner: AdminBannerDto) {
    const ok = await confirm({
      title: `"${banner.title}" 배너를 삭제할까요?`,
      description: "삭제하면 되돌릴 수 없습니다.",
      confirmLabel: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    setItems((prev) => prev.filter((b) => b.id !== banner.id));
    startTransition(async () => {
      const result = await deleteBanner(banner.id);
      if (!result.success) {
        toast.error(result.error);
      } else {
        toast.success("배너를 삭제했어요");
      }
      router.refresh();
    });
  }

  return (
    <>
      <SectionCard
        title="앱 진입 배너"
        description="로그인 사용자에게 뜨는 진입 배너. 위쪽 배너부터 먼저 노출되고, 하나를 닫으면 다음 배너가 열립니다."
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" />새 배너
          </Button>
        }
        padded={false}
      >
        {items.length === 0 ? (
          <AdminEmptyState
            icon={LayoutTemplate}
            title="아직 배너가 없어요"
            description="새 배너를 만들어 사용자에게 안내를 띄워보세요."
          />
        ) : (
          <ul className="divide-y divide-gray-50">
            {items.map((banner, index) => {
              const start = fmtDate(banner.startsAt);
              const end = fmtDate(banner.endsAt);
              const tplName = getTemplate(banner.templateKey)?.name;
              return (
                // 행 클릭 동작이 없어 클릭=상세 팝업. 순서·스위치·수정·삭제 버튼 위에선 열리지 않는다.
                <AdminHoverDetail key={banner.id} title={banner.title} detail={bannerRowDetail(banner)}>
                  <BannerListRow
                    className="cursor-pointer"
                    thumb={
                      banner.type === "IMAGE" && banner.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={banner.imageUrl} alt="" className="size-full object-cover" />
                      ) : banner.type === "IMAGE" ? (
                        <ImageIcon className="size-5" />
                      ) : (
                        <LayoutTemplate className="size-5" />
                      )
                    }
                    title={banner.title}
                    active={banner.isActive}
                    meta={[
                      <span key="type" className="font-medium text-gray-500">
                        {banner.type === "IMAGE" ? "이미지" : (tplName ?? "템플릿")}
                      </span>,
                      banner.audiences.map((a) => AUDIENCE_LABELS[a]).join("·") || "대상 없음",
                      banner.targetMode === "SPECIFIC" ? (
                        <span key="target" className="font-medium text-blue-600">
                          특정 {banner.targetAcademyIds.length}명
                        </span>
                      ) : (
                        "전체 노출"
                      ),
                      dismissLabel(banner.dismissMode),
                      (start || end) && `${start ?? "상시"} ~ ${end ?? "상시"}`,
                      banner.autoOpenOnLowCredit && (
                        <span key="lowcredit" className="text-amber-600">
                          저크레딧 자동노출
                        </span>
                      ),
                    ]}
                    index={index}
                    count={items.length}
                    onMove={(dir) => move(index, dir)}
                    onToggle={() => toggle(banner)}
                    onEdit={() => openEdit(banner)}
                    onDelete={() => remove(banner)}
                  />
                </AdminHoverDetail>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <BannerEditorModal
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setPrefill(null);
        }}
        editing={editing}
        prefill={prefill}
        onSaved={() => router.refresh()}
      />
    </>
  );
}
