"use client";

// ============================================================================
// useCommit — constructs the `onCommit` callback that builds the payload,
// POSTs to /commit, and handles success / failure side-effects.
// Extracted from review-step.tsx during mechanical split.
// ============================================================================

import { useCallback } from "react";
import { toast } from "sonner";
import { getModeConfig } from "@/lib/extraction/modes";
import type {
  ExtractionPhase,
  LastCommitResult,
} from "@/lib/extraction/store";
import type {
  ExtractionItemSnapshot,
  ResultDraft,
} from "@/lib/extraction/types";
import { buildCommitPayload } from "./commit/build-payload";
import { extractFirstIssue } from "./commit/extract-issue";
import type { SourceMaterialDraft } from "./types";

interface UseCommitArgs {
  jobId: string | null;
  phase: ExtractionPhase;
  currentMode: ReturnType<typeof getModeConfig>["id"];
  items: ExtractionItemSnapshot[];
  drafts: ResultDraft[];
  sourceDraft: SourceMaterialDraft;
  originalFileName: string | null;
  setPhase: (p: ExtractionPhase) => void;
  setLastCommitResult: (r: LastCommitResult | null) => void;
  setCompletedAt: (iso: string | null) => void;
  setSelectedItemId: (id: string | null) => void;
}

export function useCommit(args: UseCommitArgs) {
  const {
    jobId,
    phase,
    currentMode,
    items,
    drafts,
    sourceDraft,
    originalFileName,
    setPhase,
    setLastCommitResult,
    setCompletedAt,
    setSelectedItemId,
  } = args;

  return useCallback(async () => {
    if (!jobId) return;
    // P0-7: 중복 호출 방어 — 이미 committing 중이면 무시.
    if (phase === "committing") return;
    setPhase("committing");
    try {
      const payload = buildCommitPayload({
        mode: currentMode,
        items,
        drafts,
        sourceDraft,
        originalFileName,
      });
      if (!payload) {
        toast.error("저장할 내용이 없습니다. 블록을 확인해 주세요.");
        setPhase("reviewing");
        return;
      }
      const res = await fetch(`/api/extraction/jobs/${jobId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      // P0-9: 응답을 한 번만 파싱한다 — 기존 코드는 `res.json()`을 두 번 호출해
      // 성공 케이스에서도 body가 비어 summary가 null이 되는 버그가 있었다.
      const parsed = (await res.json().catch(() => null)) as
        | {
            error?: string;
            code?: string;
            details?: unknown;
            createdPassageIds?: string[];
            createdQuestionIds?: string[];
            createdBundleIds?: string[];
            createdExamId?: string | null;
            sourceMaterialId?: string | null;
            collectionId?: string | null;
            skippedPassageIds?: string[];
            skippedQuestionIds?: string[];
            warning?: "DUPLICATE_SOURCE_MATERIAL";
          }
        | null;

      if (!res.ok) {
        // P0-9: 실패 시 details(ZodIssue[] 또는 구조화된 에러)의 첫 항목을 노출.
        // payload를 같이 넘겨 path → sourceItemId 역매핑을 활성화한다.
        const firstIssue = extractFirstIssue(parsed?.details, payload);
        const base = parsed?.error || "저장 실패";
        const message = firstIssue ? `${base} — ${firstIssue.label}` : base;
        toast.error(message, {
          description: firstIssue?.description,
        });
        // 문제 블록이 식별되면 자동 포커스.
        if (firstIssue?.itemId) {
          setSelectedItemId(firstIssue.itemId);
          const el = document.querySelector(
            `[data-item-id="${firstIssue.itemId}"]`,
          );
          if (el instanceof HTMLElement)
            el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        setPhase("reviewing");
        return;
      }

      // Persist the commit summary so DoneStep can deep-link into follow-up
      // actions (문제 생성 / 시험 조립 / 5-layer 분석 / 반 배포 등) with real
      // entity IDs.
      const skippedPassageIds = Array.isArray(parsed?.skippedPassageIds)
        ? parsed!.skippedPassageIds
        : [];
      const skippedQuestionIds = Array.isArray(parsed?.skippedQuestionIds)
        ? parsed!.skippedQuestionIds
        : [];
      const warning = parsed?.warning;
      setLastCommitResult({
        createdPassageIds: Array.isArray(parsed?.createdPassageIds)
          ? parsed!.createdPassageIds
          : [],
        createdQuestionIds: Array.isArray(parsed?.createdQuestionIds)
          ? parsed!.createdQuestionIds
          : [],
        createdBundleIds: Array.isArray(parsed?.createdBundleIds)
          ? parsed!.createdBundleIds
          : [],
        createdExamId: parsed?.createdExamId ?? null,
        sourceMaterialId: parsed?.sourceMaterialId ?? null,
        collectionId: parsed?.collectionId ?? null,
        skippedPassageIds,
        skippedQuestionIds,
        warning,
      });
      setCompletedAt(new Date().toISOString());
      toast.success("저장이 완료되었습니다.");
      // P1: 서버가 반환한 부가 상태(유지/중복)를 사용자에게 알린다.
      //  - skipped*Ids: 기존 편집본이 보존되어 덮어쓰지 않은 행들
      //  - warning === DUPLICATE_SOURCE_MATERIAL: 동일 시험지에 통합된 경우
      const keptCount = skippedPassageIds.length + skippedQuestionIds.length;
      if (keptCount > 0) {
        toast("기존 편집 내용을 보존하기 위해 일부 항목은 유지되었습니다.", {
          description: `유지된 항목 ${keptCount}개 · 새로 저장된 항목은 정상 등록되었습니다.`,
        });
      }
      if (warning === "DUPLICATE_SOURCE_MATERIAL") {
        toast(
          "동일한 시험지가 이미 등록되어 있어 기존 자료에 통합되었습니다.",
          {
            description:
              "새 SourceMaterial을 만드는 대신 기존 자료에 추가되었습니다.",
          },
        );
      }
      setPhase("done");
    } catch (e) {
      toast.error((e as Error).message);
      setPhase("reviewing");
    }
  }, [
    jobId,
    phase,
    currentMode,
    items,
    drafts,
    sourceDraft,
    originalFileName,
    setPhase,
    setLastCommitResult,
    setCompletedAt,
    setSelectedItemId,
  ]);
}
