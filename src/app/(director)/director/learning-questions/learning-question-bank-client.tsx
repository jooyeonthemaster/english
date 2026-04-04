"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Database, Search, CheckCircle2, Clock, ChevronDown, ChevronUp,
  Trash2, SquareCheck, Square, Sparkles, FolderOpen,
  BookOpen, ArrowLeft, ChevronLeft, ChevronRight, Calendar, X,
} from "lucide-react";
import {
  approveNaeshinQuestion, deleteNaeshinQuestion,
  bulkApproveNaeshinQuestions, bulkDeleteNaeshinQuestions,
} from "@/actions/learning-questions";
import { createSeason } from "@/actions/learning-admin";
import { LEARNING_CATEGORIES, SEASON_TYPES, GRADE_LEVELS } from "@/lib/learning-constants";
import { cn } from "@/lib/utils";
import { QuestionDetail } from "./question-detail";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, { badge: string; bg: string }> = {
  VOCAB: { badge: "bg-blue-100 text-blue-700", bg: "border-l-blue-400" },
  INTERPRETATION: { badge: "bg-indigo-100 text-indigo-700", bg: "border-l-indigo-400" },
  GRAMMAR: { badge: "bg-violet-100 text-violet-700", bg: "border-l-violet-400" },
  COMPREHENSION: { badge: "bg-amber-100 text-amber-700", bg: "border-l-amber-400" },
};

const SUBTYPE_LABELS: Record<string, string> = {
  WORD_MEANING: "영→한 뜻", WORD_MEANING_REVERSE: "한→영 뜻",
  WORD_FILL: "빈칸 채우기", WORD_MATCH: "매칭", WORD_SPELL: "스펠링",
  VOCAB_SYNONYM: "유의어/반의어", VOCAB_DEFINITION: "영영풀이",
  VOCAB_COLLOCATION: "연어", VOCAB_CONFUSABLE: "혼동 단어",
  SENTENCE_INTERPRET: "해석 고르기", SENTENCE_COMPLETE: "영문 고르기",
  WORD_ARRANGE: "단어 배열", KEY_EXPRESSION: "핵심 표현", SENT_CHUNK_ORDER: "끊어읽기",
  GRAMMAR_SELECT: "문법 고르기", ERROR_FIND: "오류 찾기", ERROR_CORRECT: "오류 수정",
  GRAM_TRANSFORM: "문장 전환", GRAM_BINARY: "문법 O/X",
  TRUE_FALSE: "O/X", CONTENT_QUESTION: "내용 이해",
  PASSAGE_FILL: "지문 빈칸", CONNECTOR_FILL: "연결어",
};

