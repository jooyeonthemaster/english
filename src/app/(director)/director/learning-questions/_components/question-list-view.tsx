"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Search,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Trash2,
  SquareCheck,
  Square,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  approveNaeshinQuestion,
  deleteNaeshinQuestion,
  bulkApproveNaeshinQuestions,
  bulkDeleteNaeshinQuestions,
} from "@/actions/learning-questions";
import { LEARNING_CATEGORIES } from "@/lib/learning-constants";
import { QuestionDetail } from "../question-detail";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  SUBTYPE_LABELS,
  DIFFICULTY_LABELS,
  type QuestionItem,
  type SetItem,
  getPreviewText,
} from "./question-constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Props {
  set: SetItem | null;
  data: {
    questions: QuestionItem[];
    total: number;
    page: number;
    totalPages: number;
  };
  filters: Record<string, string | undefined>;
  category: string;
  onBack: () => void;
  onUpdateParam: (key: string, value: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function QuestionListView({
  set,
  data,
  filters,
  category,
  onBack,
  onUpdateParam,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const toggleSelectAll = () => {
    setSelected(
      selected.size === data.questions.length
        ? new Set()
        : new Set(data.questions.map((q) => q.id))
    );
  };

  const handleApprove = async (id: string) => {
    const r = await approveNaeshinQuestion(id);
    if (r.success) {
      toast.success("승인됨");
      router.refresh();
    } else toast.error(r.error);
  };
  const handleDelete = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    const r = await deleteNaeshinQuestion(id);
    if (r.success) {
      toast.success("삭제됨");
      router.refresh();
    } else toast.error(r.error);
  };
  const handleBulkApprove = async () => {
    if (selected.size === 0) return;
    const r = await bulkApproveNaeshinQuestions([...selected]);
    if (r.success) {
      toast.success(`${selected.size}개 승인`);
      setSelected(new Set());
      router.refresh();
    } else toast.error(r.error);
  };
  const handleBulkDelete = async () => {
    if (selected.size === 0 || !confirm(`${selected.size}개 삭제?`)) return;
    const r = await bulkDeleteNaeshinQuestions([...selected]);
    if (r.success) {
      toast.success(`${selected.size}개 삭제`);
      setSelected(new Set());
      router.refresh();
    } else toast.error(r.error);
  };
  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    router.push(`/director/learning-questions?${params.toString()}`);
  };

  // 서브타입별 그룹핑
  const bySubType: Record<string, QuestionItem[]> = {};
  for (const q of data.questions) {
    const key = q.subType || "기타";
    if (!bySubType[key]) bySubType[key] = [];
    bySubType[key].push(q);
  }

  const catLabel = CATEGORY_LABELS[category] || category;
  const colors = CATEGORY_COLORS[category] || {
    badge: "bg-slate-100 text-slate-600",
    bg: "border-l-slate-300",
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div>
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-[13px] text-slate-500 hover:text-blue-600 mb-3"
        >
          <ArrowLeft className="w-4 h-4" /> 카테고리 대시보드
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <span className={cn("px-2 py-0.5 rounded-lg text-[13px]", colors.badge)}>
                {catLabel}
              </span>
              {set?.title}
            </h1>
            <p className="text-[12px] text-slate-500 mt-0.5">
              {data.total}문제
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input
            placeholder="문제 내용 검색..."
            defaultValue={filters.search || ""}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                onUpdateParam("search", e.currentTarget.value);
            }}
            className="w-full h-8 pl-10 pr-3 text-xs rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 placeholder:text-slate-400"
          />
        </div>
        {/* 난이도 필터 */}
        {Object.entries(DIFFICULTY_LABELS).map(([val, label]) => (
          <button
            key={val}
            onClick={() =>
              onUpdateParam(
                "difficulty",
                filters.difficulty === val ? "" : val
              )
            }
            className={cn(
              "text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-all",
              filters.difficulty === val
                ? "bg-blue-50 border-blue-300 text-blue-700"
                : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
            )}
          >
            {label}
          </button>
        ))}
        {/* 승인 필터 */}
        <button
          onClick={() =>
            onUpdateParam(
              "approved",
              filters.approved === "true"
                ? ""
                : filters.approved === "false"
                  ? ""
                  : "false"
            )
          }
          className={cn(
            "text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-all",
            filters.approved === "false"
              ? "bg-amber-50 border-amber-300 text-amber-700"
              : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
          )}
        >
          미승인만
        </button>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 rounded-lg border border-blue-200">
          <span className="text-xs font-semibold text-blue-600">
            {selected.size}개 선택
          </span>
          <button
            onClick={handleBulkApprove}
            className="text-xs font-medium px-3 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
          >
            일괄 승인
          </button>
          <button
            onClick={handleBulkDelete}
            className="text-xs font-medium px-3 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700"
          >
            일괄 삭제
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-blue-400 hover:text-blue-600 ml-auto"
          >
            선택 해제
          </button>
        </div>
      )}

      {/* Questions grouped by subtype */}
      {data.questions.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border">
          <p className="text-sm text-slate-400">문제가 없습니다.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 px-2">
            <button onClick={toggleSelectAll} className="text-slate-400 hover:text-slate-600">
              {selected.size === data.questions.length ? (
                <SquareCheck className="w-4 h-4 text-blue-600" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </button>
            <span className="text-[11px] text-slate-400">전체 선택</span>
          </div>

          {Object.entries(bySubType).map(([subType, questions]) => (
            <SubTypeGroup
              key={subType}
              subType={subType}
              questions={questions}
              selected={selected}
              expandedId={expandedId}
              onToggleSelect={toggleSelect}
              onToggleExpand={(id) =>
                setExpandedId(expandedId === id ? null : id)
              }
              onApprove={handleApprove}
              onDelete={handleDelete}
            />
          ))}
        </>
      )}

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => goToPage(data.page - 1)}
            disabled={data.page <= 1}
            className="w-8 h-8 rounded-lg border flex items-center justify-center text-slate-400 disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-slate-600 px-3">
            {data.page} / {data.totalPages}
          </span>
          <button
            onClick={() => goToPage(data.page + 1)}
            disabled={data.page >= data.totalPages}
            className="w-8 h-8 rounded-lg border flex items-center justify-center text-slate-400 disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SubType Group (접이식)
