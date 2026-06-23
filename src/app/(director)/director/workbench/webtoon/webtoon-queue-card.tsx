"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Loader2,
  Maximize2,
  Pencil,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CardDetailIconButton } from "@/components/ui/card-detail-icon-button";
import { Checkbox } from "@/components/ui/checkbox";
import { type WebtoonRow, styleLabel, languageLabel } from "./webtoon-page-types";

interface WebtoonQueueCardProps {
  item: WebtoonRow;
  selected: boolean;
  onToggleSelected: () => void;
  onRetry: (webtoonId: string) => void;
  onRemove: (webtoonId: string) => void;
  onEditText?: (webtoonId: string) => void;
  onToggleApprove: (webtoonId: string) => void;
}

function displayUrl(item: WebtoonRow): string | null {
  return item.editedImageUrl || item.imageUrl;
}

export function WebtoonQueueCard({
  item,
  selected,
  onToggleSelected,
  onRetry,
  onRemove,
  onEditText,
  onToggleApprove,
}: WebtoonQueueCardProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [passageOpen, setPassageOpen] = useState(false);

  const isDone = item.status === "COMPLETED" && item.imageUrl;
  const isError = item.status === "FAILED";
  const isInflight = item.status === "PENDING" || item.status === "GENERATING";
  const passageContent = item.passage.content?.trim() || "";

  return (
    <>
      <Card
        className={`group relative flex h-full flex-col gap-0 py-0 transition-all ${
          selected
            ? "bg-blue-50/30 ring-2 ring-blue-400"
            : "hover:shadow-md"
        } ${!item.approved && isDone ? "border-red-200/80 shadow-[0_0_0_1px_rgba(252,165,165,0.35),0_0_18px_rgba(248,113,113,0.12)]" : ""}`}
      >
        <CardContent className="flex flex-1 flex-col gap-1.5 p-3">
          {/* ── Header row: 체크박스 · 삭제 · 지문 토글 ── */}
          <div className="flex shrink-0 items-center gap-1.5">
            <Checkbox
              checked={selected}
              onCheckedChange={() => onToggleSelected()}
              className="shrink-0"
            />
            <button
              type="button"
              aria-label="삭제"
              title={isInflight ? "생성 중에는 삭제할 수 없습니다." : "삭제"}
              disabled={isInflight}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.id);
              }}
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            {/* 지문 토글 — 클릭하면 아래에 원문 지문이 펼쳐진다. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPassageOpen((v) => !v);
              }}
              disabled={!passageContent}
              title={item.passage.title}
              className="inline-flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-default disabled:opacity-100"
            >
              <FileText className="h-3 w-3 shrink-0 text-blue-400" />
              <span className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold">
                {item.passage.title}
              </span>
              {passageContent ? (
                passageOpen ? (
                  <ChevronUp className="h-3 w-3 shrink-0 text-slate-400" />
                ) : (
                  <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
                )
              ) : null}
            </button>
          </div>

          {/* 지문 원문 (토글) */}
          {passageOpen && passageContent ? (
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <p className="max-h-40 overflow-y-auto whitespace-pre-line text-[11px] font-mono leading-relaxed text-slate-500">
                {passageContent}
              </p>
            </div>
          ) : null}

          {/* 메타: 화풍 · 언어 */}
          <p className="text-[10.5px] text-slate-400">
            {styleLabel(item.style)} · {languageLabel(item.language)}
          </p>

          {/* ── 이미지 ── */}
          <div
            onClick={() => isDone && setShowPreview(true)}
            className={`relative aspect-[9/16] overflow-hidden rounded-lg border ${
              isDone
                ? "cursor-pointer border-slate-200 transition-all hover:border-blue-400 hover:shadow-md"
                : isError
                  ? "border-rose-200 bg-rose-50"
                  : "border-slate-200 bg-slate-100"
            }`}
          >
            {isDone ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayUrl(item)!}
                  alt={item.passage.title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                {item.editedImageUrl ? (
                  <div className="absolute left-2 top-2 rounded-full bg-emerald-600/90 px-2 py-1 backdrop-blur-sm">
                    <span className="text-[9.5px] font-semibold text-white">
                      자막 편집됨
                    </span>
                  </div>
                ) : null}
                <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 backdrop-blur-sm">
                  <Maximize2 className="h-3 w-3 text-white" />
                  <span className="text-[9.5px] font-semibold text-white">
                    크게 보기
                  </span>
                </div>
              </>
            ) : isError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
                <AlertCircle className="h-6 w-6 text-rose-500" />
                <p className="line-clamp-3 text-center text-[11px] leading-snug text-rose-700">
                  {item.errorMessage || "생성에 실패했습니다."}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetry(item.id);
                  }}
                  className="mt-1 flex items-center gap-1.5 rounded-md bg-rose-100 px-3 py-1.5 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-200"
                >
                  <RefreshCw className="h-3 w-3" />
                  다시 시도
                </button>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                <span className="text-[11px] font-medium text-slate-500">
                  {item.status === "PENDING" ? "대기 중" : "이미지 생성 중"}
                </span>
                <span className="text-[10px] text-slate-400">
                  완료되면 자동으로 표시됩니다.
                </span>
              </div>
            )}
          </div>

          {/* ── Footer: 검수완료 · 수정하기 · 다운로드 · 상세보기(정사각 아이콘) — 한 줄 ── */}
          {isDone ? (
            <div className="mt-auto flex items-center gap-1 pt-1.5">
              {/* 검수완료 토글 — 미검수=분홍 테두리(hover 시 초록 미리보기), 검수완료=초록. */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={item.approved}
                title={
                  item.approved
                    ? "검수완료 — 누르면 검수를 취소합니다"
                    : "검수필요 — 누르면 검수완료로 표시합니다"
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleApprove(item.id);
                }}
                className={
                  "h-7 flex-1 min-w-0 justify-center gap-1 bg-white px-1.5 text-[11px] font-semibold " +
                  (item.approved
                    ? "border border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                    : "border border-red-200/80 text-red-300 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600")
                }
              >
                <CheckCircle2 className="h-3 w-3 shrink-0" />
                {item.approved ? "검수완료" : "미검수"}
              </Button>
              {onEditText ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 flex-1 min-w-0 justify-center gap-1 border border-slate-200 bg-white px-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditText(item.id);
                  }}
                >
                  <Pencil className="h-3 w-3 shrink-0" />
                  수정하기
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 flex-1 min-w-0 justify-center gap-1 border border-slate-200 bg-white px-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                onClick={(e) => {
                  e.stopPropagation();
                  downloadImage(item);
                }}
              >
                <Download className="h-3 w-3 shrink-0" />
                다운로드
              </Button>
              {/* 상세보기 — 정사각 박스 + 대각선 확장 화살표(Maximize2) */}
              <CardDetailIconButton
                className="size-7 shrink-0"
                iconClassName="size-3.5"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPreview(true);
                }}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {showPreview && isDone && (
        <PreviewModal item={item} onClose={() => setShowPreview(false)} />
      )}
    </>
  );
}

function PreviewModal({ item, onClose }: { item: WebtoonRow; onClose: () => void }) {
  const url = displayUrl(item);
  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative my-6 flex w-full max-w-[520px] flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-lg bg-black/30 px-3 py-2 backdrop-blur-md">
          <div className="min-w-0 flex-1 text-white">
            <h3 className="truncate text-[14px] font-bold">{item.passage.title}</h3>
            <p className="mt-0.5 text-[11px] text-white/70">
              {styleLabel(item.style)} · {languageLabel(item.language)}
            </p>
          </div>
          <a
            href={downloadHref(item)}
            className="flex h-8 items-center gap-1.5 rounded-md bg-white/15 px-3 text-[11px] font-semibold text-white transition-colors hover:bg-white/25"
          >
            <Download className="h-3 w-3" />
            저장
          </a>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/25"
          >
            <X className="h-4 w-4 text-white" />
          </button>
        </div>

        <div className="overflow-hidden rounded-xl bg-slate-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={item.passage.title} className="h-auto w-full" />
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
