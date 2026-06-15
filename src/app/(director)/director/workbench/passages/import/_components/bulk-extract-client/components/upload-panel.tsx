"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import dynamic from "next/dynamic";
import {
  CheckCircle2,
  ClipboardPaste,
  Database,
  FileText,
  GripVertical,
  ImageUp,
  Layers,
  Loader2,
  PlayCircle,
  Scissors,
  UploadCloud,
  X,
} from "lucide-react";

import { ExtractionTaskListIcon } from "@/components/icons/workflow-icons";
import { MAX_PAGES_PER_JOB, MAX_PDF_BYTES } from "@/lib/extraction/constants";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import type { ClientPageSlot } from "@/lib/extraction/types";

import { ACCEPTED } from "../constants";
import type { InputMode } from "../types";
import { UploadMetaChip } from "./upload-meta-chip";
import {
  InlineCropBoard,
  type InlineCropBoardCounts,
  type InlineCropBoardHandle,
} from "../../intake/crop/inline-crop-board";
import { TextInputBoard } from "../../intake/text/text-input-board";
import { TutorialVideoPopup } from "../../intake/tutorial/tutorial-video-popup";

// 사용법 튜토리얼 영상(@remotion/player) — 브라우저 전용이라 lazy + ssr:false.
const CropTutorialPlayer = dynamic(
  () =>
    import("../../intake/tutorial/crop-tutorial-player").then(
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
    import("../../intake/tutorial/restore-tutorial-player").then(
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

// 텍스트 입력 모드 안내 말풍선 "다시는 보지 않기" 영구 숨김 키.
const TEXT_NUDGE_HIDDEN_KEY = "smoat.extraction.textModeNudgeHidden.v1";
// 텍스트 모드를 한 번이라도 써봤으면 영구히 말풍선을 숨기는 키(발견 목적이 달성됨).
const TEXT_NUDGE_TRIED_KEY = "smoat.extraction.textModeTried.v1";
// X로 닫으면 하루 동안 숨기는 키(닫은 시각 저장).
const TEXT_NUDGE_CLOSED_KEY = "smoat.extraction.textModeNudgeClosedAt.v1";
// 닫기 스누즈 기간 — X로 닫은 뒤 이 기간 동안은 안내를 띄우지 않는다.
const TEXT_NUDGE_CLOSE_SNOOZE_MS = 24 * 60 * 60 * 1000; // 1일
const FILE_EMPTY_GUIDE_W_KEY = "smoat.extraction.fileEmptyGuideWidth.v1";
const FILE_TUTORIAL_NEVER_KEY = "smoat.extraction.fileTutorialNeverShow.v2";
const clampFileGuideW = (w: number) => Math.min(460, Math.max(280, Math.round(w)));

export function UploadPanel({
  busy,
  dragActive,
  fileInputId,
  inputMode,
  slots,
  splitProgress,
  uploadProgress,
  onClear,
  onFiles,
  onInputModeChange,
  onStart,
  onStartText,
  onDragActiveChange,
  onReorderSlots,
  onRemoveSlot,
  onBeforeStart,
  onStartAborted,
  outputMode,
  onOutputModeChange,
}: {
  busy: boolean;
  dragActive: boolean;
  fileInputId: string;
  inputMode: InputMode;
  slots: ClientPageSlot[];
  splitProgress: { pageIndex?: number; totalPages?: number } | null;
  uploadProgress: { uploaded: number; total: number } | null;
  onClear: () => void;
  onFiles: (files: FileList | File[]) => void;
  onInputModeChange: (mode: InputMode) => void;
  /** 파일 모드: 보드가 구운 지문 슬롯을 받아 추출 시작. 비적응형이면 인자 없이 호출. */
  onStart: (passageSlots?: ClientPageSlot[]) => void | Promise<void>;
  /** 텍스트 모드: 누적된 여러 지문을 한 작업으로 추출. 성공 시 true 반환→입력 비움. */
  onStartText: (
    passages: { title?: string; text: string }[],
  ) => boolean | Promise<boolean>;
  onDragActiveChange: (active: boolean) => void;
  onReorderSlots: (fromIndex: number, toIndex: number) => void;
  onRemoveSlot: (index: number) => void;
  /** 추출 버튼을 누른 즉시(굽기 전) 호출 — 큐 패널을 바로 연다. */
  onBeforeStart?: () => void;
  /** 굽기 실패 등으로 추출이 시작되지 못하고 중단됐을 때 호출(낙관적 카드 취소용). */
  onStartAborted?: () => void;
  // ── P7-D2: 출력 방식(원문 vs AI복원) ──
  outputMode?: "verbatim" | "restored";
  onOutputModeChange?: (mode: "verbatim" | "restored") => void;
}) {
  const boardRef = useRef<InlineCropBoardHandle>(null);
  const [boardCounts, setBoardCounts] =
    useState<InlineCropBoardCounts>(EMPTY_COUNTS);
  // 보드가 박스를 실제 지문 슬롯으로 굽는 동안의 짧은 잠금(업로드 busy와 별개).
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

  // 텍스트 입력 안내 말풍선 — 닫기(1일)·다시는보지않기(영구)·써봤으면 영구 숨김.
  const [textNudgeClosed, setTextNudgeClosed] = useState(false);
  const [textNudgeHidden, setTextNudgeHidden] = useState(false);
  // 텍스트 모드를 써본 적이 있으면 true → 발견 목적 달성, 영구히 안 띄움.
  const [textNudgeTried, setTextNudgeTried] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(TEXT_NUDGE_HIDDEN_KEY) === "true")
        setTextNudgeHidden(true);
      if (window.localStorage.getItem(TEXT_NUDGE_TRIED_KEY) === "true")
        setTextNudgeTried(true);
      const closedAt = Number(
        window.localStorage.getItem(TEXT_NUDGE_CLOSED_KEY) ?? "",
      );
      if (closedAt && Date.now() - closedAt < TEXT_NUDGE_CLOSE_SNOOZE_MS)
        setTextNudgeClosed(true);
    } catch {
      /* ignore */
    }
  }, []);
  // X로 닫으면 하루 동안 숨긴다(시각 기록).
  const closeTextNudgeForADay = () => {
    setTextNudgeClosed(true);
    try {
      window.localStorage.setItem(TEXT_NUDGE_CLOSED_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  };
  // 텍스트 모드로 전환하면 "써봤다"로 기록 → 이후 영구히 안내를 띄우지 않는다.
  useEffect(() => {
    if (inputMode !== "text") return;
    setTextNudgeTried(true);
    try {
      window.localStorage.setItem(TEXT_NUDGE_TRIED_KEY, "true");
    } catch {
      /* ignore */
    }
  }, [inputMode]);
  const hideTextNudgePermanently = () => {
    setTextNudgeHidden(true);
    try {
      window.localStorage.setItem(TEXT_NUDGE_HIDDEN_KEY, "true");
    } catch {
      /* ignore */
    }
  };
  const showTextNudge =
    inputMode === "file" &&
    !textNudgeClosed &&
    !textNudgeHidden &&
    !textNudgeTried;
  const showFileTutorial =
    inputMode === "file" &&
    slots.length === 0 &&
    !fileTutorialClosed &&
    !fileTutorialHidden;

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

  const selectedOutput = outputMode ?? "verbatim";
  useEffect(() => {
    if (inputMode === "file" && slots.length === 0) {
      setFileTutorialClosed(false);
    }
  }, [inputMode, selectedOutput, slots.length]);

  // 파일 모드 추출 시작 — 보드 결과를 굽고(없으면 기존 slots), onStart에 넘긴다.
  const handleFileStart = async () => {
    if (slots.length === 0) return;
    // 버튼 누르자마자 큐 패널을 열어 즉시 반응(굽기·업로드는 그 뒤에).
    onBeforeStart?.();
    if (boardRef.current) {
      setBaking(true);
      try {
        const baked = await boardRef.current.buildPassageSlots();
        if (baked) await onStart(baked);
        else onStartAborted?.(); // 굽기 실패 — 낙관적 카드 취소
      } finally {
        setBaking(false);
      }
      return;
    }
    await onStart();
  };

  // slots가 비면 보드가 언마운트돼 boardCounts가 stale로 남으므로 0으로 강제.
  const fileTotalPassages = slots.length === 0 ? 0 : boardCounts.totalPassages;
  // 출력 방식별 지문당 크레딧: 그대로=OCR(◈3), 복원=OCR+AI복원(◈5). 총액=지문 수×지문당.
  const creditsPerPassage =
    selectedOutput === "restored"
      ? CREDIT_COSTS.TEXT_EXTRACTION + CREDIT_COSTS.PASSAGE_RESTORATION
      : CREDIT_COSTS.TEXT_EXTRACTION;
  const fileProjectedCredits = fileTotalPassages * creditsPerPassage;
  const fileOverMax = fileTotalPassages > MAX_PAGES_PER_JOB;
  const startBusy = busy || baking;
  const fileStartDisabled =
    startBusy || slots.length === 0 || fileTotalPassages === 0 || fileOverMax;

  const fileProgressRatio = uploadProgress
    ? uploadProgress.uploaded / Math.max(1, uploadProgress.total)
    : splitProgress
      ? (splitProgress.pageIndex ?? 0) /
        Math.max(1, splitProgress.totalPages ?? 1)
      : 0;
  const fileProgressPercent = Math.min(
    100,
    Math.max(0, fileProgressRatio * 100),
  );
  const fileBusyLabel = baking
    ? "지문 자르는 중"
    : uploadProgress
      ? `업로드 중 ${uploadProgress.uploaded}/${uploadProgress.total}`
      : splitProgress
        ? "PDF 페이지 분리 중"
        : "작업 중";

  // 파일 모드 추출 시작 — 검수 패널 하단에 크게 고정(footer로 주입).
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
          "relative inline-flex h-12 w-full items-center justify-center overflow-hidden rounded-lg border text-[14px] font-extrabold text-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 " +
          (startBusy
            ? "cursor-wait border-blue-600 bg-blue-600"
            : fileStartDisabled
              ? "cursor-not-allowed border-blue-200 bg-blue-300"
              : "cursor-pointer border-blue-600 bg-blue-600 hover:bg-blue-700")
        }
      >
        {busy && !baking ? (
          <span
            className="absolute inset-y-0 left-0 bg-blue-800/40 transition-[width] duration-200 ease-out"
            style={{ width: `${fileProgressPercent}%` }}
            aria-hidden="true"
          />
        ) : null}
        <span className="relative z-10 inline-flex items-center">
          {startBusy ? (
            <>
              <Loader2 className="mr-2 size-5 animate-spin" aria-hidden="true" />
              {fileBusyLabel}
            </>
          ) : (
            <>
              <PlayCircle className="mr-2 size-5" aria-hidden="true" />
              {selectedOutput === "restored" ? "복원하여 추출 시작" : "추출 시작"}
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
        </span>
      </button>
    </div>
  );

  // ── P7-D2 출력 방식 토글 (컴팩트 1줄 세그먼트) — 헤더 아래 컨트롤바 공용 ──
  const verbatimCredits = CREDIT_COSTS.TEXT_EXTRACTION;
  const restoredCredits =
    CREDIT_COSTS.TEXT_EXTRACTION + CREDIT_COSTS.PASSAGE_RESTORATION;
  const outputModeOptions = [
    {
      v: "verbatim" as const,
      label: "그대로 추출",
      badge: (
        <span className="inline-flex items-center gap-0.5">
          지문당{" "}
          <CreditCostChip amount={verbatimCredits} iconClassName="size-2.5" />
        </span>
      ),
    },
    {
      v: "restored" as const,
      label: "AI로 원문 복원",
      badge: (
        <span className="inline-flex items-center gap-0.5">
          지문당{" "}
          <CreditCostChip amount={restoredCredits} iconClassName="size-2.5" />
        </span>
      ),
    },
  ];
  const controlRowClass =
    "flex shrink-0 items-center gap-3 border-b border-slate-100 px-4 py-2.5";
  const controlLabelClass =
    "w-[64px] shrink-0 text-[11px] font-bold text-slate-600";
  const outputModeToggle = onOutputModeChange ? (
    <div className="flex min-w-0 items-center gap-3">
      <span className={controlLabelClass}>출력 방식</span>
      <div className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        {outputModeOptions.map((opt) => {
          const active = selectedOutput === opt.v;
          return (
            <button
              key={opt.v}
              type="button"
              onClick={() => onOutputModeChange(opt.v)}
              disabled={startBusy}
              aria-pressed={active}
              className={
                "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11.5px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 " +
                (active
                  ? "bg-white text-blue-700 shadow-sm ring-1 ring-blue-100"
                  : "cursor-pointer text-slate-500 hover:text-slate-700")
              }
            >
              <span
                className={
                  "inline-flex size-3 shrink-0 items-center justify-center rounded-full border " +
                  (active ? "border-blue-600" : "border-slate-300")
                }
                aria-hidden="true"
              >
                {active ? (
                  <span className="size-1.5 rounded-full bg-blue-600" />
                ) : null}
              </span>
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
  ) : null;

  const renderFileUploadLabel = (className = "") => (
    <label
      htmlFor={fileInputId}
      className={
        "flex shrink-0 cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-blue-500 bg-white px-4 py-3 text-center transition-colors hover:bg-blue-50 " +
        className
      }
    >
      <input
        id={fileInputId}
        type="file"
        className="sr-only"
        accept={ACCEPTED.join(",")}
        multiple
        onChange={(event) => {
          if (event.target.files) onFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />
      <span className="inline-flex items-center gap-2 text-[14px] font-extrabold text-blue-700">
        <UploadCloud className="size-5" aria-hidden="true" />
        파일을 끌어놓거나 클릭해서 추가
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
  const fileTutorialPopup = showFileTutorial ? (
    selectedOutput === "restored" ? (
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

  const inputTabClass = (active: boolean) =>
    "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
    (active
      ? "border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm"
      : "border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600");

  return (
    <section className="flex min-h-0 flex-col overflow-hidden">
      {/* ── 입력 방식 탭: 직접 입력 · 이미지/PDF ─────────────────────── */}
      <div className={controlRowClass}>
        <span className={controlLabelClass}>입력 방식</span>
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => onInputModeChange("text")}
            className={inputTabClass(inputMode === "text")}
          >
            <ClipboardPaste className="size-3.5" aria-hidden="true" />
            직접 입력
          </button>

          {/* 텍스트 입력 안내 말풍선 — 직접 입력 탭 아래에서 뜬다. */}
          {showTextNudge ? (
            <div
              role="status"
              aria-live="polite"
              className="absolute left-0 top-[calc(100%+10px)] z-30 w-[246px] rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-left shadow-2xl shadow-blue-950/15 ring-1 ring-blue-100/70"
            >
              <span
                aria-hidden="true"
                className="absolute -top-1.5 left-5 h-3 w-3 rotate-45 border-l border-t border-blue-200 bg-blue-50"
              />
              <div className="relative flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.12)]"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-black text-slate-900">
                    텍스트로 바로 입력할 수도 있어요
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold leading-relaxed text-slate-500">
                    파일 없이 지문 원문이나 문제 텍스트를 붙여넣어 바로 추출할 수
                    있어요.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeTextNudgeForADay}
                  className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-blue-400 transition-colors hover:bg-blue-100 hover:text-blue-700"
                  aria-label="텍스트 입력 안내 닫기"
                  title="안내 닫기"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              <div className="relative mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={hideTextNudgePermanently}
                  className="rounded-md px-1.5 py-1 text-[10.5px] font-bold text-blue-600 transition-colors hover:bg-blue-100 hover:text-blue-800"
                >
                  다시는 보지 않기
                </button>
              </div>
            </div>
          ) : null}
          </div>

          <button
            type="button"
            onClick={() => onInputModeChange("file")}
            className={inputTabClass(inputMode === "file")}
          >
            <ImageUp className="size-3.5" aria-hidden="true" />
            이미지·PDF
          </button>
        </div>
      </div>

      {outputModeToggle ? (
        <div className={controlRowClass}>{outputModeToggle}</div>
      ) : null}

      {/* ── 본문 ─────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* 텍스트 모드 (파일 모드일 땐 숨기되 언마운트하지 않음) — 여러 지문 동시 입력 */}
        <div
          className={
            inputMode === "text" ? "flex min-h-0 flex-1 flex-col" : "hidden"
          }
        >
          <TextInputBoard
            busy={busy}
            onStart={onStartText}
            outputMode={selectedOutput}
          />
        </div>

        {/* 파일 모드 */}
        <div
          className={
            inputMode === "file"
              ? "flex min-h-0 flex-1 flex-col"
              : "hidden"
          }
        >
          {slots.length === 0 ? (
            <div
              onDragOver={(event) => {
                const isFileDrag = event.dataTransfer.types.includes("Files");
                if (!isFileDrag) return;
                event.preventDefault();
                onDragActiveChange(true);
              }}
              onDragLeave={(event) => {
                const next = event.relatedTarget as Node | null;
                if (!next || !event.currentTarget.contains(next))
                  onDragActiveChange(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                onDragActiveChange(false);
                if (event.dataTransfer.files.length > 0)
                  onFiles(event.dataTransfer.files);
              }}
              className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row"
            >
              {/* ── 좌: 파일 업로드 입력(텍스트 모드 입력창과 동일한 좌측 레이아웃) ── */}
              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col border-b border-slate-100 p-3.5 lg:border-b-0">
                {fileTutorialPopup}
                <div
                  className={
                    "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border p-3 transition-colors " +
                    (dragActive
                      ? "border-sky-500 bg-sky-50"
                      : "border-slate-200 bg-slate-50/70")
                  }
                >
                  {renderFileUploadLabel(
                    "min-h-0 flex-1 justify-center px-6 py-8",
                  )}
                </div>
              </div>

              {/* ── 좌우 폭 조절 핸들(lg+) — 텍스트 모드 누적 패널과 동일 ── */}
              <button
                type="button"
                onPointerDown={beginFileGuideResize}
                title="드래그하여 추출 지문 패널 폭 조절"
                aria-label="추출 지문 패널 폭 조절"
                className="group/rhandle no-print hidden h-full min-h-0 w-3 shrink-0 cursor-col-resize touch-none select-none flex-col items-center justify-center gap-1 border-l border-slate-100 bg-slate-50 py-1 text-[10.5px] font-semibold text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-600 active:bg-sky-100 lg:flex"
              >
                <GripVertical
                  className="size-3 opacity-50 transition-opacity group-hover/rhandle:opacity-80"
                  aria-hidden="true"
                />
                <span style={{ writingMode: "vertical-rl" }}>추출 지문</span>
              </button>

              {/* ── 우: 추출될 지문(빈 상태 가이드) — 텍스트 모드 누적 패널과 동일 ── */}
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
                          <span className="min-w-0 leading-snug">{step.label}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
                {/* 하단: 추출 시작(파일 없을 땐 음영 처리된 비활성 버튼으로 노출) */}
                <div className="shrink-0 border-t border-slate-100 bg-white p-2.5">
                  {fileStartArea}
                </div>
              </aside>
            </div>
          ) : (
            <InlineCropBoard
              ref={boardRef}
              images={slots}
              disabled={startBusy}
              onAddFiles={onFiles}
              onRemoveImage={onRemoveSlot}
              onReorderImages={onReorderSlots}
              maxPassages={MAX_PAGES_PER_JOB}
              onCountChange={setBoardCounts}
              footer={fileStartArea}
              onClear={onClear}
              outputMode={selectedOutput}
            />
          )}
        </div>
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
