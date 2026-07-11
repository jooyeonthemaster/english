"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ImageIcon, Palette, ShoppingBasket, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  MobileStepHeader,
  MobileStepNav,
  useIsMobileViewport,
} from "@/components/workbench/mobile-step-flow";
import { triggerHintGlowWithin } from "@/lib/hint-glow";
import { createWorkbenchPassage } from "@/actions/workbench";
import { FormSection } from "@/components/workbench/passage-registration/sections/form-section";
import { useTaskQueue } from "@/components/workbench/task-queue";
import { usePassageLibrary } from "@/components/workbench/passage-registration/use-passage-library";
import { formatExtractedTextForDisplay } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/utils/display-text";
import { PassageCardGrid } from "@/app/(director)/director/workbench/generate/passage-card-grid";
import { ExamPassageLibrary } from "@/components/workbench/exam-passage-library";
import { KoreanExamPassageLibrary } from "@/components/workbench/korean-exam-passage-library";
import type { KoExamPick } from "@/components/workbench/korean-exam-passage-library/use-korean-exam-passage-library";
import type { ExamPassagePick } from "@/lib/exam-passages/types";
import { ExtractionDetailModal } from "@/app/(director)/director/workbench/generate/intake/extraction-detail-modal";
import { ExtractionLoadingCards } from "@/app/(director)/director/workbench/generate/intake/extraction-loading-cards";
import {
  useGenerateExtraction,
  type ExtractionPromotedResult,
} from "@/app/(director)/director/workbench/generate/intake/use-generate-extraction";
import type { PassageItem } from "@/app/(director)/director/workbench/generate/generate-page-types";
import {
  isPristineEmptyRow,
  makeRowFromSavedPassage,
  MIN_CONTENT_CHARS,
  type PassageInputRow,
} from "@/components/workbench/passage-registration/passage-input/types";
import {
  IntakeView,
  IntakeTab,
} from "@/app/(director)/director/workbench/generate/intake/intake-surface";
import {
  DEFAULT_WEBTOON_IMAGE_PLAN,
  type WebtoonImagePlanId,
} from "@/lib/webtoon-models";
import {
  DEFAULT_WEBTOON_LANGUAGE,
  styleLabel,
  WEBTOON_LANGUAGES,
  type WebtoonLanguageId,
  type WebtoonStyleId,
} from "./webtoon-page-types";
import { useWebtoonState } from "./use-webtoon-state";
import {
  WebtoonInputStack,
  type WebtoonRowOptions,
} from "./webtoon-input-stack";
import { WebtoonLibraryClient } from "./library/library-page-client";
import type { CollectionItem } from "@/components/workbench/shared/types";

interface WebtoonPageClientProps {
  academyId: string;
  collections: CollectionItem[];
  collectionMembership: Record<string, Set<string>>;
  subjectScope?: "KOREAN";
}

// ── 모바일 스텝 플로우 (<lg 전용) ──
// 한 화면 = 한 기능: 지문 입력 → 내 지문함 → 워크스페이스 → 웹툰 확인.
// 문제 생성 페이지와 동형. PC(≥lg)는 기존 통합 레이아웃 그대로 — 숨김은 전부
// max-lg:/lg:hidden 이라 데스크톱 DOM·동작에는 영향이 없다.
type MobileStep = "input" | "library" | "workspace" | "results";
const MOBILE_FLOW_STEPS = [
  { key: "input", label: "지문 입력" },
  { key: "library", label: "내 지문함" },
  { key: "workspace", label: "워크스페이스" },
  { key: "results", label: "웹툰 확인" },
] as const;

/** Build a passage title from the first non-empty line of typed content. */
function derivePastedTitle(content: string): string {
  const firstLine = (
    content.split(/\r?\n/).find((l) => l.trim().length > 0) || content
  ).trim();
  const words = firstLine.split(/\s+/).filter(Boolean).slice(0, 8).join(" ");
  const base = words || "직접 입력 지문";
  return base.length > 60 ? base.slice(0, 60) + "…" : base;
}

