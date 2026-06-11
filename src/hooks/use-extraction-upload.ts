"use client";

import { useCallback } from "react";
import { MAX_PAGE_IMAGE_BYTES } from "@/lib/extraction/constants";
import { useExtractionStore } from "@/lib/extraction/store";
import type { ClientPageSlot } from "@/lib/extraction/types";
import type { ExtractionMode } from "@/lib/extraction/modes";

interface UploadTargetBase {
  uploadUrl: string;
  uploadPath: string;
  token?: string;
  expiresAt: string;
}

interface UploadTarget extends UploadTargetBase {
  pageIndex: number;
}

interface CreateJobResponse {
  jobId: string;
  uploadTargets: UploadTarget[];
  previewUploadTarget?: UploadTargetBase | null;
  creditsProjected: number;
  creditsBalanceBefore: number;
}

interface StartJobResponse {
  jobId: string;
  status: "PROCESSING" | "COMPLETED" | "PARTIAL" | "FAILED" | "CANCELLED";
}

const UPLOAD_CONCURRENCY = 4;

// 인라인(이미지) 추출은 OCR을 백그라운드로 던지고 즉시 반환하므로(다음 작업을 바로
// 시작할 수 있게), 진행 중인 백그라운드 OCR 개수를 모듈 레벨에서 센다. 페이지 이탈
// 경고(beforeunload)가 이 값을 읽어, 백그라운드 작업이 남아 있으면 경고를 유지한다.
let inlineInFlight = 0;
export function isInlineExtractionInFlight(): boolean {
  return inlineInFlight > 0;
}

/** 업로드 전 다운스케일 기준 폭(px). 시험지/지문 텍스트 OCR은 ~170DPI(=A4 폭
 *  2000px)면 충분하고, 폰 사진 원본(폭 3000~4000px·수 MB)을 그대로 올릴 때보다
 *  업로드도 OCR도 크게 빨라진다. 가독성이 폭에 좌우되므로 "긴 변"이 아닌 "폭"
 *  기준으로 축소한다(세로로 긴 합본 지문이 뭉개지는 것 방지). 정확도 떨어지면 상향. */
const UPLOAD_MAX_WIDTH = 2000;

/**
 * 업로드 직전 이미지 1장 다운스케일/재압축. 폭이 기준 이하이고 용량도 5MB 이하면
 * 원본을 그대로 반환한다. 그 외엔 폭을 UPLOAD_MAX_WIDTH로 줄여 JPEG 재인코딩(5MB
 * 이하가 되도록 품질 단계적 하향). createImageBitmap(from-image)로 EXIF 회전도 함께
 * 굳혀(canvas 출력엔 EXIF 없음) 폰 사진 회전 메타로 OCR이 뒤집히는 문제도 막는다.
 * 디코드 실패(PDF 등)·결과가 더 큰 경우엔 원본 유지(안전 우선).
 */
