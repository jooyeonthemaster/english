"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  FileText,
  Settings2,
  Loader2,
  Check,
  X,
  Save,
  ChevronDown,
  ChevronUp,
  Pencil,
  Eye,
  Database,
  Cpu,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { saveGeneratedQuestions } from "@/actions/workbench";
import { truncate } from "@/lib/utils";

interface PassageInfo {
  id: string;
  title: string;
  content: string;
  grade: number | null;
  semester: string | null;
  school: { id: string; name: string; type: string } | null;
}

interface GeneratedQuestion {
  type: string;
  subType?: string;
  questionText: string;
  options?: { label: string; text: string }[];
  correctAnswer: string;
  difficulty: string;
  explanation: string;
  keyPoints: string[];
  wrongOptionExplanations?: Record<string, string>;
  tags: string[];
  // Client-side state
  approved: boolean;
  editing: boolean;
  showAnswer: boolean;
}

const QUESTION_TYPES = [
  { value: "BLANK_INFERENCE", label: "빈칸 추론", parent: "MULTIPLE_CHOICE" },
  { value: "GRAMMAR_ERROR", label: "어법상 틀린 것 고르기", parent: "MULTIPLE_CHOICE" },
  { value: "SENTENCE_INSERT", label: "주어진 문장 넣기", parent: "MULTIPLE_CHOICE" },
  { value: "SENTENCE_ORDER", label: "문장 순서 배열", parent: "ORDERING" },
  { value: "MAIN_IDEA", label: "주제/요지/제목", parent: "MULTIPLE_CHOICE" },
  { value: "PURPOSE", label: "글의 목적", parent: "MULTIPLE_CHOICE" },
  { value: "IMPLICATION", label: "함축 의미 추론", parent: "MULTIPLE_CHOICE" },
  { value: "REFERENCE", label: "지칭 대상 파악", parent: "MULTIPLE_CHOICE" },
  { value: "TRUE_FALSE", label: "내용 일치/불일치", parent: "MULTIPLE_CHOICE" },
  { value: "SUMMARY", label: "요약문 완성", parent: "FILL_BLANK" },
  { value: "VOCAB_MEANING", label: "밑줄 친 단어의 의미", parent: "MULTIPLE_CHOICE" },
  { value: "VOCAB_SYNONYM", label: "동의어/유의어", parent: "VOCAB" },
  { value: "CONNECTIVE", label: "연결어 넣기", parent: "FILL_BLANK" },
  { value: "IRRELEVANT_SENTENCE", label: "관계없는 문장 고르기", parent: "MULTIPLE_CHOICE" },
];

