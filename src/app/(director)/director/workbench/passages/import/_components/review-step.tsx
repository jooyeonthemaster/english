"use client";

// ============================================================================
// ReviewStep — block-level review surface for the bulk extraction pipeline.
//
// Layout (desktop, 1280px+):
//
//   ┌─ Header ───────────────────────────────────────────────────────────────┐
//   │ 리뷰 · <source title> · 모드 <M>     [임시저장]  [저장]                │
//   ├─────────────────┬────────────────────────┬────────────────────────────┤
//   │ BlockTreePanel  │ OriginalViewer         │ StructuredEditor           │
//   │ 320px           │ flex-1 (min 640px)     │ 520px                      │
//   └─────────────────┴────────────────────────┴────────────────────────────┘
//
// Two data paths:
//   (A) items[] is present  → block-level review (M2/M4, or M1 with items).
//   (B) only results[]      → legacy M1 passage-list review (fallback).
//
// Store actions used:
//   setItems, updateItem, setSelectedItemId, setFocusedPageIndex,
//   setEnrichedDrafts, setSourceMeta, setDrafts, updateDraft, removeDraft.
// ============================================================================

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  FileText,
  Filter,
  Layers,
  Merge,
  Save,
  Scissors,
  Trash2,
} from "lucide-react";
import { PassageContentEditor } from "@/components/workbench/editor/passage-content-editor";
import { toast } from "sonner";
import { useExtractionStore } from "@/lib/extraction/store";
import {
  BLOCK_TYPES,
  BLOCK_TYPE_LIST,
  blockTypeClasses,
  getBlockTypeByShortcut,
  type BlockType,
} from "@/lib/extraction/block-types";
import { getModeConfig } from "@/lib/extraction/modes";
import {
  CONFIDENCE_CRITICAL,
  CONFIDENCE_GREEN,
  CONFIDENCE_YELLOW,
  MIN_COMMIT_PASSAGE_LENGTH,
} from "@/lib/extraction/constants";
import {
  normaliseChoiceLabel,
  type EnrichedDraft,
} from "@/lib/extraction/segmentation";
import type {
  ExtractionItemSnapshot,
  ResultDraft,
  SourceMaterialSnapshot,
} from "@/lib/extraction/types";

// ────────────────────────────────────────────────────────────────────────────
// Local types
// ────────────────────────────────────────────────────────────────────────────

interface LoadedPage {
  pageIndex: number;
  imageUrl: string | null;
  extractedText: string | null;
  status: string;
}

type EditorTab = "passage" | "question" | "explanation" | "meta";

