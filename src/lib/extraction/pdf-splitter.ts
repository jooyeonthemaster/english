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

/**
 * Lazy-load pdfjs-dist and wire its worker. Called on first PDF split.
 *
 * Exported so other readers can use the *same* cached instance instead of
 * loading a second copy of the 1MB bundle. In particular the passage-authoring
 * material reader pulls a PDF's text layer (`page.getTextContent()`) rather
 * than rasterising + OCRing it — see pdf-text-layer.ts.
 */
export async function loadPdfjs(): Promise<PdfjsModule> {
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
  /**
   * 렌더할 최대 페이지 수(앞에서부터).
   *
   * **미지정(undefined)이면 기존 동작과 바이트 단위로 동일하다** — 문서 전체를
   * 렌더하고 MAX_PAGES_PER_JOB(30) 초과 시 던진다. 자료추출 파이프라인은 페이지를
   * 하나도 빠뜨리면 안 되는 물건이라 그 계약을 그대로 유지한다.
   *
   * 지정하면 (a) 앞에서부터 이만큼만 렌더하고 (b) 30쪽 상한 거절도 하지 않는다.
   * 호출자가 "앞 N쪽만 읽는다"를 이미 알고 있다는 뜻이기 때문이다. 이 분기가 없어서
   * 35쪽 스캔 교재는 자료 판독의 "앞 20쪽만" 규칙에 닿기도 전에 전면 거절됐다.
   */
  maxPages?: number;
  /**
   * 렌더할 페이지 인덱스(0-based) 화이트리스트. 지정하면 이 페이지들만 렌더한다.
   * 쪽 단위 하이브리드(텍스트 레이어가 있는 쪽은 직독, 없는 쪽만 OCR)를 위해 있다 —
   * 필요 없는 쪽까지 굽는 것은 실제로 느린 유일한 구간(canvas render)의 낭비다.
   * maxPages 와 함께 주면 화이트리스트를 정렬한 뒤 앞에서 maxPages 개만 남긴다.
   * 미지정이면 기존 동작 그대로다.
   */
  pageIndices?: readonly number[];
}

/** Split a PDF file into per-page JPEG blobs. */
export async function splitPdfToImages(
  file: File,
  options: SplitOptions = {},
): Promise<ClientPageSlot[]> {
  const {
    scale = PDF_RENDER_SCALE,
    jpegQuality = PDF_RENDER_JPEG_QUALITY,
    onProgress,
    signal,
    maxPages,
    pageIndices,
  } = options;

  onProgress?.({ phase: "loading" });

  const pdfjs = await loadPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

  const totalPages = pdf.numPages;
  // 상한을 준 호출자는 "앞 N쪽만"을 스스로 정한 것이므로 전면 거절하지 않는다.
  // 상한을 안 준 기존 호출부(자료추출·시험지 업로드)에는 이 줄이 그대로 남는다.
  const bounded = maxPages !== undefined || pageIndices !== undefined;
  if (!bounded && totalPages > MAX_PAGES_PER_JOB) {
    throw new Error(
      `이 PDF는 ${totalPages}페이지입니다. 최대 ${MAX_PAGES_PER_JOB}페이지까지 지원됩니다.`,
    );
  }
  if (totalPages === 0) {
    throw new Error("PDF에서 페이지를 읽지 못했습니다.");
  }

  const targets = resolveTargetPages({ totalPages, maxPages, pageIndices });
  if (targets.length === 0) {
    throw new Error("PDF에서 읽을 페이지를 찾지 못했습니다.");
  }

  const slots: ClientPageSlot[] = [];

  // 중간에 던지면(용량 초과·abort·캔버스 실패) 지금까지 만든 슬롯은 호출자에게
  // 도달하지 못한 채 사라진다 — 그 previewUrl 은 아무도 revoke 할 수 없어 문서
  // 수명 내내 blob 이 메모리에 남는다(28쪽 스캔에서 수 MB~10MB 급 누수). 실패
  // 경로에서 스스로 회수한다. 성공 시엔 호출자가 revokeSlotUrls 로 회수한다.
  try {
    return await renderPages({
      pdf,
      targets,
      slots,
      scale,
      jpegQuality,
      fileName: file.name,
      onProgress,
      signal,
    });
  } catch (error) {
    revokeSlotUrls(slots);
    throw error;
  }
}

