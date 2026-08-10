"use client";

// 지문 등록/가져오기(인테이크) 클러스터 — generate-page-client.tsx 에서 추출.
// 직접 입력(붙여넣기) 일괄 등록, 영어·국어 기출 지문 일괄 등록, 이미지/PDF
// 추출 완료 → 지문 승격 후처리, 신규 지문 글로우 확인/인라인 분석 반영을
// 담당한다. 코드는 바이트 동일 이동(무회귀).

import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import { mergeKoKindIntoTags } from "@/lib/korean/core/passage-meta";
import { dispatchGenerateTourMilestone } from "@/lib/generate-tour-demo";
import { type PassageAnalysisStatusFilter } from "./generate-page-types";
import { type IntakeView } from "./intake/intake-surface";
import type { PastedPassageInput } from "./intake/multi-passage-paste";
import type { ExamPassagePick } from "@/lib/exam-passages/types";
import type { KoExamPick } from "@/components/workbench/korean-exam-passage-library/use-korean-exam-passage-library";

interface UsePassageIntakeParams {
  loadPassages: () => Promise<void>;
  patchPassages: (passageIds: string[]) => Promise<void>;
  derivePastedTitle: (content: string) => string;
  setPassageSearch: Dispatch<SetStateAction<string>>;
  setSelectedCollectionId: Dispatch<SetStateAction<string>>;
  setAnalysisStatusFilter: Dispatch<SetStateAction<PassageAnalysisStatusFilter>>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  setIntakeView: Dispatch<SetStateAction<IntakeView>>;
  setFreshAnalysisPassageIds: Dispatch<SetStateAction<Set<string>>>;
  setFreshLearningPassageIds: Dispatch<SetStateAction<Set<string>>>;
  setRecentExtractionPassageIds: Dispatch<SetStateAction<string[]>>;
}

