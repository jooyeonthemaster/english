// @ts-nocheck
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Sparkles,
  Search,
  Loader2,
  Save,
  ChevronRight,
  FileText,
  X,
  Bookmark,
  ChevronDown,
  Pencil,
  Trash2,
  Check,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StructuredQuestionRenderer } from "./question-renderers";
import {
  getCustomPrompts,
  createCustomPrompt,
  deleteCustomPrompt,
} from "@/actions/custom-prompts";

const EXAM_TYPE_GROUPS = [
  {
    group: "수능/모의고사 객관식",
    items: [
      { id: "BLANK_INFERENCE", label: "빈칸 추론" },
      { id: "GRAMMAR_ERROR", label: "어법 판단" },
      { id: "VOCAB_CHOICE", label: "어휘 적절성" },
      { id: "SENTENCE_ORDER", label: "글의 순서" },
      { id: "SENTENCE_INSERT", label: "문장 삽입" },
      { id: "TOPIC_MAIN_IDEA", label: "주제/요지" },
      { id: "TITLE", label: "제목 추론" },
      { id: "REFERENCE", label: "지칭 추론" },
      { id: "CONTENT_MATCH", label: "내용 일치" },
      { id: "IRRELEVANT", label: "무관한 문장" },
    ],
  },
  {
    group: "내신 서술형",
    items: [
      { id: "CONDITIONAL_WRITING", label: "조건부 영작" },
      { id: "SENTENCE_TRANSFORM", label: "문장 전환" },
      { id: "FILL_BLANK_KEY", label: "핵심 표현 빈칸" },
      { id: "SUMMARY_COMPLETE", label: "요약문 완성" },
      { id: "WORD_ORDER", label: "배열 영작" },
      { id: "GRAMMAR_CORRECTION", label: "문법 오류 수정" },
    ],
  },
  {
    group: "어휘",
    items: [
      { id: "CONTEXT_MEANING", label: "문맥 속 의미" },
      { id: "SYNONYM", label: "동의어" },
      { id: "ANTONYM", label: "반의어" },
    ],
  },
];

interface PassageItem {
  id: string;
  title: string;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  difficulty: string | null;
  school: { id: string; name: string } | null;
  content: string;
}

interface FilterOptions {
  schools: { id: string; name: string }[];
  grades: number[];
  semesters: string[];
  publishers: string[];
}

interface GenerateQuestionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  academyId: string;
}

