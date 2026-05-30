// @ts-nocheck
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import { QuestionReviewModal } from "@/components/workbench/question-review-modal";
import { PassageAnalysisModal } from "@/components/workbench/passage-analysis-modal";
import {
  QuestionCard,
  ReviewStatusStamp,
  type QuestionCardItem,
} from "@/components/workbench/question-card";
import { InteractivePassageView } from "@/components/workbench/interactive-passage-view";
import { getCustomPrompts } from "@/actions/custom-prompts";
import {
  addPassagesToCollection,
  approveWorkbenchQuestion,
  bulkApproveWorkbenchQuestions,
  bulkDeleteWorkbenchPassages,
  deleteWorkbenchQuestion,
  removePassagesFromCollection,
  unapproveWorkbenchQuestion,
} from "@/actions/workbench";
import {
  type PassageItem,
  type PassageCollectionItem,
  type FilterOptions,
  type PassageAnalysisStatusFilter,
  type PassageSortOrder,
} from "./generate-page-types";
import { PassageCardGrid } from "./passage-card-grid";
import { GenerationConfigPanel } from "./generation-config-panel";
import { countPassageSentences } from "@/lib/passage-sentence-utils";
import { BottomQueueSection } from "./bottom-queue-section";
import { useGenerationHandlers } from "./use-generation-handlers";
import { useGenerationSessionQueue } from "./generation-session-store";
import { EditQuestionDialog } from "@/components/workbench/question-bank-client/edit-question-dialog";
import { useQuestionEditor } from "@/components/workbench/question-bank-client/use-question-editor";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import {
  getDefaultQuestionTypeGenerationSettings,
  type QuestionTypeGenerationSettings,
} from "@/lib/question-type-generation-settings";
import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";
import { QuestionGenerationIcon } from "@/components/icons/workflow-icons";
import { WorkspaceShell } from "./workspace-shell";

const UNDO_TOAST_DURATION = 8000;

// ─── Component ───────────────────────────────────────────

