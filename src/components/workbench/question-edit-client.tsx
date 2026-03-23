"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Sparkles,
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  updateWorkbenchQuestion,
  deleteWorkbenchQuestion,
  approveWorkbenchQuestion,
} from "@/actions/workbench";

interface Option {
  label: string;
  text: string;
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
    passage: { id: string; title: string; content: string } | null;
    explanation: {
      id: string;
      content: string;
      keyPoints: string | null;
      wrongOptionExplanations: string | null;
      relatedGrammar: string | null;
      aiGenerated: boolean;
    } | null;
  };
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
  { value: "BASIC", label: "기본" },
  { value: "INTERMEDIATE", label: "중급" },
  { value: "KILLER", label: "킬러" },
];

export function QuestionEditClient({ question }: QuestionEditProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generatingExplanation, setGeneratingExplanation] = useState(false);

  const initialOptions: Option[] = question.options
    ? JSON.parse(question.options)
    : [];
  const initialTags: string[] = question.tags ? JSON.parse(question.tags) : [];
  const initialKeyPoints: string[] = question.explanation?.keyPoints
    ? JSON.parse(question.explanation.keyPoints)
    : [];
  const initialWrongExplanations: Record<string, string> =
    question.explanation?.wrongOptionExplanations
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
  const [explanation, setExplanation] = useState(
    question.explanation?.content || ""
  );
  const [aiModifyOpen, setAiModifyOpen] = useState(false);
  const [aiModifyPrompt, setAiModifyPrompt] = useState("");
  const [aiModifying, setAiModifying] = useState(false);
  const [keyPoints, setKeyPoints] = useState<string[]>(initialKeyPoints);
  const [wrongExplanations, setWrongExplanations] = useState<
    Record<string, string>
  >(initialWrongExplanations);

  function addOption() {
    const nextLabel = String(options.length + 1);
    setOptions([...options, { label: nextLabel, text: "" }]);
  }

  function removeOption(idx: number) {
    setOptions(options.filter((_, i) => i !== idx));
  }

  function moveOption(idx: number, direction: "up" | "down") {
    const newOptions = [...options];
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= newOptions.length) return;
    [newOptions[idx], newOptions[target]] = [newOptions[target], newOptions[idx]];
    // Re-label
    newOptions.forEach((o, i) => (o.label = String(i + 1)));
    setOptions(newOptions);
  }

  function updateOptionText(idx: number, text: string) {
    setOptions(
      options.map((o, i) => (i === idx ? { ...o, text } : o))
    );
  }

  function addTag() {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
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
          Object.keys(wrongExplanations).length > 0
            ? wrongExplanations
            : undefined,
      });

      if (result.success) {
        toast.success("문제가 수정되었습니다.");
        router.refresh();
      } else {
        toast.error(result.error || "수정 실패");
      }
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("이 문제를 삭제하시겠습니까?")) return;
    setDeleting(true);
    const result = await deleteWorkbenchQuestion(question.id);
    if (result.success) {
      toast.success("문제가 삭제되었습니다.");
      router.push("/director/questions");
    } else {
      toast.error(result.error || "삭제 실패");
      setDeleting(false);
    }
  }

  async function handleApprove() {
    const result = await approveWorkbenchQuestion(question.id);
    if (result.success) {
      toast.success("문제가 승인되었습니다.");
      router.refresh();
    } else {
      toast.error(result.error || "승인 실패");
    }
  }

  async function handleAiModify() {
    if (!aiModifyPrompt.trim()) {
      toast.error("수정 요청 내용을 입력해주세요.");
      return;
    }
    setAiModifying(true);
    try {
      const res = await fetch("/api/ai/modify-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          instruction: aiModifyPrompt.trim(),
          currentState: {
            type,
            subType,
            questionText,
            options,
            correctAnswer,
            difficulty,
            explanation,
            keyPoints,
            tags,
          },
        }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        const q = json.question;
        if (q.questionText) setQuestionText(q.questionText);
        if (q.options) setOptions(q.options);
        if (q.correctAnswer) setCorrectAnswer(q.correctAnswer);
        if (q.explanation) setExplanation(q.explanation);
        if (q.keyPoints) setKeyPoints(q.keyPoints);
        if (q.wrongOptionExplanations)
          setWrongExplanations(q.wrongOptionExplanations);
        if (q.tags) setTags(q.tags);
        toast.success("AI가 문제를 수정했습니다. 확인 후 저장해주세요.");
        setAiModifyPrompt("");
      }
    } catch {
      toast.error("문제 수정 중 오류가 발생했습니다.");
    } finally {
      setAiModifying(false);
    }
  }

  async function handleGenerateExplanation() {
    setGeneratingExplanation(true);
    try {
      const res = await fetch("/api/ai/generate-explanation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        setExplanation(json.data.explanation);
        setKeyPoints(json.data.keyPoints || []);
        if (json.data.wrongOptionExplanations) {
          setWrongExplanations(json.data.wrongOptionExplanations);
        }
        toast.success("AI 해설이 생성되었습니다.");
      }
    } catch {
      toast.error("해설 생성 중 오류가 발생했습니다.");
    } finally {
      setGeneratingExplanation(false);
    }
  }

  const [passageExpanded, setPassageExpanded] = useState(false);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/director/questions">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            문제 상세
            {question.aiGenerated && (
              <Sparkles className="w-4 h-4 text-amber-500" />
            )}
          </h1>
          {question.approved ? (
            <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
              <CheckCircle2 className="w-3 h-3 mr-0.5" />
              승인 완료
            </Badge>
          ) : (
            <Badge className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
              <XCircle className="w-3 h-3 mr-0.5" />
              미승인
            </Badge>
          )}
          {question.aiGenerated && (
            <Badge variant="outline" className="text-[10px] text-amber-600">
              AI 생성
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-red-500 hover:text-red-600 hover:bg-red-50"
            onClick={handleDelete}
            disabled={deleting}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            삭제
          </Button>
          {!question.approved && (
            <Button
              variant="outline"
              size="sm"
              className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
              onClick={handleApprove}
            >
              <CheckCircle2 className="w-4 h-4 mr-1" />
              승인
            </Button>
          )}
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1.5" />
            )}
            저장
          </Button>
        </div>
      </div>

      {/* Metadata bar - horizontal */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-400 shrink-0">유형</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-8 w-[110px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-400 shrink-0">세부 유형</Label>
              <Input
                value={subType}
                onChange={(e) => setSubType(e.target.value)}
                placeholder="예: BLANK_INFERENCE"
                className="h-8 w-[160px] text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-400 shrink-0">난이도</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger className="h-8 w-[90px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIFFICULTY_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Label className="text-xs text-slate-400 shrink-0">태그</Label>
              <div className="flex items-center gap-1.5 flex-wrap flex-1">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-[11px] pr-1"
                  >
                    {tag}
                    <button
                      onClick={() => setTags(tags.filter((t) => t !== tag))}
                      className="ml-1 hover:text-red-500"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </Badge>
                ))}
                <div className="flex items-center gap-1">
                  <Input
                    placeholder="추가..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    className="h-7 w-[80px] text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={addTag}
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Passage - full width, expandable */}
      {question.passage && (
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <Link
                    href={`/director/workbench/passages/${question.passage.id}`}
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    {question.passage.title}
                  </Link>
                </div>
                <p
                  className={`text-xs text-slate-500 font-mono leading-relaxed ${
                    passageExpanded ? "" : "line-clamp-4"
                  }`}
                >
                  {question.passage.content}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-slate-400 shrink-0"
                onClick={() => setPassageExpanded(!passageExpanded)}
              >
                {passageExpanded ? "접기" : "펼치기"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Two-column grid: Question + Options | Explanation */}
      <div className="grid grid-cols-2 gap-4">
        {/* Left: Question & Options */}
        <Card className="h-fit">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">문제 내용</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <Textarea
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              className="min-h-[80px] text-sm"
              placeholder="문제를 입력하세요..."
            />

            {/* Options editor */}
            {(type === "MULTIPLE_CHOICE" || options.length > 0) && (
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">선택지</Label>
                {options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <button
                      className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 transition-colors ${
                        opt.label === correctAnswer
                          ? "bg-emerald-500 text-white"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                      onClick={() => setCorrectAnswer(opt.label)}
                      title="정답으로 설정"
                    >
                      {opt.label}
                    </button>
                    <Input
                      value={opt.text}
                      onChange={(e) => updateOptionText(idx, e.target.value)}
                      placeholder={`${opt.label}번 선택지`}
                      className="flex-1 text-sm h-8"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => moveOption(idx, "up")}
                      disabled={idx === 0}
                    >
                      <ArrowUp className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => moveOption(idx, "down")}
                      disabled={idx === options.length - 1}
                    >
                      <ArrowDown className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-red-400 hover:text-red-500 shrink-0"
                      onClick={() => removeOption(idx)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={addOption}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  선택지 추가
                </Button>
              </div>
            )}

            {/* Correct answer (for non-MC) */}
            {type !== "MULTIPLE_CHOICE" && (
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">정답</Label>
                <Input
                  value={correctAnswer}
                  onChange={(e) => setCorrectAnswer(e.target.value)}
                  className="text-sm h-8"
                />
              </div>
            )}
            {/* AI Modify Panel */}
            <Separator />
            <div>
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
                onClick={() => setAiModifyOpen(!aiModifyOpen)}
              >
                <Wand2 className="w-3.5 h-3.5" />
                AI로 문제 수정
                <ChevronDown
                  className={`w-3 h-3 transition-transform ${
                    aiModifyOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {aiModifyOpen && (
                <div className="mt-2 space-y-2">
                  <textarea
                    placeholder="예: 선택지 (C)를 더 어렵게 바꿔줘 / 정답 선택지를 (B)로 변경해줘 / 문제 발문을 수능 스타일로 다듬어줘..."
                    value={aiModifyPrompt}
                    onChange={(e) => setAiModifyPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleAiModify();
                      }
                    }}
                    className="w-full min-h-[48px] px-2.5 py-2 text-[12px] leading-relaxed rounded-md border border-slate-200 bg-slate-50/60 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-400 resize-none"
                  />
                  <Button
                    className="w-full h-8 bg-blue-600 hover:bg-blue-700 text-xs"
                    onClick={handleAiModify}
                    disabled={aiModifying || !aiModifyPrompt.trim()}
                  >
                    {aiModifying ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    {aiModifying ? "수정 중..." : "AI 수정 요청"}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right: Explanation */}
        <Card className="h-fit">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                해설
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={handleGenerateExplanation}
                disabled={generatingExplanation}
              >
                {generatingExplanation ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3 mr-1" />
                )}
                AI 해설 생성
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <Textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              className="min-h-[80px] text-sm"
              placeholder="해설을 입력하세요..."
            />

            {/* Key points */}
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">
                핵심 포인트
              </Label>
              <div className="space-y-1.5">
                {keyPoints.map((kp, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <Input
                      value={kp}
                      onChange={(e) => {
                        const updated = [...keyPoints];
                        updated[idx] = e.target.value;
                        setKeyPoints(updated);
                      }}
                      className="text-sm flex-1 h-8"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() =>
                        setKeyPoints(keyPoints.filter((_, i) => i !== idx))
                      }
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setKeyPoints([...keyPoints, ""])}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  포인트 추가
                </Button>
              </div>
            </div>

            {/* Wrong option explanations */}
            {options.length > 0 && (
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  오답 해설
                </Label>
                <div className="space-y-1.5">
                  {options
                    .filter((o) => o.label !== correctAnswer)
                    .map((opt) => (
                      <div key={opt.label} className="flex items-start gap-1.5">
                        <span className="text-[11px] font-bold text-slate-400 w-5 text-center pt-1.5">
                          {opt.label}
                        </span>
                        <Input
                          value={wrongExplanations[opt.label] || ""}
                          onChange={(e) =>
                            setWrongExplanations({
                              ...wrongExplanations,
                              [opt.label]: e.target.value,
                            })
                          }
                          placeholder={`${opt.label}번이 오답인 이유`}
                          className="text-sm flex-1 h-8"
                        />
                      </div>
                    ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
