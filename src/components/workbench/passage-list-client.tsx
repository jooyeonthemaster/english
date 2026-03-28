// @ts-nocheck
"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronDown,
  Cpu,
  CheckCircle2,
  Clock,
  Upload,
  Layers,
  Check,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
  BookOpen,
  PenTool,
  Braces,
  Grid2x2,
  List,
  ArrowUpDown,
  Copy,
  Move,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatDate, truncate, getSemesterLabel } from "@/lib/utils";
import { PassageImportDialog } from "@/components/workbench/passage-import-dialog";
import { PassageAnalysisModal } from "@/components/workbench/passage-analysis-modal";
import type { PassageAnalysisData } from "@/types/passage-analysis";
import {
  createPassageCollection,
  updatePassageCollection,
  deletePassageCollection,
  addPassagesToCollection,
  removePassagesFromCollection,
} from "@/actions/workbench";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────
interface PassageItem {
  id: string;
  title: string;
  content: string;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  difficulty: string | null;
  tags: string | null;
  createdAt: Date;
  school: { id: string; name: string; type: string } | null;
  analysis: { id: string; updatedAt: Date; analysisData?: string | null } | null;
  _count: { questions: number; notes: number };
}

interface CollectionItem {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  color: string | null;
  _count: { items: number; children: number };
}

interface PassageListProps {
  passagesData: {
    passages: PassageItem[];
    total: number;
    page: number;
    totalPages: number;
  };
  schools: Array<{
    id: string;
    name: string;
    type: string;
    publisher: string | null;
  }>;
  filters: {
    page: number;
    schoolId?: string;
    grade?: number;
    semester?: string;
    publisher?: string;
    search?: string;
  };
  collections: CollectionItem[];
  /** passageIds belonging to each collection, keyed by collectionId */
  collectionMembership: Record<string, Set<string>>;
}

// ─── Helpers ─────────────────────────────────────────────
function parseAnalysis(analysis: PassageItem["analysis"]) {
  if (!analysis?.analysisData) return null;
  try {
    return typeof analysis.analysisData === "string" ? JSON.parse(analysis.analysisData) : analysis.analysisData;
  } catch { return null; }
}

const FOLDER_COLORS = [
  "#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b",
  "#ec4899", "#6366f1", "#14b8a6", "#f97316", "#64748b",
];