export function usePassageIntake({
  loadPassages,
  patchPassages,
  derivePastedTitle,
  setPassageSearch,
  setSelectedCollectionId,
  setAnalysisStatusFilter,
  setSelectedIds,
  setIntakeView,
  setFreshAnalysisPassageIds,
  setFreshLearningPassageIds,
  setRecentExtractionPassageIds,
}: UsePassageIntakeParams) {
  const [pasteSaving, setPasteSaving] = useState(false);

  // Persist N pasted passages (1번·2번·N) as real Passages (academy-scoped,
  // "직접 입력") AND register each as 추출된 자료, then select them all so the
  // user can generate right away. Loops the proven single-passage action so the
  // shared SourceMaterial/ExtractionJob lineage stays identical; passageOrder is
  // assigned sequentially per academy by the action. They show up in 추출된 자료
  // 관리 / 학습지 생성 / 분석된 학습지 관리 lists immediately.
  const handleCreatePastedPassages = useCallback(
    async (rows: PastedPassageInput[]) => {
      const cleaned = rows
        .map((r) => ({
          title: r.title.trim(),
          content: r.content.trim(),
          // 국어 직접입력(opt-in) — 과목·갈래를 서버 액션까지 동봉한다.
          subject: r.subject,
          koKind: r.koKind,
        }))
        .filter((r) => r.content.length >= 20);
      if (cleaned.length === 0) {
        toast.error("지문이 너무 짧습니다. 최소 20자 이상 입력해주세요.");
        return false;
      }
      setPasteSaving(true);
      try {
        const { createDirectInputPassageMaterial } =
          await import("@/actions/workbench");
        const createdIds: string[] = [];
        // Sequential (not parallel): the action assigns passageOrder = last+1,
        // so concurrent calls could collide on the (jobId, passageOrder) unique.
        for (const r of cleaned) {
          const title = r.title || derivePastedTitle(r.content);
          const result = await createDirectInputPassageMaterial({
            title,
            content: r.content,
            // 국어 지문 — 과목별 버킷 + Passage.subject 저장 + 갈래 태그(KO_KIND:*).
            // 영어(미지정)는 파라미터 자체를 보내지 않아 기존 경로 그대로.
            ...(r.subject === "KOREAN"
              ? {
                  subject: "KOREAN" as const,
                  ...(r.koKind
                    ? { tags: mergeKoKindIntoTags([], r.koKind) }
                    : {}),
                }
              : {}),
          });
          if (result?.success && result.id) createdIds.push(result.id);
        }
        if (createdIds.length === 0) {
          toast.error("지문 등록에 실패했습니다.");
          return false;
        }

        // Refetch the academy passage list in place so the new passages become
        // canonical PassageItems (no full reload), then reset filters that would
        // hide freshly pasted (미분석) cards, select all of them, and flip to the
        // library so the user sees them land.
        await loadPassages();
        setPassageSearch("");
        setSelectedCollectionId("");
        setAnalysisStatusFilter("all");
        setSelectedIds(new Set(createdIds));
        setIntakeView("library");
        toast.success(
          createdIds.length === cleaned.length
            ? `${createdIds.length}개 지문이 등록되었습니다. 유형·난이도를 설정해 문제를 생성하세요.`
            : `${createdIds.length}/${cleaned.length}개 지문이 등록되었습니다. 일부는 실패했습니다.`,
        );
        return true;
      } catch {
        toast.error("지문 등록 중 오류가 발생했습니다.");
        return false;
      } finally {
        setPasteSaving(false);
      }
    },
    [loadPassages],
  );

  // ── 수능·모평 기출 지문 → 내 지문함 일괄 등록 ──
  // 기출 브라우저에서 고른 지문(picks)을 id 만 서버로 보내 등록(본문은 서버가
  // 코퍼스에서 해석). 직접 입력과 같은 후처리: 목록 재조회 → 새 지문 선택 → 내
  // 지문함으로 전환. 멱등(이미 등록분은 서버가 건너뜀).
  const [examImporting, setExamImporting] = useState(false);
  const handleImportExamPassages = useCallback(
    async (picks: ExamPassagePick[]) => {
      if (!picks || picks.length === 0) return false;
      setExamImporting(true);
      try {
        const { importExamPassages } = await import("@/actions/workbench");
        const result = await importExamPassages(picks.map((p) => p.id));
        if (!result.success) {
          toast.error(result.error || "기출 지문 등록에 실패했습니다.");
          return false;
        }
        const created = result.createdIds;
        const skipped = result.skippedExamIds.length;

        await loadPassages();
        setPassageSearch("");
        setSelectedCollectionId("");
        setAnalysisStatusFilter("all");

        if (created.length > 0) {
          setSelectedIds(new Set(created));
          setIntakeView("library");
          toast.success(
            skipped > 0
              ? `기출 지문 ${created.length}개를 내 지문함에 담았어요. (이미 등록된 ${skipped}개 제외) 유형·난이도를 설정해 문제를 생성하세요.`
              : `기출 지문 ${created.length}개를 내 지문함에 담았어요. 유형·난이도를 설정해 문제를 생성하세요.`,
          );
        } else if (skipped > 0) {
          setIntakeView("library");
          toast.info("선택한 기출 지문은 이미 내 지문함에 있어요.");
        }
        return true;
      } catch {
        toast.error("기출 지문 등록 중 오류가 발생했습니다.");
        return false;
      } finally {
        setExamImporting(false);
      }
    },
    [loadPassages],
  );

  // ── 국어 기출 지문 → 내 지문함(subject=KOREAN) 일괄 등록 ──
  // 영어 handleImportExamPassages 의 국어 대칭. 국어 코퍼스 id 를 국어 전용 액션으로
  // 보내 Passage(subject=KOREAN)+KO_KIND 태그로 등록한다. 후처리는 동일.
  const handleImportKoreanExamPassages = useCallback(
    async (picks: KoExamPick[]) => {
      if (!picks || picks.length === 0) return false;
      setExamImporting(true);
      try {
        const { importKoreanExamPassages } = await import("@/actions/workbench");
        const result = await importKoreanExamPassages(picks.map((p) => p.id));
        if (!result.success) {
          toast.error(result.error || "기출 지문 등록에 실패했습니다.");
          return false;
        }
        const created = result.createdIds;
        const skipped = result.skippedExamIds.length;

        await loadPassages();
        setPassageSearch("");
        setSelectedCollectionId("");
        setAnalysisStatusFilter("all");

        if (created.length > 0) {
          setSelectedIds(new Set(created));
          setIntakeView("library");
          toast.success(
            skipped > 0
              ? `기출 지문 ${created.length}개를 내 지문함에 담았어요. (이미 등록된 ${skipped}개 제외) 유형·난이도를 설정해 문제를 생성하세요.`
              : `기출 지문 ${created.length}개를 내 지문함에 담았어요. 유형·난이도를 설정해 문제를 생성하세요.`,
          );
        } else if (skipped > 0) {
          setIntakeView("library");
          toast.info("선택한 기출 지문은 이미 내 지문함에 있어요.");
        }
        return true;
      } catch {
        toast.error("기출 지문 등록 중 오류가 발생했습니다.");
        return false;
      } finally {
        setExamImporting(false);
      }
    },
    [loadPassages],
  );

  // ── Image/PDF extraction completion → drafts promoted to Passages ──
  // Refetch the list in place so the new passages appear as cards, drop the
  // job's loading cards (after the real ones are loaded → seamless), flip to the
  // library, and offer "전체 선택" (opt-in, not auto — avoids a huge batch).
  const clearExtractionPendingRef = useRef<(jobId: string) => void>(() => {});
  const handleExtractionPromoted = useCallback(
    ({
      passageIds,
      jobId,
      partial,
      expectedCount,
      resolvedCount,
      complete,
    }: {
      passageIds: string[];
      jobId: string;
      partial: boolean;
      expectedCount: number;
      resolvedCount: number;
      complete: boolean;
    }) => {
      // 알림·화면 전환은 즉시 — 목록 재조회(RTT)를 기다리지 않는다. 추출 중
      // 로딩 카드 제거만 실제 카드가 로드된 뒤(then)로 미뤄 깜빡임을 막는다.
      setPassageSearch("");
      setSelectedCollectionId("");
      setAnalysisStatusFilter("all");
      setIntakeView("library");
      if (passageIds.length > 0) {
        setFreshAnalysisPassageIds((prev) => {
          const next = new Set(prev);
          passageIds.forEach((id) => next.add(id));
          return next;
        });
        // 새 배치를 앞에 두고, 배치 안에서는 추출 순서를 유지한다.
        setRecentExtractionPassageIds((prev) => [
          ...passageIds,
          ...prev.filter((id) => !passageIds.includes(id)),
        ]);
        dispatchGenerateTourMilestone("file-extraction-completed");
      }

      if (passageIds.length === 0) {
        toast.message(
          partial
            ? "일부 페이지만 추출됐어요. 작업 큐에서 확인하세요."
            : "추출은 끝났지만 등록할 지문이 없습니다.",
        );
      } else if (!complete) {
        const missing = Math.max(1, expectedCount - resolvedCount);
        toast.warning(
          `추출된 지문 ${resolvedCount}/${expectedCount}개만 등록됐습니다. 남은 ${missing}개는 작업 큐 또는 자료 관리에서 확인해주세요.`,
          {
            action: {
              label: "등록된 지문 선택",
              onClick: () => setSelectedIds(new Set(passageIds)),
            },
            duration: 14000,
          },
        );
      } else {
        toast.success(
          `추출된 ${passageIds.length}개 지문이 ‘내 지문’에 추가됐어요. 문제를 생성할 지문을 선택하세요.`,
          {
            action: {
              label: "전체 선택",
              onClick: () => setSelectedIds(new Set(passageIds)),
            },
            duration: 12000,
          },
        );
      }

      void loadPassages().then(() => {
        if (complete) {
          clearExtractionPendingRef.current(jobId);
        }
      });
    },
    [loadPassages],
  );

  const acknowledgeFreshAnalysisPassage = useCallback((passageId: string) => {
    setFreshAnalysisPassageIds((prev) => {
      if (!prev.has(passageId)) return prev;
      const next = new Set(prev);
      next.delete(passageId);
      return next;
    });
    setFreshLearningPassageIds((prev) => {
      if (!prev.has(passageId)) return prev;
      const next = new Set(prev);
      next.delete(passageId);
      return next;
    });
  }, []);

  const handleInlinePassageAnalyzed = useCallback(
    async (passageId: string) => {
      await patchPassages([passageId]);
      setFreshLearningPassageIds((prev) => {
        const next = new Set(prev);
        next.add(passageId);
        return next;
      });
    },
    [patchPassages],
  );

  return {
    pasteSaving,
    handleCreatePastedPassages,
    examImporting,
    handleImportExamPassages,
    handleImportKoreanExamPassages,
    clearExtractionPendingRef,
    handleExtractionPromoted,
    acknowledgeFreshAnalysisPassage,
    handleInlinePassageAnalyzed,
  };
}
