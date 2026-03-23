"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { GenerateQuestionsDialog } from "./generate-questions-dialog";
import {
  Database,
  Search,
  Filter,
  Sparkles,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Trash2,
  Eye,
  FileText,
  ListPlus,
  FolderPlus,
  Pencil,
  X,
  BookOpen,
  ClipboardList,
  SquareCheck,
  Square,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  deleteWorkbenchQuestion,
  approveWorkbenchQuestion,
  createQuestionCollection,
  addQuestionsToCollection,
  deleteQuestionCollection,
  updateQuestionCollection,
} from "@/actions/workbench";
import { createExam } from "@/actions/exams";
import { formatDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  MULTIPLE_CHOICE: "객관식",
  SHORT_ANSWER: "주관식",
  FILL_BLANK: "빈칸",
  ORDERING: "순서배열",
  VOCAB: "어휘",
  ESSAY: "서술형",
};

const SUBTYPE_LABELS: Record<string, string> = {
  BLANK_INFERENCE: "빈칸 추론",
  GRAMMAR_ERROR: "어법 판단",
  VOCAB_CHOICE: "어휘 적절성",
  SENTENCE_INSERT: "문장 삽입",
  SENTENCE_ORDER: "글의 순서",
  TOPIC_MAIN_IDEA: "주제/요지",
  TITLE: "제목 추론",
  REFERENCE: "지칭 추론",
  CONTENT_MATCH: "내용 일치",
  IRRELEVANT: "무관한 문장",
  CONDITIONAL_WRITING: "조건부 영작",
  SENTENCE_TRANSFORM: "문장 전환",
  FILL_BLANK_KEY: "핵심 표현 빈칸",
  SUMMARY_COMPLETE: "요약문 완성",
  WORD_ORDER: "배열 영작",
  GRAMMAR_CORRECTION: "문법 오류 수정",
  CONTEXT_MEANING: "문맥 속 의미",
  SYNONYM: "동의어",
  ANTONYM: "반의어",
};

const DIFFICULTY_CONFIG: Record<string, { label: string; className: string }> = {
  BASIC: { label: "기본", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  INTERMEDIATE: { label: "중급", className: "bg-blue-50 text-blue-700 border-blue-200" },
  KILLER: { label: "킬러", className: "bg-red-50 text-red-700 border-red-200" },
};

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
  difficulty: string;
  tags: string | null;
  aiGenerated: boolean;
  approved: boolean;
  createdAt: Date;
  passage: { id: string; title: string; content: string } | null;
  explanation: {
    id: string;
    content: string;
    keyPoints: string | null;
    wrongOptionExplanations: string | null;
  } | null;
  _count: { examLinks: number };
}

interface Collection {
  id: string;
  name: string;
  description: string | null;
  _count: { items: number };
}

