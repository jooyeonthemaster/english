"use client";

// ============================================================================
// 클래스 스튜디오 워크벤치 — 중앙 「지문관리」 인테이크 클러스터 (스펙 §3.1.2)
//
// library-pane.tsx 의 보조 훅. 직접 입력(붙여넣기·AI 지문 생성이 같은
// onSubmitRows 로 흘러온다) · 기출 지문 가져오기 · 이미지/PDF 추출 승격 후처리 ·
// 폴더 이름변경/폴더에서 빼기를 담당한다(추출 검수 배선은 §3.10.15 E14 로
// 폐기 — 스튜디오에 검수 표면 자체가 없다). 배선 정본은 use-passage-intake.ts — 단
// 스튜디오는 TaskQueueProvider 가 없어 작업 드로어 연동만 뺐고, 문구는 §10
// 합니다체로 통일했다.
//
// 신규 등록 자동 담기(스펙 정본 + §3.8.3 기출 확장): 붙여넣기·AI 생성·추출
// 승격·기출 가져오기로 지문이 등록될 때 클래스가 선택돼 있으면
// onRegisterToClass 를 이어 호출하고 토스트에 명시한다. 서버는 멱등(이미
// 등록분은 건너뜀).
// ============================================================================

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import {
  removePassagesFromCollection,
  updatePassageCollection,
} from "@/actions/workbench";
import {
  useGenerateExtraction,
  type ExtractionPromotedResult,
} from "@/app/(director)/director/workbench/generate/intake/use-generate-extraction";
import { derivePastedTitle } from "@/app/(director)/director/workbench/generate/generate-page-client-lib";
import type {
  PassageAnalysisStatusFilter,
  PassageCollectionItem,
} from "@/app/(director)/director/workbench/generate/generate-page-types";
import type { PastedPassageInput } from "@/app/(director)/director/workbench/generate/intake/multi-passage-paste";
import type { ImportExamPassagesResult } from "@/actions/workbench/exam-passages";
import type { ExamPassagePick } from "@/lib/exam-passages/types";
import { isDraftPseudoId } from "@/lib/extraction/draft-passage-id";
import type { LibraryClassCtx } from "./library-pane";

interface UseLibraryPaneIntakeArgs {
  classCtx: LibraryClassCtx | null;
  onRegisterToClass: (
    passageIds: string[],
    opts?: { skipRefresh?: boolean },
  ) => Promise<number>;
  onLibraryChanged: () => void;
  /** 인테이크 표면을 '지문관리' 뷰로 전환. */
  showLibrary: () => void;
  loadPassages: () => Promise<void>;
  /** 추출 완료 후처리(필터 해제·글로우·최근 고정·지문관리 전환) — 훅 제공분. */
  applyExtractionPromotion: (passageIds: string[]) => void;
  setCollections: Dispatch<SetStateAction<PassageCollectionItem[]>>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  setPassageSearch: (v: string) => void;
  setSelectedCollectionId: (v: string) => void;
  setAnalysisStatusFilter: (v: PassageAnalysisStatusFilter) => void;
}

