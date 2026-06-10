"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import {
  AlertCircle,
  Database,
  FileText,
  Loader2,
  PlayCircle,
  Trash2,
  UploadCloud,
} from "lucide-react";

import {
  ACCEPTED_IMAGE_MIMES,
  ACCEPTED_PDF_MIMES,
  MAX_PAGE_IMAGE_BYTES,
  MAX_PAGES_PER_JOB,
  MAX_PDF_BYTES,
} from "@/lib/extraction/constants";
import {
  imagesToSlots,
  revokeSlotUrls,
  splitPdfToImages,
} from "@/lib/extraction/pdf-splitter";
import type { ClientPageSlot } from "@/lib/extraction/types";
import { useExtractionUpload } from "@/hooks/use-extraction-upload";
import { useExtractionStore } from "@/lib/extraction/store";

import {
  InlineCropBoard,
  type InlineCropBoardCounts,
  type InlineCropBoardHandle,
} from "../../passages/import/_components/intake/crop/inline-crop-board";
import { RestoreGuideDemo } from "../../passages/import/_components/intake/crop/restore-guide-demo";
import { isExtractable } from "../../passages/import/_components/intake/crop/slot-meta";

// 사용법 튜토리얼 영상(@remotion/player) — 브라우저 전용이라 lazy + ssr:false.
const CropTutorialPlayer = dynamic(
  () =>
    import(
      "../../passages/import/_components/intake/tutorial/crop-tutorial-player"
    ).then((m) => m.CropTutorialPlayer),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full animate-pulse rounded-xl bg-slate-100"
        style={{ aspectRatio: "1280 / 720" }}
      />
    ),
  },
);

const EMPTY_COUNTS: InlineCropBoardCounts = {
  regionCount: 0,
  passageCount: 0,
  uncroppedCount: 0,
  totalPassages: 0,
};

const FILE_INPUT_ID = "generate-intake-file-input";
const ACCEPT = [...ACCEPTED_PDF_MIMES, ...ACCEPTED_IMAGE_MIMES].join(",");

function summarizeNames(files: File[]): string {
  if (files.length === 0) return "";
  if (files.length === 1) return files[0].name;
  return `${files[0].name} 외 ${files.length - 1}개`;
}

interface GenerateUploadPanelProps {
  /** Button pressed (before the job exists) — show loading cards immediately. */
  onBegin: (id: string, count: number) => void;
  /** Job created (jobId) or failed to start (null), for the same client id. */
  onResult: (id: string, jobId: string | null) => void;
  /** Number of extraction passages from this page still running (for the banner). */
  inFlightCount: number;
}

/**
 * Image/PDF extraction surface for the generate page — reuses the extraction
 * page's crop board, restore guide, and upload pipeline, but file-only (text
 * paste lives in the 직접 입력 tab). On 추출 시작 it fires a PASSAGE_ONLY job and
 * hands the jobId up; the page's useGenerateExtraction watches the queue and
 * promotes the resulting drafts into selectable passages.
 */
