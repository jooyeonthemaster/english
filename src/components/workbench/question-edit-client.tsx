// @ts-nocheck
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  Plus,
  X,
  ArrowUp,
  ArrowDown,
  FileText,
  Lightbulb,
  Wand2,
  ChevronDown,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  updateWorkbenchQuestion,
  deleteWorkbenchQuestion,
  approveWorkbenchQuestion,
} from "@/actions/workbench";
import { InteractivePassageView } from "@/components/workbench/interactive-passage-view";
import type { PassageAnalysisData } from "@/types/passage-analysis";

interface Option { label: string; text: string; }

interface QuestionEditProps {
  question: {
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
    createdAt: Date;
    passage: {
      id: string;
      title: string;
      content: string;
      analysis?: {
        id: string;
        analysisData: string;
        updatedAt: Date;
      } | null;
    } | null;
    explanation: {
      id: string;
      content: string;
      keyPoints: string | null;
      wrongOptionExplanations: string | null;
      relatedGrammar: string | null;
      aiGenerated: boolean;
    } | null;
  };
  mode?: "page" | "modal";
  onClose?: () => void;
  onDeleted?: (questionId: string) => void;
  onSaved?: () => void;
  onApproved?: () => void;
}

const TYPE_OPTIONS = [
  { value: "MULTIPLE_CHOICE", label: "객관식" },
  { value: "SHORT_ANSWER", label: "주관식" },
  { value: "FILL_BLANK", label: "빈칸 채우기" },
  { value: "ORDERING", label: "순서 배열" },
  { value: "VOCAB", label: "어휘" },
  { value: "ESSAY", label: "서술형" },
];

const DIFFICULTY_OPTIONS = [
  { value: "BASIC", label: "기본", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "INTERMEDIATE", label: "중급", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "KILLER", label: "킬러", color: "bg-red-50 text-red-700 border-red-200" },
];

