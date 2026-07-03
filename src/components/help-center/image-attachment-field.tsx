"use client";

import Image from "next/image";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  compressImage,
  MAX_ATTACHMENTS,
  MAX_SOURCE_BYTES,
  type Attachment,
} from "@/lib/image-attachment";

interface ImageAttachmentFieldProps {
  value: Attachment[];
  onChange: (next: Attachment[]) => void;
  max?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * 헬프센터 글·답변·댓글 공용 이미지 첨부 필드(제어형).
 * 붙인 이미지는 파일명 칩이 아니라 썸네일 미리보기로 보여준다(업로드 즉시 자동 최적화).
 */
export function ImageAttachmentField({
  value,
  onChange,
  max = MAX_ATTACHMENTS,
  disabled,
  className,
}: ImageAttachmentFieldProps) {
  function handleFiles(files: FileList | null) {
    if (!files) return;
    const remaining = max - value.length;
    if (remaining <= 0) {
      toast.error(`이미지는 최대 ${max}개까지 첨부할 수 있습니다.`);
      return;
    }
    const list = Array.from(files).slice(0, remaining);
    for (const file of list) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name}: 이미지 파일만 첨부할 수 있습니다.`);
        continue;
      }
      if (file.size > MAX_SOURCE_BYTES) {
        toast.error(`${file.name}: 25MB 이하만 첨부할 수 있습니다.`);
        continue;
      }
      compressImage(file)
        .then((att) => onChange([...value, att]))
        .catch(() => toast.error(`${file.name}: 첨부 처리 중 오류가 발생했습니다.`));
    }
  }

  function removeAt(i: number) {
    onChange(value.filter((_, j) => j !== i));
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      {value.map((a, i) => (
        <div
          key={i}
          className="group relative size-16 overflow-hidden rounded-lg border border-slate-200"
        >
          <Image
            src={a.url}
            alt={a.name}
            width={64}
            height={64}
            unoptimized
            className="size-full object-cover"
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => removeAt(i)}
              aria-label="첨부 삭제"
              className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      ))}
      {!disabled && value.length < max && (
        <label className="flex size-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-blue-200 bg-blue-50/60 text-[10px] font-semibold text-blue-600 hover:bg-blue-100">
          <ImagePlus className="size-4" />
          이미지
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.currentTarget.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}
