// @ts-nocheck
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Sparkles,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Eye,
  X,
  Calendar,
} from "lucide-react";
import { saveNaeshinQuestions } from "@/actions/learning-questions";
import {
  SUBTYPE_TO_CATEGORY,
  SUBTYPE_TO_INTERACTION,
  LEARNING_SUBTYPE_LABELS,
  GRADE_LEVELS,
} from "@/lib/learning-constants";
import { LearningPassageGrid } from "./learning-passage-grid";
import { LearningConfigPanel } from "./learning-config-panel";
import { LearningQueueSection } from "./learning-queue-section";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PassageItem {
  id: string;
  title: string;
  content: string;
  grade: number | null;
  semester?: string | null;
  school?: { id: string; name: string } | null;
  wordCount?: number;
  analysis?: { id: string } | null;
}

export interface QueueItem {
  id: string;
  passageId: string;
  passageTitle: string;
  category: string;
  status: "generating" | "done" | "error";
  questions: GeneratedQuestion[];
  error?: string;
}

export interface GeneratedQuestion {
  _typeId: string;
  _typeLabel: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Main Component — 대시보드형 레이아웃
// ---------------------------------------------------------------------------

export function GenerateLearningClient({ academyId }: { academyId: string }) {
  const router = useRouter();

  // ── Passage data ──
  const [passages, setPassages] = useState<PassageItem[]>([]);
  const [loadingPassages, setLoadingPassages] = useState(true);

  // ── Filter options + collections ──
  const [filterOptions, setFilterOptions] = useState<{
    schools: { id: string; name: string }[];
    grades: number[];
    semesters: string[];
  }>({ schools: [], grades: [], semesters: [] });
  const [collections, setCollections] = useState<
    { id: string; name: string; _count: { items: number } }[]
  >([]);

  // ── Search/filter ──
  const [search, setSearch] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterSchool, setFilterSchool] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");

