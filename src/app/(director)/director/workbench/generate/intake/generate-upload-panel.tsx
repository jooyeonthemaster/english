"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileText,
  GripVertical,
  Layers,
  Loader2,
  PlayCircle,
  Scissors,
  UploadCloud,
} from "lucide-react";

import { ExtractionTaskListIcon } from "@/components/icons/workflow-icons";
import {
  ACCEPTED_IMAGE_MIMES,
  ACCEPTED_PDF_MIMES,
  MAX_PAGE_IMAGE_BYTES,
  MAX_PAGES_PER_JOB,
  MAX_PDF_BYTES,
} from "@/lib/extraction/constants";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import {
  dispatchGenerateTourMilestone,
  GENERATE_TOUR_SAMPLE_FILE_DRAG_TYPE,
  GENERATE_TOUR_SAMPLE_FILE_NAME,
} from "@/lib/generate-tour-demo";
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
import { isExtractable } from "../../passages/import/_components/intake/crop/slot-meta";
import { TutorialVideoPopup } from "../../passages/import/_components/intake/tutorial/tutorial-video-popup";
import { UploadMetaChip } from "../../passages/import/_components/bulk-extract-client/components/upload-meta-chip";

// 사용법 튜토리얼 영상(@remotion/player) — 브라우저 전용이라 lazy + ssr:false.
const CropTutorialPlayer = dynamic(
  () =>
    import("../../passages/import/_components/intake/tutorial/crop-tutorial-player").then(
      (m) => m.CropTutorialPlayer,
    ),
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
const RestoreTutorialPlayer = dynamic(
  () =>
    import("../../passages/import/_components/intake/tutorial/restore-tutorial-player").then(
      (m) => m.RestoreTutorialPlayer,
    ),
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
const FILE_EMPTY_GUIDE_W_KEY = "smoat.extraction.fileEmptyGuideWidth.v1";
const FILE_TUTORIAL_NEVER_KEY = "smoat.extraction.fileTutorialNeverShow.v2";
const clampFileGuideW = (w: number) =>
  Math.min(460, Math.max(280, Math.round(w)));

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function createGenerateTourSampleImageFile(): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1500;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D 컨텍스트를 열 수 없습니다.");

  context.fillStyle = "#f8fafc";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.shadowColor = "rgba(15, 23, 42, 0.08)";
  context.shadowBlur = 24;
  context.shadowOffsetY = 10;
  context.fillRect(110, 96, 980, 1300);
  context.shadowColor = "transparent";

  context.fillStyle = "#2563eb";
  context.font = "700 32px Arial, sans-serif";
  context.fillText("SMOAT Tutorial Sample", 170, 180);
  context.fillStyle = "#64748b";
  context.font = "600 22px Arial, sans-serif";
  context.fillText(
    "Reading passage for image/PDF extraction practice",
    170,
    224,
  );

  context.strokeStyle = "#dbeafe";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(170, 270);
  context.lineTo(1030, 270);
  context.stroke();

  const leftColumn = [
    "A good reader does not simply translate each sentence. Instead, the reader checks how ideas connect across the paragraph.",
    "When one sentence feels isolated, the whole flow becomes weak. Therefore, structure is as important as vocabulary.",
    "Students who mark signal words while reading can notice contrast, cause, and result more quickly.",
  ];
  const rightColumn = [
    "They can also explain the writer's purpose with clearer evidence.",
    "This sample page is designed for the tutorial. Drag it into the upload area, then crop the first column.",
    "Hold Shift and drag the second column to attach it to the same passage before extraction.",
  ];

  context.strokeStyle = "#e2e8f0";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(600, 318);
  context.lineTo(600, 850);
  context.stroke();

  const drawColumn = (paragraphs: string[], x: number) => {
    context.fillStyle = "#0f172a";
    context.font = "400 25px Arial, sans-serif";
    let y = 342;
    for (const paragraph of paragraphs) {
      for (const line of wrapCanvasText(context, paragraph, 390)) {
        context.fillText(line, x, y);
        y += 40;
      }
      y += 26;
    }
  };

  drawColumn(leftColumn, 170);
  drawColumn(rightColumn, 640);

  context.fillStyle = "#eef2ff";
  context.fillRect(170, 1130, 860, 92);
  context.fillStyle = "#4338ca";
  context.font = "700 24px Arial, sans-serif";
  context.fillText(
    "Tip: crop only the passage body before extraction.",
    205,
    1188,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error("예시 이미지 생성에 실패했습니다."));
        return;
      }
      resolve(result);
    }, "image/png");
  });

  return new File([blob], GENERATE_TOUR_SAMPLE_FILE_NAME, {
    type: "image/png",
  });
}

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
  /** Suppress the built-in extraction tutorial while the page-level tour is open. */
  suppressTutorial?: boolean;
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
  suppressTutorial = false,
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
  const [fileGuideWidth, setFileGuideWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 340;
    const raw = window.localStorage.getItem(FILE_EMPTY_GUIDE_W_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isNaN(n) ? 340 : clampFileGuideW(n);
  });
  const [fileTutorialClosed, setFileTutorialClosed] = useState(false);
  const [fileTutorialHidden, setFileTutorialHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(FILE_TUTORIAL_NEVER_KEY) === "true";
    } catch {
      return false;
    }
  });

  const busy = preparing || uploading || baking;

  useEffect(() => {
    if (slots.length === 0) setFileTutorialClosed(false);
  }, [outputMode, slots.length]);

  const hideFileTutorialPermanently = () => {
    setFileTutorialHidden(true);
    try {
      window.localStorage.setItem(FILE_TUTORIAL_NEVER_KEY, "true");
    } catch {
      /* ignore */
    }
  };

  const beginFileGuideResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX;
      const startW = fileGuideWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      let latest = startW;
      const move = (e: PointerEvent) => {
        e.preventDefault();
        latest = clampFileGuideW(startW - (e.clientX - startX));
        setFileGuideWidth(latest);
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        try {
          window.localStorage.setItem(FILE_EMPTY_GUIDE_W_KEY, String(latest));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", finish, { once: true });
      window.addEventListener("pointercancel", finish, { once: true });
    },
    [fileGuideWidth],
  );

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
          dispatchGenerateTourMilestone("file-ready");
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
          setSourceName((current) => current ?? summarizeNames(arr));
          setSourceType("IMAGES");
          dispatchGenerateTourMilestone("file-ready");
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
      const reindexed = extractable.map((slot, i) => ({
        ...slot,
        pageIndex: i,
      }));
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
      // 업로드 완료를 기다리지 않고 클릭 즉시 알림 — 업로드가 실패하면 아래에서
      // 에러 토스트로 정정한다.
      toast.success(
        outputMode === "restored"
          ? "복원 추출을 시작했어요. 완료되면 ‘내 지문’에 추가됩니다."
          : "추출을 시작했어요. 완료되면 ‘내 지문’에 추가됩니다.",
      );
      try {
        const jobId = await startUpload({
          slots: reindexed,
          sourceType: sourceType === "PDF" ? "PDF" : "IMAGES",
          originalFileName: sourceName,
          mode: "PASSAGE_ONLY",
          outputMode,
          // 생성 페이지 발 잡: finalize가 서버에서 drafts를 곧바로 Passage로 승격.
          // 추출(~수십 초) 중 페이지를 떠나도 결과가 고아로 남지 않는다.
          autoPromote: true,
          // 원본 첫 장을 목록 썸네일용 미리보기로 함께 업로드(크롭 결과와 별개).
          previewSlot: slots[0] ?? null,
        });
        if (jobId) {
          onResult(token, jobId);
          clearFiles();
        } else {
          onResult(token, null);
          const storeErr = useExtractionStore.getState().error;
          setError(storeErr || "추출 시작에 실패했습니다.");
          toast.error(storeErr || "추출 시작에 실패했습니다.");
        }
      } finally {
        setUploading(false);
      }
    },
    [
      clearFiles,
      onBegin,
      onResult,
      outputMode,
      slots,
      sourceName,
      sourceType,
      startUpload,
    ],
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
  const creditsPerPassage =
    outputMode === "restored"
      ? CREDIT_COSTS.PASSAGE_RESTORATION
      : 0;
  const fileProjectedCredits = fileTotalPassages * creditsPerPassage;
  const fileStartDisabled =
    busy || slots.length === 0 || fileTotalPassages === 0 || fileOverMax;
  const fileBusyLabel = baking
    ? "지문 자르는 중"
    : uploading
      ? "업로드 중"
      : preparing
        ? "PDF 페이지 분리 중"
        : "작업 중";

  const outputModeOptions = [
    {
      v: "verbatim" as const,
      label: "그대로 추출",
      badge: (
        <span className="inline-flex items-center gap-0.5">
          지문당{" "}
          <CreditCostChip
            amount={CREDIT_COSTS.TEXT_EXTRACTION}
            iconClassName="size-2.5"
          />
        </span>
      ),
    },
    {
      v: "restored" as const,
      label: "AI로 원문 복원",
      badge: (
        <span className="inline-flex items-center gap-0.5">
          지문당{" "}
          <CreditCostChip
            amount={
              CREDIT_COSTS.TEXT_EXTRACTION + CREDIT_COSTS.PASSAGE_RESTORATION
            }
            iconClassName="size-2.5"
          />
        </span>
      ),
    },
  ];
  const controlRowClass =
    "flex h-11 shrink-0 items-center gap-3 border-b border-slate-100 px-3";
  const controlLabelClass =
    "w-[128px] shrink-0 text-[12.5px] font-bold text-slate-700";

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
        data-generate-tour="file-extract-button"
        className={
          "inline-flex h-12 w-full items-center justify-center rounded-lg border text-[14px] font-extrabold text-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 " +
          (busy
            ? "cursor-wait border-blue-600 bg-blue-600"
            : fileStartDisabled
              ? "cursor-not-allowed border-blue-200 bg-blue-300"
              : "cursor-pointer border-blue-600 bg-blue-600 hover:bg-blue-700")
        }
      >
        {busy ? (
          <>
            <Loader2 className="mr-2 size-5 animate-spin" aria-hidden="true" />
            {fileBusyLabel}
          </>
        ) : (
          <>
            <PlayCircle className="mr-2 size-5" aria-hidden="true" />
            {outputMode === "restored" ? "복원하여 추출 시작" : "추출 시작"}
            {fileTotalPassages > 0 ? ` (지문 ${fileTotalPassages}개)` : ""}
            {fileTotalPassages > 0 ? (
              <CreditCostChip
                amount={fileProjectedCredits}
                className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-[11px]"
                title={`지문당 크레딧 ${creditsPerPassage} × ${fileTotalPassages}개 = 크레딧 ${fileProjectedCredits} 소모`}
              />
            ) : null}
          </>
        )}
      </button>
    </div>
  );

  const outputModeToggle = (
    <div
      className="flex min-w-0 items-center gap-3"
      data-generate-tour="output-mode"
    >
      <span className={controlLabelClass}>출력 방식</span>
      <div className="flex shrink-0 items-center gap-1">
        {outputModeOptions.map((opt) => {
          const active = outputMode === opt.v;
          return (
            <button
              key={opt.v}
              type="button"
              onClick={() => setOutputMode(opt.v)}
              disabled={busy}
              aria-pressed={active}
              data-generate-tour={`output-mode-${opt.v}`}
              className={
                "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 " +
                (active
                  ? "border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm"
                  : "border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600")
              }
            >
              {opt.label}
              <span
                className={
                  "rounded px-1 py-0.5 text-[9.5px] font-bold " +
                  (active
                    ? opt.v === "restored"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-slate-100 text-slate-500"
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
  );

  const renderFileUploadLabel = (className = "") => (
    <label
      htmlFor={FILE_INPUT_ID}
      className={
        "flex shrink-0 cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-blue-500 bg-white px-4 py-3 text-center transition-colors hover:bg-blue-50 " +
        className
      }
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
      <span className="inline-flex items-center gap-2 text-[14px] font-extrabold text-blue-700">
        {preparing ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <UploadCloud className="size-5" aria-hidden="true" />
        )}
        {preparing ? "PDF 페이지 분리 중…" : "파일을 끌어놓거나 클릭해서 추가"}
      </span>
      <span className="flex flex-wrap items-center justify-center gap-2">
        <UploadMetaChip
          icon={<FileText className="size-3.5" aria-hidden="true" />}
        >
          PDF, PNG, JPG, WebP
        </UploadMetaChip>
        <UploadMetaChip
          icon={
            <ExtractionTaskListIcon className="size-3.5" aria-hidden="true" />
          }
        >
          최대 {MAX_PAGES_PER_JOB}페이지
        </UploadMetaChip>
        <UploadMetaChip
          icon={<Database className="size-3.5" aria-hidden="true" />}
        >
          PDF {Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB
        </UploadMetaChip>
      </span>
    </label>
  );

  const quickGuideSteps = [
    { icon: UploadCloud, label: "파일 추가" },
    { icon: Scissors, label: "지문 드래그" },
    { icon: CheckCircle2, label: "합치고 추출" },
  ];
  const fileTutorialPopup =
    slots.length === 0 &&
    !fileTutorialClosed &&
    !fileTutorialHidden &&
    !suppressTutorial ? (
      outputMode === "restored" ? (
        <TutorialVideoPopup
          durationLabel="30초 AI 원문 복원 사용법"
          title="문제·선지까지 함께 크롭해 원문으로 복원"
          description="빈칸·순서·삽입형 지문은 지문만 자르지 말고 문제와 선지까지 함께 잡아야 AI가 원문으로 복원할 수 있어요."
          closeLabel="AI 원문 복원 사용법 영상 닫기"
          onClose={() => setFileTutorialClosed(true)}
          onHidePermanently={hideFileTutorialPermanently}
        >
          <RestoreTutorialPlayer />
        </TutorialVideoPopup>
      ) : (
        <TutorialVideoPopup
          durationLabel="30초 그대로 추출 사용법"
          title="파일을 올리고, 지문을 자르는 방법"
          description="처음이라면 영상을 보고 파일 추가부터 지문 합치기까지 한 번에 따라가세요."
          closeLabel="파일 추출 사용법 영상 닫기"
          onClose={() => setFileTutorialClosed(true)}
          onHidePermanently={hideFileTutorialPermanently}
        >
          <CropTutorialPlayer />
        </TutorialVideoPopup>
      )
    ) : null;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className={controlRowClass}>
        <div className="min-w-0">{outputModeToggle}</div>
        {inFlightCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            추출 중 {inFlightCount}건
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="mx-4 mt-2 flex shrink-0 items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          <AlertCircle
            className="mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col">
        {slots.length === 0 ? (
          <div
            onDragOver={(event) => {
              const acceptsDrop =
                event.dataTransfer.types.includes("Files") ||
                event.dataTransfer.types.includes(
                  GENERATE_TOUR_SAMPLE_FILE_DRAG_TYPE,
                );
              if (!acceptsDrop) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
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
              const hasTourSample = event.dataTransfer.types.includes(
                GENERATE_TOUR_SAMPLE_FILE_DRAG_TYPE,
              );
              if (event.dataTransfer.files.length > 0) {
                void handleFiles(event.dataTransfer.files);
                return;
              }
              if (hasTourSample) {
                void (async () => {
                  try {
                    const sampleFile =
                      await createGenerateTourSampleImageFile();
                    await handleFiles([sampleFile]);
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "예시 파일을 준비하지 못했습니다.",
                    );
                  }
                })();
              }
            }}
            className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row"
          >
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col border-b border-slate-100 p-3.5 lg:border-b-0">
              {fileTutorialPopup}
              <div
                data-generate-tour="upload-dropzone"
                className={
                  "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border p-3 transition-colors " +
                  (dragActive
                    ? "border-blue-300 bg-blue-50"
                    : "border-slate-200 bg-slate-50/70")
                }
              >
                {renderFileUploadLabel(
                  "min-h-0 flex-1 justify-center px-6 py-8",
                )}
              </div>
            </div>

            <button
              type="button"
              onPointerDown={beginFileGuideResize}
              title="드래그하여 추출 지문 패널 폭 조절"
              aria-label="추출 지문 패널 폭 조절"
              className="group/rhandle no-print hidden h-full min-h-0 w-3 shrink-0 cursor-col-resize touch-none select-none flex-col items-center justify-center gap-1 border-l border-slate-100 bg-slate-50 py-1 text-[10.5px] font-semibold text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 active:bg-blue-100 lg:flex"
            >
              <GripVertical
                className="size-3 opacity-50 transition-opacity group-hover/rhandle:opacity-80"
                aria-hidden="true"
              />
              <span style={{ writingMode: "vertical-rl" }}>추출 지문</span>
            </button>

            <aside
              style={{ width: fileGuideWidth }}
              className="flex min-h-0 flex-col bg-white max-lg:!w-full lg:shrink-0"
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-slate-900">
                  <Layers className="size-4 text-blue-600" aria-hidden="true" />
                  추출될 지문 0개
                </span>
              </div>
              <div className="smoat-file-guide-scroll min-h-0 flex-1 overflow-y-auto bg-slate-50/40 p-2.5">
                <div className="smoat-file-empty-guide mx-auto flex w-full max-w-[640px] flex-col rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <div className="inline-flex w-fit items-center gap-1.5 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white">
                      <PlayCircle className="size-3.5" aria-hidden="true" />
                      사용 순서
                    </div>
                    <h3 className="smoat-file-empty-guide__title min-w-0 flex-1 text-[15px] font-extrabold leading-snug text-slate-950">
                      파일을 올리면 바로 지문을 자를 수 있어요
                    </h3>
                  </div>
                  <ol className="smoat-file-empty-guide__steps mt-3 grid gap-2">
                    {quickGuideSteps.map((step, index) => (
                      <li
                        key={step.label}
                        className="smoat-file-empty-guide__step flex min-w-0 items-center gap-2 rounded-md bg-white px-2.5 py-2 text-[12px] font-bold text-slate-700 ring-1 ring-slate-200"
                      >
                        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-extrabold text-blue-700">
                          {index + 1}
                        </span>
                        <step.icon
                          className="size-3.5 text-blue-600"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 leading-snug">
                          {step.label}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
              <div className="shrink-0 border-t border-slate-100 bg-white p-2.5">
                {fileStartArea}
              </div>
            </aside>
          </div>
        ) : (
          <div
            className="flex h-full min-h-0 flex-1"
            data-generate-tour="file-crop-board"
          >
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
              onClear={clearFiles}
              outputMode={outputMode}
            />
          </div>
        )}
      </div>
      <style>{`
        .smoat-file-guide-scroll {
          container-type: inline-size;
        }
        .smoat-file-empty-guide {
          margin-top: clamp(0.75rem, 5cqw, 1.5rem);
          padding: clamp(0.75rem, 4cqw, 1rem);
        }
        .smoat-file-empty-guide__steps {
          grid-template-columns: 1fr;
        }
        @container (max-width: 359px) {
          .smoat-file-empty-guide__title {
            flex-basis: 100%;
            font-size: 13px;
          }
          .smoat-file-empty-guide__step {
            padding-block: 0.45rem;
          }
        }
        @container (min-width: 420px) {
          .smoat-file-empty-guide__title {
            flex-basis: 100%;
          }
          .smoat-file-empty-guide__steps {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .smoat-file-empty-guide__step {
            align-items: flex-start;
            flex-direction: column;
            min-height: 4.5rem;
          }
        }
        @container (min-width: 560px) {
          .smoat-file-empty-guide__title {
            flex-basis: auto;
          }
          .smoat-file-empty-guide__step {
            min-height: 4rem;
          }
        }
      `}</style>
    </section>
  );
}
