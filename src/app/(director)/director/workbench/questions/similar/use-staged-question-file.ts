"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  imagesToSlots,
  revokeSlotUrls,
  splitPdfToImages,
} from "@/lib/extraction/pdf-splitter";
import type { ClientPageSlot } from "@/lib/extraction/types";
import type { InlineCropBoardCounts } from "../../passages/import/_components/intake/crop/inline-crop-board";

// 중앙 "원본 문항(참조)" 스테이징 — 파일 입력(PDF/이미지)→페이지 슬롯 변환, 슬롯
// 삭제/재정렬, 크롭 카운트. similar-question-generator-client 에서 분리.

export interface StagedFile {
  fileName: string;
  totalPages: number;
}

export const EMPTY_CROP_COUNTS: InlineCropBoardCounts = {
  regionCount: 0,
  passageCount: 0,
  uncroppedCount: 0,
  totalPassages: 0,
};

function addStableSlotIds(slots: ClientPageSlot[]): ClientPageSlot[] {
  return slots.map((slot, index) => ({
    ...slot,
    pageIndex: index,
    slotId: slot.slotId ?? crypto.randomUUID(),
  }));
}

function summarizeFileNames(files: File[]): string {
  if (files.length === 0) return "";
  if (files.length === 1) return files[0].name;
  return `${files[0].name} 외 ${files.length - 1}개`;
}

export function useStagedQuestionFile({ busy }: { busy: boolean }) {
  const slotsRef = useRef<ClientPageSlot[]>([]);
  const [staged, setStaged] = useState<StagedFile | null>(null);
  const [slots, setSlots] = useState<ClientPageSlot[]>([]);
  const [cropCounts, setCropCounts] = useState<InlineCropBoardCounts>(EMPTY_CROP_COUNTS);
  const [splitting, setSplitting] = useState(false);
  const [splitMessage, setSplitMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const clearStaged = useCallback(() => {
    revokeSlotUrls(slotsRef.current);
    slotsRef.current = [];
    setSlots([]);
    setCropCounts(EMPTY_CROP_COUNTS);
    setStaged(null);
    setSplitMessage("");
    setError(null);
  }, []);

  useEffect(() => () => revokeSlotUrls(slotsRef.current), []);

  const pickFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0 || busy || splitting) return;
      const pdfs = list.filter((file) => file.type === "application/pdf");
      if (pdfs.length > 1 || (pdfs.length === 1 && list.length > 1)) {
        toast.error("PDF는 한 번에 하나만 넣을 수 있습니다. 여러 장은 이미지 파일로 넣어주세요.");
        return;
      }
      clearStaged();
      setSplitting(true);
      setError(null);
      try {
        const pdf = pdfs[0] ?? null;
        setSplitMessage(pdf ? "PDF 페이지를 이미지로 변환 중" : "이미지 정리 중");
        const nextSlots = pdf
          ? await splitPdfToImages(pdf, {
              onProgress: (p) => {
                if (p.phase === "rendering") {
                  setSplitMessage(
                    `${(p.pageIndex ?? 0) + 1}/${p.totalPages ?? "?"}페이지 변환 중`,
                  );
                }
              },
            })
          : await imagesToSlots(list);
        const normalizedSlots = addStableSlotIds(nextSlots);
        slotsRef.current = normalizedSlots;
        setSlots(normalizedSlots);
        setCropCounts(EMPTY_CROP_COUNTS);
        setStaged({
          fileName: pdf ? pdf.name : summarizeFileNames(list),
          totalPages: normalizedSlots.length,
        });
        setSplitMessage("");
      } catch (err) {
        const message = err instanceof Error ? err.message : "문항을 준비하지 못했습니다.";
        setError(message);
        toast.error(message);
      } finally {
        setSplitting(false);
      }
    },
    [busy, splitting, clearStaged],
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
    if (next.length === 0) {
      setStaged(null);
      setSplitMessage("");
      setError(null);
    } else {
      setStaged((cur) => (cur ? { ...cur, totalPages: next.length } : cur));
    }
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

  return {
    slotsRef,
    staged,
    slots,
    cropCounts,
    setCropCounts,
    splitting,
    splitMessage,
    error,
    setError,
    clearStaged,
    pickFiles,
    removeSlot,
    reorderSlots,
  };
}
