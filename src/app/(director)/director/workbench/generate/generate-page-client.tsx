// @ts-nocheck
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Sparkles,
  Search,
  Loader2,
  Save,
  ChevronRight,
  FileText,
  ArrowLeft,
  Bookmark,
  ChevronDown,
  Plus,
  Trash2,
  Pencil,
  X,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StructuredQuestionRenderer } from "@/components/workbench/question-renderers";
import {
  getCustomPrompts,
  createCustomPrompt,
  updateCustomPrompt,
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

export function GeneratePageClient({ academyId }: { academyId: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"select-passage" | "configure" | "results">("select-passage");

  // Passage selection
  const [passages, setPassages] = useState<PassageItem[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ schools: [], grades: [], semesters: [], publishers: [] });
  const [passageSearch, setPassageSearch] = useState("");
  const [filterSchool, setFilterSchool] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [loadingPassages, setLoadingPassages] = useState(true);
  const [selectedPassage, setSelectedPassage] = useState<PassageItem | null>(null);

  // Type selection
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [prompt, setPrompt] = useState("");

  // Saved prompts
  const [savedPrompts, setSavedPrompts] = useState<{ id: string; name: string; content: string }[]>([]);
  const [showSavedPrompts, setShowSavedPrompts] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [savePromptName, setSavePromptName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // Generation
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<Record<string, "pending" | "done" | "error">>({});
  const [generatedQuestions, setGeneratedQuestions] = useState<any[] | null>(null);

  const totalQuestions = Object.values(typeCounts).reduce((a, b) => a + b, 0);
  const activeTypes = Object.keys(typeCounts).filter((k) => typeCounts[k] > 0);

  // Load saved prompts
  const loadSavedPrompts = async () => {
    const prompts = await getCustomPrompts("QUESTION_GENERATION");
    setSavedPrompts(prompts.map((p) => ({ id: p.id, name: p.name, content: p.content })));
  };

  useEffect(() => { loadSavedPrompts(); }, []);

  useEffect(() => {
    setLoadingPassages(true);
    fetch(`/api/passages/list?academyId=${academyId}`)
      .then((r) => r.json())
      .then((data) => {
        setPassages(data.passages || []);
        if (data.filters) setFilterOptions(data.filters);
      })
      .catch(() => {})
      .finally(() => setLoadingPassages(false));
  }, [academyId]);

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

  const typeLabel = (id: string) => {
    for (const g of EXAM_TYPE_GROUPS) {
      const found = g.items.find((i) => i.id === id);
      if (found) return found.label;
    }
    return id;
  };

  const handleGenerate = async () => {
    if (!selectedPassage || totalQuestions === 0) return;
    setGenerating(true);
    setGeneratedQuestions(null);
    setStep("results");

    const progress: Record<string, "pending" | "done" | "error"> = {};
    activeTypes.forEach((t) => { progress[t] = "pending"; });
    setGenerationProgress({ ...progress });

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
        router.push("/director/questions");
      } else {
        toast.error(result.error || "저장 실패");
      }
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/director/workbench"
          className="flex items-center justify-center w-9 h-9 rounded-xl hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-slate-500" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            AI 문제 생성
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            지문을 선택하고, 유형별로 문제를 생성합니다.
          </p>
        </div>
        {/* Step indicator */}
        <div className="flex items-center gap-2 text-[12px]">
          <span className={`px-3 py-1.5 rounded-full font-medium transition-all ${
            step === "select-passage" ? "bg-blue-100 text-blue-700" : "text-slate-400"
          }`}>
            1. 지문 선택
          </span>
          <ChevronRight className="w-3 h-3 text-slate-300" />
          <span className={`px-3 py-1.5 rounded-full font-medium transition-all ${
            step === "configure" ? "bg-blue-100 text-blue-700" : "text-slate-400"
          }`}>
            2. 유형 설정
          </span>
          <ChevronRight className="w-3 h-3 text-slate-300" />
          <span className={`px-3 py-1.5 rounded-full font-medium transition-all ${
            step === "results" ? "bg-blue-100 text-blue-700" : "text-slate-400"
          }`}>
            3. 결과
          </span>
        </div>
      </div>

      {/* ─── Step 1: Select Passage ─── */}
      {step === "select-passage" && (
        <div className="bg-white rounded-2xl border p-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
            <input
              placeholder="지문 제목 또는 내용으로 검색..."
              value={passageSearch}
              onChange={(e) => setPassageSearch(e.target.value)}
              className="w-full h-11 pl-10 pr-4 text-[13px] rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-300"
              autoFocus
            />
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap items-center gap-2">
            {filterOptions.schools.length > 0 && (
              <select
                value={filterSchool}
                onChange={(e) => setFilterSchool(e.target.value)}
                className={`h-8 px-3 pr-7 rounded-full text-[12px] font-medium border appearance-none cursor-pointer transition-all ${
                  filterSchool ? "bg-blue-50 text-blue-700 border-blue-300" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                }`}
              >
                <option value="">학교 전체</option>
                {filterOptions.schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
            {filterOptions.grades.length > 0 && (
              <select
                value={filterGrade}
                onChange={(e) => setFilterGrade(e.target.value)}
                className={`h-8 px-3 pr-7 rounded-full text-[12px] font-medium border appearance-none cursor-pointer transition-all ${
                  filterGrade ? "bg-blue-50 text-blue-700 border-blue-300" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                }`}
              >
                <option value="">학년 전체</option>
                {filterOptions.grades.map((g) => (
                  <option key={g} value={g}>{g}학년</option>
                ))}
              </select>
            )}
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
            <span className="text-[11px] text-slate-400 ml-auto">
              {filteredPassages.length}개 지문
            </span>
          </div>

          {loadingPassages ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : filteredPassages.length === 0 ? (
            <div className="text-center py-16 text-sm text-slate-400">
              등록된 지문이 없습니다. 먼저 지문을 등록해주세요.
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredPassages.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPassage(p); setStep("configure"); }}
                  className="w-full text-left px-4 py-3 rounded-xl border border-transparent hover:border-blue-200 hover:bg-blue-50/40 transition-all group"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-300 shrink-0" />
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
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-blue-400 shrink-0" />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 ml-6 line-clamp-1">
                    {p.content.slice(0, 200)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Step 2: Configure Types ─── */}
      {step === "configure" && selectedPassage && (
        <div className="grid grid-cols-3 gap-6">
          {/* Selected passage */}
          <div className="col-span-1 bg-white rounded-2xl border p-5 h-fit sticky top-20">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400">선택된 지문</span>
              <button
                onClick={() => { setStep("select-passage"); setSelectedPassage(null); }}
                className="text-[11px] text-blue-500 hover:text-blue-700 font-medium"
              >
                변경
              </button>
            </div>
            <h3 className="font-semibold text-slate-800 text-sm">{selectedPassage.title}</h3>
            <p className="text-[11px] text-slate-500 font-mono mt-2 line-clamp-12 leading-relaxed">
              {selectedPassage.content}
            </p>
          </div>

          {/* Type selection + settings */}
          <div className="col-span-2 space-y-4">
            <div className="bg-white rounded-2xl border p-5 space-y-5">
              <h3 className="text-sm font-semibold text-slate-900">유형별 문제 수 설정</h3>

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
            </div>

            {/* Prompt with saved presets */}
            <div className="bg-white rounded-2xl border p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">추가 지시사항</h3>
                <div className="flex items-center gap-1.5">
                  {/* Save current prompt */}
                  {prompt.trim() && !showSaveInput && (
                    <button
                      onClick={() => setShowSaveInput(true)}
                      className="flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 font-medium px-2 py-1 rounded-md hover:bg-blue-50 transition-colors"
                    >
                      <Save className="w-3 h-3" />
                      저장
                    </button>
                  )}
                  {/* Toggle saved list */}
                  <button
                    onClick={() => setShowSavedPrompts(!showSavedPrompts)}
                    className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md transition-colors ${
                      showSavedPrompts ? "text-blue-700 bg-blue-50" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <Bookmark className="w-3 h-3" />
                    저장된 지시사항 ({savedPrompts.length})
                    <ChevronDown className={`w-3 h-3 transition-transform ${showSavedPrompts ? "rotate-180" : ""}`} />
                  </button>
                </div>
              </div>

              {/* Save input */}
              {showSaveInput && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-50 border border-blue-200">
                  <input
                    placeholder="지시사항 이름 (예: 킬러 문항 세트)"
                    value={savePromptName}
                    onChange={(e) => setSavePromptName(e.target.value)}
                    className="flex-1 h-8 px-2.5 text-[12px] rounded-md border border-blue-200 bg-white outline-none focus:border-blue-400"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && savePromptName.trim()) {
                        setSavingPrompt(true);
                        createCustomPrompt({ name: savePromptName.trim(), content: prompt }).then(() => {
                          toast.success("지시사항이 저장되었습니다.");
                          setSavePromptName("");
                          setShowSaveInput(false);
                          setSavingPrompt(false);
                          loadSavedPrompts();
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
                        toast.success("지시사항이 저장되었습니다.");
                        setSavePromptName("");
                        setShowSaveInput(false);
                        setSavingPrompt(false);
                        loadSavedPrompts();
                      });
                    }}
                    disabled={!savePromptName.trim() || savingPrompt}
                    className="h-8 px-3 text-[11px] font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {savingPrompt ? <Loader2 className="w-3 h-3 animate-spin" /> : "저장"}
                  </button>
                  <button
                    onClick={() => setShowSaveInput(false)}
                    className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-md hover:bg-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Saved prompts dropdown */}
              {showSavedPrompts && (
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  {savedPrompts.length === 0 ? (
                    <div className="px-4 py-6 text-center text-[12px] text-slate-400">
                      저장된 지시사항이 없습니다.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 max-h-[200px] overflow-y-auto">
                      {savedPrompts.map((sp) => (
                        <div
                          key={sp.id}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition-colors group"
                        >
                          {editingPromptId === sp.id ? (
                            <div className="flex items-center gap-1.5 flex-1">
                              <input
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="flex-1 h-7 px-2 text-[12px] rounded border border-slate-200 outline-none focus:border-blue-400"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    updateCustomPrompt(sp.id, { name: editingName }).then(() => {
                                      setEditingPromptId(null);
                                      loadSavedPrompts();
                                    });
                                  }
                                  if (e.key === "Escape") setEditingPromptId(null);
                                }}
                              />
                              <button
                                onClick={() => {
                                  updateCustomPrompt(sp.id, { name: editingName }).then(() => {
                                    setEditingPromptId(null);
                                    loadSavedPrompts();
                                  });
                                }}
                                className="w-6 h-6 flex items-center justify-center text-emerald-500 hover:text-emerald-700"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setPrompt(sp.content);
                                  setShowSavedPrompts(false);
                                  toast.success(`"${sp.name}" 불러옴`);
                                }}
                                className="flex-1 text-left min-w-0"
                              >
                                <span className="text-[12px] font-medium text-slate-700 block truncate">
                                  {sp.name || "이름 없음"}
                                </span>
                                <span className="text-[11px] text-slate-400 block truncate mt-0.5">
                                  {sp.content.slice(0, 80)}
                                </span>
                              </button>
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <button
                                  onClick={() => { setEditingPromptId(sp.id); setEditingName(sp.name); }}
                                  className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm(`"${sp.name}" 지시사항을 삭제하시겠습니까?`)) {
                                      deleteCustomPrompt(sp.id).then(() => {
                                        toast.success("삭제되었습니다.");
                                        loadSavedPrompts();
                                      });
                                    }
                                  }}
                                  className="w-6 h-6 flex items-center justify-center text-red-400 hover:text-red-600 rounded"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <textarea
                placeholder="예: 킬러 문항은 빈칸 추론으로, 서술형은 조건부 영작 위주로..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full min-h-[80px] px-3 py-2 text-[13px] leading-relaxed rounded-lg border border-slate-200 bg-slate-50/60 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-300 resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => setStep("select-passage")} className="flex-1 h-11">
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                지문 다시 선택
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700 h-11"
                onClick={handleGenerate}
                disabled={totalQuestions === 0}
              >
                <Sparkles className="w-4 h-4 mr-1.5" />
                {totalQuestions > 0 ? `${totalQuestions}문제 생성` : "유형을 선택하세요"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Step 3: Results ─── */}
      {step === "results" && (
        <div className="space-y-6">
          {/* Progress */}
          {generating && (
            <div className="bg-white rounded-2xl border p-5 space-y-3">
              <span className="text-sm font-semibold text-slate-900">생성 진행 상황</span>
              <div className="flex flex-wrap gap-2">
                {activeTypes.map((typeId) => {
                  const label = typeLabel(typeId);
                  const status = generationProgress[typeId];
                  return (
                    <span key={typeId} className={`text-[11px] font-medium px-3 py-1.5 rounded-full border ${
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
            <>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-slate-900">
                  {generatedQuestions.length}개 문제 생성됨
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => { setStep("configure"); setGeneratedQuestions(null); }}>
                    다시 설정
                  </Button>
                  <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSave}>
                    <Save className="w-4 h-4 mr-1.5" />
                    문제 은행에 저장
                  </Button>
                </div>
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
                  <div key={label} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-700">{label}</span>
                      <span className="text-[11px] text-slate-400">{qs.length}문제</span>
                    </div>
                    <div className="space-y-3">
                      {qs.map((q: any) => {
                        const idx = globalIdx++;
                        return <StructuredQuestionRenderer key={idx} question={q} index={idx} />;
                      })}
                    </div>
                  </div>
                ));
              })()}

              <div className="flex items-center gap-3 pt-4">
                <Button variant="outline" onClick={() => { setStep("configure"); setGeneratedQuestions(null); }} className="flex-1 h-11">
                  다시 설정
                </Button>
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-11" onClick={handleSave}>
                  <Save className="w-4 h-4 mr-1.5" />
                  문제 은행에 저장
                </Button>
              </div>
            </>
          )}

          {!generating && generatedQuestions && generatedQuestions.length === 0 && (
            <div className="text-center py-20 text-sm text-slate-400 bg-white rounded-2xl border">
              문제 생성에 실패했습니다. 다시 시도해주세요.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
