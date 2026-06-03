"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

import { TaskQueueInlineList } from "@/components/workbench/task-queue";
import type { GridViewMode } from "@/components/workbench/task-queue/task-queue-inline-list";
import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";
import { MaterialExtractionIcon } from "@/components/icons/workflow-icons";
import { toast } from "sonner";
import { useExtractionUpload } from "@/hooks/use-extraction-upload";
import { useExtractionStream } from "@/hooks/use-extraction-stream";
import {
  imagesToSlots,
  revokeSlotUrls,
  splitPdfToImages,
} from "@/lib/extraction/pdf-splitter";
import { useExtractionStore } from "@/lib/extraction/store";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import {
  ACCEPTED_IMAGE_MIMES,
  ACCEPTED_PDF_MIMES,
  MAX_PAGE_IMAGE_BYTES,
  MAX_PAGES_PER_JOB,
  MAX_PDF_BYTES,
} from "@/lib/extraction/constants";
import type { ClientPageSlot } from "@/lib/extraction/types";

import { useQueueDrawer } from "../queue-drawer-context";
import { CropModal } from "../intake/crop/crop-modal";
import { TEXT_EXTRACTION_MIN_LENGTH } from "./constants";
import type { FileSourceType, InputMode, Props } from "./types";
import { summarizeFileNames } from "./utils";
import { ExtractionRunPanel } from "./components/extraction-run-panel";
import { JobPreviewDrawer } from "./components/job-preview-drawer";
import { UploadPanel } from "./components/upload-panel";

