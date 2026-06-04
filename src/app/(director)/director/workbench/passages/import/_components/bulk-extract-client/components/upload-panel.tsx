"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Database,
  FileText,
  Keyboard,
  Loader2,
  PlayCircle,
  Trash2,
  UploadCloud,
} from "lucide-react";

import { ExtractionTaskListIcon } from "@/components/icons/workflow-icons";
import { MAX_PAGES_PER_JOB, MAX_PDF_BYTES } from "@/lib/extraction/constants";
import type { ClientPageSlot } from "@/lib/extraction/types";

import { ACCEPTED, TEXT_EXTRACTION_MIN_LENGTH } from "../constants";
import type { InputMode } from "../types";
import { UploadMetaChip } from "./upload-meta-chip";
import {
  InlineCropBoard,
  type InlineCropBoardCounts,
  type InlineCropBoardHandle,
} from "../../intake/crop/inline-crop-board";
import { RestoreGuideDemo } from "../../intake/crop/restore-guide-demo";

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

const EMPTY_COUNTS: InlineCropBoardCounts = {
  regionCount: 0,
  passageCount: 0,
  uncroppedCount: 0,
  totalPassages: 0,
};

export function UploadPanel({
  busy,
  dragActive,
  fileInputId,
  inputMode,
  slots,
  splitProgress,
  textTitle,
  textValue,
  uploadProgress,
  onClear,
  onClearText,
  onFiles,
  onInputModeChange,
  onStart,
  onStartText,
  onDragActiveChange,
  onTextTitleChange,
  onTextValueChange,
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
  textTitle: string;
  textValue: string;
  uploadProgress: { uploaded: number; total: number } | null;
  onClear: () => void;
  onClearText: () => void;
  onFiles: (files: FileList | File[]) => void;
  onInputModeChange: (mode: InputMode) => void;
  /** 파일 모드: 보드가 구운 지문 슬롯을 받아 추출 시작. 비적응형이면 인자 없이 호출. */
  onStart: (passageSlots?: ClientPageSlot[]) => void | Promise<void>;
  onStartText: () => void;
  onDragActiveChange: (active: boolean) => void;
  onTextTitleChange: (value: string) => void;
  onTextValueChange: (value: string) => void;
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

  const textLength = textValue.trim().length;
  const canStartText = textLength >= TEXT_EXTRACTION_MIN_LENGTH;
  const selectedOutput = outputMode ?? "verbatim";

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
            </>
          )}
        </span>
      </button>
    </div>
  );

  // ── P7-D2 출력 방식 토글 (컴팩트 1줄 세그먼트) — 헤더 아래 컨트롤바 공용 ──
  const outputModeOptions = [
    { v: "verbatim" as const, label: "그대로 추출", badge: "OCR만" },
    { v: "restored" as const, label: "AI로 원문 복원", badge: "지문당 ◈2" },
  ];
  const outputModeToggle = onOutputModeChange ? (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-bold text-slate-600">출력 방식</span>
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
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
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 " +
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

  return (
    <section className="flex min-h-0 flex-col overflow-hidden">
      {/* ── 헤더 + 컨트롤 통합 (제목·모드·출력방식·시작을 한 줄로) ── */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 border-b border-slate-100 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-[13px] font-bold text-slate-950">자료 입력</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {inputMode === "file"
              ? "이미지에서 지문 영역을 드래그해 지문별로 추출합니다."
              : "지문 원문이나 문제 형식 텍스트를 붙여넣을 수 있습니다."}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="inline-flex rounded-md bg-slate-100 p-0.5 text-[11px] font-bold text-slate-500">
            <button
              type="button"
              onClick={() => onInputModeChange("file")}
              className={
                "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded px-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
                (inputMode === "file"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "hover:text-slate-800")
              }
            >
              <UploadCloud className="size-3.5" aria-hidden="true" />
              파일
            </button>
            <button
              type="button"
              onClick={() => onInputModeChange("text")}
              className={
                "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded px-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
                (inputMode === "text"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "hover:text-slate-800")
              }
            >
              <Keyboard className="size-3.5" aria-hidden="true" />
              텍스트
            </button>
          </div>
          {inputMode === "file" && slots.length > 0 ? (
            <button
              type="button"
              onClick={onClear}
              disabled={startBusy}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              비우기
            </button>
          ) : null}
          {inputMode === "text" && (textTitle || textValue) ? (
            <button
              type="button"
              onClick={onClearText}
              disabled={busy}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              비우기
            </button>
          ) : null}

          {/* 출력 방식 */}
          {outputModeToggle}

          {/* 텍스트 모드 추출 시작 (파일 모드는 검수 패널 하단으로 이동) */}
          {inputMode === "text" ? (
            <>
              <span
                className="hidden h-7 w-px bg-slate-200 sm:block"
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={onStartText}
                disabled={busy || !canStartText}
                className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-md bg-blue-600 px-5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {busy ? (
                  <>
                    <Loader2
                      className="mr-2 size-4 animate-spin"
                      aria-hidden="true"
                    />
                    작업 중
                  </>
                ) : (
                  <>
                    <PlayCircle className="mr-2 size-4" aria-hidden="true" />
                    {selectedOutput === "restored"
                      ? "복원하여 추출 시작"
                      : "텍스트 추출 시작"}
                  </>
                )}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* ── 본문 ─────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* 텍스트 모드 (파일 모드일 땐 숨기되 언마운트하지 않음) */}
        <div
          className={
            inputMode === "text"
              ? "flex min-h-0 flex-1 flex-col p-3.5"
              : "hidden"
          }
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div className="mb-2 flex items-center gap-2">
              <input
                value={textTitle}
                onChange={(event) => onTextTitleChange(event.target.value)}
                disabled={busy}
                placeholder="제목을 입력하세요. 예: 2026 고1 3월 모의고사"
                aria-label="제목"
                className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-[13px] text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
              />
              <span
                className={
                  "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 " +
                  (canStartText
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                    : "bg-white text-slate-500 ring-slate-200")
                }
              >
                {textLength.toLocaleString()}자
              </span>
            </div>
            <textarea
              value={textValue}
              onChange={(event) => onTextValueChange(event.target.value)}
              disabled={busy}
              placeholder={`본문을 입력하세요. 최소 ${TEXT_EXTRACTION_MIN_LENGTH}자 이상 입력하면 시작할 수 있습니다.\n\n예: Soft drink companies attract consumers by adding bright colors...\n\n(A) Also, the artificial flavor...\n(B) Studies have shown...\n(C) They are artificial chemicals...`}
              aria-label="본문"
              className="min-h-0 flex-1 resize-none rounded-md border border-dashed border-slate-300 bg-white px-4 py-3 text-[13px] leading-7 text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
            />
          </div>
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
              className={
                "m-3.5 flex min-h-0 flex-1 flex-col gap-3 rounded-lg border-2 border-dashed p-3 transition-colors " +
                (dragActive
                  ? "border-sky-500 bg-sky-50"
                  : "border-slate-300 bg-white")
              }
            >
              {/* 사용법 안내 — 출력 방식에 따라 전환.
                  · 그대로 추출: 자르기→나뉜 지문 합치기 튜토리얼 영상
                  · AI로 원문 복원: 복원 동작 데모(예전 "복원 예시 보기" 모달을 인라인으로) */}
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                {selectedOutput === "restored" ? (
                  <div className="mx-auto w-full max-w-[960px]">
                    <RestoreGuideDemo />
                  </div>
                ) : (
                  <>
                    <div className="mb-2.5 flex shrink-0 flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white">
                        <PlayCircle className="size-3.5" aria-hidden="true" />
                        사용법
                      </span>
                      <span className="text-[12.5px] font-bold text-slate-800">
                        이렇게 추출해요 — 지문을 자르고, 칸·페이지로 나뉜 지문은
                        합치기
                      </span>
                    </div>
                    <div className="mx-auto w-full max-w-[920px]">
                      <CropTutorialPlayer />
                    </div>
                  </>
                )}
              </div>

              {/* 파일 추가 버튼 — 영상 보면서도 하단에 항상 보임 */}
              <label
                htmlFor={fileInputId}
                className="flex shrink-0 cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-blue-500 bg-white px-4 py-3 text-center transition-colors hover:bg-blue-50"
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
                      <ExtractionTaskListIcon
                        className="size-3.5"
                        aria-hidden="true"
                      />
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
              outputMode={selectedOutput}
            />
          )}
        </div>
      </div>

    </section>
  );
}
