// ============================================================================
// 학생 마킹 사진 업로드 헬퍼 — 학생 관리 탭 추가 모달 전용(브라우저).
//
// 같은 upload-urls 라우트를 studentId 스코프로 경유한다:
//   POST /api/exam-report/upload-urls { analysisId, studentId, pages } → targets
//   → 각 서명 URL 로 PUT → setStudentSources 에 넘길 [{path, page}] 반환.
// 다운스케일(폭 2000px 재압축)은 이 모듈에 자족 구현(허브 헬퍼와 결합 회피).
// ============================================================================

import { MAX_PAGE_IMAGE_BYTES } from "@/lib/extraction/constants";

export interface StudentUploadSlot {
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

/** 업로드 직전 1장을 폭 2000px 로 축소·재압축(EXIF 회전 굳힘). 조건 미달 시 원본. */
async function downscale(blob: Blob): Promise<Blob> {
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
 * 학생 마킹 사진 슬롯들을 다운스케일 → studentId 스코프 서명 URL 발급 → 4 동시 PUT.
 * 반환: setStudentSources 로 넘길 sourceFiles(페이지 오름차순).
 */
export async function uploadStudentPages(opts: {
  analysisId: string;
  studentId: string;
  slots: StudentUploadSlot[];
  onProgress?: (uploaded: number, total: number) => void;
}): Promise<{ path: string; page: number }[]> {
  const { analysisId, studentId, slots, onProgress } = opts;
  if (slots.length === 0) return [];

  // 메모리 안전: 한 번에 비트맵 1장만 디코드.
  const prepared: { blob: Blob; index: number }[] = [];
  for (let i = 0; i < slots.length; i++) {
    const blob = await downscale(slots[i].blob);
    prepared.push({ blob, index: i });
  }

  const res = await fetch("/api/exam-report/upload-urls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      analysisId,
      studentId,
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
