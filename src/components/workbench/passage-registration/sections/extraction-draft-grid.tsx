"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Search,
  Layers,
  FileText,
  Loader2,
  AlertCircle,
  ArrowDownToLine,
  RefreshCw,
  ArrowUpDown,
  Folder,
  ChevronRight,
  Home,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { M1PassageDraftWithJob } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/types";
import { getDraftDisplayTitle } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/utils/title";
import type { DraftCollectionItem } from "../types";

interface ExtractionDraftGridProps {
  selectedDraftId: string | null;
  onSelectDraft: (draft: M1PassageDraftWithJob) => void;
  collections: DraftCollectionItem[];
  membership: Record<string, string[]>;
}

type FetchState = "idle" | "loading" | "ready" | "error";
type SortOrder = "newest" | "oldest" | "page_asc";

const STATUS_LABEL: Record<string, { text: string; tone: string }> = {
  AI_RESTORED: { text: "AI 복원", tone: "text-emerald-600 bg-emerald-50" },
  TEACHER_OVERRIDE: { text: "선생님 수정", tone: "text-blue-600 bg-blue-50" },
  SOURCE_MATCHED: { text: "원본 매칭", tone: "text-violet-600 bg-violet-50" },
  DRAFT: { text: "원문", tone: "text-slate-600 bg-slate-100" },
  NONE: { text: "원문", tone: "text-slate-500 bg-slate-100" },
  PENDING: { text: "복원 대기", tone: "text-amber-600 bg-amber-50" },
};

function getStatusBadge(status: string | null | undefined) {
  if (!status) return STATUS_LABEL.NONE;
  return STATUS_LABEL[status] ?? STATUS_LABEL.NONE;
}

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function preview(text: string, max = 140): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max).trimEnd() + "…";
}

function pageLabel(draft: M1PassageDraftWithJob): string | null {
  const pages = draft.sourcePageIndex;
  if (!pages || pages.length === 0) return null;
  const mapByIdx = new Map(
    (draft.job?.pages ?? [])
      .filter((p) => typeof p.examPageNumber === "number")
      .map((p) => [p.pageIndex, p.examPageNumber as number] as const),
  );
  const resolved = pages.map((p) => mapByIdx.get(p) ?? p + 1);
  return `${resolved.join(", ")}p`;
}

