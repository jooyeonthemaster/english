// @ts-nocheck
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Gem,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { PearlIcon } from "@/components/icons/pearl-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import {
  updateWorkbenchQuestion,
  deleteWorkbenchQuestion,
  approveWorkbenchQuestion,
  unapproveWorkbenchQuestion,
} from "@/actions/workbench";
import {
  getQuestionGenerationPlanFromTags,
  getVisibleQuestionTags,
  isQuestionGenerationPlanTag,
  QUESTION_GENERATION_PLAN_TAGS,
} from "@/lib/question-generation-plans";
import { buildCanonicalSentenceInsertOptionsFrom } from "@/lib/sentence-insert-options";
import type { PassageAnalysisData } from "@/types/passage-analysis";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EditHeader } from "./question-edit-client/header";
import { ExplanationPanel } from "./question-edit-client/explanation-panel";
import { PassagePanel } from "./question-edit-client/passage-panel";

interface Option {
  label: string;
  text: string;
}

function parseCorrectAnswerLabels(correctAnswer: string): Set<string> {
  const labels = new Set<string>();
  const matches = correctAnswer?.match(/[([]?\s*(?:[A-Ja-j]|10|[1-9]|[①②③④⑤⑥⑦⑧⑨⑩])\s*[)\].:]?/g);
  if (matches?.length) {
    matches.forEach((match) => labels.add(normalizeAnswerLabel(match)));
    return labels;
  }
  const single = normalizeAnswerLabel(correctAnswer);
  if (single) labels.add(single);
  return labels;
}