export function BulkExtractClient({
  initialCreditBalance,
  initialCollections,
  initialCollectionMembership,
}: Props) {
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
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  const [taskListViewMode, setTaskListViewMode] =
    useState<GridViewMode>("grid-3");
  // 적응형 인테이크 — 크롭 대상 슬롯 인덱스 (플래그 on일 때만 활성)
  const adaptiveIntake = FEATURE_FLAGS.EXTRACTION_ADAPTIVE_INTAKE;
  const [cropSlotIndex, setCropSlotIndex] = useState<number | null>(null);

  const bootstrapped = useRef(false);
  const navigatedToManage = useRef(false);
  const fileInputId = "m1-passage-workroom-file-input";

  const UPLOAD_COLLAPSE_KEY = "smoat:extraction-bulk:upload:collapsed";
  const UPLOAD_HEIGHT_KEY = "smoat:extraction-bulk:upload:height";
  const UPLOAD_MIN = 320;
  const UPLOAD_MAX = 900;
  const UPLOAD_DEFAULT = 520;
  const [uploadCollapsed, setUploadCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(UPLOAD_COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [uploadHeight, setUploadHeight] = useState<number>(() => {
    if (typeof window === "undefined") return UPLOAD_DEFAULT;
    try {
      const raw = window.localStorage.getItem(UPLOAD_HEIGHT_KEY);
      if (!raw) return UPLOAD_DEFAULT;
      const n = parseInt(raw, 10);
      if (Number.isNaN(n)) return UPLOAD_DEFAULT;
      return Math.min(UPLOAD_MAX, Math.max(UPLOAD_MIN, n));
    } catch {
      return UPLOAD_DEFAULT;
    }
  });

  const openPreviewDrawer = useCallback((taskId: string) => {
    setTaskListViewMode((prev) => (prev === "grid-3" ? "grid-2" : prev));
    setPreviewJobId(taskId);
  }, []);
  const toggleUploadCollapsed = useCallback(() => {
    setUploadCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(UPLOAD_COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  const beginUploadResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startY = e.clientY;
      const startHeight = uploadHeight;
      let latest = startHeight;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev: PointerEvent) => {
        latest = Math.min(
          UPLOAD_MAX,
          Math.max(UPLOAD_MIN, startHeight + (ev.clientY - startY)),
        );
        setUploadHeight(latest);
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        try {
          window.localStorage.setItem(UPLOAD_HEIGHT_KEY, String(latest));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [uploadHeight],
  );
  const resetUploadHeight = useCallback(() => {
    setUploadHeight(UPLOAD_DEFAULT);
    try {
      window.localStorage.setItem(UPLOAD_HEIGHT_KEY, String(UPLOAD_DEFAULT));
    } catch {
      /* ignore */
    }
  }, []);

  useExtractionStream({
    jobId,
    enabled:
      phase === "processing" || phase === "starting" || phase === "uploading",
  });

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    setMode("PASSAGE_ONLY");

    if (typeof window !== "undefined") {
      const resumeJobId = new URLSearchParams(window.location.search).get(
        "jobId",
      );
      if (resumeJobId) {
        router.replace(
          `/director/workbench/passages/import/jobs?jobId=${resumeJobId}`,
        );
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
    router.replace(`/director/workbench/passages/import/jobs?jobId=${jobId}`);
  }, [phase, jobId, router]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        phase === "preparing" ||
        phase === "uploading" ||
        phase === "starting"
      ) {
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
        incoming.length === 1
          ? "IMAGES"
          : sourceType === "PDF"
            ? "PDF"
            : "IMAGES",
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

  const removeSlot = useCallback(
    (index: number) => {
      if (index < 0 || index >= slots.length) return;
      const next = slots
        .filter((_, i) => i !== index)
        .map((slot, i) => ({ ...slot, pageIndex: i }));
      setSlots(next);
      if (next.length === 0) {
        setSourceName(null);
        setSourceType(null);
        setError(null);
      }
    },
    [setError, setSlots, slots],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;
      setError(null);

      const pdf = arr.find((file) =>
        ACCEPTED_PDF_MIMES.includes(
          file.type as (typeof ACCEPTED_PDF_MIMES)[number],
        ),
      );
      const allImages = arr.every((file) =>
        ACCEPTED_IMAGE_MIMES.includes(
          file.type as (typeof ACCEPTED_IMAGE_MIMES)[number],
        ),
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
            setError(
              `한 작업에는 최대 ${MAX_PAGES_PER_JOB}페이지까지 넣을 수 있습니다.`,
            );
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
            setError(
              `한 작업에는 최대 ${MAX_PAGES_PER_JOB}페이지까지 넣을 수 있습니다.`,
            );
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
            setError(
              `한 작업에는 최대 ${MAX_PAGES_PER_JOB}페이지까지 넣을 수 있습니다.`,
            );
            return;
          }
          const oversized = arr.find(
            (file) => file.size > MAX_PAGE_IMAGE_BYTES,
          );
          if (oversized) {
            setError(
              `${oversized.name} 파일이 너무 큽니다. 이미지는 5MB 이하로 올려 주세요.`,
            );
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
        setError(
          err instanceof Error ? err.message : "파일을 처리하지 못했습니다",
        );
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
    const uploadSourceType: FileSourceType =
      sourceType === "PDF" ? "PDF" : "IMAGES";
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
    queueDrawer,
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
      setError(
        err instanceof Error ? err.message : "텍스트 추출에 실패했습니다.",
      );
      setPhase("idle");
    }
  }, [queueDrawer, setError, setJobId, setPhase, textTitle, textValue]);

  // 크롭 모달이 만든 영역 슬롯들을 새 페이지로 추가 (각 영역 = 지문 1개).
  const handleCropConfirm = useCallback(
    (croppedSlots: ClientPageSlot[]) => {
      if (croppedSlots.length === 0) {
        setCropSlotIndex(null);
        return;
      }
      if (slots.length + croppedSlots.length > MAX_PAGES_PER_JOB) {
        setError(
          `한 작업에는 최대 ${MAX_PAGES_PER_JOB}페이지까지 넣을 수 있습니다.`,
        );
        setCropSlotIndex(null);
        return;
      }
      appendSlots(croppedSlots);
      setCropSlotIndex(null);
    },
    [appendSlots, setError, slots.length],
  );

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

  const inputBusy =
    phase === "preparing" || phase === "uploading" || phase === "starting";
  const runBusy = inputBusy || phase === "processing";

  return (
    <div className="-m-6 min-h-[calc(100vh-56px)] min-w-0 bg-[#F4F6F9] px-4 py-4 sm:px-6 xl:px-8">
      <main className="flex w-full min-w-0 flex-col gap-4">
        <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-4 py-3">
            <WorkflowPageTitle
              icon={MaterialExtractionIcon}
              title="자료 추출"
              description="PDF, 이미지, 텍스트를 등록하면 지문을 추출하고 원문 형태로 복원합니다."
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={queueDrawer.triggerRefresh}
                aria-label="새로고침"
                className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <RefreshCw className="size-4" aria-hidden="true" />
              </button>
              {uploadCollapsed ? (
                <button
                  type="button"
                  onClick={toggleUploadCollapsed}
                  aria-expanded={false}
                  title="자료 추출 펼치기"
                  className="inline-flex h-8 cursor-pointer items-center gap-1 px-1 text-[11.5px] font-medium text-slate-400 transition-colors hover:text-slate-600"
                >
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                  <span>펼치기</span>
                </button>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
              <AlertCircle
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <span>{error}</span>
            </div>
          ) : null}

          {!uploadCollapsed ? (
            <>
              <div
                className="grid min-h-0 overflow-hidden xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_340px]"
                style={{ height: uploadHeight }}
              >
                <UploadPanel
                  busy={inputBusy}
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
                  onRemoveSlot={removeSlot}
                  onCropSlot={
                    adaptiveIntake ? (index) => setCropSlotIndex(index) : undefined
                  }
                />
                <ExtractionRunPanel
                  busy={runBusy}
                  inputMode={inputMode}
                  pageCount={slots.length}
                  textLength={textValue.trim().length}
                  activeJobId={jobId}
                />
              </div>
              <div className="relative flex items-center justify-end px-4 pb-1 pt-1">
                <div
                  onPointerDown={beginUploadResize}
                  onDoubleClick={resetUploadHeight}
                  title="드래그하여 높이 조절 · 더블 클릭하여 초기화"
                  className="group/uhandle absolute left-1/2 top-1/2 inline-flex h-3 w-[200px] -translate-x-1/2 -translate-y-1/2 cursor-row-resize items-center justify-center px-1 select-none"
                >
                  <div className="h-0.5 w-full rounded-full bg-slate-200 transition-colors group-hover/uhandle:bg-blue-400 group-active/uhandle:bg-blue-500" />
                </div>
                <button
                  type="button"
                  onClick={toggleUploadCollapsed}
                  aria-expanded
                  title="자료 추출 접기"
                  className="inline-flex cursor-pointer items-center gap-1 text-[11.5px] font-medium text-blue-400 transition-colors hover:text-blue-600"
                >
                  <ChevronUp className="size-3.5" aria-hidden="true" />
                  <span>접기</span>
                </button>
              </div>
            </>
          ) : null}
        </section>

        <TaskQueueInlineList
          domain="extraction"
          layout="grid"
          limit={100}
          title="자료 목록"
          headerNote="최신순으로 표시됩니다"
          emptyMessage="아직 등록된 자료가 없습니다."
          viewMode={taskListViewMode}
          onViewModeChange={setTaskListViewMode}
          onTaskClick={(task) => openPreviewDrawer(task.id)}
          onRenameTask={async (task, next) => {
            try {
              const body = JSON.stringify({
                displayName: next.length > 0 ? next : null,
              });
              const res = await fetch(`/api/extraction/jobs/${task.id}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body,
              });
              if (!res.ok) throw new Error("자료 이름을 저장하지 못했습니다.");
              toast.success("자료 이름이 저장되었습니다.");
              queueDrawer.triggerRefresh();
            } catch (err) {
              toast.error(
                err instanceof Error
                  ? err.message
                  : "자료 이름을 저장하지 못했습니다.",
              );
            }
          }}
          collapsible={{
            storageKey: "smoat:extraction-bulk:job-list",
            resizable: false,
          }}
          grid3Disabled={previewJobId !== null}
        />
      </main>

      {previewJobId ? (
        <JobPreviewDrawer
          jobId={previewJobId}
          onClose={() => setPreviewJobId(null)}
          initialCollections={initialCollections}
          initialCollectionMembership={initialCollectionMembership}
        />
      ) : null}

      {adaptiveIntake && cropSlotIndex !== null && slots[cropSlotIndex] ? (
        <CropModal
          slot={slots[cropSlotIndex]}
          onCancel={() => setCropSlotIndex(null)}
          onConfirm={handleCropConfirm}
        />
      ) : null}
    </div>
  );
}