export function GenerateQuestionsDialog({
  open,
  onOpenChange,
  academyId,
}: GenerateQuestionsDialogProps) {
  const router = useRouter();

  // Step state
  const [step, setStep] = useState<"select-passage" | "configure" | "results">("select-passage");

  // Passage selection
  const [passages, setPassages] = useState<PassageItem[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ schools: [], grades: [], semesters: [], publishers: [] });
  const [passageSearch, setPassageSearch] = useState("");
  const [filterSchool, setFilterSchool] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [loadingPassages, setLoadingPassages] = useState(false);
  const [selectedPassage, setSelectedPassage] = useState<PassageItem | null>(null);

  // Type selection
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [prompt, setPrompt] = useState("");

  // Saved prompts
  const [savedPrompts, setSavedPrompts] = useState<{ id: string; name: string; content: string }[]>([]);
  const [showSavedPrompts, setShowSavedPrompts] = useState(false);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [savePromptName, setSavePromptName] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);

  const loadSavedPrompts = async () => {
    const prompts = await getCustomPrompts("QUESTION_GENERATION");
    setSavedPrompts(prompts.map((p) => ({ id: p.id, name: p.name, content: p.content })));
  };

  // Generation
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<Record<string, "pending" | "done" | "error">>({});
  const [generatedQuestions, setGeneratedQuestions] = useState<any[] | null>(null);

  const totalQuestions = Object.values(typeCounts).reduce((a, b) => a + b, 0);
  const activeTypes = Object.keys(typeCounts).filter((k) => typeCounts[k] > 0);

  // Load saved prompts when dialog opens
  useEffect(() => {
    if (open) loadSavedPrompts();
  }, [open]);

  // Load passages
  useEffect(() => {
    if (!open) return;
    setLoadingPassages(true);
    fetch(`/api/passages/list?academyId=${academyId}`)
      .then((r) => r.json())
      .then((data) => {
        setPassages(data.passages || []);
        if (data.filters) setFilterOptions(data.filters);
      })
      .catch(() => {})
      .finally(() => setLoadingPassages(false));
  }, [open, academyId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep("select-passage");
      setSelectedPassage(null);
      setTypeCounts({});
      setPrompt("");
      setGeneratedQuestions(null);
      setGenerating(false);
    }
  }, [open]);

  const filteredPassages = passages.filter((p) => {
    if (passageSearch) {
      const q = passageSearch.toLowerCase();
      if (!p.title.toLowerCase().includes(q) && !p.content.toLowerCase().includes(q)) return false;
    }
    if (filterSchool && p.school?.id !== filterSchool) return false;
    if (filterGrade && p.grade !== Number(filterGrade)) return false;
    if (filterSemester && p.semester !== filterSemester) return false;
    return true;
  });

  const setTypeCount = (id: string, count: number) => {
    setTypeCounts((prev) => {
      const next = { ...prev };
      if (count <= 0) delete next[id];
      else next[id] = count;
      return next;
    });
  };

  const handleGenerate = async () => {
    if (!selectedPassage || totalQuestions === 0) return;
    setGenerating(true);
    setGeneratedQuestions(null);
    setStep("results");

    const progress: Record<string, "pending" | "done" | "error"> = {};
    activeTypes.forEach((t) => { progress[t] = "pending"; });
    setGenerationProgress({ ...progress });

    const typeLabel = (id: string) => {
      for (const g of EXAM_TYPE_GROUPS) {
        const found = g.items.find((i) => i.id === id);
        if (found) return found.label;
      }
      return id;
    };

    try {
      const promises = activeTypes.map(async (typeId) => {
        try {
          const res = await fetch("/api/ai/generate-question", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              passageId: selectedPassage.id,
              questionType: typeId,
              count: typeCounts[typeId],
              difficulty: "INTERMEDIATE",
              customPrompt: prompt.trim() || undefined,
            }),
          });
          const data = await res.json();
          setGenerationProgress((prev) => ({ ...prev, [typeId]: data.error ? "error" : "done" }));
          return { typeId, label: typeLabel(typeId), questions: data.questions || [] };
        } catch {
          setGenerationProgress((prev) => ({ ...prev, [typeId]: "error" }));
          return { typeId, label: typeLabel(typeId), questions: [] };
        }
      });

      const results = await Promise.all(promises);
      const allQuestions: any[] = [];
      for (const r of results) {
        for (const q of r.questions) {
          allQuestions.push({ ...q, _typeId: r.typeId, _typeLabel: r.label });
        }
      }
      setGeneratedQuestions(allQuestions);
      if (allQuestions.length > 0) toast.success(`${allQuestions.length}개 문제 생성 완료`);
    } catch {
      toast.error("생성 실패");
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!generatedQuestions || !selectedPassage) return;
    try {
      const { saveGeneratedQuestions } = await import("@/actions/workbench");

      const buildQuestionText = (q: any): string => {
        const parts: string[] = [];
        if (q.direction) parts.push(q.direction);
        if (q.passageWithBlank) parts.push(q.passageWithBlank);
        if (q.passageWithMarks) parts.push(q.passageWithMarks);
        if (q.originalSentence) parts.push(`[원문] ${q.originalSentence}`);
        if (q.conditions) parts.push(`[조건] ${q.conditions.join(" / ")}`);
        if (q.questionText) parts.push(q.questionText);
        return parts.join("\n\n") || "";
      };

      const questionsToSave = generatedQuestions.map((q: any) => ({
        passageId: selectedPassage.id,
        type: q.options ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
        subType: q._typeId || null,
        questionText: buildQuestionText(q),
        options: q.options ? JSON.stringify(q.options) : null,
        correctAnswer: q.correctAnswer || q.modelAnswer || "",
        points: 1,
        difficulty: q.difficulty || "INTERMEDIATE",
        tags: q.tags ? JSON.stringify(q.tags) : null,
        explanation: q.explanation || null,
        keyPoints: q.keyPoints ? JSON.stringify(q.keyPoints) : null,
        wrongOptionExplanations: q.wrongOptionExplanations ? JSON.stringify(q.wrongOptionExplanations) : null,
      }));

      const result = await saveGeneratedQuestions(questionsToSave);
      if (result.success) {
        toast.success("문제 은행에 저장되었습니다.");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error || "저장 실패");
      }
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0 rounded-2xl">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[16px] font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              AI 문제 생성
            </DialogTitle>
            {/* Step indicator */}
            <div className="flex items-center gap-1 text-[11px]">
              <span className={step === "select-passage" ? "text-blue-600 font-bold" : "text-slate-400"}>
                지문 선택
              </span>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <span className={step === "configure" ? "text-blue-600 font-bold" : "text-slate-400"}>
                유형 설정
              </span>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <span className={step === "results" ? "text-blue-600 font-bold" : "text-slate-400"}>
                결과
              </span>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {/* ─── Step 1: Select Passage ─── */}
          {step === "select-passage" && (
            <div className="space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                <input
                  placeholder="지문 제목 또는 내용으로 검색..."
                  value={passageSearch}
                  onChange={(e) => setPassageSearch(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 text-[13px] rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-300"
                  autoFocus
                />
              </div>

              {/* Filter chips */}
              <div className="flex flex-wrap items-center gap-2">
                {/* School filter */}
                {filterOptions.schools.length > 0 && (
                  <select
                    value={filterSchool}
                    onChange={(e) => setFilterSchool(e.target.value)}
                    className={`h-8 px-3 pr-7 rounded-full text-[12px] font-medium border appearance-none cursor-pointer transition-all ${
                      filterSchool ? "bg-blue-50 text-blue-700 border-blue-300" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                    }`}
                    style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}
                  >
                    <option value="">학교 전체</option>
                    {filterOptions.schools.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}

                {/* Grade filter */}
                {filterOptions.grades.length > 0 && (
                  <select
                    value={filterGrade}
                    onChange={(e) => setFilterGrade(e.target.value)}
                    className={`h-8 px-3 pr-7 rounded-full text-[12px] font-medium border appearance-none cursor-pointer transition-all ${
                      filterGrade ? "bg-blue-50 text-blue-700 border-blue-300" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                    }`}
                    style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}
                  >
                    <option value="">학년 전체</option>
                    {filterOptions.grades.map((g) => (
                      <option key={g} value={g}>{g}학년</option>
                    ))}
                  </select>
                )}

                {/* Semester filter */}
                <div className="flex gap-1">
                  {[
                    { value: "", label: "전체" },
                    { value: "FIRST", label: "1학기" },
                    { value: "SECOND", label: "2학기" },
                  ].map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setFilterSemester(s.value)}
                      className={`h-8 px-3 rounded-full text-[12px] font-medium border transition-all ${
                        filterSemester === s.value
                          ? "bg-blue-50 text-blue-700 border-blue-300"
                          : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* Result count */}
                <span className="text-[11px] text-slate-400 ml-auto">
                  {filteredPassages.length}개 지문
                </span>
              </div>

              {loadingPassages ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              ) : filteredPassages.length === 0 ? (
                <div className="text-center py-12 text-sm text-slate-400">
                  등록된 지문이 없습니다. 먼저 지문을 등록해주세요.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[380px] overflow-y-auto">
                  {filteredPassages.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedPassage(p);
                        setStep("configure");
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-lg border border-transparent hover:border-blue-200 hover:bg-blue-50/40 transition-all group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-slate-800 group-hover:text-blue-700 transition-colors flex-1 truncate">
                          {p.title}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {p.school && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                              {p.school.name}
                            </span>
                          )}
                          {p.grade && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                              {p.grade}학년
                            </span>
                          )}
                          {p.semester && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                              {p.semester === "FIRST" ? "1학기" : "2학기"}
                            </span>
                          )}
                          {p.unit && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-500 font-medium">
                              {p.unit}
                            </span>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-blue-400 shrink-0" />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                        {p.content.slice(0, 150)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Step 2: Configure Types ─── */}
          {step === "configure" && selectedPassage && (
            <div className="space-y-5">
              {/* Selected passage summary */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-[13px] font-medium text-slate-700 truncate">
                    {selectedPassage.title}
                  </span>
                </div>
                <button
                  onClick={() => { setStep("select-passage"); setSelectedPassage(null); }}
                  className="text-[11px] text-blue-500 hover:text-blue-700 font-medium shrink-0 ml-2"
                >
                  변경
                </button>
              </div>

              {/* Type groups */}
              {EXAM_TYPE_GROUPS.map((group) => (
                <div key={group.group}>
                  <span className="text-[11px] font-semibold text-slate-400 tracking-wider">
                    {group.group}
                  </span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {group.items.map((item) => {
                      const count = typeCounts[item.id] || 0;
                      const active = count > 0;
                      return (
                        <div
                          key={item.id}
                          className={`inline-flex items-center h-8 rounded-lg border transition-all duration-150 ${
                            active
                              ? "bg-blue-50 border-blue-300"
                              : "bg-white border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setTypeCount(item.id, count + 1)}
                            className={`h-full px-2.5 text-[12px] font-medium transition-colors ${
                              active ? "text-blue-700" : "text-slate-500 hover:text-blue-600"
                            }`}
                          >
                            {item.label}
                          </button>
                          {active && (
                            <div className="flex items-center gap-0.5 pr-1 border-l border-blue-200">
                              <button onClick={() => setTypeCount(item.id, count - 1)} className="w-6 h-6 flex items-center justify-center text-blue-400 hover:text-blue-600 text-[14px] font-bold">-</button>
                              <span className="w-4 text-center text-[12px] font-bold text-blue-700">{count}</span>
                              <button onClick={() => setTypeCount(item.id, count + 1)} className="w-6 h-6 flex items-center justify-center text-blue-400 hover:text-blue-600 text-[14px] font-bold">+</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {totalQuestions > 0 && (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-blue-50 border border-blue-100">
                  <span className="text-[13px] font-medium text-blue-800">
                    총 <strong>{totalQuestions}</strong>문제
                  </span>
                  <button onClick={() => setTypeCounts({})} className="text-[11px] text-blue-500 hover:text-blue-700 font-medium">
                    초기화
                  </button>
                </div>
              )}

              {/* Prompt with saved presets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 tracking-wider">추가 지시사항</span>
                  <div className="flex items-center gap-1">
                    {prompt.trim() && !showSaveInput && (
                      <button
                        onClick={() => setShowSaveInput(true)}
                        className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 font-medium px-1.5 py-0.5 rounded hover:bg-blue-50"
                      >
                        <Save className="w-2.5 h-2.5" />저장
                      </button>
                    )}
                    <button
                      onClick={() => setShowSavedPrompts(!showSavedPrompts)}
                      className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${
                        showSavedPrompts ? "text-blue-700 bg-blue-50" : "text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      <Bookmark className="w-2.5 h-2.5" />
                      불러오기 ({savedPrompts.length})
                    </button>
                  </div>
                </div>

                {showSaveInput && (
                  <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-blue-50 border border-blue-200">
                    <input
                      placeholder="지시사항 이름"
                      value={savePromptName}
                      onChange={(e) => setSavePromptName(e.target.value)}
                      className="flex-1 h-7 px-2 text-[11px] rounded border border-blue-200 bg-white outline-none focus:border-blue-400"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && savePromptName.trim()) {
                          setSavingPrompt(true);
                          createCustomPrompt({ name: savePromptName.trim(), content: prompt }).then(() => {
                            toast.success("저장됨"); setSavePromptName(""); setShowSaveInput(false); setSavingPrompt(false); loadSavedPrompts();
                          });
                        }
                        if (e.key === "Escape") setShowSaveInput(false);
                      }}
                    />
                    <button
                      onClick={() => {
                        if (!savePromptName.trim()) return;
                        setSavingPrompt(true);
                        createCustomPrompt({ name: savePromptName.trim(), content: prompt }).then(() => {
                          toast.success("저장됨"); setSavePromptName(""); setShowSaveInput(false); setSavingPrompt(false); loadSavedPrompts();
                        });
                      }}
                      disabled={!savePromptName.trim() || savingPrompt}
                      className="h-7 px-2 text-[10px] font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {savingPrompt ? <Loader2 className="w-3 h-3 animate-spin" /> : "저장"}
                    </button>
                    <button onClick={() => setShowSaveInput(false)} className="h-7 w-7 flex items-center justify-center text-slate-400 hover:text-slate-600">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {showSavedPrompts && savedPrompts.length > 0 && (
                  <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-[150px] overflow-y-auto">
                    {savedPrompts.map((sp) => (
                      <div key={sp.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 group">
                        <button
                          onClick={() => { setPrompt(sp.content); setShowSavedPrompts(false); toast.success(`"${sp.name}" 불러옴`); }}
                          className="flex-1 text-left min-w-0"
                        >
                          <span className="text-[11px] font-medium text-slate-700 block truncate">{sp.name || "이름 없음"}</span>
                          <span className="text-[10px] text-slate-400 block truncate">{sp.content.slice(0, 60)}</span>
                        </button>
                        <button
                          onClick={() => { deleteCustomPrompt(sp.id).then(() => { toast.success("삭제됨"); loadSavedPrompts(); }); }}
                          className="w-5 h-5 flex items-center justify-center text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <textarea
                  placeholder="예: 킬러 문항은 빈칸 추론으로, 서술형은 조건부 영작 위주로..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full min-h-[56px] px-3 py-2 text-[13px] leading-relaxed rounded-lg border border-slate-200 bg-slate-50/60 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-300 resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => setStep("select-passage")} className="flex-1">
                  이전
                </Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  onClick={handleGenerate}
                  disabled={totalQuestions === 0}
                >
                  <Sparkles className="w-4 h-4 mr-1.5" />
                  {totalQuestions > 0 ? `${totalQuestions}문제 생성` : "유형을 선택하세요"}
                </Button>
              </div>
            </div>
          )}

          {/* ─── Step 3: Results ─── */}
          {step === "results" && (
            <div className="space-y-4">
              {/* Progress */}
              {generating && (
                <div className="space-y-2">
                  <span className="text-xs font-medium text-slate-500">생성 진행 상황</span>
                  <div className="flex flex-wrap gap-2">
                    {activeTypes.map((typeId) => {
                      const label = EXAM_TYPE_GROUPS.flatMap((g) => g.items).find((i) => i.id === typeId)?.label || typeId;
                      const status = generationProgress[typeId];
                      return (
                        <span key={typeId} className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${
                          status === "done" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                          status === "error" ? "bg-red-50 text-red-600 border-red-200" :
                          "bg-blue-50 text-blue-600 border-blue-200 animate-pulse"
                        }`}>
                          {label} x{typeCounts[typeId]}
                          {status === "pending" && <Loader2 className="w-3 h-3 ml-1 inline animate-spin" />}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Results */}
              {generatedQuestions && generatedQuestions.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">
                      {generatedQuestions.length}개 문제 생성됨
                    </span>
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs" onClick={handleSave}>
                      <Save className="w-3.5 h-3.5 mr-1" />
                      문제 은행에 저장
                    </Button>
                  </div>

                  {/* Grouped by type */}
                  {(() => {
                    const groups: Record<string, any[]> = {};
                    generatedQuestions.forEach((q: any) => {
                      const label = q._typeLabel || "기타";
                      if (!groups[label]) groups[label] = [];
                      groups[label].push(q);
                    });
                    let globalIdx = 0;
                    return Object.entries(groups).map(([label, qs]) => (
                      <div key={label} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-bold text-slate-700">{label}</span>
                          <span className="text-[10px] text-slate-400">{qs.length}문제</span>
                        </div>
                        {qs.map((q: any) => {
                          const idx = globalIdx++;
                          return <StructuredQuestionRenderer key={idx} question={q} index={idx} />;
                        })}
                      </div>
                    ));
                  })()}

                  <div className="flex items-center gap-3 pt-2">
                    <Button variant="outline" onClick={() => { setStep("configure"); setGeneratedQuestions(null); }} className="flex-1">
                      다시 설정
                    </Button>
                    <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={handleSave}>
                      <Save className="w-4 h-4 mr-1.5" />
                      문제 은행에 저장
                    </Button>
                  </div>
                </div>
              )}

              {!generating && generatedQuestions && generatedQuestions.length === 0 && (
                <div className="text-center py-12 text-sm text-slate-400">
                  문제 생성에 실패했습니다. 다시 시도해주세요.
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
