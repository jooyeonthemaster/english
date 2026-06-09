"use client";

import { useCallback, useRef, useState } from "react";
import {
  CheckCircle2,
  Database,
  FileText,
  Layers,
  Loader2,
  Scissors,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { MAX_PAGES_PER_JOB, MAX_PDF_BYTES } from "@/lib/extraction/constants";
import {
  imagesToSlots,
  revokeSlotUrls,
  splitPdfToImages,
} from "@/lib/extraction/pdf-splitter";
import type { ClientPageSlot } from "@/lib/extraction/types";

// ── 경계: 자료 추출 페이지의 크롭 보드(InlineCropBoard)를 import 차용(무수정). 입력창 UI 구조는
//    자료 추출 UploadPanel 을 베껴 동일 룩으로 맞췄다(텍스트모드·출력방식·크레딧은 커스텀에 불필요). ──
import {
  InlineCropBoard,
  type InlineCropBoardCounts,
  type InlineCropBoardHandle,
} from "../../passages/import/_components/intake/crop/inline-crop-board";
import { CustomTypeAnalysisJobsPanel } from "./custom-type-analysis-jobs-panel";
import { blobToBase64, mediaTypeForBlob } from "./custom-type-utils";

const EMPTY_CROP_COUNTS: InlineCropBoardCounts = {
  regionCount: 0,
  passageCount: 0,
  uncroppedCount: 0,
  totalPassages: 0,
};

const MAX_CUSTOM_REFERENCE_QUESTIONS = 20;
const FILE_INPUT_ID = "custom-type-file-input";

function withStableSlotIds(slots: ClientPageSlot[], offset = 0): ClientPageSlot[] {
  return slots.map((slot, index) => ({
    ...slot,
    pageIndex: offset + index,
    slotId: slot.slotId ?? crypto.randomUUID(),
  }));
}

function summarizeFileNames(files: File[]): string {
  if (files.length === 0) return "";
  if (files.length === 1) return files[0].name;
  return `${files[0].name} 외 ${files.length - 1}개`;
}

// 유형 만들기: 자료 추출 crop 보드를 그대로 사용한다. 여러 crop 그룹은 각각
// 하나의 reference question 분석 잡으로 등록되어 여러 커스텀 유형을 한 번에 만들 수 있다.
export function CustomTypeCreatePanel({ onCreated }: { onCreated: () => void }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cropBoardRef = useRef<InlineCropBoardHandle>(null);
  const slotsRef = useRef<ClientPageSlot[]>([]);

  const [slots, setSlots] = useState<ClientPageSlot[]>([]);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [cropCounts, setCropCounts] = useState<InlineCropBoardCounts>(EMPTY_CROP_COUNTS);
  const [preparing, setPreparing] = useState(false);
  const [baking, setBaking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobsRefreshKey, setJobsRefreshKey] = useState(0);

  const busy = preparing || baking || submitting;

  const clearStaged = useCallback(() => {
    revokeSlotUrls(slotsRef.current);
    slotsRef.current = [];
    setSlots([]);
    setSourceName(null);
    setCropCounts(EMPTY_CROP_COUNTS);
    setError(null);
  }, []);

  const appendSlots = useCallback((incoming: ClientPageSlot[]) => {
    const nextIncoming = withStableSlotIds(incoming, slotsRef.current.length);
    const next = [...slotsRef.current, ...nextIncoming];
    slotsRef.current = next;
    setSlots(next);
  }, []);

  const pickFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0 || busy) return;

      const pdfs = list.filter((file) => file.type === "application/pdf");
      if (pdfs.length > 1 || (pdfs.length === 1 && list.length > 1)) {
        toast.error("PDF는 한 번에 하나만 넣을 수 있습니다. 여러 장은 이미지 파일로 넣어주세요.");
        return;
      }

      setPreparing(true);
      setError(null);
      try {
        const pdf = pdfs[0] ?? null;
        const nextSlots = pdf
          ? await splitPdfToImages(pdf, {})
          : await imagesToSlots(list);
        if (nextSlots.length === 0) {
          throw new Error("이미지를 준비하지 못했습니다.");
        }
        appendSlots(nextSlots);
        setSourceName((current) => current ?? (pdf ? pdf.name : summarizeFileNames(list)));
      } catch (err) {
        const message = err instanceof Error ? err.message : "파일을 준비하지 못했습니다.";
        setError(message);
        toast.error(message);
      } finally {
        setPreparing(false);
      }
    },
    [appendSlots, busy],
  );

  const removeSlot = useCallback((index: number) => {
    const current = slotsRef.current;
    if (index < 0 || index >= current.length) return;
    const target = current[index];
    if (target) revokeSlotUrls([target]);
    const next = current
      .filter((_, i) => i !== index)
      .map((slot, i) => ({ ...slot, pageIndex: i }));
    slotsRef.current = next;
    setSlots(next);
    setCropCounts(EMPTY_CROP_COUNTS);
    if (next.length === 0) setSourceName(null);
  }, []);

  const reorderSlots = useCallback((fromIndex: number, toIndex: number) => {
    const current = slotsRef.current;
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= current.length) return;
    if (toIndex < 0 || toIndex >= current.length) return;
    const next = [...current];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) return;
    next.splice(toIndex, 0, moved);
    const reindexed = next.map((slot, i) => ({ ...slot, pageIndex: i }));
    slotsRef.current = reindexed;
    setSlots(reindexed);
  }, []);

  const enqueueOne = useCallback(
    async (slot: ClientPageSlot): Promise<string> => {
      const data = await blobToBase64(slot.blob);
      const res = await fetch("/api/custom-question-types/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          images: [{ data, mediaType: mediaTypeForBlob(slot.blob) }],
          manualCrop: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "분석 등록에 실패했습니다.");
      if (!json?.jobId) throw new Error("작업 ID를 받지 못했습니다.");
      return String(json.jobId);
    },
    [],
  );

  const enqueue = useCallback(async () => {
    if (slotsRef.current.length === 0) {
      toast.error("문항 이미지나 PDF를 먼저 올려주세요.");
      return;
    }
    if (cropCounts.totalPassages === 0) {
      toast.error("문항 영역을 먼저 크롭해 주세요.");
      return;
    }

    setSubmitting(true);
    setBaking(true);
    setError(null);
    try {
      const baked = await cropBoardRef.current?.buildPassageSlots();
      setBaking(false);
      if (!baked || baked.length === 0) {
        throw new Error("크롭한 문항 이미지를 만들지 못했습니다.");
      }

      const createdIds: string[] = [];
      const failures: string[] = [];
      for (const slot of baked) {
        try {
          createdIds.push(await enqueueOne(slot));
        } catch (err) {
          failures.push(err instanceof Error ? err.message : "분석 등록 실패");
        }
      }

      if (createdIds.length === 0) {
        throw new Error(failures[0] ?? "분석 등록에 실패했습니다.");
      }

      clearStaged();
      setJobsRefreshKey((v) => v + 1);
      if (failures.length > 0) {
        toast.warning(
          `${createdIds.length}개 분석 작업을 등록했고 ${failures.length}개는 실패했습니다.`,
        );
      } else {
        toast.success(`${createdIds.length}개 분석 작업을 큐에 등록했습니다.`);
      }
    } catch (err) {
      setBaking(false);
      const message = err instanceof Error ? err.message : "분석 등록에 실패했습니다.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [clearStaged, cropCounts.totalPassages, enqueueOne]);

  const cropNeeded = slots.length > 0 && cropCounts.totalPassages === 0;

  // 하단 고정 시작 버튼(자료 추출 UploadPanel 의 fileStartArea 와 동일 위치/룩).
  const startArea = (
    <button
      type="button"
      onClick={enqueue}
      disabled={slots.length === 0 || cropNeeded || busy}
      className={
        "inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg text-[14px] font-extrabold text-white shadow-sm transition-colors " +
        (busy
          ? "cursor-wait bg-blue-600"
          : slots.length === 0 || cropNeeded
            ? "cursor-not-allowed bg-blue-300"
            : "cursor-pointer bg-blue-600 hover:bg-blue-700")
      }
    >
      {busy ? (
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      ) : (
        <Sparkles className="size-5" aria-hidden="true" />
      )}
      {busy
        ? "등록 중…"
        : cropNeeded
          ? "문항을 크롭해 주세요"
          : `분석 큐에 추가${cropCounts.totalPassages > 0 ? ` (유형 ${cropCounts.totalPassages}개)` : ""}`}
    </button>
  );

  const fileUploadLabel = (
    <label
      htmlFor={FILE_INPUT_ID}
      className="flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-blue-500 bg-white px-6 py-8 text-center transition-colors hover:bg-blue-50"
    >
      <input
        id={FILE_INPUT_ID}
        ref={fileInputRef}
        type="file"
        className="sr-only"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        multiple
        onChange={(event) => {
          if (event.target.files) void pickFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />
      <span className="inline-flex items-center gap-2 text-[14px] font-extrabold text-blue-700">
        {preparing ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <UploadCloud className="size-5" aria-hidden="true" />
        )}
        {preparing ? "파일 준비 중…" : "파일을 끌어놓거나 클릭해서 추가"}
      </span>
      <span className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5">
          <FileText className="size-3.5" aria-hidden="true" />
          PDF, PNG, JPG, WebP
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5">
          <Database className="size-3.5" aria-hidden="true" />
          PDF {Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB · 최대 {MAX_PAGES_PER_JOB}p
        </span>
      </span>
    </label>
  );

  const quickGuideSteps = [
    { icon: UploadCloud, label: "원본 문항 파일 추가" },
    { icon: Scissors, label: "유형별 문항 영역 크롭" },
    { icon: CheckCircle2, label: "분석 큐에 추가" },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 sm:px-6 xl:px-8">
      <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {/* 헤더 — 유형 후보 수 · 소스명 · 학년 · 초기화 */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-100 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-slate-900">
              <Layers className="size-4 text-blue-600" aria-hidden="true" />
              유형 후보 {cropCounts.totalPassages}개
            </span>
            {sourceName ? (
              <span className="max-w-[240px] truncate rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                {sourceName}
              </span>
            ) : null}
          </div>
          {slots.length > 0 ? (
            <button
              type="button"
              onClick={clearStaged}
              disabled={busy}
              className="text-[12px] font-semibold text-slate-400 transition-colors hover:text-slate-600 disabled:opacity-50"
            >
              초기화
            </button>
          ) : null}
        </div>

        {/* 본문 */}
        {slots.length === 0 ? (
          <div
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              const next = event.relatedTarget as Node | null;
              if (!next || !event.currentTarget.contains(next)) setDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              if (event.dataTransfer.files.length > 0) void pickFiles(event.dataTransfer.files);
            }}
            className="flex h-[min(760px,calc(100dvh-260px))] min-h-[520px] flex-col overflow-hidden lg:flex-row"
          >
            {/* 좌: 파일 업로드 드롭존 */}
            <div className="flex min-h-0 flex-1 flex-col p-3.5">
              <div
                className={
                  "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border p-3 transition-colors " +
                  (dragActive ? "border-sky-500 bg-sky-50" : "border-slate-200 bg-slate-50/70")
                }
              >
                {fileUploadLabel}
              </div>
            </div>

            {/* 우: 사용 순서 가이드 + 시작 버튼 */}
            <aside className="flex min-h-0 flex-col border-t border-slate-100 bg-white max-lg:w-full lg:w-[340px] lg:shrink-0 lg:border-l lg:border-t-0">
              <div className="shrink-0 border-b border-slate-100 px-3.5 py-2.5">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-slate-900">
                  <Layers className="size-4 text-blue-600" aria-hidden="true" />
                  유형 후보 {cropCounts.totalPassages}개
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/40 p-2.5">
                <div className="mx-auto mt-6 flex max-w-xs flex-col rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                  <div className="inline-flex w-fit items-center gap-1.5 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white">
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    사용 순서
                  </div>
                  <h3 className="mt-2 text-[15px] font-extrabold leading-snug text-slate-950">
                    엔진에 없는 유형의 문항을 올려 유형으로 저장하세요
                  </h3>
                  <ol className="mt-4 space-y-2">
                    {quickGuideSteps.map((step, index) => (
                      <li
                        key={step.label}
                        className="flex items-center gap-2 rounded-md bg-white px-2.5 py-2 text-[12px] font-bold text-slate-700 ring-1 ring-slate-200"
                      >
                        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-extrabold text-blue-700">
                          {index + 1}
                        </span>
                        <step.icon className="size-3.5 text-blue-600" aria-hidden="true" />
                        <span>{step.label}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
              <div className="shrink-0 border-t border-slate-100 bg-white p-2.5">{startArea}</div>
            </aside>
          </div>
        ) : (
          <div className="flex h-[min(760px,calc(100dvh-260px))] min-h-[520px] flex-col">
            <InlineCropBoard
              ref={cropBoardRef}
              images={slots}
              disabled={busy}
              onAddFiles={pickFiles}
              onRemoveImage={removeSlot}
              onReorderImages={reorderSlots}
              maxPassages={MAX_CUSTOM_REFERENCE_QUESTIONS}
              onCountChange={setCropCounts}
              onClear={clearStaged}
              footer={
                <div className="space-y-2">
                  <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-[12px] font-semibold text-blue-700">
                    각 crop 그룹이 하나의 커스텀 유형 후보로 등록됩니다. 같은 문제 조각은 하나의 지문으로 합쳐 주세요.
                  </div>
                  {startArea}
                </div>
              }
            />
          </div>
        )}

        {error ? <p className="px-4 pb-3 text-[12px] text-rose-600">{error}</p> : null}
      </section>

      <CustomTypeAnalysisJobsPanel
        refreshKey={jobsRefreshKey}
        running={busy}
        onCreated={onCreated}
      />
    </div>
  );
}
