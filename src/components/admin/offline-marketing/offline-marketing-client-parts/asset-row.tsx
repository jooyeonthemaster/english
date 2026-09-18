"use client";

import Image from "next/image";
import { Download, Eye, FileText, ImageIcon, Pencil, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OfflineMarketingAssetDto } from "@/actions/admin-offline-marketing";
import { assetFileUrl, formatBytes } from "../shared";

/** 홍보물 파일 한 줄 — PDF는 인쇄, 이미지는 미리보기·다운로드. */
export function AssetRow({
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
  const isPdf = asset.fileName.toLowerCase().endsWith(".pdf");
  const meta = [formatBytes(asset.fileSize), asset.pageCount ? `${asset.pageCount}쪽` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-2.5",
        pending && "pointer-events-none opacity-50",
      )}
    >
      {isPdf ? (
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-500">
          <FileText className="size-4" strokeWidth={1.8} />
        </span>
      ) : (
        <a
          href={assetFileUrl(asset.id)}
          target="_blank"
          rel="noopener noreferrer"
          title="이미지 미리보기"
          className="relative h-10 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-gray-50"
        >
          <Image src={assetFileUrl(asset.id)} alt="" fill unoptimized sizes="64px" className="object-cover" />
          <ImageIcon className="absolute bottom-0.5 right-0.5 size-3 rounded bg-white/80 p-0.5 text-blue-500" />
        </a>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-gray-900">{asset.title}</p>
        <p className="truncate text-[11px] text-gray-400">
          {asset.fileName}
          {meta && <span className="text-gray-300"> · {meta}</span>}
        </p>
        {asset.description && (
          <p className="truncate text-[11px] text-gray-400">{asset.description}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {isPdf && (
          <Button size="sm" onClick={onPrint} title="인쇄">
            <Printer className="size-3.5" />
            <span className="hidden sm:inline">인쇄</span>
          </Button>
        )}
        <Button
          asChild
          variant="ghost"
          size="icon-sm"
          className="text-gray-400 hover:text-gray-700"
        >
          <a
            href={assetFileUrl(asset.id)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="미리보기(새 탭)"
            title="미리보기(새 탭)"
          >
            <Eye className="size-4" />
          </a>
        </Button>
        <Button
          asChild
          variant="ghost"
          size="icon-sm"
          className="text-gray-400 hover:text-gray-700"
        >
          <a href={assetFileUrl(asset.id, true)} aria-label="다운로드" title="다운로드">
            <Download className="size-4" />
          </a>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          aria-label="파일 수정"
          title="파일 수정"
          className="text-gray-400 hover:text-gray-700"
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label="파일 삭제"
          title="파일 삭제"
          className="text-gray-400 hover:bg-rose-50 hover:text-rose-600"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </li>
  );
}
