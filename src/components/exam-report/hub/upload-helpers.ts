// ============================================================================
// 학생 시험 리포트 — 업로드 패널 브라우저 헬퍼(다운스케일 + 서명 URL PUT)
//
// use-extraction-upload.ts 의 downscale 관례를 경량 재구현한다(모듈 private 라
// 재사용 불가). 업로드는 4 동시로 서명 URL 에 직접 PUT 하고, attachExamSources
// 액션에 넘길 sourceFiles([{path,page}]) 를 페이지 순으로 반환한다.
// ============================================================================

import { MAX_PAGE_IMAGE_BYTES } from "@/lib/extraction/constants";

export interface UploadSlot {
  id: string;
  blob: Blob;
  previewUrl: string;
  name: string;
}

interface UploadUrlTarget {
  index: number;
  uploadUrl: string;
  path: string;
}

const UPLOAD_MAX_WIDTH = 2000;
const UPLOAD_CONCURRENCY = 4;

/**
 * 업로드 직전 이미지 1장을 폭 2000px 로 축소·재압축(EXIF 회전 굳힘 포함).
 * 폭이 이미 작고 용량도 5MB 이하면 원본 유지. 디코드 실패(PDF 등)·결과가 더 크면 원본.
 */
export async function downscaleForUpload(blob: Blob): Promise<Blob> {
  if (!blob.type.startsWith("image/")) return blob;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    return blob;
  }
  try {
    const needsResize = bitmap.width > UPLOAD_MAX_WIDTH;
    if (!needsResize && blob.size <= MAX_PAGE_IMAGE_BYTES) return blob;
    const scale = needsResize ? UPLOAD_MAX_WIDTH / bitmap.width : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, width, height);
    let out: Blob | null = null;
    for (const q of [0.85, 0.78, 0.7, 0.62, 0.5]) {
      const b = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((x) => resolve(x), "image/jpeg", q),
      );
      if (!b) continue;
      out = b;
      if (b.size <= MAX_PAGE_IMAGE_BYTES) break;
    }
    if (!out || out.size >= blob.size) return blob;
    return out;
  } finally {
    bitmap.close?.();
  }
}

/**
 * 슬롯들을 다운스케일 → 서명 URL 발급 → 4 동시 PUT.
 * 반환: attachExamSources 액션에 넘길 sourceFiles(페이지 오름차순).
 */
export async function uploadSlots(opts: {
  analysisId: string;
  slots: UploadSlot[];
  onProgress?: (uploaded: number, total: number) => void;
}): Promise<{ path: string; page: number }[]> {
  const { analysisId, slots, onProgress } = opts;

  // 메모리 안전: 한 번에 비트맵 1장만(모바일 다중 12MP 동시 디코드 방지).
  const prepared: { blob: Blob; index: number }[] = [];
  for (let i = 0; i < slots.length; i++) {
    const blob = await downscaleForUpload(slots[i].blob);
    prepared.push({ blob, index: i });
  }

  const res = await fetch("/api/exam-report/upload-urls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      analysisId,
      pages: prepared.map((p) => ({
        index: p.index,
        contentType: p.blob.type || "image/jpeg",
      })),
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "업로드 URL 발급에 실패했습니다.");
  }
  const { targets } = (await res.json()) as { targets: UploadUrlTarget[] };
  const byIndex = new Map(targets.map((t) => [t.index, t] as const));

  const queue = [...prepared];
  let uploaded = 0;
  async function worker() {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      const target = byIndex.get(item.index);
      if (!target) throw new Error(`페이지 ${item.index + 1} 업로드 대상이 없습니다.`);
      const put = await fetch(target.uploadUrl, {
        method: "PUT",
        body: item.blob,
        headers: {
          "Content-Type": item.blob.type || "image/jpeg",
          "x-upsert": "true",
        },
      });
      if (!put.ok) {
        throw new Error(`페이지 ${item.index + 1} 업로드 실패 (${put.status})`);
      }
      uploaded += 1;
      onProgress?.(uploaded, prepared.length);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < UPLOAD_CONCURRENCY; i++) workers.push(worker());
  await Promise.all(workers);

  return targets
    .map((t) => ({ path: t.path, page: t.index + 1 }))
    .sort((a, b) => a.page - b.page);
}
