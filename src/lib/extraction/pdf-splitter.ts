// ============================================================================
// Client-side PDF → page image splitter, powered by pdfjs-dist.
//
// Runs only in the browser. Server components / API routes must never import
// this module (pdfjs-dist ships a browser-only worker entry point).
//
// Output: an array of { pageIndex, blob, previewUrl, bytes, width, height },
//         one per page, ready to be uploaded to Supabase Storage via the
//         signed upload URLs issued by POST /api/extraction/jobs.
//
// Error contract:
//   - Rejects with a plain Error whose `message` is safe to show to users.
// ============================================================================

"use client";

import type { ClientPageSlot } from "./types";
import {
  PDF_RENDER_SCALE,
  PDF_RENDER_JPEG_QUALITY,
  MAX_PAGES_PER_JOB,
  MAX_PAGE_IMAGE_BYTES,
} from "./constants";

type PdfjsModule = typeof import("pdfjs-dist");

let pdfjsCache: PdfjsModule | null = null;
const PDFJS_WORKER_SRC = "/pdf.worker.min.mjs";

/** Lazy-load pdfjs-dist and wire its worker. Called on first PDF split. */
async function loadPdfjs(): Promise<PdfjsModule> {
  if (pdfjsCache) return pdfjsCache;
  // pdfjs-dist ships a webpack-generated ESM bundle. Importing that bundle
  // through Next's dev webpack path can crash before the module initializes,
  // so we let the browser load the prebuilt file from /public directly.
  // @ts-expect-error - served from /public at runtime rather than resolved by TS
  const pdfjs = (await import(/* webpackIgnore: true */ "/pdf.min.mjs")) as PdfjsModule;
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  pdfjsCache = pdfjs;
  return pdfjs;
}

export interface SplitProgress {
  phase: "loading" | "rendering" | "done";
  pageIndex?: number;
  totalPages?: number;
}

export interface SplitOptions {
  scale?: number;
  jpegQuality?: number;
  onProgress?: (p: SplitProgress) => void;
  signal?: AbortSignal;
}

/** Split a PDF file into per-page JPEG blobs. */
export async function splitPdfToImages(
  file: File,
  options: SplitOptions = {},
): Promise<ClientPageSlot[]> {
  const { scale = PDF_RENDER_SCALE, jpegQuality = PDF_RENDER_JPEG_QUALITY, onProgress, signal } =
    options;

  onProgress?.({ phase: "loading" });

  const pdfjs = await loadPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

  const totalPages = pdf.numPages;
  if (totalPages > MAX_PAGES_PER_JOB) {
    throw new Error(
      `이 PDF는 ${totalPages}페이지입니다. 최대 ${MAX_PAGES_PER_JOB}페이지까지 지원됩니다.`,
    );
  }
  if (totalPages === 0) {
    throw new Error("PDF에서 페이지를 읽지 못했습니다.");
  }

  const slots: ClientPageSlot[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    onProgress?.({ phase: "rendering", pageIndex: pageNum - 1, totalPages });

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D 컨텍스트를 열 수 없습니다.");

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    // Fill white background — exam scans often have transparent bg otherwise.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    // pdfjs-dist v5 expects `canvas` in the params.
    await page.render({
      canvas,
      canvasContext: context,
      viewport,
      intent: "display",
    } as Parameters<typeof page.render>[0]).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (!b) {
            reject(new Error("이미지 변환에 실패했습니다."));
            return;
          }
          resolve(b);
        },
        "image/jpeg",
        jpegQuality,
      );
    });

    if (blob.size > MAX_PAGE_IMAGE_BYTES) {
      // Retry once at a lower quality to stay under the cap.
      const compressed = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("이미지 압축 실패"))),
          "image/jpeg",
          Math.max(0.5, jpegQuality - 0.2),
        );
      });
      if (compressed.size > MAX_PAGE_IMAGE_BYTES) {
        throw new Error(
          `${pageNum}페이지의 이미지가 ${Math.round(compressed.size / 1024 / 1024)}MB로 너무 큽니다. 페이지를 낮은 해상도로 올려 주세요.`,
        );
      }
      slots.push({
        pageIndex: pageNum - 1,
        blob: compressed,
        previewUrl: URL.createObjectURL(compressed),
        bytes: compressed.size,
        width: canvas.width,
        height: canvas.height,
      });
    } else {
      slots.push({
        pageIndex: pageNum - 1,
        blob,
        previewUrl: URL.createObjectURL(blob),
        bytes: blob.size,
        width: canvas.width,
        height: canvas.height,
      });
    }

    // Free canvas memory eagerly — long PDFs otherwise exhaust the heap on
    // older devices.
    canvas.width = 0;
    canvas.height = 0;
  }

  onProgress?.({ phase: "done", totalPages });
  return slots;
}

/** Convert an array of uploaded image files into the same slot shape. Used
 *  when the user drops multiple images instead of a PDF. */
export async function imagesToSlots(files: File[]): Promise<ClientPageSlot[]> {
  if (files.length > MAX_PAGES_PER_JOB) {
    throw new Error(
      `이미지는 최대 ${MAX_PAGES_PER_JOB}장까지 올릴 수 있습니다.`,
    );
  }

  const slots: ClientPageSlot[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.size > MAX_PAGE_IMAGE_BYTES) {
      throw new Error(
        `${file.name}은(는) ${Math.round(file.size / 1024 / 1024)}MB로 너무 큽니다. 5MB 이하로 올려 주세요.`,
      );
    }

    const url = URL.createObjectURL(file);
    const dim = await imageDimensions(url).catch(() => ({ width: 0, height: 0 }));

    slots.push({
      pageIndex: i,
      blob: file,
      previewUrl: url,
      bytes: file.size,
      width: dim.width,
      height: dim.height,
    });
  }
  return slots;
}

function imageDimensions(objectUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("image load failed"));
    img.src = objectUrl;
  });
}

/** Release blob URLs. Must be called before the component unmounts or the
 *  slot array is replaced. */
export function revokeSlotUrls(slots: ClientPageSlot[]): void {
  for (const s of slots) {
    try {
      URL.revokeObjectURL(s.previewUrl);
    } catch {
      // ignore — already revoked or not a blob URL
    }
  }
}