// ─── Passage File Row (List view) ─────────────────────────
function PassageFileRow({
  passage,
  selected,
  onToggleSelect,
}: {
  passage: PassageItem;
  selected: boolean;
  onToggleSelect: (id: string, shift: boolean) => void;
}) {
  const data = parseAnalysis(passage.analysis);
  const isAnalyzed = !!passage.analysis;
  const vocabCount = data?.vocabulary?.length ?? 0;
  const grammarCount = data?.grammarPoints?.length ?? 0;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all hover:shadow-sm cursor-pointer group ${
        selected ? "bg-blue-50 border-blue-300" : "bg-white border-slate-200 hover:border-slate-300"
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(passage.id, e.shiftKey); }}
        className={`w-[18px] h-[18px] rounded flex items-center justify-center shrink-0 transition-all ${
          selected ? "bg-blue-600 text-white border border-blue-600" : "bg-white border border-slate-300 text-transparent hover:border-blue-400 hover:text-blue-400"
        }`}
      >
        <Check className="w-3 h-3" />
      </button>

      {/* File icon */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isAnalyzed ? "bg-blue-50" : "bg-slate-50"}`}>
        <FileText className={`w-4 h-4 ${isAnalyzed ? "text-blue-500" : "text-slate-400"}`} />
      </div>

      {/* Title + metadata */}
      <Link href={`/director/workbench/passages/${passage.id}`} className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-slate-800 truncate group-hover:text-blue-600 transition-colors">
          {passage.title}
        </p>
      </Link>

      {/* Tags */}
      <div className="flex items-center gap-1.5 shrink-0">
        {passage.school && (
          <Badge variant="outline" className="text-[9px] h-5 px-1.5">{passage.school.name}</Badge>
        )}
        {passage.grade && (
          <Badge variant="secondary" className="text-[9px] h-5 px-1.5">{passage.grade}학년</Badge>
        )}
      </div>

      {/* Analysis counts */}
      {isAnalyzed && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-blue-500 font-medium flex items-center gap-0.5">
            <BookOpen className="w-3 h-3" />{vocabCount}
          </span>
          <span className="text-[10px] text-violet-500 font-medium flex items-center gap-0.5">
            <PenTool className="w-3 h-3" />{grammarCount}
          </span>
        </div>
      )}

      {/* Status */}
      <div className="shrink-0 w-20 text-right">
        {isAnalyzed ? (
          <span className="text-[10px] font-medium text-emerald-600">분석 완료</span>
        ) : (
          <span className="text-[10px] font-medium text-slate-400">분석 대기</span>
        )}
      </div>

      {/* Date */}
      <span className="text-[10px] text-slate-400 shrink-0 w-20 text-right">
        {formatDate(passage.createdAt)}
      </span>
    </div>
  );
}

// ─── Passage File Card (Grid view) — matches PassageQueueCard style ──
function PassageFileCard({
  passage,
  selected,
  onToggleSelect,
  onViewDetail,
}: {
  passage: PassageItem;
  selected: boolean;
  onToggleSelect: (id: string, shift: boolean) => void;
  onViewDetail: (id: string) => void;
}) {
  const data = parseAnalysis(passage.analysis);
  const isAnalyzed = !!passage.analysis;
  const vocabCount = data?.vocabulary?.length ?? 0;
  const grammarCount = data?.grammarPoints?.length ?? 0;
  const syntaxCount = data?.syntaxAnalysis?.length ?? 0;
  const keySentenceCount = data?.structure?.topicSentenceIndex != null ? 1 : 0;
  const examPointCount = (data?.examDesign?.paraphrasableSegments?.length ?? 0) + (data?.examDesign?.structureTransformPoints?.length ?? 0);
  const mainIdea = data?.structure?.mainIdea;
  const wordCount = passage.content.trim().split(/\s+/).filter((w: string) => w.length > 0).length;

  const borderColor = isAnalyzed ? "border-emerald-200" : "border-slate-200";
  const dragRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const el = dragRef.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => ({ passageId: passage.id, title: passage.title, type: "passage" }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [passage.id, passage.title]);

  return (
    <div
      ref={dragRef}
      onClick={() => onViewDetail(passage.id)}
      className={`group relative rounded-xl border ${borderColor} bg-white p-4 transition-all duration-200 hover:shadow-md cursor-pointer ${
        selected ? "ring-2 ring-blue-400" : ""
      } ${isDragging ? "opacity-40 scale-95" : ""}
      }`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(passage.id, e.shiftKey); }}
              className={`w-[18px] h-[18px] rounded flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                selected ? "bg-blue-600 text-white border border-blue-600" : "bg-white border border-slate-300 text-transparent hover:border-blue-400 hover:text-blue-400"
              }`}
            >
              <Check className="w-3 h-3" />
            </button>
            <div className="min-w-0 flex-1">
              <h4 className="text-[13px] font-semibold text-slate-800 truncate group-hover:text-blue-600 transition-colors">
                {passage.title}
              </h4>
              <div className="flex items-center gap-1.5 mt-0.5">
                {isAnalyzed ? (
                  <span className="text-[10px] font-medium text-emerald-600">분석 완료</span>
                ) : (
                  <span className="text-[10px] font-medium text-slate-400">분석 대기</span>
                )}
                <span className="text-[10px] text-slate-400">{wordCount} words</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content preview */}
        <p className="text-[11px] text-slate-500 leading-relaxed mt-2.5 line-clamp-3">
          {passage.content.length > 200 ? passage.content.slice(0, 200) + "..." : passage.content}
        </p>

        {/* Metadata badges */}
        {(passage.school || passage.grade || passage.unit || passage.publisher) && (
          <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
            {passage.school && <Badge variant="outline" className="text-[9px] h-5 px-1.5 font-medium">{passage.school.name}</Badge>}
            {passage.grade && <Badge variant="secondary" className="text-[9px] h-5 px-1.5">{passage.grade}학년</Badge>}
            {passage.semester && <Badge variant="secondary" className="text-[9px] h-5 px-1.5">{getSemesterLabel(passage.semester)}</Badge>}
            {passage.unit && <Badge variant="secondary" className="text-[9px] h-5 px-1.5">{passage.unit}</Badge>}
            {passage.publisher && <Badge variant="outline" className="text-[9px] h-5 px-1.5 text-slate-500">{passage.publisher}</Badge>}
          </div>
        )}

        {/* Analysis summary */}
        {isAnalyzed && mainIdea && (
          <p className="text-[11px] text-slate-500 leading-relaxed mt-2 line-clamp-2">{mainIdea}</p>
        )}

        {/* 5-layer analysis badges */}
        {isAnalyzed && (
          <div className="flex items-center gap-2 flex-wrap mt-2">
            {vocabCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                <BookOpen className="w-3 h-3" />어휘 {vocabCount}
              </span>
            )}
            {grammarCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">
                <PenTool className="w-3 h-3" />문법 {grammarCount}
              </span>
            )}
            {syntaxCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded">
                <Braces className="w-3 h-3" />구문 {syntaxCount}
              </span>
            )}
            {keySentenceCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                핵심문장 {keySentenceCount}
              </span>
            )}
            {examPointCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                출제포인트 {examPointCount}
              </span>
            )}
          </div>
        )}

        {/* Click hint */}
        <div className="absolute bottom-2 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[9px] text-blue-500 font-medium">클릭하여 상세 보기</span>
        </div>
    </div>
  );
}

// ─── Folder Card ──────────────────────────────────────────
function FolderCard({
  collection,
  selected,
  onClick,
  onRename,
  onDelete,
  onFileDrop,
}: {
  collection: CollectionItem;
  selected: boolean;
  onClick: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onFileDrop: (passageId: string, folderId: string, copy: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(collection.name);
  const [showMenu, setShowMenu] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const color = collection.color || FOLDER_COLORS[collection.name.charCodeAt(0) % FOLDER_COLORS.length];

  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === "passage",
      onDragEnter: () => setIsDragOver(true),
      onDragLeave: () => setIsDragOver(false),
      onDrop: ({ source }) => {
        setIsDragOver(false);
        const passageId = source.data.passageId as string;
        // Check if Shift was held during drag for copy mode
        const isCopy = (window.event as DragEvent | null)?.shiftKey ?? false;
        onFileDrop(passageId, collection.id, isCopy);
      },
    });
  }, [collection.id, onFileDrop]);

  return (
    <div
      ref={dropRef}
      onClick={editing ? undefined : onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all hover:shadow-sm group ${
        isDragOver
          ? "bg-blue-50 border-blue-400 border-2 scale-[1.02] shadow-md"
          : selected
          ? "bg-blue-50 border-blue-300"
          : "bg-white border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors" style={{ backgroundColor: isDragOver ? `${color}30` : `${color}15` }}>
        {isDragOver ? (
          <FolderOpen className="w-5 h-5" style={{ color }} />
        ) : (
          <Folder className="w-5 h-5" style={{ color }} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => { onRename(collection.id, name); setEditing(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { onRename(collection.id, name); setEditing(false); }
              if (e.key === "Escape") { setName(collection.name); setEditing(false); }
            }}
            className="text-[13px] font-semibold w-full outline-none border-b border-blue-400 bg-transparent"
          />
        ) : (
          <p className="text-[13px] font-semibold text-slate-800 truncate">{collection.name}</p>
        )}
        <p className="text-[11px] text-slate-400 mt-0.5">{collection._count.items}개 지문</p>
      </div>

      {/* Context menu */}
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-slate-100 transition-all"
        >
          <MoreHorizontal className="w-4 h-4 text-slate-400" />
        </button>
        {showMenu && (
          <div className="absolute right-0 top-8 z-20 w-36 bg-white rounded-lg border border-slate-200 shadow-lg py-1">
            <button
              onClick={() => { setEditing(true); setShowMenu(false); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="w-3 h-3" />이름 변경
            </button>
            <button
              onClick={() => { onDelete(collection.id); setShowMenu(false); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-3 h-3" />삭제
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────
export function PassageListClient({
  passagesData,
  schools,
  filters,
  collections: initialCollections,
  collectionMembership: initialMembership,
}: PassageListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(filters.search || "");
  const [importOpen, setImportOpen] = useState(false);
  const [viewType, setViewType] = useState<"grid" | "list">("grid");

  // Collections
  const [collections, setCollections] = useState<CollectionItem[]>(initialCollections || []);
  const [membership, setMembership] = useState<Record<string, Set<string>>>(initialMembership || {});
  const [activeFolder, setActiveFolder] = useState<string | null>(null); // null = root (all)
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [showAddToFolder, setShowAddToFolder] = useState(false);

  // Modal
  const [modalPassageId, setModalPassageId] = useState<string | null>(null);

  // Stats
  const totalCount = passagesData.total;
  const analyzedCount = passagesData.passages.filter((p) => p.analysis).length;

  // ─── Nested folder helpers ───
  // Child folders of current active folder
  const childFolders = useMemo(() => {
    return collections.filter((c) => c.parentId === activeFolder);
  }, [collections, activeFolder]);

  // Breadcrumb path: walk up parentId chain
  const breadcrumbPath = useMemo(() => {
    if (!activeFolder) return [];
    const path: CollectionItem[] = [];
    let current = collections.find((c) => c.id === activeFolder);
    while (current) {
      path.unshift(current);
      current = current.parentId ? collections.find((c) => c.id === current!.parentId) : undefined;
    }
    return path;
  }, [activeFolder, collections]);

  // ─── Passages belonging to a collection (or "loose" files) ───
  const passagesInActiveFolder = useMemo(() => {
    if (activeFolder === null) return passagesData.passages; // root = all
    if (activeFolder === "__uncategorized__") {
      // Passages not in ANY collection
      const allMemberIds = new Set<string>();
      Object.values(membership).forEach((ids) => ids.forEach((id) => allMemberIds.add(id)));
      return passagesData.passages.filter((p) => !allMemberIds.has(p.id));
    }
    const ids = membership[activeFolder];
    if (!ids) return [];
    return passagesData.passages.filter((p) => ids.has(p.id));
  }, [passagesData.passages, activeFolder, membership]);

  // Loose passages (not in any collection) — shown alongside folders in root
  const loosePassages = useMemo(() => {
    const allMemberIds = new Set<string>();
    Object.values(membership).forEach((ids) => ids.forEach((id) => allMemberIds.add(id)));
    return passagesData.passages.filter((p) => !allMemberIds.has(p.id));
  }, [passagesData.passages, membership]);

  // ─── Filters ───
  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "ALL") params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`/director/workbench/passages?${params.toString()}`);
  }

  function handleSearch() { updateFilter("search", searchValue); }

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    router.push(`/director/workbench/passages?${params.toString()}`);
  }

  // ─── Selection ───
  const displayedPassages = activeFolder === null ? passagesData.passages : passagesInActiveFolder;

  const toggleSelect = useCallback((id: string, shiftKey: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedId) {
        const ids = displayedPassages.map((p) => p.id);
        const a = ids.indexOf(lastSelectedId);
        const b = ids.indexOf(id);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(ids[i]);
        }
      } else {
        if (next.has(id)) next.delete(id); else next.add(id);
      }
      return next;
    });
    setLastSelectedId(id);
  }, [lastSelectedId, displayedPassages]);

  const selectAll = () => {
    if (selectedIds.size === displayedPassages.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(displayedPassages.map((p) => p.id)));
  };

  // ─── Collection CRUD ───
  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    const result = await createPassageCollection({ name: newFolderName.trim(), parentId: activeFolder || undefined });
    if (result.success) {
      setCollections((prev) => [...prev, { id: result.id!, parentId: activeFolder, name: newFolderName.trim(), description: null, color: null, _count: { items: 0, children: 0 } }]);
      setNewFolderName(""); setShowNewFolder(false);
      toast.success("폴더가 생성되었습니다.");
    }
  }

  async function handleRenameFolder(id: string, name: string) {
    if (!name.trim()) return;
    await updatePassageCollection(id, { name: name.trim() });
    setCollections((prev) => prev.map((c) => c.id === id ? { ...c, name: name.trim() } : c));
  }

  async function handleDeleteFolder(id: string) {
    if (!confirm("이 폴더를 삭제하시겠습니까? (지문은 삭제되지 않습니다)")) return;
    const result = await deletePassageCollection(id);
    if (result.success) {
      setCollections((prev) => prev.filter((c) => c.id !== id));
      setMembership((prev) => { const next = { ...prev }; delete next[id]; return next; });
      if (activeFolder === id) setActiveFolder(null);
      toast.success("폴더가 삭제되었습니다.");
    }
  }

  async function handleAddToFolder(collectionId: string) {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const result = await addPassagesToCollection(collectionId, ids);
    if (result.success) {
      setMembership((prev) => {
        const next = { ...prev };
        const existing = next[collectionId] ? new Set(next[collectionId]) : new Set<string>();
        ids.forEach((id) => existing.add(id));
        next[collectionId] = existing;
        return next;
      });
      setCollections((prev) => prev.map((c) =>
        c.id === collectionId ? { ...c, _count: { items: (membership[collectionId]?.size || 0) + ids.length } } : c
      ));
      toast.success(`${ids.length}개 지문이 폴더에 추가되었습니다.`);
      setSelectedIds(new Set());
      setShowAddToFolder(false);
    }
  }

  async function handleRemoveFromFolder() {
    if (!activeFolder || selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const result = await removePassagesFromCollection(activeFolder, ids);
    if (result.success) {
      setMembership((prev) => {
        const next = { ...prev };
        const existing = new Set(next[activeFolder!]);
        ids.forEach((id) => existing.delete(id));
        next[activeFolder!] = existing;
        return next;
      });
      toast.success(`${ids.length}개 지문이 폴더에서 제거되었습니다.`);
      setSelectedIds(new Set());
    }
  }

  // ─── Drag to folder handler ───
  const handleDragToFolder = useCallback(async (passageId: string, folderId: string, copy: boolean) => {
    // If dragged item is part of selection, move ALL selected items
    const idsToMove = selectedIds.has(passageId) ? [...selectedIds] : [passageId];

    try {
      if (!copy) {
        // Remove from all current folders first
        const removePromises: Promise<any>[] = [];
        for (const [colId, ids] of Object.entries(membership)) {
          if (colId !== folderId) {
            const toRemove = idsToMove.filter((id) => ids.has(id));
            if (toRemove.length > 0) {
              removePromises.push(removePassagesFromCollection(colId, toRemove));
            }
          }
        }
        await Promise.all(removePromises);

        // Update local membership: remove from all others, add to target
        setMembership((prev) => {
          const next: Record<string, Set<string>> = {};
          for (const [colId, ids] of Object.entries(prev)) {
            if (colId === folderId) {
              next[colId] = new Set(ids);
              idsToMove.forEach((id) => next[colId].add(id));
            } else {
              const updated = new Set(ids);
              idsToMove.forEach((id) => updated.delete(id));
              next[colId] = updated;
            }
          }
          if (!next[folderId]) next[folderId] = new Set(idsToMove);
          return next;
        });
      } else {
        // Copy: just add to target
        setMembership((prev) => {
          const next = { ...prev };
          const existing = next[folderId] ? new Set(next[folderId]) : new Set<string>();
          idsToMove.forEach((id) => existing.add(id));
          next[folderId] = existing;
          return next;
        });
      }

      await addPassagesToCollection(folderId, idsToMove);

      const folderName = collections.find((c) => c.id === folderId)?.name || "폴더";
      const countLabel = idsToMove.length > 1 ? `${idsToMove.length}개 지문이` : "지문이";
      toast.success(copy ? `${countLabel} "${folderName}"에 복사되었습니다` : `${countLabel} "${folderName}"(으)로 이동되었습니다`);

      // Clear selection after move
      setSelectedIds(new Set());

      // Update collection counts
      setCollections((prev) => prev.map((c) => {
        const newCount = membership[c.id]?.size || 0;
        return { ...c, _count: { ...c._count, items: c.id === folderId ? newCount + idsToMove.length : newCount } };
      }));
    } catch {
      toast.error("폴더 작업 중 오류가 발생했습니다.");
    }
  }, [membership, collections, selectedIds]);

  // Current folder name
  const activeFolderName = activeFolder
    ? collections.find((c) => c.id === activeFolder)?.name || "폴더"
    : null;

  return (
    <div className="flex flex-col min-h-[calc(100vh-64px)]">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          {activeFolder ? (
            <button
              onClick={() => {
                // Go to parent folder, or root if no parent
                const currentFolder = collections.find((c) => c.id === activeFolder);
                setActiveFolder(currentFolder?.parentId || null);
                setSelectedIds(new Set());
              }}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-slate-500" />
            </button>
          ) : (
            <Link href="/director/workbench">
              <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                <ArrowLeft className="w-4 h-4 text-slate-500" />
              </button>
            </Link>
          )}
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-blue-600" />
              지문 관리
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              전체 {totalCount}개 · 분석 {analyzedCount}개
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="h-9 text-[13px]">
            <Upload className="w-3.5 h-3.5 mr-1.5" />일괄 등록
          </Button>
          <Link href="/director/workbench/passages/create">
            <Button size="sm" className="h-9 text-[13px] bg-blue-600 hover:bg-blue-700">
              <Plus className="w-3.5 h-3.5 mr-1.5" />지문 등록
            </Button>
          </Link>
        </div>
      </div>

      {/* ─── Toolbar ─── */}
      <div className="px-6 py-3 bg-white border-b border-slate-100 flex items-center gap-3 shrink-0">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-[13px]">
          <button
            onClick={() => { setActiveFolder(null); setSelectedIds(new Set()); }}
            className={`px-2 py-1 rounded-md transition-colors ${!activeFolder ? "text-slate-800 font-semibold" : "text-blue-600 hover:bg-blue-50"}`}
          >
            내 지문
          </button>
          {breadcrumbPath.map((folder, i) => (
            <span key={folder.id} className="flex items-center gap-1.5">
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              {i === breadcrumbPath.length - 1 ? (
                <span className="text-slate-800 font-semibold px-2 py-1">{folder.name}</span>
              ) : (
                <button
                  onClick={() => { setActiveFolder(folder.id); setSelectedIds(new Set()); }}
                  className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-md transition-colors"
                >
                  {folder.name}
                </button>
              )}
            </span>
          ))}
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
          <input
            placeholder="검색..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-52 h-8 pl-8 pr-3 text-[12px] rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
          />
        </div>

        {/* Filters */}
        <Select value={filters.schoolId || "ALL"} onValueChange={(v) => updateFilter("schoolId", v)}>
          <SelectTrigger className="w-32 h-8 text-[12px]"><SelectValue placeholder="학교" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체 학교</SelectItem>
            {schools.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.grade ? String(filters.grade) : "ALL"} onValueChange={(v) => updateFilter("grade", v)}>
          <SelectTrigger className="w-24 h-8 text-[12px]"><SelectValue placeholder="학년" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체</SelectItem>
            <SelectItem value="1">1학년</SelectItem>
            <SelectItem value="2">2학년</SelectItem>
            <SelectItem value="3">3학년</SelectItem>
          </SelectContent>
        </Select>

        {/* View toggle */}
        <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-lg">
          <button
            onClick={() => setViewType("grid")}
            className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${viewType === "grid" ? "bg-white shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
          >
            <Grid2x2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewType("list")}
            className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${viewType === "list" ? "bg-white shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ─── Selection toolbar ─── */}
      {selectedIds.size > 0 && (
        <div className="px-6 py-2 bg-blue-50 border-b border-blue-200 flex items-center gap-3 shrink-0">
          <button onClick={selectAll} className="text-[12px] font-medium text-blue-700 flex items-center gap-1.5">
            <Check className="w-4 h-4" />
            {selectedIds.size}개 선택
          </button>
          <span className="text-slate-300">|</span>
          <button onClick={selectAll} className="text-[11px] text-blue-600 font-medium">
            {selectedIds.size === displayedPassages.length ? "선택 해제" : "전체 선택"}
          </button>
          <span className="text-slate-300">|</span>

          {/* Add to folder */}
          <div className="relative">
            <button
              onClick={() => setShowAddToFolder(!showAddToFolder)}
              className="flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-medium text-blue-700 bg-white border border-blue-200 rounded-md hover:bg-blue-50"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              폴더에 추가
            </button>
            {showAddToFolder && (
              <div className="absolute left-0 top-8 z-20 w-56 bg-white rounded-lg border border-slate-200 shadow-lg py-1">
                {collections.length === 0 ? (
                  <p className="px-3 py-2 text-[12px] text-slate-400">폴더가 없습니다.</p>
                ) : (
                  collections.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleAddToFolder(c.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-slate-700 hover:bg-blue-50 text-left"
                    >
                      <Folder className="w-3.5 h-3.5 text-slate-400" />
                      {c.name}
                      <span className="ml-auto text-[10px] text-slate-400">{c._count.items}개</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Remove from current folder */}
          {activeFolder && (
            <button
              onClick={handleRemoveFromFolder}
              className="flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-medium text-red-600 bg-white border border-red-200 rounded-md hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              폴더에서 제거
            </button>
          )}

          <div className="flex-1" />
          <button onClick={() => setSelectedIds(new Set())} className="text-[11px] text-slate-500 hover:text-slate-700">
            선택 취소
          </button>
        </div>
      )}

      {/* ─── Content ─── */}
      <div className="flex-1 overflow-y-auto bg-[#F4F6F9] px-6 py-5">
        {passagesData.passages.length === 0 ? (
          <div className="bg-white rounded-xl border text-center py-20">
            <Folder className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">등록된 지문이 없습니다</p>
            <p className="text-sm text-slate-400 mt-1">지문을 등록하여 AI 문제 생성을 시작하세요</p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Link href="/director/workbench/passages/create">
                <Button className="bg-blue-600 hover:bg-blue-700" size="sm">
                  <Plus className="w-3.5 h-3.5 mr-1.5" />지문 등록
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          /* ─── Folder view (root or nested) ─── */
          <div className="space-y-6">
            {/* Folders section — show child folders of current location */}
            {(childFolders.length > 0 || showNewFolder) && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[13px] font-semibold text-slate-600">폴더</h3>
                  {!showNewFolder && (
                    <button
                      onClick={() => setShowNewFolder(true)}
                      className="flex items-center gap-1 text-[11px] text-blue-600 font-medium hover:text-blue-700"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />새 폴더
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {showNewFolder && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-blue-300 bg-blue-50">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                        <FolderPlus className="w-5 h-5 text-blue-500" />
                      </div>
                      <div className="flex-1">
                        <input
                          autoFocus
                          placeholder="폴더 이름"
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreateFolder();
                            if (e.key === "Escape") { setShowNewFolder(false); setNewFolderName(""); }
                          }}
                          className="text-[13px] font-semibold w-full outline-none bg-transparent placeholder:text-blue-300"
                        />
                      </div>
                      <button onClick={handleCreateFolder} className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { setShowNewFolder(false); setNewFolderName(""); }} className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50">
                        <X className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    </div>
                  )}
                  {childFolders.map((c) => (
                    <FolderCard
                      key={c.id}
                      collection={c}
                      selected={false}
                      onClick={() => { setActiveFolder(c.id); setSelectedIds(new Set()); }}
                      onRename={handleRenameFolder}
                      onDelete={handleDeleteFolder}
                      onFileDrop={handleDragToFolder}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Files section — show passages for current folder context */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13px] font-semibold text-slate-600">
                  파일
                  <span className="ml-1.5 text-[11px] text-slate-400 font-normal">{displayedPassages.length}개</span>
                </h3>
                {childFolders.length === 0 && !showNewFolder && (
                  <button
                    onClick={() => setShowNewFolder(true)}
                    className="flex items-center gap-1 text-[11px] text-blue-600 font-medium hover:text-blue-700"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />새 폴더
                  </button>
                )}
              </div>
              {displayedPassages.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-[13px] text-slate-400">
                    {activeFolder ? "이 폴더에 지문이 없습니다." : "등록된 지문이 없습니다."}
                  </p>
                  {activeFolder && (
                    <p className="text-[12px] text-slate-400 mt-1">지문을 드래그하거나 선택 후 &quot;폴더에 추가&quot;를 사용하세요.</p>
                  )}
                </div>
              ) : viewType === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {displayedPassages.map((p) => (
                    <PassageFileCard key={p.id} passage={p} selected={selectedIds.has(p.id)} onToggleSelect={toggleSelect} onViewDetail={setModalPassageId} />
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {displayedPassages.map((p) => (
                    <PassageFileRow key={p.id} passage={p} selected={selectedIds.has(p.id)} onToggleSelect={toggleSelect} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pagination */}
        {passagesData.totalPages > 1 && !activeFolder && (
          <div className="flex items-center justify-center gap-2 pt-6">
            <Button variant="outline" size="sm" disabled={passagesData.page <= 1} onClick={() => goToPage(passagesData.page - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-[13px] text-slate-600 px-3">{passagesData.page} / {passagesData.totalPages}</span>
            <Button variant="outline" size="sm" disabled={passagesData.page >= passagesData.totalPages} onClick={() => goToPage(passagesData.page + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      <PassageImportDialog open={importOpen} onOpenChange={setImportOpen} />

      {/* ─── Analysis Modal ─── */}
      {modalPassageId && (() => {
        const p = passagesData.passages.find((x) => x.id === modalPassageId);
        if (!p) return null;
        let analysisData: PassageAnalysisData | null = null;
        try { if (p.analysis?.analysisData) analysisData = JSON.parse(p.analysis.analysisData as string); } catch {}
        return (
          <PassageAnalysisModal
            open={true}
            onClose={() => setModalPassageId(null)}
            passage={{
              id: p.id,
              title: p.title,
              content: p.content,
              grade: p.grade,
              semester: p.semester,
              unit: p.unit,
              publisher: p.publisher,
              difficulty: p.difficulty,
              tags: p.tags,
              source: null,
              createdAt: p.createdAt,
              school: p.school,
              analysis: p.analysis ? { id: p.analysis.id, analysisData: p.analysis.analysisData as string, contentHash: "", updatedAt: p.analysis.updatedAt } : null,
              notes: [],
              questions: [],
            }}
            initialAnalysis={analysisData}
          />
        );
      })()}
    </div>
  );
}
