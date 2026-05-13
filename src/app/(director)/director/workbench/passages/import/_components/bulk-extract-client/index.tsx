"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  PanelBottomOpen,
  RefreshCw,
  UploadCloud,
} from "lucide-react";

import { useExtractionUpload } from "@/hooks/use-extraction-upload";
import { useExtractionStream } from "@/hooks/use-extraction-stream";
import {
  imagesToSlots,
  revokeSlotUrls,
  splitPdfToImages,
} from "@/lib/extraction/pdf-splitter";
import { useExtractionStore } from "@/lib/extraction/store";
import {
  ACCEPTED_IMAGE_MIMES,
  ACCEPTED_PDF_MIMES,
  MAX_PAGE_IMAGE_BYTES,
  MAX_PAGES_PER_JOB,
  MAX_PDF_BYTES,
} from "@/lib/extraction/constants";
import type { ClientPageSlot } from "@/lib/extraction/types";

import { useQueueDrawer } from "../queue-drawer-context";
import { TEXT_EXTRACTION_MIN_LENGTH } from "./constants";
import type { FileSourceType, InputMode, Props } from "./types";
import { summarizeFileNames } from "./utils";
import { ExtractionRunPanel } from "./components/extraction-run-panel";
import { UploadPanel } from "./components/upload-panel";

