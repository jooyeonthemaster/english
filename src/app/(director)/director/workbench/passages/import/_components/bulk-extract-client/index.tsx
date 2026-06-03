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
import type { ClientPageSlot, CropBox } from "@/lib/extraction/types";

import { useQueueDrawer } from "../queue-drawer-context";
import { CropModal } from "../intake/crop/crop-modal";
import { SlotPreviewModal } from "../intake/crop/slot-preview-modal";
import { MergeConfirmModal } from "../intake/crop/merge-confirm-modal";
import { stitchSlotsToBlob } from "../intake/crop/crop-utils";
import { isCroppable, isExtractable } from "../intake/crop/slot-meta";
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
  const [previewSlotIndex, setPreviewSlotIndex] = useState<number | null>(null);
  // P7-D2: 추출 산출 방식 — 기본 "원문 그대로(verbatim)", 옵션 "AI 복원(restored)".
  const [outputMode, setOutputMode] = useState<"verbatim" | "restored">(
    "verbatim",
  );
  // 여러 장 합치기(접근 A) — 선택 모드 + 선택 slotId(클릭순) + 합치기 프리뷰
  const [selectMode, setSelectMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);
  const [mergePreview, setMergePreview] = useState<{
    blob: Blob;
    url: string;
    width: number;
    height: number;
    materials: ClientPageSlot[];
  } | null>(null);

  const bootstrapped = useRef(false);
  const navigatedToManage = useRef(false);
  const fileInputId = "m1-passage-workroom-file-input";

  const UPLOAD_COLLAPSE_KEY = "smoat:extraction-bulk:upload:collapsed";
  const UPLOAD_HEIGHT_KEY = "smoat:extraction-bulk:upload:height";
  const UPLOAD_MIN = 360;
  const UPLOAD_MAX = 1400;
  const UPLOAD_DEFAULT = 760;
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
        slotId: slot.slotId ?? crypto.randomUUID(),
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
      const target = slots[index];
      // merged(여러 장 합친 결과)를 삭제하면, 재료들을 추출 대상으로 원복(고아 방지).
      let working = slots;
      if (target?.kind === "merged" && target.mergedFromSlotIds?.length) {
        const restore = new Set(target.mergedFromSlotIds);
        working = slots.map((s) =>
          s.slotId && restore.has(s.slotId)
            ? { ...s, kind: undefined, excludedFromExtraction: false }
            : s,
        );
      }
      const next = working
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
    // 크롭 떠낸 원본(추출 제외)은 빼고, 실제 추출 대상만 0..N-1로 재인덱싱.
    const extractable = adaptiveIntake ? slots.filter(isExtractable) : slots;
    if (extractable.length === 0) {
      setError("추출할 자료가 없습니다. (잘라낸 원본은 추출에서 제외됩니다)");
      return;
    }
    const reindexed = extractable.map((slot, i) => ({ ...slot, pageIndex: i }));
    // HIGH-1 가드: 합친/잘린 이미지가 5MB 초과면 서버가 거부하므로 업로드 전 차단.
    const oversized = reindexed.find((s) => s.bytes > MAX_PAGE_IMAGE_BYTES);
    if (oversized) {
      setError(
        `"${oversized.sourceFileName ?? "한 자료"}"가 너무 큽니다 (${Math.round(MAX_PAGE_IMAGE_BYTES / 1024 / 1024)}MB 초과). 합칠 장수를 줄이거나 영역을 더 작게 잘라 주세요.`,
      );
      return;
    }
    const uploadSourceType: FileSourceType =
      sourceType === "PDF" ? "PDF" : "IMAGES";
    const nextJobId = await startUpload({
      slots: reindexed,
      sourceType: uploadSourceType,
      originalFileName: sourceName,
      mode: "PASSAGE_ONLY",
      outputMode: adaptiveIntake ? outputMode : undefined,
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
    adaptiveIntake,
    outputMode,
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
          outputMode: adaptiveIntake ? outputMode : undefined,
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
  }, [
    adaptiveIntake,
    outputMode,
    queueDrawer,
    setError,
    setJobId,
    setPhase,
    textTitle,
    textValue,
  ]);

  // 크롭 확정 → 소스를 '추출 제외'로 표시하고, 떠낸 영역들을 소스 바로 뒤에 그룹으로
  // 끼워넣는다. 재편집이면 같은 소스의 기존 자식을 먼저 제거해 중복을 막는다.
  const handleCropConfirm = useCallback(
    (croppedSlots: ClientPageSlot[], boxes: CropBox[], boxGroups: number[]) => {
      if (cropSlotIndex === null) {
        return;
      }
      const source = slots[cropSlotIndex];
      if (!source || croppedSlots.length === 0) {
        setCropSlotIndex(null);
        return;
      }
      const sourceId = source.slotId ?? crypto.randomUUID();
      // 이 소스의 기존 크롭 자식 제거(재편집 중복 방지). 소스 자체는 유지.
      const base = slots.filter(
        (s) => s === source || s.sourceSlotId !== sourceId,
      );
      if (base.length + croppedSlots.length > MAX_PAGES_PER_JOB) {
        setError(
          `한 작업에는 최대 ${MAX_PAGES_PER_JOB}페이지까지 넣을 수 있습니다.`,
        );
        setCropSlotIndex(null);
        return;
      }
      const stamped = croppedSlots.map((s) => ({
        ...s,
        slotId: crypto.randomUUID(),
        sourceSlotId: sourceId,
      }));
      const srcIdx = base.findIndex((s) => s === source);
      const next = [...base];
      next[srcIdx] = {
        ...source,
        slotId: sourceId,
        kind: "source" as const,
        excludedFromExtraction: true,
        cropRegions: boxes,
        initialGroups: boxGroups,
      };
      next.splice(srcIdx + 1, 0, ...stamped);
      setSlots(next.map((s, i) => ({ ...s, pageIndex: i })));
      setCropSlotIndex(null);
    },
    [cropSlotIndex, setError, setSlots, slots],
  );

  // ── 여러 장 합치기(접근 A) 핸들러 ───────────────────────────────────────
  const toggleSelectMode = useCallback(() => {
    setSelectMode((p) => !p);
    setMergeSelection([]);
  }, []);

  const toggleSlotSelect = useCallback((slotId: string) => {
    setMergeSelection((prev) =>
      prev.includes(slotId)
        ? prev.filter((id) => id !== slotId)
        : [...prev, slotId],
    );
  }, []);

  // 클릭 순서(=읽기 순서)대로 선택 슬롯 이미지를 미리 이어붙여 확인 모달 오픈.
  const handleOpenMergePreview = useCallback(async () => {
    const materials = mergeSelection
      .map((id) => slots.find((s) => s.slotId === id))
      .filter((s): s is ClientPageSlot => !!s && isExtractable(s));
    if (materials.length < 2) return;
    try {
      const { blob, width, height, previewUrl } = await stitchSlotsToBlob(
        materials.map((s) => s.blob),
        { maxWidth: 2480 },
      );
      setMergePreview({ blob, url: previewUrl, width, height, materials });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "이어붙이기에 실패했습니다.",
      );
    }
  }, [mergeSelection, slots, setError]);

  // 확인 모달 확정 → 재료를 source+제외로, 첫 재료 위치에 merged 1개 삽입.
  const handleConfirmMerge = useCallback(
    (
      orderedMaterials: ClientPageSlot[],
      finalBlob: Blob,
      finalUrl: string,
      width: number,
      height: number,
    ) => {
      const matIds = new Set(orderedMaterials.map((s) => s.slotId));
      const firstIdx = slots.findIndex(
        (s) => s.slotId != null && matIds.has(s.slotId),
      );
      if (firstIdx < 0) {
        setMergePreview(null);
        return;
      }
      const next = slots.map((s) =>
        s.slotId != null && matIds.has(s.slotId)
          ? { ...s, kind: "source" as const, excludedFromExtraction: true }
          : s,
      );
      const merged: ClientPageSlot = {
        pageIndex: 0,
        blob: finalBlob,
        previewUrl: finalUrl,
        bytes: finalBlob.size,
        width,
        height,
        sourceFileName: `이어붙인 지문 · ${orderedMaterials.length}장`,
        slotId: crypto.randomUUID(),
        kind: "merged",
        regionCount: orderedMaterials.length,
        mergedFromSlotIds: orderedMaterials
          .map((s) => s.slotId)
          .filter((id): id is string => !!id),
      };
      next.splice(firstIdx + 1, 0, merged);
      setSlots(next.map((s, i) => ({ ...s, pageIndex: i })));
      setMergePreview(null);
      setSelectMode(false);
      setMergeSelection([]);
    },
    [slots, setSlots],
  );

  // merged "합치기 되돌리기" → merged 제거 + 재료 원복.
  const handleUnmerge = useCallback(
    (mergedSlotId: string) => {
      const merged = slots.find((s) => s.slotId === mergedSlotId);
      if (!merged || merged.kind !== "merged") return;
      const restoreIds = new Set(merged.mergedFromSlotIds ?? []);
      const next = slots
        .filter((s) => s.slotId !== mergedSlotId)
        .map((s) =>
          s.slotId && restoreIds.has(s.slotId)
            ? { ...s, kind: undefined, excludedFromExtraction: false }
            : s,
        );
      setSlots(next.map((s, i) => ({ ...s, pageIndex: i })));
    },
    [slots, setSlots],
  );

  const clearFiles = useCallback(() => {
    setSlots([]);
    setSourceName(null);
    setSourceType(null);
    setError(null);
    setSelectMode(false);
    setMergeSelection([]);
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
              description={
                adaptiveIntake
                  ? "PDF·이미지·텍스트를 등록해 지문을 추출합니다. 빈칸·순서 문제는 선택적으로 AI 복원할 수 있습니다."
                  : "PDF, 이미지, 텍스트를 등록하면 지문을 추출하고 원문 형태로 복원합니다."
              }
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
                className={
                  "grid min-h-0 overflow-hidden " +
                  (adaptiveIntake
                    ? "grid-cols-1"
                    : "xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_340px]")
                }
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
                  onPreviewSlot={
                    adaptiveIntake
                      ? (index) => setPreviewSlotIndex(index)
                      : undefined
                  }
                  selectMode={adaptiveIntake ? selectMode : undefined}
                  mergeSelection={adaptiveIntake ? mergeSelection : undefined}
                  onToggleSelectMode={
                    adaptiveIntake ? toggleSelectMode : undefined
                  }
                  onToggleSlotSelect={
                    adaptiveIntake ? toggleSlotSelect : undefined
                  }
                  onClearSelection={
                    adaptiveIntake ? () => setMergeSelection([]) : undefined
                  }
                  onOpenMergePreview={
                    adaptiveIntake ? handleOpenMergePreview : undefined
                  }
                  onUnmerge={adaptiveIntake ? handleUnmerge : undefined}
                  outputMode={adaptiveIntake ? outputMode : undefined}
                  onOutputModeChange={adaptiveIntake ? setOutputMode : undefined}
                />
                {adaptiveIntake ? null : (
                  <ExtractionRunPanel
                    busy={runBusy}
                    inputMode={inputMode}
                    pageCount={slots.length}
                    textLength={textValue.trim().length}
                    activeJobId={jobId}
                  />
                )}
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
          initialBoxes={slots[cropSlotIndex].cropRegions}
          initialGroups={slots[cropSlotIndex].initialGroups}
          onCancel={() => setCropSlotIndex(null)}
          onConfirm={handleCropConfirm}
        />
      ) : null}

      {adaptiveIntake &&
      previewSlotIndex !== null &&
      slots[previewSlotIndex] ? (
        <SlotPreviewModal
          slot={slots[previewSlotIndex]}
          onClose={() => setPreviewSlotIndex(null)}
          onEdit={
            isCroppable(slots[previewSlotIndex])
              ? () => {
                  const idx = previewSlotIndex;
                  setPreviewSlotIndex(null);
                  setCropSlotIndex(idx);
                }
              : undefined
          }
        />
      ) : null}

      {adaptiveIntake && mergePreview ? (
        <MergeConfirmModal
          initial={mergePreview}
          onCancel={() => {
            URL.revokeObjectURL(mergePreview.url);
            setMergePreview(null);
          }}
          onConfirm={handleConfirmMerge}
        />
      ) : null}
    </div>
  );
}
