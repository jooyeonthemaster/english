"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { LEARNING_CATEGORIES, SEASON_TYPES, GRADE_LEVELS } from "@/lib/learning-constants";
import { createSeason } from "@/actions/learning-admin";
import { toast } from "sonner";
import { Calendar, X } from "lucide-react";
import { SetListView } from "./_components/set-list-view";
import { CategoryDashboard } from "./_components/category-dashboard";
import { QuestionListView } from "./_components/question-list-view";
import type { SetItem, QuestionItem } from "./_components/question-constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Props {
  setsData: { sets: SetItem[]; publishers: string[] };
  questionsData: {
    questions: QuestionItem[];
    total: number;
    page: number;
    totalPages: number;
  } | null;
  currentSetId: string | null;
  filters: Record<string, string | undefined>;
}

// ---------------------------------------------------------------------------
// Main Component — 3단계 드릴다운
// 1. 세트 목록
// 2. 카테고리 대시보드 (세트 선택 시)
// 3. 문제 목록 (카테고리 선택 시)
// ---------------------------------------------------------------------------
export function LearningQuestionBankClient({
  setsData,
  questionsData,
  currentSetId,
  filters,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"questions" | "seasons">(
    searchParams.get("tab") === "seasons" ? "seasons" : "questions"
  );
  const [showSeasonModal, setShowSeasonModal] = useState(false);

  const selectedCategory = filters.learningCategory || null;

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`/director/learning-questions?${params.toString()}`);
  };

  const goToSet = (setId: string) => {
    router.push(`/director/learning-questions?setId=${setId}`);
  };

  const goToCategory = (category: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("learningCategory", category);
    params.delete("page");
    router.push(`/director/learning-questions?${params.toString()}`);
  };

  const goBackToSets = () => {
    router.push("/director/learning-questions");
  };

  const goBackToDashboard = () => {
    const params = new URLSearchParams();
    if (currentSetId) params.set("setId", currentSetId);
    router.push(`/director/learning-questions?${params.toString()}`);
  };

  // 시즌 관리 탭
  if (activeTab === "seasons" && !currentSetId) {
    const { SeasonManager } = require("./season-manager");
    return (
      <div className="p-6 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-slate-900">학습 관리</h1>
        </div>
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
        <SeasonManager />
      </div>
    );
  }

  // 3단계: 세트 선택 + 카테고리 선택 → 문제 목록
  if (currentSetId && selectedCategory && questionsData) {
    const currentSet = setsData.sets.find((s) => s.id === currentSetId) || null;
    return (
      <div className="p-6">
        <QuestionListView
          set={currentSet}
          data={questionsData}
          filters={filters}
          category={selectedCategory}
          onBack={goBackToDashboard}
          onUpdateParam={updateParam}
        />
      </div>
    );
  }

  // 2단계: 세트 선택 → 카테고리 대시보드
  if (currentSetId) {
    const currentSet = setsData.sets.find((s) => s.id === currentSetId);
    if (currentSet) {
      return (
        <div className="p-6">
          <CategoryDashboard
            set={currentSet}
            onBack={goBackToSets}
            onSelectCategory={goToCategory}
          />
        </div>
      );
    }
  }

  // 1단계: 세트 목록
  return (
    <div>
      <div className="px-6 pt-6 pb-0 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-slate-900">학습 관리</h1>
        </div>
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
      <div className="px-6">
        <SetListView
          setsData={setsData}
          filters={filters}
          onSelectSet={goToSet}
          onUpdateParam={updateParam}
          onOpenSeasonModal={() => setShowSeasonModal(true)}
        />
      </div>
      {showSeasonModal && (
        <CreateSeasonModal
          sets={setsData.sets}
          onClose={() => setShowSeasonModal(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Bar
// ---------------------------------------------------------------------------
function TabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (tab: "questions" | "seasons") => void;
}) {
  return (
    <div className="flex p-0.5 bg-slate-100 rounded-lg w-fit mb-5">
      <button
        onClick={() => onTabChange("questions")}
        className={cn(
          "px-4 py-1.5 rounded-md text-[13px] font-medium transition-all",
          activeTab === "questions"
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-500 hover:text-slate-700"
        )}
      >
        문제 은행
      </button>
      <button
        onClick={() => onTabChange("seasons")}
        className={cn(
          "px-4 py-1.5 rounded-md text-[13px] font-medium transition-all",
          activeTab === "seasons"
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-500 hover:text-slate-700"
        )}
      >
        내신 시즌 관리
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 내신 시즌 생성 모달
// ---------------------------------------------------------------------------
function CreateSeasonModal({
  sets,
  onClose,
}: {
  sets: SetItem[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<"EXAM_PREP" | "REGULAR">("EXAM_PREP");
  const [grade, setGrade] = useState<number | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedPassageIds, setSelectedPassageIds] = useState<Set<string>>(
    new Set()
  );
  const [submitting, setSubmitting] = useState(false);

  const passageMap = new Map<
    string,
    { id: string; title: string; questionCount: number; publishers: string[] }
  >();
  for (const set of sets) {
    if (grade && set.grade && set.grade !== grade) continue;
    const existing = passageMap.get(set.passage.id);
    if (existing) {
      existing.questionCount += set._count.questions;
      if (!existing.publishers.includes(set.publisher))
        existing.publishers.push(set.publisher);
    } else {
      passageMap.set(set.passage.id, {
        id: set.passage.id,
        title: set.passage.title,
        questionCount: set._count.questions,
        publishers: [set.publisher],
      });
    }
  }
  const passages = Array.from(passageMap.values());
  const canSubmit =
    name.trim() && startDate && endDate && selectedPassageIds.size > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await createSeason({
        name: name.trim(),
        type,
        grade,
        startDate,
        endDate,
        passageIds: Array.from(selectedPassageIds),
      });
      toast.success("내신 시즌이 생성되었습니다.");
      router.refresh();
      onClose();
    } catch {
      toast.error("시즌 생성 실패");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            내신 시즌 생성
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-xl"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <div className="px-5 pb-5 space-y-4">
          <div>
            <label className="text-[12px] font-semibold text-slate-700 block mb-1.5">
              시즌 이름 <span className="text-red-400">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 1학기 중간고사 대비"
              className="w-full h-9 px-3 text-[13px] rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-semibold text-slate-700 block mb-1.5">
                유형
              </label>
              <div className="flex gap-2">
                {SEASON_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={cn(
                      "flex-1 h-9 rounded-xl border text-[12px] font-medium transition-all",
                      type === t.value
                        ? t.value === "EXAM_PREP"
                          ? "bg-rose-50 border-rose-300 text-rose-700"
                          : "bg-emerald-50 border-emerald-300 text-emerald-700"
                        : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[12px] font-semibold text-slate-700 block mb-1.5">
                대상 학년
              </label>
              <select
                value={grade ?? ""}
                onChange={(e) => {
                  setGrade(e.target.value ? Number(e.target.value) : null);
                  setSelectedPassageIds(new Set());
                }}
                className="w-full h-9 px-3 text-[13px] rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-400"
              >
                <option value="">전체</option>
                {GRADE_LEVELS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-semibold text-slate-700 block mb-1.5">
                시작일 <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-9 px-3 text-[13px] rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="text-[12px] font-semibold text-slate-700 block mb-1.5">
                종료일 <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-9 px-3 text-[13px] rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-400"
              />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-semibold text-slate-700 block mb-1.5">
              시험 범위 지문 선택 <span className="text-red-400">*</span>
              <span className="text-slate-400 font-normal ml-1">
                ({selectedPassageIds.size}개 선택)
              </span>
            </label>
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {passages.length === 0 ? (
                <p className="text-[12px] text-slate-400 p-3 text-center">
                  해당 학년의 학습 문제가 있는 지문이 없습니다.
                </p>
              ) : (
                passages.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPassageIds.has(p.id)}
                      onChange={(e) => {
                        const next = new Set(selectedPassageIds);
                        if (e.target.checked) next.add(p.id);
                        else next.delete(p.id);
                        setSelectedPassageIds(next);
                      }}
                      className="rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-slate-700 truncate">
                        {p.title}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {p.publishers.join(", ")} · {p.questionCount}문제
                      </p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full h-11 rounded-xl text-[14px] font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {submitting
              ? "생성 중..."
              : `내신 시즌 생성 (${selectedPassageIds.size}개 지문)`}
          </button>
        </div>
      </div>
    </div>
  );
}