export function BulkExtractClient({ initialCreditBalance }: Props) {
  void initialCreditBalance;

  const router = useRouter();
  const phase = useExtractionStore((s) => s.phase);
  const jobId = useExtractionStore((s) => s.jobId);
  const error = useExtractionStore((s) => s.error);
  const slots = useExtractionStore((s) => s.slots);
  const splitProgress = useExtractionStore((s) => s.splitProgress);
  const uploadProgress = useExtractionStore((s) => s.uploadProgress);
  const setMode = useExtractionStore((s) => s.setMode);
  const setPhase = useExtractionStore((s) => s.setPhase);
  const setError = useExtractionStore((s) => s.setError);
  const setJobId = useExtractionStore((s) => s.setJobId);
  const setSlots = useExtractionStore((s) => s.setSlots);
  const setSource = useExtractionStore((s) => s.setSource);
  const setSplitProgress = useExtractionStore((s) => s.setSplitProgress);
  const setUploadProgress = useExtractionStore((s) => s.setUploadProgress);
  const startUpload = useExtractionUpload();

  const [sourceName, setSourceName] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<FileSourceType | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const queueDrawer = useQueueDrawer();
  const [inputMode, setInputMode] = useState<InputMode>("file");
  const [textTitle, setTextTitle] = useState("");
  const [textValue, setTextValue] = useState("");

  const bootstrapped = useRef(false);
  const navigatedToManage = useRef(false);
  const fileInputId = "m1-passage-workroom-file-input";

  useExtractionStream({
    jobId,
    enabled: phase === "processing" || phase === "starting" || phase === "uploading",
  });

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    setMode("PASSAGE_ONLY");

    if (typeof window !== "undefined") {
      const resumeJobId = new URLSearchParams(window.location.search).get("jobId");
      if (resumeJobId) {
        router.replace(`/director/workbench/passages/import/jobs?jobId=${resumeJobId}`);
        return;
      }
    }

    setPhase("idle");
  }, [router, setMode, setPhase]);

  // 추출이 끝나(=`reviewing` 진입) 잡이 terminal 상태가 되면 자동으로 관리
  // 페이지로 이동시킨다. 이 페이지(`/import`)의 ReviewStep은 M1
  // (`extraction_m1_passage_drafts`)을 표시하지 않으므로, 추출 직후 사용자가
  // 손으로 새로고침/이동을 해야만 결과를 볼 수 있는 동선이 있었다. `?jobId`로
  // 진입한 ManageClient는 그 잡의 `loadJobDetails`를 호출해 drafts를 표시한다.
  useEffect(() => {
    if (navigatedToManage.current) return;
    if (phase !== "reviewing") return;
    if (!jobId) return;
    navigatedToManage.current = true;
    router.replace(
      `/director/workbench/passages/import/jobs?jobId=${jobId}`,
    );
  }, [phase, jobId, router]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (phase === "preparing" || phase === "uploading" || phase === "starting") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [phase]);

  const appendSlots = useCallback(
    (incoming: ClientPageSlot[]) => {
      const offset = slots.length;
      const adjusted = incoming.map((slot, index) => ({
        ...slot,
        pageIndex: offset + index,
      }));
      const next = [...slots, ...adjusted];
      setSlots(next);
      setSource(
        `${next.length}페이지`,
        incoming.length === 1 ? "IMAGES" : sourceType === "PDF" ? "PDF" : "IMAGES",
      );
    },
    [setSlots, setSource, slots, sourceType],
  );

  /**
   * Reorder slots in place (drag-and-drop). pageIndex is recomputed so the
   * upload step still posts a contiguous 0..N-1 ordering — the server uses
   * sourceFileName / OCR-based page-number signals for further auto-sorting,
   * but this manual reorder lets the user fix obvious cases before extraction
   * starts (e.g. when the multi-select arrived in a wrong order).
   */
  const reorderSlots = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      if (fromIndex < 0 || fromIndex >= slots.length) return;
      if (toIndex < 0 || toIndex >= slots.length) return;
      const next = [...slots];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      setSlots(next.map((slot, i) => ({ ...slot, pageIndex: i })));
    },
    [setSlots, slots],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;
      setError(null);

      const pdf = arr.find((file) =>
        ACCEPTED_PDF_MIMES.includes(file.type as (typeof ACCEPTED_PDF_MIMES)[number]),
      );
      const allImages = arr.every((file) =>
        ACCEPTED_IMAGE_MIMES.includes(file.type as (typeof ACCEPTED_IMAGE_MIMES)[number]),
      );

      try {
        if (pdf) {
          if (arr.length > 1) {
      setError("PDF는 한 번에 하나만 추가해 주세요.");
            return;
          }
          if (pdf.size > MAX_PDF_BYTES) {
            setError(
        `PDF 파일은 최대 ${Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB까지 업로드할 수 있습니다.`,
            );
            return;
          }
          if (slots.length >= MAX_PAGES_PER_JOB) {
      setError(`한 작업에는 최대 ${MAX_PAGES_PER_JOB}페이지까지 넣을 수 있습니다.`);
            return;
          }
          setPhase("preparing");
          setSplitProgress({ pageIndex: 0, totalPages: 0 });
          const pages = await splitPdfToImages(pdf, {
            onProgress: (progress) => {
              if (progress.phase !== "done") {
                setSplitProgress({
                  pageIndex: progress.pageIndex,
                  totalPages: progress.totalPages,
                });
              }
            },
          });
          if (slots.length + pages.length > MAX_PAGES_PER_JOB) {
            revokeSlotUrls(pages);
      setError(`한 작업에는 최대 ${MAX_PAGES_PER_JOB}페이지까지 넣을 수 있습니다.`);
            setPhase("idle");
            return;
          }
          appendSlots(pages);
          setSourceName((current) => current ?? pdf.name);
          setSourceType("PDF");
          setSource(pdf.name, "PDF");
          setPhase("idle");
          setSplitProgress(null);
          return;
        }

        if (allImages) {
          if (slots.length + arr.length > MAX_PAGES_PER_JOB) {
      setError(`한 작업에는 최대 ${MAX_PAGES_PER_JOB}페이지까지 넣을 수 있습니다.`);
            return;
          }
          const oversized = arr.find((file) => file.size > MAX_PAGE_IMAGE_BYTES);
          if (oversized) {
      setError(`${oversized.name} 파일이 너무 큽니다. 이미지는 5MB 이하로 올려 주세요.`);
            return;
          }
          const pages = await imagesToSlots(arr);
          appendSlots(pages);
          setSourceName((current) => current ?? summarizeFileNames(arr));
          setSourceType("IMAGES");
          setSource(summarizeFileNames(arr), "IMAGES");
          setPhase("idle");
          return;
        }

        setError("PDF, PNG, JPG, WebP 파일만 업로드할 수 있습니다.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "파일을 처리하지 못했습니다");
        setPhase("idle");
      } finally {
        setSplitProgress(null);
      }
    },
    [
      appendSlots,
      setError,
      setPhase,
      setSource,
      setSplitProgress,
      slots.length,
    ],
  );

  const startExtraction = useCallback(async () => {
    if (slots.length === 0) {
      setError("추출할 파일을 먼저 추가해 주세요.");
      return;
    }
    const uploadSourceType: FileSourceType = sourceType === "PDF" ? "PDF" : "IMAGES";
    const nextJobId = await startUpload({
      slots,
      sourceType: uploadSourceType,
      originalFileName: sourceName,
      mode: "PASSAGE_ONLY",
    });
    if (nextJobId) {
      setJobId(nextJobId);
      setSlots([]);
      setSourceName(null);
      setSourceType(null);
      setUploadProgress(null);
      queueDrawer.setOpen(true);
      queueDrawer.triggerRefresh();
    }
  }, [
    setError,
    setJobId,
    setSlots,
    setUploadProgress,
    slots,
    sourceName,
    sourceType,
    startUpload,
  ]);

  const startTextExtraction = useCallback(async () => {
    const trimmedText = textValue.trim();
    const trimmedTitle = textTitle.trim();
    if (trimmedText.length < TEXT_EXTRACTION_MIN_LENGTH) {
      setError(`텍스트는 ${TEXT_EXTRACTION_MIN_LENGTH}자 이상 입력해 주세요.`);
      return;
    }

    try {
      setError(null);
      setPhase("starting");
      setJobId(null);
      const res = await fetch("/api/extraction/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mode: "PASSAGE_ONLY",
          title: trimmedTitle || undefined,
          text: trimmedText,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
      throw new Error(data?.error ?? "텍스트 추출에 실패했습니다.");
      }
      const data = (await res.json()) as { jobId: string };
      setJobId(data.jobId);
      setPhase("reviewing");
      setTextTitle("");
      setTextValue("");
      queueDrawer.setOpen(true);
      queueDrawer.triggerRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "텍스트 추출에 실패했습니다.");
      setPhase("idle");
    }
  }, [setError, setJobId, setPhase, textTitle, textValue]);

  const clearFiles = useCallback(() => {
    setSlots([]);
    setSourceName(null);
    setSourceType(null);
    setError(null);
  }, [setError, setSlots]);

  const clearText = useCallback(() => {
    setTextTitle("");
    setTextValue("");
    setError(null);
  }, [setError]);

  const busy =
    phase === "preparing" ||
    phase === "uploading" ||
    phase === "starting" ||
    phase === "processing";

  return (
    <div className="-m-6 flex h-[calc(100vh-56px)] bg-[#F4F6F9] px-4 py-4 sm:px-6 xl:px-8">
      <main className="mx-auto flex h-full w-full max-w-[1680px] flex-col gap-4">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-3 xl:px-6">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                <UploadCloud className="size-4" aria-hidden="true" />
              </span>
              <div>
                <h1 className="text-xl font-bold text-slate-950">자료 추출</h1>
                <p className="mt-0.5 text-sm text-slate-500">
                  PDF, 이미지, 텍스트를 등록하면 지문을 추출하고 원문 형태로 복원합니다.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={queueDrawer.triggerRefresh}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                새로고침
              </button>
              <button
                type="button"
                onClick={queueDrawer.toggle}
                className={
                  "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
                  (queueDrawer.open
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-slate-50")
                }
              >
                <PanelBottomOpen className="size-3.5" aria-hidden="true" />
                작업 목록
              </button>
            </div>
          </div>

          {error ? (
            <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="grid min-h-0 flex-1 gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_340px] xl:p-6">
            <UploadPanel
              busy={busy}
              dragActive={dragActive}
              fileInputId={fileInputId}
              inputMode={inputMode}
              slots={slots}
              splitProgress={splitProgress}
              textTitle={textTitle}
              textValue={textValue}
              uploadProgress={uploadProgress}
              onClear={clearFiles}
              onClearText={clearText}
              onFiles={handleFiles}
              onInputModeChange={setInputMode}
              onStart={startExtraction}
              onStartText={startTextExtraction}
              onDragActiveChange={setDragActive}
              onTextTitleChange={setTextTitle}
              onTextValueChange={setTextValue}
              onReorderSlots={reorderSlots}
            />
            <ExtractionRunPanel
              busy={busy}
              inputMode={inputMode}
              pageCount={slots.length}
              textLength={textValue.trim().length}
              activeJobId={jobId}
              onOpenManage={() => router.push("/director/workbench/passages/import/jobs")}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