interface SourceMaterialDraft {
  title: string;
  subtitle: string;
  subject: "ENGLISH" | "KOREAN" | "MATH" | "OTHER" | "";
  type: "EXAM" | "TEXTBOOK" | "WORKBOOK" | "HANDOUT" | "MOCK" | "SUNEUNG" | "OTHER" | "";
  grade: string;
  semester: "FIRST" | "SECOND" | "";
  year: string;
  round: string;
  examType:
    | "MIDTERM"
    | "FINAL"
    | "MOCK"
    | "SUNEUNG"
    | "DIAGNOSTIC"
    | "EBS"
    | "PRIVATE"
    | "";
  publisher: string;
  school: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function firstPageOf(item: ExtractionItemSnapshot): number {
  if (item.boundingBox?.page != null) return item.boundingBox.page;
  return item.sourcePageIndex[0] ?? 0;
}

// ────────────────────────────────────────────────────────────────────────────
// Confidence tiers (4-way — 안전 / 의심 / 위험 / 치명).
//
// 기존 2단 구분은 0.5~0.9 구간을 모두 약한 스카이블루로 덮어 "의심" 상태가
// 시각적으로 인지되지 않았다. 이제 4개 임계값으로 분리한다:
//   >= 0.9 (안전)  — 오버레이 없음
//   0.7~0.9 (의심) — bg-sky-100/60 + ring-sky-300
//   0.5~0.7 (위험) — bg-rose-50/60 + ring-rose-300
//   <  0.5 (치명) — bg-rose-100/70 + ring-rose-400
// amber/orange는 브랜드 금지 — 스카이/로즈 명도로 3단 구분을 구현.
// CONFIDENCE_CRITICAL은 constants.ts에서 import (다른 레이어도 동일 기준 공유).
// ────────────────────────────────────────────────────────────────────────────

type ConfidenceTier = "unknown" | "safe" | "suspect" | "danger" | "critical";

function classifyConfidence(confidence: number | null): ConfidenceTier {
  if (confidence == null) return "unknown";
  if (confidence >= CONFIDENCE_GREEN) return "safe";
  if (confidence >= CONFIDENCE_YELLOW) return "suspect";
  if (confidence >= CONFIDENCE_CRITICAL) return "danger";
  return "critical";
}

function toneForConfidence(confidence: number | null): {
  bg: string;
  text: string;
  label: string;
} {
  const tier = classifyConfidence(confidence);
  const label =
    confidence == null ? "—" : `${Math.round(confidence * 100)}%`;
  if (tier === "unknown")
    return { bg: "bg-slate-100", text: "text-slate-500", label };
  if (tier === "safe")
    return { bg: "bg-emerald-100", text: "text-emerald-700", label };
  if (tier === "suspect")
    return { bg: "bg-sky-100", text: "text-sky-800", label };
  if (tier === "danger")
    return { bg: "bg-rose-50", text: "text-rose-700", label };
  return { bg: "bg-rose-100", text: "text-rose-800", label };
}

function confidenceLayer(confidence: number | null): string {
  const tier = classifyConfidence(confidence);
  if (tier === "unknown" || tier === "safe") return "bg-transparent";
  if (tier === "suspect") return "bg-sky-100/60 ring-1 ring-sky-300";
  if (tier === "danger") return "bg-rose-50/60 ring-1 ring-rose-300";
  return "bg-rose-100/70 ring-1 ring-rose-400";
}

function buildSourceDraft(meta: SourceMaterialSnapshot | null): SourceMaterialDraft {
  return {
    title: meta?.title ?? "",
    subtitle: meta?.subtitle ?? "",
    subject: ((meta?.subject as SourceMaterialDraft["subject"]) ?? "") || "",
    type: ((meta?.type as SourceMaterialDraft["type"]) ?? "") || "",
    grade: meta?.grade != null ? String(meta.grade) : "",
    semester: ((meta?.semester as SourceMaterialDraft["semester"]) ?? "") || "",
    year: meta?.year != null ? String(meta.year) : "",
    round: meta?.round ?? "",
    examType: ((meta?.examType as SourceMaterialDraft["examType"]) ?? "") || "",
    publisher: meta?.publisher ?? "",
    school: "",
  };
}

function sourceDraftToPayload(draft: SourceMaterialDraft) {
  const grade = draft.grade ? Number(draft.grade) : undefined;
  const year = draft.year ? Number(draft.year) : undefined;
  const payload: Record<string, unknown> = {
    title: draft.title.trim() || "제목 없음",
  };
  if (draft.subtitle.trim()) payload.subtitle = draft.subtitle.trim();
  if (draft.subject) payload.subject = draft.subject;
  if (draft.type) payload.type = draft.type;
  if (grade && !Number.isNaN(grade)) payload.grade = grade;
  if (draft.semester) payload.semester = draft.semester;
  if (year && !Number.isNaN(year)) payload.year = year;
  if (draft.round.trim()) payload.round = draft.round.trim();
  if (draft.examType) payload.examType = draft.examType;
  if (draft.publisher.trim()) payload.publisher = draft.publisher.trim();
  // 학교명은 MVP에서 문자열로 전송 — 서버에서 academy 내 매칭을 통해 schoolId 결정.
  // (zod schema는 optional `schoolId`를 받으므로 별도 `schoolName` 키로 분리 전송한다.)
  if (draft.school.trim()) payload.schoolName = draft.school.trim();
  return payload;
}

// ────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────

export function ReviewStep() {
  const jobId = useExtractionStore((s) => s.jobId);
  const mode = useExtractionStore((s) => s.mode);
  const phase = useExtractionStore((s) => s.phase);
  const setPhase = useExtractionStore((s) => s.setPhase);
  const setLastCommitResult = useExtractionStore((s) => s.setLastCommitResult);
  const setCompletedAt = useExtractionStore((s) => s.setCompletedAt);

  const items = useExtractionStore((s) => s.items);
  const setItems = useExtractionStore((s) => s.setItems);
  const updateItem = useExtractionStore((s) => s.updateItem);
  const setEnrichedDrafts = useExtractionStore((s) => s.setEnrichedDrafts);
  const sourceMaterial = useExtractionStore((s) => s.sourceMaterial);
  const setSourceMaterial = useExtractionStore((s) => s.setSourceMaterial);

  const selectedItemId = useExtractionStore((s) => s.selectedItemId);
  const setSelectedItemId = useExtractionStore((s) => s.setSelectedItemId);
  const focusedPageIndex = useExtractionStore((s) => s.focusedPageIndex);
  const setFocusedPageIndex = useExtractionStore((s) => s.setFocusedPageIndex);

  // Legacy fallback state (no items, only ExtractionResult rows)
  const drafts = useExtractionStore((s) => s.drafts);
  const setDrafts = useExtractionStore((s) => s.setDrafts);
  const updateDraft = useExtractionStore((s) => s.updateDraft);
  const removeDraft = useExtractionStore((s) => s.removeDraft);

  const [pagesData, setPagesData] = useState<LoadedPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [suspectOnly, setSuspectOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>("passage");
  const [originalFileName, setOriginalFileName] = useState<string | null>(null);
  const [sourceDraft, setSourceDraft] = useState<SourceMaterialDraft>(
    buildSourceDraft(null),
  );
  // Legacy-only selection bookkeeping
  const [legacyDraftId, setLegacyDraftId] = useState<string | null>(null);

  const currentMode = mode ?? "PASSAGE_ONLY";
  const modeConfig = getModeConfig(currentMode);

  // ────────────────────────────────────────────────────────────────────
  // Load job data once on mount
  // ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/extraction/jobs/${jobId}`);
        if (!res.ok) {
          toast.error("작업 불러오기에 실패했습니다.");
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (cancelled) return;

        const loadedPages: LoadedPage[] = (data.pages ?? []).map(
          (p: LoadedPage) => ({
            pageIndex: p.pageIndex,
            imageUrl: p.imageUrl ?? null,
            extractedText: p.extractedText ?? null,
            status: p.status,
          }),
        );
        setPagesData(loadedPages);
        setOriginalFileName(data.job?.originalFileName ?? null);

        const rawItems = (data.items ?? []) as ExtractionItemSnapshot[];
        const rawResults = (data.results ?? []) as Array<{
          id: string;
          passageOrder: number;
          sourcePageIndex: number[];
          title: string | null;
          content: string;
          confidence: number | null;
          status: "DRAFT" | "REVIEWED" | "SAVED" | "SKIPPED";
          meta: ResultDraft["meta"];
        }>;

        if (rawItems.length > 0) {
          // Block-level path (items present).
          const sorted = [...rawItems].sort((a, b) => a.order - b.order);
          setItems(sorted);
          // Keep enrichedDrafts in sync with items (one draft per passage group)
          setEnrichedDrafts(itemsToDraftSummaries(sorted));

          const firstPassage =
            sorted.find((it) => it.blockType === "PASSAGE_BODY") ?? sorted[0];
          if (firstPassage) {
            setSelectedItemId(firstPassage.id);
            setFocusedPageIndex(firstPageOf(firstPassage));
          }
        } else if (rawResults.length > 0) {
          // Legacy M1 fallback. items[]가 비어 있고 ExtractionResult만 있는 경우
          // 호출된다. 구체적 원인은 (a) 파이프라인이 M1로만 저장됐거나 (b) 신
          // 파이프라인이 items 저장 전에 중단됐을 가능성.
          console.info(
            "[review-step] Entering legacy M1 review: items=0, results=%d",
            rawResults.length,
          );
          const sorted = rawResults
            .sort((a, b) => a.passageOrder - b.passageOrder)
            .map((r) => ({
              id: r.id,
              passageOrder: r.passageOrder,
              sourcePageIndex: r.sourcePageIndex,
              title: r.title ?? `지문 ${r.passageOrder + 1}`,
              content: r.content,
              confidence: r.confidence,
              status: r.status,
              meta: r.meta ?? null,
            }));
          setDrafts(sorted);
          setItems([]);
          if (sorted.length > 0) {
            setLegacyDraftId(sorted[0].id);
            setFocusedPageIndex(sorted[0].sourcePageIndex[0] ?? 0);
          }
        }

        const mat = (data.sourceMaterial ?? null) as SourceMaterialSnapshot | null;
        if (mat) {
          setSourceMaterial(mat);
          setSourceDraft(buildSourceDraft(mat));
        } else {
          setSourceDraft((prev) => ({
            ...prev,
            title: prev.title || data.job?.originalFileName || "",
          }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // ────────────────────────────────────────────────────────────────────
  // Derived: tree, selected item, suspect filter
  // ────────────────────────────────────────────────────────────────────
  const tree = useMemo(() => buildTree(items, suspectOnly), [items, suspectOnly]);

  const selectedItem = useMemo(
    () => items.find((it) => it.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  const selectedDraft = useMemo(
    () => drafts.find((d) => d.id === legacyDraftId) ?? null,
    [drafts, legacyDraftId],
  );

  // When a new block is selected, jump viewer to its page
  useEffect(() => {
    if (!selectedItem) return;
    const pg = firstPageOf(selectedItem);
    setFocusedPageIndex(pg);
  }, [selectedItem, setFocusedPageIndex]);

  // When selected item changes and the current tab is hidden for its type,
  // flip to an appropriate tab.
  useEffect(() => {
    if (!selectedItem) return;
    if (!modeConfig.reviewTabs.includes(activeTab)) {
      setActiveTab(modeConfig.reviewTabs[0] ?? "passage");
    }
    if (
      selectedItem.blockType === "QUESTION_STEM" ||
      selectedItem.blockType === "CHOICE"
    ) {
      if (modeConfig.reviewTabs.includes("question")) setActiveTab("question");
    } else if (selectedItem.blockType === "PASSAGE_BODY") {
      if (modeConfig.reviewTabs.includes("passage")) setActiveTab("passage");
    } else if (selectedItem.blockType === "EXPLANATION") {
      if (modeConfig.reviewTabs.includes("explanation"))
        setActiveTab("explanation");
    } else if (selectedItem.blockType === "EXAM_META") {
      setActiveTab("meta");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItem?.id]);

  // ────────────────────────────────────────────────────────────────────
  // Keyboard shortcuts (J/K, 0-9, Ctrl+S)
  //
  // C2 2차 보정 — suspectOnly 네비게이션 정합성:
  //   이전엔 J/K가 `tree` 기반으로 flat list를 만들어, "의심만 보기" 필터를
  //   켜면 안전 블록은 키보드로 접근 불가했다. 이제 J/K는 *항상 전체* items를
  //   order 기준으로 순회하고, suspectOnly는 화면 표시에만 영향. 사용자가 필터
  //   중에 J/K로 점프하면 toast로 상태를 고지한다(처음 1회만).
  // ────────────────────────────────────────────────────────────────────
  const navItemIds = useMemo(
    () =>
      [...items]
        .sort((a, b) => a.order - b.order)
        .map((it) => it.id),
    [items],
  );
  const suspectOnlyToastShownRef = useRef(false);

  const onBlockTypeChange = useCallback(
    (id: string, nextType: BlockType) => {
      updateItem(id, { blockType: nextType });
    },
    [updateItem],
  );

  const moveSelection = useCallback(
    (dir: 1 | -1) => {
      if (navItemIds.length === 0) return;
      const currentIdx = selectedItemId
        ? navItemIds.indexOf(selectedItemId)
        : -1;
      const nextIdx =
        currentIdx < 0
          ? 0
          : Math.min(
              navItemIds.length - 1,
              Math.max(0, currentIdx + dir),
            );
      setSelectedItemId(navItemIds[nextIdx]);

      // 의심만 보기 필터가 켜져 있을 때 J/K가 필터 밖 블록으로 점프하면
      // "왜 화면이 그대로?"로 오인될 수 있으므로 세션당 한 번 상태 안내.
      if (suspectOnly && !suspectOnlyToastShownRef.current) {
        suspectOnlyToastShownRef.current = true;
        toast("의심 블록만 표시 중 · 전체 탐색 시 필터를 해제하세요", {
          duration: 4000,
        });
      }
    },
    [navItemIds, selectedItemId, setSelectedItemId, suspectOnly],
  );

  const onCommit = useCallback(async () => {
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName ?? "";
      const isEditable =
        !!target &&
        (tagName === "INPUT" ||
          tagName === "TEXTAREA" ||
          target.isContentEditable);
      // P1-4: <select>가 열린 상태에서 J/K 등이 옵션 탐색과 충돌하지 않도록 제외.
      const isSelectTarget = tagName === "SELECT";

      // P0-6: 한글 IME 조합 중에는 어떤 단축키도 실행하지 않는다.
      //       (isComposing, 또는 keyCode 229 — Safari/구 브라우저 호환용)
      const isComposing =
        e.isComposing ||
        (typeof (e as unknown as { keyCode?: number }).keyCode === "number" &&
          (e as unknown as { keyCode?: number }).keyCode === 229);
      if (isComposing) return;

      // Cmd/Ctrl+S: commit
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void onCommit();
        return;
      }

      if (isEditable || isSelectTarget) return;

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        moveSelection(1);
        return;
      }
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        moveSelection(-1);
        return;
      }

      // P0-2: 숫자 단축키는 Alt 모디파이어를 요구한다.
      // 리뷰 중 textarea 밖에서 무심코 "0"을 치면 NOISE로 바뀌고 되돌릴 방법이
      // 없는 버그가 있었다. Alt+1~9, Alt+0으로 명시적으로만 타입을 변경한다.
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const shortcutType = getBlockTypeByShortcut(e.key);
        if (shortcutType && selectedItemId) {
          e.preventDefault();
          onBlockTypeChange(selectedItemId, shortcutType);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [moveSelection, onBlockTypeChange, onCommit, selectedItemId]);

  // ────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center text-sm text-slate-500">
        원본을 불러오는 중…
      </div>
    );
  }

  const hasItems = items.length > 0;

  return (
    <div className="flex h-[calc(100vh-56px-73px)] min-h-[560px] flex-col">
      <TopBar
        modeLabel={modeConfig.shortLabel}
        modeName={modeConfig.label}
        fileName={originalFileName ?? sourceDraft.title ?? "제목 없음"}
        stats={statsOf(items)}
        onCommit={onCommit}
        committing={phase === "committing"}
      />

      <div className="flex min-h-0 flex-1">
        {hasItems ? (
          <>
            <BlockTreePanel
              tree={tree}
              selectedId={selectedItemId}
              onSelect={setSelectedItemId}
              onHoverPage={setFocusedPageIndex}
              suspectOnly={suspectOnly}
              onToggleSuspect={() => setSuspectOnly((v) => !v)}
              totals={statsOf(items)}
            />
            <OriginalViewer
              pages={pagesData}
              selectedItem={selectedItem}
              items={items}
              focusedPageIndex={focusedPageIndex}
              onFocus={setFocusedPageIndex}
              suspectOnly={suspectOnly}
            />
            <StructuredEditor
              mode={currentMode}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              availableTabs={modeConfig.reviewTabs}
              items={items}
              selectedItem={selectedItem}
              onChangeContent={(id, content) => updateItem(id, { content })}
              onChangeTitle={(id, title) => updateItem(id, { title })}
              onChangeType={onBlockTypeChange}
              onSplit={(id, caret) => handleSplit(id, caret, items, setItems)}
              onMergeWithNext={(id) =>
                handleMergeWithNext(id, items, setItems, setSelectedItemId)
              }
              onSkipToggle={(id) =>
                updateItem(id, {
                  status:
                    items.find((i) => i.id === id)?.status === "SKIPPED"
                      ? "DRAFT"
                      : "SKIPPED",
                })
              }
              sourceDraft={sourceDraft}
              setSourceDraft={setSourceDraft}
              sourceMaterial={sourceMaterial}
            />
          </>
        ) : (
          <LegacyReview
            pages={pagesData}
            drafts={drafts}
            selectedId={legacyDraftId}
            focusedPageIndex={focusedPageIndex}
            onSelect={(id) => {
              setLegacyDraftId(id);
              const d = drafts.find((x) => x.id === id);
              if (d) setFocusedPageIndex(d.sourcePageIndex[0] ?? 0);
            }}
            onFocus={setFocusedPageIndex}
            onTitle={(v) => {
              if (legacyDraftId) updateDraft(legacyDraftId, { title: v });
            }}
            onContent={(v) => {
              if (legacyDraftId) updateDraft(legacyDraftId, { content: v });
            }}
            onDelete={() => {
              if (legacyDraftId) {
                removeDraft(legacyDraftId);
                setLegacyDraftId(null);
              }
            }}
            selected={selectedDraft}
          />
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Top bar
// ────────────────────────────────────────────────────────────────────────────

interface TopBarProps {
  modeLabel: string;
  modeName: string;
  fileName: string;
  stats: Stats;
  onCommit: () => void;
  committing: boolean;
}

function TopBar({
  modeLabel,
  modeName,
  fileName,
  stats,
  onCommit,
  committing,
}: TopBarProps) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="rounded-md bg-sky-100 px-2 py-0.5 text-[11px] font-bold tracking-wide text-sky-700">
          {modeLabel}
        </span>
        <span className="truncate text-[14px] font-semibold text-slate-800">
          {fileName}
        </span>
        <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500">
          {modeName}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-slate-500">
          지문 {stats.passages} · 문제 {stats.questions} · 선지 {stats.choices} ·
          해설 {stats.explanations}
        </span>
        <button
          onClick={onCommit}
          disabled={committing}
          className="flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          aria-label="리뷰 내용을 저장합니다"
        >
          <Save className="size-4" strokeWidth={1.8} />
          {committing ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Block tree panel (left)
// ────────────────────────────────────────────────────────────────────────────

interface Stats {
  passages: number;
  questions: number;
  choices: number;
  explanations: number;
  meta: number;
  suspects: number;
}

function statsOf(items: ExtractionItemSnapshot[]): Stats {
  let passages = 0;
  let questions = 0;
  let choices = 0;
  let explanations = 0;
  let meta = 0;
  let suspects = 0;
  for (const it of items) {
    if (it.blockType === "PASSAGE_BODY") passages += 1;
    else if (it.blockType === "QUESTION_STEM") questions += 1;
    else if (it.blockType === "CHOICE") choices += 1;
    else if (it.blockType === "EXPLANATION") explanations += 1;
    else if (it.blockType === "EXAM_META") meta += 1;
    if (
      it.needsReview ||
      (it.confidence != null && it.confidence < CONFIDENCE_YELLOW)
    ) {
      suspects += 1;
    }
  }
  return { passages, questions, choices, explanations, meta, suspects };
}

interface TreeNode {
  id: string;
  item: ExtractionItemSnapshot;
  children: TreeNode[];
}

interface PageGroup {
  pageIndex: number;
  blocks: TreeNode[];
}

interface Tree {
  pages: PageGroup[];
}

function buildTree(
  items: ExtractionItemSnapshot[],
  suspectOnly: boolean,
): Tree {
  const filtered = suspectOnly
    ? items.filter(
        (it) =>
          it.needsReview ||
          (it.confidence != null && it.confidence < CONFIDENCE_YELLOW),
      )
    : items;

  // Build parent-aware nodes (CHOICE → QUESTION_STEM, EXPLANATION → QUESTION_STEM)
  const byId = new Map<string, TreeNode>();
  for (const it of filtered) {
    byId.set(it.id, { id: it.id, item: it, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.item.parentItemId;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const byPage = new Map<number, TreeNode[]>();
  for (const node of roots) {
    const page = firstPageOf(node.item);
    const arr = byPage.get(page) ?? [];
    arr.push(node);
    byPage.set(page, arr);
  }

  const pages: PageGroup[] = [...byPage.entries()]
    .sort(([a], [b]) => a - b)
    .map(([pageIndex, blocks]) => ({
      pageIndex,
      blocks: blocks.sort((a, b) => a.item.order - b.item.order),
    }));
  return { pages };
}

interface BlockTreePanelProps {
  tree: Tree;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHoverPage: (page: number) => void;
  suspectOnly: boolean;
  onToggleSuspect: () => void;
  totals: Stats;
}

function BlockTreePanel({
  tree,
  selectedId,
  onSelect,
  onHoverPage,
  suspectOnly,
  onToggleSuspect,
  totals,
}: BlockTreePanelProps) {
  return (
    <aside
      className="flex w-[320px] shrink-0 flex-col border-r border-slate-200 bg-white"
      aria-label="블록 트리 패널"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2 text-[13px] font-bold text-slate-800">
          <Layers className="size-4 text-slate-500" strokeWidth={1.8} />
          블록 트리
        </div>
        <button
          onClick={onToggleSuspect}
          aria-pressed={suspectOnly}
          className={
            "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 " +
            (suspectOnly
              ? "bg-sky-100 text-sky-700"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200")
          }
        >
          {suspectOnly ? (
            <EyeOff className="size-3" strokeWidth={1.8} />
          ) : (
            <Filter className="size-3" strokeWidth={1.8} />
          )}
          {suspectOnly ? "의심만 보기" : "모두 보기"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {tree.pages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
            <FileText className="size-8 text-slate-300" strokeWidth={1.5} />
            <div className="text-[12px] text-slate-500">
              표시할 블록이 없습니다.
            </div>
          </div>
        ) : (
          tree.pages.map((pg) => (
            <PageTreeGroup
              key={pg.pageIndex}
              pageGroup={pg}
              selectedId={selectedId}
              onSelect={onSelect}
              onHoverPage={onHoverPage}
            />
          ))
        )}
      </div>

      <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          합계
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-600">
          <TotalRow label="지문" value={totals.passages} />
          <TotalRow label="문제" value={totals.questions} />
          <TotalRow label="선지" value={totals.choices} />
          <TotalRow label="해설" value={totals.explanations} />
          <TotalRow label="메타" value={totals.meta} />
          <TotalRow label="의심" value={totals.suspects} tone="sky" />
        </dl>
      </div>
    </aside>
  );
}

function TotalRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "sky";
}) {
  return (
    <div className="flex items-center justify-between">
      <dt>{label}</dt>
      <dd
        className={
          "font-bold tabular-nums " +
          (tone === "sky" ? "text-sky-700" : "text-slate-800")
        }
      >
        {value}
      </dd>
    </div>
  );
}

function PageTreeGroup({
  pageGroup,
  selectedId,
  onSelect,
  onHoverPage,
}: {
  pageGroup: PageGroup;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHoverPage: (page: number) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] font-semibold text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="size-3" strokeWidth={1.8} />
        ) : (
          <ChevronRight className="size-3" strokeWidth={1.8} />
        )}
        페이지 {pageGroup.pageIndex + 1}
        <span className="ml-auto text-[10px] font-medium text-slate-400">
          {pageGroup.blocks.length}개
        </span>
      </button>
      {open ? (
        <ul role="tree" aria-label={`페이지 ${pageGroup.pageIndex + 1} 블록`}>
          {pageGroup.blocks.map((node) => (
            <BlockTreeNode
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              onSelect={onSelect}
              onHoverPage={onHoverPage}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * P1-1: 트리 깊이 상한 (CHOICE가 자기 CHOICE 자식이 되는 오염 데이터에서
 *       CSS 무한 인덴트를 방지). 3단을 넘으면 안내 메시지와 함께 자식 렌더 중단.
 * P1-2: aria-level + roving tabindex (선택된 노드만 tabIndex=0, 나머지 -1).
 */
const MAX_TREE_DEPTH = 3;

function BlockTreeNodeImpl({
  node,
  depth,
  selectedId,
  onSelect,
  onHoverPage,
}: {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHoverPage: (page: number) => void;
}) {
  const cfg = BLOCK_TYPES[node.item.blockType];
  const classes = blockTypeClasses(node.item.blockType);
  const isSelected = selectedId === node.id;
  const isSuspect =
    node.item.needsReview ||
    (node.item.confidence != null &&
      node.item.confidence < CONFIDENCE_YELLOW);
  const preview = (node.item.content ?? "")
    .slice(0, 60)
    .replace(/\s+/g, " ")
    .trim();

  const overDepthLimit = depth >= MAX_TREE_DEPTH;

  return (
    <li
      role="treeitem"
      aria-selected={isSelected}
      aria-level={depth + 1}
    >
      <button
        onClick={() => onSelect(node.id)}
        onMouseEnter={() => onHoverPage(firstPageOf(node.item))}
        data-item-id={node.id}
        tabIndex={isSelected ? 0 : -1}
        style={{ paddingLeft: 8 + depth * 14 }}
        className={
          "group relative flex w-full items-start gap-2 rounded-md py-1.5 pr-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 " +
          (isSelected
            ? "bg-sky-50"
            : isSuspect
              ? "bg-rose-50/40 hover:bg-rose-50/80"
              : "hover:bg-slate-50")
        }
      >
        {isSelected ? (
          <span className="absolute inset-y-1 left-0 w-[2px] rounded-sm bg-sky-500" />
        ) : null}
        <span
          className={
            "mt-0.5 inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-semibold leading-none " +
            classes.badge
          }
          title={cfg.description}
        >
          {cfg.shortLabel}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium text-slate-800">
            {node.item.title ?? (preview || cfg.label)}
          </span>
          {preview ? (
            <span className="block truncate text-[10px] text-slate-500">
              {preview}
            </span>
          ) : null}
        </span>
      </button>
      {node.children.length > 0 ? (
        overDepthLimit ? (
          <div
            role="note"
            className="ml-8 rounded border border-dashed border-rose-200 bg-rose-50/40 px-2 py-1 text-[10px] text-rose-600"
          >
            깊이 제한 초과 — 자식 블록 {node.children.length}개가 생략되었습니다.
            (블록 타입을 재검토해 주세요)
          </div>
        ) : (
          <ul role="group">
            {node.children.map((c) => (
              <BlockTreeNode
                key={c.id}
                node={c}
                depth={depth + 1}
                selectedId={selectedId}
                onSelect={onSelect}
                onHoverPage={onHoverPage}
              />
            ))}
          </ul>
        )
      ) : null}
    </li>
  );
}

/** React.memo — selectedId나 node가 바뀌지 않는 한 리렌더를 피함 (P2-1). */
const BlockTreeNode = memo(BlockTreeNodeImpl);

// ────────────────────────────────────────────────────────────────────────────
// Original viewer (center)
// ────────────────────────────────────────────────────────────────────────────

interface OriginalViewerProps {
  pages: LoadedPage[];
  selectedItem: ExtractionItemSnapshot | null;
  items: ExtractionItemSnapshot[];
  focusedPageIndex: number | null;
  onFocus: (page: number) => void;
  suspectOnly: boolean;
}

function OriginalViewer({
  pages,
  selectedItem,
  items,
  focusedPageIndex,
  onFocus,
  suspectOnly,
}: OriginalViewerProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Scroll to focused page
  useEffect(() => {
    if (focusedPageIndex == null) return;
    const el = document.getElementById(`page-${focusedPageIndex}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusedPageIndex]);

  return (
    <main
      className="flex min-w-0 flex-1 flex-col bg-slate-100"
      aria-label="원본 이미지 뷰어"
    >
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-2">
        <div className="flex items-center gap-2 text-[12px] text-slate-600">
          <button
            onClick={() =>
              onFocus(Math.max(0, (focusedPageIndex ?? 0) - 1))
            }
            disabled={focusedPageIndex == null || focusedPageIndex <= 0}
            className="rounded-md p-1 hover:bg-slate-100 disabled:opacity-30"
            aria-label="이전 페이지"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-12 text-center text-[12px] tabular-nums text-slate-500">
            {focusedPageIndex != null
              ? `${focusedPageIndex + 1} / ${pages.length}`
              : "—"}
          </span>
          <button
            onClick={() =>
              onFocus(Math.min(pages.length - 1, (focusedPageIndex ?? 0) + 1))
            }
            disabled={
              focusedPageIndex == null ||
              focusedPageIndex >= pages.length - 1
            }
            className="rounded-md p-1 hover:bg-slate-100 disabled:opacity-30"
            aria-label="다음 페이지"
          >
            <ChevronRight className="size-4" />
          </button>
          <select
            value={focusedPageIndex ?? 0}
            onChange={(e) => onFocus(Number(e.target.value))}
            className="ml-2 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 focus:border-sky-400 focus:outline-none"
            aria-label="페이지 이동"
          >
            {pages.map((p) => (
              <option key={p.pageIndex} value={p.pageIndex}>
                페이지 {p.pageIndex + 1}
              </option>
            ))}
          </select>
        </div>
        <div className="text-[11px] text-slate-500">
          {suspectOnly ? "의심 구간만 강조" : "전체 블록 표시"}
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex-1 overflow-auto p-6"
      >
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          {pages.map((p) => {
            const pageItems = items.filter(
              (it) => firstPageOf(it) === p.pageIndex,
            );
            const isFocused = focusedPageIndex === p.pageIndex;
            // P1-3: 확장된 alt — 스크린 리더가 페이지의 추출 상태까지 안내.
            const suspectCount = pageItems.filter(
              (it) =>
                it.needsReview ||
                (it.confidence != null && it.confidence < CONFIDENCE_YELLOW),
            ).length;
            const figureAriaLabel = `페이지 ${p.pageIndex + 1} — 추출 ${pageItems.length}개 블록${
              suspectCount > 0 ? ` (${suspectCount}개 의심)` : ""
            }`;
            return (
              <figure
                key={p.pageIndex}
                id={`page-${p.pageIndex}`}
                aria-label={figureAriaLabel}
                className={
                  "relative overflow-hidden rounded-xl border bg-white shadow-sm transition-all " +
                  (isFocused
                    ? "border-sky-400 ring-2 ring-sky-200"
                    : "border-slate-200")
                }
              >
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt={figureAriaLabel}
                    className="block w-full"
                  />
                ) : (
                  <div className="flex h-60 items-center justify-center text-[12px] text-slate-400">
                    이미지를 불러올 수 없습니다
                  </div>
                )}

                {/* Bounding-box overlays */}
                {pageItems
                  .filter((it) => it.boundingBox != null)
                  .map((it) => {
                    const bb = it.boundingBox!;
                    const isSel = selectedItem?.id === it.id;
                    const conf = it.confidence;
                    const suspect =
                      it.needsReview ||
                      (conf != null && conf < CONFIDENCE_YELLOW);
                    if (suspectOnly && !suspect && !isSel) return null;
                    // 선택 상태는 강한 sky 링을 고정, 그 외엔 confidenceLayer가
                    // bg + ring 을 함께 제공한다 (중복 ring class 제거).
                    const layerCls = isSel
                      ? "ring-2 ring-sky-500 ring-offset-1 ring-offset-white"
                      : suspect || (conf != null && conf < CONFIDENCE_GREEN)
                        ? confidenceLayer(conf)
                        : "ring-1 ring-slate-300/60";
                    return (
                      <div
                        key={it.id}
                        data-item-id={it.id}
                        className={
                          "pointer-events-none absolute transition-all " +
                          layerCls
                        }
                        style={{
                          left: `${bb.x * 100}%`,
                          top: `${bb.y * 100}%`,
                          width: `${bb.w * 100}%`,
                          height: `${bb.h * 100}%`,
                          borderRadius: 4,
                        }}
                        aria-hidden
                      />
                    );
                  })}

                <figcaption className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-600">
                    페이지 {p.pageIndex + 1}
                  </span>
                  <span>
                    블록 {pageItems.length}개 · {p.extractedText?.length ?? 0}자
                  </span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Structured editor (right)
// ────────────────────────────────────────────────────────────────────────────

interface StructuredEditorProps {
  mode: ReturnType<typeof getModeConfig>["id"];
  activeTab: EditorTab;
  setActiveTab: (tab: EditorTab) => void;
  availableTabs: readonly EditorTab[];
  items: ExtractionItemSnapshot[];
  selectedItem: ExtractionItemSnapshot | null;
  onChangeContent: (id: string, content: string) => void;
  onChangeTitle: (id: string, title: string) => void;
  onChangeType: (id: string, type: BlockType) => void;
  onSplit: (id: string, caret: number) => void;
  onMergeWithNext: (id: string) => void;
  onSkipToggle: (id: string) => void;
  sourceDraft: SourceMaterialDraft;
  setSourceDraft: (draft: SourceMaterialDraft) => void;
  sourceMaterial: SourceMaterialSnapshot | null;
}

function StructuredEditor(props: StructuredEditorProps) {
  const {
    activeTab,
    setActiveTab,
    availableTabs,
    items,
    selectedItem,
    onChangeContent,
    onChangeTitle,
    onChangeType,
    onSplit,
    onMergeWithNext,
    onSkipToggle,
    sourceDraft,
    setSourceDraft,
  } = props;

  const tabLabels: Record<EditorTab, string> = {
    passage: "지문",
    question: "문제",
    explanation: "해설",
    meta: "메타",
  };

  return (
    <aside
      className="flex w-[520px] shrink-0 flex-col border-l border-slate-200 bg-white"
      aria-label="구조화 에디터"
    >
      <div
        className="flex border-b border-slate-200"
        role="tablist"
        aria-label="에디터 탭"
      >
        {availableTabs.map((tab) => {
          const active = tab === activeTab;
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab)}
              className={
                "relative flex-1 px-3 py-2.5 text-[12px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 " +
                (active
                  ? "text-sky-700"
                  : "text-slate-500 hover:text-slate-700")
              }
            >
              {tabLabels[tab]}
              {active ? (
                <span className="absolute inset-x-3 bottom-0 h-[2px] bg-sky-500" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {activeTab === "passage" ? (
          <PassageTab
            item={pickForTab(items, selectedItem, "PASSAGE_BODY")}
            onChangeContent={onChangeContent}
            onChangeTitle={onChangeTitle}
            onChangeType={onChangeType}
            onSplit={onSplit}
            onMergeWithNext={onMergeWithNext}
            onSkipToggle={onSkipToggle}
          />
        ) : null}

        {activeTab === "question" ? (
          <QuestionTab
            items={items}
            selectedItem={selectedItem}
            onChangeContent={onChangeContent}
            onChangeType={onChangeType}
          />
        ) : null}

        {activeTab === "explanation" ? (
          <ExplanationTab
            item={pickForTab(items, selectedItem, "EXPLANATION")}
            onChangeContent={onChangeContent}
            onChangeTitle={onChangeTitle}
            onChangeType={onChangeType}
          />
        ) : null}

        {activeTab === "meta" ? (
          <MetaTab draft={sourceDraft} setDraft={setSourceDraft} />
        ) : null}
      </div>
    </aside>
  );
}

function pickForTab(
  items: ExtractionItemSnapshot[],
  selectedItem: ExtractionItemSnapshot | null,
  preferType: BlockType,
): ExtractionItemSnapshot | null {
  if (selectedItem?.blockType === preferType) return selectedItem;
  if (selectedItem) {
    // Walk parent chain if the selection is a child of the preferred type
    if (preferType === "PASSAGE_BODY") {
      // Try to find the nearest PASSAGE in the same group
      const group = items.filter(
        (it) => it.groupId === selectedItem.groupId,
      );
      const passage = group.find((g) => g.blockType === "PASSAGE_BODY");
      if (passage) return passage;
    }
    if (preferType === "EXPLANATION") {
      const exp = items.find(
        (it) =>
          it.blockType === "EXPLANATION" &&
          it.parentItemId === selectedItem.id,
      );
      if (exp) return exp;
    }
  }
  return items.find((it) => it.blockType === preferType) ?? null;
}

// ── Passage tab ────────────────────────────────────────────────────────────

function PassageTab({
  item,
  onChangeContent,
  onChangeTitle,
  onChangeType,
  onSplit,
  onMergeWithNext,
  onSkipToggle,
}: {
  item: ExtractionItemSnapshot | null;
  onChangeContent: (id: string, content: string) => void;
  onChangeTitle: (id: string, title: string) => void;
  onChangeType: (id: string, type: BlockType) => void;
  onSplit: (id: string, caret: number) => void;
  onMergeWithNext: (id: string) => void;
  onSkipToggle: (id: string) => void;
}) {
  const [caret, setCaret] = useState(0);

  if (!item) {
    return (
      <EmptyEditor hint="왼쪽 블록 트리에서 지문(PASSAGE_BODY)을 선택해 주세요." />
    );
  }

  const tooShort = item.content.trim().length < MIN_COMMIT_PASSAGE_LENGTH;
  const isSkipped = item.status === "SKIPPED";

  return (
    <>
      <BlockHeader
        item={item}
        onChangeTitle={(t) => onChangeTitle(item.id, t)}
      />
      <TypeSwitcher selected={item.blockType} onChange={(t) => onChangeType(item.id, t)} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <textarea
          value={item.content}
          onChange={(e) => onChangeContent(item.id, e.target.value)}
          onSelect={(e) =>
            setCaret(
              (e.target as HTMLTextAreaElement).selectionStart ?? 0,
            )
          }
          disabled={isSkipped}
          className="h-full w-full resize-none border-none bg-white px-5 py-4 text-[13px] leading-relaxed text-slate-800 outline-none focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
          placeholder="추출된 원문을 확인하세요."
          spellCheck={false}
          aria-label="지문 본문 편집"
        />
      </div>
      {tooShort ? (
        <div className="flex items-center gap-2 border-t border-sky-200 bg-sky-50 px-5 py-2 text-[11px] text-sky-800">
          <FileText className="size-3.5" strokeWidth={1.8} />
          {MIN_COMMIT_PASSAGE_LENGTH}자 이상이어야 저장할 수 있습니다.
        </div>
      ) : null}
      <BlockActions
        onSplit={() => onSplit(item.id, caret)}
        canSplit={caret > 0 && caret < item.content.length}
        onMergeWithNext={() => onMergeWithNext(item.id)}
        onSkipToggle={() => onSkipToggle(item.id)}
        isSkipped={isSkipped}
      />
    </>
  );
}

// ── Question tab ───────────────────────────────────────────────────────────

function QuestionTab({
  items,
  selectedItem,
  onChangeContent,
  onChangeType,
}: {
  items: ExtractionItemSnapshot[];
  selectedItem: ExtractionItemSnapshot | null;
  onChangeContent: (id: string, content: string) => void;
  onChangeType: (id: string, type: BlockType) => void;
}) {
  // Find the passage context of the current selection
  const contextGroupId =
    selectedItem?.blockType === "PASSAGE_BODY"
      ? selectedItem.groupId
      : selectedItem?.groupId ?? null;

  const questions = useMemo(
    () =>
      items.filter(
        (it) =>
          it.blockType === "QUESTION_STEM" &&
          (contextGroupId ? it.groupId === contextGroupId : true),
      ),
    [items, contextGroupId],
  );

  if (questions.length === 0) {
    return (
      <EmptyEditor hint="이 지문에 연결된 문제가 없습니다. 블록 타입을 '문제'로 바꾸면 여기 표시됩니다." />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      {questions.map((q) => {
        const choices = items
          .filter((it) => it.blockType === "CHOICE" && it.parentItemId === q.id)
          .sort((a, b) => (a.localOrder ?? 0) - (b.localOrder ?? 0));
        const qMeta = q.questionMeta as
          | { number?: number; answerChoice?: number; points?: number }
          | null;
        return (
          <div
            key={q.id}
            className="mb-5 rounded-xl border border-slate-200 bg-white p-4 last:mb-0"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                문제 {qMeta?.number ?? "?"}
              </span>
              <span className="text-[10px] text-slate-400">
                배점 {qMeta?.points ?? "—"}
              </span>
              <button
                onClick={() => onChangeType(q.id, "NOISE")}
                className="ml-auto text-[10px] text-slate-400 hover:text-rose-600"
                aria-label="이 문제를 무시 처리"
              >
                무시
              </button>
            </div>
            <textarea
              value={q.content}
              onChange={(e) => onChangeContent(q.id, e.target.value)}
              className="block w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[12px] leading-relaxed text-slate-800 focus:border-sky-400 focus:outline-none"
              rows={Math.max(2, Math.ceil(q.content.length / 60))}
              aria-label="문제 지시문"
            />
            <div className="mt-2 space-y-1">
              {choices.length === 0 ? (
                <div className="text-[11px] text-slate-400">
                  선지가 없습니다. 블록 트리에서 선지 블록으로 바꾸면 표시됩니다.
                </div>
              ) : (
                choices.map((c, i) => {
                  const cMeta = c.choiceMeta as {
                    index?: number;
                    isAnswer?: boolean;
                  } | null;
                  return (
                    <div
                      key={c.id}
                      className="flex items-start gap-2 rounded-md bg-slate-50 px-2 py-1.5"
                    >
                      <span className="mt-0.5 w-4 shrink-0 text-center text-[11px] font-bold text-slate-600">
                        {cMeta?.index ?? i + 1}
                      </span>
                      <textarea
                        value={c.content}
                        onChange={(e) =>
                          onChangeContent(c.id, e.target.value)
                        }
                        rows={1}
                        className="min-w-0 flex-1 resize-none border-none bg-transparent text-[12px] text-slate-700 focus:outline-none"
                        aria-label={`선지 ${cMeta?.index ?? i + 1}`}
                      />
                      {cMeta?.isAnswer ? (
                        <span className="rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-semibold text-emerald-700">
                          정답
                        </span>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Explanation tab ────────────────────────────────────────────────────────

function ExplanationTab({
  item,
  onChangeContent,
  onChangeTitle,
  onChangeType,
}: {
  item: ExtractionItemSnapshot | null;
  onChangeContent: (id: string, content: string) => void;
  onChangeTitle: (id: string, title: string) => void;
  onChangeType: (id: string, type: BlockType) => void;
}) {
  if (!item)
    return <EmptyEditor hint="해설(EXPLANATION) 블록을 선택해 주세요." />;
  return (
    <>
      <BlockHeader
        item={item}
        onChangeTitle={(t) => onChangeTitle(item.id, t)}
      />
      <TypeSwitcher
        selected={item.blockType}
        onChange={(t) => onChangeType(item.id, t)}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <textarea
          value={item.content}
          onChange={(e) => onChangeContent(item.id, e.target.value)}
          className="h-full w-full resize-none border-none bg-white px-5 py-4 text-[13px] leading-relaxed text-slate-800 outline-none focus:outline-none"
          placeholder="해설 본문"
          aria-label="해설 본문"
        />
      </div>
    </>
  );
}

// ── Meta tab ───────────────────────────────────────────────────────────────

function MetaTab({
  draft,
  setDraft,
}: {
  draft: SourceMaterialDraft;
  setDraft: (d: SourceMaterialDraft) => void;
}) {
  const update = <K extends keyof SourceMaterialDraft>(
    key: K,
    value: SourceMaterialDraft[K],
  ) => setDraft({ ...draft, [key]: value });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <div className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          시험지 메타데이터
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          EXAM_META 블록에서 자동 채워진 값입니다. 필요하면 직접 수정하세요.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-[12px]">
        <Field label="제목" full>
          <input
            value={draft.title}
            onChange={(e) => update("title", e.target.value)}
            className="input-meta"
            placeholder="예: 2024학년도 9월 모의평가"
          />
        </Field>
        <Field label="부제목" full>
          <input
            value={draft.subtitle}
            onChange={(e) => update("subtitle", e.target.value)}
            className="input-meta"
          />
        </Field>
        <Field label="과목">
          <select
            value={draft.subject}
            onChange={(e) =>
              update(
                "subject",
                e.target.value as SourceMaterialDraft["subject"],
              )
            }
            className="input-meta"
          >
            <option value="">—</option>
            <option value="ENGLISH">영어</option>
            <option value="KOREAN">국어</option>
            <option value="MATH">수학</option>
            <option value="OTHER">기타</option>
          </select>
        </Field>
        <Field label="학년">
          <select
            value={draft.grade}
            onChange={(e) => update("grade", e.target.value)}
            className="input-meta"
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((g) => (
              <option key={g} value={g}>
                {g}학년
              </option>
            ))}
          </select>
        </Field>
        <Field label="학기">
          <select
            value={draft.semester}
            onChange={(e) =>
              update(
                "semester",
                e.target.value as SourceMaterialDraft["semester"],
              )
            }
            className="input-meta"
          >
            <option value="">—</option>
            <option value="FIRST">1학기</option>
            <option value="SECOND">2학기</option>
          </select>
        </Field>
        <Field label="시행년도">
          <input
            value={draft.year}
            onChange={(e) =>
              update("year", e.target.value.replace(/[^0-9]/g, ""))
            }
            className="input-meta"
            placeholder="2024"
          />
        </Field>
        <Field label="회차">
          <input
            value={draft.round}
            onChange={(e) => update("round", e.target.value)}
            className="input-meta"
            placeholder="9월 / 1회"
          />
        </Field>
        <Field label="시험 종류">
          <select
            value={draft.examType}
            onChange={(e) =>
              update(
                "examType",
                e.target.value as SourceMaterialDraft["examType"],
              )
            }
            className="input-meta"
          >
            <option value="">—</option>
            <option value="MIDTERM">중간고사</option>
            <option value="FINAL">기말고사</option>
            <option value="MOCK">모의고사</option>
            <option value="SUNEUNG">수능</option>
            <option value="DIAGNOSTIC">진단</option>
            <option value="EBS">EBS</option>
            <option value="PRIVATE">학원</option>
          </select>
        </Field>
        <Field label="출제 기관 / 출판사" full>
          <input
            value={draft.publisher}
            onChange={(e) => update("publisher", e.target.value)}
            className="input-meta"
            placeholder="평가원 / 교육청 / 출판사"
          />
        </Field>
        <Field label="학교명" full>
          <input
            value={draft.school}
            onChange={(e) => update("school", e.target.value)}
            className="input-meta"
          />
        </Field>
      </div>

      <style jsx>{`
        :global(.input-meta) {
          width: 100%;
          border-radius: 8px;
          border: 1px solid rgb(226 232 240);
          background: white;
          padding: 6px 10px;
          font-size: 12px;
          color: rgb(30 41 59);
          outline: none;
        }
        :global(.input-meta:focus) {
          border-color: rgb(56 189 248);
          box-shadow: 0 0 0 2px rgb(186 230 253);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={"block " + (full ? "col-span-2" : "")}>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

// ── Shared editor pieces ───────────────────────────────────────────────────

function BlockHeader({
  item,
  onChangeTitle,
}: {
  item: ExtractionItemSnapshot;
  onChangeTitle: (t: string) => void;
}) {
  const tone = toneForConfidence(item.confidence);
  return (
    <div className="border-b border-slate-200 px-5 py-3">
      <input
        value={item.title ?? ""}
        onChange={(e) => onChangeTitle(e.target.value)}
        className="w-full border-none bg-transparent text-[14px] font-bold text-slate-800 outline-none placeholder:text-slate-300"
        placeholder="블록 제목 (선택)"
        aria-label="블록 제목"
      />
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span>
          원본 페이지 {item.sourcePageIndex.map((i) => `p.${i + 1}`).join(", ")}
        </span>
        <span>·</span>
        <span>{item.content.trim().length.toLocaleString("ko-KR")}자</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${tone.bg} ${tone.text}`}
        >
          신뢰도 {tone.label}
        </span>
        {item.needsReview ? (
          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
            검토 필요
          </span>
        ) : null}
        {(item.passageMeta as { markerDetected?: boolean } | null)
          ?.markerDetected ? (
          <span className="flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
            <CheckCircle2 className="size-3" /> 마커 탐지
          </span>
        ) : null}
      </div>
    </div>
  );
}

function TypeSwitcher({
  selected,
  onChange,
}: {
  selected: BlockType;
  onChange: (t: BlockType) => void;
}) {
  const onSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value as BlockType);
  };
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50/60 px-5 py-2">
      <span className="text-[11px] font-semibold text-slate-500">
        블록 타입
      </span>
      <select
        value={selected}
        onChange={onSelect}
        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] font-medium text-slate-700 focus:border-sky-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        aria-label="블록 타입 변경"
      >
        {BLOCK_TYPE_LIST.map((cfg) => (
          <option key={cfg.id} value={cfg.id}>
            {cfg.label} (Alt+{cfg.keyboardShortcut})
          </option>
        ))}
      </select>
      <span className="text-[10px] text-slate-400">
        단축키 Alt+1~9, Alt+0으로 즉시 변경
      </span>
    </div>
  );
}

function BlockActions({
  onSplit,
  canSplit,
  onMergeWithNext,
  onSkipToggle,
  isSkipped,
}: {
  onSplit: () => void;
  canSplit: boolean;
  onMergeWithNext: () => void;
  onSkipToggle: () => void;
  isSkipped: boolean;
}) {
  return (
    <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
      <ActionBtn
        onClick={onMergeWithNext}
        icon={Merge}
        label="다음과 병합"
      />
      <ActionBtn
        onClick={onSplit}
        disabled={!canSplit}
        icon={Scissors}
        label="커서에서 분할"
      />
      <div className="flex-1" />
      <ActionBtn
        onClick={onSkipToggle}
        icon={Trash2}
        label={isSkipped ? "복구" : "무시"}
        tone={isSkipped ? "default" : "danger"}
      />
    </div>
  );
}

function ActionBtn({
  onClick,
  disabled,
  icon: Icon,
  label,
  tone = "default",
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  tone?: "default" | "danger";
}) {
  const cls =
    tone === "danger"
      ? "text-rose-600 hover:bg-rose-50"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-40 " +
        cls
      }
    >
      <Icon className="size-3.5" strokeWidth={1.8} />
      {label}
    </button>
  );
}

function EmptyEditor({ hint }: { hint: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-center text-[12px] text-slate-400">
      {hint}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Legacy M1 path (no items, only ResultDraft rows)
// ────────────────────────────────────────────────────────────────────────────

interface LegacyReviewProps {
  pages: LoadedPage[];
  drafts: ResultDraft[];
  selectedId: string | null;
  focusedPageIndex: number | null;
  onSelect: (id: string) => void;
  onFocus: (page: number) => void;
  onTitle: (v: string) => void;
  onContent: (v: string) => void;
  onDelete: () => void;
  selected: ResultDraft | null;
}

function LegacyReview({
  pages,
  drafts,
  selectedId,
  focusedPageIndex,
  onSelect,
  onFocus,
  onTitle,
  onContent,
  onDelete,
  selected,
}: LegacyReviewProps) {
  // P1-5 — 레거시 모드로 전환되는 조건을 사용자에게 명시적으로 알린다.
  // items[] 가 0이고 ExtractionResult[] (drafts)만 있을 때 이 경로로 들어온다.
  return (
    <>
      <aside className="flex w-[320px] shrink-0 flex-col border-r border-slate-200 bg-white">
        <div
          className="border-b border-sky-200 bg-sky-50/70 px-4 py-2 text-[11px] text-sky-800"
          role="status"
        >
          M1 레거시 모드로 표시 중 — 블록 단위 리뷰가 지원되지 않아 지문
          단위로만 편집합니다. (items 0개)
        </div>
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="text-[13px] font-bold text-slate-800">
            추출된 지문
          </div>
          <div className="text-[11px] text-slate-500">
            {drafts.length}개 (레거시 모드)
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {drafts.map((d) => {
            const isSel = d.id === selectedId;
            return (
              <button
                key={d.id}
                onClick={() => onSelect(d.id)}
                className={
                  "block w-full border-b border-slate-100 px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 " +
                  (isSel ? "bg-sky-50" : "hover:bg-slate-50")
                }
              >
                <div className="truncate text-[13px] font-semibold text-slate-800">
                  {d.title}
                </div>
                <div className="line-clamp-2 text-[11px] text-slate-500">
                  {d.content.slice(0, 120)}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-slate-100">
        <div className="flex-1 overflow-auto p-6">
          <div className="mx-auto flex max-w-4xl flex-col gap-3">
            {pages.map((p) => (
              <figure
                key={p.pageIndex}
                id={`page-${p.pageIndex}`}
                className={
                  "overflow-hidden rounded-xl border bg-white shadow-sm " +
                  (focusedPageIndex === p.pageIndex
                    ? "border-sky-400 ring-2 ring-sky-200"
                    : "border-slate-200")
                }
                onClick={() => onFocus(p.pageIndex)}
              >
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt={`페이지 ${p.pageIndex + 1}`}
                    className="block w-full"
                  />
                ) : (
                  <div className="flex h-60 items-center justify-center text-[12px] text-slate-400">
                    이미지를 불러올 수 없습니다
                  </div>
                )}
              </figure>
            ))}
          </div>
        </div>
      </main>

      <aside className="flex w-[520px] shrink-0 flex-col border-l border-slate-200 bg-white">
        {selected ? (
          <LegacyEditorPanel
            selected={selected}
            onTitle={onTitle}
            onContent={onContent}
            onDelete={onDelete}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-[12px] text-slate-400">
            지문을 선택해 주세요.
          </div>
        )}
      </aside>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// LegacyEditorPanel — right panel: title input + TipTap editor + meta footer.
// Pulled out so the editor's local stats state (char/word count) doesn't
// re-render the whole LegacyReview tree on every keystroke.
// ────────────────────────────────────────────────────────────────────────────

interface LegacyEditorPanelProps {
  selected: ResultDraft;
  onTitle: (value: string) => void;
  onContent: (value: string) => void;
  onDelete: () => void;
}

function LegacyEditorPanel({
  selected,
  onTitle,
  onContent,
  onDelete,
}: LegacyEditorPanelProps) {
  const [stats, setStats] = useState({
    chars: selected.content.length,
    words: selected.content.trim()
      ? selected.content.trim().split(/\s+/).filter(Boolean).length
      : 0,
  });

  const pagesLabel = useMemo(() => {
    const pages = selected.sourcePageIndex ?? [];
    if (pages.length === 0) return null;
    const sorted = [...pages].sort((a, b) => a - b);
    return sorted.map((p) => `p.${p + 1}`).join(", ");
  }, [selected.sourcePageIndex]);

  const lengthTone =
    stats.chars >= MIN_COMMIT_PASSAGE_LENGTH
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : "text-rose-700 bg-rose-50 border-rose-200";

  return (
    <>
      {/* Title row — bold, inline-editable */}
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
        <input
          value={selected.title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="지문 제목"
          className="min-w-0 flex-1 border-none bg-transparent text-[14px] font-bold tracking-tight text-slate-800 placeholder:text-slate-300 outline-none"
        />
        {pagesLabel ? (
          <span
            className="inline-flex shrink-0 items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-slate-600"
            title="원본 페이지"
          >
            {pagesLabel}
          </span>
        ) : null}
      </div>

      {/* TipTap editor fills the middle band */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <PassageContentEditor
          content={selected.content}
          onChange={onContent}
          onStats={setStats}
          placeholder="지문 내용을 입력하거나 붙여넣으세요."
        />
      </div>

      {/* Footer: live stats + delete */}
      <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-2.5">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span
            className={
              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-semibold tabular-nums " +
              lengthTone
            }
            title={`커밋 최소 길이 ${MIN_COMMIT_PASSAGE_LENGTH}자`}
          >
            {stats.chars.toLocaleString()}자
          </span>
          <span className="text-slate-300">·</span>
          <span className="tabular-nums">
            {stats.words.toLocaleString()} words
          </span>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-rose-600 transition-colors hover:bg-rose-50"
        >
          <Trash2 className="size-3.5" strokeWidth={1.8} />
          삭제
        </button>
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Pure helpers (no React state)
// ────────────────────────────────────────────────────────────────────────────

/** Build EnrichedDraft[] summaries from ExtractionItemSnapshot[] for the store. */
function itemsToDraftSummaries(items: ExtractionItemSnapshot[]): EnrichedDraft[] {
  const byGroup = new Map<string, ExtractionItemSnapshot[]>();
  for (const it of items) {
    const key = it.groupId ?? `_solo:${it.id}`;
    const arr = byGroup.get(key) ?? [];
    arr.push(it);
    byGroup.set(key, arr);
  }
  const out: EnrichedDraft[] = [];
  let order = 0;
  for (const [, group] of byGroup) {
    const hasPassage = group.some((g) => g.blockType === "PASSAGE_BODY");
    const hasQuestion = group.some((g) => g.blockType === "QUESTION_STEM");
    if (!hasPassage && !hasQuestion) continue;

    const passageBlocks = group.filter((g) => g.blockType === "PASSAGE_BODY");
    const questionBlocks = group.filter((g) => g.blockType === "QUESTION_STEM");
    const choiceBlocks = group.filter((g) => g.blockType === "CHOICE");
    const explanationBlocks = group.filter(
      (g) => g.blockType === "EXPLANATION",
    );
    const examMetaBlock = group.find((g) => g.blockType === "EXAM_META");

    const content = passageBlocks
      .map((p) => p.content)
      .join("\n\n")
      .trim();
    const pagesSet = new Set<number>();
    for (const g of group) for (const p of g.sourcePageIndex) pagesSet.add(p);

    const confidences = group
      .map((g) => g.confidence)
      .filter((c): c is number => typeof c === "number");
    const confidence =
      confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : null;

    const firstNonEmpty = hasPassage
      ? passageBlocks[0]?.content ?? ""
      : questionBlocks[0]?.content ?? "";
    const title =
      (passageBlocks[0]?.title ?? "") ||
      firstNonEmpty.slice(0, 40).replace(/\s+/g, " ").trim() ||
      `지문 ${order + 1}`;

    const questions = questionBlocks.map((q) => {
      const qMeta = q.questionMeta as { number?: number } | null;
      const qChoices = choiceBlocks
        .filter((c) => c.parentItemId === q.id)
        .sort((a, b) => (a.localOrder ?? 0) - (b.localOrder ?? 0))
        .map((c, i) => {
          const cMeta = c.choiceMeta as
            | { index?: number; label?: string; isAnswer?: boolean }
            | null;
          // cMeta.label은 DB에서 임의 문자열로 되돌아올 수 있으므로
          // normaliseChoiceLabel 로 `ChoiceLabelLike` 유니언에 맞춘다.
          // label 이 없으면 index / ordinal 순으로 폴백한다.
          const labelSource =
            cMeta?.label != null
              ? cMeta.label
              : cMeta?.index != null
                ? String(cMeta.index)
                : null;
          return {
            itemId: c.id,
            label: normaliseChoiceLabel(labelSource, i),
            content: c.content,
            isAnswer: cMeta?.isAnswer === true,
          };
        });
      const explainBlock = explanationBlocks.find(
        (e) => e.parentItemId === q.id,
      );
      return {
        questionItemId: q.id,
        questionNumber: qMeta?.number ?? null,
        stem: q.content,
        choices: qChoices,
        explanation: explainBlock?.content ?? null,
      };
    });

    out.push({
      passageItemId: passageBlocks[0]?.id ?? null,
      passageOrder: order++,
      sourcePageIndex: [...pagesSet].sort((a, b) => a - b),
      title,
      content: content || questionBlocks.map((q) => q.content).join("\n\n"),
      confidence,
      status: "DRAFT",
      questions,
      examMeta:
        (examMetaBlock?.examMeta as Record<string, unknown> | null) ?? null,
      meta: {
        markerDetected: hasPassage,
      },
    });
  }
  return out;
}

/**
 * Split a block's content at the caret, producing two items.
 *
 * P0-5 fixes:
 *  1) items 배열을 order 기준으로 먼저 정렬한 뒤 분할 — 이전엔 입력 순서가
 *     비정렬일 경우 전역 재번호가 잘못됐다.
 *  2) boundingBox를 수직 분할(approximate)한다. caret 위치 기준 비율로
 *     head/tail을 상·하로 나누어 원본 박스가 그대로 복사되던 문제를 해결.
 *     caret 비율이 의미 없거나 계산 실패 시 tail.boundingBox는 null로 리셋한다.
 */
function handleSplit(
  id: string,
  caret: number,
  items: ExtractionItemSnapshot[],
  setItems: (items: ExtractionItemSnapshot[]) => void,
) {
  // (1) order asc 정렬 고정
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((it) => it.id === id);
  if (idx < 0) return;
  const current = sorted[idx];
  if (caret <= 0 || caret >= current.content.length) return;

  const headContent = current.content.slice(0, caret).trim();
  const tailContent = current.content.slice(caret).trim();

  // (2) boundingBox 수직 분할 — caret 위치를 문자열 길이 대비 비율로 사용.
  //     보수적으로 분할: 0.05 ~ 0.95 사이가 아니면 (예: trim 후 극단) reset.
  let headBox: ExtractionItemSnapshot["boundingBox"] = null;
  let tailBox: ExtractionItemSnapshot["boundingBox"] = null;
  const bb = current.boundingBox;
  if (bb) {
    const ratio = caret / current.content.length;
    if (ratio > 0.05 && ratio < 0.95) {
      const topH = bb.h * ratio;
      headBox = { page: bb.page, x: bb.x, y: bb.y, w: bb.w, h: topH };
      tailBox = {
        page: bb.page,
        x: bb.x,
        y: bb.y + topH,
        w: bb.w,
        h: bb.h - topH,
      };
    }
    // ratio 극단값: 박스를 정확히 쪼갤 근거가 없으므로 둘 다 null로 리셋
    // (원본을 그대로 복사하는 것보다 정확하지 않다고 표시하는 편이 낫다).
  }

  const head: ExtractionItemSnapshot = {
    ...current,
    content: headContent,
    boundingBox: headBox,
  };
  // C2 2차 보정 — id 충돌 방지: 같은 밀리초(리뷰어가 같은 블록을 키보드 J+split 연타)
  // 내에서 동일 Date.now() 값이 찍히면 parentItemId 역참조가 뒤섞였다.
  // crypto.randomUUID()가 제공되는 환경(Node 16.7+/모든 모던 브라우저)이면 그것을
  // 쓰고, 아니면 Date.now()+36진수 난수 조합으로 확률적 충돌 회피.
  const uniqueSuffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tail: ExtractionItemSnapshot = {
    ...current,
    id: `${current.id}__split_${uniqueSuffix}`,
    content: tailContent,
    order: current.order + 0.5,
    title: current.title ? `${current.title} (분할)` : null,
    boundingBox: tailBox,
  };
  const next = [...sorted];
  next.splice(idx, 1, head, tail);
  // (3) order 전역 재부여 (1-base 정수)
  setItems(next.map((it, i) => ({ ...it, order: i + 1 })));
}

/**
 * Merge a block with the next block of the same type (local state only).
 *
 * P0-3 — 동일 blockType만 체크하면 서로 다른 문제에 속한 CHOICE 두 개가 병합되어
 * 자식(해설·선지)이 고아가 되거나 지문 경계가 무너졌다. 이제 3중 조건으로
 * 엄격히 검증하고, 병합 대상의 children은 병합된 부모로 parentItemId를 재이관한다.
 */
function handleMergeWithNext(
  id: string,
  items: ExtractionItemSnapshot[],
  setItems: (items: ExtractionItemSnapshot[]) => void,
  setSelectedItemId: (id: string | null) => void,
) {
  // order 정렬 기준의 "다음 형제" 탐색
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((it) => it.id === id);
  if (idx < 0) return;
  const current = sorted[idx];

  // 동일 blockType + 동일 parentItemId + 동일 groupId 의 첫 후속 아이템.
  //
  // C2 2차 보정 — null-null 루트 병합 치명 이슈:
  //   groupId가 양쪽 모두 null이면 `===` 가 true가 되어 서로 무관한 루트 블록
  //   (예: 페이지 1의 CHOICE 마지막 → 페이지 2의 QUESTION_STEM 시작)이 병합될
  //   수 있었다. groupId 양쪽 null인 경우:
  //     - PASSAGE_BODY 끼리는 허용 (긴 지문이 페이지 넘어감 → 정당한 사용 케이스).
  //     - 그 외 blockType은 거부 — 작성자가 명시적으로 group을 지정한 뒤 합쳐야 함.
  const isPassageRootMerge =
    current.groupId == null &&
    current.blockType === "PASSAGE_BODY";
  const nextSibling =
    sorted.slice(idx + 1).find(
      (it) => {
        if (it.blockType !== current.blockType) return false;
        if (it.parentItemId !== current.parentItemId) return false;
        // 둘 다 null이면서 지문 본문이 아닌 경우 엄격히 차단.
        if (current.groupId == null && it.groupId == null) {
          return isPassageRootMerge;
        }
        return it.groupId === current.groupId;
      },
    ) ?? null;
  if (!nextSibling) {
    toast.error(
      current.groupId == null && !isPassageRootMerge
        ? "그룹이 지정되지 않은 루트 블록은 병합할 수 없습니다. (지문 본문 제외)"
        : "병합 가능한 다음 블록이 없습니다. (동일 유형·동일 부모·동일 그룹 필요)",
    );
    return;
  }

  const merged: ExtractionItemSnapshot = {
    ...current,
    content: (
      current.content.trimEnd() +
      "\n\n" +
      nextSibling.content.trimStart()
    ).trim(),
    sourcePageIndex: [
      ...new Set([...current.sourcePageIndex, ...nextSibling.sourcePageIndex]),
    ].sort((a, b) => a - b),
    // confidence: 둘의 평균으로 보수 합산
    confidence:
      current.confidence != null && nextSibling.confidence != null
        ? (current.confidence + nextSibling.confidence) / 2
        : current.confidence ?? nextSibling.confidence,
    needsReview: current.needsReview || nextSibling.needsReview,
  };

  // children 재이관 (parentItemId = nextSibling.id → current.id)
  const out = sorted
    .filter((it) => it.id !== nextSibling.id)
    .map((it) => {
      if (it.id === current.id) return merged;
      if (it.parentItemId === nextSibling.id) {
        return { ...it, parentItemId: current.id };
      }
      return it;
    });

  setItems(out.map((it, i) => ({ ...it, order: i + 1 })));
  setSelectedItemId(merged.id);
}

// ────────────────────────────────────────────────────────────────────────────
// Commit error inspection (P0-9)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Commit API 실패 응답 `details`에서 첫 이슈를 사람이 읽을 수 있는 형태로
 * 요약한다.
 *
 * 지원하는 `details[0]` 모양:
 *   (a) ZodIssue: `{ path: ["passages", 0, "content"], message: "..." }`
 *       → path[1]이 배열 인덱스면 `payload.passages[idx].sourceItemId` /
 *         `payload.questions[idx].sourceItemIds[0]` 로 역매핑해 itemId 복원.
 *   (b) 파이프라인 구조화 에러: `{ itemId, message }` 또는 `{ sourceItemId, message }`
 *       → itemId를 직접 사용.
 *
 * C2 2차 보정 — 이전 구현은 path 기반 응답에서 itemId를 전혀 복원하지 못해
 * "문제 블록 자동 포커스" 스크롤이 무의미했다. 이제 두 번째 인자로 commit에
 * 실제 전송된 payload를 주면 path → itemId 역매핑을 시도한다.
 */
function extractFirstIssue(
  details: unknown,
  payload?: Record<string, unknown> | null,
): { label: string; description?: string; itemId?: string } | null {
  if (!Array.isArray(details) || details.length === 0) return null;
  const first = details[0] as Record<string, unknown> | null;
  if (!first || typeof first !== "object") return null;

  const path = Array.isArray(first.path) ? first.path : undefined;
  const message =
    typeof first.message === "string" ? first.message : undefined;
  let itemId =
    typeof first.itemId === "string"
      ? first.itemId
      : typeof (first as { sourceItemId?: unknown }).sourceItemId === "string"
        ? ((first as { sourceItemId?: string }).sourceItemId as string)
        : undefined;

  // Path → itemId 역매핑 (서버가 ZodIssue shape로 응답할 때).
  if (!itemId && path && payload) {
    const [root, rawIdx] = path;
    const idx = typeof rawIdx === "number" ? rawIdx : undefined;
    if (
      idx !== undefined &&
      (root === "passages" || root === "questions") &&
      Array.isArray(payload[root])
    ) {
      const arr = payload[root] as Array<Record<string, unknown>>;
      const hit = arr[idx];
      if (hit) {
        if (typeof hit.sourceItemId === "string") {
          itemId = hit.sourceItemId;
        } else if (
          Array.isArray(hit.sourceItemIds) &&
          typeof hit.sourceItemIds[0] === "string"
        ) {
          itemId = hit.sourceItemIds[0] as string;
        }
      }
    }
  }

  const label = path && path.length > 0 ? path.join(".") : "입력 오류";
  return {
    label,
    description: message,
    itemId,
  };
}

/** Build the mode-specific commit payload. Returns null when nothing to save. */
function buildCommitPayload({
  mode,
  items,
  drafts,
  sourceDraft,
  originalFileName,
}: {
  mode: ReturnType<typeof getModeConfig>["id"];
  items: ExtractionItemSnapshot[];
  drafts: ResultDraft[];
  sourceDraft: SourceMaterialDraft;
  originalFileName: string | null;
}): Record<string, unknown> | null {
  const sm = sourceDraftToPayload(sourceDraft);

  // Legacy fallback when no items
  if (items.length === 0) {
    const results = drafts
      .filter((d) => d.status !== "SKIPPED")
      .filter((d) => d.content.trim().length >= MIN_COMMIT_PASSAGE_LENGTH)
      .map((d) => ({
        passageOrder: d.passageOrder,
        title: d.title?.trim() || `지문 ${d.passageOrder + 1}`,
        content: d.content,
        sourcePageIndex: d.sourcePageIndex,
      }));
    if (results.length === 0) return null;
    return {
      collectionName:
        originalFileName ||
        `일괄 등록 ${new Date().toLocaleDateString("ko-KR")}`,
      results,
    };
  }

  // Build passage/question collections from items
  const live = items.filter((it) => it.status !== "SKIPPED");

  const passageItems = live.filter((it) => it.blockType === "PASSAGE_BODY");
  const questionItems = live.filter((it) => it.blockType === "QUESTION_STEM");
  const choiceItems = live.filter((it) => it.blockType === "CHOICE");

  const passages = passageItems
    .filter(
      (p) =>
        p.content.trim().length >= MIN_COMMIT_PASSAGE_LENGTH ||
        mode !== "PASSAGE_ONLY",
    )
    .map((p, i) => ({
      passageOrder: i,
      title:
        p.title?.trim() ||
        (p.content || "")
          .slice(0, 40)
          .replace(/\s+/g, " ")
          .trim() ||
        `지문 ${i + 1}`,
      content: p.content,
      sourcePageIndex:
        p.sourcePageIndex.length > 0 ? p.sourcePageIndex : [0],
      sourceItemId: p.id,
    }));

  if (passages.length === 0 && mode === "PASSAGE_ONLY") return null;

  if (mode === "PASSAGE_ONLY") {
    return {
      mode: "PASSAGE_ONLY" as const,
      collectionName:
        originalFileName ||
        `일괄 등록 ${new Date().toLocaleDateString("ko-KR")}`,
      sourceMaterial: sm,
      passages,
    };
  }

  // Build question payload (M2/M4)
  //
  // P0-8 — 질문-지문 1:1 매칭 정확성.
  // 이전 구현은 `passages.findIndex(p => src.groupId === q.groupId)`로 단순
  // groupId 일치만 검사했다. M4에서 하나의 그룹(공통 지문 2~4번)을 여러 지문이
  // 공유하거나, groupId가 동일한 다수 지문이 있으면 항상 "첫" 지문에만 붙어
  // 나머지 지문의 question 연결이 깨졌다.
  //
  // 새 전략:
  //   (a) question.passageMeta.passageItemId 가 있으면 그것을 우선 신뢰.
  //   (b) passage.passageMeta.questionRange 또는 .questionNumbers 가 있고
  //       question.questionMeta.number 가 그 범위에 속하면 매칭.
  //   (c) 그 외에는 동일 groupId 내에서 order가 가장 가까운(질문보다 앞선 마지막)
  //       지문을 선택 — 여러 지문이 같은 group에 있어도 근접성으로 분기.
  const resolveParentPassageIndex = (q: ExtractionItemSnapshot): number => {
    const qMeta = q.passageMeta as { passageItemId?: string } | null;
    const directId = qMeta?.passageItemId;
    if (directId) {
      const hit = passages.findIndex((p) => p.sourceItemId === directId);
      if (hit >= 0) return hit;
    }
    const qNumber = (q.questionMeta as { number?: number } | null)?.number;
    if (qNumber != null) {
      const byRange = passages.findIndex((p) => {
        const src = passageItems.find((pi) => pi.id === p.sourceItemId);
        const pMeta = src?.passageMeta as
          | {
              questionRange?: string;
              questionNumbers?: number[];
            }
          | null;
        if (pMeta?.questionNumbers?.includes(qNumber)) return true;
        const range = pMeta?.questionRange;
        if (typeof range === "string") {
          // 범위 구분자: 틸드(~), ASCII 하이픈(-), EN-DASH(–), EM-DASH(—),
          // 전각 물결(～). Gemini/OCR 출력은 기기별 폰트·언어팩에 따라 다섯 기호
          // 모두 등장 가능 — 하나라도 누락되면 "2~4" 공통 지문이 질문에 못 붙는다.
          const m = range.match(/(\d+)\s*[~\-–—～]\s*(\d+)/);
          if (m) {
            const lo = Number(m[1]);
            const hi = Number(m[2]);
            if (!Number.isNaN(lo) && !Number.isNaN(hi))
              return qNumber >= Math.min(lo, hi) && qNumber <= Math.max(lo, hi);
          }
          const single = Number(range);
          if (!Number.isNaN(single) && qNumber === single) return true;
        }
        return false;
      });
      if (byRange >= 0) return byRange;
    }
    // Fallback: 같은 groupId 내에서 order가 질문보다 앞선 마지막 지문.
    if (q.groupId != null) {
      const candidates = passageItems
        .filter((p) => p.groupId === q.groupId && p.order < q.order)
        .sort((a, b) => b.order - a.order);
      const best = candidates[0];
      if (best) {
        const idx = passages.findIndex((p) => p.sourceItemId === best.id);
        if (idx >= 0) return idx;
      }
      // order 정보가 없거나 모두 질문 뒤에 있으면 단순 첫 매치로 폴백
      const any = passages.findIndex((p) => {
        const src = passageItems.find((pi) => pi.id === p.sourceItemId);
        return src != null && src.groupId === q.groupId;
      });
      if (any >= 0) return any;
    }
    return -1;
  };

  const questions = questionItems.map((q, i) => {
    const qMeta = q.questionMeta as
      | { number?: number; answerChoice?: number; points?: number }
      | null;
    const qChoices = choiceItems
      .filter((c) => c.parentItemId === q.id)
      .sort((a, b) => (a.localOrder ?? 0) - (b.localOrder ?? 0))
      .map((c) => c.content);
    const correct = qMeta?.answerChoice != null ? String(qMeta.answerChoice) : undefined;
    const parentPassage = resolveParentPassageIndex(q);
    const questionPayload: Record<string, unknown> = {
      questionOrder: i,
      stem: q.content,
      sourceItemIds: [q.id, ...choiceItems
        .filter((c) => c.parentItemId === q.id)
        .map((c) => c.id)],
    };
    if (qMeta?.number != null) questionPayload.questionNumber = qMeta.number;
    if (qChoices.length > 0) questionPayload.choices = qChoices;
    if (correct) questionPayload.correctAnswer = correct;
    if (qMeta?.points != null) questionPayload.points = qMeta.points;
    if (parentPassage >= 0) questionPayload.passageOrder = parentPassage;
    return questionPayload;
  });

  if (mode === "QUESTION_SET") {
    if (passages.length === 0 || questions.length === 0) return null;
    return {
      mode: "QUESTION_SET" as const,
      sourceMaterial: sm,
      passages,
      questions,
    };
  }

  if (mode === "FULL_EXAM") {
    if (passages.length === 0 || questions.length === 0) return null;
    // Build PassageBundle entries: passages that share a groupId with multiple questions
    const bundles: Array<{
      orderInMaterial: number;
      sharedLabel?: string;
      passageOrder: number;
      questionOrders: number[];
    }> = [];
    passages.forEach((p, pIdx) => {
      const src = passageItems.find((pi) => pi.id === p.sourceItemId);
      if (!src) return;
      const qOrders = questions
        .map((q, qi) => ({ q, qi }))
        .filter(({ q }) => q.passageOrder === pIdx)
        .map(({ qi }) => qi);
      if (qOrders.length > 1) {
        bundles.push({
          orderInMaterial: pIdx,
          passageOrder: pIdx,
          questionOrders: qOrders,
        });
      }
    });

    return {
      mode: "FULL_EXAM" as const,
      sourceMaterial: sm,
      exam: {
        title: sourceDraft.title || originalFileName || "시험",
        type: "MOCK" as const,
      },
      passages,
      questions,
      bundles: bundles.length > 0 ? bundles : undefined,
    };
  }

  return null;
}