function toMillis(d: string | Date): number {
  if (d instanceof Date) return d.getTime();
  const parsed = new Date(d).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function ExtractionDraftGrid({
  selectedDraftId,
  onSelectDraft,
  collections,
  membership,
}: ExtractionDraftGridProps) {
  const [drafts, setDrafts] = useState<M1PassageDraftWithJob[]>([]);
  const [state, setState] = useState<FetchState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);

  const loadDrafts = async () => {
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/extraction/m1-passages?limit=200", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("자료 목록을 불러오지 못했습니다.");
      const data = (await res.json()) as { drafts: M1PassageDraftWithJob[] };
      setDrafts(data.drafts);
      setState("ready");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "자료 목록을 불러오지 못했습니다.",
      );
      setState("error");
    }
  };

  useEffect(() => {
    void loadDrafts();
  }, []);

  // Folder membership lookup — Set per collection for O(1) inclusion test
  const membershipSets = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const [colId, ids] of Object.entries(membership)) {
      map.set(colId, new Set(ids));
    }
    return map;
  }, [membership]);

  // Children of the currently active folder (or root-level folders if at root).
  const childFolders = useMemo(
    () => collections.filter((c) => c.parentId === activeFolder),
    [collections, activeFolder],
  );

  // Breadcrumb path: root → ... → activeFolder.
  const breadcrumbPath = useMemo(() => {
    if (!activeFolder) return [] as DraftCollectionItem[];
    const path: DraftCollectionItem[] = [];
    let current: DraftCollectionItem | undefined = collections.find(
      (c) => c.id === activeFolder,
    );
    while (current) {
      path.unshift(current);
      const parentId: string | null = current.parentId;
      current = parentId
        ? collections.find((c) => c.id === parentId)
        : undefined;
    }
    return path;
  }, [activeFolder, collections]);

  const filtered = useMemo(() => {
    let result = drafts;

    if (activeFolder) {
      const ids = membershipSets.get(activeFolder);
      if (!ids) return [];
      result = result.filter((d) => ids.has(d.id));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((d) => {
        const title = (d.title ?? "").toLowerCase();
        const raw = d.rawText.toLowerCase();
        const restored = d.restoredText.toLowerCase();
        const teacher = d.teacherText.toLowerCase();
        const fileName = d.job?.originalFileName?.toLowerCase() ?? "";
        return (
          title.includes(q) ||
          raw.includes(q) ||
          restored.includes(q) ||
          teacher.includes(q) ||
          fileName.includes(q)
        );
      });
    }

    const sorted = [...result];
    if (sortOrder === "newest") {
      sorted.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    } else if (sortOrder === "oldest") {
      sorted.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
    } else if (sortOrder === "page_asc") {
      sorted.sort((a, b) => {
        const aPage = a.sourcePageIndex[0] ?? 0;
        const bPage = b.sourcePageIndex[0] ?? 0;
        return aPage - bPage;
      });
    }

    return sorted;
  }, [drafts, search, sortOrder, activeFolder, membershipSets]);

  const allFolderCount = drafts.length;
  const activeFolderName =
    activeFolder !== null
      ? (collections.find((c) => c.id === activeFolder)?.name ?? "폴더")
      : null;

  return (
    <div className="flex flex-col min-h-0 h-full bg-white border border-slate-200/80 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="px-3.5 py-2.5 border-b border-slate-100 shrink-0 space-y-2">
        {/* Row 1: search + sort + refresh + count */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              placeholder="자료 제목 또는 본문으로 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 pl-9 pr-3 text-[12px] rounded-lg border border-slate-200 bg-slate-50/80 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-400 transition-all"
            />
          </div>

          <Select
            value={sortOrder}
            onValueChange={(v) => setSortOrder(v as SortOrder)}
          >
            <SelectTrigger className="h-8 w-[108px] text-[11px] shrink-0 px-2.5">
              <ArrowUpDown className="w-3 h-3 mr-1 shrink-0" />
              <SelectValue placeholder="정렬" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest" className="text-[12px]">
                최신순
              </SelectItem>
              <SelectItem value="oldest" className="text-[12px]">
                오래된순
              </SelectItem>
              <SelectItem value="page_asc" className="text-[12px]">
                페이지 순
              </SelectItem>
            </SelectContent>
          </Select>

          <button
            type="button"
            onClick={() => void loadDrafts()}
            className="h-8 w-8 rounded-lg flex items-center justify-center transition-all border text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300 shrink-0"
            disabled={state === "loading"}
            title="새로고침"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${state === "loading" ? "animate-spin" : ""}`}
            />
          </button>

          <div className="flex items-center gap-1 px-2 h-8 rounded-lg bg-slate-50 border border-slate-200 shrink-0">
            <Layers className="w-3 h-3 text-slate-400" />
            <span className="text-[11px] font-semibold text-slate-600 tabular-nums">
              {filtered.length}
            </span>
            <span className="text-[10px] text-slate-400">
              /{allFolderCount}
            </span>
          </div>
        </div>

        {/* Row 2: breadcrumb (only when inside a folder) */}
        {activeFolder !== null && breadcrumbPath.length > 0 ? (
          <div className="flex items-center gap-1 min-w-0 px-2 h-7 rounded-md bg-blue-50/70 border border-blue-100">
            <button
              type="button"
              onClick={() => setActiveFolder(null)}
              className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-blue-700 transition-colors"
            >
              <Home className="w-3 h-3" />
              전체
            </button>
            {breadcrumbPath.map((node, i) => {
              const isLast = i === breadcrumbPath.length - 1;
              return (
                <Fragment key={node.id}>
                  <ChevronRight className="w-3 h-3 shrink-0 text-blue-300" />
                  {isLast ? (
                    <span className="text-[11px] font-bold text-blue-700 truncate">
                      {node.name}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveFolder(node.id)}
                      className="text-[11px] font-medium text-slate-500 hover:text-blue-700 truncate transition-colors"
                    >
                      {node.name}
                    </button>
                  )}
                </Fragment>
              );
            })}
          </div>
        ) : null}

        {/* Row 3: folder chips for current level (children of activeFolder) */}
        {childFolders.length > 0 ? (
          <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5">
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-0.5">
              {activeFolder === null ? "폴더" : "하위 폴더"}
            </span>
            {childFolders.map((folder) => {
              const count =
                membershipSets.get(folder.id)?.size ?? folder._count.items;
              const hasChildren = folder._count.children > 0;
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => setActiveFolder(folder.id)}
                  className="shrink-0 h-7 px-2.5 rounded-full text-[11px] font-semibold flex items-center gap-1 transition-all border bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                  title={
                    hasChildren
                      ? `${folder.name} (하위 폴더 ${folder._count.children}개)`
                      : folder.name
                  }
                >
                  <Folder className="w-3 h-3 shrink-0 text-slate-400" />
                  <span className="max-w-[140px] truncate">{folder.name}</span>
                  <span className="tabular-nums text-[10px] text-slate-400">
                    {count}
                  </span>
                  {hasChildren ? (
                    <ChevronRight className="w-2.5 h-2.5 shrink-0 text-slate-300" />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Grid body */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {state === "loading" && drafts.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-400 gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-[13px]">자료를 불러오는 중...</span>
          </div>
        ) : state === "error" ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <p className="text-[12px] text-red-600">{error}</p>
            <button
              type="button"
              onClick={() => void loadDrafts()}
              className="mt-1 h-8 px-3 rounded-lg text-[12px] font-medium border border-slate-200 hover:bg-slate-50 text-slate-600"
            >
              다시 시도
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-1.5 text-center">
            <FileText className="w-5 h-5 text-slate-300" />
            <p className="text-[12px] text-slate-400">
              {search.trim() || activeFolder
                ? "조건에 맞는 자료가 없습니다."
                : "추출된 자료가 없습니다."}
            </p>
            {activeFolderName && childFolders.length > 0 ? (
              <p className="text-[11px] text-slate-400">
                &quot;{activeFolderName}&quot;에 직접 담긴 자료가 없습니다 ·
                하위 폴더를 확인하세요
              </p>
            ) : activeFolderName ? (
              <p className="text-[11px] text-slate-400">
                현재 폴더: {activeFolderName}
              </p>
            ) : null}
            {search.trim() || activeFolder ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setActiveFolder(null);
                }}
                className="mt-1 h-7 px-2.5 rounded-md text-[11px] font-medium text-slate-500 border border-slate-200 hover:bg-slate-50"
              >
                필터 초기화
              </button>
            ) : (
              <p className="text-[11px] text-slate-400">
                자료 관리에서 PDF 업로드 후 다시 시도해주세요.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {filtered.map((draft, idx) => {
              const text =
                draft.teacherText?.trim() ||
                draft.restoredText?.trim() ||
                draft.rawText?.trim() ||
                "";
              const w = wordCount(text);
              const status = getStatusBadge(draft.restorationStatus);
              const fileName =
                draft.job?.displayName?.trim() ||
                draft.job?.originalFileName ||
                "출처 정보 없음";
              const pages = pageLabel(draft);
              const active = draft.id === selectedDraftId;

              return (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => onSelectDraft(draft)}
                  className={
                    "group relative text-left rounded-xl border p-3.5 transition-all duration-150 flex flex-col gap-2.5 min-h-[160px] " +
                    (active
                      ? "border-blue-400 bg-blue-50/40 ring-2 ring-blue-500/20 shadow-sm"
                      : "border-slate-200 bg-white hover:border-blue-200 hover:shadow-md")
                  }
                >
                  {/* Top row: index + title + status */}
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="shrink-0 text-[10px] font-bold tabular-nums text-slate-400 mt-0.5">
                      #{idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-[13px] font-semibold text-slate-800 truncate leading-tight">
                        {getDraftDisplayTitle(draft)}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${status.tone}`}
                        >
                          {status.text}
                        </span>
                        {w > 0 ? (
                          <span className="text-[10px] text-slate-400 tabular-nums">
                            {w} words
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Preview */}
                  <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-3">
                    {preview(text) || "추출된 본문이 비어있습니다."}
                  </p>

                  {/* Footer: source + pages */}
                  <div className="mt-auto pt-1.5 flex items-center gap-1.5 min-w-0">
                    <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="text-[10px] text-slate-500 font-medium truncate min-w-0 flex-1">
                      {fileName}
                    </span>
                    {pages ? (
                      <span className="shrink-0 text-[10px] font-bold tabular-nums text-slate-400">
                        · {pages}
                      </span>
                    ) : null}
                  </div>

                  {/* Active overlay */}
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-blue-500 to-blue-600 rounded-l-xl"
                    />
                  ) : null}

                  {/* Hover hint */}
                  <span className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                    <ArrowDownToLine className="w-2.5 h-2.5" />
                    불러오기
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
