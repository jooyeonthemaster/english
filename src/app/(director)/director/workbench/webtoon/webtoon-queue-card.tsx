"use client";

import { useState } from "react";
import {
  AlertCircle,
  Check,
  Download,
  Loader2,
  Maximize2,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { type WebtoonRow, styleLabel } from "./webtoon-page-types";

interface WebtoonQueueCardProps {
  item: WebtoonRow;
  onRetry: (webtoonId: string) => void;
  onRemove: (webtoonId: string) => void;
}

export function WebtoonQueueCard({ item, onRetry, onRemove }: WebtoonQueueCardProps) {
  const [showPreview, setShowPreview] = useState(false);

  const isDone = item.status === "COMPLETED" && item.imageUrl;
  const isError = item.status === "FAILED";
  const isInflight = item.status === "PENDING" || item.status === "GENERATING";

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0 flex-1">
            <h4 className="text-[13px] font-semibold text-slate-800 truncate">
              {item.passage.title}
            </h4>
            <p className="text-[10.5px] text-slate-400 mt-0.5">{styleLabel(item.style)}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <StatusBadge status={item.status} />
            <button
              onClick={() => onRemove(item.id)}
              disabled={isInflight}
              className="w-6 h-6 rounded hover:bg-slate-100 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title={isInflight ? "생성 중에는 삭제할 수 없습니다." : "삭제"}
            >
              <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
            </button>
          </div>
        </div>

        <div
          onClick={() => isDone && setShowPreview(true)}
          className={`relative aspect-[9/16] rounded-lg overflow-hidden border ${
            isDone
              ? "border-slate-200 cursor-pointer hover:border-blue-400 hover:shadow-md transition-all"
              : isError
                ? "border-rose-200 bg-rose-50"
                : "border-slate-200 bg-slate-100"
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
              <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm flex items-center gap-1">
                <Maximize2 className="w-3 h-3 text-white" />
                <span className="text-[9.5px] font-semibold text-white">크게 보기</span>
              </div>
            </>
          ) : isError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
              <AlertCircle className="w-6 h-6 text-rose-500" />
              <p className="text-[11px] text-rose-700 text-center leading-snug line-clamp-3">
                {item.errorMessage || "생성에 실패했습니다."}
              </p>
              <button
                onClick={() => onRetry(item.id)}
                className="mt-1 px-3 py-1.5 rounded-md bg-rose-100 hover:bg-rose-200 text-[11px] font-semibold text-rose-700 transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" />
                다시 시도
              </button>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              <span className="text-[11px] text-slate-500 font-medium">
                {item.status === "PENDING" ? "대기 중" : "이미지 생성 중"}
              </span>
              <span className="text-[10px] text-slate-400">완료되면 자동으로 표시됩니다.</span>
            </div>
          )}
        </div>

        {isDone && (
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-[11px] gap-1.5"
              onClick={() => setShowPreview(true)}
            >
              <Maximize2 className="w-3 h-3" />
              크게 보기
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-[11px] gap-1.5"
              onClick={() => downloadImage(item)}
            >
              <Download className="w-3 h-3" />
              다운로드
            </Button>
          </div>
        )}
      </div>

      {showPreview && isDone && (
        <PreviewModal item={item} onClose={() => setShowPreview(false)} />
      )}
    </>
  );
}

function StatusBadge({ status }: { status: WebtoonRow["status"] }) {
  if (status === "PENDING") {
    return (
      <div className="flex items-center gap-1 px-1.5 h-5 rounded bg-slate-50 border border-slate-200">
        <Loader2 className="w-2.5 h-2.5 animate-spin text-slate-500" />
        <span className="text-[9.5px] font-semibold text-slate-600">대기</span>
      </div>
    );
  }
  if (status === "GENERATING") {
    return (
      <div className="flex items-center gap-1 px-1.5 h-5 rounded bg-blue-50 border border-blue-200">
        <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-600" />
        <span className="text-[9.5px] font-semibold text-blue-700">생성 중</span>
      </div>
    );
  }
  if (status === "COMPLETED") {
    return (
      <div className="flex items-center gap-1 px-1.5 h-5 rounded bg-emerald-50 border border-emerald-200">
        <Check className="w-2.5 h-2.5 text-emerald-600" />
        <span className="text-[9.5px] font-semibold text-emerald-700">완료</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 px-1.5 h-5 rounded bg-rose-50 border border-rose-200">
      <X className="w-2.5 h-2.5 text-rose-600" />
      <span className="text-[9.5px] font-semibold text-rose-700">실패</span>
    </div>
  );
}

function PreviewModal({ item, onClose }: { item: WebtoonRow; onClose: () => void }) {
  if (!item.imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative max-w-[520px] w-full my-6 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 sticky top-0 z-10 bg-black/30 backdrop-blur-md rounded-lg px-3 py-2">
          <div className="text-white min-w-0 flex-1">
            <h3 className="text-[14px] font-bold truncate">{item.passage.title}</h3>
            <p className="text-[11px] text-white/70 mt-0.5">{styleLabel(item.style)}</p>
          </div>
          <a
            href={downloadHref(item)}
            className="px-3 h-8 rounded-md bg-white/15 hover:bg-white/25 text-white text-[11px] font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3 h-3" />
            저장
          </a>
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
      </div>
    </div>
  );
}

function downloadImage(item: WebtoonRow) {
  window.location.href = downloadHref(item);
}

function downloadHref(item: WebtoonRow) {
  return `/api/webtoons/${item.id}/download`;
}
