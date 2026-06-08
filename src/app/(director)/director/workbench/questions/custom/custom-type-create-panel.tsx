"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  imagesToSlots,
  revokeSlotUrls,
  splitPdfToImages,
} from "@/lib/extraction/pdf-splitter";
import type { ClientPageSlot, CropBox } from "@/lib/extraction/types";

import {
  buildManualCropReferenceSlot,
  ManualQuestionCropBoard,
} from "../_components/manual-question-crop-board";
import { CustomTypeAnalysisJobsPanel } from "./custom-type-analysis-jobs-panel";
import { blobToBase64, mediaTypeForBlob } from "./custom-type-utils";

// 유형 만들기 — 업로드 + 수동 크롭 후 "분석 큐에 추가"(비동기). 워커가 백그라운드로 분석→유형정의
// 컴파일→ACTIVE 커스텀 유형 자동 생성. 하단 작업 큐가 진행/완료를 폴링(동형 문제 생성과 동일 패턴).

export function CustomTypeCreatePanel({ onCreated }: { onCreated: () => void }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [staged, setStaged] = useState<ClientPageSlot | null>(null);
  const [cropBoxes, setCropBoxes] = useState<CropBox[]>([]);
  const [gradeInfo, setGradeInfo] = useState("고3");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobsRefreshKey, setJobsRefreshKey] = useState(0);

  const clearStaged = useCallback(() => {
    setStaged((cur) => {
      if (cur) revokeSlotUrls([cur]);
      return null;
    });
    setCropBoxes([]);
    setError(null);
  }, []);

  const pickFile = useCallback(async (file: File) => {
    setError(null);
    try {
      let slot: ClientPageSlot;
      if (file.type === "application/pdf") {
        const slots = await splitPdfToImages(file, {});
        if (slots.length === 0) throw new Error("PDF에서 페이지를 추출하지 못했습니다.");
        if (slots.length > 1) toast.warning("여러 페이지 PDF는 첫 페이지만 사용합니다.");
        const [first, ...rest] = slots;
        if (rest.length > 0) revokeSlotUrls(rest);
        slot = first;
      } else {
        const slots = await imagesToSlots([file]);
        const [first] = slots;
        if (!first) throw new Error("이미지를 준비하지 못했습니다.");
        slot = first;
      }
      setStaged((cur) => {
        if (cur) revokeSlotUrls([cur]);
        return {
          ...slot,
          pageIndex: 0,
          slotId: slot.slotId ?? crypto.randomUUID(),
          sourceFileName: file.name,
        };
      });
      setCropBoxes([]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "파일을 준비하지 못했습니다.";
      setError(message);
      toast.error(message);
    }
  }, []);

  const enqueue = useCallback(async () => {
    if (!staged) {
      toast.error("문항 이미지를 먼저 올리세요.");
      return;
    }
    if (cropBoxes.length === 0) {
      toast.error("문항 영역을 먼저 수동으로 크롭해 주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const manualReferenceSlot = await buildManualCropReferenceSlot(staged, cropBoxes);
      const data = await blobToBase64(manualReferenceSlot.blob);
      const res = await fetch("/api/custom-question-types/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          images: [{ data, mediaType: mediaTypeForBlob(manualReferenceSlot.blob) }],
          gradeInfo,
          manualCrop: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "분석 등록에 실패했습니다.");
      if (!json?.jobId) throw new Error("작업 ID를 받지 못했습니다.");
      toast.success("분석 작업을 큐에 등록했어요. 완료되면 유형이 자동 생성됩니다.");
      clearStaged();
      setJobsRefreshKey((v) => v + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : "분석 등록에 실패했습니다.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [staged, cropBoxes, gradeInfo, clearStaged]);

  const cropNeeded = !!staged && cropBoxes.length === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-5">
      {/* 입력 (업로드 + 수동 크롭) */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Upload className="size-4" />
            문항 이미지/PDF 선택
          </button>
          <label className="flex items-center gap-1.5 text-[12px] text-slate-600">
            학년
            <input
              value={gradeInfo}
              onChange={(e) => setGradeInfo(e.target.value)}
              className="w-16 rounded-md border border-slate-300 px-2 py-1 text-[12px]"
            />
          </label>
          <div className="ml-auto flex items-center gap-2">
            {staged ? (
              <button
                type="button"
                onClick={clearStaged}
                className="text-[12px] font-semibold text-slate-400 hover:text-slate-600"
              >
                초기화
              </button>
            ) : null}
            <button
              type="button"
              onClick={enqueue}
              disabled={!staged || cropNeeded || submitting}
              title={cropNeeded ? "문항 영역을 먼저 크롭해 주세요" : undefined}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {submitting ? "등록 중…" : cropNeeded ? "크롭 필요" : "분석 큐에 추가"}
            </button>
          </div>
        </div>

        {staged ? (
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            <ManualQuestionCropBoard
              slot={staged}
              boxes={cropBoxes}
              busy={submitting}
              error={error}
              onBoxesChange={setCropBoxes}
              onPickFiles={(files) => {
                const file = Array.from(files)[0];
                if (file) void pickFile(file);
              }}
              onRequestFileDialog={() => fileInputRef.current?.click()}
            />
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-8 text-center text-[13px] text-slate-500">
            우리 엔진에 없는 유형의 문항 한 개(이미지 1장 또는 1페이지 PDF)를 올리고, 문항 영역을 크롭한 뒤 분석 큐에 추가하세요.
          </p>
        )}

        {error ? <p className="mt-2 text-[12px] text-rose-600">{error}</p> : null}
      </div>

      {/* 하단 작업 큐 — 분석 진행/완료(유형 자동 생성). */}
      <CustomTypeAnalysisJobsPanel
        refreshKey={jobsRefreshKey}
        running={submitting}
        onCreated={onCreated}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void pickFile(file);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