async function downscaleForUpload(blob: Blob): Promise<Blob> {
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
 * 슬롯 전체를 업로드 직전 다운스케일한다. 메모리 안전을 위해 순차 처리
 * (한 번에 비트맵 1장만 메모리에 올림 — 모바일 다중 12MP 동시 디코드 방지).
 */
async function prepareSlotsForUpload(
  slots: ClientPageSlot[],
): Promise<ClientPageSlot[]> {
  const out: ClientPageSlot[] = [];
  for (const slot of slots) {
    const blob = await downscaleForUpload(slot.blob);
    out.push(blob === slot.blob ? slot : { ...slot, blob, bytes: blob.size });
  }
  return out;
}

function mimeTypeForBlob(blob: Blob): "image/jpeg" | "image/png" | "image/webp" {
  if (blob.type === "image/png") return "image/png";
  if (blob.type === "image/webp") return "image/webp";
  return "image/jpeg";
}

async function putBlobToTarget(
  blob: Blob,
  target: UploadTargetBase,
  label: string,
): Promise<void> {
  const res = await fetch(target.uploadUrl, {
    method: "PUT",
    body: blob,
    headers: {
      "Content-Type": blob.type || "image/jpeg",
      "x-upsert": "true",
    },
  });
  if (!res.ok) throw new Error(`${label} 업로드 실패 (${res.status})`);
}

async function putWithLimit(
  slots: ClientPageSlot[],
  targets: UploadTarget[],
  onProgress: (uploaded: number) => void,
): Promise<void> {
  const queue = [...slots];
  const byIndex = new Map(targets.map((target) => [target.pageIndex, target] as const));
  let uploaded = 0;

  async function worker() {
    for (;;) {
      const slot = queue.shift();
      if (!slot) return;
      const target = byIndex.get(slot.pageIndex);
      if (!target) throw new Error(`No upload target for page ${slot.pageIndex}`);

      await putBlobToTarget(slot.blob, target, `페이지 ${slot.pageIndex + 1}`);
      uploaded += 1;
      onProgress(uploaded);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < UPLOAD_CONCURRENCY; i += 1) workers.push(worker());
  await Promise.all(workers);
}

export function useExtractionUpload() {
  const setPhase = useExtractionStore((s) => s.setPhase);
  const setJobId = useExtractionStore((s) => s.setJobId);
  const setUploadProgress = useExtractionStore((s) => s.setUploadProgress);
  const setError = useExtractionStore((s) => s.setError);

  return useCallback(
    async (opts: {
      slots: ClientPageSlot[];
      sourceType: "PDF" | "IMAGES";
      originalFileName: string | null;
      mode: ExtractionMode;
      /** P7-D2: "verbatim"(원문 그대로) | "restored"(AI 복원). 미전달=기존 동작. */
      outputMode?: "verbatim" | "restored";
      /** 원본 첫 장 미리보기. 크롭/이어붙임 추출과 별개로 목록 썸네일에 사용한다. */
      previewSlot?: ClientPageSlot | null;
    }): Promise<string | null> => {
      const {
        slots: rawSlots,
        sourceType,
        originalFileName,
        mode,
        outputMode,
        previewSlot: rawPreviewSlot,
      } = opts;
      if (rawSlots.length === 0) {
        setError("업로드할 페이지가 없습니다.");
        return null;
      }

      try {
        setPhase("uploading");
        setUploadProgress({ uploaded: 0, total: rawSlots.length });

        // 업로드 전 다운스케일 — 폰 사진(수 MB)을 OCR 충분 해상도로 줄여 업로드·
        // OCR 시간을 함께 단축. 실패 슬롯은 원본 그대로 유지된다.
        const slots = await prepareSlotsForUpload(rawSlots);
        const previewSlot = rawPreviewSlot
          ? (await prepareSlotsForUpload([rawPreviewSlot]))[0]
          : null;

        const createRes = await fetch("/api/extraction/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceType,
            mode,
            outputMode,
            totalPages: slots.length,
            originalFileName: originalFileName ?? undefined,
            previewPage: previewSlot
              ? {
                  size: previewSlot.bytes,
                  mimeType: mimeTypeForBlob(previewSlot.blob),
                }
              : undefined,
            pages: slots.map((slot) => ({
              pageIndex: slot.pageIndex,
              size: slot.bytes,
              sourceFileName: slot.sourceFileName ?? undefined,
              mimeType:
                slot.blob.type === "image/png"
                  ? "image/png"
                  : slot.blob.type === "image/webp"
                    ? "image/webp"
                    : "image/jpeg",
            })),
          }),
        });
        if (!createRes.ok) {
          const data = await createRes.json().catch(() => ({}));
          throw new Error(data?.error ?? "작업 생성에 실패했습니다.");
        }
        const created = (await createRes.json()) as CreateJobResponse;
        setJobId(created.jobId);

        if (previewSlot && created.previewUploadTarget) {
          try {
            await putBlobToTarget(
              previewSlot.blob,
              created.previewUploadTarget,
              "미리보기",
            );
          } catch {
            // Preview is best-effort. The extraction pages themselves are the
            // durable payload, so a missing thumbnail must not block OCR.
          }
        }

        await putWithLimit(slots, created.uploadTargets, (uploaded) =>
          setUploadProgress({ uploaded, total: slots.length }),
        );

        // 이미지 잡은 INLINE(트리거 X)으로 — cold pod 오버헤드 없이 warm 서버에서
        // OCR+finalize를 한 요청에 처리하고 drafts 커밋 후 반환받는다. 결과가 이미
        // DB에 있으므로 관리 페이지 이동 시 "새로고침해야 보임" 버그도 사라진다.
        // 대용량 PDF 잡은 타임아웃/내구성 위해 기존 트리거 경로(/start) 유지.
        const useInline = sourceType === "IMAGES";
        if (useInline) {
          setPhase("processing");
          // 인라인 OCR을 백그라운드로 던지고(파이어 앤 포겟) 업로드 직후 즉시 반환한다.
          // → 사용자는 곧바로 다음 추출을 시작할 수 있다. 진행/완료/실패 상태는 "자료
          //   목록"(서버 폴링)이 반영하므로, 완료 시 store.phase를 건드리지 않는다(이미
          //   다른 작업으로 넘어갔을 수 있어 레이스 방지). 도중 페이지를 이탈하면 요청이
          //   끊겨 잡이 PROCESSING으로 남을 수 있으나 리퍼가 복구한다(beforeunload 경고로
          //   완화).
          inlineInFlight += 1;
          void fetch(`/api/extraction/jobs/${created.jobId}/extract-inline`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          })
            .catch(() => {
              /* 실패는 큐가 FAILED로 반영 */
            })
            .finally(() => {
              inlineInFlight -= 1;
            });
          return created.jobId;
        }

        setPhase("starting");
        const startRes = await fetch(`/api/extraction/jobs/${created.jobId}/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!startRes.ok) {
          const data = await startRes.json().catch(() => ({}));
          throw new Error(data?.error ?? "작업 시작에 실패했습니다.");
        }

        const started = (await startRes.json()) as StartJobResponse;
        setPhase(
          ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"].includes(started.status)
            ? "reviewing"
            : "processing",
        );
        return created.jobId;
      } catch (err) {
        setError((err as Error).message);
        return null;
      }
    },
    [setPhase, setJobId, setUploadProgress, setError],
  );
}