  // ── Selected passages (multi-select) ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Generation config ──
  const [genMode, setGenMode] = useState<"auto" | "manual">("auto");
  const [autoCount, setAutoCount] = useState(10);
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});

  // ── Queue ──
  const [sessionQueue, setSessionQueue] = useState<QueueItem[]>([]);
  const [queueFilter, setQueueFilter] = useState<"all" | "done" | "error">("all");

  // ── Save modal ──
  const [showSaveModal, setShowSaveModal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Computed ──
  const totalQuestions = useMemo(
    () => Object.values(typeCounts).reduce((a, b) => a + b, 0),
    [typeCounts]
  );

  const activeFilterCount = [filterSchool, filterGrade, filterSemester].filter(Boolean).length;

  const filteredPassages = useMemo(() => {
    return passages.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !p.title.toLowerCase().includes(q) &&
          !p.content.toLowerCase().includes(q)
        )
          return false;
      }
      if (filterGrade && p.grade !== Number(filterGrade)) return false;
      if (filterSchool && p.school?.id !== filterSchool) return false;
      if (filterSemester && p.semester !== filterSemester) return false;
      if (selectedCollectionId && !(p as any).collectionItems?.some((ci: any) => ci.collectionId === selectedCollectionId)) return false;
      return true;
    });
  }, [passages, search, filterGrade, filterSchool, filterSemester, selectedCollectionId]);

  const autoTotal = autoCount * 4; // 지문당 총 문제 수
  const canGenerate =
    selectedIds.size > 0 &&
    (genMode === "auto"
      ? autoCount > 0
      : totalQuestions > 0 && totalQuestions <= 300);

  const queueCounts = useMemo(
    () => ({
      generating: sessionQueue.filter((q) => q.status === "generating").length,
      done: sessionQueue.filter((q) => q.status === "done").length,
      error: sessionQueue.filter((q) => q.status === "error").length,
    }),
    [sessionQueue]
  );

  const filteredQueue = useMemo(() => {
    if (queueFilter === "all") return sessionQueue;
    return sessionQueue.filter((q) => q.status === queueFilter);
  }, [sessionQueue, queueFilter]);

  // ── Load passages + filters + collections ──
  useEffect(() => {
    setLoadingPassages(true);
    fetch(`/api/passages/list?academyId=${academyId}`)
      .then((r) => r.json())
      .then((data) => {
        setPassages(data.passages || []);
        if (data.filters) setFilterOptions(data.filters);
        if (data.collections) setCollections(data.collections);
      })
      .catch(() => {})
      .finally(() => setLoadingPassages(false));
  }, [academyId]);

  // ── Checkbox handlers ──
  const toggleCheckbox = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredPassages.map((p) => p.id)));
  }, [filteredPassages]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // ── Generation handler ──
  const parseQuestions = (
    data: Record<string, unknown>
  ): GeneratedQuestion[] => {
    const questions: GeneratedQuestion[] = [];
    for (const [typeId, items] of Object.entries(
      (data.results as Record<string, unknown[]>) || {}
    )) {
      for (const item of items as Record<string, unknown>[]) {
        questions.push({
          ...item,
          _typeId: typeId,
          _typeLabel: LEARNING_SUBTYPE_LABELS[typeId] || typeId,
        });
      }
    }
    return questions;
  };

  const handleBatchGenerate = async () => {
    if (!canGenerate) return;

    // 선택된 각 지문에 대해 큐 아이템 생성
    for (const passageId of selectedIds) {
      const passage = passages.find((p) => p.id === passageId);
      if (!passage) continue;

      // 카테고리별 counts 계산
      let byCategory: Record<string, Record<string, number>> = {};

      if (genMode === "auto") {
        // 자동: 카테고리별 서브타입 균등 분배
        const AUTO_SUBTYPES: Record<string, string[]> = {
          VOCAB: ["WORD_MEANING", "WORD_MEANING_REVERSE", "WORD_FILL", "WORD_MATCH", "WORD_SPELL", "VOCAB_SYNONYM", "VOCAB_DEFINITION", "VOCAB_COLLOCATION", "VOCAB_CONFUSABLE"],
          INTERPRETATION: ["SENTENCE_INTERPRET", "SENTENCE_COMPLETE", "WORD_ARRANGE", "KEY_EXPRESSION", "SENT_CHUNK_ORDER"],
          GRAMMAR: ["GRAMMAR_SELECT", "ERROR_FIND", "ERROR_CORRECT", "GRAM_TRANSFORM", "GRAM_BINARY"],
          COMPREHENSION: ["TRUE_FALSE", "CONTENT_QUESTION", "PASSAGE_FILL", "CONNECTOR_FILL"],
        };
        for (const [cat, subtypes] of Object.entries(AUTO_SUBTYPES)) {
          const perItem = Math.floor(autoCount / subtypes.length);
          const remainder = autoCount % subtypes.length;
          const counts: Record<string, number> = {};
          subtypes.forEach((st, i) => {
            counts[st] = perItem + (i < remainder ? 1 : 0);
          });
          byCategory[cat] = counts;
        }
      } else {
        // 수동: typeCounts에서 카테고리별 그룹핑
        for (const [typeId, count] of Object.entries(typeCounts)) {
          if (count <= 0) continue;
          const cat = SUBTYPE_TO_CATEGORY[typeId] || "VOCAB";
          if (!byCategory[cat]) byCategory[cat] = {};
          byCategory[cat][typeId] = count;
        }
      }

      // 카테고리별 큐 아이템 추가 + 병렬 API 호출
      for (const [category, counts] of Object.entries(byCategory)) {
        const queueId = `${passageId}-${category}-${Date.now()}`;
        const queueItem: QueueItem = {
          id: queueId,
          passageId,
          passageTitle: passage.title,
          category,
          status: "generating",
          questions: [],
        };

        setSessionQueue((prev) => [...prev, queueItem]);

        // 비동기 API 호출
        (async () => {
          try {
            const res = await fetch("/api/ai/generate-learning-question", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ passageId, category, counts }),
            });
            const data = await res.json();
            if (data.error) {
              setSessionQueue((prev) =>
                prev.map((q) =>
                  q.id === queueId
                    ? { ...q, status: "error", error: data.error }
                    : q
                )
              );
              return;
            }
            const questions = parseQuestions(data);
            setSessionQueue((prev) =>
              prev.map((q) =>
                q.id === queueId
                  ? { ...q, status: "done", questions }
                  : q
              )
            );
          } catch (e) {
            setSessionQueue((prev) =>
              prev.map((q) =>
                q.id === queueId
                  ? { ...q, status: "error", error: "생성 실패" }
                  : q
              )
            );
          }
        })();
      }
    }

    toast.success(`${selectedIds.size}개 지문 생성 시작`);
  };

  // ── Save handler ──
  const handleSave = async (
    queueItem: QueueItem,
    setInfo: {
      publisher: string;
      textbook?: string;
      grade?: number;
      unit?: string;
    }
  ) => {
    setSaving(true);
    try {
      const passage = passages.find((p) => p.id === queueItem.passageId);
      const questionsToSave = queueItem.questions.map((q) => ({
        passageId: queueItem.passageId,
        type: SUBTYPE_TO_INTERACTION[q._typeId] || "FOUR_CHOICE",
        subType: q._typeId || null,
        questionText: JSON.stringify(
          Object.fromEntries(
            Object.entries(q).filter(
              ([k]) =>
                !k.startsWith("_") &&
                k !== "explanation" &&
                k !== "correctAnswer"
            )
          )
        ),
        options: null,
        correctAnswer: String(
          q.correctAnswer ?? q.isTrue ?? q.isCorrect ?? ""
        ),
        difficulty: "INTERMEDIATE",
        tags: null,
        explanation:
          typeof q.explanation === "string" ? q.explanation : null,
        keyPoints: null,
        wrongOptionExplanations: null,
      }));

      const result = await saveNaeshinQuestions(questionsToSave, {
        passageId: queueItem.passageId,
        publisher: setInfo.publisher,
        textbook: setInfo.textbook,
        grade: setInfo.grade,
        unit: setInfo.unit,
        title: passage?.title || "",
      });

      if (result.success) {
        toast.success(
          `${queueItem.questions.length}개 문제 저장 완료`
        );
        // 큐에서 제거
        setSessionQueue((prev) =>
          prev.filter((q) => q.id !== queueItem.id)
        );
      } else {
        toast.error(result.error || "저장 실패");
      }
    } catch {
      toast.error("저장 중 오류");
    } finally {
      setSaving(false);
      setShowSaveModal(null);
    }
  };

  // ── Type count setter ──
  const setTypeCount = useCallback((id: string, count: number) => {
    setTypeCounts((prev) => {
      const next = { ...prev };
      if (count <= 0) delete next[id];
      else next[id] = count;
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center gap-4 px-8 py-4 bg-white border-b shrink-0">
        <Link
          href="/director/workbench"
          className="flex items-center justify-center w-9 h-9 rounded-xl hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-slate-500" />
        </Link>
        <div className="flex-1">
          <h1 className="text-[18px] font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            학습 문제 생성
          </h1>
        </div>
        {/* 상태 배지 */}
        <div className="flex items-center gap-3">
          {queueCounts.generating > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200">
              <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
              <span className="text-[12px] font-semibold text-blue-700">
                생성중 {queueCounts.generating}
              </span>
            </div>
          )}
          {queueCounts.done > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200">
              <Eye className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-[12px] font-semibold text-amber-700">
                미저장 {queueCounts.done}
              </span>
            </div>
          )}
          {queueCounts.error > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 border border-red-200">
              <X className="w-3.5 h-3.5 text-red-600" />
              <span className="text-[12px] font-semibold text-red-700">
                오류 {queueCounts.error}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ═══ MAIN: 지문 그리드 + 설정 사이드바 ═══ */}
      <div className="grid grid-cols-[1fr_420px] bg-white h-[420px] shrink-0">
        {/* LEFT: Passage Grid */}
        <LearningPassageGrid
          passages={filteredPassages}
          totalPassages={passages.length}
          loading={loadingPassages}
          filterOptions={filterOptions}
          collections={collections}
          search={search}
          setSearch={setSearch}
          filterGrade={filterGrade}
          setFilterGrade={setFilterGrade}
          filterSchool={filterSchool}
          setFilterSchool={setFilterSchool}
          filterSemester={filterSemester}
          setFilterSemester={setFilterSemester}
          showFilters={showFilters}
          setShowFilters={setShowFilters}
          activeFilterCount={activeFilterCount}
          selectedCollectionId={selectedCollectionId}
          setSelectedCollectionId={setSelectedCollectionId}
          selectedIds={selectedIds}
          toggleCheckbox={toggleCheckbox}
          selectAll={selectAll}
          deselectAll={deselectAll}
          canGenerate={canGenerate}
          handleBatchGenerate={handleBatchGenerate}
        />

        {/* RIGHT: Config Panel */}
        <LearningConfigPanel
          genMode={genMode}
          setGenMode={setGenMode}
          autoCount={autoCount}
          setAutoCount={setAutoCount}
          typeCounts={typeCounts}
          setTypeCount={setTypeCount}
          setTypeCounts={setTypeCounts}
          totalQuestions={totalQuestions}
          canGenerate={canGenerate}
          selectedIds={selectedIds}
          handleBatchGenerate={handleBatchGenerate}
        />
      </div>

      {/* ═══ DIVIDER ═══ */}
      <div className="h-3 bg-[#E8EAEE] shrink-0 border-y border-slate-200/60" />

      {/* ═══ BOTTOM: Queue + Results ═══ */}
      <LearningQueueSection
        queue={filteredQueue}
        queueFilter={queueFilter}
        setQueueFilter={setQueueFilter}
        queueCounts={queueCounts}
        showSaveModal={showSaveModal}
        setShowSaveModal={setShowSaveModal}
        saving={saving}
        onSave={handleSave}
        onRemove={(id) =>
          setSessionQueue((prev) => prev.filter((q) => q.id !== id))
        }
      />
    </div>
  );
}