/**
 * 실제로 렌더할 페이지 인덱스(0-based) 목록. 옵션이 둘 다 없으면 `[0 … n-1]` 이라
 * 기존 호출부의 루프와 완전히 같다.
 */
function resolveTargetPages(args: {
  totalPages: number;
  maxPages?: number;
  pageIndices?: readonly number[];
}): number[] {
  const { totalPages, maxPages, pageIndices } = args;
  const limit =
    maxPages === undefined ? totalPages : Math.max(0, Math.floor(maxPages));
  if (pageIndices) {
    return Array.from(new Set(pageIndices.map((index) => Math.floor(index))))
      .filter((index) => index >= 0 && index < totalPages)
      .sort((a, b) => a - b)
      .slice(0, limit);
  }
  return Array.from({ length: Math.min(totalPages, limit) }, (_, i) => i);
}

type PdfDocument = Awaited<ReturnType<PdfjsModule["getDocument"]>["promise"]>;

/** splitPdfToImages 의 페이지 렌더 루프. 실패 시 회수를 위해 slots 를 밖에서 받는다. */
async function renderPages(args: {
  pdf: PdfDocument;
  /** 렌더할 페이지 인덱스(0-based, 오름차순). */
  targets: number[];
  slots: ClientPageSlot[];
  scale: number;
  jpegQuality: number;
  fileName: string;
  onProgress?: (p: SplitProgress) => void;
  signal?: AbortSignal;
}): Promise<ClientPageSlot[]> {
  const { pdf, targets, slots, scale, jpegQuality, fileName, onProgress, signal } =
    args;

  // 진행률의 분모는 "문서 쪽수"가 아니라 "이번에 굽는 쪽수"다. 화이트리스트로
  // 3쪽만 굽는데 "3/35쪽"이 뜨면 멈춘 것처럼 보인다.
  const totalPages = targets.length;

  for (const pageIndex of targets) {
    const pageNum = pageIndex + 1;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    onProgress?.({ phase: "rendering", pageIndex, totalPages });

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
        pageIndex,
        blob: compressed,
        previewUrl: URL.createObjectURL(compressed),
        bytes: compressed.size,
        width: canvas.width,
        height: canvas.height,
        sourceFileName: fileName,
      });
    } else {
      slots.push({
        pageIndex,
        blob,
        previewUrl: URL.createObjectURL(blob),
        bytes: blob.size,
        width: canvas.width,
        height: canvas.height,
        sourceFileName: fileName,
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

/**
 * Natural-sort comparator for filenames: treats embedded digit runs as numbers
 * so that `img2.jpg` < `img10.jpg`, and `KakaoTalk_..._01.jpg` < `_02.jpg`.
 * The compare goes case-insensitive and uses the locale numeric option so
 * Hangul / mixed strings still sort sensibly. Used to give image multi-uploads
 * a sane default order — the user can still drag to reorder afterwards.
 */
function naturalCompareFilenames(a: string, b: string): number {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

/** Convert an array of uploaded image files into the same slot shape. Used
 *  when the user drops multiple images instead of a PDF. Files are
 *  natural-sorted by filename first so multi-select / drag-and-drop arrive
 *  in a predictable order. */
export async function imagesToSlots(files: File[]): Promise<ClientPageSlot[]> {
  if (files.length > MAX_PAGES_PER_JOB) {
    throw new Error(
      `이미지는 최대 ${MAX_PAGES_PER_JOB}장까지 올릴 수 있습니다.`,
    );
  }

  const sorted = [...files].sort((a, b) =>
    naturalCompareFilenames(a.name, b.name),
  );

  const slots: ClientPageSlot[] = [];
  // splitPdfToImages 와 같은 이유로 실패 경로에서 스스로 회수한다 — 던진 뒤에는
  // 아무도 이 배열을 볼 수 없어 objectURL 이 영구히 남는다.
  try {
    for (let i = 0; i < sorted.length; i++) {
      const file = sorted[i];
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
        sourceFileName: file.name,
      });
    }
  } catch (error) {
    revokeSlotUrls(slots);
    throw error;
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