function normalizeAnswerLabel(value: string): string {
  const text = String(value ?? "").trim();
  const circled = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
  const circledIndex = circled.indexOf(text);
  if (circledIndex >= 0) return String(circledIndex + 1);
  return text.replace(/^[\(\[]?\s*([A-Ja-j]|10|[1-9])\s*[\)\].:]?\s*$/, "$1").toLowerCase();
}

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
  onBack?: () => void;
  /** AI '새 문제로 저장' 성공 시 새 문제 id — 임베드 목록 갱신·강조용. */
  onSavedAsNew?: (newQuestionId: string) => void;
  /** "AI로 수정" 버튼 — 워크스페이스가 AI 수정 뷰로 전환. 미지원 유형이면 미전달. */
  onOpenAiEdit?: () => void;
}

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
  onBack,
  onOpenAiEdit,
}: QuestionEditProps) {
  const router = useRouter();
  const isModal = mode === "modal";
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [approved, setApproved] = useState(question.approved);

  const initialOptions: Option[] =
    question.subType === "SENTENCE_INSERT"
      ? buildCanonicalSentenceInsertOptionsFrom(question.options)
      : question.options ? JSON.parse(question.options) : [];
  const rawInitialTags: string[] = question.tags ? JSON.parse(question.tags) : [];
  const generationPlan = getQuestionGenerationPlanFromTags(rawInitialTags);
  const initialTags: string[] = getVisibleQuestionTags(rawInitialTags);
  const initialKeyPoints: string[] = question.explanation?.keyPoints ? JSON.parse(question.explanation.keyPoints) : [];
  const initialWrongExplanations: Record<string, string> = question.explanation?.wrongOptionExplanations
    ? JSON.parse(question.explanation.wrongOptionExplanations)
    : {};

  const [type, setType] = useState(question.type);
  const [subType, setSubType] = useState(question.subType || "");
  const [questionText, setQuestionText] = useState(question.questionText);
  const [options, setOptions] = useState<Option[]>(initialOptions);
  const [correctAnswer, setCorrectAnswer] = useState(question.correctAnswer);
  const [difficulty, setDifficulty] = useState(question.difficulty);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagInput, setTagInput] = useState("");
  const [explanation, setExplanation] = useState(question.explanation?.content || "");
  const [keyPoints, setKeyPoints] = useState<string[]>(initialKeyPoints);
  const [wrongExplanations, setWrongExplanations] = useState<Record<string, string>>(initialWrongExplanations);
  const correctAnswerLabels = parseCorrectAnswerLabels(correctAnswer);

  // ─── 변경사항 추적 (닫기 시 미저장 변경 경고) ───
  const initialSnapshot = JSON.stringify({
    type: question.type,
    subType: question.subType || "",
    questionText: question.questionText,
    options: initialOptions,
    correctAnswer: question.correctAnswer,
    difficulty: question.difficulty,
    tags: initialTags,
    explanation: question.explanation?.content || "",
    keyPoints: initialKeyPoints,
    wrongExplanations: initialWrongExplanations,
  });
  const [baseline, setBaseline] = useState(initialSnapshot);

  const currentSnapshot = JSON.stringify({
    type,
    subType,
    questionText,
    options,
    correctAnswer,
    difficulty,
    tags,
    explanation,
    keyPoints,
    wrongExplanations,
  });
  const isDirty = currentSnapshot !== baseline;

  // AI 적용(덮어쓰기)·router.refresh() 등으로 question prop 이 갱신되면 폼 상태를 다시
  // 초기화한다(아니면 useState 가 갱신 전 값을 붙들어, 스테일 폼에서 '저장'을 누르면 방금
  // 적용한 AI 수정이 옛 값으로 되돌아가는 데이터 손실이 발생). 최초 마운트는 건너뛴다.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    // 미저장 수동편집(폼 dirty)이 있으면 재초기화를 건너뛴다 — 승인/검수 토글·저장의
    // router.refresh() 로 question 참조가 바뀌어도 입력 중인 내용을 폐기하지 않도록 보호.
    if (isDirty) {
      return;
    }
    setType(question.type);
    setSubType(question.subType || "");
    setQuestionText(question.questionText);
    setOptions(initialOptions);
    setCorrectAnswer(question.correctAnswer);
    setDifficulty(question.difficulty);
    setTags(initialTags);
    setExplanation(question.explanation?.content || "");
    setKeyPoints(initialKeyPoints);
    setWrongExplanations(initialWrongExplanations);
    setBaseline(initialSnapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question]);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  function performClose() {
    if (isModal) onClose?.();
    else router.push("/director/questions");
  }
  function requestClose() {
    if (isDirty) {
      setCloseConfirmOpen(true);
      return;
    }
    performClose();
  }

  function addOption() {
    setOptions([...options, { label: String(options.length + 1), text: "" }]);
  }
  function removeOption(idx: number) {
    setOptions(options.filter((_, i) => i !== idx));
  }
  function moveOption(idx: number, dir: "up" | "down") {
    const a = [...options];
    const t = dir === "up" ? idx - 1 : idx + 1;
    if (t < 0 || t >= a.length) return;
    [a[idx], a[t]] = [a[t], a[idx]];
    a.forEach((o, i) => (o.label = String(i + 1)));
    setOptions(a);
  }
  function updateOptionText(idx: number, text: string) {
    setOptions(options.map((o, i) => (i === idx ? { ...o, text } : o)));
  }
  function addTag() {
    const tag = tagInput.trim();
    if (tag && !isQuestionGenerationPlanTag(tag) && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput("");
    }
  }

  async function handleSave() {
    if (!questionText.trim()) {
      toast.error("문제 내용을 입력해주세요.");
      return;
    }
    setSaving(true);
    try {
      const result = await updateWorkbenchQuestion(question.id, {
        type,
        subType: subType || undefined,
        questionText: questionText.trim(),
        options: options.length > 0 ? options : undefined,
        correctAnswer: correctAnswer.trim(),
        difficulty,
        tags: tags.length > 0 ? tags : undefined,
        explanation: explanation.trim() || undefined,
        keyPoints: keyPoints.length > 0 ? keyPoints : undefined,
        wrongOptionExplanations:
          Object.keys(wrongExplanations).length > 0 ? wrongExplanations : undefined,
      });
      if (result.success) {
        toast.success("수정 완료");
        setBaseline(currentSnapshot);
        router.refresh();
        onSaved?.();
      } else toast.error(result.error || "수정 실패");
    } catch {
      toast.error("저장 중 오류");
    } finally {
      setSaving(false);
    }
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
    } else {
      toast.error(r.error || "삭제 실패");
      setDeleting(false);
    }
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

  async function handleUnapprove() {
    const r = await unapproveWorkbenchQuestion(question.id);
    if (r.success) {
      toast.success("검수 취소됨");
      setApproved(false);
      router.refresh();
      onApproved?.();
    } else toast.error(r.error || "검수 취소 실패");
  }

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
      <EditHeader
        isModal={isModal}
        onClose={requestClose}
        onBack={onBack}
        approved={approved}
        aiGenerated={question.aiGenerated}
        type={type}
        setType={setType}
        subType={subType}
        setSubType={setSubType}
        difficulty={difficulty}
        setDifficulty={setDifficulty}
        onDelete={handleDelete}
        onApprove={handleApprove}
        onUnapprove={handleUnapprove}
        onSave={handleSave}
        saving={saving}
        deleting={deleting}
        onOpenAiEdit={question.subType ? onOpenAiEdit : undefined}
      />

      {/* ─── 3-Column Body ─── */}
      <div className="flex-1 min-h-0 flex overflow-auto">
        {/* ── LEFT: Passage source, with analyzed/original views ── */}
        {question.passage && (
          <PassagePanel
            isModal={isModal}
            passage={question.passage}
            passageAnalysis={passageAnalysis}
            questionText={questionText}
            setQuestionText={setQuestionText}
          />
        )}

        {/* ── CENTER: Question Editor ── */}
        <div className="flex-1 min-w-[340px] overflow-hidden flex min-h-0 flex-col bg-white">
          {/* Tags bar */}
          <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-200 bg-white shrink-0 flex-wrap">
            {generationPlan && (generationPlan === "PREMIUM" || FEATURE_FLAGS.SHOW_MODEL_SELECTOR) && (
              <span
                className={`inline-flex items-center gap-1.5 text-[12.5px] font-bold border px-2.5 py-1 rounded-md ${
                  generationPlan === "PREMIUM"
                    ? "border-violet-200 bg-violet-50 text-violet-700"
                    : "border-sky-200 bg-sky-50 text-sky-700"
                }`}
              >
                {generationPlan === "PREMIUM" ? (
                  <Gem className="w-3.5 h-3.5" />
                ) : (
                  <PearlIcon className="w-3.5 h-3.5" />
                )}
                {QUESTION_GENERATION_PLAN_TAGS[generationPlan]}
              </span>
            )}
            {tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-md">
                {tag}
                <button onClick={() => setTags(tags.filter((t) => t !== tag))} className="hover:text-red-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
            <input
              placeholder="태그 추가..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              className="h-8 w-[120px] text-[12.5px] px-2.5 rounded-md border border-dashed border-slate-300 bg-transparent outline-none focus:border-blue-400 placeholder:text-slate-400"
            />
          </div>

          {/* Editor area — fills remaining space */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 bg-white">
            <div className="min-h-full flex flex-col gap-6">
              {/* Question text — only shown when no passage (otherwise rendered in PassagePanel) */}
              {!question.passage && (
                <div className="flex-[2] min-h-0 flex flex-col gap-2">
                  <label className="text-[13px] font-semibold text-slate-700 shrink-0">문제 내용</label>
                  <textarea
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    className="w-full flex-1 min-h-[120px] text-[15px] leading-[1.7] px-4 py-3 rounded-lg border border-slate-200 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 resize-none text-slate-800 placeholder:text-slate-400 shadow-sm"
                    placeholder="문제를 입력하세요..."
                  />
                </div>
              )}

              {/* Options — flex-[3] proportional fill */}
              {(type === "MULTIPLE_CHOICE" || options.length > 0) && (
                <div className="flex-[3] min-h-0 flex flex-col gap-2">
                  <label className="text-[13px] font-semibold text-slate-700 shrink-0">선택지</label>
                  <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto">
                    {options.map((opt, idx) => {
                      const isCorrect = correctAnswerLabels.has(normalizeAnswerLabel(opt.label));
                      return (
                        <div key={idx} className={`rounded-xl border px-2.5 py-2 transition-colors ${
                          isCorrect ? "border-emerald-200 bg-emerald-50/40" : "border-transparent hover:border-slate-200 hover:bg-slate-50/70"
                        }`}>
                          <div className="flex items-start gap-3">
                            <button
                              className={`mt-0.5 w-10 h-10 rounded-full text-[15px] font-bold flex items-center justify-center shrink-0 transition-all ${
                                isCorrect ? "bg-emerald-500 text-white shadow-md ring-2 ring-emerald-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
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
                              rows={4}
                              className={`flex-1 min-h-[96px] resize-y rounded-lg border px-3.5 py-2.5 text-[14.5px] leading-[1.65] outline-none transition-[color,box-shadow] focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-500/10 shadow-sm ${
                                isCorrect
                                  ? "border-emerald-300 bg-white font-medium text-emerald-950"
                                  : "border-slate-200 bg-white text-slate-800"
                              }`}
                            />
                          </div>
                          <div className="mt-2 flex justify-end items-center gap-1 pl-[52px]">
                            <button
                              type="button"
                              onClick={() => moveOption(idx, "up")}
                              disabled={idx === 0}
                              className="w-8 h-8 rounded-md border border-slate-200 bg-white flex items-center justify-center text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35"
                              title="위로 이동"
                            >
                              <ArrowUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveOption(idx, "down")}
                              disabled={idx === options.length - 1}
                              className="w-8 h-8 rounded-md border border-slate-200 bg-white flex items-center justify-center text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35"
                              title="아래로 이동"
                            >
                              <ArrowDown className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeOption(idx)}
                              className="w-8 h-8 rounded-md border border-red-100 bg-white flex items-center justify-center text-red-500 shadow-sm hover:bg-red-50 hover:text-red-600"
                              title="선택지 삭제"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <button onClick={addOption} className="flex items-center gap-1.5 text-[13px] text-blue-600 font-semibold hover:text-blue-700 shrink-0 mt-1 self-start">
                      <Plus className="w-4 h-4" />선택지 추가
                    </button>
                  </div>
                </div>
              )}

              {/* Non-MC answer */}
              {type !== "MULTIPLE_CHOICE" && (
                <div className="flex flex-col gap-2 shrink-0">
                  <label className="text-[13px] font-semibold text-slate-700">정답</label>
                  <Input value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} className="text-[14.5px] h-10" />
                </div>
              )}

            </div>
          </div>
        </div>

        {/* ── RIGHT: Explanation Panel ── */}
        <ExplanationPanel
          explanation={explanation}
          setExplanation={setExplanation}
          keyPoints={keyPoints}
          setKeyPoints={setKeyPoints}
          options={options}
          correctAnswer={correctAnswer}
          wrongExplanations={wrongExplanations}
          setWrongExplanations={setWrongExplanations}
        />
      </div>

      <ConfirmDialog
        open={closeConfirmOpen}
        onOpenChange={setCloseConfirmOpen}
        title="변경사항이 있습니다"
        description="저장하지 않은 변경사항이 있습니다. 그래도 닫으시겠습니까?"
        confirmText="닫기"
        cancelText="취소"
        variant="destructive"
        onConfirm={performClose}
      />
    </div>
  );
}
