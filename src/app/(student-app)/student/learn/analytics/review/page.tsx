"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, RotateCcw, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getReviewPassageList } from "@/actions/student-wrong-answers";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CAT_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  VOCAB: { label: "어휘", bg: "bg-violet-50", text: "text-violet-600" },
  INTERPRETATION: { label: "해석", bg: "bg-blue-50", text: "text-blue-600" },
  GRAMMAR: { label: "문법", bg: "bg-amber-50", text: "text-amber-600" },
  COMPREHENSION: { label: "이해", bg: "bg-emerald-50", text: "text-emerald-600" },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PassageItem {
  passageId: string;
  passageTitle: string;
  wrongTotal: number;
  wrongCategories: Record<string, number>;
  wrongQuestionIds: string[];
}

interface SeasonGroup {
  seasonId: string;
  seasonName: string;
  seasonType: string;
  passages: PassageItem[];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReviewPage() {
  const router = useRouter();
  const [data, setData] = useState<SeasonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPassage, setSelectedPassage] = useState<PassageItem | null>(null);

  useEffect(() => {
    getReviewPassageList()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-32 mb-6" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  // 오답 있는 지문만 필터
  const hasWrong = data.some((s) => s.passages.some((p) => p.wrongTotal > 0));

  return (
    <div className="max-w-lg mx-auto pb-8">
      <div className="px-5 pt-2 pb-1">
        <p className="text-[var(--fs-xs)] text-gray-500">복습할 지문을 선택하세요</p>
      </div>

      {!hasWrong ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] px-5 text-center">
          <div className="size-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
            <Check className="size-8 text-emerald-500" />
          </div>
          <h2 className="text-[var(--fs-lg)] font-bold text-gray-700 mb-1">오답이 없어요!</h2>
          <p className="text-[var(--fs-base)] text-gray-500">학습을 진행하면 복습할 내용이 여기에 나타나요</p>
        </div>
      ) : (
        <div className="px-5 space-y-6">
          {data.map((season) => {
            const wrongPassages = season.passages.filter((p) => p.wrongTotal > 0);
            const perfectPassages = season.passages.filter((p) => p.wrongTotal === 0);
            if (season.passages.length === 0) return null;

            return (
              <div key={season.seasonId}>
                {/* 시즌 헤더 */}
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="w-[var(--icon-sm)] h-[var(--icon-sm)] text-gray-400" />
                  <h2 className="text-[var(--fs-md)] font-bold text-gray-700">{season.seasonName}</h2>
                  <span className="text-[var(--fs-caption)] text-gray-500">
                    {season.seasonType === "EXAM_PREP" ? "내신 집중" : "평상시"}
                  </span>
                </div>

                {/* 오답 있는 지문 (오답 많은 순) */}
                <div className="space-y-2">
                  {wrongPassages
                    .sort((a, b) => b.wrongTotal - a.wrongTotal)
                    .map((passage) => (
                      <button
                        key={passage.passageId}
                        onClick={() => setSelectedPassage(passage)}
                        className="w-full bg-white rounded-2xl p-4 text-left shadow-[0_2px_12px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-transform"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[var(--fs-base)] font-medium text-gray-800 truncate flex-1 mr-2">
                            {passage.passageTitle}
                          </p>
                          <span className="text-[var(--fs-xs)] font-bold text-rose-500">
                            {passage.wrongTotal}회
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {Object.entries(passage.wrongCategories)
                            .sort(([, a], [, b]) => b - a)
                            .map(([cat, count]) => {
                              const c = CAT_CONFIG[cat];
                              return c ? (
                                <span key={cat} className={cn("text-[var(--fs-caption)] font-bold px-1.5 py-0.5 rounded-full", c.bg, c.text)}>
                                  {c.label} {count}
                                </span>
                              ) : null;
                            })}
                        </div>
                      </button>
                    ))}

                  {/* 오답 없는 지문 */}
                  {perfectPassages.length > 0 && (
                    <div className="bg-emerald-50/50 rounded-2xl p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Check className="w-[var(--icon-sm)] h-[var(--icon-sm)] text-emerald-500" />
                        <span className="text-[var(--fs-xs)] font-medium text-emerald-600">
                          완벽! ({perfectPassages.length}개 지문)
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {perfectPassages.map((p) => (
                          <span key={p.passageId} className="text-[var(--fs-caption)] text-emerald-500 bg-emerald-100 px-2 py-0.5 rounded-full">
                            {p.passageTitle.length > 15 ? p.passageTitle.substring(0, 15) + "..." : p.passageTitle}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 카테고리 선택 바텀시트 */}
      <AnimatePresence>
        {selectedPassage && (
          <CategorySelectSheet
            passage={selectedPassage}
            onClose={() => setSelectedPassage(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CategorySelectSheet — 복습 카테고리 선택
// ---------------------------------------------------------------------------
function CategorySelectSheet({
  passage,
  onClose,
}: {
  passage: PassageItem;
  onClose: () => void;
}) {
  const router = useRouter();

  const goReview = (questionIds: string[]) => {
    router.push(
      `/student/learn/${passage.passageId}/session?mode=review&questionIds=${questionIds.join(",")}`
    );
  };

  // 카테고리별 questionIds는 서버에서 구분 안 했으므로 전체만 가능
  // 카테고리별 필터링이 필요하면 서버 액션 수정 필요
  const categories = Object.entries(passage.wrongCategories)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/40 z-50"
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl"
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <div className="px-5 pb-8">
          <h3 className="text-[var(--fs-lg)] font-bold text-gray-900 mb-1">
            {passage.passageTitle}
          </h3>
          <p className="text-[var(--fs-xs)] text-gray-500 mb-5">복습할 유형을 선택하세요</p>

          <div className="space-y-2">
            {/* 전체 복습 */}
            <button
              onClick={() => goReview(passage.wrongQuestionIds)}
              className="w-full flex items-center justify-between p-4 bg-gray-800 text-white rounded-2xl active:bg-gray-900"
            >
              <div>
                <p className="text-[var(--fs-md)] font-bold">전체 복습</p>
                <p className="text-[var(--fs-xs)] text-gray-500">{passage.wrongQuestionIds.length}문제</p>
              </div>
              <RotateCcw className="w-[var(--icon-sm)] h-[var(--icon-sm)]" />
            </button>

            {/* 카테고리별 */}
            {categories.map(([cat, count]) => {
              const c = CAT_CONFIG[cat];
              if (!c) return null;
              return (
                <button
                  key={cat}
                  onClick={() => {
                    // 전체 questionIds 전달 (서버에서 카테고리 필터링)
                    router.push(
                      `/student/learn/${passage.passageId}/session?mode=review&category=${cat}&questionIds=${passage.wrongQuestionIds.join(",")}`
                    );
                  }}
                  className={cn("w-full flex items-center justify-between p-4 rounded-2xl active:scale-[0.98]", c.bg)}
                >
                  <div>
                    <p className={cn("text-[var(--fs-md)] font-bold", c.text)}>{c.label} 복습</p>
                    <p className="text-[var(--fs-xs)] text-gray-500">{count}회 오답</p>
                  </div>
                  <RotateCcw className={cn("w-[var(--icon-sm)] h-[var(--icon-sm)]", c.text)} />
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>
    </>
  );
}
