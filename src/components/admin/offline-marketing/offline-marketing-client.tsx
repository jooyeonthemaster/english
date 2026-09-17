"use client";

// ============================================================================
// 오프라인 홍보 관리 — 관리자 콘솔. 2단 구조.
//   홍보(캠페인) 1개 → 홍보물 파일(PDF·이미지) N개.
//   - 홍보를 만들고, 펼쳐서 그 안에 파일을 추가/수정/삭제/인쇄.
//   - 파일 "인쇄"는 same-origin 프록시 iframe으로 관리자 페이지에서 바로 인쇄.
// SUPER_ADMIN 전용 페이지에서 렌더된다.
// ============================================================================

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Reorder } from "framer-motion";
import { toast } from "sonner";
import { FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AdminEmptyState,
  PageHeader,
  ResultCount,
  useConfirm,
} from "@/components/admin/kit";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import {
  addOfflineMarketingCategory,
  removeOfflineMarketingCategory,
  deleteOfflineMarketingAsset,
  deleteOfflineMarketingCampaign,
  reorderOfflineMarketingCampaigns,
  toggleOfflineMarketingCampaignActive,
  type OfflineMarketingAssetDto,
  type OfflineMarketingCampaignDto,
} from "@/actions/admin-offline-marketing";
import { CampaignEditorModal } from "./campaign-editor-modal";
import { FileEditorModal } from "./file-editor-modal";
import { assetFileUrl } from "./shared";
import { CampaignCard } from "./offline-marketing-client-parts/campaign-card";
import { CampaignFilterBar } from "./offline-marketing-client-parts/campaign-filter-bar";

