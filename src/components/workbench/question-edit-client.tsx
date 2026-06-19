// @ts-nocheck
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GripVertical,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  updateWorkbenchQuestion,
  deleteWorkbenchQuestion,
  approveWorkbenchQuestion,
  unapproveWorkbenchQuestion,
} from "@/actions/workbench";
import {
  getVisibleQuestionTags,
} from "@/lib/question-generation-plans";
import { buildCanonicalSentenceInsertOptionsFrom } from "@/lib/sentence-insert-options";
import type { PassageAnalysisData } from "@/types/passage-analysis";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EditHeader } from "./question-edit-client/header";
import { ExplanationPanel } from "./question-edit-client/explanation-panel";
import { PassagePanel } from "./question-edit-client/passage-panel";
import { AiEditOverlay } from "./question-ai-edit/ai-edit-overlay";

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
  const initialTags: string[] = getVisibleQuestionTags(rawInitialTags);
  const initialKeyPoints: string[] = question.explanation?.keyPoints ? JSON.parse(question.explanation.keyPoints) : [];
  const initialWrongExplanations: Record<string, string> = question.explanation?.wrongOptionExplanations
    ? JSON.parse(question.explanation.wrongOptionExplanations)
    : {};

  const [type, setType] = useState(question.type);
  const [subType, setSubType] = useState(question.subType || "");
  const [questionText, setQuestionText] = useState(question.questionText);
  const [options, setOptions] = useState<Option[]>(initialOptions);
  // 선택지 드래그 정렬 — 손잡이(GripVertical)에서만 드래그 시작
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState(question.correctAnswer);
  const [difficulty, setDifficulty] = useState(question.difficulty);
  // 내용 태그 편집 UI는 제거됨 — 기존 값은 저장 시 보존만 한다.
  const [tags] = useState<string[]>(initialTags);
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
  const [aiEditOpen, setAiEditOpen] = useState(false);

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
  function reorderOption(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    const a = [...options];
    const [moved] = a.splice(from, 1);
    a.splice(to, 0, moved);
    a.forEach((o, i) => (o.label = String(i + 1)));
    setOptions(a);
  }
  function updateOptionText(idx: number, text: string) {
    setOptions(options.map((o, i) => (i === idx ? { ...o, text } : o)));
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
        onOpenAiEdit={question.subType ? () => setAiEditOpen(true) : undefined}
      />

      <AiEditOverlay
        questionId={question.id}
        open={aiEditOpen}
        onClose={() => setAiEditOpen(false)}
        onApplied={() => router.refresh()}
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
                      const isMC = type === "MULTIPLE_CHOICE";
                      return (
                        <div
                          key={idx}
                          onDragOver={(e) => {
                            if (dragIndex === null) return;
                            e.preventDefault();
                            setDragOverIndex(idx);
                          }}
                          onDrop={(e) => {
                            if (dragIndex === null) return;
                            e.preventDefault();
                            reorderOption(dragIndex, idx);
                            setDragIndex(null);
                            setDragOverIndex(null);
                          }}
                          className={`rounded-xl border px-3 py-2 transition-colors ${
                            isCorrect
                              ? "border-blue-300 bg-blue-50/40"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          } ${dragIndex === idx ? "opacity-50" : ""} ${
                            dragOverIndex === idx && dragIndex !== idx ? "ring-2 ring-blue-300" : ""
                          }`}
                        >
                          {/* 헤더 — 손잡이 + 선지번호(객관식) ··· 닫기 */}
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <span
                                draggable
                                onDragStart={(e) => {
                                  setDragIndex(idx);
                                  e.dataTransfer.effectAllowed = "move";
                                }}
                                onDragEnd={() => {
                                  setDragIndex(null);
                                  setDragOverIndex(null);
                                }}
                                className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 shrink-0"
                                title="드래그하여 순서 변경"
                              >
                                <GripVertical className="w-4 h-4" />
                              </span>
                              {isMC && (
                                <button
                                  type="button"
                                  className={`w-6 h-6 aspect-square leading-none rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 transition-all ${
                                    isCorrect ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                  }`}
                                  onClick={() => setCorrectAnswer(opt.label)}
                                  title="정답으로 설정"
                                >
                                  {normalizeAnswerLabel(opt.label)}
                                </button>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeOption(idx)}
                              className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 shrink-0"
                              title="선택지 삭제"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <textarea
                            value={opt.text}
                            onChange={(e) => updateOptionText(idx, e.target.value)}
                            placeholder={`${opt.label}번 선택지`}
                            rows={4}
                            className={`w-full min-h-[96px] resize-y rounded-lg border px-3.5 py-2.5 text-[14.5px] leading-[1.65] outline-none transition-[color,box-shadow] focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-500/10 shadow-sm ${
                              isCorrect
                                ? "border-blue-300 bg-white font-semibold text-blue-700"
                                : "border-slate-200 bg-white text-slate-800"
                            }`}
                          />
                        </div>
                      );
                    })}
                    <button onClick={addOption} className="flex h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white text-[12.5px] font-semibold text-slate-500 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 mt-1">
                      <Plus className="h-4 w-4" />선택지 추가
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
