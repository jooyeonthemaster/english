"use client";

import { useState } from "react";
import {
  Database,
  FileText,
  Keyboard,
  Layers,
  Loader2,
  PlayCircle,
  Trash2,
  UploadCloud,
} from "lucide-react";

import { MAX_PAGES_PER_JOB, MAX_PDF_BYTES } from "@/lib/extraction/constants";
import type { ClientPageSlot } from "@/lib/extraction/types";

import { ACCEPTED, SLOT_DRAG_MIME, TEXT_EXTRACTION_MIN_LENGTH } from "../constants";
import type { InputMode } from "../types";
import { formatBytes } from "../utils";
import { UploadMetaChip } from "./upload-meta-chip";

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
}) {
  // Slot-reorder local state. dragIndex !== null while a slot is being dragged
  // — used to mute the parent label's drop handler so a slot reorder doesn't
  // get mis-interpreted as an external file drop.
  const [dragSlotIndex, setDragSlotIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const textLength = textValue.trim().length;
  const canStartText = textLength >= TEXT_EXTRACTION_MIN_LENGTH;
  const modeDescription =
    inputMode === "file"
      ? "PDF와 이미지를 계속 추가할 수 있습니다."
      : "지문 원문이나 문제 형식 텍스트를 붙여넣을 수 있습니다.";
  const fileProgressRatio = uploadProgress
    ? uploadProgress.uploaded / Math.max(1, uploadProgress.total)
    : splitProgress
      ? (splitProgress.pageIndex ?? 0) / Math.max(1, splitProgress.totalPages ?? 1)
      : 0;
  const fileProgressPercent = Math.min(100, Math.max(0, fileProgressRatio * 100));
  const fileBusyLabel = uploadProgress
    ? `업로드 중 ${uploadProgress.uploaded}/${uploadProgress.total}`
    : splitProgress
      ? "PDF 페이지 분리 중"
      : "작업 중";

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-slate-950">자료 입력</h2>
          <p className="mt-1 text-xs text-slate-500">{modeDescription}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md bg-slate-100 p-0.5 text-xs font-bold text-slate-500">
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
              disabled={busy}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              비우기
            </button>
          ) : null}
        </div>
      </div>

      {inputMode === "text" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3.5">
          <div className="grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <label className="block">
              <span className="text-xs font-bold text-slate-700">제목</span>
              <input
                value={textTitle}
                onChange={(event) => onTextTitleChange(event.target.value)}
                disabled={busy}
                placeholder="예: 222.jpg 텍스트 입력"
                className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <UploadMetaChip icon={<Keyboard className="size-3.5" aria-hidden="true" />}>
                직접 입력
              </UploadMetaChip>
              <UploadMetaChip icon={<FileText className="size-3.5" aria-hidden="true" />}>
                문제 형식 가능
              </UploadMetaChip>
              <UploadMetaChip icon={<Database className="size-3.5" aria-hidden="true" />}>
                복원 적용
              </UploadMetaChip>
            </div>
          </div>

          <div className="flex min-h-[360px] flex-1 flex-col rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-900">텍스트 원문</div>
                <p className="mt-0.5 text-xs text-slate-500">
                  지문만 붙여넣거나 보기와 선택지가 포함된 문제 텍스트를 그대로 붙여넣으세요.
                </p>
              </div>
              <span
                className={
                  "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ring-1 " +
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
              placeholder={`Soft drink companies attract consumers by adding bright colors...\n\n(A) Also, the artificial flavor...\n(B) Studies have shown...\n(C) They are artificial chemicals...`}
              className="min-h-[280px] flex-1 resize-none rounded-md border border-dashed border-slate-300 bg-white px-4 py-3 text-sm leading-7 text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
            />
          </div>

          <div className="grid gap-2 rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-xs leading-5 text-blue-800 md:grid-cols-3">
            <div>
              <div className="font-bold">입력</div>
              <p className="mt-0.5">붙여넣은 텍스트를 줄바꿈까지 그대로 보존합니다.</p>
            </div>
            <div>
              <div className="font-bold">복원</div>
              <p className="mt-0.5">문제 형식이면 본문을 기준으로 M1 복원을 실행합니다.</p>
            </div>
            <div>
              <div className="font-bold">검수</div>
              <p className="mt-0.5">완료된 결과는 자료 관리에서 비교하고 저장합니다.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onStartText}
            disabled={busy || !canStartText}
            className="inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-md bg-blue-600 px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
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
            if (event.dataTransfer.files.length > 0) onFiles(event.dataTransfer.files);
          }}
          className={
            "flex min-h-[220px] flex-1 cursor-pointer flex-col rounded-lg border-2 border-dashed transition-colors " +
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
                <UploadCloud className="size-6" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="mt-3 text-sm font-bold text-slate-900">
                파일을 끌어놓거나 클릭해서 추가
              </div>
              <div className="mt-1 text-xs text-slate-500">
                여러 이미지와 PDF 페이지를 순서대로 등록합니다.
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <UploadMetaChip icon={<FileText className="size-3.5" aria-hidden="true" />}>
                  PDF, PNG, JPG, WebP
                </UploadMetaChip>
                <UploadMetaChip icon={<Layers className="size-3.5" aria-hidden="true" />}>
                  최대 {MAX_PAGES_PER_JOB}페이지
                </UploadMetaChip>
                <UploadMetaChip icon={<Database className="size-3.5" aria-hidden="true" />}>
                  PDF {Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB
                </UploadMetaChip>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <UploadCloud className="size-3.5 text-blue-500" aria-hidden="true" />
                  <span>파일을 더 끌어놓거나, 썸네일을 드래그해 순서를 바꿀 수 있습니다.</span>
                </div>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-100">
                  {slots.length}페이지
                </span>
              </div>
              <div className="flex min-h-0 flex-1 items-stretch gap-2 overflow-x-auto pb-2">
                {slots.map((slot, index) => {
                  const isDragging = dragSlotIndex === index;
                  const isDropTarget =
                    dropTargetIndex === index && dragSlotIndex !== index;
                  return (
                    <div
                      key={slot.pageIndex + '-' + slot.previewUrl}
                      draggable={!busy}
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
                        event.dataTransfer.setData(SLOT_DRAG_MIME, String(index));
                        setDragSlotIndex(index);
                      }}
                      onDragOver={(event) => {
                        if (dragSlotIndex === null) return;
                        event.preventDefault();
                        event.stopPropagation();
                        event.dataTransfer.dropEffect = "move";
                        if (dropTargetIndex !== index) setDropTargetIndex(index);
                      }}
                      onDragLeave={(event) => {
                        if (dragSlotIndex === null) return;
                        event.stopPropagation();
                        if (dropTargetIndex === index) setDropTargetIndex(null);
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
                        "flex h-full shrink-0 flex-col rounded-md border bg-white p-2 transition-all " +
                        (isDragging
                          ? "border-blue-400 opacity-40"
                          : isDropTarget
                            ? "border-blue-500 ring-2 ring-blue-200"
                            : "border-slate-200") +
                        (busy ? " cursor-not-allowed" : " cursor-grab active:cursor-grabbing")
                      }
                      title={slot.sourceFileName ?? slot.pageIndex + 1 + '페이지'}
                    >
                      <div className="relative min-h-0 flex-1 aspect-[4/3] overflow-hidden rounded border border-slate-200 bg-slate-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={slot.previewUrl}
                          alt={slot.pageIndex + 1 + '페이지'}
                          className="absolute inset-0 h-full w-full object-cover object-top"
                          draggable={false}
                        />
                        <span className="absolute bottom-0 left-0 rounded-tr bg-slate-950/75 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {slot.pageIndex + 1}
                        </span>
                      </div>
                      <div className="mt-1.5 truncate text-[11px] font-bold text-slate-800">
                        {slot.sourceFileName ?? slot.pageIndex + 1 + '페이지 이미지'}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-1 text-[10.5px] text-slate-500">
                        <span>{slot.pageIndex + 1}페이지</span>
                        <span>{formatBytes(slot.bytes)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </label>

        <button
          type="button"
          onClick={onStart}
          disabled={busy || slots.length === 0}
          className={
            "relative inline-flex h-10 w-full items-center justify-center overflow-hidden rounded-md border px-5 text-sm font-bold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 " +
            (busy
              ? "cursor-wait border-blue-200 bg-white text-blue-700"
              : slots.length === 0
                ? "cursor-not-allowed border-blue-200 bg-transparent text-blue-500/75"
                : "cursor-pointer border-blue-500 bg-transparent text-blue-700 hover:bg-blue-50")
          }
        >
          {busy ? (
            <span
              className="absolute inset-y-0 left-0 bg-blue-600 transition-[width] duration-200 ease-out"
              style={{ width: `${fileProgressPercent}%` }}
              aria-hidden="true"
            />
          ) : null}
          <span
            className={
              "relative z-10 inline-flex items-center transition-colors " +
              (busy && fileProgressPercent >= 54 ? "text-white" : "")
            }
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
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