export function OfflineMarketingClient({
  initial,
  initialCategories,
}: {
  initial: OfflineMarketingCampaignDto[];
  initialCategories: string[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [campaigns, setCampaigns] = useState(initial);
  const [categories, setCategories] = useState(initialCategories);
  // 검색은 타이핑 즉시 표시값 갱신 + 250ms 뒤 커밋(라이브 필터).
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const { schedule, flush } = useSearchDebounce(setQuery);
  const [activeCategory, setActiveCategory] = useState("전체");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initial.map((c) => c.id)));
  const [, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [categoryBusy, setCategoryBusy] = useState(false);

  // 캠페인 편집 모달 상태
  const [campaignEditorOpen, setCampaignEditorOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<OfflineMarketingCampaignDto | null>(null);
  // 파일 편집/업로드 모달 상태
  const [fileEditorOpen, setFileEditorOpen] = useState(false);
  const [fileTargetCampaignId, setFileTargetCampaignId] = useState<string | null>(null);
  const [editingAsset, setEditingAsset] = useState<OfflineMarketingAssetDto | null>(null);

  // 서버 refresh 로 새 데이터가 오면 로컬 목록 동기화(펼침 상태는 유지).
  useEffect(() => {
    setCampaigns(initial);
  }, [initial]);
  useEffect(() => {
    setCategories(initialCategories);
  }, [initialCategories]);

  // 필터 바 = "전체" + 관리 분류 ∪ 실제 사용 중 분류(칩 순서 유지).
  const filterCategories = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = ["전체"];
    for (const c of [...categories, ...campaigns.map((x) => x.category)]) {
      if (c && !seen.has(c)) {
        seen.add(c);
        out.push(c);
      }
    }
    return out;
  }, [campaigns, categories]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      if (activeCategory !== "전체" && c.category !== activeCategory) return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q) ||
        c.assets.some(
          (a) => a.title.toLowerCase().includes(q) || a.fileName.toLowerCase().includes(q),
        )
      );
    });
  }, [campaigns, activeCategory, q]);

  const canReorder = activeCategory === "전체" && !q;
  const totalFiles = campaigns.reduce((n, c) => n + c.assets.length, 0);

  function handleSearch(value: string) {
    setSearchInput(value);
    if (value.trim() === "") flush("");
    else schedule(value);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCreateCampaign() {
    setEditingCampaign(null);
    setCampaignEditorOpen(true);
  }
  function openEditCampaign(c: OfflineMarketingCampaignDto) {
    setEditingCampaign(c);
    setCampaignEditorOpen(true);
  }
  function openAddFile(campaignId: string) {
    setFileTargetCampaignId(campaignId);
    setEditingAsset(null);
    setExpanded((prev) => new Set(prev).add(campaignId));
    setFileEditorOpen(true);
  }
  function openEditFile(a: OfflineMarketingAssetDto) {
    setFileTargetCampaignId(a.campaignId);
    setEditingAsset(a);
    setFileEditorOpen(true);
  }

  // ─── 인쇄 (same-origin 프록시 iframe) ──────────────────────────────────────
  function handlePrint(a: OfflineMarketingAssetDto) {
    toast.info("인쇄 창을 여는 중...");
    const iframe = document.createElement("iframe");
    iframe.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    iframe.src = assetFileUrl(a.id);
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        window.open(assetFileUrl(a.id), "_blank", "noopener,noreferrer");
      }
      window.setTimeout(() => iframe.remove(), 60_000);
    };
    iframe.onerror = () => {
      window.open(assetFileUrl(a.id), "_blank", "noopener,noreferrer");
      iframe.remove();
    };
    document.body.appendChild(iframe);
  }

  function handleToggleCampaign(c: OfflineMarketingCampaignDto) {
    const next = !c.isActive;
    setCampaigns((prev) => prev.map((x) => (x.id === c.id ? { ...x, isActive: next } : x)));
    startTransition(async () => {
      const res = await toggleOfflineMarketingCampaignActive(c.id, next);
      if (!res.success) {
        toast.error(res.error);
        setCampaigns((prev) =>
          prev.map((x) => (x.id === c.id ? { ...x, isActive: c.isActive } : x)),
        );
      }
    });
  }

  async function handleDeleteCampaign(c: OfflineMarketingCampaignDto) {
    const ok = await confirm({
      title: `"${c.title}" 홍보를 삭제할까요?`,
      description:
        c.assets.length > 0
          ? `안에 있는 파일 ${c.assets.length}개도 함께 삭제됩니다. 삭제하면 되돌릴 수 없습니다.`
          : "삭제하면 되돌릴 수 없습니다.",
      confirmLabel: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    setPendingId(c.id);
    startTransition(async () => {
      const res = await deleteOfflineMarketingCampaign(c.id);
      setPendingId(null);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setCampaigns((prev) => prev.filter((x) => x.id !== c.id));
      toast.success("삭제했어요.");
    });
  }

  async function handleDeleteAsset(a: OfflineMarketingAssetDto) {
    const ok = await confirm({
      title: `"${a.title}" 파일을 삭제할까요?`,
      description: "삭제하면 되돌릴 수 없습니다.",
      confirmLabel: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    setPendingId(a.id);
    startTransition(async () => {
      const res = await deleteOfflineMarketingAsset(a.id);
      setPendingId(null);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === a.campaignId ? { ...c, assets: c.assets.filter((x) => x.id !== a.id) } : c,
        ),
      );
      toast.success("삭제했어요.");
    });
  }

  async function handleRemoveCategory(cat: string) {
    const ok = await confirm({
      title: `"${cat}" 분류를 목록에서 삭제할까요?`,
      description: "사용 중인 분류는 삭제할 수 없습니다.",
      confirmLabel: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    setCategoryBusy(true);
    const res = await removeOfflineMarketingCategory(cat);
    setCategoryBusy(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    setCategories(res.categories);
    if (activeCategory === cat) setActiveCategory("전체");
    toast.success("분류를 삭제했어요.");
  }

  async function handleAddCategory(value: string): Promise<boolean> {
    setCategoryBusy(true);
    const res = await addOfflineMarketingCategory(value);
    setCategoryBusy(false);
    if (!res.success) {
      toast.error(res.error);
      return false;
    }
    setCategories(res.categories);
    toast.success(`"${value}" 분류를 추가했어요.`);
    return true;
  }

  function commitOrder(next: OfflineMarketingCampaignDto[]) {
    setCampaigns(next);
    startTransition(async () => {
      const res = await reorderOfflineMarketingCampaigns(next.map((c) => c.id));
      if (!res.success) toast.error(res.error);
    });
  }

  function renderCampaign(c: OfflineMarketingCampaignDto, draggable: boolean) {
    return (
      <CampaignCard
        campaign={c}
        draggable={draggable}
        open={expanded.has(c.id)}
        pending={pendingId === c.id}
        pendingAssetId={pendingId}
        onToggleExpand={() => toggleExpand(c.id)}
        onAddFile={() => openAddFile(c.id)}
        onEdit={() => openEditCampaign(c)}
        onToggleActive={() => handleToggleCampaign(c)}
        onDelete={() => void handleDeleteCampaign(c)}
        onPrintAsset={handlePrint}
        onEditAsset={openEditFile}
        onDeleteAsset={(a) => void handleDeleteAsset(a)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="오프라인 홍보"
        description="전단지·세미나 자료·학습지 샘플·캠페인 이미지를 홍보별로 관리합니다. PDF는 바로 인쇄하고, 이미지는 미리보거나 내려받을 수 있습니다."
        actions={
          <Button onClick={openCreateCampaign}>
            <Plus className="size-4" />홍보 등록
          </Button>
        }
      />

      <CampaignFilterBar
        searchInput={searchInput}
        onSearch={handleSearch}
        categories={filterCategories}
        activeCategory={activeCategory}
        onCategory={setActiveCategory}
        onAddCategory={handleAddCategory}
        onRemoveCategory={(cat) => void handleRemoveCategory(cat)}
        busy={categoryBusy}
        right={
          <>
            <ResultCount total={filtered.length} />
            <span className="text-[12px] text-gray-400">
              · 파일 <span className="font-semibold tabular-nums text-gray-700">{totalFiles}</span>
            </span>
          </>
        }
      />

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white">
          <AdminEmptyState
            icon={FolderOpen}
            title={campaigns.length === 0 ? "등록된 홍보가 없어요" : "조건에 맞는 홍보가 없어요"}
            description={
              campaigns.length === 0
                ? "홍보를 만들고 전단지·샘플 파일을 담아보세요."
                : "검색어나 분류를 바꿔보세요."
            }
            action={
              campaigns.length === 0 ? (
                <Button size="sm" onClick={openCreateCampaign}>
                  <Plus className="size-4" />첫 홍보 만들기
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : canReorder ? (
        <Reorder.Group axis="y" values={filtered} onReorder={commitOrder} className="space-y-3">
          {filtered.map((c) => (
            <Reorder.Item key={c.id} value={c} className="list-none">
              {renderCampaign(c, true)}
            </Reorder.Item>
          ))}
        </Reorder.Group>
      ) : (
        <div className="space-y-3">{filtered.map((c) => renderCampaign(c, false))}</div>
      )}

      <CampaignEditorModal
        open={campaignEditorOpen}
        onOpenChange={setCampaignEditorOpen}
        campaign={editingCampaign}
        categories={categories}
        onCategoriesChange={setCategories}
        onSaved={() => router.refresh()}
      />
      <FileEditorModal
        open={fileEditorOpen}
        onOpenChange={setFileEditorOpen}
        campaignId={fileTargetCampaignId}
        asset={editingAsset}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
