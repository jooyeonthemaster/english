"use client";

import type { RefObject } from "react";
import { toast } from "sonner";
import { ACCEPTED_IMAGE_TYPES } from "./constants";

interface AttachImageArgs {
  file: File;
  setImageFile: (f: File | null) => void;
  setImagePreview: (v: string | null) => void;
}

export function attachImage({ file, setImageFile, setImagePreview }: AttachImageArgs) {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    toast.error("PNG, JPG, WebP, GIF 이미지만 지원합니다.");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    toast.error("10MB 이하 이미지만 업로드할 수 있습니다.");
    return;
  }
  setImageFile(file);
  const reader = new FileReader();
  reader.onload = (ev) => setImagePreview(ev.target?.result as string);
  reader.readAsDataURL(file);
}

interface SettersOnly {
  setImageFile: (f: File | null) => void;
  setImagePreview: (v: string | null) => void;
}

export function removeImage({ setImageFile, setImagePreview }: SettersOnly) {
  setImageFile(null);
  setImagePreview(null);
}

export function handlePaste(e: React.ClipboardEvent, setters: SettersOnly) {
  const items = e.clipboardData.items;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.startsWith("image/")) {
      e.preventDefault();
      const file = items[i].getAsFile();
      if (file) attachImage({ file, ...setters });
      return;
    }
  }
}

export function handleDrop(e: React.DragEvent, setters: SettersOnly) {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("image/")) attachImage({ file, ...setters });
}

interface FileSelectArgs extends SettersOnly {
  fileInputRef: RefObject<HTMLInputElement | null>;
}

export function handleFileSelect(
  e: React.ChangeEvent<HTMLInputElement>,
  { setImageFile, setImagePreview, fileInputRef }: FileSelectArgs
) {
  const file = e.target.files?.[0];
  if (file) attachImage({ file, setImageFile, setImagePreview });
  if (fileInputRef.current) fileInputRef.current.value = "";
}

export async function extractTextFromImage(imageFile: File | null): Promise<string | null> {
  if (!imageFile) return null;
  const formData = new FormData();
  formData.append("image", imageFile);
  const res = await fetch("/api/ai/extract-text", { method: "POST", body: formData });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "이미지 텍스트 추출 실패");
  }
  const data = await res.json();
  return data.text || null;
}