export function GenerateUploadPanel({
  onBegin,
  onResult,
  inFlightCount,
}: GenerateUploadPanelProps) {
  const startUpload = useExtractionUpload();

  const [slots, setSlots] = useState<ClientPageSlot[]>([]);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<"PDF" | "IMAGES" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [outputMode, setOutputMode] = useState<"verbatim" | "restored">(
    "verbatim",
  );

  const boardRef = useRef<InlineCropBoardHandle>(null);
  const [boardCounts, setBoardCounts] =
    useState<InlineCropBoardCounts>(EMPTY_COUNTS);
  const [baking, setBaking] = useState(false);

  const busy = preparing || uploading || baking;

  const appendSlots = useCallback((incoming: ClientPageSlot[]) => {
    setSlots((prev) => {
      const offset = prev.length;
      const adjusted = incoming.map((slot, index) => ({
        ...slot,
        pageIndex: offset + index,
        slotId: slot.slotId ?? crypto.randomUUID(),
      }));
      return [...prev, ...adjusted];
    });
  }, []);

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
          setPreparing(true);
          const pages = await splitPdfToImages(pdf);
          if (slots.length + pages.length > MAX_PAGES_PER_JOB) {
            revokeSlotUrls(pages);
            setError(
              `한 작업에는 최대 ${MAX_PAGES_PER_JOB}페이지까지 넣을 수 있습니다.`,
            );
            return;
          }
          appendSlots(pages);
          setSourceName((current) => current ?? pdf.name);
          setSourceType("PDF");
          return;
        }

        if (allImages) {
          if (slots.length + arr.length > MAX_PAGES_PER_JOB) {
            setError(
              `한 작업에는 최대 ${MAX_PAGES_PER_JOB}페이지까지 넣을 수 있습니다.`,
            );
            return;
          }
          const oversized = arr.find((file) => file.size > MAX_PAGE_IMAGE_BYTES);
          if (oversized) {
            setError(
              `${oversized.name} 파일이 너무 큽니다. 이미지는 5MB 이하로 올려 주세요.`,
            );
            return;
          }
          const pages = await imagesToSlots(arr);
          appendSlots(pages);
          setSourceName((current) => current ?? summarizeNames(arr));
          setSourceType("IMAGES");
          return;
        }

        setError("PDF, PNG, JPG, WebP 파일만 업로드할 수 있습니다.");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "파일을 처리하지 못했습니다.",
        );
      } finally {
        setPreparing(false);
      }
    },
    [appendSlots, slots.length],
  );

  const reorderSlots = useCallback((fromIndex: number, toIndex: number) => {
    setSlots((prev) => {
      if (fromIndex === toIndex) return prev;
      if (fromIndex < 0 || fromIndex >= prev.length) return prev;
      if (toIndex < 0 || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next.map((slot, i) => ({ ...slot, pageIndex: i }));
    });
  }, []);

  const removeSlot = useCallback((index: number) => {
    setSlots((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const target = prev[index];
      // merged(여러 장 합친 결과) 삭제 시 재료를 추출 대상으로 원복(고아 방지).
      let working = prev;
      if (target?.kind === "merged" && target.mergedFromSlotIds?.length) {
        const restore = new Set(target.mergedFromSlotIds);
        working = prev.map((s) =>
          s.slotId && restore.has(s.slotId)
            ? { ...s, kind: undefined, excludedFromExtraction: false }
            : s,
        );
      }
      return working
        .filter((_, i) => i !== index)
        .map((slot, i) => ({ ...slot, pageIndex: i }));
    });
  }, []);

  const clearFiles = useCallback(() => {
    setSlots([]);
    setSourceName(null);
    setSourceType(null);
    setError(null);
  }, []);

  const startExtraction = useCallback(
    async (passageSlots?: ClientPageSlot[]) => {
      const source = passageSlots ?? slots;
      const extractable = source.filter(isExtractable);
      if (extractable.length === 0) {
        setError("추출할 자료가 없습니다. (잘라낸 원본은 추출에서 제외됩니다)");
        return;
      }
      const reindexed = extractable.map((slot, i) => ({ ...slot, pageIndex: i }));
      const oversized = reindexed.find((s) => s.bytes > MAX_PAGE_IMAGE_BYTES);
      if (oversized) {
        setError(
          `"${oversized.sourceFileName ?? "한 자료"}"가 너무 큽니다 (${Math.round(MAX_PAGE_IMAGE_BYTES / 1024 / 1024)}MB 초과). 합칠 장수를 줄이거나 영역을 더 작게 잘라 주세요.`,
        );
        return;
      }

      // 즉시 '내 지문'으로 넘어가 추출 중 로딩 카드를 띄운다(업로드는 그 뒤 백그라운드).
      const token = crypto.randomUUID();
      onBegin(token, reindexed.length);
      setUploading(true);
      try {
        const jobId = await startUpload({
          slots: reindexed,
          sourceType: sourceType === "PDF" ? "PDF" : "IMAGES",
          originalFileName: sourceName,
          mode: "PASSAGE_ONLY",
          outputMode,
        });
        if (jobId) {
          onResult(token, jobId);
          clearFiles();
          toast.success(
            outputMode === "restored"
              ? "복원 추출을 시작했어요. 완료되면 ‘내 지문’에 추가됩니다."
              : "추출을 시작했어요. 완료되면 ‘내 지문’에 추가됩니다.",
          );
        } else {
          onResult(token, null);
          const storeErr = useExtractionStore.getState().error;
          setError(storeErr || "추출 시작에 실패했습니다.");
        }
      } finally {
        setUploading(false);
      }
    },
    [clearFiles, onBegin, onResult, outputMode, slots, sourceName, sourceType, startUpload],
  );

  // 추출 시작 — 보드 결과를 구운 뒤 업로드(완료 후 '내 지문'으로 넘어가 로딩 카드 표시).
  const handleFileStart = useCallback(async () => {
    if (slots.length === 0) return;
    if (boardRef.current) {
      setBaking(true);
      try {
        const baked = await boardRef.current.buildPassageSlots();
        if (baked) await startExtraction(baked);
      } finally {
        setBaking(false);
      }
      return;
    }
    await startExtraction();
  }, [slots.length, startExtraction]);

  const fileTotalPassages = slots.length === 0 ? 0 : boardCounts.totalPassages;
  const fileOverMax = fileTotalPassages > MAX_PAGES_PER_JOB;
  const fileStartDisabled =
    busy || slots.length === 0 || fileTotalPassages === 0 || fileOverMax;
  const startLabel = baking
    ? "지문 자르는 중"
    : uploading
      ? "업로드 중"
      : outputMode === "restored"
        ? "복원하여 추출 시작"
        : "추출 시작";

  const outputModeOptions = [
    { v: "verbatim" as const, label: "그대로 추출", badge: "OCR만" },
    { v: "restored" as const, label: "AI로 원문 복원", badge: "지문당 ◈1" },
  ];

  // 검수 패널 하단에 고정되는 시작 버튼(보드 footer로 주입).
  const fileStartArea = (
    <div className="flex flex-col gap-1.5">
      {fileOverMax ? (
        <span className="text-center text-[11px] font-bold text-red-600">
          지문 한도({MAX_PAGES_PER_JOB}개) 초과 — 영역을 줄이거나 합쳐 주세요.
        </span>
      ) : null}
      <button
        type="button"
        onClick={handleFileStart}
        disabled={fileStartDisabled}
        className={
          "inline-flex h-11 w-full items-center justify-center rounded-lg border text-[13.5px] font-extrabold text-white shadow-sm transition-colors " +
          (busy
            ? "cursor-wait border-blue-600 bg-blue-600"
            : fileStartDisabled
              ? "cursor-not-allowed border-blue-200 bg-blue-300"
              : "cursor-pointer border-blue-600 bg-blue-600 hover:bg-blue-700")
        }
      >
        {busy ? (
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
        ) : (
          <PlayCircle className="mr-2 size-4" aria-hidden="true" />
        )}
        {startLabel}
        {!busy && fileTotalPassages > 0 ? ` (지문 ${fileTotalPassages}개)` : ""}
      </button>
    </div>
  );

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header + output-mode toggle */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-100 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-[12.5px] font-bold text-slate-900">
            이미지·PDF에서 추출
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            지문 영역을 드래그해 지문별로 추출합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-600">출력</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {outputModeOptions.map((opt) => {
                const active = outputMode === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setOutputMode(opt.v)}
                    disabled={busy}
                    aria-pressed={active}
                    className={
                      "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 " +
                      (active
                        ? "bg-white text-blue-700 shadow-sm ring-1 ring-blue-100"
                        : "cursor-pointer text-slate-500 hover:text-slate-700")
                    }
                  >
                    {opt.label}
                    <span
                      className={
                        "rounded px-1 py-0.5 text-[9px] font-bold " +
                        (active && opt.v === "restored"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-slate-100 text-slate-400")
                      }
                    >
                      {opt.badge}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {slots.length > 0 ? (
            <button
              type="button"
              onClick={clearFiles}
              disabled={busy}
              className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              비우기
            </button>
          ) : null}
        </div>
      </div>

      {inFlightCount > 0 ? (
        <div className="shrink-0 px-4 pt-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            추출 중 {inFlightCount}건 · 완료되면 ‘내 지문’에 추가됩니다
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="mx-4 mt-2 flex shrink-0 items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col">
        {slots.length === 0 ? (
          <div
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              const next = event.relatedTarget as Node | null;
              if (!next || !event.currentTarget.contains(next))
                setDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              if (event.dataTransfer.files.length > 0)
                void handleFiles(event.dataTransfer.files);
            }}
            className={
              "m-3.5 flex min-h-0 flex-1 flex-col gap-3 rounded-lg border-2 border-dashed p-3 transition-colors " +
              (dragActive ? "border-sky-500 bg-sky-50" : "border-slate-300 bg-white")
            }
          >
            {/* 사용법 가이드(복원: 데모 / 원문: 튜토리얼 영상) — 이 영역만 스크롤.
                파일 추가 버튼은 아래에 고정되어 항상 보인다. */}
            <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              {outputMode === "restored" ? (
                <div className="mx-auto w-full max-w-[960px]">
                  <RestoreGuideDemo />
                </div>
              ) : (
                <div className="mx-auto w-full max-w-[920px]">
                  <CropTutorialPlayer />
                </div>
              )}
            </div>

            {/* 파일 추가 */}
            <label
              htmlFor={FILE_INPUT_ID}
              className="flex shrink-0 cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-blue-500 bg-white px-4 py-3 text-center transition-colors hover:bg-blue-50"
            >
              <input
                id={FILE_INPUT_ID}
                type="file"
                className="sr-only"
                accept={ACCEPT}
                multiple
                onChange={(event) => {
                  if (event.target.files) void handleFiles(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
              <span className="inline-flex items-center gap-2 text-[13.5px] font-extrabold text-blue-700">
                {preparing ? (
                  <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                ) : (
                  <UploadCloud className="size-5" aria-hidden="true" />
                )}
                {preparing ? "PDF 페이지 분리 중…" : "파일을 끌어놓거나 클릭해서 추가"}
              </span>
              <span className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5">
                  <FileText className="size-3.5" aria-hidden="true" />
                  PDF, PNG, JPG, WebP
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5">
                  최대 {MAX_PAGES_PER_JOB}페이지
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5">
                  <Database className="size-3.5" aria-hidden="true" />
                  PDF {Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB
                </span>
              </span>
            </label>
          </div>
        ) : (
          <InlineCropBoard
            ref={boardRef}
            images={slots}
            disabled={busy}
            onAddFiles={handleFiles}
            onRemoveImage={removeSlot}
            onReorderImages={reorderSlots}
            maxPassages={MAX_PAGES_PER_JOB}
            onCountChange={setBoardCounts}
            footer={fileStartArea}
            outputMode={outputMode}
          />
        )}
      </div>
    </section>
  );
}
