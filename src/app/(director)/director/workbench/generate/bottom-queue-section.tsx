// @ts-nocheck
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  AlertTriangle,
  Braces,
  Gem,
  Sparkles,
} from "lucide-react";
import { QuestionCard, type QuestionCardItem } from "@/components/workbench/question-card";
import { type QueueItem, buildQuestionText } from "./generate-page-types";
import {
  getQuestionGenerationPlanFromTags,
  mergeQuestionGenerationPlanTag,
  QUESTION_GENERATION_PLAN_TAGS,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";

// ─── Props ───────────────────────────────────────────

interface BottomQueueSectionProps {
  // Session queue
  sessionQueue: QueueItem[];
  filteredQueue: QueueItem[];
  queueFilter: "all" | "error";
  setQueueFilter: (v: "all" | "error") => void;
  queueCounts: { generating: number; done: number; error: number };
  autoCount: number;

  // Saved questions
  savedQuestions: QuestionCardItem[];
  loadingSavedQuestions: boolean;

  // Detail handler
  setDetailQuestion: (q: QuestionCardItem | null) => void;
}

type SavedQuestionPlanFilter = "ALL" | QuestionGenerationPlan;

function parseQuestionTags(rawTags: unknown): string[] {
  if (Array.isArray(rawTags)) return rawTags.filter((tag): tag is string => typeof tag === "string");
  if (typeof rawTags !== "string") return [];
  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return rawTags.split(/[,;|]/).map((tag) => tag.trim()).filter(Boolean);
  }
}

function getQuestionPlan(q: QuestionCardItem): QuestionGenerationPlan | null {
  const tagPlan = getQuestionGenerationPlanFromTags(parseQuestionTags(q.tags));
  if (tagPlan) return tagPlan;

  if (q.structuredData && typeof q.structuredData === "object" && "_generationPlan" in q.structuredData) {
    const plan = (q.structuredData as { _generationPlan?: unknown })._generationPlan;
    if (plan === "STANDARD" || plan === "PREMIUM") return plan;
  }

  return null;
}

function matchesPlanFilter(q: QuestionCardItem, filter: SavedQuestionPlanFilter): boolean {
  if (filter === "ALL") return true;
  const plan = getQuestionPlan(q);
  if (filter === "PREMIUM") return plan === "PREMIUM";
  return plan !== "PREMIUM";
}

function withVisiblePlanTag(q: QuestionCardItem): QuestionCardItem {
  const plan = getQuestionPlan(q) ?? "STANDARD";
  return {
    ...q,
    tags: JSON.stringify(mergeQuestionGenerationPlanTag(parseQuestionTags(q.tags), plan)),
  };
}

// ─── Component ───────────────────────────────────────

