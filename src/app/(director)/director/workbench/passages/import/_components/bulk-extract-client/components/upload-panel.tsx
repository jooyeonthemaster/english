"use client";

import { useState } from "react";
import {
  Combine,
  CornerDownRight,
  Crop,
  Database,
  FileText,
  Keyboard,
  Loader2,
  PlayCircle,
  Trash2,
  Undo2,
  UploadCloud,
  X,
} from "lucide-react";

import { ExtractionTaskListIcon } from "@/components/icons/workflow-icons";
import { MAX_PAGES_PER_JOB, MAX_PDF_BYTES } from "@/lib/extraction/constants";
import type { ClientPageSlot } from "@/lib/extraction/types";

import {
  ACCEPTED,
  SLOT_DRAG_MIME,
  TEXT_EXTRACTION_MIN_LENGTH,
} from "../constants";
import type { InputMode } from "../types";
import { formatBytes } from "../utils";
import { UploadMetaChip } from "./upload-meta-chip";
import {
  isCropChild,
  isCroppable,
  isExtractable,
  slotKindLabel,
} from "../../intake/crop/slot-meta";

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
  onCropSlot,
  onPreviewSlot,
  selectMode,
  mergeSelection,
  onToggleSelectMode,
  onToggleSlotSelect,
  onClearSelection,
  onOpenMergePreview,
  onUnmerge,
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
  onStart: () => void;
  onStartText: () => void;
  onDragActiveChange: (active: boolean) => void;
  onTextTitleChange: (value: string) => void;
  onTextValueChange: (value: string) => void;
  onReorderSlots: (fromIndex: number, toIndex: number) => void;
  onRemoveSlot: (index: number) => void;
  /** 적응형 인테이크 플래그가 켜졌을 때만 전달 — 슬롯별 "영역 자르기" 진입점. */
  onCropSlot?: (index: number) => void;
  /** 적응형 인테이크 — 썸네일 클릭 시 큰 미리보기. */
  onPreviewSlot?: (index: number) => void;
  // ── 여러 장 합치기(접근 A) ──
  /** 선택 모드 on/off. */
  selectMode?: boolean;
  /** 선택된 slotId 목록(클릭 순서). */
  mergeSelection?: string[];
  onToggleSelectMode?: () => void;
  onToggleSlotSelect?: (slotId: string) => void;
  onClearSelection?: () => void;
  onOpenMergePreview?: () => void;
  onUnmerge?: (slotId: string) => void;
}) {
  // Slot-reorder local state. dragIndex !== null while a slot is being dragged
  // — used to mute the parent label's drop handler so a slot reorder doesn't
  // get mis-interpreted as an external file drop.
  const [dragSlotIndex, setDragSlotIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const textLength = textValue.trim().length;
  const canStartText = textLength >= TEXT_EXTRACTION_MIN_LENGTH;
  // 적응형 인테이크 — 추출 대상/제외 집계 (크롭 떠낸 원본은 제외).
  const extractableCount = slots.filter(isExtractable).length;
  const excludedCount = slots.length - extractableCount;
  const showExtractSummary = onCropSlot != null && excludedCount > 0;
  const startDisabled =
    busy ||
    slots.length === 0 ||
    (onCropSlot != null && extractableCount === 0);
  const modeDescription =
    inputMode === "file"
      ? "PDF와 이미지를 계속 추가할 수 있습니다."
      : "지문 원문이나 문제 형식 텍스트를 붙여넣을 수 있습니다.";
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
  const fileBusyLabel = uploadProgress
    ? `업로드 중 ${uploadProgress.uploaded}/${uploadProgress.total}`
    : splitProgress
      ? "PDF 페이지 분리 중"
      : "작업 중";

  return (
    <section className="flex min-h-0 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-[13px] font-bold text-slate-950">자료 입력</h2>
          <p className="mt-1 text-[11px] text-slate-500">{modeDescription}</p>
        </div>
        <div className="flex items-center gap-2">
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
          {inputMode === "file" &&
          onToggleSelectMode != null &&
          slots.length >= 2 ? (
            <button
              type="button"
              onClick={onToggleSelectMode}
              disabled={busy}
              aria-pressed={!!selectMode}
              className={
                "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 " +
                (selectMode
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50")
              }
            >
              <Combine className="size-3.5" aria-hidden="true" />
              {selectMode ? "합치기 종료" : "여러 장 합치기"}
            </button>
          ) : null}
          {inputMode === "file" && slots.length > 0 ? (
            <button
              type="button"
              onClick={onClear}
              disabled={busy}
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
        </div>
      </div>

      {inputMode === "text" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3.5">
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

          <button
            type="button"
            onClick={onStartText}
            disabled={busy || !canStartText}
            className="inline-flex h-10 w-full shrink-0 cursor-pointer items-center justify-center rounded-md bg-blue-600 px-5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-300 disabled:text-white"
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
                텍스트 추출 시작
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3.5">
          <label
            htmlFor={fileInputId}
            onDragOver={(event) => {
              // While a slot reorder is in progress the dataTransfer types do
              // NOT include "Files" — skip the dropzone-highlight so the user
              // isn't tricked into thinking a file drop is in flight.
              const isFileDrag = event.dataTransfer.types.includes("Files");
              if (!isFileDrag) return;
              event.preventDefault();
              onDragActiveChange(true);
            }}
            onDragLeave={() => onDragActiveChange(false)}
            onDrop={(event) => {
              // Skip when the drop is a slot reorder (handled by the per-slot
              // onDrop with stopPropagation; this branch is the safety net).
              if (dragSlotIndex !== null) {
                onDragActiveChange(false);
                return;
              }
              event.preventDefault();
              onDragActiveChange(false);
              if (event.dataTransfer.files.length > 0)
                onFiles(event.dataTransfer.files);
            }}
            className={
              "flex min-h-0 flex-1 cursor-pointer flex-col overflow-hidden rounded-lg border-2 border-dashed transition-colors " +
              (dragActive
                ? "border-sky-500 bg-sky-50"
                : slots.length > 0
                  ? "border-slate-300 bg-white hover:border-blue-400"
                  : "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/30")
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
            {slots.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center px-5 py-8 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                  <UploadCloud
                    className="size-6"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                </span>
                <div className="mt-3 text-[13px] font-bold text-slate-900">
                  파일을 끌어놓거나 클릭해서 추가
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  여러 이미지와 PDF 페이지를 순서대로 등록합니다.
                </div>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
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
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <UploadCloud
                      className="size-3.5 text-blue-500"
                      aria-hidden="true"
                    />
                    <span>
                      파일을 더 끌어놓거나, 썸네일을 드래그해 순서를 바꿀 수
                      있습니다.
                    </span>
                  </div>
                </div>
                <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto pb-2 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
                  {slots.map((slot, index) => {
                    const isDragging = dragSlotIndex === index;
                    const isDropTarget =
                      dropTargetIndex === index && dragSlotIndex !== index;
                    const kindBadge = slotKindLabel(slot);
                    const child = isCropChild(slot);
                    const excluded = !isExtractable(slot);
                    const showBadge =
                      slot.kind != null && slot.kind !== "original";
                    const croppable = isCroppable(slot);
                    const selectionOrder =
                      slot.slotId != null
                        ? (mergeSelection ?? []).indexOf(slot.slotId)
                        : -1;
                    // 선택 가능: 합치기 모드 + 추출 대상 + 이미 합쳐진 것 아님(중첩 방지)
                    const selectable =
                      !!selectMode &&
                      isExtractable(slot) &&
                      slot.kind !== "merged";
                    return (
                      <div
                        key={slot.pageIndex + "-" + slot.previewUrl}
                        draggable={!busy && !selectMode}
                        onClick={(event) => {
                          // Stop bubble so the label's <input type="file"> isn't
                          // opened when the user only meant to grip a thumbnail.
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onDragStart={(event) => {
                          if (busy) return;
                          event.stopPropagation();
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData(
                            SLOT_DRAG_MIME,
                            String(index),
                          );
                          setDragSlotIndex(index);
                        }}
                        onDragOver={(event) => {
                          if (dragSlotIndex === null) return;
                          event.preventDefault();
                          event.stopPropagation();
                          event.dataTransfer.dropEffect = "move";
                          if (dropTargetIndex !== index)
                            setDropTargetIndex(index);
                        }}
                        onDragLeave={(event) => {
                          if (dragSlotIndex === null) return;
                          event.stopPropagation();
                          if (dropTargetIndex === index)
                            setDropTargetIndex(null);
                        }}
                        onDrop={(event) => {
                          if (dragSlotIndex === null) return;
                          event.preventDefault();
                          event.stopPropagation();
                          const from = dragSlotIndex;
                          if (from !== index) onReorderSlots(from, index);
                          setDragSlotIndex(null);
                          setDropTargetIndex(null);
                        }}
                        onDragEnd={() => {
                          setDragSlotIndex(null);
                          setDropTargetIndex(null);
                        }}
                        className={
                          "flex flex-col rounded-md border bg-white p-2 transition-all " +
                          (selectionOrder >= 0
                            ? "border-blue-500 ring-2 ring-blue-300 "
                            : isDragging
                              ? "border-blue-400 opacity-40 "
                              : isDropTarget
                                ? "border-blue-500 ring-2 ring-blue-200 "
                                : excluded
                                  ? "border-dashed border-slate-300 opacity-75 "
                                  : "border-slate-200 ") +
                          (child ? "border-l-[3px] border-l-blue-300 " : "") +
                          (busy
                            ? "cursor-not-allowed"
                            : selectMode
                              ? "cursor-default"
                              : "cursor-grab active:cursor-grabbing")
                        }
                        title={
                          slot.sourceFileName ?? slot.pageIndex + 1 + "페이지"
                        }
                      >
                        {showBadge ? (
                          <span
                            className={
                              "mb-1 inline-flex w-fit max-w-full items-center truncate rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 " +
                              kindBadge.className
                            }
                          >
                            {kindBadge.text}
                          </span>
                        ) : null}
                        <div className="relative aspect-[3/4] w-full overflow-hidden rounded border border-slate-200 bg-slate-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={slot.previewUrl}
                            alt={slot.pageIndex + 1 + "페이지"}
                            onClick={
                              selectMode
                                ? (event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    if (selectable && slot.slotId)
                                      onToggleSlotSelect?.(slot.slotId);
                                  }
                                : onPreviewSlot
                                  ? (event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      onPreviewSlot(index);
                                    }
                                  : undefined
                            }
                            className={
                              "absolute inset-0 h-full w-full bg-white object-contain " +
                              (selectMode
                                ? selectable
                                  ? "cursor-pointer"
                                  : "cursor-not-allowed"
                                : onPreviewSlot
                                  ? "cursor-zoom-in"
                                  : "")
                            }
                            draggable={false}
                          />
                          {selectMode ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                if (selectable && slot.slotId)
                                  onToggleSlotSelect?.(slot.slotId);
                              }}
                              onPointerDown={(event) => event.stopPropagation()}
                              disabled={!selectable}
                              aria-pressed={selectionOrder >= 0}
                              aria-label={
                                selectionOrder >= 0
                                  ? "합치기 선택 해제"
                                  : "합치기 선택"
                              }
                              className={
                                "absolute left-1 top-1 z-20 inline-flex size-5 items-center justify-center rounded text-[10px] font-bold ring-1 transition-colors " +
                                (selectionOrder >= 0
                                  ? "cursor-pointer bg-blue-600 text-white ring-blue-700"
                                  : selectable
                                    ? "cursor-pointer bg-white/95 text-slate-300 ring-slate-300 hover:text-blue-500 hover:ring-blue-400"
                                    : "cursor-not-allowed bg-slate-200/80 text-slate-300 ring-slate-300")
                              }
                            >
                              {selectionOrder >= 0 ? selectionOrder + 1 : "+"}
                            </button>
                          ) : null}
                          <span className="absolute bottom-0 left-0 rounded-tr bg-slate-950/75 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {slot.pageIndex + 1}
                          </span>
                          {!selectMode ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              onRemoveSlot(index);
                          }}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                          }}
                            onDragStart={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            disabled={busy}
                            title="업로드 자료 삭제"
                            aria-label={`${slot.pageIndex + 1}페이지 삭제`}
                            className="absolute right-1 top-1 inline-flex size-5 cursor-pointer items-center justify-center rounded-full bg-slate-950/75 text-white shadow-sm transition-colors hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <X className="size-3.5" aria-hidden="true" />
                          </button>
                          ) : null}
                        </div>
                        <div className="mt-1.5 truncate text-[11px] font-bold text-slate-800">
                          {slot.sourceFileName ??
                            slot.pageIndex + 1 + "페이지 이미지"}
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-1 text-[10.5px] text-slate-500">
                          <span>{child ? "지문" : `${slot.pageIndex + 1}페이지`}</span>
                          <span>{formatBytes(slot.bytes)}</span>
                        </div>
                        {child ? (
                          <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-blue-600">
                            <CornerDownRight
                              className="size-3 shrink-0"
                              aria-hidden="true"
                            />
                            잘라낸 원본에서
                          </div>
                        ) : null}
                        {onCropSlot && croppable && !selectMode ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              onCropSlot(index);
                            }}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                            }}
                            onDragStart={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            disabled={busy}
                            aria-label={
                              slot.kind === "source"
                                ? "크롭 영역 편집"
                                : `${slot.pageIndex + 1}페이지에서 지문 영역 자르기`
                            }
                            className="mt-2 inline-flex h-7 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 text-[11px] font-bold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Crop className="size-3.5" aria-hidden="true" />
                            {slot.kind === "source" ? "영역 편집" : "영역 자르기"}
                          </button>
                        ) : null}
                        {onUnmerge && slot.kind === "merged" && !selectMode ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (slot.slotId) onUnmerge(slot.slotId);
                            }}
                            onPointerDown={(event) => event.stopPropagation()}
                            onDragStart={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            disabled={busy}
                            aria-label="합치기 되돌리기"
                            className="mt-2 inline-flex h-7 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Undo2 className="size-3.5" aria-hidden="true" />
                            합치기 되돌리기
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </label>

          {selectMode ? (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border border-blue-100 bg-blue-50/70 px-3 py-2 text-[11px]">
              <span className="font-bold text-slate-700">
                {(mergeSelection?.length ?? 0) >= 2
                  ? `${mergeSelection?.length ?? 0}장 선택됨 · 클릭 순서대로 위→아래 이어붙입니다`
                  : "합칠 장을 순서대로 클릭하세요 (2장 이상)"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClearSelection}
                  disabled={busy || (mergeSelection?.length ?? 0) === 0}
                  className="inline-flex h-7 cursor-pointer items-center rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  선택 해제
                </button>
                <button
                  type="button"
                  onClick={onOpenMergePreview}
                  disabled={busy || (mergeSelection?.length ?? 0) < 2}
                  className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[11px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  <Combine className="size-3.5" aria-hidden="true" />
                  선택한 {mergeSelection?.length ?? 0}장 합치기
                </button>
              </div>
            </div>
          ) : null}

          {showExtractSummary ? (
            <div className="flex shrink-0 items-center justify-between rounded-md border border-blue-100 bg-blue-50/70 px-3 py-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1 font-bold text-slate-700">
                <Crop className="size-3.5 text-blue-600" aria-hidden="true" />
                추출 대상 지문 {extractableCount}개
              </span>
              <span className="text-slate-500">
                잘라낸 원본 {excludedCount}개 제외
              </span>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onStart}
            disabled={startDisabled}
            className={
              "relative inline-flex h-10 w-full shrink-0 items-center justify-center overflow-hidden rounded-md border px-5 text-[13px] font-bold text-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 " +
              (busy
                ? "cursor-wait border-blue-600 bg-blue-600"
                : startDisabled
                  ? "cursor-not-allowed border-blue-200 bg-blue-300"
                  : "cursor-pointer border-blue-600 bg-blue-600 hover:bg-blue-700")
            }
          >
            {busy ? (
              <span
                className="absolute inset-y-0 left-0 bg-blue-800/40 transition-[width] duration-200 ease-out"
                style={{ width: `${fileProgressPercent}%` }}
                aria-hidden="true"
              />
            ) : null}
            <span className="relative z-10 inline-flex items-center">
              {busy ? (
                <>
                  <Loader2
                    className="mr-2 size-4 animate-spin"
                    aria-hidden="true"
                  />
                  {fileBusyLabel}
                </>
              ) : (
                <>
                  <PlayCircle className="mr-2 size-4" aria-hidden="true" />
                  추출 시작
                </>
              )}
            </span>
          </button>
        </div>
      )}
    </section>
  );
}
