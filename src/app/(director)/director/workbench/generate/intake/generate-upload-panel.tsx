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
  ShoppingBasket,
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
import { triggerHintGlow } from "@/lib/hint-glow";
import { useExtractionUpload } from "@/hooks/use-extraction-upload";
import { useExtractionStore } from "@/lib/extraction/store";

import {
  InlineCropBoard,
  type InlineCropBoardCounts,
  type InlineCropBoardHandle,
} from "../../passages/import/_components/intake/crop/inline-crop-board";
import { isExtractable } from "../../passages/import/_components/intake/crop/slot-meta";
import { TutorialVideoPopup } from "../../passages/import/_components/intake/tutorial/tutorial-video-popup";
import { UploadMetaChip } from "@/components/workbench/shared/upload-meta-chip";

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
  /**
   * 추출 자료의 과목 — "KOREAN" 이면 잡에 subject 를 실어 SourceMaterial·승급
   * Passage 까지 국어로 전파하고, AI 원문 복원(영어 전용) 옵션은 숨긴다.
   * 미전달 = 영어 기본(기존 동작 그대로, 무회귀).
   */
  subject?: "KOREAN";
  /**
   * 좁은 컨테이너 임베드(클래스 스튜디오 워크벤치 중앙 열)용 — lg 뷰포트
   * 미디어쿼리는 넓은 화면의 좁은 열에서 오판하므로, lg 이상에서도 빈 상태의
   * 우측 340px 가이드 aside 를 세로 적층(w-full)으로 접고 드롭존이 전폭을
   * 갖게 한다(드롭존 187px 붕괴 실측, 2026-08-10). 부재 시 기존 클래스와
   * 바이트 동일(무회귀).
   */
  stacked?: boolean;
  /**
   * 추출 시작 CTA 의 목적지 라벨 — 스튜디오 「지문관리」 개칭(§3.10.14) 패스
   * 스루. 미전달 = 기존 문자 그대로(타 호스트 무회귀).
   */
  pickLabel?: string;
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
  subject,
  stacked = false,
  pickLabel = "다음으로 (내 지문함)",
}: GenerateUploadPanelProps) {
  const startUpload = useExtractionUpload();
  // 국어 자료 — AI 원문 복원은 영어 전용 파이프라인이라 옵션을 숨기고
  // '그대로 추출'만 노출한다(outputMode 는 초기값 verbatim 에서 못 벗어난다).
  const koSubject = subject === "KOREAN";

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
  // 파일이 아직 없을 때 '추출 시작'을 누르면 글로우시킬 업로드 영역.
  const uploadZoneRef = useRef<HTMLDivElement>(null);
  // 우측 '추출 지문' 가이드(aside) 실체 — 드래그 리사이즈 고속 경로가 style.width 를 직접 쓴다.
  const guideAsideRef = useRef<HTMLElement>(null);
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
      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      const prevPointerEvents = document.body.style.pointerEvents;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      // 드래그 중 hover 스타일 재평가 차단 — 폭이 프레임마다 바뀌면 커서 아래
      // 요소가 계속 바뀐다(캡처 덕에 move 수신에는 영향 없다).
      document.body.style.pointerEvents = "none";
      let latest = startW;

      // 포인터 캡처 — 커서가 얇은 핸들을 벗어나도 드래그가 끊기지 않는다.
      const handleEl = event.currentTarget as HTMLElement;
      try {
        handleEl.setPointerCapture(event.pointerId);
      } catch {
        /* 캡처 미지원 브라우저는 window 리스너로 폴백 */
      }

      // 드래그 고속 경로 — 매 무브 setFileGuideWidth 는 GenerateUploadPanel
      // 전체(업로드 드롭존 + 우측 가이드 aside)를 프레임마다 리렌더시킨다.
      // 이동 중에는 aside 의 style.width 에 rAF 코얼레싱으로 직접 쓰고, 놓을 때
      // 한 번만 setState 로 커밋한다. 앵커가 없으면 종전 setState 경로 폴백(무회귀).
      let rafId: number | null = null;
      const flush = () => {
        rafId = null;
        if (guideAsideRef.current) {
          guideAsideRef.current.style.width = `${latest}px`;
        }
      };
      const move = (e: PointerEvent) => {
        e.preventDefault();
        latest = clampFileGuideW(startW - (e.clientX - startX));
        if (guideAsideRef.current) {
          if (rafId === null) rafId = requestAnimationFrame(flush);
        } else {
          setFileGuideWidth(latest);
        }
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        if (rafId !== null) cancelAnimationFrame(rafId);
        flush();
        // 커밋은 여기서 한 번 — 드래그 내내 리렌더 0회.
        setFileGuideWidth(latest);
        // 저장해 둔 이전 값 복원 — 빈 문자열 대입은 남의 잠금까지 지운다.
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
        document.body.style.pointerEvents = prevPointerEvents;
        try {
          window.localStorage.setItem(FILE_EMPTY_GUIDE_W_KEY, String(latest));
        } catch {
          /* ignore */
        }
        try {
          handleEl.releasePointerCapture(event.pointerId);
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
          // 과목 전파 — 국어 라우트 발 잡은 SourceMaterial/승급 Passage 가
          // subject='KOREAN' 으로 저장돼 국어 지문함에만 나타난다.
          subject,
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
      subject,
    ],
  );

  // 추출 시작 — 보드 결과를 구운 뒤 업로드(완료 후 '내 지문'으로 넘어가 로딩 카드 표시).
  const handleFileStart = useCallback(async () => {
    if (busy) return;
    const totalPassages = slots.length === 0 ? 0 : boardCounts.totalPassages;
    if (slots.length === 0) {
      // 파일 없음 → 업로드 영역을 글로우해 "파일을 먼저 올리세요" 유도.
      triggerHintGlow(uploadZoneRef.current);
      return;
    }
    if (totalPassages === 0 || totalPassages > MAX_PAGES_PER_JOB) {
      // 지문 영역 미설정/초과 → 좌측 캔버스를 글로우해 드래그 유도.
      boardRef.current?.hintDragArea();
      return;
    }
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
  }, [busy, slots.length, boardCounts.totalPassages, startExtraction]);

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

  const allOutputModeOptions = [
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
  // 국어 자료에서는 AI 원문 복원(영어 전용) 옵션을 비노출.
  const outputModeOptions = koSubject
    ? allOutputModeOptions.filter((opt) => opt.v === "verbatim")
    : allOutputModeOptions;

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
        aria-disabled={fileStartDisabled}
        data-generate-tour="file-extract-button"
        className={
          // 글자색은 상태 분기 안에서 정한다 — 비활성은 흰 글자가 아니라
          // 정본 비활성 토큰(bg-slate-100 text-slate-400, §3.8.7 관용구)이다.
          "inline-flex h-12 w-full items-center justify-center rounded-lg border text-[14px] font-extrabold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 " +
          (busy
            ? "cursor-wait border-blue-600 bg-blue-600 text-white"
            : fileStartDisabled
              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
              : "cursor-pointer border-blue-600 bg-blue-600 text-white hover:bg-blue-700")
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
            {pickLabel}
            {` · 지문 ${fileTotalPassages}개`}
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
      className="w-full min-w-0 sm:flex sm:items-center sm:gap-3"
      data-generate-tour="output-mode"
    >
      <div className="grid w-full min-w-0 grid-cols-2 gap-1 sm:flex sm:w-auto sm:shrink-0 sm:items-center">
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
                "inline-flex min-h-8 w-full min-w-0 cursor-pointer flex-nowrap items-center justify-center gap-1 overflow-hidden rounded-md border px-2 py-1 text-center text-[11px] font-semibold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 sm:h-7 sm:w-auto sm:gap-1.5 sm:px-3 sm:py-0 sm:text-[12.5px] " +
                // 활성 = 파란 채움 필 — 직접 입력 탭의 OutputModeToggle 과 같은
                // 활성 문법(이원화 해소). 뱃지는 같은 색군 위에서 사라지므로 흰
                // 알약으로 올린다(paste-output-mode-toggle 의 대비 계약과 동형).
                (active
                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                  : "border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600")
              }
            >
              <span className="truncate">{opt.label}</span>
              <span
                className={
                  "shrink-0 rounded px-1 py-0.5 text-[9px] font-bold sm:text-[9.5px] " +
                  (active
                    ? opt.v === "restored"
                      ? "bg-white text-blue-700"
                      : "bg-white text-slate-600"
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
      <span className="inline-flex items-center gap-2 break-keep text-[14px] font-extrabold text-blue-700">
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
      {/* 출력 방식 — 위 '파일업로드' 탭에서 말풍선처럼 뻗어나온 하위 선택임을
          드러낸다(파일업로드 > 그대로 추출/AI 복원의 계층감). */}
      <div className="flex flex-col items-stretch gap-2 border-b border-slate-100 px-3 pb-2 pt-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="relative w-full rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 shadow-sm sm:w-fit">
          {/* 말풍선 박스는 직접입력과 같은 위치(ml-0)에 고정하고, 꼬리만 '파일업로드'
              탭 중앙 아래를 가리키게 한다(모드별로 화살표 위치만 다름). */}
          <span
            aria-hidden="true"
            className="absolute -top-[6px] left-[156px] z-10 hidden h-3 w-3 -translate-x-1/2 rotate-45 rounded-[2px] border-l border-t border-blue-200 bg-blue-50 sm:block"
          />
          <div className="min-w-0">{outputModeToggle}</div>
        </div>
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
            className={
              // stacked 임베드: lg 이상에서도 세로 적층 유지(좌우 분할 금지).
              stacked
                ? "flex min-h-0 flex-1 flex-col overflow-hidden"
                : "flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row"
            }
          >
            <div
              className={
                stacked
                  ? "relative flex min-h-0 min-w-0 flex-1 flex-col border-b border-slate-100 p-3.5"
                  : "relative flex min-h-0 min-w-0 flex-1 flex-col border-b border-slate-100 p-3.5 lg:border-b-0"
              }
            >
              {fileTutorialPopup}
              <div
                ref={uploadZoneRef}
                data-generate-tour="upload-dropzone"
                className={
                  // 모바일(<lg)은 세로 스택이라 flex-1 만으론 드롭존이 쪼그라든다 —
                  // 직접 입력 탭의 텍스트박스와 동일하게 최소 높이(45vh)를 준다.
                  "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border p-3 transition-colors max-lg:!min-h-[45vh] " +
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
              className={
                // stacked: 좌우 분할이 없으니 폭 조절 핸들도 lg 에서 숨긴다.
                "group/rhandle no-print hidden h-full min-h-0 w-3 shrink-0 cursor-col-resize touch-none select-none flex-col items-center justify-center gap-1 border-l border-slate-100 bg-slate-50 py-1 text-[10.5px] font-semibold text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 active:bg-blue-100" +
                (stacked ? "" : " lg:flex")
              }
            >
              <GripVertical
                className="size-3 opacity-50 transition-opacity group-hover/rhandle:opacity-80"
                aria-hidden="true"
              />
              <span style={{ writingMode: "vertical-rl" }}>추출 지문</span>
            </button>

            <aside
              ref={guideAsideRef}
              style={{ width: fileGuideWidth }}
              className={
                // stacked: 우측 340px aside 를 세로 적층 전폭으로 — 드롭존이
                // 중앙 열 폭 전체를 갖는다(340px 고정폭이 드롭존을 187px 로 붕괴).
                stacked
                  ? "flex min-h-0 shrink-0 !w-full flex-col bg-white"
                  : "flex min-h-0 flex-col bg-white max-lg:!w-full lg:shrink-0"
              }
            >
              {/* 헤더·'사용 순서' 가이드는 PC 전용 — 모바일은 하단 장바구니 바가
                  대신하고, 가이드는 유명무실하므로 숨긴다(삭제와 동일 효과).
                  stacked 임베드도 같은 이유로 숨긴다(세로 공간이 드롭존 몫). */}
              <div
                className={
                  stacked
                    ? "hidden"
                    : "flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5 max-lg:hidden"
                }
              >
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-slate-900">
                  <Layers className="size-4 text-blue-600" aria-hidden="true" />
                  담긴 지문 0개
                </span>
              </div>
              <div
                className={
                  stacked
                    ? "hidden"
                    : "smoat-file-guide-scroll min-h-0 flex-1 overflow-y-auto bg-slate-50/40 p-2.5 max-lg:hidden"
                }
              >
                <div className="smoat-file-empty-guide mx-auto flex w-full max-w-[640px] flex-col rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <div className="inline-flex w-fit items-center gap-1.5 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white">
                      <PlayCircle className="size-3.5" aria-hidden="true" />
                      사용 순서
                    </div>
                    <h3 className="smoat-file-empty-guide__title min-w-0 flex-1 text-[15px] font-extrabold leading-snug text-slate-950">
                      파일을 올리면 바로 지문을 자를 수 있습니다
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
              {/* 파일 0개(빈 상태)에서도 모바일은 '담긴 지문' 장바구니 바 + '다음으로'
                  버튼을 하단 고정 클러스터로 노출한다 — 파일 추가 후(InlineCropBoard)·
                  직접입력 탭과 동일. PC(lg)는 contents로 투명 처리해 시작 버튼만 아사이드
                  흐름대로. 페이지가 uploadTabActive일 때 max-lg:pb-[140px]로 자리 예약함. */}
              <div className="max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:flex max-lg:flex-col max-lg:border-t max-lg:border-slate-200 max-lg:bg-white max-lg:pb-[env(safe-area-inset-bottom)] max-lg:shadow-[0_-6px_20px_-10px_rgba(15,23,42,0.28)] lg:contents">
                {/* 빈 상태 장바구니 바(담긴 지문 0개) — 파일 업로드 후 InlineCropBoard의
                    장바구니 바로 자연스럽게 대체된다. 담긴 게 없어 펼침은 없다. */}
                <div className="flex w-full shrink-0 items-center gap-2.5 border-t border-slate-100 bg-white px-3 py-2 lg:hidden">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <ShoppingBasket className="size-5" aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[12.5px] font-bold text-slate-900">
                      담긴 지문 0개
                    </span>
                    <span className="truncate text-[10.5px] text-slate-400">
                      파일을 올려 지문 영역을 잘라 담아보세요
                    </span>
                  </span>
                </div>
                <div className="shrink-0 border-t border-slate-100 bg-white p-2.5">
                  {fileStartArea}
                </div>
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
              // 생성 페이지 스텝 플로우: 장바구니+추출 버튼을 하단 고정(스텝 네비 대체).
              mobileFixedFooter
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
