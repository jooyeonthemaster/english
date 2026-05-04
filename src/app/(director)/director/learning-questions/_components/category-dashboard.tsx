"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Sparkles, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getSetCategoryStats, approveCategoryQuestions } from "@/actions/learning-questions";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  SUBTYPE_LABELS,
  type SetItem,
} from "./question-constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Props {
  set: SetItem;
  onBack: () => void;
  onSelectCategory: (category: string) => void;
}

interface CategoryStat {
  total: number;
  approved: number;
  subtypes: Record<string, number>;
  difficulties: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function CategoryDashboard({ set, onBack, onSelectCategory }: Props) {
  const router = useRouter();
  const [stats, setStats] = useState<{
    total: number;
    approved: number;
    categories: Record<string, CategoryStat>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);

  useEffect(() => {
    getSetCategoryStats(set.id)
      .then(setStats)
      .catch(() => toast.error("통계 로딩 실패"))
      .finally(() => setLoading(false));
  }, [set.id]);

  async function handleApproveCategory(category: string) {
    setApproving(category);
    try {
      const r = await approveCategoryQuestions(set.id, category);
      if (r.success) {
        toast.success(`${CATEGORY_LABELS[category]} 전체 승인 완료`);
        // 통계 갱신
        const updated = await getSetCategoryStats(set.id);
        setStats(updated);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    } finally {
      setApproving(null);
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-20 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!stats) return null;

  const approvedPct = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0;
  const categoryOrder = ["VOCAB", "INTERPRETATION", "GRAMMAR", "COMPREHENSION"];

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div>
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-[13px] text-slate-500 hover:text-blue-600 mb-3"
        >
          <ArrowLeft className="w-4 h-4" /> 세트 목록
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">{set.title}</h1>
            <div className="flex items-center gap-2 mt-1 text-[12px] text-slate-500">
              <span className="font-medium text-blue-600">{set.publisher}</span>
              {set.grade && <span>· {set.grade}학년</span>}
              <span>
                · {stats.total}문제 · 승인 {stats.approved}/{stats.total} ({approvedPct}%)
              </span>
            </div>
          </div>
          <Link href="/director/workbench/generate-learning">
            <button className="h-8 px-3 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> 추가 생성
            </button>
          </Link>
        </div>
      </div>

      {/* 전체 승인 프로그레스 바 */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center justify-between text-[13px] text-slate-600 mb-2">
          <span>전체 승인 현황</span>
          <span className="font-bold">
            {stats.approved}/{stats.total} ({approvedPct}%)
          </span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${approvedPct}%` }}
          />
        </div>
      </div>

      {/* 카테고리 4개 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {categoryOrder.map((cat) => {
          const catStats = stats.categories[cat];
          if (!catStats) return null;
          const colors = CATEGORY_COLORS[cat];
          const catApprovedPct =
            catStats.total > 0
              ? Math.round((catStats.approved / catStats.total) * 100)
              : 0;

          return (
            <div
              key={cat}
              className={cn(
                "bg-white rounded-lg border-l-4 border p-4 hover:shadow-sm transition-shadow",
                colors.bg
              )}
            >
              {/* 헤더 */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{CATEGORY_ICONS[cat]}</span>
                  <h3 className="text-[15px] font-bold text-slate-800">
                    {CATEGORY_LABELS[cat]}
                  </h3>
                </div>
                <span className={cn("text-[12px] font-semibold px-2 py-0.5 rounded-full", colors.badge)}>
                  {catStats.total}문제
                </span>
              </div>

              {/* 승인 현황 */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                  <span>
                    승인 {catStats.approved}/{catStats.total}
                  </span>
                  <span>{catApprovedPct}%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-all"
                    style={{ width: `${catApprovedPct}%` }}
                  />
                </div>
              </div>

              {/* 서브타입 분포 */}
              <div className="space-y-1 mb-4">
                {Object.entries(catStats.subtypes)
                  .sort(([, a], [, b]) => b - a)
                  .map(([subType, count]) => (
                    <div
                      key={subType}
                      className="flex items-center justify-between text-[11px]"
                    >
                      <span className="text-slate-500">
                        {SUBTYPE_LABELS[subType] || subType}
                      </span>
                      <span className="text-slate-700 font-medium">
                        {count}
                      </span>
                    </div>
                  ))}
              </div>

              {/* 액션 버튼 */}
              <div className="flex gap-2">
                <button
                  onClick={() => onSelectCategory(cat)}
                  className="flex-1 h-8 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  문제 보기 →
                </button>
                {catStats.approved < catStats.total && (
                  <button
                    onClick={() => handleApproveCategory(cat)}
                    disabled={approving === cat}
                    className="h-8 px-3 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-1"
                  >
                    {approving === cat ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3" />
                    )}
                    일괄 승인
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