// ---------------------------------------------------------------------------
function SubTypeGroup({
  subType,
  questions,
  selected,
  expandedId,
  onToggleSelect,
  onToggleExpand,
  onApprove,
  onDelete,
}: {
  subType: string;
  questions: QuestionItem[];
  selected: Set<string>;
  expandedId: string | null;
  onToggleSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onApprove: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const approvedCount = questions.filter((q) => q.approved).length;

  return (
    <div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 hover:border-slate-300 mb-2 transition-all"
      >
        {collapsed ? (
          <ChevronRight className="w-4 h-4 text-slate-300" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
        <span className="text-[13px] font-semibold text-slate-800">
          {SUBTYPE_LABELS[subType] || subType}
        </span>
        <span className="text-[11px] text-slate-400">
          {questions.length}문제 · 승인 {approvedCount}
        </span>
      </button>
      {!collapsed && (
        <div className="space-y-1.5 ml-5">
          {questions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              isSelected={selected.has(q.id)}
              isExpanded={expandedId === q.id}
              onToggleSelect={() => onToggleSelect(q.id)}
              onToggleExpand={() => onToggleExpand(q.id)}
              onApprove={() => onApprove(q.id)}
              onDelete={() => onDelete(q.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question Card
// ---------------------------------------------------------------------------
function QuestionCard({
  question: q,
  isSelected,
  isExpanded,
  onToggleSelect,
  onToggleExpand,
  onApprove,
  onDelete,
}: {
  question: QuestionItem;
  isSelected: boolean;
  isExpanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onApprove: () => void;
  onDelete: () => void;
}) {
  const colors = CATEGORY_COLORS[q.learningCategory] || {
    badge: "bg-slate-100 text-slate-600",
    bg: "border-l-slate-300",
  };
  const preview = getPreviewText(q.subType, q.questionText);

  return (
    <div
      className={cn(
        "bg-white rounded-lg border border-l-4 transition-all",
        colors.bg,
        isSelected && "ring-2 ring-blue-200"
      )}
    >
      <div
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer"
        onClick={onToggleExpand}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          className="shrink-0"
        >
          {isSelected ? (
            <SquareCheck className="w-4 h-4 text-blue-600" />
          ) : (
            <Square className="w-4 h-4 text-slate-300" />
          )}
        </button>
        <p className="flex-1 text-[13px] text-slate-700 truncate min-w-0">
          {preview}
        </p>
        <div
          className="flex items-center gap-2 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-[10px] px-1.5 py-0.5 rounded-lg bg-slate-100 text-slate-500 font-medium">
            {DIFFICULTY_LABELS[q.difficulty] || q.difficulty}
          </span>
          {q.approved ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          ) : (
            <button onClick={onApprove} title="승인">
              <Clock className="w-4 h-4 text-amber-400 hover:text-emerald-500" />
            </button>
          )}
          <button onClick={onDelete} title="삭제">
            <Trash2 className="w-3.5 h-3.5 text-slate-300 hover:text-red-500" />
          </button>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-300" />
          )}
        </div>
      </div>
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100">
          <QuestionDetail
            subType={q.subType}
            questionText={q.questionText}
            correctAnswer={q.correctAnswer}
            explanation={q.explanation?.content || null}
          />
        </div>
      )}
    </div>
  );
}
