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
  ChevronDown,
  Eye,
  ShoppingBasket,
  X,
  Calendar,
} from "lucide-react";
import {
  MobileStepHeader,
  MobileStepNav,
} from "@/components/workbench/mobile-step-flow";
import { saveNaeshinQuestions } from "@/actions/learning-questions";
import { notifyCreditsChanged } from "@/lib/credits-client";
import {
  beginLearningGenerationTask,
  settleLearningGenerationTask,
} from "@/lib/learning-generation-tracker";
import {
  SUBTYPE_TO_CATEGORY,
  SUBTYPE_TO_INTERACTION,
  LEARNING_SUBTYPE_LABELS,
  GRADE_LEVELS,
} from "@/lib/learning-constants";
import {
  mergeQuestionGenerationPlanTag,
  normalizeQuestionGenerationPlan,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
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
  generationPlan?: QuestionGenerationPlan;
}

export interface GeneratedQuestion {
  _typeId: string;
  _typeLabel: string;
  [key: string]: unknown;
}

function readLearningTags(rawTags: unknown): string[] {
  if (Array.isArray(rawTags)) {
    return rawTags.filter((tag): tag is string => typeof tag === "string");
  }
  if (typeof rawTags !== "string") return [];
  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return rawTags
      .split(/[,;|]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
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
  const [generationPlan, setGenerationPlan] =
    useState<QuestionGenerationPlan>("STANDARD");
  const [autoCount, setAutoCount] = useState(10);
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});

  // ── Queue ──
  const [sessionQueue, setSessionQueue] = useState<QueueItem[]>([]);
  const [queueFilter, setQueueFilter] = useState<"all" | "done" | "error">(
    "all",
  );

  // ── 모바일(<lg) 전용 스텝 플로우 — 문제 생성 페이지와 동일한 UX 문법.
  //    데스크톱은 3구역 대시보드 그대로(모든 분기 max-lg 한정). 스텝 전환은
  //    CSS 숨김(언마운트 아님)이라 생성 큐 폴링·설정 상태가 유지된다. ──
  const [mobileStep, setMobileStep] = useState<"select" | "config" | "results">(
    "select",
  );
  // 하단 고정 '담긴 지문' 장바구니 펼침 상태(선택 스텝 전용).
  const [cartOpen, setCartOpen] = useState(false);
  const goToMobileStep = useCallback(
    (step: "select" | "config" | "results") => {
      setMobileStep(step);
      setCartOpen(false);
      window.scrollTo({ top: 0 });
    },
    [],
  );

  // ── Save modal ──
  const [showSaveModal, setShowSaveModal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Computed ──
  const totalQuestions = useMemo(
    () => Object.values(typeCounts).reduce((a, b) => a + b, 0),
    [typeCounts],
  );

  const activeFilterCount = [filterSchool, filterGrade, filterSemester].filter(
    Boolean,
  ).length;

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
      if (
        selectedCollectionId &&
        !(p as any).collectionItems?.some(
          (ci: any) => ci.collectionId === selectedCollectionId,
        )
      )
        return false;
      return true;
    });
  }, [
    passages,
    search,
    filterGrade,
    filterSchool,
    filterSemester,
    selectedCollectionId,
  ]);

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
    [sessionQueue],
  );

  // 모바일 장바구니 목록 — 선택된 지문(제목 표시·개별 빼기용).
  const selectedPassages = useMemo(
    () => passages.filter((p) => selectedIds.has(p.id)),
    [passages, selectedIds],
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
    data: Record<string, unknown>,
  ): GeneratedQuestion[] => {
    const questions: GeneratedQuestion[] = [];
    const responsePlan = normalizeQuestionGenerationPlan(
      data.generationPlan || generationPlan,
    );
    for (const [typeId, items] of Object.entries(
      (data.results as Record<string, unknown[]>) || {},
    )) {
      for (const item of items as Record<string, unknown>[]) {
        const itemPlan = normalizeQuestionGenerationPlan(
          item._generationPlan || responsePlan,
        );
        questions.push({
          ...item,
          _typeId: typeId,
          _typeLabel: LEARNING_SUBTYPE_LABELS[typeId] || typeId,
          _generationPlan: itemPlan,
          tags: mergeQuestionGenerationPlanTag(
            readLearningTags(item.tags),
            itemPlan,
          ),
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
      const byCategory: Record<string, Record<string, number>> = {};

      if (genMode === "auto") {
        // 자동: 카테고리별 서브타입 균등 분배
        const AUTO_SUBTYPES: Record<string, string[]> = {
          VOCAB: [
            "WORD_MEANING",
            "WORD_MEANING_REVERSE",
            "WORD_FILL",
            "WORD_MATCH",
            "WORD_SPELL",
            "VOCAB_SYNONYM",
            "VOCAB_DEFINITION",
            "VOCAB_COLLOCATION",
            "VOCAB_CONFUSABLE",
          ],
          INTERPRETATION: [
            "SENTENCE_INTERPRET",
            "SENTENCE_COMPLETE",
            "WORD_ARRANGE",
            "KEY_EXPRESSION",
            "SENT_CHUNK_ORDER",
          ],
          GRAMMAR: [
            "GRAMMAR_SELECT",
            "ERROR_FIND",
            "ERROR_CORRECT",
            "GRAM_TRANSFORM",
            "GRAM_BINARY",
          ],
          COMPREHENSION: [
            "TRUE_FALSE",
            "CONTENT_QUESTION",
            "PASSAGE_FILL",
            "CONNECTOR_FILL",
          ],
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
          generationPlan,
        };

        setSessionQueue((prev) => [...prev, queueItem]);
        // 페이지를 벗어나도 다른 워크벤치 화면에서 진행 상태가 보이도록 전역 트래커에 등록
        beginLearningGenerationTask({
          id: queueId,
          passageId,
          passageTitle: passage.title,
          category,
        });

        // 비동기 API 호출
        (async () => {
          try {
            const res = await fetch("/api/ai/generate-learning-question", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                passageId,
                category,
                counts,
                generationPlan,
              }),
            });
            const data = await res.json();
            if (data.error) {
              settleLearningGenerationTask(queueId, "error");
              setSessionQueue((prev) =>
                prev.map((q) =>
                  q.id === queueId
                    ? { ...q, status: "error", error: data.error }
                    : q,
                ),
              );
              return;
            }
            const questions = parseQuestions(data);
            settleLearningGenerationTask(queueId, "done");
            setSessionQueue((prev) =>
              prev.map((q) =>
                q.id === queueId
                  ? {
                      ...q,
                      status: "done",
                      questions,
                      generationPlan: normalizeQuestionGenerationPlan(
                        data.generationPlan || generationPlan,
                      ),
                    }
                  : q,
              ),
            );
          } catch (e) {
            settleLearningGenerationTask(queueId, "error");
            setSessionQueue((prev) =>
              prev.map((q) =>
                q.id === queueId
                  ? { ...q, status: "error", error: "생성 실패" }
                  : q,
              ),
            );
          } finally {
            notifyCreditsChanged(); // 차감/실패환급 즉시 사이드바 반영
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
    },
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
                k !== "tags" &&
                k !== "explanation" &&
                k !== "correctAnswer",
            ),
          ),
        ),
        options: null,
        correctAnswer: String(q.correctAnswer ?? q.isTrue ?? q.isCorrect ?? ""),
        difficulty: "INTERMEDIATE",
        tags: JSON.stringify(
          mergeQuestionGenerationPlanTag(
            readLearningTags(q.tags),
            normalizeQuestionGenerationPlan(
              q._generationPlan || queueItem.generationPlan || generationPlan,
            ),
          ),
        ),
        explanation: typeof q.explanation === "string" ? q.explanation : null,
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
        toast.success(`${queueItem.questions.length}개 문제 저장 완료`);
        // 큐에서 제거
        setSessionQueue((prev) => prev.filter((q) => q.id !== queueItem.id));
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
    // 모바일: 하단 고정 바(장바구니/스텝 네비)에 가리지 않게 바 높이만큼 아래
    // 여백을 예약한다(선택 스텝은 장바구니+버튼이라 더 크게). 데스크톱 무변경.
    <div
      className={
        "flex flex-col min-h-[100dvh] overflow-x-hidden lg:h-[calc(100vh-64px)] lg:min-h-0 lg:overflow-hidden " +
        (mobileStep === "select" ? "max-lg:pb-[136px]" : "max-lg:pb-[96px]")
      }
    >
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center gap-4 px-4 py-4 bg-white border-b shrink-0 lg:px-8">
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
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200">
              <Eye className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-[12px] font-semibold text-slate-700">
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

      {/* ═══ 모바일 전용 진행 스텝 — 문제 생성 페이지와 동일한 공용 스텝 헤더 ═══ */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-2 py-2 lg:hidden">
        <MobileStepHeader
          steps={[
            { key: "select", label: "지문 선택" },
            { key: "config", label: "유형 설정" },
            { key: "results", label: "자료 확인" },
          ]}
          currentKey={mobileStep}
          onSelect={(key) => goToMobileStep(key as typeof mobileStep)}
        />
      </div>

      {/* ═══ MAIN: 지문 그리드 + 설정 사이드바 ═══ */}
      <div className="grid grid-cols-1 bg-white shrink-0 lg:grid-cols-[1fr_420px] lg:h-[420px]">
        {/* LEFT: Passage Grid — 모바일은 '지문 선택' 스텝에서만 노출(콘텐츠 높이,
            10개/페이지 페이지네이션이 목록을 바운드). PC는 lg:contents 그대로. */}
        <div
          className={
            "grid overflow-hidden lg:contents" +
            (mobileStep === "select" ? "" : " max-lg:hidden")
          }
        >
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
          onPassageRenamed={(passageId, title) =>
            setPassages((prev) =>
              prev.map((p) => (p.id === passageId ? { ...p, title } : p)),
            )
          }
          selectAll={selectAll}
          deselectAll={deselectAll}
          canGenerate={canGenerate}
          handleBatchGenerate={handleBatchGenerate}
        />
        </div>

        {/* RIGHT: Config Panel — 모바일은 '유형 설정' 스텝에서만 노출. */}
        <div
          className={
            "grid overflow-hidden lg:contents" +
            (mobileStep === "config" ? "" : " max-lg:hidden")
          }
        >
        <LearningConfigPanel
          genMode={genMode}
          setGenMode={setGenMode}
          autoCount={autoCount}
          setAutoCount={setAutoCount}
          typeCounts={typeCounts}
          setTypeCount={setTypeCount}
          setTypeCounts={setTypeCounts}
          generationPlan={generationPlan}
          setGenerationPlan={setGenerationPlan}
          totalQuestions={totalQuestions}
          canGenerate={canGenerate}
          selectedIds={selectedIds}
          handleBatchGenerate={handleBatchGenerate}
        />
        </div>
      </div>

      {/* ═══ DIVIDER — 모바일 스텝 화면에선 구역 경계가 없으므로 숨김 ═══ */}
      <div className="h-3 bg-[#E8EAEE] shrink-0 border-y border-slate-200/60 max-lg:hidden" />

      {/* ═══ BOTTOM: Queue + Results — 모바일은 '자료 확인' 스텝에서만 노출.
          숨김은 CSS(max-lg:hidden)라 큐 폴링·저장 상태는 계속 산다. ═══ */}
      <div
        className={
          "lg:contents" + (mobileStep === "results" ? "" : " max-lg:hidden")
        }
      >
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

      {/* ═══ 모바일 전용 하단 고정 바 (lg:hidden) ═══
          선택 스텝: '담긴 지문' 장바구니(펼치면 목록·빼기) + 다음 버튼.
          설정 스텝: 이전/생성 실행(성공 시 자료 확인으로). 확인 스텝: 이전만. */}
      {mobileStep === "select" ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {cartOpen && selectedPassages.length > 0 ? (
            <div className="flex max-h-[40vh] min-h-0 flex-col border-b border-slate-100 bg-slate-50/70">
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {selectedPassages.map((p, i) => (
                  <div
                    key={p.id}
                    className="mb-1.5 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 last:mb-0"
                  >
                    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-blue-600 text-[10.5px] font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-700">
                      {p.title || "제목 없는 지문"}
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
            onClick={() => setCartOpen((open) => !open)}
            aria-expanded={cartOpen}
            aria-label={cartOpen ? "담긴 지문 목록 접기" : "담긴 지문 목록 펼치기"}
            className="flex w-full shrink-0 items-center gap-2.5 border-b border-slate-100 bg-white px-3 py-2 text-left"
          >
            <span className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <ShoppingBasket className="size-5" aria-hidden="true" />
              {selectedPassages.length > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-white">
                  {selectedPassages.length}
                </span>
              ) : null}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[12.5px] font-bold text-slate-900">
                담긴 지문 {selectedPassages.length}개
              </span>
              <span className="truncate text-[10.5px] text-slate-400">
                {selectedPassages.length > 0
                  ? "탭하여 담긴 지문 보기·빼기"
                  : "지문을 눌러 담아보세요"}
              </span>
            </span>
            <ChevronDown
              className={
                "size-4 shrink-0 text-slate-400 transition-transform" +
                (cartOpen ? " rotate-180" : "")
              }
              aria-hidden="true"
            />
          </button>
          <div className="p-2.5">
            <button
              type="button"
              aria-disabled={selectedPassages.length === 0}
              onClick={() => {
                if (selectedPassages.length === 0) return;
                goToMobileStep("config");
              }}
              className={
                "inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border text-[14px] font-extrabold text-white shadow-sm transition-colors " +
                (selectedPassages.length === 0
                  ? "cursor-not-allowed border-blue-200 bg-blue-300"
                  : "cursor-pointer border-blue-600 bg-blue-600 hover:bg-blue-700")
              }
            >
              다음으로 (유형 설정)
            </button>
          </div>
        </div>
      ) : mobileStep === "config" ? (
        <MobileStepNav
          prev={{ label: "이전", onClick: () => goToMobileStep("select") }}
          next={{
            label: canGenerate
              ? `${selectedIds.size}개 지문 · ${genMode === "auto" ? `총 ${autoCount * 4}문제` : `총 ${totalQuestions}문제`} 생성`
              : "유형을 설정하세요",
            onClick: () => {
              handleBatchGenerate();
              goToMobileStep("results");
            },
            disabled: !canGenerate,
          }}
          hint={
            !canGenerate
              ? selectedIds.size === 0
                ? "지문을 먼저 선택하세요 (이전 단계)"
                : "생성할 문제 수를 설정하세요"
              : undefined
          }
        />
      ) : (
        <MobileStepNav
          prev={{ label: "이전", onClick: () => goToMobileStep("config") }}
          next={null}
        />
      )}
    </div>
  );
}