export function BottomQueueSection({
  sessionQueue,
  filteredQueue,
  queueFilter,
  setQueueFilter,
  queueCounts,
  autoCount,
  savedQuestions,
  loadingSavedQuestions,
  setDetailQuestion,
}: BottomQueueSectionProps) {
  const [savedPlanFilter, setSavedPlanFilter] = useState<SavedQuestionPlanFilter>("ALL");
  const savedPlanCounts = useMemo(() => {
    const premium = savedQuestions.filter((q) => getQuestionPlan(q) === "PREMIUM").length;
    return {
      ALL: savedQuestions.length,
      STANDARD: savedQuestions.length - premium,
      PREMIUM: premium,
    };
  }, [savedQuestions]);
  const visibleSavedQuestions = useMemo(
    () => savedQuestions.filter((q) => matchesPlanFilter(q, savedPlanFilter)),
    [savedQuestions, savedPlanFilter],
  );

  return (
    <div className="bg-[#F0F2F5]">
      <div className="px-8 pt-5 pb-8 space-y-5">

        {/* -- Session queue (generating/done/reviewed) -- */}
        {sessionQueue.length > 0 && (
          <div>
            <div className="flex items-center gap-4 mb-3">
              <h3 className="text-[14px] font-bold text-slate-800">현재 세션</h3>
              {queueCounts.error > 0 && (
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white border border-slate-200">
                  {(["all", "error"] as const).map((f) => {
                    const labels = { all: "전체", error: "오류" };
                    const counts = { all: sessionQueue.length, error: queueCounts.error };
                    return (
                      <button key={f} onClick={() => setQueueFilter(f)}
                        className={`text-[11px] px-3 py-1.5 rounded-md font-semibold transition-all ${
                          queueFilter === f ? "bg-blue-50 text-blue-700 shadow-sm" : "text-slate-400 hover:text-slate-600"
                        }`}>{labels[f]} {counts[f]}</button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredQueue.map((item) => {
                // Generating: show loading card
                if (item.status === "generating") {
                  const progressDone = Object.values(item.progress).filter(v => v === "done").length;
                  const progressTotal = Math.max(1, Object.keys(item.progress).length);
                  return (
                    <div key={item.id} className="relative rounded-xl border border-blue-300 bg-white p-4 overflow-hidden">
                      <div className="absolute -inset-px rounded-xl border-2 border-blue-400/40 animate-pulse pointer-events-none" />
                      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-blue-100">
                        <div className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all duration-700"
                          style={{ width: `${Math.max(8, (progressDone / progressTotal) * 100)}%` }} />
                      </div>
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-500 shrink-0" />
                        <div>
                          <h4 className="text-[13px] font-bold text-slate-800 truncate">{item.passageTitle}</h4>
                          <span className="text-[11px] text-blue-500 font-medium">
                            {item.config.mode === "auto" ? `${autoCount}문제 생성 중...` : `${Object.values(item.config.typeCounts).reduce((a, b) => a + b, 0)}문제 생성 중...`}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Error: show error card
                if (item.status === "error") {
                  return (
                    <div key={item.id} className="rounded-xl border border-red-200 bg-red-50/30 p-4">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                        <div>
                          <h4 className="text-[13px] font-bold text-slate-800 truncate">{item.passageTitle}</h4>
                          <span className="text-[11px] text-red-500 font-medium">생성 실패</span>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Done/reviewed: show each question as QuestionCard
                return item.questions.map((q: any, qi: number) => {
                  // Convert session question to QuestionCardItem format
                  const cardItem: QuestionCardItem = {
                    id: `${item.id}-${qi}`,
                    type: q.options ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
                    subType: q._typeId || q.subType || null,
                    questionText: buildQuestionText(q),
                    options: q.options ? JSON.stringify(q.options) : null,
                    correctAnswer: q.correctAnswer || q.modelAnswer || "",
                    difficulty: q.difficulty || "INTERMEDIATE",
                    tags: Array.isArray(q.tags) ? JSON.stringify(q.tags) : q.tags ? String(q.tags) : null,
                    aiGenerated: true,
                    approved: true,
                    createdAt: new Date(),
                    passage: { id: item.passageId, title: item.passageTitle, content: item.passageContent },
                    explanation: q.explanation ? {
                      id: `${item.id}-${qi}-exp`,
                      content: q.explanation,
                      keyPoints: q.keyPoints ? JSON.stringify(q.keyPoints) : null,
                      wrongOptionExplanations: q.wrongOptionExplanations ? JSON.stringify(q.wrongOptionExplanations) : null,
                    } : null,
                    structuredData: q,
                  };
                  return (
                    <div key={`${item.id}-${qi}`} onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest('button') || target.closest('a') || target.closest('input')) return;
                      setDetailQuestion(cardItem);
                    }} className="cursor-pointer">
                      <QuestionCard q={cardItem} num={qi + 1} readonly compact />
                    </div>
                  );
                });
              })}
            </div>
          </div>
        )}

        {/* -- Saved questions from DB -- */}
        <div>
          <div className="flex flex-col gap-2 mb-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-[14px] font-bold text-slate-800">
              저장된 문제 {savedQuestions.length > 0 && <span className="text-slate-400 font-normal ml-1">{visibleSavedQuestions.length}/{savedQuestions.length}개</span>}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex max-w-full items-center gap-1 overflow-x-auto p-0.5 rounded-lg bg-white border border-slate-200">
                {([
                  { id: "ALL", label: "전체", count: savedPlanCounts.ALL, Icon: Sparkles },
                  { id: "STANDARD", label: QUESTION_GENERATION_PLAN_TAGS.STANDARD, count: savedPlanCounts.STANDARD, Icon: Sparkles },
                  { id: "PREMIUM", label: QUESTION_GENERATION_PLAN_TAGS.PREMIUM, count: savedPlanCounts.PREMIUM, Icon: Gem },
                ] as const).map(({ id, label, count, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSavedPlanFilter(id)}
                    className={`h-7 px-2.5 rounded-md inline-flex items-center gap-1.5 text-[11px] font-semibold transition-all ${
                      savedPlanFilter === id
                        ? "bg-blue-50 text-blue-700 shadow-sm"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{label}</span>
                    <span className={savedPlanFilter === id ? "text-blue-500" : "text-slate-400"}>{count}</span>
                  </button>
                ))}
              </div>
              {savedQuestions.length > 0 && (
                <Link href="/director/questions" className="text-[12px] text-blue-600 hover:text-blue-700 font-medium">
                  문제은행 전체 보기 →
                </Link>
              )}
            </div>
          </div>
          {loadingSavedQuestions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            </div>
          ) : savedQuestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 opacity-60">
              <Braces className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-[13px] text-slate-400">아직 저장된 문제가 없습니다</p>
            </div>
          ) : visibleSavedQuestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 opacity-60">
              <Braces className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-[13px] text-slate-400">선택한 생성 태그에 해당하는 문제가 없습니다</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {visibleSavedQuestions.slice(0, 30).map((q, i) => {
                const cardQuestion = withVisiblePlanTag(q);
                return (
                <div key={q.id} onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest('button') || target.closest('a') || target.closest('input')) return;
                  setDetailQuestion(cardQuestion);
                }} className="cursor-pointer">
                  <QuestionCard q={cardQuestion} num={i + 1} readonly compact />
                </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
