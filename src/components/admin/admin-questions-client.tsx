// @ts-nocheck
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  HelpCircle,
  Filter,
  Layers,
  CheckCircle2,
  Clock,
  Star,
  ChevronDown,
  ChevronUp,
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import {
  TYPE_LABELS,
  SUBTYPE_LABELS,
  DIFFICULTY_CONFIG,
  TYPE_SUBTYPE_MAP,
} from "@/components/workbench/question-type-filter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuestionItem {
  id: string;
  type: string;
  subType: string | null;
  questionText: string;
  options: string | null;
  correctAnswer: string;
  points: number;
  difficulty: string;
  tags: string | null;
  aiGenerated: boolean;
  approved: boolean;
  starred: boolean;
  createdAt: Date;
  passage: {
    id: string;
    title: string;
    content: string;
    grade?: number | null;
    semester?: string | null;
    publisher?: string | null;
    school?: { id: string; name: string } | null;
  } | null;
  explanation: {
    id: string;
    content: string;
    keyPoints: string | null;
    wrongOptionExplanations: string | null;
  } | null;
  _count: { examLinks: number };
}

interface Props {
  questions: QuestionItem[];
  academyId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJSON<T>(str: unknown, fallback: T): T {
  if (!str) return fallback;
  if (typeof str !== "string") return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Readonly question card
// ---------------------------------------------------------------------------

function QuestionCard({ q, num }: { q: QuestionItem; num: number }) {
  const [expanded, setExpanded] = useState(false);
  const [passageOpen, setPassageOpen] = useState(false);
  const [explanationOpen, setExplanationOpen] = useState(false);

  const options = parseJSON<{ label: string; text: string }[]>(q.options, []);
  const diffConfig = DIFFICULTY_CONFIG[q.difficulty];

  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-4 transition-all",
        "hover:shadow-md border-slate-200",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13px] font-bold text-slate-500">{num}.</span>
        <Badge variant="outline" className="text-[10px]">
          {TYPE_LABELS[q.type] || q.type}
        </Badge>
        {q.subType && SUBTYPE_LABELS[q.subType] && (
          <Badge variant="outline" className="text-[10px] bg-slate-50">
            {SUBTYPE_LABELS[q.subType]}
          </Badge>
        )}
        {diffConfig && (
          <Badge
            variant="outline"
            className={cn("text-[10px]", diffConfig.className)}
          >
            {diffConfig.label}
          </Badge>
        )}
        {q.aiGenerated && (
          <Layers className="w-3.5 h-3.5 text-blue-400 shrink-0" />
        )}
        {q.approved ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        ) : (
          <Clock className="w-3.5 h-3.5 text-slate-300 shrink-0" />
        )}
        {q.starred && (
          <Star className="w-3.5 h-3.5 fill-blue-400 text-blue-400 shrink-0" />
        )}
        <div className="ml-auto">
          <button
            onClick={() => setExpanded(!expanded)}
            className={cn(
              "h-6 px-2 rounded-md flex items-center gap-1 text-[11px] font-semibold transition-all border",
              expanded
                ? "text-blue-600 bg-blue-50 border-blue-200"
                : "text-slate-500 bg-slate-50 border-slate-200 hover:bg-slate-100",
            )}
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                접기
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                펼치기
              </>
            )}
          </button>
        </div>
      </div>

      {/* Passage reference */}
      {q.passage && (
        <div className="mt-2 bg-slate-50 rounded-lg border border-slate-100">
          <button
            onClick={() => setPassageOpen(!passageOpen)}
            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="text-[11px] text-slate-600 truncate flex-1 text-left font-medium">
              {q.passage.title}
            </span>
            {passageOpen ? (
              <ChevronUp className="w-3 h-3 text-slate-400" />
            ) : (
              <ChevronDown className="w-3 h-3 text-slate-400" />
            )}
          </button>
          {passageOpen && q.passage.content && (
            <div className="px-2.5 pb-2 border-t border-slate-100">
              <p className="text-[11px] text-slate-500 leading-relaxed mt-2 font-mono whitespace-pre-line max-h-[250px] overflow-y-auto">
                {q.passage.content}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Question text */}
      <div
        className={cn(
          "text-[13px] text-slate-700 leading-relaxed whitespace-pre-line mt-2",
          !expanded && "line-clamp-3",
        )}
      >
        {q.questionText}
      </div>

      {/* Options (expanded) */}
      {expanded && options.length > 0 && (
        <div className="space-y-1 mt-3 pl-1">
          {options.map((opt) => {
            const isCorrect = opt.label === q.correctAnswer;
            return (
              <div
                key={opt.label}
                className={cn(
                  "flex items-start gap-2 text-[12px] rounded px-2 py-1",
                  isCorrect
                    ? "bg-emerald-50 text-emerald-800 font-medium"
                    : "text-slate-600",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center",
                    isCorrect
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-200 text-slate-500",
                  )}
                >
                  {opt.label}
                </span>
                <span className="pt-0.5">{opt.text}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Non-MC answer */}
      {expanded && options.length === 0 && q.correctAnswer && (
        <div className="text-[12px] bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded mt-3">
          <span className="font-medium">정답:</span> {q.correctAnswer}
        </div>
      )}

      {/* Explanation */}
      {q.explanation?.content && expanded && (
        <div className="mt-3">
          <button
            onClick={() => setExplanationOpen(!explanationOpen)}
            className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            {explanationOpen ? "해설 접기" : "해설 보기"}
            {explanationOpen ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
          {explanationOpen && (
            <div className="bg-blue-50/50 rounded-lg p-2.5 mt-1.5 border border-blue-100">
              <p className="text-[12px] text-slate-700 leading-relaxed">
                {q.explanation.content}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-2 mt-2 border-t border-slate-100">
        <span>{formatDate(q.createdAt)}</span>
        {q._count.examLinks > 0 && (
          <span>시험 {q._count.examLinks}회 사용</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AdminQuestionsClient({ questions, academyId }: Props) {
  const [search, setSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("ALL");
  const [aiFilter, setAiFilter] = useState<"all" | "ai" | "manual">("all");
  const [typeFilter, setTypeFilter] = useState("ALL");

  const filtered = useMemo(() => {
    return questions.filter((q) => {
      // Search
      if (
        search &&
        !q.questionText.toLowerCase().includes(search.toLowerCase()) &&
        !(q.passage?.title || "").toLowerCase().includes(search.toLowerCase())
      )
        return false;

      // Difficulty
      if (difficultyFilter !== "ALL" && q.difficulty !== difficultyFilter)
        return false;

      // AI filter
      if (aiFilter === "ai" && !q.aiGenerated) return false;
      if (aiFilter === "manual" && q.aiGenerated) return false;

      // Type filter (by subType or type)
      if (typeFilter !== "ALL") {
        if (q.subType !== typeFilter && q.type !== typeFilter) return false;
      }

      return true;
    });
  }, [questions, search, difficultyFilter, aiFilter, typeFilter]);

  // Collect all unique types for the filter
  const typeOptions = useMemo(() => {
    const all: { value: string; label: string }[] = [];
    TYPE_SUBTYPE_MAP.forEach((group) => {
      group.subtypes.forEach((st) => {
        if (questions.some((q) => q.subType === st.value)) {
          all.push(st);
        }
      });
    });
    return all;
  }, [questions]);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="px-6 py-2.5 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0">
        <Link
          href={`/admin/academies/${academyId}`}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-slate-500" />
        </Link>
        <HelpCircle className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
        <h1 className="text-[15px] font-bold text-slate-900">문제 은행</h1>
        <span className="text-[12px] text-slate-400">
          {questions.length}개
        </span>

        <div className="flex-1" />

        <div className="flex items-center gap-2 shrink-0">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
            <input
              placeholder="검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-44 h-8 pl-8 pr-3 text-[12px] rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
            />
          </div>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-8 px-2 text-[12px] rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400"
          >
            <option value="ALL">전체 유형</option>
            {typeOptions.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          {/* Difficulty */}
          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value)}
            className="h-8 px-2 text-[12px] rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400"
          >
            <option value="ALL">전체 난이도</option>
            <option value="BASIC">기본</option>
            <option value="INTERMEDIATE">중급</option>
            <option value="KILLER">킬러</option>
          </select>

          {/* AI filter */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
            {(["all", "ai", "manual"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setAiFilter(f)}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors",
                  aiFilter === f
                    ? "bg-slate-900 text-white"
                    : "text-slate-500 hover:text-slate-700",
                )}
              >
                {f === "all" ? "전체" : f === "ai" ? "AI" : "직접"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-[#F4F6F9] px-6 py-4">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border text-center py-20">
            <HelpCircle className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">
              조건에 맞는 문제가 없습니다
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filtered.map((q, i) => (
              <QuestionCard key={q.id} q={q} num={i + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