function safeParseJSON<T>(str: unknown, fallback: T): T {
  if (!str) return fallback;
  if (typeof str === "object") return str as T;
  if (typeof str !== "string") return fallback;
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

export function QuestionEditClient({
  question,
  mode = "page",
  onClose,
  onDeleted,
  onSaved,
  onApproved,
}: QuestionEditProps) {
  const router = useRouter();
  const isModal = mode === "modal";
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [approved, setApproved] = useState(question.approved);

  const initialOptions: Option[] = question.options ? JSON.parse(question.options) : [];
  const initialTags: string[] = question.tags ? JSON.parse(question.tags) : [];
  const initialKeyPoints: string[] = question.explanation?.keyPoints ? JSON.parse(question.explanation.keyPoints) : [];
  const initialWrongExplanations: Record<string, string> = question.explanation?.wrongOptionExplanations ? JSON.parse(question.explanation.wrongOptionExplanations) : {};

  const [type, setType] = useState(question.type);
  const [subType, setSubType] = useState(question.subType || "");
  const [questionText, setQuestionText] = useState(question.questionText);
  const [options, setOptions] = useState<Option[]>(initialOptions);
  const [correctAnswer, setCorrectAnswer] = useState(question.correctAnswer);
  const [difficulty, setDifficulty] = useState(question.difficulty);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagInput, setTagInput] = useState("");
  const [explanation, setExplanation] = useState(question.explanation?.content || "");
  const [aiModifyOpen, setAiModifyOpen] = useState(false);
  const [aiModifyPrompt, setAiModifyPrompt] = useState("");
  const [aiModifying, setAiModifying] = useState(false);
  const [keyPoints, setKeyPoints] = useState<string[]>(initialKeyPoints);
  const [wrongExplanations, setWrongExplanations] = useState<Record<string, string>>(initialWrongExplanations);

  function addOption() { setOptions([...options, { label: String(options.length + 1), text: "" }]); }
  function removeOption(idx: number) { setOptions(options.filter((_, i) => i !== idx)); }
  function moveOption(idx: number, dir: "up" | "down") {
    const a = [...options]; const t = dir === "up" ? idx - 1 : idx + 1;
    if (t < 0 || t >= a.length) return;
    [a[idx], a[t]] = [a[t], a[idx]]; a.forEach((o, i) => (o.label = String(i + 1))); setOptions(a);
  }
  function updateOptionText(idx: number, text: string) { setOptions(options.map((o, i) => (i === idx ? { ...o, text } : o))); }
  function addTag() { const tag = tagInput.trim(); if (tag && !tags.includes(tag)) { setTags([...tags, tag]); setTagInput(""); } }

  async function handleSave() {
    if (!questionText.trim()) { toast.error("문제 내용을 입력해주세요."); return; }
    setSaving(true);
    try {
      const result = await updateWorkbenchQuestion(question.id, {
        type, subType: subType || undefined, questionText: questionText.trim(),
        options: options.length > 0 ? options : undefined, correctAnswer: correctAnswer.trim(),
        difficulty, tags: tags.length > 0 ? tags : undefined, explanation: explanation.trim() || undefined,
        keyPoints: keyPoints.length > 0 ? keyPoints : undefined,
        wrongOptionExplanations: Object.keys(wrongExplanations).length > 0 ? wrongExplanations : undefined,
      });
      if (result.success) { toast.success("수정 완료"); router.refresh(); onSaved?.(); }
      else toast.error(result.error || "수정 실패");
    } catch { toast.error("저장 중 오류"); } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm("이 문제를 삭제하시겠습니까?")) return;
    setDeleting(true);
    const r = await deleteWorkbenchQuestion(question.id);
    if (r.success) {
      toast.success("삭제됨");
      if (onDeleted) onDeleted(question.id);
      else if (onClose) onClose();
      else router.push("/director/questions");
    }
    else { toast.error(r.error || "삭제 실패"); setDeleting(false); }
  }

  async function handleApprove() {
    const r = await approveWorkbenchQuestion(question.id);
    if (r.success) {
      toast.success("승인됨");
      setApproved(true);
      router.refresh();
      onApproved?.();
    } else toast.error(r.error || "승인 실패");
  }

  async function handleAiModify() {
    if (!aiModifyPrompt.trim()) { toast.error("수정 요청 내용을 입력해주세요."); return; }
    setAiModifying(true);
    try {
      const res = await fetch("/api/ai/modify-question", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, instruction: aiModifyPrompt.trim(),
          currentState: { type, subType, questionText, options, correctAnswer, difficulty, explanation, keyPoints, tags } }),
      });
      const json = await res.json();
      if (json.error) { toast.error(json.error); }
      else {
        const q = json.question;
        if (q.questionText) setQuestionText(q.questionText);
        if (q.options) setOptions(q.options);
        if (q.correctAnswer) setCorrectAnswer(q.correctAnswer);
        if (q.explanation) setExplanation(q.explanation);
        if (q.keyPoints) setKeyPoints(q.keyPoints);
        if (q.wrongOptionExplanations) setWrongExplanations(q.wrongOptionExplanations);
        if (q.tags) setTags(q.tags);
        toast.success("AI 수정 완료. 확인 후 저장하세요."); setAiModifyPrompt("");
      }
    } catch { toast.error("수정 중 오류"); } finally { setAiModifying(false); }
  }

  const diffConfig = DIFFICULTY_OPTIONS.find((d) => d.value === difficulty);
  const passageAnalysis = safeParseJSON<PassageAnalysisData | null>(
    question.passage?.analysis?.analysisData,
    null,
  );

  return (
    <div
      className={`${isModal ? "h-full" : "-m-6"} flex min-h-0 flex-col overflow-hidden`}
      style={{ height: isModal ? "100%" : "calc(100vh - 56px)" }}
    >

      {/* ─── Header: 44px ─── */}
      <div className="flex items-center justify-between px-5 py-2 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          {isModal ? (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100"
            >
              <ArrowLeft className="w-4 h-4 text-slate-500" />
            </button>
          ) : (
            <Link href="/director/questions">
              <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100">
                <ArrowLeft className="w-4 h-4 text-slate-500" />
              </button>
            </Link>
          )}
          <span className="text-[15px] font-bold text-slate-900">문제 편집</span>
          {approved ? (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="w-3 h-3" />승인
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
              <XCircle className="w-3 h-3" />미승인
            </span>
          )}
          {question.aiGenerated && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
              <Layers className="w-3 h-3" />AI
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8 w-[90px] text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>{TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
          <Input value={subType} onChange={(e) => setSubType(e.target.value)} placeholder="세부유형" className="h-8 w-[120px] text-[12px]" />
          <Select value={difficulty} onValueChange={setDifficulty}>
            <SelectTrigger className={`h-8 w-[75px] text-[12px] ${diffConfig?.color || ""}`}><SelectValue /></SelectTrigger>
            <SelectContent>{DIFFICULTY_OPTIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
          </Select>
          <div className="h-5 w-px bg-slate-200" />
          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 text-[12px] px-2.5" onClick={handleDelete} disabled={deleting}>
            <Trash2 className="w-3.5 h-3.5 mr-1" />삭제
          </Button>
          {!approved && (
            <Button variant="ghost" size="sm" className="text-emerald-600 hover:bg-emerald-50 h-8 text-[12px] px-2.5" onClick={handleApprove}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />승인
            </Button>
          )}
          <Button className="bg-blue-600 hover:bg-blue-700 h-8 text-[12px] px-4" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}저장
          </Button>
        </div>
      </div>

      {/* ─── 3-Column Body ─── */}
      <div className="flex-1 min-h-0 flex overflow-auto">

        {/* ── LEFT: Passage source, with analyzed/original views ── */}
        {question.passage && (
          <div className="w-[46%] min-w-[560px] max-w-[660px] shrink-0 border-r border-slate-200 bg-[#F8FAFB] flex min-h-0 flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-white shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                {isModal ? (
                  <span className="text-[13px] font-semibold text-blue-600 truncate">
                    {question.passage.title}
                  </span>
                ) : (
                  <Link href={`/director/workbench/passages/${question.passage.id}`} className="text-[13px] font-semibold text-blue-600 hover:underline truncate">
                    {question.passage.title}
                  </Link>
                )}
              </div>
            </div>

            <Tabs
              defaultValue={passageAnalysis ? "analysis" : "original"}
              className="flex min-h-0 flex-1 flex-col gap-0"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2 shrink-0">
                <TabsList className="h-8 bg-slate-100">
                  <TabsTrigger
                    value="analysis"
                    disabled={!passageAnalysis}
                    className="h-7 px-3 text-[12px]"
                  >
                    분석 보기
                  </TabsTrigger>
                  <TabsTrigger value="original" className="h-7 px-3 text-[12px]">
                    원문 보기
                  </TabsTrigger>
                </TabsList>
                {!passageAnalysis && (
                  <span className="text-[11px] font-medium text-slate-400">
                    분석 데이터 없음
                  </span>
                )}
              </div>

              <TabsContent value="analysis" className="m-0 min-h-0 flex-1 overflow-y-auto p-4">
                {passageAnalysis && (
                  <InteractivePassageView
                    content={question.passage.content}
                    analysisData={passageAnalysis}
                    layout="vertical"
                  />
                )}
              </TabsContent>

              <TabsContent value="original" className="m-0 min-h-0 flex-1 overflow-y-auto p-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-[13px] text-slate-700 font-mono leading-[1.8] whitespace-pre-wrap">
                    {question.passage.content}
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* ── CENTER: Question Editor ── */}
        <div className="flex-1 min-w-[420px] overflow-hidden flex min-h-0 flex-col">

          {/* Tags bar */}
          <div className="flex items-center gap-1.5 px-5 py-2 border-b border-slate-100 bg-white shrink-0 flex-wrap">
            {tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 text-[11px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                {tag}
                <button onClick={() => setTags(tags.filter((t) => t !== tag))} className="hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            ))}
            <input
              placeholder="태그 추가..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              className="h-6 w-[90px] text-[11px] px-2 rounded-md border border-dashed border-slate-300 bg-transparent outline-none focus:border-blue-400 placeholder:text-slate-400"
            />
          </div>

          {/* Editor area — fills remaining space */}
          <div className="flex-1 min-h-0 overflow-y-auto p-5 bg-white">
            <div className="min-h-full flex flex-col gap-4">

              {/* Question text — flex-[2] proportional fill */}
              <div className="flex-[2] min-h-0 flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-slate-500 shrink-0">문제 내용</label>
                <textarea
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  className="w-full flex-1 min-h-0 text-[14px] leading-relaxed px-3 py-2.5 rounded-lg border border-slate-200 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 resize-none text-slate-800 placeholder:text-slate-400"
                  placeholder="문제를 입력하세요..."
                />
              </div>

              {/* Options — flex-[3] proportional fill */}
              {(type === "MULTIPLE_CHOICE" || options.length > 0) && (
                <div className="flex-[3] min-h-0 flex flex-col gap-1.5">
                  <label className="text-[12px] font-semibold text-slate-500 shrink-0">선택지</label>
                  <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-y-auto">
                    {options.map((opt, idx) => (
                      <div key={idx} className="flex items-start gap-2 rounded-lg border border-transparent px-1 py-1 transition-colors hover:border-slate-200 hover:bg-slate-50/70">
                        <button
                          className={`mt-0.5 w-8 h-8 rounded-full text-[13px] font-bold flex items-center justify-center shrink-0 transition-all ${
                            opt.label === correctAnswer ? "bg-emerald-500 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                          }`}
                          onClick={() => setCorrectAnswer(opt.label)}
                          title="정답으로 설정"
                        >
                          {opt.label}
                        </button>
                        <textarea
                          value={opt.text}
                          onChange={(e) => updateOptionText(idx, e.target.value)}
                          placeholder={`${opt.label}번 선택지`}
                          rows={2}
                          className={`flex-1 min-h-[42px] resize-y rounded-md border px-3 py-2 text-[13.5px] leading-relaxed outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                            opt.label === correctAnswer
                              ? "border-emerald-300 bg-emerald-50/50 font-medium text-emerald-950"
                              : "border-slate-200 bg-white text-slate-800"
                          }`}
                        />
                        <div className="mt-1 flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveOption(idx, "up")}
                            disabled={idx === 0}
                            className="w-7 h-7 rounded-md border border-slate-200 bg-white flex items-center justify-center text-slate-500 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
                            title="위로 이동"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveOption(idx, "down")}
                            disabled={idx === options.length - 1}
                            className="w-7 h-7 rounded-md border border-slate-200 bg-white flex items-center justify-center text-slate-500 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
                            title="아래로 이동"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeOption(idx)}
                            className="w-7 h-7 rounded-md border border-red-100 bg-white flex items-center justify-center text-red-500 shadow-sm hover:bg-red-50"
                            title="선택지 삭제"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button onClick={addOption} className="flex items-center gap-1.5 text-[12px] text-blue-600 font-medium hover:text-blue-700 shrink-0">
                      <Plus className="w-3.5 h-3.5" />선택지 추가
                    </button>
                  </div>
                </div>
              )}

              {/* Non-MC answer */}
              {type !== "MULTIPLE_CHOICE" && (
                <div className="flex flex-col gap-1.5 shrink-0">
                  <label className="text-[12px] font-semibold text-slate-500">정답</label>
                  <Input value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} className="text-[14px] h-9" />
                </div>
              )}

              {/* AI Modify (collapsed) */}
              <div className="border-t border-slate-100 pt-3 shrink-0">
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-[12px] font-medium text-blue-600 hover:text-blue-700"
                  onClick={() => setAiModifyOpen(!aiModifyOpen)}
                >
                  <Wand2 className="w-3.5 h-3.5" />AI로 문제 수정
                  <ChevronDown className={`w-3 h-3 transition-transform ${aiModifyOpen ? "rotate-180" : ""}`} />
                </button>
                {aiModifyOpen && (
                  <div className="mt-2 flex gap-2">
                    <input
                      placeholder="예: 선택지 (C)를 더 어렵게 바꿔줘..."
                      value={aiModifyPrompt}
                      onChange={(e) => setAiModifyPrompt(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAiModify(); } }}
                      className="flex-1 h-9 px-3 text-[13px] rounded-lg border border-slate-200 bg-slate-50/60 outline-none focus:border-blue-400 placeholder:text-slate-400"
                    />
                    <Button className="h-9 bg-blue-600 hover:bg-blue-700 text-[12px] px-4 shrink-0" onClick={handleAiModify} disabled={aiModifying || !aiModifyPrompt.trim()}>
                      {aiModifying ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 mr-1" />}
                      {aiModifying ? "수정 중..." : "수정"}
                      {!aiModifying && <span className="ml-1 text-[9px] font-semibold bg-white/20 px-1 py-0.5 rounded">1</span>}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Explanation Panel ── */}
        <div className="w-[360px] shrink-0 border-l border-slate-200 bg-slate-50 flex min-h-0 flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white shrink-0">
            <h3 className="text-[13px] font-semibold text-slate-800 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-blue-500" />해설
            </h3>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 p-4 flex flex-col gap-3 overflow-y-auto">
            {/* Explanation textarea — flex-[3] fills available space */}
            <div className="min-h-[220px] flex flex-col gap-1">
              <textarea
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                className="w-full min-h-[220px] px-3 py-2.5 text-[13px] leading-relaxed rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 resize-y placeholder:text-slate-400"
                placeholder="해설을 입력하세요..."
              />
            </div>

            {/* Key points */}
            <div className="flex flex-col gap-1.5 shrink-0">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">핵심 포인트</label>
              <div className="space-y-1">
                {keyPoints.map((kp, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                    <input
                      value={kp}
                      onChange={(e) => { const u = [...keyPoints]; u[idx] = e.target.value; setKeyPoints(u); }}
                      className="flex-1 h-7 text-[12px] px-2 rounded-md border border-slate-200 bg-white outline-none focus:border-blue-400"
                    />
                    <button onClick={() => setKeyPoints(keyPoints.filter((_, i) => i !== idx))} className="w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-red-500 shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button onClick={() => setKeyPoints([...keyPoints, ""])} className="flex items-center gap-1 text-[11px] text-blue-600 font-medium hover:text-blue-700">
                  <Plus className="w-3 h-3" />추가
                </button>
              </div>
            </div>

            {/* Wrong explanations */}
            {options.length > 0 && (
              <div className="flex flex-col gap-1.5 shrink-0">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">오답 해설</label>
                <div className="space-y-1">
                  {options.filter((o) => o.label !== correctAnswer).map((opt) => (
                    <div key={opt.label} className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-400 w-4 text-center shrink-0">{opt.label}</span>
                      <input
                        value={wrongExplanations[opt.label] || ""}
                        onChange={(e) => setWrongExplanations({ ...wrongExplanations, [opt.label]: e.target.value })}
                        placeholder="오답 이유..."
                        className="flex-1 h-7 text-[12px] px-2 rounded-md border border-slate-200 bg-white outline-none focus:border-blue-400 placeholder:text-slate-400"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