interface QuestionBankProps {
  academyId: string;
  questionsData: {
    questions: QuestionItem[];
    total: number;
    page: number;
    totalPages: number;
  };
  filters: {
    page: number;
    type?: string;
    subType?: string;
    difficulty?: string;
    collectionId?: string;
    aiGenerated?: boolean;
    approved?: boolean;
    search?: string;
  };
  collections: Collection[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJSON<T>(str: unknown, fallback: T): T {
  if (!str) return fallback;
  if (Array.isArray(str)) return str as T;
  if (typeof str === "object" && str !== null) {
    return (Array.isArray(fallback) ? fallback : str) as T;
  }
  if (typeof str !== "string") return fallback;
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

/** Render text with __word__ → underline, _____ → blank line, ①②③④⑤ → markers */
function renderFormatted(text: string): React.ReactNode {
  const regex = /__([^_]+)__|_{3,}|([①②③④⑤])/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }

    if (match[1]) {
      // __word__ → underline
      parts.push(
        <span
          key={key++}
          className="underline decoration-2 decoration-blue-500 underline-offset-4 font-semibold text-slate-900"
        >
          {match[1]}
        </span>
      );
    } else if (match[2]) {
      // ①②③④⑤ → marker badge
      parts.push(
        <span
          key={key++}
          className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 text-blue-700 text-[9px] font-bold mx-0.5"
        >
          {match[2]}
        </span>
      );
    } else {
      // _____ → blank
      parts.push(
        <span
          key={key++}
          className="inline-block min-w-[80px] border-b-2 border-blue-400 mx-1 align-baseline"
        >
          &nbsp;
        </span>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

// ---------------------------------------------------------------------------
// Question Card
// ---------------------------------------------------------------------------

function QuestionCard({
  q,
  num,
  selected,
  onToggle,
  onDelete,
  onApprove,
}: {
  q: QuestionItem;
  num: number;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onApprove: () => void;
}) {
  const [passageOpen, setPassageOpen] = useState(false);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const router = useRouter();

  const options = parseJSON<{ label: string; text: string }[]>(q.options, []);
  const tags: string[] = Array.isArray(q.tags)
    ? q.tags
    : parseJSON<string[]>(q.tags, []);
  const diffConfig = DIFFICULTY_CONFIG[q.difficulty];
  const keyPoints = parseJSON<string[]>(q.explanation?.keyPoints || null, []);

  return (
    <Card
      className={`transition-all ${
        selected ? "ring-2 ring-blue-400 bg-blue-50/30" : "hover:shadow-md"
      }`}
    >
      <CardContent className="p-4 space-y-3">
        {/* Top row: checkbox + meta */}
        <div className="flex items-start gap-3">
          <div className="pt-0.5">
            <Checkbox
              checked={selected}
              onCheckedChange={onToggle}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-slate-400">
                {num}.
              </span>
              <Badge variant="outline" className="text-[10px]">
                {TYPE_LABELS[q.type] || q.type}
              </Badge>
              {q.subType && (
                <span className="text-[10px] text-slate-500">
                  {SUBTYPE_LABELS[q.subType] || q.subType}
                </span>
              )}
              {diffConfig && (
                <Badge
                  variant="outline"
                  className={`text-[10px] ${diffConfig.className}`}
                >
                  {diffConfig.label}
                </Badge>
              )}
              {q.aiGenerated && (
                <Sparkles className="w-3 h-3 text-amber-500" />
              )}
              {q.approved ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              ) : (
                <Clock className="w-3 h-3 text-slate-300" />
              )}
            </div>
            {Array.isArray(tags) && tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => router.push(`/director/questions/${q.id}`)}
            >
              <Pencil className="w-3 h-3" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <span className="text-xs">...</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => router.push(`/director/questions/${q.id}`)}
                >
                  <Eye className="w-3.5 h-3.5 mr-2" />
                  상세 보기
                </DropdownMenuItem>
                {!q.approved && (
                  <DropdownMenuItem onClick={onApprove}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
                    승인
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-red-600">
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  삭제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Passage */}
        {q.passage && (
          <div className="bg-slate-50 rounded-md px-3 py-2">
            <button
              className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium w-full text-left"
              onClick={() => setPassageOpen(!passageOpen)}
            >
              <FileText className="w-3 h-3 shrink-0" />
              <span className="truncate">{q.passage.title}</span>
              {passageOpen ? (
                <ChevronUp className="w-3 h-3 ml-auto shrink-0" />
              ) : (
                <ChevronDown className="w-3 h-3 ml-auto shrink-0" />
              )}
            </button>
            <p
              className={`text-[11px] text-slate-500 font-mono leading-relaxed mt-1.5 ${
                passageOpen ? "" : "line-clamp-3"
              }`}
            >
              {renderFormatted(q.passage.content)}
            </p>
          </div>
        )}

        {/* Question text */}
        <div className="text-[13px] text-slate-800 leading-relaxed font-medium whitespace-pre-line">
          {renderFormatted(q.questionText)}
        </div>

        {/* Options */}
        {options.length > 0 && (
          <div className="space-y-1 pl-1">
            {options.map((opt) => {
              const isCorrect = opt.label === q.correctAnswer;
              return (
                <div
                  key={opt.label}
                  className={`flex items-start gap-2 text-[12px] rounded px-2 py-1 ${
                    isCorrect
                      ? "bg-emerald-50 text-emerald-800 font-medium"
                      : "text-slate-600"
                  }`}
                >
                  <span
                    className={`shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                      isCorrect
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {opt.label}
                  </span>
                  <span className="pt-0.5">{renderFormatted(opt.text)}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Non-MC correct answer */}
        {options.length === 0 && q.correctAnswer && (
          <div className="text-[12px] bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded">
            <span className="font-medium">정답:</span> {q.correctAnswer}
          </div>
        )}

        {/* Explanation toggle */}
        {q.explanation && (
          <div>
            <button
              className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              onClick={() => setExplanationOpen(!explanationOpen)}
            >
              {explanationOpen ? "해설 접기" : "해설 보기"}
              {explanationOpen ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
            {explanationOpen && (
              <div className="mt-2 bg-amber-50/50 border border-amber-100 rounded-md px-3 py-2 space-y-2">
                <p className="text-[12px] text-slate-700 leading-relaxed whitespace-pre-line">
                  {q.explanation.content}
                </p>
                {keyPoints.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-slate-500">
                      핵심 포인트
                    </span>
                    {keyPoints.map((kp, i) => (
                      <p
                        key={i}
                        className="text-[11px] text-slate-600 pl-2 border-l-2 border-amber-300"
                      >
                        {kp}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-1 border-t border-slate-100">
          <span>{formatDate(q.createdAt)}</span>
          {q._count.examLinks > 0 && (
            <span>시험 {q._count.examLinks}회 사용</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function QuestionBankClient({
  academyId,
  questionsData,
  filters,
  collections,
}: QuestionBankProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(filters.search || "");
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Collection dialogs
  const [addToCollectionOpen, setAddToCollectionOpen] = useState(false);
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
  const [editName, setEditName] = useState("");

  // Exam dialog
  const [createExamOpen, setCreateExamOpen] = useState(false);
  const [examTitle, setExamTitle] = useState("");
  const [creatingExam, setCreatingExam] = useState(false);

  const allIds = useMemo(
    () => questionsData.questions.map((q) => q.id),
    [questionsData.questions]
  );
  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedIds.has(id));

  // ------- Filters -------
  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "ALL") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`/director/questions?${params.toString()}`);
  }

  function handleSearch() {
    updateFilter("search", searchValue);
  }

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    router.push(`/director/questions?${params.toString()}`);
  }

  // ------- Selection -------
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  }

  // ------- Actions -------
  async function handleDelete(id: string) {
    if (!confirm("이 문제를 삭제하시겠습니까?")) return;
    const result = await deleteWorkbenchQuestion(id);
    if (result.success) {
      toast.success("삭제됨");
      selectedIds.delete(id);
      setSelectedIds(new Set(selectedIds));
      router.refresh();
    } else {
      toast.error(result.error || "삭제 실패");
    }
  }

  async function handleApprove(id: string) {
    const result = await approveWorkbenchQuestion(id);
    if (result.success) {
      toast.success("승인됨");
      router.refresh();
    } else {
      toast.error(result.error || "승인 실패");
    }
  }

  async function handleAddToCollection(collectionId: string) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const result = await addQuestionsToCollection(collectionId, ids);
    if (result.success) {
      toast.success(`${ids.length}개 문제를 컬렉션에 추가했습니다.`);
      setAddToCollectionOpen(false);
      router.refresh();
    } else {
      toast.error(result.error || "추가 실패");
    }
  }

  async function handleCreateCollection() {
    if (!newCollectionName.trim()) return;
    const result = await createQuestionCollection({
      name: newCollectionName.trim(),
    });
    if (result.success) {
      toast.success("컬렉션이 생성되었습니다.");
      setNewCollectionName("");
      setCreateCollectionOpen(false);
      // If we have selected items, add them to the new collection
      if (selectedIds.size > 0 && result.id) {
        await addQuestionsToCollection(result.id, Array.from(selectedIds));
        toast.success(`${selectedIds.size}개 문제를 새 컬렉션에 추가했습니다.`);
      }
      router.refresh();
    } else {
      toast.error(result.error || "생성 실패");
    }
  }

  async function handleDeleteCollection(id: string) {
    if (!confirm("이 컬렉션을 삭제하시겠습니까?")) return;
    const result = await deleteQuestionCollection(id);
    if (result.success) {
      toast.success("컬렉션 삭제됨");
      if (filters.collectionId === id) {
        updateFilter("collectionId", "");
      }
      router.refresh();
    } else {
      toast.error(result.error || "삭제 실패");
    }
  }

  async function handleRenameCollection() {
    if (!editingCollection || !editName.trim()) return;
    const result = await updateQuestionCollection(editingCollection.id, {
      name: editName.trim(),
    });
    if (result.success) {
      toast.success("이름 변경됨");
      setEditingCollection(null);
      router.refresh();
    } else {
      toast.error(result.error || "변경 실패");
    }
  }

  async function handleCreateExam() {
    if (!examTitle.trim() || selectedIds.size === 0) return;
    setCreatingExam(true);
    const questions = Array.from(selectedIds).map((id, idx) => ({
      questionId: id,
      orderNum: idx + 1,
      points: 1,
    }));
    const result = await createExam(academyId, {
      title: examTitle.trim(),
      type: "OFFLINE",
      totalPoints: questions.length,
      questions,
    });
    if (result.success) {
      toast.success("시험지가 생성되었습니다.");
      setCreateExamOpen(false);
      router.push(`/director/exams/${result.id}`);
    } else {
      toast.error(result.error || "시험지 생성 실패");
    }
    setCreatingExam(false);
  }

  const activeCollection = collections.find(
    (c) => c.id === filters.collectionId
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-600" />
            문제 은행
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            총 {questionsData.total}개 문제
            {activeCollection && (
              <span className="text-blue-600 font-medium">
                {" "}
                &middot; {activeCollection.name}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Collection management dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <BookOpen className="w-4 h-4 mr-1.5" />
                컬렉션
                {collections.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-[10px]">
                    {collections.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[240px]">
              <DropdownMenuItem
                onClick={() => updateFilter("collectionId", "")}
                className={!filters.collectionId ? "font-semibold" : ""}
              >
                <Database className="w-3.5 h-3.5 mr-2" />
                전체 문제
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {collections.map((c) => (
                <div key={c.id} className="flex items-center group">
                  <DropdownMenuItem
                    className={`flex-1 ${
                      filters.collectionId === c.id ? "font-semibold bg-blue-50" : ""
                    }`}
                    onClick={() => updateFilter("collectionId", c.id)}
                  >
                    <ListPlus className="w-3.5 h-3.5 mr-2 shrink-0" />
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto text-[10px] text-slate-400 pl-2">
                      {c._count.items}
                    </span>
                  </DropdownMenuItem>
                  <div className="flex opacity-0 group-hover:opacity-100 transition-opacity pr-1">
                    <button
                      className="p-1 text-slate-400 hover:text-slate-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCollection(c);
                        setEditName(c.name);
                      }}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      className="p-1 text-slate-400 hover:text-red-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCollection(c.id);
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setCreateCollectionOpen(true)}
              >
                <FolderPlus className="w-3.5 h-3.5 mr-2" />
                새 컬렉션 만들기
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            className="bg-blue-600 hover:bg-blue-700"
            size="sm"
            onClick={() => setGenerateDialogOpen(true)}
          >
            <Sparkles className="w-4 h-4 mr-1.5" />
            AI 문제 생성
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />

            <Select
              value={filters.type || "ALL"}
              onValueChange={(v) => updateFilter("type", v)}
            >
              <SelectTrigger className="h-8 w-[110px] text-xs">
                <SelectValue placeholder="유형" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">전체 유형</SelectItem>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.difficulty || "ALL"}
              onValueChange={(v) => updateFilter("difficulty", v)}
            >
              <SelectTrigger className="h-8 w-[100px] text-xs">
                <SelectValue placeholder="난이도" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">전체 난이도</SelectItem>
                <SelectItem value="BASIC">기본</SelectItem>
                <SelectItem value="INTERMEDIATE">중급</SelectItem>
                <SelectItem value="KILLER">킬러</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={
                filters.approved === true
                  ? "true"
                  : filters.approved === false
                  ? "false"
                  : "ALL"
              }
              onValueChange={(v) => updateFilter("approved", v)}
            >
              <SelectTrigger className="h-8 w-[110px] text-xs">
                <SelectValue placeholder="상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">전체 상태</SelectItem>
                <SelectItem value="true">승인 완료</SelectItem>
                <SelectItem value="false">미승인</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={
                filters.aiGenerated === true
                  ? "true"
                  : filters.aiGenerated === false
                  ? "false"
                  : "ALL"
              }
              onValueChange={(v) => updateFilter("aiGenerated", v)}
            >
              <SelectTrigger className="h-8 w-[100px] text-xs">
                <SelectValue placeholder="생성" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">전체</SelectItem>
                <SelectItem value="true">AI 생성</SelectItem>
                <SelectItem value="false">수동</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex-1" />

            <div className="flex items-center gap-1.5">
              <Input
                placeholder="문제 검색..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="h-8 w-[180px] text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleSearch}
              >
                <Search className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Selection action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
          <button
            onClick={toggleAll}
            className="flex items-center gap-1.5 text-xs font-medium text-blue-700"
          >
            {allSelected ? (
              <SquareCheck className="w-4 h-4" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            {allSelected ? "선택 해제" : "전체 선택"}
          </button>
          <span className="text-xs text-blue-600 font-semibold">
            {selectedIds.size}개 선택
          </span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setAddToCollectionOpen(true)}
          >
            <ListPlus className="w-3.5 h-3.5 mr-1" />
            컬렉션에 추가
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
            onClick={() => {
              setExamTitle("");
              setCreateExamOpen(true);
            }}
          >
            <ClipboardList className="w-3.5 h-3.5 mr-1" />
            시험지 만들기
          </Button>
          <button
            className="text-blue-400 hover:text-blue-600"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Select all toggle (when nothing selected) */}
      {selectedIds.size === 0 && questionsData.questions.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            onClick={toggleAll}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
          >
            <Square className="w-3.5 h-3.5" />
            전체 선택
          </button>
        </div>
      )}

      {/* Question grid */}
      {questionsData.questions.length === 0 ? (
        <div className="text-center py-16">
          <Database className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">문제가 없습니다</p>
          <p className="text-sm text-slate-400 mt-1">
            AI 워크벤치에서 문제를 생성해보세요
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {questionsData.questions.map((q, idx) => {
            const num = (questionsData.page - 1) * 20 + idx + 1;
            return (
              <QuestionCard
                key={q.id}
                q={q}
                num={num}
                selected={selectedIds.has(q.id)}
                onToggle={() => toggleSelect(q.id)}
                onDelete={() => handleDelete(q.id)}
                onApprove={() => handleApprove(q.id)}
              />
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {questionsData.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={questionsData.page <= 1}
            onClick={() => goToPage(questionsData.page - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-slate-600 px-3">
            {questionsData.page} / {questionsData.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={questionsData.page >= questionsData.totalPages}
            onClick={() => goToPage(questionsData.page + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* ---- Dialogs ---- */}

      {/* Add to collection dialog */}
      <Dialog open={addToCollectionOpen} onOpenChange={setAddToCollectionOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="text-sm">
              컬렉션에 추가 ({selectedIds.size}개)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {collections.map((c) => (
              <button
                key={c.id}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-slate-50 transition-colors text-left"
                onClick={() => handleAddToCollection(c.id)}
              >
                <ListPlus className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">
                    {c.name}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {c._count.items}개 문제
                  </p>
                </div>
              </button>
            ))}
            {collections.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">
                컬렉션이 없습니다
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAddToCollectionOpen(false);
                setCreateCollectionOpen(true);
              }}
            >
              <FolderPlus className="w-3.5 h-3.5 mr-1.5" />
              새 컬렉션 만들기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create collection dialog */}
      <Dialog open={createCollectionOpen} onOpenChange={setCreateCollectionOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="text-sm">새 컬렉션</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="컬렉션 이름"
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateCollection();
            }}
            autoFocus
          />
          {selectedIds.size > 0 && (
            <p className="text-xs text-slate-500">
              선택한 {selectedIds.size}개 문제가 자동으로 추가됩니다.
            </p>
          )}
          <DialogFooter>
            <Button
              size="sm"
              onClick={handleCreateCollection}
              disabled={!newCollectionName.trim()}
            >
              만들기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename collection dialog */}
      <Dialog
        open={!!editingCollection}
        onOpenChange={(open) => !open && setEditingCollection(null)}
      >
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="text-sm">컬렉션 이름 변경</DialogTitle>
          </DialogHeader>
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameCollection();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button
              size="sm"
              onClick={handleRenameCollection}
              disabled={!editName.trim()}
            >
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create exam dialog */}
      <Dialog open={createExamOpen} onOpenChange={setCreateExamOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-sm">
              시험지 만들기 ({selectedIds.size}문제)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="시험지 제목"
              value={examTitle}
              onChange={(e) => setExamTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateExam();
              }}
              autoFocus
            />
            <p className="text-xs text-slate-500">
              선택한 {selectedIds.size}개 문제로 초안(DRAFT) 시험지를 생성합니다.
              생성 후 상세 페이지에서 순서, 배점 등을 편집할 수 있습니다.
            </p>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              onClick={handleCreateExam}
              disabled={!examTitle.trim() || creatingExam}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {creatingExam ? "생성 중..." : "시험지 생성"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GenerateQuestionsDialog
        open={generateDialogOpen}
        onOpenChange={setGenerateDialogOpen}
        academyId={academyId}
      />
    </div>
  );
}
