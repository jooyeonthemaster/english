"use client";

// ============================================================================
// 학생 시험 리포트 — 인테이크 상태머신 훅(intake-upload-panel 에서 분할)
//
// 업로드 상태머신(phase) · 슬롯 수집(이미지 다중/PDF 1개 클라 분할) ·
// resumeDraft CAS(수정 시에만 updateExamMeta) · 등록 시퀀스
// (createExamAnalysis → uploadSlots → attachExamSources → fireAnalyzeRequest)
// 를 그대로 소유한다. 패널(intake-upload-panel)은 프레젠테이션만 담당.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  attachExamSources,
  createExamAnalysis,
  updateExamMeta,
} from "@/actions/exam-report";
import {
  imagesToSlots,
  revokeSlotUrls,
  splitPdfToImages,
} from "@/lib/extraction/pdf-splitter";
import type { ClientPageSlot } from "@/lib/extraction/types";
import { MAX_PDF_BYTES } from "@/lib/extraction/constants";
import { metaToCreateInput, type ExamMetaValue } from "./exam-meta-form";
import { uploadSlots, type UploadSlot } from "./upload-helpers";
import { fireAnalyzeRequest } from "./board-shared";

export const MAX_PAGES = 12;
export const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";

type SourceKind = "IMAGE" | "PDF";
export type Phase = "idle" | "ingesting" | "uploading" | "attaching" | "error";

/** 고아 DRAFT 이어서 등록 — 보드 카드에서 주입된다. */
export interface ResumeDraftTarget {
  id: string;
  title: string;
}

/** resume 메타 수정 여부 판정 — 주입 시점 스냅샷 대비 6필드 비교(공백 정규화). */
function isMetaEqual(a: ExamMetaValue, b: ExamMetaValue): boolean {
  return (
    a.title.trim() === b.title.trim() &&
    a.schoolName.trim() === b.schoolName.trim() &&
    a.grade.trim() === b.grade.trim() &&
    a.examType === b.examType &&
    a.examYear.trim() === b.examYear.trim() &&
    a.semester.trim() === b.semester.trim()
  );
}

function toUploadSlots(slots: ClientPageSlot[]): UploadSlot[] {
  return slots.map((s) => ({
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    blob: s.blob,
    previewUrl: s.previewUrl,
    name: s.sourceFileName ?? "페이지",
  }));
}