export function GeneratePageClient({
  academyId,
  defaultMode = "auto",
}: {
  academyId: string;
  defaultMode?: "auto" | "manual";
}) {
  const searchParams = useSearchParams();

  // ── Deep-link context (from /import or detail page) ──
  // Accept `?passageIds=cuid1,cuid2` for pre-selection,
  // and `?mode=auto|manual` to decide which config panel opens.
  //
  // Defensive parsing: URL may be percent-encoded, contain stray whitespace,
  // or be maliciously stuffed — we decode, split on comma, filter empties,
  // dedupe and cap at 100 ids so downstream `Set` construction + the cross-
  // tenant validity filter (useEffect below) never have to chew on junk.
  const initialPassageIdsRef = useRef<string[]>(
    (() => {
      const raw = searchParams.get("passageIds") || "";
      let decoded = raw;
      try {
        decoded = decodeURIComponent(raw);
      } catch {
        decoded = raw;
      }
      const parts = decoded
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      // Dedupe while preserving order, cap at 100.
      const seen = new Set<string>();
      const out: string[] = [];
      for (const id of parts) {
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
        if (out.length >= 100) break;
      }
      return out;
    })(),
  );
  const initialModeRef = useRef<"auto" | "manual">(
    searchParams.get("mode") === "auto"
      ? "auto"
      : searchParams.get("mode") === "manual"
        ? "manual"
        : defaultMode,
  );
  const prefillAppliedRef = useRef(false);

  // ── Passage data ──
  const [passages, setPassages] = useState<PassageItem[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    schools: [],
    grades: [],
    semesters: [],
    publishers: [],
  });
  const [loadingPassages, setLoadingPassages] = useState(true);

  // ── Collections ──
  const [collections, setCollections] = useState<PassageCollectionItem[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [passageBulkAction, setPassageBulkAction] = useState<
    "move" | "remove" | "delete" | null
  >(null);

  // ── Search/filter state ──
  const [passageSearch, setPassageSearch] = useState("");
  const [filterSchool, setFilterSchool] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [analysisStatusFilter, setAnalysisStatusFilter] =
    useState<PassageAnalysisStatusFilter>("all");
  const [passageSortOrder, setPassageSortOrder] =
    useState<PassageSortOrder>("newest");

  // ── Selected passage ──
  const [selectedPassage, setSelectedPassage] = useState<PassageItem | null>(
    null,
  );
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  // ── Mode: auto vs manual (seeded from ?mode= URL param) ──
  const [genMode, setGenMode] = useState<"auto" | "manual">(
    initialModeRef.current,
  );
  const [generationPlan, setGenerationPlan] =
    useState<QuestionGenerationPlan>("STANDARD");

  // ── Auto mode config ──
  const [autoCount, setAutoCount] = useState(1);

  // ── Manual mode config ──
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [questionTypeSettings, setQuestionTypeSettings] =
    useState<QuestionTypeGenerationSettings>(() =>
      getDefaultQuestionTypeGenerationSettings(),
    );
  const [difficulty, setDifficulty] = useState<
    "BASIC" | "INTERMEDIATE" | "KILLER"
  >("INTERMEDIATE");
  const [customPrompt, setCustomPrompt] = useState("");

  // ── Saved prompts ──
  const [savedPrompts, setSavedPrompts] = useState<
    { id: string; name: string; content: string }[]
  >([]);
  const [showSavedPrompts, setShowSavedPrompts] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [savePromptName, setSavePromptName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // ── Session queue ──
  const [sessionQueue, setSessionQueue] = useGenerationSessionQueue();
  const [queueFilter, setQueueFilter] = useState<"all" | "error">("all");

  // ── Review modal ──
  const [reviewModalId, setReviewModalId] = useState<string | null>(null);

  // ── Checkbox multi-select (seeded from ?passageIds= URL param) ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialPassageIdsRef.current),
  );

  // ── IRRELEVANT stepper context ──
  // IRRELEVANT now inserts one new sentence into a source window, so N slots
  // need N - 1 original passage sentences. The original first passage sentence
  // is context only, so the maximum slot count is the total sentence count.
  // With multiple selected passages, use the shortest passage so one setting is
  // safe for every target.
  const irrelevantPassageContext = useMemo(() => {
    const targets =
      selectedIds.size > 0
        ? passages.filter((p) => selectedIds.has(p.id))
        : selectedPassage
          ? [selectedPassage]
          : [];
    if (targets.length === 0) return null;
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    let limitingPassage: PassageItem | null = null;
    let longestPassage: PassageItem | null = null;
    for (const p of targets) {
      const n = countPassageSentences(p.content || "");
      if (n < min) {
        min = n;
        limitingPassage = p;
      }
      if (n > max) {
        max = n;
        longestPassage = p;
      }
    }
    if (!Number.isFinite(min) || !limitingPassage) return null;
    return {
      sentenceCount: min,
      title: limitingPassage.title,
      longestSentenceCount: max,
      longestTitle: longestPassage?.title ?? "",
      selectedCount: targets.length,
    };
  }, [selectedIds, selectedPassage, passages]);

  const irrelevantPassageSentenceCount =
    irrelevantPassageContext?.sentenceCount ?? null;

  const maxIrrelevantSlotCount = useMemo(() => {
    if (irrelevantPassageSentenceCount === null) return 5;
    return Math.max(0, irrelevantPassageSentenceCount);
  }, [irrelevantPassageSentenceCount]);

  // ── Analysis detail modal ──
  const [analysisModalPassage, setAnalysisModalPassage] = useState<any>(null);
  const [loadingAnalysisModal, setLoadingAnalysisModal] = useState(false);

  // ── Saved questions from DB (persists across page visits) ──
  const [savedQuestions, setSavedQuestions] = useState<QuestionCardItem[]>([]);
  const [loadingSavedQuestions, setLoadingSavedQuestions] = useState(true);

  // ── Question detail modal ──
  const [detailQuestion, setDetailQuestion] = useState<QuestionCardItem | null>(
    null,
  );
  const editor = useQuestionEditor((deletedId) => {
    setSavedQuestions((prev) => prev.filter((q) => q.id !== deletedId));
    setDetailQuestion((prev) => (prev?.id === deletedId ? null : prev));
  });

  // ── Computed ──
  const totalQuestions = useMemo(
    () => Object.values(typeCounts).reduce((a, b) => a + b, 0),
    [typeCounts],
  );
  const activeTypes = useMemo(
    () => Object.keys(typeCounts).filter((k) => typeCounts[k] > 0),
    [typeCounts],
  );

  const filteredPassages = useMemo(() => {
    const result = passages.filter((p) => {
      if (passageSearch) {
        const q = passageSearch.toLowerCase();
        if (
          !p.title.toLowerCase().includes(q) &&
          !p.content.toLowerCase().includes(q)
        )
          return false;
      }
      if (filterSchool && p.school?.id !== filterSchool) return false;
      if (filterGrade && p.grade !== Number(filterGrade)) return false;
      if (filterSemester && p.semester !== filterSemester) return false;
      if (analysisStatusFilter === "analyzed" && !p.analysis) return false;
      if (analysisStatusFilter === "unanalyzed" && p.analysis) return false;
      if (
        selectedCollectionId &&
        !p.collectionItems?.some(
          (ci) => ci.collectionId === selectedCollectionId,
        )
      )
        return false;
      return true;
    });

    // `passages` arrives newest-first (createdAt desc), so "newest" keeps the
    // source order and "oldest" reverses it. Name sorts use the Korean locale.
    switch (passageSortOrder) {
      case "oldest":
        result.reverse();
        break;
      case "name_asc":
        result.sort((a, b) => a.title.localeCompare(b.title, "ko"));
        break;
      case "name_desc":
        result.sort((a, b) => b.title.localeCompare(a.title, "ko"));
        break;
      case "newest":
      default:
        break;
    }

    return result;
  }, [
    passages,
    passageSearch,
    filterSchool,
    filterGrade,
    filterSemester,
    analysisStatusFilter,
    selectedCollectionId,
    passageSortOrder,
  ]);

  const passageStatusCounts = useMemo(
    () => ({
      all: passages.length,
      analyzed: passages.filter((p) => !!p.analysis).length,
      unanalyzed: passages.filter((p) => !p.analysis).length,
    }),
    [passages],
  );

  const filteredQueue = useMemo(() => {
    if (queueFilter === "all") return sessionQueue;
    if (queueFilter === "error")
      return sessionQueue.filter((q) => q.status === "error");
    return sessionQueue;
  }, [sessionQueue, queueFilter]);

  const reviewItem = useMemo(
    () => sessionQueue.find((q) => q.id === reviewModalId) || null,
    [sessionQueue, reviewModalId],
  );

  const queueCounts = useMemo(
    () => ({
      generating: sessionQueue.filter((q) => q.status === "generating").length,
      done: sessionQueue.filter(
        (q) => q.status === "done" || q.status === "reviewed",
      ).length,
      error: sessionQueue.filter((q) => q.status === "error").length,
    }),
    [sessionQueue],
  );

  const activeFilterCount =
    [filterSchool, filterGrade, filterSemester].filter(Boolean).length +
    (analysisStatusFilter === "all" ? 0 : 1);

  // ── Load passages ──
  const loadPassages = useCallback(async () => {
    setLoadingPassages(true);
    try {
      const response = await fetch(`/api/passages/list?academyId=${academyId}`);
      const data = await response.json();
      setPassages(data.passages || []);
      if (data.filters) setFilterOptions(data.filters);
      if (data.collections) setCollections(data.collections);
    } catch {
      /* ignore */
    } finally {
      setLoadingPassages(false);
    }
  }, [academyId]);

  useEffect(() => {
    void loadPassages();
  }, [loadPassages]);

  const handleCopySelectedPassagesToCollection = useCallback(
    async (collectionId: string) => {
      const ids = [...selectedIds];
      if (ids.length === 0 || passageBulkAction) return;
      setPassageBulkAction("move");
      try {
        const selectedPassages = passages.filter((passage) =>
          selectedIds.has(passage.id),
        );
        const idsToAdd = ids.filter(
          (id) =>
            !selectedPassages
              .find((passage) => passage.id === id)
              ?.collectionItems?.some((item) => item.collectionId === collectionId),
        );
        if (idsToAdd.length === 0) {
          toast.info("이미 이 폴더에 들어있는 지문입니다.");
          return;
        }

        const result = await addPassagesToCollection(collectionId, idsToAdd);
        if (!result.success) {
          toast.error(result.error || "폴더에 복사하지 못했습니다.");
          return;
        }

        const folderName =
          collections.find((collection) => collection.id === collectionId)
            ?.name || "폴더";
        const countLabel =
          idsToAdd.length > 1 ? `${idsToAdd.length}개 지문이` : "지문이";

        const undoFolderCopy = async () => {
          setPassageBulkAction("move");
          try {
            const undoResult = await removePassagesFromCollection(
              collectionId,
              idsToAdd,
            );
            if (!undoResult.success) {
              toast.error(
                undoResult.error || "폴더 복사를 실행 취소하지 못했습니다.",
              );
              return;
            }
            await loadPassages();
            toast.success("폴더 복사를 실행 취소했습니다.");
          } catch (err) {
            toast.error(
              err instanceof Error
                ? err.message
                : "폴더 복사를 실행 취소하지 못했습니다.",
            );
          } finally {
            setPassageBulkAction(null);
          }
        };

        toast.success(`${countLabel} "${folderName}"에 복사되었습니다`, {
          duration: UNDO_TOAST_DURATION,
          action: {
            label: "실행 취소",
            onClick: () => void undoFolderCopy(),
          },
        });
        setSelectedIds(new Set());
        await loadPassages();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "폴더에 복사하지 못했습니다.",
        );
      } finally {
        setPassageBulkAction(null);
      }
    },
    [collections, loadPassages, passageBulkAction, passages, selectedIds],
  );

  const handleMovePassagesToCollection = useCallback(
    async (passageIds: string[], collectionId: string) => {
      const ids = Array.from(new Set(passageIds));
      if (ids.length === 0 || passageBulkAction) return;
      setPassageBulkAction("move");
      try {
        const idSet = new Set(ids);
        const selectedPassages = passages.filter((passage) =>
          idSet.has(passage.id),
        );
        const previousMembership = new Map<string, string[]>();
        for (const passage of selectedPassages) {
          for (const item of passage.collectionItems ?? []) {
            const list = previousMembership.get(item.collectionId) ?? [];
            list.push(passage.id);
            previousMembership.set(item.collectionId, list);
          }
        }
        const sourceCollectionIds = [...previousMembership.keys()].filter(
          (id) => id !== collectionId,
        );
        const targetExistingIds = new Set(
          previousMembership.get(collectionId) ?? [],
        );
        const idsToAdd = ids.filter((id) => !targetExistingIds.has(id));
        const hasFolderChanges =
          idsToAdd.length > 0 || sourceCollectionIds.length > 0;

        if (!hasFolderChanges) {
          toast.info("이미 이 폴더에 들어있는 지문입니다.");
          return;
        }

        const removeResults = await Promise.all(
          sourceCollectionIds.map((sourceId) =>
            removePassagesFromCollection(
              sourceId,
              previousMembership.get(sourceId) ?? [],
            ),
          ),
        );
        const failedRemove = removeResults.find((result) => !result.success);
        if (failedRemove) {
          toast.error(
            failedRemove.error || "폴더 이동 중 일부 제거에 실패했습니다.",
          );
          return;
        }

        if (idsToAdd.length > 0) {
          const addResult = await addPassagesToCollection(collectionId, idsToAdd);
          if (!addResult.success) {
            toast.error(addResult.error || "폴더로 이동하지 못했습니다.");
            return;
          }
        }

        const folderName =
          collections.find((collection) => collection.id === collectionId)
            ?.name || "폴더";
        const countLabel =
          ids.length > 1 ? `${ids.length}개 지문이` : "지문이";

        const undoFolderMove = async () => {
          setPassageBulkAction("move");
          try {
            const undoResults = await Promise.all([
              ...(idsToAdd.length > 0
                ? [removePassagesFromCollection(collectionId, idsToAdd)]
                : []),
              ...sourceCollectionIds.map((sourceId) =>
                addPassagesToCollection(
                  sourceId,
                  previousMembership.get(sourceId) ?? [],
                ),
              ),
            ]);
            const failedUndo = undoResults.find((result) => !result.success);
            if (failedUndo) {
              toast.error(
                failedUndo.error || "폴더 이동을 실행 취소하지 못했습니다.",
              );
              return;
            }

            await loadPassages();
            toast.success("폴더 이동을 실행 취소했습니다.");
          } catch (err) {
            toast.error(
              err instanceof Error
                ? err.message
                : "폴더 이동을 실행 취소하지 못했습니다.",
            );
          } finally {
            setPassageBulkAction(null);
          }
        };

        toast.success(`${countLabel} "${folderName}"(으)로 이동되었습니다`, {
          duration: UNDO_TOAST_DURATION,
          action: {
            label: "실행 취소",
            onClick: () => void undoFolderMove(),
          },
        });
        setSelectedIds((prev) => {
          if (!ids.some((id) => prev.has(id))) return prev;
          return new Set([...prev].filter((id) => !idSet.has(id)));
        });
        await loadPassages();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "폴더로 이동하지 못했습니다.",
        );
      } finally {
        setPassageBulkAction(null);
      }
    },
    [collections, loadPassages, passageBulkAction, passages],
  );

  const handleMoveSelectedPassagesToCollection = useCallback(
    async (collectionId: string) => {
      await handleMovePassagesToCollection([...selectedIds], collectionId);
    },
    [handleMovePassagesToCollection, selectedIds],
  );

  const handleRemoveSelectedPassagesFromCollection = useCallback(async () => {
    const ids = [...selectedIds];
    const collectionId = selectedCollectionId;
    if (!collectionId || ids.length === 0 || passageBulkAction) return;

    setPassageBulkAction("remove");
    try {
      const idSet = new Set(ids);
      const idsToRemove = passages
        .filter(
          (passage) =>
            idSet.has(passage.id) &&
            passage.collectionItems?.some(
              (item) => item.collectionId === collectionId,
            ),
        )
        .map((passage) => passage.id);

      if (idsToRemove.length === 0) {
        toast.info("이 폴더에서 제거할 지문이 없습니다.");
        return;
      }

      const result = await removePassagesFromCollection(
        collectionId,
        idsToRemove,
      );
      if (!result.success) {
        toast.error(result.error || "폴더에서 삭제하지 못했습니다.");
        return;
      }

      const undoFolderRemove = async () => {
        setPassageBulkAction("remove");
        try {
          const undoResult = await addPassagesToCollection(
            collectionId,
            idsToRemove,
          );
          if (!undoResult.success) {
            toast.error(
              undoResult.error || "폴더 삭제를 실행 취소하지 못했습니다.",
            );
            return;
          }
          await loadPassages();
          toast.success("폴더 삭제를 실행 취소했습니다.");
        } catch (err) {
          toast.error(
            err instanceof Error
              ? err.message
              : "폴더 삭제를 실행 취소하지 못했습니다.",
          );
        } finally {
          setPassageBulkAction(null);
        }
      };

      toast.success(`${idsToRemove.length}개 지문을 폴더에서 삭제했습니다.`, {
        duration: UNDO_TOAST_DURATION,
        action: {
          label: "실행 취소",
          onClick: () => void undoFolderRemove(),
        },
      });
      setSelectedIds(new Set());
      await loadPassages();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "폴더에서 삭제하지 못했습니다.",
      );
    } finally {
      setPassageBulkAction(null);
    }
  }, [
    loadPassages,
    passageBulkAction,
    passages,
    selectedCollectionId,
    selectedIds,
  ]);

  const handleDeleteSelectedPassages = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length === 0 || passageBulkAction) return;
    if (!window.confirm(`${ids.length}개 지문을 삭제하시겠습니까?`)) return;

    setPassageBulkAction("delete");
    try {
      const result = await bulkDeleteWorkbenchPassages(ids);
      if (!result.success) {
        toast.error(result.error || "삭제에 실패했습니다.");
        return;
      }
      if (result.deleted === 0) {
        toast.error("삭제된 지문이 없습니다.");
      } else if (result.deleted === result.requested) {
        toast.success(`${result.deleted}개 지문을 삭제했습니다.`);
      } else {
        toast.warning(
          `${result.deleted}개 삭제됨, ${result.requested - result.deleted}개 누락`,
        );
      }

      setPassages((prev) =>
        prev.filter((passage) => !ids.includes(passage.id)),
      );
      setSelectedIds(new Set());
      if (selectedPassage && ids.includes(selectedPassage.id)) {
        setSelectedPassage(null);
        setAnalysisData(null);
      }
      await loadPassages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setPassageBulkAction(null);
    }
  }, [loadPassages, passageBulkAction, selectedIds, selectedPassage]);

  // ── Apply deep-link pre-selection once passages are loaded ──
  // Runs once — filters the incoming ?passageIds= against the academy-scoped
  // list so stale / cross-academy ids can't bleed through a shared URL.
  useEffect(() => {
    if (prefillAppliedRef.current) return;
    if (loadingPassages) return;
    if (passages.length === 0) return;
    const ids = initialPassageIdsRef.current;
    if (ids.length === 0) {
      prefillAppliedRef.current = true;
      return;
    }
    const validIds = ids.filter((id) => passages.some((p) => p.id === id));
    if (validIds.length > 0) {
      setSelectedIds(new Set(validIds));
      const first = passages.find((p) => p.id === validIds[0]);
      if (first) setSelectedPassage(first);
      toast.success(
        validIds.length === ids.length
          ? `지문 ${validIds.length}개를 불러왔습니다.`
          : `지문 ${validIds.length}/${ids.length}개를 불러왔습니다.`,
      );
    }
    prefillAppliedRef.current = true;
  }, [loadingPassages, passages]);

  // ── Load saved questions from DB ──
  const loadSavedQuestions = useCallback(async () => {
    try {
      const { getWorkbenchQuestions } = await import("@/actions/workbench");
      const result = await getWorkbenchQuestions(academyId, {
        page: 1,
        limit: 100,
        aiGenerated: true,
      });
      if (result?.questions) {
        setSavedQuestions(result.questions as QuestionCardItem[]);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingSavedQuestions(false);
    }
  }, [academyId]);
  useEffect(() => {
    if (loadingPassages) return;

    let cancelled = false;
    const run = () => {
      if (!cancelled) loadSavedQuestions();
    };

    const canUseIdle =
      typeof window !== "undefined" && "requestIdleCallback" in window;
    const idleId = canUseIdle
      ? window.requestIdleCallback(run)
      : window.setTimeout(run, 0);

    return () => {
      cancelled = true;
      if (canUseIdle) {
        window.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, [loadingPassages, loadSavedQuestions]);

  useEffect(() => {
    if (queueCounts.done > 0) loadSavedQuestions();
  }, [queueCounts.done, loadSavedQuestions]);

  // ── Load saved prompts ──
  const loadSavedPrompts = useCallback(async () => {
    const prompts = await getCustomPrompts("QUESTION_GENERATION");
    setSavedPrompts(
      prompts.map((p) => ({ id: p.id, name: p.name, content: p.content })),
    );
  }, []);
  useEffect(() => {
    loadSavedPrompts();
  }, [loadSavedPrompts]);

  // ── Parse analysis from passage data (already loaded with list) ──
  useEffect(() => {
    if (!selectedPassage) {
      setAnalysisData(null);
      return;
    }
    if (selectedPassage.analysis?.analysisData) {
      try {
        const parsed =
          typeof selectedPassage.analysis.analysisData === "string"
            ? JSON.parse(selectedPassage.analysis.analysisData)
            : selectedPassage.analysis.analysisData;
        setAnalysisData(parsed);
      } catch {
        setAnalysisData(null);
      }
    } else {
      setAnalysisData(null);
    }
    setLoadingAnalysis(false);
  }, [selectedPassage?.id]);

  // ── Handlers ──
  const setTypeCount = useCallback((id: string, count: number) => {
    setTypeCounts((prev) => {
      const next = { ...prev };
      if (count <= 0) delete next[id];
      else next[id] = count;
      return next;
    });
  }, []);

  const handleSelectPassage = useCallback((p: PassageItem) => {
    setSelectedPassage(p);
  }, []);

  // ── Checkbox toggle ──
  const toggleCheckbox = useCallback(
    (id: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        // If exactly 1 selected, also set as selectedPassage
        if (next.size === 1) {
          const selectedId = Array.from(next)[0];
          const p = passages.find((pp) => pp.id === selectedId);
          if (p) setSelectedPassage(p);
        }
        return next;
      });
    },
    [passages],
  );

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredPassages.map((p) => p.id)));
  }, [filteredPassages]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // ── Open analysis detail modal ──
  const handleOpenAnalysisModal = useCallback(async (passageId: string) => {
    setLoadingAnalysisModal(true);
    try {
      const { getWorkbenchPassage } = await import("@/actions/workbench");
      const result = await getWorkbenchPassage(passageId);
      if (result) {
        setAnalysisModalPassage(result);
      } else {
        toast.error("지문 데이터를 불러올 수 없습니다.");
      }
    } catch {
      toast.error("지문 로딩 실패");
    } finally {
      setLoadingAnalysisModal(false);
    }
  }, []);

  const applyReviewState = useCallback(
    (questionIds: string[], approved: boolean) => {
      if (questionIds.length === 0) return;
      const set = new Set(questionIds);
      setSavedQuestions((prev) =>
        prev.map((q) => (set.has(q.id) ? { ...q, approved } : q)),
      );
      setDetailQuestion((prev) =>
        prev && set.has(prev.id) ? { ...prev, approved } : prev,
      );
      setSessionQueue((prev) =>
        prev.map((item) => {
          if (!item.questionIds?.some((id) => id && set.has(id))) return item;
          const questions = item.questions.map((q, qi) => {
            const id = item.questionIds?.[qi];
            return id && set.has(id) ? { ...q, approved } : q;
          });
          return {
            ...item,
            questions,
            status: questions.every((q) => q.approved)
              ? "reviewed"
              : item.status === "reviewed"
                ? "done"
                : item.status,
          };
        }),
      );
    },
    [setSessionQueue],
  );

  const handleApproveQuestion = useCallback(
    async (questionId: string) => {
      const result = await approveWorkbenchQuestion(questionId);
      if (!result.success) {
        toast.error(result.error || "검수완료 처리에 실패했습니다.");
        return;
      }
      applyReviewState([questionId], true);
      toast.success("검수완료 처리됐습니다.");
      loadSavedQuestions();
    },
    [loadSavedQuestions, applyReviewState],
  );

  const handleUnapproveQuestion = useCallback(
    async (questionId: string) => {
      const result = await unapproveWorkbenchQuestion(questionId);
      if (!result.success) {
        toast.error(result.error || "검수취소 처리에 실패했습니다.");
        return;
      }
      applyReviewState([questionId], false);
      toast.success("검수취소 처리됐습니다.");
      loadSavedQuestions();
    },
    [loadSavedQuestions, applyReviewState],
  );

  const handleDeleteQuestion = useCallback(
    async (questionId: string) => {
      if (!questionId) return;
      if (!confirm("이 문제를 삭제하시겠습니까?")) return;
      const result = await deleteWorkbenchQuestion(questionId);
      if (!result.success) {
        toast.error(result.error || "삭제에 실패했습니다.");
        return;
      }
      setSavedQuestions((prev) => prev.filter((q) => q.id !== questionId));
      setDetailQuestion((prev) => (prev?.id === questionId ? null : prev));
      toast.success("삭제됐습니다.");
      loadSavedQuestions();
    },
    [loadSavedQuestions],
  );

  const handleBatchApproveQuestions = useCallback(
    async (questionIds: string[]) => {
      if (questionIds.length === 0) return;
      const result = await bulkApproveWorkbenchQuestions(questionIds);
      if (result.success && result.approvedIds.length > 0) {
        const failed = Math.max(0, result.requested - result.approved);
        applyReviewState(result.approvedIds, true);
        toast.success(
          `${result.approved}개 문제가 검수완료 처리됐습니다.${failed > 0 ? ` (${failed}개 건너뜀)` : ""}`,
        );
        loadSavedQuestions();
      } else if (!result.success) {
        toast.error(result.error || "일괄 검수완료 처리에 실패했습니다.");
      }
    },
    [applyReviewState, loadSavedQuestions],
  );

  // ── Generation handlers (extracted to hook) ──
  const { handleBatchGenerate, handleGenerate, handleSaveQuestions } =
    useGenerationHandlers({
      passages,
      selectedIds,
      setSelectedIds,
      genMode,
      generationPlan,
      typeCounts,
      setTypeCounts,
      activeTypes,
      difficulty,
      customPrompt,
      questionTypeSettings,
      autoCount,
      selectedPassage,
      analysisData,
      totalQuestions,
      setSessionQueue,
      reviewItem,
      setReviewModalId,
      loadSavedQuestions,
    });

  // ── Can generate? ──
  const canGenerate =
    selectedIds.size > 0 &&
    (genMode === "auto" ? autoCount > 0 : totalQuestions > 0);

  return (
    <div className="-m-6 min-h-[calc(100vh-56px)] min-w-0 bg-[#F4F6F9] px-4 py-4 sm:px-6 xl:px-8">
      <main className="flex w-full min-w-0 flex-col gap-4">
        {/* ═══ TOP SECTION: 지문 관리(좌) + 문제생성 작업대(우) ═══ */}
        <WorkspaceShell
          leftLabel="지문"
          header={
            <WorkflowPageTitle
              icon={QuestionGenerationIcon}
              title="문제 생성"
              description="분석된 지문을 선택하고 유형과 난이도를 설정해 문제를 생성합니다."
            />
          }
          left={
            /* ═══ LEFT PANEL: Passage cards ═══ */
            <PassageCardGrid
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
              onRemoveSelectedFromCollection={
                handleRemoveSelectedPassagesFromCollection
              }
              onDeleteSelectedPassages={handleDeleteSelectedPassages}
              passageBulkAction={passageBulkAction}
              genMode={genMode}
              totalQuestions={totalQuestions}
              handleBatchGenerate={handleBatchGenerate}
              handleOpenAnalysisModal={handleOpenAnalysisModal}
            />
          }
          right={
            /* ═══ RIGHT PANEL: Generation settings ═══ */
            <GenerationConfigPanel
              genMode={genMode}
              setGenMode={setGenMode}
              generationPlan={generationPlan}
              setGenerationPlan={setGenerationPlan}
              autoCount={autoCount}
              setAutoCount={setAutoCount}
              typeCounts={typeCounts}
              setTypeCount={setTypeCount}
              setTypeCounts={setTypeCounts}
              questionTypeSettings={questionTypeSettings}
              setQuestionTypeSettings={setQuestionTypeSettings}
              totalQuestions={totalQuestions}
              difficulty={difficulty}
              setDifficulty={setDifficulty}
              customPrompt={customPrompt}
              setCustomPrompt={setCustomPrompt}
              savedPrompts={savedPrompts}
              showSavedPrompts={showSavedPrompts}
              setShowSavedPrompts={setShowSavedPrompts}
              showSaveInput={showSaveInput}
              setShowSaveInput={setShowSaveInput}
              savePromptName={savePromptName}
              setSavePromptName={setSavePromptName}
              savingPrompt={savingPrompt}
              setSavingPrompt={setSavingPrompt}
              editingPromptId={editingPromptId}
              setEditingPromptId={setEditingPromptId}
              editingName={editingName}
              setEditingName={setEditingName}
              loadSavedPrompts={loadSavedPrompts}
              canGenerate={canGenerate}
              selectedIds={selectedIds}
              handleBatchGenerate={handleBatchGenerate}
              maxIrrelevantSlotCount={maxIrrelevantSlotCount}
              irrelevantPassageSentenceCount={irrelevantPassageSentenceCount}
              irrelevantLimitPassageTitle={
                irrelevantPassageContext?.title ?? null
              }
              irrelevantLimitSelectedCount={
                irrelevantPassageContext?.selectedCount ?? 0
              }
              irrelevantLongestPassageSentenceCount={
                irrelevantPassageContext?.longestSentenceCount ?? null
              }
              irrelevantLongestPassageTitle={
                irrelevantPassageContext?.longestTitle ?? null
              }
            />
          }
        />

        {/* ═══ BOTTOM SECTION: 생성된 문제 (최신순) ═══ */}
        <section className="relative rounded-lg border border-slate-200 bg-white shadow-sm">
          <BottomQueueSection
            sessionQueue={sessionQueue}
            filteredQueue={filteredQueue}
            queueFilter={queueFilter}
            setQueueFilter={setQueueFilter}
            queueCounts={queueCounts}
            autoCount={autoCount}
            savedQuestions={savedQuestions}
            loadingSavedQuestions={loadingSavedQuestions}
            setDetailQuestion={setDetailQuestion}
            onApproveQuestion={handleApproveQuestion}
            onUnapproveQuestion={handleUnapproveQuestion}
            onBatchApproveQuestions={handleBatchApproveQuestions}
            onDeleteQuestion={handleDeleteQuestion}
            onEditQuestion={editor.openEditor}
          />
        </section>
      </main>
      {/* end vertical stack */}

      {/* ─── Review Modal ─── */}
      {reviewItem && (
        <QuestionReviewModal
          open={!!reviewModalId}
          onClose={() => setReviewModalId(null)}
          passageTitle={reviewItem.passageTitle}
          passageContent={reviewItem.passageContent}
          analysisData={reviewItem.analysisData}
          passageMeta={reviewItem.passageMeta}
          questions={reviewItem.questions}
          onSave={handleSaveQuestions}
          onRegenerate={() => {
            setReviewModalId(null);
            const p = passages.find((pp) => pp.id === reviewItem.passageId);
            if (p) {
              handleSelectPassage(p);
              if (reviewItem.config.mode === "manual") {
                setGenMode("manual");
                setTypeCounts(reviewItem.config.typeCounts);
                setQuestionTypeSettings(
                  reviewItem.config.questionTypeSettings ||
                    getDefaultQuestionTypeGenerationSettings(),
                );
              } else {
                setGenMode("auto");
              }
              setGenerationPlan(reviewItem.config.generationPlan || "STANDARD");
              setDifficulty(reviewItem.config.difficulty as any);
              setCustomPrompt(reviewItem.config.prompt);
            }
          }}
        />
      )}

      {/* ─── Question Detail Modal ─── */}
      {detailQuestion && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setDetailQuestion(null)}
          />
          <div className="relative z-10 w-full max-w-[1200px] mx-4 my-4 bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-slate-200 shrink-0">
              <div className="flex min-w-0 items-center gap-2.5">
                <h2 className="text-[15px] font-bold text-slate-800">
                  문제 상세
                </h2>
                <ReviewStatusStamp approved={detailQuestion.approved} className="shrink-0" />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {detailQuestion.approved ? (
                  <button
                    type="button"
                    onClick={() => handleUnapproveQuestion(detailQuestion.id)}
                    className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-red-200 bg-red-50 px-2.5 text-[11px] font-semibold text-red-600 shadow-none transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-700"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    검수취소
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleApproveQuestion(detailQuestion.id)}
                    className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-green-200 bg-green-50/60 px-2.5 text-[11px] font-semibold text-green-700 shadow-none transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-800"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    검수완료
                  </button>
                )}
                <button
                  onClick={() => setDetailQuestion(null)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100"
                  aria-label="닫기"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>
            {/* Content: 2 columns */}
            <div className="flex-1 overflow-hidden grid grid-cols-2">
              {/* Left: Passage */}
              <div className="border-r border-slate-200 overflow-y-auto">
                {detailQuestion.passage ? (
                  <div className="px-6 py-5">
                    <InteractivePassageView
                      content={detailQuestion.passage.content}
                      analysisData={(() => {
                        const p = passages.find(
                          (pp) => pp.id === detailQuestion.passage?.id,
                        );
                        if (!p?.analysis?.analysisData) return null;
                        try {
                          return typeof p.analysis.analysisData === "string"
                            ? JSON.parse(p.analysis.analysisData)
                            : p.analysis.analysisData;
                        } catch {
                          return null;
                        }
                      })()}
                      layout="vertical"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                    지문 없음
                  </div>
                )}
              </div>
              {/* Right: Question */}
              <div className="overflow-y-auto px-6 py-5">
                <QuestionCard
                  q={detailQuestion}
                  num={1}
                  readonly
                  hideReviewStatusStamp
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <EditQuestionDialog
        open={editor.editDialogOpen}
        onOpenChange={(open) => {
          if (!open) editor.closeEditor();
          else editor.setEditDialogOpen(true);
        }}
        loading={editor.questionLoading}
        loadError={editor.questionLoadError}
        editingQuestion={editor.editingQuestion}
        editingQuestionId={editor.editingQuestionId}
        onClose={editor.closeEditor}
        onDeleted={editor.handleEditorDeleted}
        onRetry={editor.openEditor}
        onSaved={loadSavedQuestions}
        onApproved={loadSavedQuestions}
      />

      {/* ─── Analysis Detail Modal ─── */}
      {analysisModalPassage && (
        <PassageAnalysisModal
          open={!!analysisModalPassage}
          onClose={() => setAnalysisModalPassage(null)}
          passage={analysisModalPassage}
          initialAnalysis={
            analysisModalPassage.analysis?.analysisData
              ? typeof analysisModalPassage.analysis.analysisData === "string"
                ? JSON.parse(analysisModalPassage.analysis.analysisData)
                : analysisModalPassage.analysis.analysisData
              : null
          }
        />
      )}

      {/* Loading overlay for analysis modal fetch */}
      {loadingAnalysisModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
          <div className="bg-white rounded-xl px-6 py-4 shadow-xl flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-[13px] text-slate-700 font-medium">
              지문 분석 데이터 로딩 중...
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
