"use client";

import { useCallback, useId, useMemo, useState } from "react";
import {
  UploadCloud,
  FileText,
  ImageIcon,
  X,
  ListChecks,
  NotebookPen,
  FilePlus2,
  Pencil,
  Check,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { useExtractionStore } from "@/lib/extraction/store";
import { useExtractionUpload } from "@/hooks/use-extraction-upload";
import {
  splitPdfToImages,
  imagesToSlots,
} from "@/lib/extraction/pdf-splitter";
import {
  ACCEPTED_IMAGE_MIMES,
  ACCEPTED_PDF_MIMES,
  MAX_INPUT_IMAGE_BYTES,
  MAX_PAGES_PER_JOB,
  MAX_PDF_BYTES,
} from "@/lib/extraction/constants";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { MODES, type ModeIcon } from "@/lib/extraction/modes";

const ACCEPTED = [
  ...ACCEPTED_PDF_MIMES,
  ...ACCEPTED_IMAGE_MIMES,
] as readonly string[];

const MODE_ICON_MAP: Record<ModeIcon, LucideIcon> = {
  FileText,
  ListChecks,
  NotebookPen,
  FilePlus2,
};

const LAST_MODE_KEY = "nara-last-extraction-mode";

export function UploadStep() {
  const phase = useExtractionStore((s) => s.phase);
  const slots = useExtractionStore((s) => s.slots);
  const splitProgress = useExtractionStore((s) => s.splitProgress);
  const mode = useExtractionStore((s) => s.mode);
  const setSlots = useExtractionStore((s) => s.setSlots);
  const setSource = useExtractionStore((s) => s.setSource);
  const setPhase = useExtractionStore((s) => s.setPhase);
  const setSplitProgress = useExtractionStore((s) => s.setSplitProgress);
  const setError = useExtractionStore((s) => s.setError);
  const startUpload = useExtractionUpload();

  const [dragActive, setDragActive] = useState(false);
  const [sourceType, setSourceTypeLocal] = useState<"PDF" | "IMAGES" | null>(null);
  const [sourceName, setSourceNameLocal] = useState<string | null>(null);
  // Note: no `inputRef` here — the <label htmlFor> pattern opens the file
  // picker natively (see block comment below), so a manual `inputRef.current?.click()`
  // is unnecessary. Keeping the ref around was dead code.

  // Stable SSR-safe ids for the file input + its described-by hint. Needed
  // because the <label htmlFor> / <input id> / aria-describedby chain has to
  // match across server and client render to avoid hydration warnings.
  const fileInputId = useId();
  const constraintsId = useId();

  const modeConfig = useMemo(() => (mode ? MODES[mode] : null), [mode]);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;

      setError(null);

      // PDF path (only one PDF allowed)
      const firstPdf = arr.find((f) => ACCEPTED_PDF_MIMES.includes(f.type as typeof ACCEPTED_PDF_MIMES[number]));
      const allImages = arr.every((f) =>
        ACCEPTED_IMAGE_MIMES.includes(f.type as typeof ACCEPTED_IMAGE_MIMES[number]),
      );

      if (firstPdf) {
        if (firstPdf.size > MAX_PDF_BYTES) {
          setError(
            `PDF 파일 크기가 ${Math.round(firstPdf.size / 1024 / 1024)}MB로 너무 큽니다. ${Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB 이하로 업로드해 주세요.`,
          );
          return;
        }

        try {
          setPhase("preparing");
          setSplitProgress({ pageIndex: 0, totalPages: 0 });
          const extracted = await splitPdfToImages(firstPdf, {
            onProgress: (p) => {
              if (p.phase === "rendering" || p.phase === "loading") {
                setSplitProgress({
                  pageIndex: p.pageIndex,
                  totalPages: p.totalPages,
                });
              }
            },
          });
          setSlots(extracted);
          setSource(firstPdf.name, "PDF");
          setSourceTypeLocal("PDF");
          setSourceNameLocal(firstPdf.name);
          setPhase("idle");
          setSplitProgress(null);
        } catch (e) {
          setError((e as Error).message);
          setPhase("error");
          setSplitProgress(null);
        }
        return;
      }

      if (allImages && arr.length > 0) {
        if (arr.length > MAX_PAGES_PER_JOB) {
          setError(
            `이미지는 최대 ${MAX_PAGES_PER_JOB}장까지 업로드 가능합니다.`,
          );
          return;
        }
        for (const f of arr) {
          if (f.size > MAX_INPUT_IMAGE_BYTES) {
            setError(
              `${f.name}이(가) ${Math.round(f.size / 1024 / 1024)}MB로 너무 큽니다.`,
            );
            return;
          }
        }
        try {
          const extracted = await imagesToSlots(arr);
          setSlots(extracted);
          setSource("", "IMAGES");
          setSourceTypeLocal("IMAGES");
          setSourceNameLocal(`${arr.length}장의 이미지`);
          setPhase("idle");
        } catch (e) {
          setError((e as Error).message);
        }
        return;
      }

      setError("지원하지 않는 파일 형식입니다. PDF 또는 이미지(PNG/JPG/WebP)를 올려 주세요.");
    },
    [setError, setPhase, setSlots, setSource, setSplitProgress],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) void handleFiles(files);
    },
    [handleFiles],
  );

  const handleSubmit = useCallback(async () => {
    if (slots.length === 0 || !sourceType) return;
    if (!mode) {
      // Mode must be chosen on the mode-select screen before upload.
      setError("모드를 먼저 선택해 주세요.");
      return;
    }
    // Remember the mode the user actually submitted with
    try {
      window.localStorage.setItem(LAST_MODE_KEY, mode);
    } catch {
      // ignore
    }
    await startUpload({
      slots,
      sourceType,
      originalFileName: sourceName,
      mode,
    });
  }, [slots, sourceType, sourceName, mode, setError, startUpload]);

  const clearAll = useCallback(() => {
    setSlots([]);
    setSourceTypeLocal(null);
    setSourceNameLocal(null);
    setError(null);
  }, [setSlots, setError]);

  // Switching modes mid-flow must invalidate any in-memory preview slots —
  // otherwise the user returns to upload with stale pages whose per-slot
  // credit cost may no longer match the new mode's pricing/rules. If nothing
  // is uploaded yet we skip the confirmation to keep the happy path fast.
  const openModeSelect = useCallback(() => {
    if (slots.length > 0) {
      const ok = window.confirm(
        "모드를 변경하면 선택한 파일이 초기화됩니다. 계속하시겠습니까?",
      );
      if (!ok) return;
      setSlots([]);
      setSourceTypeLocal(null);
      setSourceNameLocal(null);
    }
    setError(null);
    setPhase("mode-select");
  }, [slots.length, setSlots, setError, setPhase]);

  const projectedCredits = slots.length * CREDIT_COSTS.TEXT_EXTRACTION;

  const submitLabel = useMemo(() => {
    if (!modeConfig) return `추출 시작 · ${projectedCredits} 크레딧`;
    switch (modeConfig.id) {
      case "PASSAGE_ONLY":
        return `지문 추출 시작 · ${projectedCredits} 크레딧`;
      case "QUESTION_SET":
        return `문제 추출 시작 · ${projectedCredits} 크레딧`;
      case "FULL_EXAM":
        return `시험지 추출 시작 · ${projectedCredits} 크레딧`;
      case "EXPLANATION":
        return `해설 추출 시작 · ${projectedCredits} 크레딧`;
      default:
        // A new ExtractionMode was added but this switch wasn't updated —
        // fall back to the generic label rather than returning `undefined`.
        return `추출 시작 · ${projectedCredits} 크레딧`;
    }
  }, [modeConfig, projectedCredits]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3 px-6 py-5">
      {/* ─── Compact top bar: mode + title in single row ──────────────── */}
      <div className="flex items-center gap-3">
        {modeConfig ? (
          <div className="flex items-center gap-2 rounded-lg border border-sky-100 bg-sky-50/60 px-2.5 py-1.5">
            <ModeBadge icon={modeConfig.icon} />
            <div className="flex items-center gap-1.5">
              <span className="text-[12.5px] font-semibold text-slate-900">
                {modeConfig.label}
              </span>
              <span className="rounded border border-sky-200 bg-white px-1 py-0 text-[9.5px] font-bold tracking-wider text-sky-700">
                {modeConfig.shortLabel}
              </span>
            </div>
            <button
              type="button"
              onClick={openModeSelect}
              aria-label="추출 모드 변경"
              className="ml-1 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-sky-300 hover:text-sky-700"
            >
              <Pencil className="size-3" strokeWidth={1.8} aria-hidden="true" />
              변경
            </button>
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14px] font-semibold text-slate-800">
            파일 업로드
          </h2>
          <p className="truncate text-[11.5px] text-slate-500">
            PDF 1개 또는 페이지별 이미지 여러 장을 선택하세요. 페이지는 자동 분리됩니다.
          </p>
        </div>
      </div>

      {slots.length === 0 ? (
        // ─── EMPTY STATE: dropzone (flex-1) + sidebar (fixed) ──────────
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <label
            htmlFor={fileInputId}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            className={
              "group relative flex min-h-0 cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed text-center transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-sky-500 focus-within:ring-offset-2 " +
              (dragActive
                ? "border-sky-500 bg-sky-50"
                : "border-slate-300 bg-white hover:border-sky-400 hover:bg-sky-50/40")
            }
          >
            <input
              id={fileInputId}
              type="file"
              aria-label="시험지 파일 선택"
              aria-describedby={constraintsId}
              className="sr-only"
              multiple
              accept={ACCEPTED.join(",")}
              onChange={(e) => {
                if (e.target.files) void handleFiles(e.target.files);
              }}
            />
            <div
              aria-hidden="true"
              className="rounded-2xl bg-sky-500/10 p-4 text-sky-600 transition-colors group-hover:bg-sky-500/20"
            >
              <UploadCloud className="size-10" strokeWidth={1.6} />
            </div>
            <div className="space-y-1">
              <div className="text-[15px] font-semibold text-slate-800">
                파일을 여기에 끌어놓거나 클릭해서 선택하세요
              </div>
              <div id={constraintsId} className="text-[12px] text-slate-500">
                PDF · PNG · JPG · WebP 지원 · 최대 {MAX_PAGES_PER_JOB}페이지 ·
                파일당 최대 {Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB
              </div>
            </div>

            {phase === "preparing" && splitProgress ? (
              <div className="mt-4 w-full max-w-md">
                <div
                  role="status"
                  aria-live="polite"
                  className="mb-2 text-[11px] font-medium text-slate-600"
                >
                  PDF 분석 중… {splitProgress.pageIndex !== undefined
                    ? `(${splitProgress.pageIndex + 1}/${splitProgress.totalPages})`
                    : ""}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-sky-500 transition-[width] duration-300"
                    style={{
                      width: splitProgress.totalPages
                        ? `${(((splitProgress.pageIndex ?? 0) + 1) / splitProgress.totalPages) * 100}%`
                        : "8%",
                    }}
                  />
                </div>
              </div>
            ) : null}
          </label>

          {modeConfig ? <ExpectedOutputCard mode={modeConfig} /> : null}
        </div>
      ) : (
        // ─── AFTER SELECTION: thumbs (left) + CTA panel (right) ────────
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* LEFT: file info bar + thumbnail grid */}
          <div className="flex min-h-0 flex-col gap-3">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                  {sourceType === "PDF" ? (
                    <FileText className="size-[18px]" strokeWidth={1.8} />
                  ) : (
                    <ImageIcon className="size-[18px]" strokeWidth={1.8} />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-slate-800">
                    {sourceName ?? "이미지"}
                  </div>
                  <div className="text-[11.5px] text-slate-500">
                    <span className="font-semibold tabular-nums text-slate-700">
                      {slots.length}
                    </span>
                    페이지
                    <span className="mx-1.5 text-slate-300">·</span>
                    예상 비용
                    <span className="ml-1 font-semibold tabular-nums text-sky-700">
                      {projectedCredits.toLocaleString("ko-KR")}
                    </span>
                    <span className="ml-0.5 text-slate-500">크레딧</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={clearAll}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
              >
                <X className="size-3.5" aria-hidden="true" />
                다시 선택
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/40 p-3">
              <div
                className={
                  slots.length === 1
                    ? "grid max-w-[220px] grid-cols-1 gap-3"
                    : "grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7"
                }
              >
                {slots.map((s) => (
                  <div
                    key={s.pageIndex}
                    className="relative aspect-[3/4] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.previewUrl}
                      alt={`페이지 ${s.pageIndex + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {s.pageIndex + 1}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT: CTA card + expected output */}
          <aside className="flex min-h-0 flex-col gap-3">
            {/* ─── Primary CTA card (checklist + credit cost + submit) ── */}
            <div className="flex flex-col gap-3 rounded-2xl border border-sky-200 bg-gradient-to-b from-sky-50 to-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <div
                  className="flex size-7 items-center justify-center rounded-lg bg-sky-600 text-white"
                  aria-hidden="true"
                >
                  <Check className="size-4" strokeWidth={2.4} />
                </div>
                <h3 className="text-[13px] font-bold tracking-tight text-slate-900">
                  추출 시작 전 확인
                </h3>
              </div>

              <ul className="space-y-1.5 text-[11.5px] leading-snug text-slate-700">
                <CheckItem>
                  페이지별로 1회씩 AI 호출 · 실패 페이지만 선택적 재시도
                </CheckItem>
                <CheckItem>
                  AI는 원문 그대로 추출 · 의역/요약 없음
                </CheckItem>
                <CheckItem>업로드 원본은 30일 후 자동 삭제</CheckItem>
              </ul>

              <div className="mt-1 flex items-center justify-between rounded-lg border border-sky-100 bg-white/70 px-3 py-2">
                <span className="text-[11px] font-medium text-slate-500">
                  예상 비용
                </span>
                <span className="text-[13px] font-bold tabular-nums text-sky-700">
                  {projectedCredits.toLocaleString("ko-KR")}
                  <span className="ml-0.5 text-[10.5px] font-semibold text-sky-600">
                    크레딧
                  </span>
                </span>
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-4 py-3 text-[13.5px] font-bold text-white shadow-sm transition-colors hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
              >
                <span>{submitLabel}</span>
                <ArrowRight className="size-4" strokeWidth={2.2} />
              </button>
            </div>

            {modeConfig ? (
              <ExpectedOutputCard mode={modeConfig} compact />
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check
        className="mt-[1px] size-3.5 shrink-0 text-sky-600"
        strokeWidth={2.4}
        aria-hidden="true"
      />
      <span>{children}</span>
    </li>
  );
}

function ModeBadge({ icon }: { icon: ModeIcon }) {
  const Icon = MODE_ICON_MAP[icon];
  return (
    <div className="flex size-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600">
      <Icon className="size-5" strokeWidth={1.7} />
    </div>
  );
}

function ExpectedOutputCard({
  mode,
  compact = false,
}: {
  mode: (typeof MODES)[keyof typeof MODES];
  /**
   * When true, render in a tightened variant suitable for the sidebar
   * next to the submit CTA (after files have been picked). Lists only the
   * entity names without their descriptions.
   */
  compact?: boolean;
}) {
  const Icon = MODE_ICON_MAP[mode.icon];
  return (
    <aside
      aria-label="추출 후 생성되는 항목"
      className={
        compact
          ? "flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3"
          : "flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-5"
      }
    >
      <div className="flex items-center gap-1.5">
        <Icon
          className="size-3.5 text-sky-600"
          strokeWidth={1.8}
          aria-hidden="true"
        />
        <h3 className={compact ? "text-[11.5px] font-bold text-slate-800" : "text-[13px] font-semibold text-slate-800"}>
          완료되면 생기는 것
        </h3>
      </div>

      <ul className={compact ? "flex flex-wrap gap-1.5" : "space-y-2 text-[12px] text-slate-700"}>
        {mode.producedEntities.map((entity) => (
          compact ? (
            <li
              key={entity.name}
              className="inline-flex items-center gap-1 rounded-md border border-sky-100 bg-sky-50/70 px-2 py-0.5 text-[11px] font-semibold text-sky-700"
            >
              <span
                aria-hidden="true"
                className="size-1 rounded-full bg-sky-500"
              />
              {entity.name}
            </li>
          ) : (
            <li key={entity.name} className="flex gap-2">
              <span
                aria-hidden="true"
                className="mt-1.5 inline-block size-1.5 shrink-0 rounded-full bg-sky-500"
              />
              <div>
                <div className="font-semibold text-slate-800">{entity.name}</div>
                <div className="text-[11px] leading-snug text-slate-500">
                  {entity.description}
                </div>
              </div>
            </li>
          )
        ))}
      </ul>

      <div
        className={
          compact
            ? "rounded-md border border-sky-100 bg-sky-50/70 px-2.5 py-1 text-[10.5px] leading-snug text-sky-800"
            : "mt-2 rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2 text-[11px] leading-snug text-sky-800"
        }
      >
        <span className="font-semibold">+ 자동 태깅</span>
        <span className="ml-1 text-sky-700/90">학년 · 시행기관 · 회차</span>
      </div>
    </aside>
  );
}