const DIFFICULTY_CONFIG: Record<string, { label: string; className: string }> = {
  BASIC: { label: "기본", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  INTERMEDIATE: { label: "중급", className: "bg-blue-50 text-blue-700 border-blue-200" },
  KILLER: { label: "킬러", className: "bg-red-50 text-red-700 border-red-200" },
};

const TYPE_LABELS: Record<string, string> = {
  MULTIPLE_CHOICE: "객관식",
  SHORT_ANSWER: "주관식",
  FILL_BLANK: "빈칸",
  ORDERING: "순서배열",
  VOCAB: "어휘",
};

const STEPS = [
  { id: 1, label: "지문 선택", icon: FileText },
  { id: 2, label: "생성 설정", icon: Settings2 },
  { id: 3, label: "AI 생성", icon: Cpu },
  { id: 4, label: "검수 및 편집", icon: Eye },
  { id: 5, label: "저장", icon: Save },
];

export function QuestionGeneratorClient({
  passages,
  initialPassageId,
}: {
  passages: PassageInfo[];
  initialPassageId?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(initialPassageId ? 2 : 1);
  const [selectedPassageId, setSelectedPassageId] = useState(
    initialPassageId || ""
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([
    "BLANK_INFERENCE",
    "GRAMMAR_ERROR",
    "MAIN_IDEA",
    "TRUE_FALSE",
    "VOCAB_MEANING",
  ]);
  const [count, setCount] = useState(5);
  const [basicRatio, setBasicRatio] = useState(30);
  const [intermediateRatio, setIntermediateRatio] = useState(50);
  const [generating, setGenerating] = useState(false);
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [saving, setSaving] = useState(false);

  const killerRatio = 100 - basicRatio - intermediateRatio;

  const selectedPassage = useMemo(
    () => passages.find((p) => p.id === selectedPassageId),
    [passages, selectedPassageId]
  );

  const filteredPassages = useMemo(() => {
    if (!searchQuery.trim()) return passages;
    const q = searchQuery.toLowerCase();
    return passages.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q)
    );
  }, [passages, searchQuery]);

  const approvedCount = questions.filter((q) => q.approved).length;
  const rejectedCount = questions.filter((q) => !q.approved).length;

  function toggleType(value: string) {
    setSelectedTypes((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]
    );
  }

  async function handleGenerate() {
    if (!selectedPassageId) return;
    if (selectedTypes.length === 0) {
      toast.error("최소 1개 문제 유형을 선택하세요.");
      return;
    }
    if (killerRatio < 0) {
      toast.error("난이도 비율 합이 100%를 초과합니다.");
      return;
    }

    setStep(3);
    setGenerating(true);
    setQuestions([]);

    try {
      const res = await fetch("/api/ai/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passageId: selectedPassageId,
          questionTypes: selectedTypes,
          difficultyDistribution: {
            BASIC: basicRatio,
            INTERMEDIATE: intermediateRatio,
            KILLER: killerRatio,
          },
          count,
        }),
      });

      const json = await res.json();

      if (json.error) {
        toast.error(json.error);
        setStep(2);
      } else {
        const generated: GeneratedQuestion[] = (json.questions || []).map(
          (q: GeneratedQuestion) => ({
            ...q,
            approved: true,
            editing: false,
            showAnswer: false,
          })
        );
        setQuestions(generated);
        setStep(4);
        toast.success(`${generated.length}개 문제가 생성되었습니다.`);
      }
    } catch {
      toast.error("문제 생성 중 오류가 발생했습니다.");
      setStep(2);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    const toSave = questions.filter((q) => q.approved);
    if (toSave.length === 0) {
      toast.error("저장할 문제가 없습니다.");
      return;
    }

    setSaving(true);
    try {
      const result = await saveGeneratedQuestions(
        toSave.map((q) => ({
          passageId: selectedPassageId,
          type: q.options && q.options.length > 0 ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
          subType: q.subType,
          questionText: q.questionText,
          options: q.options,
          correctAnswer: q.correctAnswer,
          points: 1,
          difficulty: q.difficulty,
          tags: q.tags,
          aiGenerated: true,
          explanation: q.explanation,
          keyPoints: q.keyPoints,
          wrongOptionExplanations: q.wrongOptionExplanations,
        }))
      );

      if (result.success) {
        toast.success(`${toSave.length}개 문제가 문제 은행에 저장되었습니다.`);
        setStep(5);
      } else {
        toast.error(result.error || "저장 실패");
      }
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function updateQuestion(idx: number, update: Partial<GeneratedQuestion>) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, ...update } : q))
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/director/workbench">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            AI 문제 생성
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            지문을 기반으로 고품질 내신 문제를 자동 생성합니다
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, idx) => {
          const Icon = s.icon;
          const isActive = step === s.id;
          const isDone = step > s.id;
          return (
            <div key={s.id} className="flex items-center gap-2">
              {idx > 0 && (
                <div
                  className={`w-8 h-px ${
                    isDone ? "bg-blue-400" : "bg-slate-200"
                  }`}
                />
              )}
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : isDone
                    ? "bg-blue-100 text-blue-700"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                {isDone ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <Icon className="w-3 h-3" />
                )}
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Step 1: Passage Selection */}
      {step === 1 && (
        <div className="space-y-4">
          <Input
            placeholder="지문 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
          <div className="grid grid-cols-2 gap-3">
            {filteredPassages.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPassageId(p.id)}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  selectedPassageId === p.id
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <h3 className="font-semibold text-sm text-slate-800">
                  {p.title}
                </h3>
                <p className="text-xs text-slate-500 mt-1 font-mono line-clamp-2">
                  {truncate(p.content, 120)}
                </p>
                <div className="flex gap-1.5 mt-2">
                  {p.school && (
                    <Badge variant="outline" className="text-[10px]">
                      {p.school.name}
                    </Badge>
                  )}
                  {p.grade && (
                    <Badge variant="secondary" className="text-[10px]">
                      {p.grade}학년
                    </Badge>
                  )}
                </div>
              </button>
            ))}
          </div>
          {filteredPassages.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              등록된 지문이 없습니다.{" "}
              <Link
                href="/director/workbench/passages/create"
                className="text-blue-500 underline"
              >
                지문 등록하기
              </Link>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => setStep(2)}
              disabled={!selectedPassageId}
              className="bg-blue-600 hover:bg-blue-700"
            >
              다음
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Settings */}
      {step === 2 && (
        <div className="grid grid-cols-3 gap-6">
          {/* Selected passage preview */}
          <Card className="col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">선택된 지문</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedPassage && (
                <div>
                  <h3 className="font-semibold text-slate-800">
                    {selectedPassage.title}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono mt-2 line-clamp-8">
                    {selectedPassage.content}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 text-xs"
                    onClick={() => setStep(1)}
                  >
                    다른 지문 선택
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Settings */}
          <div className="col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">
                  문제 유형 선택
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {QUESTION_TYPES.map((qt) => (
                    <label
                      key={qt.value}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedTypes.includes(qt.value)}
                        onCheckedChange={() => toggleType(qt.value)}
                      />
                      <span className="text-sm text-slate-700">{qt.label}</span>
                      <Badge variant="outline" className="text-[9px] ml-auto">
                        {TYPE_LABELS[qt.parent] || qt.parent}
                      </Badge>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">생성 설정</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs text-slate-500">총 문제 수</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={count}
                    onChange={(e) => setCount(parseInt(e.target.value) || 5)}
                    className="w-24 mt-1"
                  />
                </div>

                <Separator />

                <div>
                  <Label className="text-xs text-slate-500 mb-3 block">
                    난이도 배분 (합계 100%)
                  </Label>
                  <div className="space-y-3">
                    <DifficultySlider
                      label="기본 (BASIC)"
                      value={basicRatio}
                      onChange={setBasicRatio}
                      color="bg-emerald-500"
                    />
                    <DifficultySlider
                      label="중급 (INTERMEDIATE)"
                      value={intermediateRatio}
                      onChange={setIntermediateRatio}
                      color="bg-blue-500"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">
                        킬러 (KILLER)
                      </span>
                      <span
                        className={`text-sm font-bold ${
                          killerRatio < 0 ? "text-red-500" : "text-red-600"
                        }`}
                      >
                        {killerRatio}%
                      </span>
                    </div>
                    {killerRatio < 0 && (
                      <p className="text-xs text-red-500">
                        합계가 100%를 초과합니다. 비율을 조정해주세요.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="w-4 h-4 mr-1" />
                이전
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={
                  !selectedPassageId ||
                  selectedTypes.length === 0 ||
                  killerRatio < 0
                }
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Sparkles className="w-4 h-4 mr-1.5" />
                AI 문제 생성
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Generating */}
      {step === 3 && (
        <div className="flex items-center justify-center py-24">
          <div className="text-center space-y-6">
            <div className="relative inline-block">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center animate-pulse">
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center">
                <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
              </div>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                문제를 생성하고 있습니다...
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                AI가 지문을 분석하고 {count}개의 문제를 생성합니다.
              </p>
              <p className="text-xs text-slate-400 mt-3">
                보통 10~30초 정도 소요됩니다
              </p>
            </div>
            <div className="flex justify-center gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge className="bg-emerald-100 text-emerald-700">
                {approvedCount}개 승인
              </Badge>
              <Badge className="bg-red-100 text-red-700">
                {rejectedCount}개 제외
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="w-4 h-4 mr-1" />
                재생성
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || approvedCount === 0}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Database className="w-4 h-4 mr-1.5" />
                )}
                문제 은행에 저장 ({approvedCount}개)
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {questions.map((q, idx) => (
              <QuestionReviewCard
                key={idx}
                question={q}
                index={idx}
                onUpdate={(update) => updateQuestion(idx, update)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Step 5: Done */}
      {step === 5 && (
        <div className="flex items-center justify-center py-24">
          <div className="text-center space-y-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-emerald-100">
              <Check className="w-10 h-10 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                저장 완료!
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                {approvedCount}개의 문제가 문제 은행에 저장되었습니다.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <Link href="/director/questions">
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Database className="w-4 h-4 mr-1.5" />
                  문제 은행 보기
                </Button>
              </Link>
              <Button
                variant="outline"
                onClick={() => {
                  setStep(2);
                  setQuestions([]);
                }}
              >
                추가 생성
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DifficultySlider({
  label,
  value,
  onChange,
  color,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  color: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">{label}</span>
        <span className="text-sm font-bold text-slate-700">{value}%</span>
      </div>
      <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 ${color} rounded-full transition-all`}
          style={{ width: `${value}%` }}
        />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-1 opacity-0 absolute cursor-pointer"
        style={{ marginTop: "-14px" }}
      />
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full accent-slate-600"
      />
    </div>
  );
}

function QuestionReviewCard({
  question,
  index,
  onUpdate,
}: {
  question: GeneratedQuestion;
  index: number;
  onUpdate: (update: Partial<GeneratedQuestion>) => void;
}) {
  const [showExplanation, setShowExplanation] = useState(false);
  const diffConfig = DIFFICULTY_CONFIG[question.difficulty];

  return (
    <Card
      className={`transition-all ${
        !question.approved ? "opacity-50 border-slate-200" : "border-slate-200"
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Number */}
          <div className="text-lg font-bold text-slate-300 w-8 text-center shrink-0 pt-0.5">
            {index + 1}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Badges row */}
            <div className="flex items-center gap-2 flex-wrap">
              {question.subType && (
                <Badge variant="outline" className="text-[10px]">
                  {QUESTION_TYPES.find((t) => t.value === question.subType)
                    ?.label || question.subType}
                </Badge>
              )}
              {diffConfig && (
                <Badge
                  variant="outline"
                  className={`text-[10px] ${diffConfig.className}`}
                >
                  {diffConfig.label}
                </Badge>
              )}
              <Sparkles className="w-3 h-3 text-amber-500" />
              {question.tags.slice(0, 3).map((t) => (
                <Badge
                  key={t}
                  variant="outline"
                  className="text-[10px] text-slate-400"
                >
                  {t}
                </Badge>
              ))}
            </div>

            {/* Question text */}
            {question.editing ? (
              <textarea
                className="w-full p-2 text-sm border rounded-lg resize-none min-h-[60px] font-mono"
                value={question.questionText}
                onChange={(e) =>
                  onUpdate({ questionText: e.target.value })
                }
              />
            ) : (
              <p className="text-sm text-slate-700 leading-relaxed">
                {question.questionText}
              </p>
            )}

            {/* Options */}
            {question.options && question.options.length > 0 && (
              <div className="space-y-1 pl-2">
                {question.options.map((opt) => (
                  <div
                    key={opt.label}
                    className={`flex items-start gap-2 text-sm p-1.5 rounded ${
                      question.showAnswer &&
                      opt.label === question.correctAnswer
                        ? "bg-emerald-50 text-emerald-700 font-medium"
                        : "text-slate-600"
                    }`}
                  >
                    <span className="text-slate-400 shrink-0 w-4 text-center">
                      {opt.label}
                    </span>
                    <span>{opt.text}</span>
                    {question.showAnswer &&
                      opt.label === question.correctAnswer && (
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      )}
                  </div>
                ))}
              </div>
            )}

            {/* Answer toggle */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => onUpdate({ showAnswer: !question.showAnswer })}
              >
                <Eye className="w-3 h-3 mr-1" />
                {question.showAnswer ? "정답 숨기기" : "정답 미리보기"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => setShowExplanation(!showExplanation)}
              >
                {showExplanation ? (
                  <ChevronUp className="w-3 h-3 mr-1" />
                ) : (
                  <ChevronDown className="w-3 h-3 mr-1" />
                )}
                해설
              </Button>
            </div>

            {/* Explanation */}
            {showExplanation && (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 space-y-2">
                <p className="text-sm text-slate-700">{question.explanation}</p>
                {question.keyPoints.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-blue-600">핵심 포인트:</p>
                    {question.keyPoints.map((kp, i) => (
                      <p key={i} className="text-xs text-slate-600 pl-2">
                        - {kp}
                      </p>
                    ))}
                  </div>
                )}
                {question.wrongOptionExplanations && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-red-600">오답 해설:</p>
                    {Object.entries(question.wrongOptionExplanations).map(
                      ([key, val]) => (
                        <p key={key} className="text-xs text-slate-600 pl-2">
                          {key}번: {val}
                        </p>
                      )
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onUpdate({ editing: !question.editing })}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant={question.approved ? "default" : "ghost"}
              size="icon"
              className={`h-7 w-7 ${
                question.approved
                  ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                  : ""
              }`}
              onClick={() => onUpdate({ approved: true })}
            >
              <Check className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant={!question.approved ? "default" : "ghost"}
              size="icon"
              className={`h-7 w-7 ${
                !question.approved
                  ? "bg-red-500 hover:bg-red-600 text-white"
                  : ""
              }`}
              onClick={() => onUpdate({ approved: false })}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