export function useIntakeUpload({
  meta,
  resumeDraft,
  onStarted,
}: {
  meta: ExamMetaValue;
  resumeDraft: ResumeDraftTarget | null;
  onStarted: (analysisId: string, info: { hasStudent: boolean }) => void;
}) {
  const [slots, setSlots] = useState<UploadSlot[]>([]);
  const [sourceKind, setSourceKind] = useState<SourceKind | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<{ uploaded: number; total: number }>({
    uploaded: 0,
    total: 0,
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // 작업대 미리보기에서 현재 보고 있는 페이지(슬롯 id — 재정렬을 따라간다).
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const draftIdRef = useRef<string | null>(null);

  // 이어서 등록: 주입/취소 시 재사용할 DRAFT id 를 동기화한다.
  // (허브의 resumeDraft 는 state 라 참조가 안정 — 값이 바뀔 때만 실행)
  // (결함수리) 주입 시점의 메타 스냅샷도 함께 보관 — resume 경로는
  // createExamAnalysis 를 건너뛰므로 사용자가 폼을 수정해도 그 값이 어디에도
  // 저장되지 않고 유실됐다. handleStart 가 스냅샷과 비교해 수정된 경우에만
  // updateExamMeta 로 실제 반영한다(미수정이면 호출 생략).
  const metaRef = useRef(meta);
  // 렌더 중 ref 쓰기 금지(react-hooks/refs) — 매 커밋 후 동기화. 아래
  // [resumeDraft] effect 보다 먼저 선언돼 같은 커밋에서 항상 최신값이 읽힌다.
  useEffect(() => {
    metaRef.current = meta;
  });
  const resumeBaselineRef = useRef<ExamMetaValue | null>(null);
  useEffect(() => {
    draftIdRef.current = resumeDraft ? resumeDraft.id : null;
    // 허브가 setResumeDraft 와 메타 프리필(setMeta)을 같은 핸들러에서 배치하므로
    // 이 effect 시점의 meta 는 프리필 반영 후 값이다.
    resumeBaselineRef.current = resumeDraft ? { ...metaRef.current } : null;
  }, [resumeDraft]);

  // 언마운트 시 살아있는 objectURL 정리.
  const slotsRef = useRef<UploadSlot[]>([]);
  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);
  useEffect(() => {
    return () => {
      for (const s of slotsRef.current) {
        try {
          URL.revokeObjectURL(s.previewUrl);
        } catch {
          /* already revoked */
        }
      }
    };
  }, []);

  const busy =
    phase === "ingesting" || phase === "uploading" || phase === "attaching";

  const addFiles = useCallback(
    async (fileList: FileList | File[]) => {
      if (busy) return;
      const files = Array.from(fileList);
      if (files.length === 0) return;

      const pdfs = files.filter((f) => f.type === "application/pdf");
      const imgs = files.filter((f) => f.type.startsWith("image/"));

      if (pdfs.length > 1) {
        toast.error("PDF는 한 번에 1개만 올릴 수 있습니다.");
        return;
      }
      if (pdfs.length === 1 && imgs.length > 0) {
        toast.error("PDF와 이미지는 함께 올릴 수 없습니다.");
        return;
      }
      if (pdfs.length === 0 && imgs.length === 0) {
        toast.error("이미지(PNG/JPG/WEBP) 또는 PDF만 올릴 수 있습니다.");
        return;
      }

      // PDF 분할.
      if (pdfs.length === 1) {
        if (sourceKind === "IMAGE" || slots.length > 0) {
          toast.error("이미 추가된 페이지가 있습니다. 초기화 후 PDF를 올려 주세요.");
          return;
        }
        const file = pdfs[0];
        if (file.size > MAX_PDF_BYTES) {
          toast.error("PDF가 너무 큽니다(최대 50MB).");
          return;
        }
        setPhase("ingesting");
        try {
          const clientSlots = await splitPdfToImages(file);
          if (clientSlots.length > MAX_PAGES) {
            revokeSlotUrls(clientSlots);
            toast.error(`최대 ${MAX_PAGES}페이지까지 지원합니다.`);
            setPhase("idle");
            return;
          }
          const next = toUploadSlots(clientSlots);
          setSlots(next);
          setSelectedSlotId(next[0]?.id ?? null);
          setSourceKind("PDF");
        } catch (err) {
          toast.error((err as Error).message);
        }
        setPhase("idle");
        return;
      }

      // 이미지 추가(기존에 이어 붙임).
      if (sourceKind === "PDF") {
        toast.error("이미 PDF를 올렸습니다. 초기화 후 이미지를 올려 주세요.");
        return;
      }
      if (slots.length + imgs.length > MAX_PAGES) {
        toast.error(`최대 ${MAX_PAGES}페이지까지 지원합니다.`);
        return;
      }
      setPhase("ingesting");
      try {
        const clientSlots = await imagesToSlots(imgs);
        const added = toUploadSlots(clientSlots);
        setSlots((prev) => [...prev, ...added]);
        // 방금 추가한 첫 페이지를 미리보기로 — 뭘 올렸는지 바로 확인.
        setSelectedSlotId(added[0]?.id ?? null);
        setSourceKind("IMAGE");
      } catch (err) {
        toast.error((err as Error).message);
      }
      setPhase("idle");
    },
    [busy, slots.length, sourceKind],
  );

  const removeSlot = useCallback((id: string) => {
    setSlots((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target) {
        try {
          URL.revokeObjectURL(target.previewUrl);
        } catch {
          /* ignore */
        }
      }
      const next = prev.filter((s) => s.id !== id);
      if (next.length === 0) setSourceKind(null);
      return next;
    });
  }, []);

  const moveSlot = useCallback((index: number, dir: -1 | 1) => {
    setSlots((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setSlots((prev) => {
      for (const s of prev) {
        try {
          URL.revokeObjectURL(s.previewUrl);
        } catch {
          /* ignore */
        }
      }
      return [];
    });
    setSourceKind(null);
    setSelectedSlotId(null);
    // 이어서 등록 중이면 DRAFT id 는 유지(사진만 다시 고르는 경우).
    if (!resumeDraft) draftIdRef.current = null;
  }, [resumeDraft]);

  // 성공 후 패널 초기화 — 슬롯/진행/draft. 메타 리셋은 허브(onStarted) 몫.
  const resetAfterStart = useCallback(() => {
    setSlots((prev) => {
      for (const s of prev) {
        try {
          URL.revokeObjectURL(s.previewUrl);
        } catch {
          /* ignore */
        }
      }
      return [];
    });
    setSourceKind(null);
    setSelectedSlotId(null);
    setPhase("idle");
    setProgress({ uploaded: 0, total: 0 });
    setErrorMsg(null);
    draftIdRef.current = null;
  }, []);

  const handleStart = useCallback(async () => {
    if (!meta.title.trim()) {
      toast.error("시험 제목을 입력해 주세요.");
      return;
    }
    if (slots.length === 0) {
      toast.error("시험지 페이지를 추가해 주세요.");
      return;
    }
    // (플로우 개편) 학생 동시 등록 제거 — 인테이크는 빈 시험지 분석 단일 경로.
    // 학생은 분석 완료 후 보드 카드의 "학생 추가"에서 등록한다. 서버 액션
    // (attachExamSources)의 firstStudentName 파라미터는 옵셔널로 유지(하위호환).

    setErrorMsg(null);
    setPhase("uploading");
    setProgress({ uploaded: 0, total: slots.length });
    try {
      let id = draftIdRef.current;
      if (!id) {
        const created = await createExamAnalysis(
          metaToCreateInput(meta, sourceKind ?? "IMAGE"),
        );
        id = created.id;
        draftIdRef.current = id;
      } else if (
        resumeBaselineRef.current &&
        !isMetaEqual(meta, resumeBaselineRef.current)
      ) {
        // (결함수리) 이어서 등록에서 사용자가 메타를 수정한 경우 — 여기서 반영하지
        // 않으면 입력이 통째로 유실되고 폴 도착 후 카드가 원래 메타로 뒤집힌다.
        // attach 전에 version(CAS)을 1회 조회해 updateExamMeta 로 저장하고,
        // VERSION_CONFLICT 등 실패 시 토스트 후 진행을 중단한다.
        const verRes = await fetch(`/api/exam-report/analyses/${id}`, {
          credentials: "include",
          cache: "no-store",
        });
        const verData = verRes.ok
          ? ((await verRes.json()) as { analysis?: { version?: number } })
          : null;
        const version = verData?.analysis?.version;
        if (typeof version !== "number") {
          toast.error("시험 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
          setPhase("idle");
          return;
        }
        const yearNum = meta.examYear.trim() ? Number(meta.examYear.trim()) : null;
        const metaRes = await updateExamMeta(
          id,
          {
            title: meta.title.trim(),
            schoolName: meta.schoolName.trim() || null,
            grade: meta.grade.trim() || null,
            examType: meta.examType,
            examYear: yearNum != null && Number.isFinite(yearNum) ? yearNum : null,
            semester: meta.semester.trim() || null,
          },
          version,
        );
        if (!metaRes.ok) {
          toast.error(
            "시험 정보를 저장하지 못했습니다. 다른 곳에서 수정되었을 수 있어요. 새로고침 후 다시 시도해 주세요.",
          );
          setPhase("idle");
          return;
        }
        // 성공분을 스냅샷에 반영 — 이후 업로드 단계가 실패해 재시도해도 같은
        // 메타를 중복 갱신(자기 자신과의 CAS 충돌)하지 않게 한다.
        resumeBaselineRef.current = { ...meta };
      }

      const pages = await uploadSlots({
        analysisId: id,
        slots,
        onProgress: (uploaded, total) => setProgress({ uploaded, total }),
      });

      setPhase("attaching");
      const attached = await attachExamSources(id, { pages });
      if (!attached.ok) {
        console.error("[exam-report] 사진 첨부 실패:", attached.error);
        setErrorMsg("시험지 사진을 등록하지 못했어요. 잠시 후 다시 시도해 주세요.");
        setPhase("error");
        return;
      }

      // 분석 시작 — await 금지. 서버 자가연쇄가 완주하므로 클라는 대기 없이
      // 허브 보드 폴링이 진행 상황을 그린다(리다이렉트 없음). 402 크레딧 부족만
      // fireAnalyzeRequest 내부에서 에러 토스트로 알리고, 그 외 응답/실패는 무시.
      fireAnalyzeRequest(id);
      toast.success(
        "분석이 시작되었습니다. 아래 목록에서 진행 상황을 확인하세요.",
      );
      resetAfterStart();
      // hasStudent 는 항상 false — 시그니처는 허브(hub-client) 호환을 위해 유지.
      onStarted(id, { hasStudent: false });
    } catch (err) {
      console.error("[exam-report] 등록 요청 오류:", err);
      setErrorMsg("시험지 사진을 등록하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setPhase("error");
    }
  }, [meta, slots, sourceKind, onStarted, resetAfterStart]);

  return {
    slots,
    phase,
    progress,
    errorMsg,
    selectedSlotId,
    setSelectedSlotId,
    busy,
    addFiles,
    removeSlot,
    moveSlot,
    clearAll,
    handleStart,
  };
}