const DIFFICULTY_LABELS: Record<string, string> = {
  BASIC: "기본", INTERMEDIATE: "중급", KILLER: "킬러",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SetItem {
  id: string;
  publisher: string;
  textbook: string | null;
  grade: number | null;
  unit: string | null;
  title: string;
  questionCount: number;
  createdAt: Date;
  passage: { id: string; title: string };
  _count: { questions: number };
}

interface QuestionItem {
  id: string;
  learningCategory: string;
  type: string;
  subType: string | null;
  questionText: string;
  correctAnswer: string;
  difficulty: string;
  approved: boolean;
  createdAt: Date;
  passage: { id: string; title: string } | null;
  explanation: {
    id: string; questionId: string; content: string;
    keyPoints: string | null; wrongOptionExplanations: string | null;
    createdAt: Date; updatedAt: Date;
  } | null;
}

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
// JSON 파싱 헬퍼
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tryParse(raw: string): Record<string, any> | null {
  try { return JSON.parse(raw); } catch { return null; }
}

function getPreviewText(subType: string | null, raw: string): string {
  const d = tryParse(raw);
  if (!d) return raw.slice(0, 100);
  switch (subType) {
    case "WORD_MEANING": case "WORD_MEANING_REVERSE":
      return d.word ? `${d.word} — ${d.contextSentence || ""}` : raw;
    case "VOCAB_SYNONYM":
      return d.word ? `${d.word} (${d.targetRelation === "synonym" ? "유의어" : "반의어"})` : raw;
    case "VOCAB_DEFINITION":
      return d.englishDefinition || raw;
    case "SENTENCE_INTERPRET":
      return d.englishSentence || raw;
    case "SENTENCE_COMPLETE":
      return d.koreanSentence || raw;
    case "WORD_ARRANGE":
      return d.koreanSentence || raw;
    case "SENT_CHUNK_ORDER":
      return d.chunks?.join(" / ") || raw;
    case "GRAM_TRANSFORM":
      return `${d.originalSentence || ""} → ${d.instruction || ""}`;
    case "TRUE_FALSE":
      return d.statement || raw;
    case "CONTENT_QUESTION":
      return d.question || raw;
    case "PASSAGE_FILL":
      return d.excerpt || raw;
    case "CONNECTOR_FILL":
      return `${(d.sentenceBefore || "").slice(0, 80)}… ____ …${(d.sentenceAfter || "").slice(0, 40)}`;
    case "WORD_MATCH":
      return d.pairs ? `${d.pairs.length}쌍 단어-뜻 매칭` : raw;
    case "WORD_SPELL":
      return d.koreanMeaning ? `${d.koreanMeaning} → 스펠링 입력` : raw;
    default:
      return d.sentence || d.contextSentence || d.englishSentence || d.koreanSentence || d.excerpt || raw.slice(0, 100);
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function LearningQuestionBankClient({ setsData, questionsData, currentSetId, filters }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"questions" | "seasons">(
    searchParams.get("tab") === "seasons" ? "seasons" : "questions"
  );

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    params.delete("page");
    router.push(`/director/learning-questions?${params.toString()}`);
  };

  const goToSet = (setId: string) => {
    router.push(`/director/learning-questions?setId=${setId}`);
  };

  const goBack = () => {
    router.push("/director/learning-questions");
  };

  // 탭: 내신 시즌 관리
  if (activeTab === "seasons" && !currentSetId) {
    const { SeasonManager } = require("./season-manager");
    return (
      <div className="p-6 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">학습 관리</h1>
        </div>
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          <button onClick={() => setActiveTab("questions")} className={cn("px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors", "border-transparent text-gray-500 hover:text-gray-700")}>
            문제 은행
          </button>
          <button onClick={() => setActiveTab("seasons")} className={cn("px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors", "border-blue-500 text-blue-600")}>
            내신 시즌 관리
          </button>
        </div>
        <SeasonManager />
      </div>
    );
  }

  // 세트 목록 뷰 vs 문제 목록 뷰
  if (currentSetId && questionsData) {
    const currentSet = setsData.sets.find((s) => s.id === currentSetId);
    return (
      <QuestionListView
        set={currentSet || null}
        data={questionsData}
        filters={filters}
        onBack={goBack}
        onUpdateParam={updateParam}
      />
    );
  }

  return (
    <div>
      <div className="px-6 pt-6 pb-0 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">학습 관리</h1>
        </div>
        <div className="flex gap-1 mb-4 border-b border-gray-200">
          <button onClick={() => setActiveTab("questions")} className={cn("px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors", "border-blue-500 text-blue-600")}>
            문제 은행
          </button>
          <button onClick={() => setActiveTab("seasons")} className={cn("px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors", "border-transparent text-gray-500 hover:text-gray-700")}>
            내신 시즌 관리
          </button>
        </div>
      </div>
      <SetListView setsData={setsData} filters={filters} onSelectSet={goToSet} onUpdateParam={updateParam} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 세트 목록 뷰 (출판사별 그룹핑)
// ---------------------------------------------------------------------------

function SetListView({ setsData, filters, onSelectSet, onUpdateParam }: {
  setsData: Props["setsData"];
  filters: Record<string, string | undefined>;
  onSelectSet: (id: string) => void;
  onUpdateParam: (key: string, value: string) => void;
}) {
  const [showSeasonModal, setShowSeasonModal] = useState(false);

  // 출판사별 그룹핑
  const grouped: Record<string, SetItem[]> = {};
  for (const set of setsData.sets) {
    const key = set.publisher || "미분류";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(set);
  }

  const totalQuestions = setsData.sets.reduce((sum, s) => sum + s._count.questions, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600" />
            학습 문제 은행
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {setsData.sets.length}개 세트 · {totalQuestions}개 문제
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSeasonModal(true)}
            className="h-10 px-5 text-[13px] font-semibold rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-1.5"
          >
            <Calendar className="w-4 h-4" /> 내신 시즌 생성
          </button>
          <Link href="/director/workbench/generate-learning">
            <button className="h-10 px-5 text-[13px] font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> 학습 문제 생성
            </button>
          </Link>
        </div>
      </div>

      {showSeasonModal && (
        <CreateSeasonModal
          sets={setsData.sets}
          onClose={() => setShowSeasonModal(false)}
        />
      )}

      {/* 출판사 필터 */}
      {setsData.publishers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onUpdateParam("publisher", "")}
            className={cn(
              "text-[12px] px-3 py-1.5 rounded-lg border font-medium transition-all",
              !filters.publisher ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300",
            )}
          >
            전체
          </button>
          {setsData.publishers.map((p) => (
            <button
              key={p}
              onClick={() => onUpdateParam("publisher", filters.publisher === p ? "" : p)}
              className={cn(
                "text-[12px] px-3 py-1.5 rounded-lg border font-medium transition-all",
                filters.publisher === p ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* 세트 목록 */}
      {setsData.sets.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border">
          <FolderOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-400">학습 문제 세트가 없습니다.</p>
          <Link href="/director/workbench/generate-learning" className="text-[13px] text-blue-600 hover:text-blue-700 font-medium mt-2 inline-block">
            학습 문제 생성하기 →
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([publisher, sets]) => (
            <div key={publisher}>
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-4 h-4 text-blue-500" />
                <h2 className="text-[14px] font-bold text-slate-800">{publisher}</h2>
                <span className="text-[11px] text-slate-400">{sets.length}개 세트</span>
              </div>
              <div className="grid gap-2">
                {sets.map((set) => (
                  <button
                    key={set.id}
                    onClick={() => onSelectSet(set.id)}
                    className="w-full bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-sm transition-all px-5 py-4 text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <FolderOpen className="w-5 h-5 text-blue-400 group-hover:text-blue-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-slate-800 truncate">{set.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {set.grade && <span className="text-[11px] text-slate-400">{set.grade}학년</span>}
                            {set.textbook && <span className="text-[11px] text-slate-400">{set.textbook}</span>}
                            {set.unit && <span className="text-[11px] text-slate-400">{set.unit}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[13px] font-bold text-blue-600">{set._count.questions}문제</span>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-400" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 문제 목록 뷰 (세트 내부)
// ---------------------------------------------------------------------------

function QuestionListView({ set, data, filters, onBack, onUpdateParam }: {
  set: SetItem | null;
  data: NonNullable<Props["questionsData"]>;
  filters: Record<string, string | undefined>;
  onBack: () => void;
  onUpdateParam: (key: string, value: string) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    setSelected(selected.size === data.questions.length ? new Set() : new Set(data.questions.map((q) => q.id)));
  };
  const handleApprove = async (id: string) => {
    const r = await approveNaeshinQuestion(id);
    if (r.success) { toast.success("승인됨"); router.refresh(); } else toast.error(r.error);
  };
  const handleDelete = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    const r = await deleteNaeshinQuestion(id);
    if (r.success) { toast.success("삭제됨"); router.refresh(); } else toast.error(r.error);
  };
  const handleBulkApprove = async () => {
    if (selected.size === 0) return;
    const r = await bulkApproveNaeshinQuestions([...selected]);
    if (r.success) { toast.success(`${selected.size}개 승인`); setSelected(new Set()); router.refresh(); } else toast.error(r.error);
  };
  const handleBulkDelete = async () => {
    if (selected.size === 0 || !confirm(`${selected.size}개 삭제?`)) return;
    const r = await bulkDeleteNaeshinQuestions([...selected]);
    if (r.success) { toast.success(`${selected.size}개 삭제`); setSelected(new Set()); router.refresh(); } else toast.error(r.error);
  };
  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    router.push(`/director/learning-questions?${params.toString()}`);
  };

  // 카테고리별 그룹핑
  const byCategory: Record<string, QuestionItem[]> = {};
  for (const q of data.questions) {
    if (!byCategory[q.learningCategory]) byCategory[q.learningCategory] = [];
    byCategory[q.learningCategory].push(q);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <button onClick={onBack} className="flex items-center gap-1 text-[13px] text-slate-500 hover:text-blue-600 mb-3">
          <ArrowLeft className="w-4 h-4" /> 세트 목록
        </button>
        {set && (
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-slate-900">{set.title}</h1>
              <div className="flex items-center gap-2 mt-0.5 text-[12px] text-slate-500">
                <span className="font-medium text-blue-600">{set.publisher}</span>
                {set.grade && <span>· {set.grade}학년</span>}
                {set.textbook && <span>· {set.textbook}</span>}
                {set.unit && <span>· {set.unit}</span>}
                <span>· {data.total}문제</span>
              </div>
            </div>
            <Link href="/director/workbench/generate-learning">
              <button className="h-9 px-4 text-[12px] font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> 추가 생성
              </button>
            </Link>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input
            placeholder="문제 내용 검색..."
            defaultValue={filters.search || ""}
            onKeyDown={(e) => { if (e.key === "Enter") onUpdateParam("search", e.currentTarget.value); }}
            className="w-full h-9 pl-10 pr-3 text-[13px] rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 placeholder:text-slate-300"
          />
        </div>
        {LEARNING_CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => onUpdateParam("learningCategory", filters.learningCategory === c.value ? "" : c.value)}
            className={cn(
              "text-[11px] px-2.5 py-1.5 rounded-lg border font-medium transition-all",
              filters.learningCategory === c.value
                ? CATEGORY_COLORS[c.value]?.badge + " border-current"
                : "bg-white border-slate-200 text-slate-500 hover:border-slate-300",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 rounded-xl border border-blue-200">
          <span className="text-[13px] font-medium text-blue-800">{selected.size}개 선택</span>
          <button onClick={handleBulkApprove} className="text-[12px] font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">일괄 승인</button>
          <button onClick={handleBulkDelete} className="text-[12px] font-medium px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700">일괄 삭제</button>
          <button onClick={() => setSelected(new Set())} className="text-[12px] text-blue-600 ml-auto">선택 해제</button>
        </div>
      )}

      {/* Questions grouped by category */}
      {data.questions.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border">
          <p className="text-sm text-slate-400">이 세트에 문제가 없습니다.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 px-2">
            <button onClick={toggleSelectAll} className="text-slate-400 hover:text-slate-600">
              {selected.size === data.questions.length ? <SquareCheck className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
            </button>
            <span className="text-[11px] text-slate-400">전체 선택</span>
          </div>

          {Object.entries(byCategory).map(([cat, questions]) => {
            const colors = CATEGORY_COLORS[cat] || { badge: "bg-slate-100 text-slate-600", bg: "border-l-slate-300" };
            const catLabel = LEARNING_CATEGORIES.find((c) => c.value === cat)?.label || cat;
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={cn("text-[11px] font-semibold px-2.5 py-1 rounded-full", colors.badge)}>{catLabel}</span>
                  <span className="text-[11px] text-slate-400">{questions.length}문제</span>
                </div>
                <div className="space-y-1.5">
                  {questions.map((q) => (
                    <QuestionCard
                      key={q.id}
                      question={q}
                      isSelected={selected.has(q.id)}
                      isExpanded={expandedId === q.id}
                      onToggleSelect={() => toggleSelect(q.id)}
                      onToggleExpand={() => setExpandedId(expandedId === q.id ? null : q.id)}
                      onApprove={() => handleApprove(q.id)}
                      onDelete={() => handleDelete(q.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button onClick={() => goToPage(data.page - 1)} disabled={data.page <= 1} className="w-9 h-9 rounded-lg border flex items-center justify-center text-slate-400 disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[13px] text-slate-600 px-3">{data.page} / {data.totalPages}</span>
          <button onClick={() => goToPage(data.page + 1)} disabled={data.page >= data.totalPages} className="w-9 h-9 rounded-lg border flex items-center justify-center text-slate-400 disabled:opacity-30">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question Card
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 내신 시즌 생성 모달
// ---------------------------------------------------------------------------

function CreateSeasonModal({ sets, onClose }: { sets: SetItem[]; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<"EXAM_PREP" | "REGULAR">("EXAM_PREP");
  const [grade, setGrade] = useState<number | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedPassageIds, setSelectedPassageIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // 세트에서 고유 지문 추출 (학년 필터)
  const passageMap = new Map<string, { id: string; title: string; questionCount: number; publishers: string[] }>();
  for (const set of sets) {
    if (grade && set.grade && set.grade !== grade) continue;
    const existing = passageMap.get(set.passage.id);
    if (existing) {
      existing.questionCount += set._count.questions;
      if (!existing.publishers.includes(set.publisher)) existing.publishers.push(set.publisher);
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

  const canSubmit = name.trim() && startDate && endDate && selectedPassageIds.size > 0;

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
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* 시즌 이름 */}
          <div>
            <label className="text-[12px] font-semibold text-slate-700 block mb-1.5">
              시즌 이름 <span className="text-red-400">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 1학기 중간고사 대비"
              className="w-full h-9 px-3 text-[13px] rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-blue-400"
            />
          </div>

          {/* 유형 + 학년 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-semibold text-slate-700 block mb-1.5">유형</label>
              <div className="flex gap-2">
                {SEASON_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={cn(
                      "flex-1 h-9 rounded-lg border text-[12px] font-medium transition-all",
                      type === t.value
                        ? t.value === "EXAM_PREP" ? "bg-rose-50 border-rose-300 text-rose-700" : "bg-emerald-50 border-emerald-300 text-emerald-700"
                        : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[12px] font-semibold text-slate-700 block mb-1.5">대상 학년</label>
              <select
                value={grade ?? ""}
                onChange={(e) => { setGrade(e.target.value ? Number(e.target.value) : null); setSelectedPassageIds(new Set()); }}
                className="w-full h-9 px-3 text-[13px] rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-blue-400"
              >
                <option value="">전체</option>
                {GRADE_LEVELS.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 기간 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-semibold text-slate-700 block mb-1.5">시작일 <span className="text-red-400">*</span></label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-9 px-3 text-[13px] rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="text-[12px] font-semibold text-slate-700 block mb-1.5">종료일 <span className="text-red-400">*</span></label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-9 px-3 text-[13px] rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-blue-400" />
            </div>
          </div>

          {/* 지문 선택 */}
          <div>
            <label className="text-[12px] font-semibold text-slate-700 block mb-1.5">
              시험 범위 지문 선택 <span className="text-red-400">*</span>
              <span className="text-slate-400 font-normal ml-1">({selectedPassageIds.size}개 선택)</span>
            </label>
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
              {passages.length === 0 ? (
                <p className="text-[12px] text-slate-400 p-3 text-center">해당 학년의 학습 문제가 있는 지문이 없습니다.</p>
              ) : (
                passages.map((p) => (
                  <label key={p.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedPassageIds.has(p.id)}
                      onChange={(e) => {
                        const next = new Set(selectedPassageIds);
                        if (e.target.checked) next.add(p.id); else next.delete(p.id);
                        setSelectedPassageIds(next);
                      }}
                      className="rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-slate-700 truncate">{p.title}</p>
                      <p className="text-[11px] text-slate-400">{p.publishers.join(", ")} · {p.questionCount}문제</p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* 생성 버튼 */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full h-11 rounded-xl text-[14px] font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? "생성 중..." : `내신 시즌 생성 (${selectedPassageIds.size}개 지문)`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question Card
// ---------------------------------------------------------------------------

function QuestionCard({ question: q, isSelected, isExpanded, onToggleSelect, onToggleExpand, onApprove, onDelete }: {
  question: QuestionItem; isSelected: boolean; isExpanded: boolean;
  onToggleSelect: () => void; onToggleExpand: () => void; onApprove: () => void; onDelete: () => void;
}) {
  const colors = CATEGORY_COLORS[q.learningCategory] || { badge: "bg-slate-100 text-slate-600", bg: "border-l-slate-300" };
  const preview = getPreviewText(q.subType, q.questionText);

  return (
    <div className={cn("bg-white rounded-xl border border-l-4 transition-all", colors.bg, isSelected && "ring-2 ring-blue-200")}>
      <div className="flex items-center gap-3 px-4 py-2.5 cursor-pointer" onClick={onToggleExpand}>
        <button onClick={(e) => { e.stopPropagation(); onToggleSelect(); }} className="shrink-0">
          {isSelected ? <SquareCheck className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-slate-300" />}
        </button>
        {q.subType && (
          <span className="text-[11px] text-slate-500 font-medium bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
            {SUBTYPE_LABELS[q.subType] || q.subType}
          </span>
        )}
        <p className="flex-1 text-[13px] text-slate-700 truncate min-w-0">{preview}</p>
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
            {DIFFICULTY_LABELS[q.difficulty] || q.difficulty}
          </span>
          {q.approved ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          ) : (
            <button onClick={onApprove} title="승인"><Clock className="w-4 h-4 text-amber-400 hover:text-emerald-500" /></button>
          )}
          <button onClick={onDelete} title="삭제"><Trash2 className="w-3.5 h-3.5 text-slate-300 hover:text-red-500" /></button>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-300" />}
        </div>
      </div>
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100">
          <QuestionDetail subType={q.subType} questionText={q.questionText} correctAnswer={q.correctAnswer} explanation={q.explanation?.content || null} />
        </div>
      )}
    </div>
  );
}

