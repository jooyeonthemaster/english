"use client";

import { useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import type { Attachment } from "@/lib/image-attachment";

interface AttachmentGalleryProps {
  attachments: Attachment[];
  /** 썸네일 크기(px). 글 본문은 크게, 답변·댓글은 작게. */
  size?: number;
  className?: string;
}

/**
 * 첨부 이미지를 다운로드 링크가 아닌 미리보기 썸네일로 보여주고,
 * 클릭하면 라이트박스(팝업)로 크게 띄운다. 글 본문·답변·댓글 공용.
 */
export function AttachmentGallery({ attachments, size = 128, className }: AttachmentGalleryProps) {
  const [lightbox, setLightbox] = useState<Attachment | null>(null);

  if (attachments.length === 0) return null;

  return (
    <>
      <div className={`flex flex-wrap gap-2 ${className ?? ""}`}>
        {attachments.map((a, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setLightbox(a)}
            className="block cursor-zoom-in overflow-hidden rounded-lg border border-slate-200 transition hover:opacity-90"
            style={{ width: size, height: size }}
          >
            <Image
              src={a.url}
              alt={a.name}
              width={size * 2}
              height={size * 2}
              unoptimized
              className="size-full object-cover"
            />
          </button>
        ))}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="닫기"
            className="absolute right-5 top-5 flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <X className="size-5" />
          </button>
          <Image
            src={lightbox.url}
            alt={lightbox.name}
            width={2000}
            height={2000}
            unoptimized
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] w-auto max-w-[92vw] cursor-default rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </>
  );
}