export function useLibraryPaneIntake({
  classCtx,
  onRegisterToClass,
  onLibraryChanged,
  showLibrary,
  loadPassages,
  applyExtractionPromotion,
  setCollections,
  setSelectedIds,
  setPassageSearch,
  setSelectedCollectionId,
  setAnalysisStatusFilter,
}: UseLibraryPaneIntakeArgs) {
  // ── 신규 등록 자동 담기 — 클래스 미선택이면 0 을 돌려주는 무해 경로 ──
  const registerNewToClass = useCallback(
    async (
      passageIds: string[],
      opts?: { skipRefresh?: boolean },
    ): Promise<number> => {
      if (!classCtx || passageIds.length === 0) return 0;
      return onRegisterToClass(passageIds, opts);
    },
    [classCtx, onRegisterToClass],
  );

  // ── 직접 입력(붙여넣기·AI 지문 생성 공용 경로) ──────────────────────────────
  // 정본: passage-registration usePassageLibrary 의 등록 루프 — 액션이
  // passageOrder=last+1 을 매기므로 순차 호출(병렬 금지, unique 충돌).
  const [pasteSaving, setPasteSaving] = useState(false);
  const handleCreatePastedPassages = useCallback(
    async (rows: PastedPassageInput[]) => {
      const cleaned = rows
        .map((r) => ({ title: r.title.trim(), content: r.content.trim() }))
        .filter((r) => r.content.length >= 20);
      if (cleaned.length === 0) {
        toast.error("지문이 너무 짧습니다. 최소 20자 이상 입력해 주세요.");
        return false;
      }
      setPasteSaving(true);
      try {
        const { createDirectInputPassageMaterial } = await import(
          "@/actions/workbench"
        );
        const createdIds: string[] = [];
        for (const r of cleaned) {
          const result = await createDirectInputPassageMaterial({
            title: r.title || derivePastedTitle(r.content),
            content: r.content,
          });
          if (result?.success && result.id) createdIds.push(result.id);
        }
        if (createdIds.length === 0) {
          toast.error("지문 등록에 실패했습니다.");
          return false;
        }

        // 자동 담기(스펙 §3.1.2) — 목록 재조회 전에 등록해 트리 갱신과 겹치지 않게.
        const added = await registerNewToClass(createdIds);

        await loadPassages();
        setPassageSearch("");
        setSelectedCollectionId("");
        setAnalysisStatusFilter("all");
        setSelectedIds(new Set(createdIds));
        showLibrary();

        const base =
          createdIds.length === cleaned.length
            ? `${createdIds.length}개 지문을 '지문관리'에 등록했습니다.`
            : `${createdIds.length}/${cleaned.length}개 지문을 등록했습니다. 일부는 실패했습니다.`;
        toast.success(
          classCtx && added > 0
            ? `${base} 「${classCtx.className}」에도 담았습니다.`
            : base,
        );
        onLibraryChanged();
        return true;
      } catch {
        toast.error("지문 등록 중 오류가 발생했습니다.");
        return false;
      } finally {
        setPasteSaving(false);
      }
    },
    [
      classCtx,
      loadPassages,
      onLibraryChanged,
      registerNewToClass,
      setAnalysisStatusFilter,
      setPassageSearch,
      setSelectedCollectionId,
      setSelectedIds,
      showLibrary,
    ],
  );

  // ── 수능·모평 기출 지문 → 지문관리 등록 (use-passage-intake 배선 미러) ──
  const [examImporting, setExamImporting] = useState(false);
  const handleImportExamPassages = useCallback(
    async (picks: ExamPassagePick[]) => {
      if (!picks || picks.length === 0) return false;
      setExamImporting(true);
      try {
        // 클래스를 고른 상태면 **지문함 등록 + 클래스 담기를 1왕복 합본 액션**
        // 으로 부른다 — 서버 액션은 직렬 처리라 두 번 부르면 왕복 2회가 그대로
        // 체감 지연이 된다(26-08-15 지연 수술). 클래스 미선택이면 종전 액션.
        const examIds = picks.map((p) => p.id);
        const result: ImportExamPassagesResult & { addedToClassCount: number } =
          classCtx
            ? await import("@/actions/studio/passages").then((m) =>
                m.importExamPassagesToStudioClass({
                  examPassageIds: examIds,
                  classId: classCtx.classId,
                }),
              )
            : await import("@/actions/workbench").then(async (m) => ({
                ...(await m.importExamPassages(examIds)),
                addedToClassCount: 0,
              }));
        if (!result.success) {
          toast.error(result.error || "기출 지문 등록에 실패했습니다.");
          return false;
        }
        const created = result.createdIds;
        const existing = result.existingIds ?? [];
        const skipped = result.skippedExamIds.length;

        // 클래스 자동 담기(스펙 §3.8.3)는 위 합본 액션이 같은 왕복에서 끝냈다.
        // 목록 재조회(`/api/passages/list` 전량, 실측 2.5초)는 **기다리지
        // 않는다** — 담기는 이미 끝났는데 CTA 스피너·토스트가 그 2.5초를 통째로
        // 붙들고 있었다(사용자 지적의 실체). 뷰 전환·토스트는 즉시, 새 지문
        // 선택만 목록 도착 시점에 얹는다(선택 대상이 그때 존재).
        const pickedIds = Array.from(new Set([...created, ...existing]));
        const listReload = loadPassages();
        const added = result.addedToClassCount;

        setPassageSearch("");
        setSelectedCollectionId("");
        setAnalysisStatusFilter("all");

        if (pickedIds.length > 0) {
          void listReload.then(() => setSelectedIds(new Set(pickedIds)));
          showLibrary();
          // 재담기 정책(2026-08-11): 이미 있던 기출은 서버가 담은 날짜(createdAt)를
          // 최신화해 목록 맨 앞으로 올린다 — 문구도 그 사실을 말한다.
          const base =
            created.length > 0
              ? skipped > 0
                ? `기출 지문 ${created.length}개를 지문관리에 담았습니다. (이미 있던 ${skipped}개는 담은 날짜를 최신으로 올렸습니다)`
                : `기출 지문 ${created.length}개를 지문관리에 담았습니다.`
              : `이미 담겨 있던 기출 지문 ${existing.length}개의 담은 날짜를 최신으로 올렸습니다.`;
          toast.success(
            classCtx && added > 0
              ? `${base} 「${classCtx.className}」에 ${added}개를 담았습니다.`
              : base,
          );
          onLibraryChanged();
        } else if (skipped > 0) {
          showLibrary();
          toast.info(
            "선택한 기출 지문은 이미 지문관리에 있어 담은 날짜만 최신으로 올렸습니다.",
          );
        }
        return true;
      } catch {
        toast.error("기출 지문 등록 중 오류가 발생했습니다.");
        return false;
      } finally {
        setExamImporting(false);
      }
    },
    [
      // registerNewToClass 는 더 이상 쓰지 않는다 — 클래스 담기는 합본 액션이
      // 같은 왕복에서 끝낸다(26-08-15 지연 수술).
      classCtx,
      loadPassages,
      onLibraryChanged,
      setAnalysisStatusFilter,
      setPassageSearch,
      setSelectedCollectionId,
      setSelectedIds,
      showLibrary,
    ],
  );

  // ── 이미지/PDF 추출 완료 → 지문 승격 후처리 ────────────────────────────────
  // clearPending 은 아래 useGenerateExtraction 반환값이라 이 콜백보다 늦게
  // 만들어진다 — 선례(use-passage-intake·custom-type-generate-panel)와 동일하게
  // ref 로 최신 참조를 이어준다(호출 시점 조회라 stale 없음).
  const clearExtractionPendingRef = useRef<(jobId: string) => void>(() => {});
  const handleExtractionPromoted = useCallback(
    ({
      passageIds,
      jobId,
      partial,
      expectedCount,
      resolvedCount,
      complete,
    }: ExtractionPromotedResult) => {
      // 필터 해제·글로우·최근 배치 고정·지문관리 전환은 훅 제공분이 처리한다.
      applyExtractionPromotion(passageIds);

      if (passageIds.length === 0) {
        toast.message(
          partial
            ? "일부 페이지만 추출되었습니다. 잠시 후 다시 확인해 주세요."
            : "추출은 끝났지만 등록할 지문이 없습니다.",
        );
      } else if (!complete) {
        const missing = Math.max(1, expectedCount - resolvedCount);
        toast.warning(
          `추출된 지문 ${resolvedCount}/${expectedCount}개만 등록되었습니다. 남은 ${missing}개는 자료 관리에서 확인해 주세요.`,
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
          `추출된 ${passageIds.length}개 지문을 '지문관리'에 추가했습니다. 학습을 만들 지문을 선택하세요.`,
          {
            action: {
              label: "전체 선택",
              onClick: () => setSelectedIds(new Set(passageIds)),
            },
            duration: 12000,
          },
        );
      }

      // 자동 담기(스펙 §3.1.2) — 성공 시 토스트에 명시. 멱등이라 재추출 dedup
      // 으로 이미 담긴 지문은 added 에 잡히지 않는다(그때는 조용히 넘어간다).
      if (passageIds.length > 0 && classCtx) {
        const className = classCtx.className;
        void registerNewToClass(passageIds).then((added) => {
          if (added > 0) {
            toast.success(`추출한 지문 ${added}개를 「${className}」에 담았습니다.`);
          }
        });
      }

      // 로딩 카드 제거는 실제 카드가 로드된 뒤(then) — 깜빡임 방지(정본 동작).
      void loadPassages().then(() => {
        if (complete) clearExtractionPendingRef.current(jobId);
        onLibraryChanged();
      });
    },
    [
      applyExtractionPromotion,
      classCtx,
      loadPassages,
      onLibraryChanged,
      registerNewToClass,
      setSelectedIds,
    ],
  );

  const {
    beginJob: beginExtractionJob,
    attachJob: attachExtractionJob,
    failJob: failExtractionJob,
    clearPending: clearExtractionPending,
    pending: extractionPending,
  } = useGenerateExtraction({ onPromoted: handleExtractionPromoted });

  useEffect(() => {
    clearExtractionPendingRef.current = clearExtractionPending;
  }, [clearExtractionPending]);

  // 추출 시작 즉시 '지문관리'으로 전환해 로딩 카드를 띄운다(정본 동작).
  const handleExtractionBegin = useCallback(
    (id: string, count: number) => {
      beginExtractionJob(id, count);
      showLibrary();
    },
    [beginExtractionJob, showLibrary],
  );
  const handleExtractionResult = useCallback(
    (id: string, jobId: string | null) => {
      if (jobId) attachExtractionJob(id, jobId);
      else failExtractionJob(id);
    },
    [attachExtractionJob, failExtractionJob],
  );

  // ── 폴더 보조(그리드 옵셔널 슬롯) — use-passage-collections 의 동작 미러 ──
  const handleRenameCollection = useCallback(
    async (collectionId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      // 낙관적 갱신 후 서버 반영(실패 시 토스트 + 재조회).
      setCollections((prev) =>
        prev
          .map((c) => (c.id === collectionId ? { ...c, name: trimmed } : c))
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, "ko")),
      );
      const result = await updatePassageCollection(collectionId, {
        name: trimmed,
      });
      if (!result?.success) {
        toast.error(result?.error || "폴더 이름을 바꾸지 못했습니다.");
        void loadPassages();
      }
    },
    [loadPassages, setCollections],
  );

  const [folderRemoveBusy, setFolderRemoveBusy] = useState(false);
  const handleRemovePassagesFromFolder = useCallback(
    async (passageIds: string[], collectionId: string) => {
      const ids = Array.from(new Set(passageIds)).filter(
        (id) => !isDraftPseudoId(id),
      );
      if (ids.length === 0 || !collectionId || folderRemoveBusy) return;
      setFolderRemoveBusy(true);
      try {
        const result = await removePassagesFromCollection(collectionId, ids);
        if (!result.success) {
          toast.error(result.error || "폴더에서 빼지 못했습니다.");
          return;
        }
        toast.success(`${ids.length}개 지문을 폴더에서 뺐습니다.`);
        void loadPassages();
      } finally {
        setFolderRemoveBusy(false);
      }
    },
    [folderRemoveBusy, loadPassages],
  );

  // 추출 검수 토글·일괄 검수완료 배선은 §3.10.15(E14)로 폐기 — 스튜디오에
  // 검수 표면(벌크 버튼·행 토글)이 사라져 소비처가 없다. 검수는 지문 등록·
  // 문제 생성 화면(공유 useExtractionReview)에 그대로 남는다.

  return {
    // 직접 입력(붙여넣기 + AI 지문 생성 공용)
    pasteSaving,
    handleCreatePastedPassages,
    // 기출
    examImporting,
    handleImportExamPassages,
    // 추출
    extractionPending,
    handleExtractionBegin,
    handleExtractionResult,
    // 폴더 보조
    handleRenameCollection,
    handleRemovePassagesFromFolder,
  };
}
