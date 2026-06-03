"use client";

import { useCallback } from "react";
import { useExtractionStore } from "@/lib/extraction/store";
import type { ClientPageSlot } from "@/lib/extraction/types";
import type { ExtractionMode } from "@/lib/extraction/modes";

interface UploadTarget {
  pageIndex: number;
  uploadUrl: string;
  uploadPath: string;
  token?: string;
  expiresAt: string;
}

interface CreateJobResponse {
  jobId: string;
  uploadTargets: UploadTarget[];
  creditsProjected: number;
  creditsBalanceBefore: number;
}

interface StartJobResponse {
  jobId: string;
  status: "PROCESSING" | "COMPLETED" | "PARTIAL" | "FAILED" | "CANCELLED";
}

const UPLOAD_CONCURRENCY = 4;

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

      const res = await fetch(target.uploadUrl, {
        method: "PUT",
        body: slot.blob,
        headers: {
          "Content-Type": slot.blob.type || "image/jpeg",
          "x-upsert": "true",
        },
      });
      if (!res.ok) {
        throw new Error(`페이지 ${slot.pageIndex + 1} 업로드 실패 (${res.status})`);
      }
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
    }): Promise<string | null> => {
      const { slots, sourceType, originalFileName, mode, outputMode } = opts;
      if (slots.length === 0) {
        setError("업로드할 페이지가 없습니다.");
        return null;
      }

      try {
        setPhase("uploading");
        setUploadProgress({ uploaded: 0, total: slots.length });

        const createRes = await fetch("/api/extraction/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceType,
            mode,
            outputMode,
            totalPages: slots.length,
            originalFileName: originalFileName ?? undefined,
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

        await putWithLimit(slots, created.uploadTargets, (uploaded) =>
          setUploadProgress({ uploaded, total: slots.length }),
        );

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
