"use client";

// ============================================================================
// 오프라인 홍보 관리 — 관리자 콘솔. 2단 구조.
//   홍보(캠페인) 1개 → 홍보물 파일(PDF) N개.
//   - 홍보를 만들고, 펼쳐서 그 안에 파일을 추가/수정/삭제/인쇄.
//   - 파일 "인쇄"는 same-origin 프록시 iframe으로 관리자 페이지에서 바로 인쇄.
// SUPER_ADMIN 전용 페이지에서 렌더된다.
// ============================================================================

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Reorder } from "framer-motion";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  Download,
  Eye,
  FileText,
  FolderOpen,
  GripVertical,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  X,
} from "lucide-react";
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
import { assetFileUrl, formatBytes } from "./shared";

export function OfflineMarketingClient({
  initial,
  initialCategories,
}: {
  initial: OfflineMarketingCampaignDto[];
  initialCategories: string[];
}) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState(initial);
  const [categories, setCategories] = useState(initialCategories);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("전체");
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(initial.map((c) => c.id)),
  );
  const [, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  // 필터 바에서 새 분류(태그) 추가
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [categoryBusy, setCategoryBusy] = useState(false);

  // 캠페인 편집 모달 상태
  const [campaignEditorOpen, setCampaignEditorOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] =
    useState<OfflineMarketingCampaignDto | null>(null);
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
          (a) =>
            a.title.toLowerCase().includes(q) || a.fileName.toLowerCase().includes(q),
        )
      );
    });
  }, [campaigns, activeCategory, q]);

  const canReorder = activeCategory === "전체" && !q;
  const totalFiles = campaigns.reduce((n, c) => n + c.assets.length, 0);

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
    setCampaigns((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, isActive: next } : x)),
    );
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

  function handleDeleteCampaign(c: OfflineMarketingCampaignDto) {
    const msg =
      c.assets.length > 0
        ? `"${c.title}" 홍보를 삭제할까요?\n안에 있는 파일 ${c.assets.length}개도 함께 삭제됩니다.`
        : `"${c.title}" 홍보를 삭제할까요?`;
    if (!window.confirm(msg)) return;
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

  function handleDeleteAsset(a: OfflineMarketingAssetDto) {
    if (!window.confirm(`"${a.title}" 파일을 삭제할까요?`)) return;
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
          c.id === a.campaignId
            ? { ...c, assets: c.assets.filter((x) => x.id !== a.id) }
            : c,
        ),
      );
      toast.success("삭제했어요.");
    });
  }

  async function handleRemoveCategory(cat: string) {
    if (!window.confirm(`"${cat}" 분류를 목록에서 삭제할까요?`)) return;
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

  async function handleAddCategory() {
    const value = newCategory.trim();
    if (!value) {
      setAddingCategory(false);
      return;
    }
    setCategoryBusy(true);
    const res = await addOfflineMarketingCategory(value);
    setCategoryBusy(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    setCategories(res.categories);
    setNewCategory("");
    setAddingCategory(false);
    toast.success(`"${value}" 분류를 추가했어요.`);
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
        onDelete={() => handleDeleteCampaign(c)}
        onPrintAsset={handlePrint}
        onEditAsset={openEditFile}
        onDeleteAsset={handleDeleteAsset}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* 툴바 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-300" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="홍보·파일 이름 검색"
            className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-9! pr-3 text-[13px] outline-none placeholder:text-gray-400 focus:border-blue-300"
          />
        </div>
        <button
          onClick={openCreateCampaign}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-[13px] font-semibold text-white hover:bg-blue-700"
        >
          <Plus className="size-4" />
          홍보 등록
        </button>
      </div>

      {/* 분류 필터 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {filterCategories.map((cat) => {
          const active = activeCategory === cat;
          const deletable = cat !== "전체";
          return (
            <span key={cat} className="group relative inline-flex">
              <button
                onClick={() => setActiveCategory(cat)}
                className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  active
                    ? "border-blue-200 bg-blue-50 text-blue-600"
                    : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                }`}
              >
                {cat}
              </button>
              {/* 마우스 오버 시 오른쪽 위에 삭제 버튼(사용 중인 분류는 서버가 차단) */}
              {deletable && (
                <button
                  type="button"
                  onClick={() => void handleRemoveCategory(cat)}
                  disabled={categoryBusy}
                  title="분류 삭제"
                  aria-label={`${cat} 분류 삭제`}
                  className="absolute -right-1.5 -top-1.5 hidden size-4 place-items-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-sm hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50 group-hover:grid"
                >
                  <X className="size-2.5" />
                </button>
              )}
            </span>
          );
        })}

        {/* 분류(태그) 추가 — 기타 오른쪽 인라인 버튼 */}
        {addingCategory ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-white py-0.5 pl-2 pr-1">
            <input
              autoFocus
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleAddCategory();
                } else if (e.key === "Escape") {
                  setAddingCategory(false);
                  setNewCategory("");
                }
              }}
              placeholder="새 분류"
              disabled={categoryBusy}
              maxLength={60}
              className="w-24 bg-transparent px-1 text-[12px] outline-none placeholder:text-gray-400"
            />
            <button
              type="button"
              onClick={() => void handleAddCategory()}
              disabled={categoryBusy || !newCategory.trim()}
              title="추가"
              className="grid size-5 place-items-center rounded-full text-blue-500 hover:bg-blue-50 disabled:opacity-40"
            >
              <Check className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setAddingCategory(false);
                setNewCategory("");
              }}
              disabled={categoryBusy}
              title="취소"
              className="grid size-5 place-items-center rounded-full text-gray-400 hover:bg-gray-100"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAddingCategory(true)}
            title="분류 추가"
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-[12px] font-medium text-gray-500 hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-600"
          >
            <Plus className="size-3.5" />
            분류 추가
          </button>
        )}

        <span className="ml-auto text-[12px] text-gray-400">
          홍보 {campaigns.length} · 파일 {totalFiles}
        </span>
      </div>

      {/* 목록 */}
      {filtered.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 py-16 text-center">
          <FolderOpen className="mb-2 size-8 text-gray-300" strokeWidth={1.5} />
          <p className="text-[14px] font-medium text-gray-500">
            {campaigns.length === 0 ? "등록된 홍보가 없어요." : "조건에 맞는 홍보가 없어요."}
          </p>
          {campaigns.length === 0 && (
            <button
              onClick={openCreateCampaign}
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 text-[13px] font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="size-4" />첫 홍보 만들기
            </button>
          )}
        </div>
      ) : canReorder ? (
        <Reorder.Group
          axis="y"
          values={filtered}
          onReorder={commitOrder}
          className="space-y-3"
        >
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

// ─── 홍보 카드(캠페인 + 파일 목록) ────────────────────────────────────────────
function CampaignCard({
  campaign,
  draggable,
  open,
  pending,
  pendingAssetId,
  onToggleExpand,
  onAddFile,
  onEdit,
  onToggleActive,
  onDelete,
  onPrintAsset,
  onEditAsset,
  onDeleteAsset,
}: {
  campaign: OfflineMarketingCampaignDto;
  draggable: boolean;
  open: boolean;
  pending: boolean;
  pendingAssetId: string | null;
  onToggleExpand: () => void;
  onAddFile: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onPrintAsset: (a: OfflineMarketingAssetDto) => void;
  onEditAsset: (a: OfflineMarketingAssetDto) => void;
  onDeleteAsset: (a: OfflineMarketingAssetDto) => void;
}) {
  const c = campaign;
  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-white transition-colors ${
        c.isActive ? "border-gray-100" : "border-gray-100 opacity-60"
      } ${pending ? "pointer-events-none opacity-50" : ""}`}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-2.5 p-3 sm:p-3.5">
        {draggable && (
          <button
            className="hidden cursor-grab touch-none text-gray-300 hover:text-gray-500 active:cursor-grabbing sm:block"
            aria-label="드래그로 순서 변경"
          >
            <GripVertical className="size-4" />
          </button>
        )}

        <button
          onClick={onToggleExpand}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-amber-100 bg-amber-50 text-amber-500">
            <FolderOpen className="size-5" strokeWidth={1.7} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-[14px] font-bold text-gray-900">{c.title}</span>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                {c.category}
              </span>
              <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-500">
                파일 {c.assets.length}
              </span>
              {!c.isActive && (
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-400">
                  비활성
                </span>
              )}
            </span>
            {c.description && (
              <span className="mt-0.5 block truncate text-[12px] text-gray-500">
                {c.description}
              </span>
            )}
          </span>
          <ChevronDown
            className={`size-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {/* 캠페인 액션 */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onAddFile}
            title="파일 추가"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-[12px] font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">파일</span>
          </button>
          <button
            onClick={onToggleActive}
            title={c.isActive ? "비활성화" : "활성화"}
            className={`h-9 rounded-xl border px-2.5 text-[11px] font-medium ${
              c.isActive
                ? "border-gray-200 text-gray-500 hover:bg-gray-50"
                : "border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
            }`}
          >
            {c.isActive ? "끄기" : "켜기"}
          </button>
          <button
            onClick={onEdit}
            title="홍보 수정"
            className="grid size-9 place-items-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
          >
            <Pencil className="size-4" />
          </button>
          <button
            onClick={onDelete}
            title="홍보 삭제"
            className="grid size-9 place-items-center rounded-xl border border-gray-200 text-gray-400 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {/* 파일 목록(펼침) */}
      {open && (
        <div className="border-t border-gray-100 bg-gray-50/40 px-3 py-3 sm:px-3.5">
          {c.assets.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <FileText className="size-6 text-gray-300" strokeWidth={1.5} />
              <p className="text-[12px] text-gray-400">아직 파일이 없어요.</p>
              <button
                onClick={onAddFile}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-[12px] font-semibold text-blue-600 hover:bg-blue-50"
              >
                <Plus className="size-3.5" />첫 파일 추가
              </button>
            </div>
          ) : (
            <ul className="space-y-2">
              {c.assets.map((a) => (
                <AssetRow
                  key={a.id}
                  asset={a}
                  pending={pendingAssetId === a.id}
                  onPrint={() => onPrintAsset(a)}
                  onEdit={() => onEditAsset(a)}
                  onDelete={() => onDeleteAsset(a)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 파일 한 줄 ──────────────────────────────────────────────────────────────
function AssetRow({
  asset,
  pending,
  onPrint,
  onEdit,
  onDelete,
}: {
  asset: OfflineMarketingAssetDto;
  pending: boolean;
  onPrint: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = [
    formatBytes(asset.fileSize),
    asset.pageCount ? `${asset.pageCount}쪽` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      className={`flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-2.5 ${
        pending ? "pointer-events-none opacity-50" : ""
      }`}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-rose-100 bg-rose-50 text-rose-500">
        <FileText className="size-4" strokeWidth={1.7} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-gray-800">{asset.title}</div>
        <div className="truncate text-[11px] text-gray-400">
          {asset.fileName}
          {meta && <span className="text-gray-300"> · {meta}</span>}
        </div>
        {asset.description && (
          <div className="truncate text-[11px] text-gray-400">{asset.description}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={onPrint}
          title="인쇄"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 text-[12px] font-semibold text-white hover:bg-blue-700"
        >
          <Printer className="size-3.5" />
          <span className="hidden sm:inline">인쇄</span>
        </button>
        <a
          href={assetFileUrl(asset.id)}
          target="_blank"
          rel="noopener noreferrer"
          title="미리보기(새 탭)"
          className="grid size-8 place-items-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
        >
          <Eye className="size-3.5" />
        </a>
        <a
          href={assetFileUrl(asset.id, true)}
          title="다운로드"
          className="grid size-8 place-items-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
        >
          <Download className="size-3.5" />
        </a>
        <button
          onClick={onEdit}
          title="파일 수정"
          className="grid size-8 place-items-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          onClick={onDelete}
          title="파일 삭제"
          className="grid size-8 place-items-center rounded-lg border border-gray-200 text-gray-400 hover:bg-rose-50 hover:text-rose-600"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </li>
  );
}