export function WebtoonPageClient({
  academyId,
  collections: webtoonCollections,
  collectionMembership: webtoonCollectionMembership,
  subjectScope,
}: WebtoonPageClientProps) {
  // ─── 지문 입력 스택 (내 지문함에서 불러온 지문 = 행) ───
  const [rows, setRows] = useState<PassageInputRow[]>([]);
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // ─── '생성한 웹툰' 섹션 헤더 높이 — 임베드된 보관함의 폴더/툴바 sticky 오프셋
  //     기준점. 헤더·폴더·툴바가 한 덩어리로 상단고정되도록 높이를 측정해 내려준다. ───
  const [webtoonHeaderHeight, setWebtoonHeaderHeight] = useState(0);
  const webtoonHeaderCleanup = useRef<(() => void) | null>(null);
  const webtoonHeaderRef = useCallback((el: HTMLDivElement | null) => {
    webtoonHeaderCleanup.current?.();
    webtoonHeaderCleanup.current = null;
    if (!el) return;
    const update = () =>
      setWebtoonHeaderHeight(Math.ceil(el.getBoundingClientRect().height));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    webtoonHeaderCleanup.current = () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  // ─── 웹툰 옵션 ───
  const [plan, setPlan] = useState<WebtoonImagePlanId>(
    DEFAULT_WEBTOON_IMAGE_PLAN,
  );
  const [style, setStyle] = useState<WebtoonStyleId>("KOREAN_WEBTOON");
  const [language, setLanguage] = useState<WebtoonLanguageId>(
    DEFAULT_WEBTOON_LANGUAGE,
  );
  const [customPrompt, setCustomPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  // ─── 모바일 전용: 지문별 '담긴 유형'(유형 선택 완료) 옵션 ───
  // 모바일 스텝 플로우에서 각 지문 카드 모달이 '즉시 생성' 대신 여기에 옵션을
  // 담는다. 담긴 지문들은 하단 '웹툰 N개 생성'에서 각자의 옵션으로 일괄 생성된다.
  // PC 는 이 상태를 쓰지 않는다(모달이 즉시 생성 — 무영향).
  const [rowWebtoonOptions, setRowWebtoonOptions] = useState<
    Record<string, WebtoonRowOptions>
  >({});
  const handleSaveRowOptions = useCallback(
    (localId: string, opts: WebtoonRowOptions) => {
      setRowWebtoonOptions((prev) => ({ ...prev, [localId]: opts }));
    },
    [],
  );
  const clearRowWebtoonOptions = useCallback((localId: string) => {
    setRowWebtoonOptions((prev) => {
      if (!(localId in prev)) return prev;
      const next = { ...prev };
      delete next[localId];
      return next;
    });
  }, []);
  // 유형이 담긴 행 localId 집합 — 카드 담김 배지용.
  const configuredRowIds = useMemo(
    () => new Set(Object.keys(rowWebtoonOptions)),
    [rowWebtoonOptions],
  );

  // 새 웹툰을 큐잉한 뒤 임베드된 보관함(WebtoonLibraryClient)을 새로고침하는 신호.
  const [webtoonRefreshSignal, setWebtoonRefreshSignal] = useState(0);

  // ─── 폼 접기 ───
  const [formCollapsed, setFormCollapsed] = useState(false);

  // ─── 웹툰 큐 (DB 폴링) — 생성 트리거 + 상단 배지(생성 중·실패) 용도 ───
  const { items: queue, handleBatchGenerate } = useWebtoonState({
    academyId,
    subjectScope,
  });

  const queueCounts = useMemo(
    () => ({
      generating: queue.filter(
        (q) => q.status === "PENDING" || q.status === "GENERATING",
      ).length,
      done: queue.filter((q) => q.status === "COMPLETED").length,
      error: queue.filter((q) => q.status === "FAILED").length,
    }),
    [queue],
  );

  // ─── Intake (직접 입력 · 파일업로드 › 내 지문함 › 워크스페이스) ───
  const [intakeView, setIntakeView] = useState<IntakeView>("library");
  const [intakeTab, setIntakeTab] = useState<IntakeTab>("paste");

  // ─── 모바일 스텝 플로우(<lg 전용) — PC 무영향 ───
  // ?step= 딥링크/복원. 워크스페이스는 메모리 기반이라 새로 열면 항상 비어
  // 있으므로 지문함으로 대체한다(문제 생성과 동일).
  const searchParams = useSearchParams();
  const initialMobileStepRef = useRef<MobileStep>(
    (() => {
      const raw = searchParams.get("step");
      if (raw === "input" || raw === "library" || raw === "results") return raw;
      if (raw === "workspace") return "library";
      return "input";
    })(),
  );
  const [mobileStep, setMobileStep] = useState<MobileStep>(
    initialMobileStepRef.current,
  );
  // 워크스페이스/내 지문함 스텝 하단 고정 장바구니 펼침 상태.
  const [workspaceCartOpen, setWorkspaceCartOpen] = useState(false);
  const [libraryCartOpen, setLibraryCartOpen] = useState(false);
  // 직접 입력 보드 연동 — 하단 고정 바 '다음'이 등록(다음으로 내 지문함) 버튼을
  // 대신한다. ref 로 시작 동작을, 콜백으로 누적 수·작업 상태를 받는다.
  const pasteStartRef = useRef<(() => void) | null>(null);
  const [pasteBoard, setPasteBoard] = useState({ count: 0, busy: false });
  const handlePasteBoardState = useCallback(
    (state: { count: number; busy: boolean }) => setPasteBoard(state),
    [],
  );

  // ─── 내 지문함 라이브러리 (학습지 생성과 동일한 저장 지문 intake) ───
  const showLibrary = useCallback(() => setIntakeView("library"), []);
  // subjectScope 를 실어 picker(내 지문함)를 국어 지문(subject='KOREAN')으로 좁힌다.
  // 직접입력 저장/새 폴더도 국어로 스코프된다. 미전달(영어)은 기존 동작 그대로.
  const library = usePassageLibrary({
    academyId,
    onShowLibrary: showLibrary,
    subjectScope,
  });
  const {
    passages,
    filteredPassages,
    filterOptions,
    collections,
    loadingPassages,
    passageStatusCounts,
    activeFilterCount,
    passageSearch,
    setPassageSearch,
    filterSchool,
    setFilterSchool,
    filterGrade,
    setFilterGrade,
    filterSemester,
    setFilterSemester,
    analysisStatusFilter,
    setAnalysisStatusFilter,
    passageSortOrder,
    setPassageSortOrder,
    selectedCollectionId,
    setSelectedCollectionId,
    passageBulkAction,
    selectedIds,
    setSelectedIds,
    toggleCheckbox,
    selectAll,
    deselectAll,
    freshAnalysisPassageIds,
    acknowledgeFreshAnalysisPassage,
    applyExtractionPromotion,
    pasteSaving,
    handleCreatePastedPassages,
    loadPassages,
    handleCreatePassageCollection,
    handleCopySelectedPassagesToCollection,
    handleCopyPassagesToCollection,
    handleMovePassagesToCollection,
    handleMoveSelectedPassagesToCollection,
    handleRemoveSelectedPassagesFromCollection,
    handleDeleteSelectedPassages,
  } = library;

  // ─── 워크스페이스 (지문 입력 스택) — 자료함 위 오버레이 ───
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const workspaceActive = useMemo(
    () => rows.some((r) => !isPristineEmptyRow(r)),
    [rows],
  );
  // 워크스페이스에 이미 담긴 Passage id — 내 지문함 카드 '담김' 표시.
  const workspacePassageIds = useMemo(
    () =>
      new Set(
        rows
          .map((r) => r.passageId)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    [rows],
  );

  // ─── Load saved passages on mount ───
  useEffect(() => {
    void loadPassages();
  }, [loadPassages]);

  // ─── 내 지문함 선택 → 워크스페이스로 불러오기 ───
  // 저장된 Passage 를 입력 스택에 행으로 담는다. passageId 를 함께 실어, 웹툰
  // 생성 시 그 Passage 를 재사용(중복 생성 방지)한다.
  const handleLoadSelectedToWorkspace = useCallback(() => {
    const selected = passages.filter((p) => selectedIds.has(p.id));
    if (selected.length === 0) {
      toast.error("'내 지문함'에서 워크스페이스로 보낼 지문을 먼저 선택하세요.");
      return;
    }
    const prev = rowsRef.current;
    const existing = new Set(
      prev.map((r) => r.passageId).filter((id): id is string => !!id),
    );
    const incoming = selected
      .filter((p) => !existing.has(p.id))
      .map((p) =>
        makeRowFromSavedPassage({
          passageId: p.id,
          title: p.title,
          content: formatExtractedTextForDisplay(p.content),
          source: p.source ?? null,
          collapsed: false,
        }),
      );
    if (incoming.length === 0) {
      toast.info("선택한 지문은 이미 워크스페이스에 있습니다.");
      setWorkspaceOpen(true);
      return;
    }
    const wasActive = prev.some((r) => !isPristineEmptyRow(r));
    const base = prev.length === 1 && isPristineEmptyRow(prev[0]) ? [] : prev;
    const next = [...base, ...incoming];
    rowsRef.current = next;
    setRows(next);
    setSelectedIds(new Set());
    setWorkspaceOpen(true);
    setFormCollapsed(false);
    toast.success(
      (wasActive
        ? `지문 ${incoming.length}개를 워크스페이스에 추가했어요.`
        : `지문 ${incoming.length}개를 워크스페이스에 담았어요.`) +
        " 화풍·언어를 설정해 웹툰을 생성하세요.",
    );
  }, [passages, selectedIds, setSelectedIds]);

  // ── 수능·모평 기출 지문 → 내 지문함 일괄 등록 (문제생성과 동일 메커니즘) ──
  // 등록 후 목록 재조회 → 새 지문 선택 → 내 지문함(library) 뷰로 전환. 이어서 왼쪽
  // 내 지문함에서 '불러오기'로 워크스페이스(지문 입력 스택)에 담아 웹툰을 만든다.
  const [examImporting, setExamImporting] = useState(false);
  // 국어 라우트 — 국어 기출 코퍼스 id 를 국어 전용 액션으로 지문함(subject=KOREAN) 등록.
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
              ? `기출 지문 ${created.length}개를 내 지문함에 담았어요. (이미 등록된 ${skipped}개 제외)`
              : `기출 지문 ${created.length}개를 내 지문함에 담았어요.`,
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
    [
      loadPassages,
      setPassageSearch,
      setSelectedCollectionId,
      setAnalysisStatusFilter,
      setSelectedIds,
    ],
  );
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
              ? `기출 지문 ${created.length}개를 내 지문함에 담았어요. (이미 등록된 ${skipped}개 제외)`
              : `기출 지문 ${created.length}개를 내 지문함에 담았어요.`,
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
    [
      loadPassages,
      setPassageSearch,
      setSelectedCollectionId,
      setAnalysisStatusFilter,
      setSelectedIds,
    ],
  );

  const { triggerRefresh, setScope } = useTaskQueue();

  // ─── Extraction (이미지·PDF) — 학습지와 동일하게 자동 승격 후 내 지문함 반영 ───
  const clearExtractionPendingRef = useRef<(jobId: string) => void>(() => {});
  const handleExtractionPromoted = useCallback(
    ({ passageIds, jobId, complete }: ExtractionPromotedResult) => {
      applyExtractionPromotion(passageIds);
      void loadPassages().then(() => {
        if (complete) clearExtractionPendingRef.current(jobId);
      });
      toast.success(
        complete
          ? "추출된 지문이 '내 지문함'에 추가됐어요. 선택해 워크스페이스로 보내세요."
          : "일부 지문이 '내 지문함'에 추가됐어요. 나머지는 계속 처리 중입니다.",
      );
    },
    [applyExtractionPromotion, loadPassages],
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

  const handleExtractionBegin = useCallback(
    (id: string, count: number) => {
      beginExtractionJob(id, count);
      setIntakeView("library");
      setScope("extraction");
    },
    [beginExtractionJob, setScope],
  );
  const handleExtractionResult = useCallback(
    (id: string, jobId: string | null) => {
      if (jobId) {
        attachExtractionJob(id, jobId);
        triggerRefresh();
      } else {
        failExtractionJob(id);
      }
    },
    [attachExtractionJob, failExtractionJob, triggerRefresh],
  );

  // ─── 카드 '상세 보기' → 지문 상세 모달 ───
  const [detailPassage, setDetailPassage] = useState<PassageItem | null>(null);
  // 방금 상세를 열어본 지문 id — 모달을 닫아도 유지해, 닫는 순간 카드를 한 번 반짝인다.
  const [lastViewedPassageId, setLastViewedPassageId] = useState<string | null>(
    null,
  );
  const handleViewPassageContent = useCallback((passage: PassageItem) => {
    setDetailPassage(passage);
    setLastViewedPassageId(passage.id);
  }, []);
  const openDetailById = useCallback(
    (passageId: string) => {
      const p = passages.find((x) => x.id === passageId);
      if (p) {
        setDetailPassage(p);
        setLastViewedPassageId(p.id);
      }
    },
    [passages],
  );

  // ─── 웹툰 생성 액션: 지문 카드 1개 → Passage 저장(또는 재사용) → 웹툰 큐잉 ───
  // 문제 생성 워크스페이스처럼 각 지문이 자기 설정(화풍·언어·지시)으로 따로 생성된다.
  const handleGenerateRow = useCallback(
    async (
      localId: string,
      opts: {
        plan: WebtoonImagePlanId;
        style: WebtoonStyleId;
        language: WebtoonLanguageId;
        customPrompt: string;
      },
    ): Promise<boolean> => {
      const row = rowsRef.current.find((r) => r.localId === localId);
      if (!row) return false;
      const text = row.content.trim();
      if (text.length < MIN_CONTENT_CHARS) {
        toast.error(`지문을 ${MIN_CONTENT_CHARS}자 이상 입력해주세요.`);
        return false;
      }
      if (generating) return false;
      setGenerating(true);

      try {
        const title = row.title.trim() || derivePastedTitle(text);
        // 내 지문함에서 불러온 행은 이미 저장된 Passage 이므로 재사용한다.
        let passageId = row.passageId;
        if (!passageId) {
          // 국어 라우트에서 워크스페이스에 직접 입력한 지문은 subject='KOREAN' 으로
          // 저장돼야 한다 — 그래야 생성된 웹툰(passage.subject 기준 스코프)이 국어
          // 보관함에 남고 영어 지문 목록에 새지 않는다. createWorkbenchPassage 는
          // subject 를 받지 않으므로(passages 유닛 소유), 국어 생성 페이지와 동일한
          // subject-aware 액션(createDirectInputPassageMaterial)을 쓴다. 영어(미전달)
          // 경로는 기존 createWorkbenchPassage 그대로(source·draft 링크 보존, 무회귀).
          if (subjectScope === "KOREAN") {
            const { createDirectInputPassageMaterial } = await import(
              "@/actions/workbench"
            );
            const result = await createDirectInputPassageMaterial({
              title,
              content: text,
              subject: "KOREAN",
            });
            if (!result.success || !result.id) {
              toast.error(result.error || "지문 등록에 실패했습니다.");
              return false;
            }
            passageId = result.id;
          } else {
            const result = await createWorkbenchPassage({
              title,
              content: text,
              source: row.source?.trim() || undefined,
              sourceDraftId: row.sourceDraftId ?? undefined,
              // 국어 웹툰 라우트 등록이면 Passage.subject="KOREAN" 태깅.
              subject: subjectScope,
            });
            if (!result.success || !result.id) {
              toast.error(result.error || "지문 등록에 실패했습니다.");
              return false;
            }
            passageId = result.id;
          }
        }

        const queued = await handleBatchGenerate(
          [{ id: passageId, title, content: text }],
          opts.style,
          opts.customPrompt,
          opts.language,
          opts.plan,
        );
        // 큐잉이 성공했을 때만 이 행을 워크스페이스에서 비운다. 실패하면
        // (네트워크/크레딧 부족 등) 작성한 지문을 보존해 바로 재시도할 수 있게 한다.
        if (queued > 0) {
          const next = rowsRef.current.filter((r) => r.localId !== localId);
          rowsRef.current = next;
          setRows(next);
          if (next.length === 0) {
            setWorkspaceOpen(false);
            setIntakeView("library");
          }
          void loadPassages();
          triggerRefresh();
          setWebtoonRefreshSignal((n) => n + 1);
          return true;
        }
        return false;
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "웹툰 생성 중 오류가 발생했습니다.",
        );
        return false;
      } finally {
        setGenerating(false);
      }
    },
    [generating, handleBatchGenerate, loadPassages, triggerRefresh, subjectScope],
  );

  // ─── 유형이 담긴 모든 지문을 한 번에 웹툰 생성 (모바일 워크스페이스 스텝 CTA) ───
  // 각 지문이 '담긴 유형'(rowWebtoonOptions)대로 순차 생성된다. 성공 시
  // handleGenerateRow 가 그 행을 워크스페이스에서 비우고, 담긴 유형도 정리한다.
  const handleGenerateAllRows = useCallback(async () => {
    const targets = rowsRef.current
      .filter(
        (r) =>
          r.content.trim().length >= MIN_CONTENT_CHARS &&
          !!rowWebtoonOptions[r.localId],
      )
      .map((r) => ({ localId: r.localId, opts: rowWebtoonOptions[r.localId] }));
    for (const { localId, opts } of targets) {
      const ok = await handleGenerateRow(localId, opts);
      if (ok) clearRowWebtoonOptions(localId);
    }
  }, [handleGenerateRow, rowWebtoonOptions, clearRowWebtoonOptions]);

  // ═══ 모바일 스텝 플로우: 전환 + URL(?step=) 동기화 ═══
  const isMobileViewport = useIsMobileViewport();

  // 스텝이 가리키는 인테이크 상태를 함께 맞춘다. results 는 하단 결과 섹션만
  // 보여주므로 인테이크 상태를 건드리지 않는다(뒤로가면 그대로 복귀).
  const applyMobileStep = useCallback((step: MobileStep) => {
    setMobileStep(step);
    if (step === "input") {
      setWorkspaceOpen(false);
      setIntakeView("intake");
    } else if (step === "library") {
      setWorkspaceOpen(false);
      setIntakeView("library");
    } else if (step === "workspace") {
      setWorkspaceOpen(true);
    }
  }, []);

  const pushMobileStepUrl = useCallback((step: MobileStep) => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("step") === step) return;
    url.searchParams.set("step", step);
    // router.push 대신 네이티브 pushState — 서버 리페치 없이 히스토리만 쌓아
    // 브라우저 뒤로가기가 '이전 단계'로 동작하게 한다.
    window.history.pushState(null, "", url.toString());
  }, []);

  const goToMobileStep = useCallback(
    (step: MobileStep) => {
      applyMobileStep(step);
      pushMobileStepUrl(step);
      window.scrollTo({ top: 0 });
    },
    [applyMobileStep, pushMobileStepUrl],
  );

  // 모바일 최초 진입 — 초기 스텝(기본 '지문 입력' 또는 ?step 딥링크)을 적용한다.
  // 이 페이지의 intakeView 기본값은 'library'(PC 는 내 지문함으로 시작)라, 이
  // 보정이 없으면 파생 동기화가 모바일을 곧장 2번(내 지문함) 스텝으로 밀어버린다.
  // isMobileViewport 게이트라 PC 에는 절대 실행되지 않는다(PC 무영향).
  const mobileInitDone = useRef(false);
  useEffect(() => {
    if (!isMobileViewport || mobileInitDone.current) return;
    mobileInitDone.current = true;
    applyMobileStep(initialMobileStepRef.current);
  }, [isMobileViewport, applyMobileStep]);

  // 브라우저 뒤로/앞으로 — URL 의 step 을 그대로 적용.
  useEffect(() => {
    if (!isMobileViewport) return;
    const onPop = () => {
      const raw = new URLSearchParams(window.location.search).get("step");
      const step: MobileStep =
        raw === "library" || raw === "workspace" || raw === "results"
          ? raw
          : "input";
      applyMobileStep(step);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [isMobileViewport, applyMobileStep]);

  // 기존 UI 동작('불러오기' CTA, 워크스페이스 자동 열림/닫힘 등)이
  // intakeView/workspaceOpen 을 바꾸면 스텝을 뒤따라 맞춘다 — 스텝을 모르는
  // 기존 핸들러를 하나도 고치지 않기 위한 단방향 동기화. results 에서는
  // 인테이크 상태가 화면 밖(숨김)이므로 동기화하지 않는다.
  useEffect(() => {
    if (!isMobileViewport) return;
    if (mobileStep === "results") return;
    const derived: MobileStep = workspaceOpen
      ? "workspace"
      : intakeView === "library"
        ? "library"
        : "input";
    if (derived !== mobileStep) {
      setMobileStep(derived);
      pushMobileStepUrl(derived);
      window.scrollTo({ top: 0 });
    }
  }, [isMobileViewport, workspaceOpen, intakeView, mobileStep, pushMobileStepUrl]);

  // ── 모바일 하단 이전/다음 바 구성 ──
  const mobilePrev: { label: string; onClick: () => void } | null =
    mobileStep === "input"
      ? null
      : {
          label: "이전",
          onClick: () =>
            goToMobileStep(
              mobileStep === "library"
                ? "input"
                : mobileStep === "workspace"
                  ? "library"
                  : workspaceActive
                    ? "workspace"
                    : "library",
            ),
        };

  // 담긴 지문 중 '생성 가능한'(내용 충분) 행 = 유형을 담아야 하는 대상.
  const workspaceValidRows = rows.filter(
    (r) => r.content.trim().length >= MIN_CONTENT_CHARS,
  );
  // 그중 유형까지 담긴(설정 완료) 행. 문제 생성처럼 '모든' 담긴 지문이 유형을
  // 담아야 하단 '웹툰 N개 생성'이 활성화된다.
  const configuredValidRows = workspaceValidRows.filter(
    (r) => !!rowWebtoonOptions[r.localId],
  );
  const allRowsConfigured =
    workspaceValidRows.length > 0 &&
    configuredValidRows.length === workspaceValidRows.length;
  const hasSessionWebtoons =
    queueCounts.generating > 0 || queueCounts.done > 0 || queueCounts.error > 0;

  const mobileNext = (() => {
    if (mobileStep === "input") {
      // 직접 입력 탭에 등록할 지문이 쌓여 있으면 '다음' = 등록하고 내 지문함.
      if (
        intakeTab === "paste" &&
        intakeView === "intake" &&
        pasteBoard.count > 0
      )
        return {
          label: pasteBoard.busy
            ? "등록 중…"
            : `다음으로 (내 지문함) · 지문 ${pasteBoard.count}개`,
          onClick: () => pasteStartRef.current?.(),
          disabled: pasteBoard.busy,
        };
      return {
        label: "내 지문함으로",
        onClick: () => goToMobileStep("library"),
      };
    }
    if (mobileStep === "library") {
      // 선택한 지문이 있으면 '다음'이 곧 워크스페이스 담기 — PC 의 '불러오기'와
      // 같은 핸들러. 담기 성공 시 workspaceOpen 이 켜지고 동기화 효과가 스텝을 넘긴다.
      if (selectedIds.size > 0)
        return {
          label: `선택 ${selectedIds.size}개 워크스페이스로`,
          onClick: () => handleLoadSelectedToWorkspace(),
        };
      if (workspaceActive)
        return {
          label: "워크스페이스로",
          onClick: () => goToMobileStep("workspace"),
        };
      // 비활 사유 = 선택 0개 → 눌러도 막지 말고 지문 카드들을 글로우해 선택 유도.
      return {
        label: "워크스페이스로",
        disabled: true,
        onDisabledHint: () =>
          triggerHintGlowWithin(document.body, "[data-drag-item-id]", {
            max: 24,
            scrollBlock: "center",
          }),
      };
    }
    if (mobileStep === "workspace") {
      // ① 담긴 '모든' 지문이 유형을 담았으면 → 각자의 유형으로 한 번에 생성하고
      //    결과 스텝으로 이동(생성은 백그라운드, 결과 섹션이 폴링으로 진행 표시).
      if (allRowsConfigured)
        return {
          label: `웹툰 ${configuredValidRows.length}개 생성`,
          disabled: generating,
          onClick: () => {
            void handleGenerateAllRows();
            goToMobileStep("results");
          },
        };
      // ② 일부 지문만 유형을 담음 → 비활성. 눌러도 막지 말고 유형을 아직 안 담은
      //    지문의 '유형 선택하고 지문 담기' 버튼을 글로우해 남은 유형 담기를 유도한다.
      if (workspaceValidRows.length > 0 && configuredValidRows.length > 0) {
        const remaining =
          workspaceValidRows.length - configuredValidRows.length;
        return {
          label: `${remaining}개 지문에 유형을 더 담아주세요`,
          disabled: true,
          onDisabledHint: () =>
            triggerHintGlowWithin(
              document.body,
              "[data-webtoon-configure-button]",
              { scrollBlock: "center" },
            ),
        };
      }
      // ③ 생성 가능한 지문이 있는데 아직 아무 유형도 안 담음 → 비활성. 담기 버튼 글로우.
      if (workspaceValidRows.length > 0)
        return {
          label: "웹툰 생성",
          disabled: true,
          onDisabledHint: () =>
            triggerHintGlowWithin(
              document.body,
              "[data-webtoon-configure-button]",
              { scrollBlock: "center" },
            ),
        };
      // ④ 생성 가능한 지문은 없지만 이번 세션 생성물이 있으면 → 결과 보기.
      if (hasSessionWebtoons)
        return {
          label: queueCounts.generating > 0 ? "웹툰 확인 (생성 중)" : "웹툰 확인",
          onClick: () => goToMobileStep("results"),
        };
      // ⑤ 담긴 지문도 없고 생성물도 없음 → 비활성. 지문 편집기를 글로우해 입력/추가 유도.
      return {
        label: "웹툰 생성",
        disabled: true,
        onDisabledHint: () =>
          triggerHintGlowWithin(document.body, "[data-webtoon-row]", {
            scrollBlock: "center",
          }),
      };
    }
    return null;
  })();
  const mobileNextHint =
    mobileStep === "library" && selectedIds.size === 0 && !workspaceActive
      ? "지문 카드를 선택하면 워크스페이스로 보낼 수 있어요"
      : undefined;

  // 파일업로드·직접입력·기출 탭(지문 입력 스텝)에서는 각 보드가 자체 하단 고정
  // 액션 바를 렌더하므로, 중복되는 공용 스텝 네비를 숨기고 그 높이만큼 아래
  // 여백을 예약한다(고정 바에 콘텐츠가 가리지 않게).
  const boardFixedFooterActive =
    mobileStep === "input" &&
    intakeView === "intake" &&
    (intakeTab === "upload" || intakeTab === "paste" || intakeTab === "exam");

  // ── 내 지문함(library) 하단 고정 '담긴 지문'(선택한 지문) 장바구니 ──
  const librarySelectedPassages = passages.filter((p) => selectedIds.has(p.id));
  const libraryCart = (
    <>
      {libraryCartOpen && librarySelectedPassages.length > 0 ? (
        <div className="flex max-h-[38vh] min-h-0 flex-col border-b border-slate-100 bg-slate-50/70">
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {librarySelectedPassages.map((p, i) => (
              <div
                key={p.id}
                className="mb-1.5 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 last:mb-0"
              >
                <span className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-blue-600 text-[10.5px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-700">
                  {p.title?.trim() || "제목 없는 지문"}
                </span>
                <button
                  type="button"
                  onClick={() => toggleCheckbox(p.id)}
                  aria-label="선택에서 빼기"
                  className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setLibraryCartOpen((open) => !open)}
        aria-expanded={libraryCartOpen}
        aria-label={
          libraryCartOpen ? "담긴 지문 목록 접기" : "담긴 지문 목록 펼치기"
        }
        className="flex w-full shrink-0 items-center gap-2.5 border-b border-slate-100 bg-white px-3 py-2 text-left"
      >
        <span className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <ShoppingBasket className="size-5" aria-hidden="true" />
          {librarySelectedPassages.length > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-white">
              {librarySelectedPassages.length}
            </span>
          ) : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[12.5px] font-bold text-slate-900">
            담긴 지문 {librarySelectedPassages.length}개
          </span>
          <span className="truncate text-[10.5px] text-slate-400">
            {librarySelectedPassages.length > 0
              ? "탭하여 담긴 지문 보기·빼기"
              : "지문 카드를 선택하면 여기 모여요"}
          </span>
        </span>
        <ChevronDown
          className={
            "size-4 shrink-0 text-slate-400 transition-transform" +
            (libraryCartOpen ? " rotate-180" : "")
          }
          aria-hidden="true"
        />
      </button>
    </>
  );

  // ── 워크스페이스 하단 고정 '담긴 유형' 장바구니 — 유형을 담은 지문별 빼기 ──
  // 문제 생성과 동형: 유형을 담은 지문이 여기 모이고, 빼면 그 지문의 담긴 유형만
  // 해제된다(지문 자체는 워크스페이스에 남는다).
  const workspaceConfiguredCartRows = workspaceValidRows
    .filter((r) => !!rowWebtoonOptions[r.localId])
    .map((r) => ({
      localId: r.localId,
      title: r.title,
      opts: rowWebtoonOptions[r.localId],
    }));
  const workspaceCart = (
    <>
      {workspaceCartOpen && workspaceConfiguredCartRows.length > 0 ? (
        <div className="flex max-h-[38vh] min-h-0 flex-col border-b border-slate-100 bg-slate-50/70">
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {workspaceConfiguredCartRows.map((r, i) => (
              <div
                key={r.localId}
                className="mb-1.5 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 last:mb-0"
              >
                <span className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-blue-600 text-[10.5px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[12px] font-medium text-slate-700">
                    {r.title?.trim() || "제목 없는 지문"}
                  </span>
                  <span className="truncate text-[10.5px] text-slate-400">
                    {styleLabel(r.opts.style)} ·{" "}
                    {WEBTOON_LANGUAGES.find((l) => l.id === r.opts.language)
                      ?.short ?? ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => clearRowWebtoonOptions(r.localId)}
                  aria-label="담은 유형 빼기"
                  className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setWorkspaceCartOpen((open) => !open)}
        aria-expanded={workspaceCartOpen}
        aria-label={
          workspaceCartOpen ? "담긴 유형 목록 접기" : "담긴 유형 목록 펼치기"
        }
        className="flex w-full shrink-0 items-center gap-2.5 border-b border-slate-100 bg-white px-3 py-2 text-left"
      >
        <span className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <ShoppingBasket className="size-5" aria-hidden="true" />
          {workspaceConfiguredCartRows.length > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-white">
              {workspaceConfiguredCartRows.length}
            </span>
          ) : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[12.5px] font-bold text-slate-900">
            담긴 유형 {workspaceConfiguredCartRows.length}/
            {workspaceValidRows.length}지문
          </span>
          <span className="truncate text-[10.5px] text-slate-400">
            {workspaceConfiguredCartRows.length > 0
              ? "탭하여 담긴 유형 보기·빼기"
              : "지문마다 ‘유형 담기’로 담으면 여기 모여요"}
          </span>
        </span>
        <ChevronDown
          className={
            "size-4 shrink-0 text-slate-400 transition-transform" +
            (workspaceCartOpen ? " rotate-180" : "")
          }
          aria-hidden="true"
        />
      </button>
    </>
  );

  return (
    <TooltipProvider>
      {/* min-h 뷰포트 채움은 PC 전용 — 모바일은 콘텐츠만큼만 차지해 아래 사이트
          푸터 위 빈 공간을 없앤다. */}
      <div className="-m-6 min-w-0 bg-[#F4F6F9] px-4 py-4 sm:px-6 lg:min-h-[calc(100vh-56px)] xl:px-8">
        <main
          className={
            "flex w-full min-w-0 flex-col gap-4 " +
            // 하단 고정 바에 콘텐츠가 가리지 않게 스텝별 여백 예약(모바일 전용).
            // 보드 자체 고정 바가 있는 입력 탭은 그 높이만, 장바구니가 얹히는
            // 내 지문함·워크스페이스는 더 두껍게 예약한다.
            (boardFixedFooterActive
              ? "max-lg:pb-[140px]"
              : mobileStep === "library" || mobileStep === "workspace"
                ? "max-lg:pb-[150px]"
                : "max-lg:pb-1")
          }
        >
          {/* 모바일 전용 스테퍼 — 현재 단계 표시 + 탭으로 즉시 이동 */}
          <MobileStepHeader
            steps={MOBILE_FLOW_STEPS}
            currentKey={mobileStep}
            onSelect={(key) => goToMobileStep(key as MobileStep)}
          />
          {/* ─── 직접 입력 · 파일업로드 › 내 지문함 › 워크스페이스 (액션=웹툰 생성) ───
              모바일 '웹툰 확인' 스텝에서는 이 섹션을 숨기고(언마운트 아님 — 입력·
              워크스페이스 상태 유지) 아래 결과 섹션만 보여준다. */}
          <div
            className={
              "min-w-0" + (mobileStep === "results" ? " max-lg:hidden" : "")
            }
          >
          <FormSection
            academyId={academyId}
            formCollapsed={formCollapsed}
            setFormCollapsed={setFormCollapsed}
            title="웹툰 생성"
            description="자료를 불러오거나 직접 입력한 지문을 한 장의 세로형 웹툰으로 생성합니다."
            titleIcon={Palette}
            libraryLabel="내 지문함"
            examBrowser={
              subjectScope === "KOREAN" ? (
                <KoreanExamPassageLibrary
                  onPick={handleImportKoreanExamPassages}
                  busy={examImporting}
                  pickLabel="다음으로 (내 지문함)"
                  mobileFixedFooter
                />
              ) : (
                <ExamPassageLibrary
                  onPick={handleImportExamPassages}
                  busy={examImporting}
                  pickLabel="다음으로 (내 지문함)"
                  headerHint="고른 지문이 내 지문함에 담겨요"
                  enableWebtoonDownloads
                  // 모바일: '다음으로 (내 지문함)' 선택 바를 하단 고정(공용 스텝
                  // 네비 대체). boardFixedFooterActive 가 exam 탭에서 공용 네비를
                  // 숨기므로 이 고정 바가 그 자리를 대신한다.
                  mobileFixedFooter
                />
              )
            }
            rightPane={
              <div className="flex min-h-0 flex-1 flex-col">
                <WebtoonInputStack
                  rows={rows}
                  setRows={setRows}
                  saving={generating}
                  plan={plan}
                  setPlan={setPlan}
                  style={style}
                  setStyle={setStyle}
                  language={language}
                  setLanguage={setLanguage}
                  customPrompt={customPrompt}
                  setCustomPrompt={setCustomPrompt}
                  onGenerateRow={handleGenerateRow}
                  onAddPassage={() => {
                    setWorkspaceOpen(false);
                    setIntakeView("library");
                  }}
                  // 모바일: 모달이 '즉시 생성' 대신 '유형 담기'로 동작(PC 무영향).
                  isMobile={isMobileViewport}
                  configuredRowIds={configuredRowIds}
                  rowOptions={rowWebtoonOptions}
                  onSaveRowOptions={handleSaveRowOptions}
                />
              </div>
            }
            intakeView={intakeView}
            setIntakeView={setIntakeView}
            intakeTab={intakeTab}
            setIntakeTab={setIntakeTab}
            onExtractionBegin={handleExtractionBegin}
            onExtractionResult={handleExtractionResult}
            extractionPending={extractionPending}
            onSubmitPastedRows={handleCreatePastedPassages}
            pasteSaving={pasteSaving}
            // 모바일 스텝 플로우(<lg 전용): 입력 스텝에서만 소스 탭 노출, 그 외
            // 스텝은 하단 스텝 네비가 이동을 담당하므로 탭을 숨긴다.
            mobileStepTabs={mobileStep === "input" ? "sources" : "hidden"}
            pasteStartRef={pasteStartRef}
            onPasteStateChange={handlePasteBoardState}
            workspaceOpen={workspaceOpen}
            setWorkspaceOpen={setWorkspaceOpen}
            workspaceActive={workspaceActive}
            library={
              <PassageCardGrid
                loadingCards={
                  <ExtractionLoadingCards pending={extractionPending} />
                }
                passages={passages}
                filteredPassages={filteredPassages}
                filterOptions={filterOptions}
                collections={collections}
                loadingPassages={loadingPassages}
                passageSearch={passageSearch}
                setPassageSearch={setPassageSearch}
                filterSchool={filterSchool}
                setFilterSchool={setFilterSchool}
                filterGrade={filterGrade}
                setFilterGrade={setFilterGrade}
                filterSemester={filterSemester}
                setFilterSemester={setFilterSemester}
                analysisStatusFilter={analysisStatusFilter}
                setAnalysisStatusFilter={setAnalysisStatusFilter}
                passageSortOrder={passageSortOrder}
                setPassageSortOrder={setPassageSortOrder}
                passageStatusCounts={passageStatusCounts}
                activeFilterCount={activeFilterCount}
                selectedCollectionId={selectedCollectionId}
                setSelectedCollectionId={setSelectedCollectionId}
                selectedIds={selectedIds}
                setSelectedIds={setSelectedIds}
                toggleCheckbox={toggleCheckbox}
                selectAll={selectAll}
                deselectAll={deselectAll}
                onCopySelectedToCollection={
                  handleCopySelectedPassagesToCollection
                }
                onMoveSelectedToCollection={
                  handleMoveSelectedPassagesToCollection
                }
                onMovePassagesToCollection={handleMovePassagesToCollection}
                onCopyPassagesToCollection={handleCopyPassagesToCollection}
                onCreateCollection={handleCreatePassageCollection}
                onRemoveSelectedFromCollection={
                  handleRemoveSelectedPassagesFromCollection
                }
                onDeleteSelectedPassages={handleDeleteSelectedPassages}
                passageBulkAction={passageBulkAction}
                genMode="manual"
                totalQuestions={0}
                handleBatchGenerate={handleLoadSelectedToWorkspace}
                freshAnalysisPassageIds={freshAnalysisPassageIds}
                onFreshAnalysisAcknowledged={acknowledgeFreshAnalysisPassage}
                onEditSelected={handleLoadSelectedToWorkspace}
                workspacePassageIds={workspacePassageIds}
                workspaceActive={workspaceActive}
                handleOpenAnalysisModal={openDetailById}
                onViewPassageContent={handleViewPassageContent}
                lastViewedPassageId={lastViewedPassageId}
                openPassageDetailId={detailPassage?.id ?? null}
              />
            }
          />
          </div>

          {/* ─── 생성한 웹툰 ─── */}
          {/* 모바일에서는 '웹툰 확인' 스텝에서만 노출한다(마운트는 유지 — 웹툰 큐
              폴링·상태 보존). PC(≥lg)는 항상 노출(무영향). */}
          <section
            className={
              "flex min-w-0 flex-col rounded-lg border border-slate-200 bg-white shadow-sm" +
              (mobileStep !== "results" ? " max-lg:hidden" : "")
            }
          >
            <div
              ref={webtoonHeaderRef}
              className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 rounded-t-lg border-b border-slate-100 bg-white px-4 py-3"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                  <ImageIcon className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[14px] font-bold text-slate-900">
                    생성한 웹툰
                  </h2>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {queueCounts.error > 0 && (
                  <Badge className="border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50">
                    실패 {queueCounts.error}
                  </Badge>
                )}
              </div>
            </div>

            {/* 폴더창 + 필터 + 그리드 — 웹툰 관리(보관함)와 동일한 경험을 임베드 */}
            <WebtoonLibraryClient
              embedded
              stickyTopOffset={webtoonHeaderHeight}
              academyId={academyId}
              collections={webtoonCollections}
              collectionMembership={webtoonCollectionMembership}
              subjectScope={subjectScope}
              refreshSignal={webtoonRefreshSignal}
            />
          </section>

          {/* 모바일 전용 하단 고정 이전/다음 바. 입력 스텝의 파일업로드·직접입력·
              기출 탭은 각 보드가 자체 고정 바를 렌더하므로 공용 네비를 숨긴다. */}
          {!boardFixedFooterActive ? (
            <MobileStepNav
              prev={mobilePrev}
              next={mobileNext}
              hint={mobileNextHint}
              cart={
                mobileStep === "library"
                  ? libraryCart
                  : mobileStep === "workspace"
                    ? workspaceCart
                    : undefined
              }
            />
          ) : null}
        </main>
      </div>

      {/* ─── 지문 상세 모달 — 원문/복원문/복원 근거. 페이지를 떠나지 않고 뜬다. ─── */}
      {detailPassage && (
        <ExtractionDetailModal
          passage={detailPassage}
          onClose={() => setDetailPassage(null)}
          onPassageAnalyzed={() => {
            void loadPassages();
          }}
          onPassageSaved={() => {
            void loadPassages();
          }}
        />
      )}

    </TooltipProvider>
  );
}
