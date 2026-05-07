"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Palette,
  Search,
  Loader2,
  Image as ImageIcon,
  X,
  AlertCircle,
  Maximize2,
  Download,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  WEBTOON_STYLES,
  styleLabel,
  type WebtoonRow,
  type WebtoonStatus,
  type WebtoonStyleId,
} from "../webtoon-page-types";

const PAGE_SIZE = 24;
const STATUS_FILTERS: { id: WebtoonStatus | "ALL"; label: string }[] = [
  { id: "ALL", label: "전체" },
  { id: "COMPLETED", label: "완료" },
  { id: "GENERATING", label: "생성 중" },
  { id: "PENDING", label: "대기" },
  { id: "FAILED", label: "실패" },
];

export function WebtoonLibraryClient({ academyId }: { academyId: string }) {
  void academyId;

  const [items, setItems] = useState<WebtoonRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<WebtoonStatus | "ALL">("ALL");
  const [styleFilter, setStyleFilter] = useState<WebtoonStyleId | "ALL">("ALL");

  const [previewItem, setPreviewItem] = useState<WebtoonRow | null>(null);

  const fetchPage = async (p: number, statusOverride?: WebtoonStatus | "ALL") => {
    const sf = statusOverride ?? statusFilter;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: String(PAGE_SIZE),
      });
      if (sf !== "ALL") params.set("status", sf);

      const res = await fetch(`/api/webtoons/list?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `${res.status}`);

      setItems(data.items);
      setTotal(data.total ?? data.items.length);
      setPage(p);
    } catch (err) {
      const message = err instanceof Error ? err.message : "fetch error";
      toast.error(`목록 로드 실패: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  // Auto-refresh every 5s if any active items on this page
  useEffect(() => {
    const hasActive = items.some(
      (it) => it.status === "PENDING" || it.status === "GENERATING",
    );
    if (!hasActive) return;
    const tid = setInterval(() => void fetchPage(page), 5000);
    return () => clearInterval(tid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, page]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (styleFilter !== "ALL" && it.style !== styleFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!it.passage.title.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [items, styleFilter, search]);

  const handleDelete = async (id: string) => {
    if (!confirm("이 웹툰을 삭제하시겠습니까? 이미지 파일도 함께 삭제됩니다.")) return;
    try {
      const res = await fetch(`/api/webtoons/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `${res.status}`);
      setItems((prev) => prev.filter((it) => it.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      if (previewItem?.id === id) setPreviewItem(null);
      toast.success("삭제됨");
    } catch (err) {
      const message = err instanceof Error ? err.message : "삭제 실패";
      toast.error(message);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="flex-1 overflow-y-auto p-6 relative">
      <div className="flex flex-col min-h-[calc(100vh-64px)] bg-slate-50">
        {/* Header */}
        <div className="flex items-center gap-4 px-8 py-4 bg-white border-b border-slate-200/80 shrink-0">
          <Link
            href="/director/workbench"
            className="flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all"
          >
            <ArrowLeft className="w-4.5 h-4.5 text-slate-600" />
          </Link>
          <div className="flex-1">
            <h1 className="text-[18px] font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 border border-blue-100">
                <Palette className="w-4.5 h-4.5 text-blue-600" />
              </div>
              웹툰 보관함
            </h1>
            <p className="text-[12px] text-slate-500 mt-0.5 ml-10.5">
              총 {total}개 · Supabase Storage에 영구 보관
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-[12px] gap-1.5"
              onClick={() => fetchPage(page)}
              disabled={loading}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              새로고침
            </Button>
            <Link
              href="/director/workbench/webtoon"
              className="h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Palette className="w-3.5 h-3.5" />새 웹툰 생성
            </Link>
          </div>
        </div>

        {/* Filter bar */}
        <div className="px-8 py-3 bg-white border-b border-slate-200/60 shrink-0 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-[360px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              placeholder="지문 제목으로 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-10 pr-4 text-[13px] rounded-lg border border-slate-200 bg-slate-50/80 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
            />
          </div>

          {/* Status filter */}
          <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s.id}
                onClick={() => setStatusFilter(s.id)}
                className={`h-7 px-2.5 rounded-md text-[11px] font-semibold transition-all ${
                  statusFilter === s.id
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Style filter */}
          <select
            value={styleFilter}
            onChange={(e) => setStyleFilter(e.target.value as WebtoonStyleId | "ALL")}
            className={`h-9 px-3 pr-8 rounded-lg text-[12px] font-semibold border appearance-none cursor-pointer ${
              styleFilter !== "ALL"
                ? "bg-blue-50 text-blue-700 border-blue-300"
                : "bg-white text-slate-500 border-slate-200"
            }`}
          >
            <option value="ALL">화풍 전체</option>
            {WEBTOON_STYLES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Body */}
        <div className="flex-1 px-8 py-6 bg-[#F0F2F5]">
          {loading && items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span className="text-[13px] text-slate-500">불러오는 중...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-2">
              <ImageIcon className="w-10 h-10 text-slate-300" />
              <p className="text-[14px] text-slate-500 font-medium">
                {total === 0 ? "아직 생성된 웹툰이 없습니다" : "검색 결과가 없습니다"}
              </p>
              {total === 0 && (
                <Link
                  href="/director/workbench/webtoon"
                  className="mt-2 text-[12px] text-blue-600 hover:text-blue-700 font-semibold"
                >
                  첫 웹툰 만들기 →
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
                {filtered.map((item) => (
                  <LibraryCard
                    key={item.id}
                    item={item}
                    onPreview={() => setPreviewItem(item)}
                    onDelete={() => handleDelete(item.id)}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px]"
                    disabled={page <= 1 || loading}
                    onClick={() => fetchPage(page - 1)}
                  >
                    이전
                  </Button>
                  <span className="text-[12px] text-slate-600 font-medium px-3">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px]"
                    disabled={page >= totalPages || loading}
                    onClick={() => fetchPage(page + 1)}
                  >
                    다음
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {previewItem && (
        <PreviewModal
          item={previewItem}
          onClose={() => setPreviewItem(null)}
          onDelete={() => handleDelete(previewItem.id)}
        />
      )}
    </main>
  );
}

// ─── Library card ────────────────────────────────────

function LibraryCard({
  item,
  onPreview,
  onDelete,
}: {
  item: WebtoonRow;
  onPreview: () => void;
  onDelete: () => void;
}) {
  const isDone = item.status === "COMPLETED" && item.imageUrl;
  const isError = item.status === "FAILED";
  const isInflight = item.status === "PENDING" || item.status === "GENERATING";

  return (
    <div className="group relative rounded-xl border border-slate-200 bg-white overflow-hidden hover:shadow-md transition-all">
      <div
        onClick={isDone ? onPreview : undefined}
        className={`relative aspect-[9/16] ${
          isDone ? "cursor-pointer" : isError ? "bg-rose-50" : "bg-slate-100"
        }`}
      >
        {isDone ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl!}
              alt={item.passage.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-3">
              <div className="px-2 py-1 rounded-full bg-white/90 flex items-center gap-1">
                <Maximize2 className="w-3 h-3 text-slate-700" />
                <span className="text-[10px] font-semibold text-slate-700">크게 보기</span>
              </div>
            </div>
          </>
        ) : isError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3">
            <AlertCircle className="w-5 h-5 text-rose-500" />
            <p className="text-[10px] text-rose-700 text-center line-clamp-3">
              {item.errorMessage || "실패"}
            </p>
          </div>
        ) : isInflight ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <span className="text-[10px] text-slate-500 font-medium">
              {item.status === "PENDING" ? "대기" : "생성 중"}
            </span>
          </div>
        ) : null}

        {/* Delete button on hover */}
        {!isInflight && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 hover:bg-rose-600 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center"
          >
            <Trash2 className="w-3.5 h-3.5 text-white" />
          </button>
        )}
      </div>

      <div className="p-2.5">
        <h4 className="text-[12px] font-semibold text-slate-800 truncate">{item.passage.title}</h4>
        <div className="flex items-center justify-between gap-2 mt-1">
          <span className="text-[10px] text-slate-400">{styleLabel(item.style)}</span>
          <span className="text-[10px] text-slate-400">
            {new Date(item.createdAt).toLocaleDateString("ko-KR", {
              month: "numeric",
              day: "numeric",
            })}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Preview modal ───────────────────────────────────

function PreviewModal({
  item,
  onClose,
  onDelete,
}: {
  item: WebtoonRow;
  onClose: () => void;
  onDelete: () => void;
}) {
  if (!item.imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative max-w-[560px] w-full my-6 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 sticky top-0 z-10 bg-black/30 backdrop-blur-md rounded-lg px-3 py-2">
          <div className="text-white min-w-0 flex-1">
            <h3 className="text-[14px] font-bold truncate">{item.passage.title}</h3>
            <p className="text-[11px] text-white/70 mt-0.5">
              {styleLabel(item.style)} · {new Date(item.createdAt).toLocaleString("ko-KR")}
            </p>
          </div>
          <a
            href={`/api/webtoons/${item.id}/download`}
            className="px-3 h-8 rounded-md bg-white/15 hover:bg-white/25 text-white text-[11px] font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3 h-3" />저장
          </a>
          <button
            onClick={onDelete}
            className="px-3 h-8 rounded-md bg-rose-500/30 hover:bg-rose-500/60 text-white text-[11px] font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-3 h-3" />삭제
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        <div className="rounded-xl overflow-hidden bg-slate-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageUrl} alt={item.passage.title} className="w-full h-auto" />
        </div>

        {item.customPrompt && (
          <div className="rounded-lg bg-white/95 px-4 py-3">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              추가 지시사항
            </p>
            <p className="text-[12px] text-slate-700 leading-relaxed">{item.customPrompt}</p>
          </div>
        )}
      </div>
    </div>
  );
}
