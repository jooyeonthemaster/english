"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  GripVertical,
  Plus,
  Search,
  Trash2,
  Database,
  FileEdit,
  Eye,
  Save,
  Send,
} from "lucide-react";
import { createExam, publishExam, getQuestionBank } from "@/actions/exams";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ClassOption {
  id: string;
  name: string;
}
interface SchoolOption {
  id: string;
  name: string;
}

interface QuestionBankItem {
  id: string;
  type: string;
  questionText: string;
  difficulty: string;
  points: number;
  tags: string | null;
}

interface SelectedQuestion {
  questionId: string;
  questionText: string;
  type: string;
  points: number;
  orderNum: number;
}

interface Props {
  academyId: string;
  classes: ClassOption[];
  schools: SchoolOption[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STEPS = [
  { label: "기본 정보", num: 1 },
  { label: "문제 추가", num: 2 },
  { label: "설정", num: 3 },
  { label: "미리보기", num: 4 },
];

const TYPE_LABELS: Record<string, string> = {
  MULTIPLE_CHOICE: "객관식",
  SHORT_ANSWER: "단답형",
  ESSAY: "서술형",
  FILL_BLANK: "빈칸",
  ORDERING: "순서",
  VOCAB: "단어",
};

const DIFFICULTY_LABELS: Record<string, string> = {
  BASIC: "기본",
  INTERMEDIATE: "중급",
  KILLER: "고난도",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ExamCreateWizard({ academyId, classes, schools }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState(1);

  // Step 1: Basic Info
  const [title, setTitle] = useState("");
  const [examType, setExamType] = useState("OFFLINE");
  const [classId, setClassId] = useState<string>("");
  const [schoolId, setSchoolId] = useState<string>("");
  const [grade, setGrade] = useState<string>("");
  const [semester, setSemester] = useState<string>("");
  const [examSubType, setExamSubType] = useState<string>("");
  const [examDate, setExamDate] = useState("");
  const [duration, setDuration] = useState<string>("");
  const [totalPoints, setTotalPoints] = useState("100");

  // Step 2: Questions
  const [questions, setQuestions] = useState<SelectedQuestion[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [bankQuestions, setBankQuestions] = useState<QuestionBankItem[]>([]);
  const [bankSearch, setBankSearch] = useState("");
  const [bankType, setBankType] = useState("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bankLoading, setBankLoading] = useState(false);

  // Step 3: Settings (Online only)
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [showResults, setShowResults] = useState(true);

  // ---------------------------------------------------------------------------
  // Step validation
  // ---------------------------------------------------------------------------
  function canProceed() {
    if (step === 1) return title.trim().length > 0;
    if (step === 2) return questions.length > 0;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Question Bank
  // ---------------------------------------------------------------------------
  async function loadQuestionBank() {
    setBankLoading(true);
    try {
      const result = await getQuestionBank(academyId, {
        type: bankType !== "ALL" ? bankType : undefined,
        search: bankSearch || undefined,
      });
      setBankQuestions(result as QuestionBankItem[]);
    } catch {
      toast.error("문제 불러오기 실패");
    }
    setBankLoading(false);
  }

  function toggleBankQuestion(q: QuestionBankItem) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(q.id)) {
        next.delete(q.id);
      } else {
        next.add(q.id);
      }
      return next;
    });
  }

  function addSelectedQuestions() {
    const existing = new Set(questions.map((q) => q.questionId));
    const toAdd = bankQuestions.filter(
      (q) => selectedIds.has(q.id) && !existing.has(q.id)
    );
    const newQuestions: SelectedQuestion[] = toAdd.map((q, i) => ({
      questionId: q.id,
      questionText: q.questionText,
      type: q.type,
      points: q.points,
      orderNum: questions.length + i + 1,
    }));
    setQuestions([...questions, ...newQuestions]);
    setShowPicker(false);
    setSelectedIds(new Set());
  }

  function removeQuestion(idx: number) {
    setQuestions((prev) =>
      prev.filter((_, i) => i !== idx).map((q, i) => ({ ...q, orderNum: i + 1 }))
    );
  }

  function moveQuestion(idx: number, direction: "up" | "down") {
    if (
      (direction === "up" && idx === 0) ||
      (direction === "down" && idx === questions.length - 1)
    )
      return;
    const arr = [...questions];
    const swap = direction === "up" ? idx - 1 : idx + 1;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    setQuestions(arr.map((q, i) => ({ ...q, orderNum: i + 1 })));
  }

  function updatePoints(idx: number, pts: number) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, points: pts } : q))
    );
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------
  function handleSave(publish: boolean) {
    startTransition(async () => {
      const result = await createExam(academyId, {
        title,
        type: examType,
        classId: classId || null,
        schoolId: schoolId || null,
        grade: grade ? parseInt(grade) : null,
        semester: semester || null,
        examType: examSubType || null,
        examDate: examDate || null,
        duration: duration ? parseInt(duration) : null,
        totalPoints: parseInt(totalPoints) || 100,
        shuffleQuestions,
        shuffleOptions,
        showResults,
        questions: questions.map((q) => ({
          questionId: q.questionId,
          points: q.points,
          orderNum: q.orderNum,
        })),
      });

      if (!result.success) {
        toast.error(result.error || "시험 생성에 실패했습니다.");
        return;
      }

      if (publish && result.id) {
        const pubResult = await publishExam(result.id);
        if (!pubResult.success) {
          toast.error("시험은 생성되었으나 배포에 실패했습니다.");
          router.push(`/director/exams/${result.id}`);
          return;
        }
        toast.success("시험이 배포되었습니다.");
      } else {
        toast.success("시험이 저장되었습니다.");
      }

      router.push("/director/exams");
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const runningTotal = questions.reduce((acc, q) => acc + q.points, 0);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="shrink-0"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-xl font-bold text-[#191F28]">시험 만들기</h1>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2" role="navigation" aria-label="시험 생성 단계">
        {STEPS.map((s, i) => (
          <div key={s.num} className="flex items-center gap-2">
            {i > 0 && <div className="w-8 h-px bg-[#E5E8EB]" />}
            <button
              onClick={() => step > s.num && setStep(s.num)}
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                step === s.num
                  ? "bg-[#3182F6] text-white"
                  : step > s.num
                    ? "bg-blue-50 text-[#3182F6] cursor-pointer"
                    : "bg-[#F7F8FA] text-[#8B95A1]"
              )}
              disabled={step < s.num}
              aria-current={step === s.num ? "step" : undefined}
            >
              {step > s.num ? (
                <Check className="size-4" />
              ) : (
                <span className="text-xs">{s.num}</span>
              )}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="rounded-xl border border-[#E5E8EB] bg-white p-6">
        {/* STEP 1: Basic Info */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-[#191F28]">기본 정보</h2>

            <div className="space-y-2">
              <Label htmlFor="title">시험명 *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 중2 1학기 중간고사 대비"
                className="border-[#E5E8EB]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>시험 유형 *</Label>
                <Select value={examType} onValueChange={setExamType}>
                  <SelectTrigger className="border-[#E5E8EB]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OFFLINE">오프라인</SelectItem>
                    <SelectItem value="ONLINE">온라인</SelectItem>
                    <SelectItem value="VOCAB">단어 시험</SelectItem>
                    <SelectItem value="MOCK">모의고사</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>반 (선택)</Label>
                <Select value={classId || "__none__"} onValueChange={(v) => setClassId(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="border-[#E5E8EB]">
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">전체</SelectItem>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>학교 (선택)</Label>
                <Select value={schoolId || "__none__"} onValueChange={(v) => setSchoolId(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="border-[#E5E8EB]">
                    <SelectValue placeholder="미지정" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">미지정</SelectItem>
                    {schools.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>학년</Label>
                <Select value={grade || "__none__"} onValueChange={(v) => setGrade(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="border-[#E5E8EB]">
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">선택</SelectItem>
                    {[1, 2, 3].map((g) => (
                      <SelectItem key={g} value={String(g)}>
                        {g}학년
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>학기</Label>
                <Select value={semester || "__none__"} onValueChange={(v) => setSemester(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="border-[#E5E8EB]">
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">선택</SelectItem>
                    <SelectItem value="FIRST">1학기</SelectItem>
                    <SelectItem value="SECOND">2학기</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>시험 종류</Label>
                <Select value={examSubType || "__none__"} onValueChange={(v) => setExamSubType(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="border-[#E5E8EB]">
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">선택</SelectItem>
                    <SelectItem value="MIDTERM">중간고사</SelectItem>
                    <SelectItem value="FINAL">기말고사</SelectItem>
                    <SelectItem value="QUIZ">쪽지시험</SelectItem>
                    <SelectItem value="MOCK">모의고사</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="examDate">시험일</Label>
                <Input
                  id="examDate"
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="border-[#E5E8EB]"
                />
              </div>
              {examType === "ONLINE" && (
                <div className="space-y-2">
                  <Label htmlFor="duration">시간 제한 (분)</Label>
                  <Input
                    id="duration"
                    type="number"
                    min={1}
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="60"
                    className="border-[#E5E8EB]"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="totalPoints">총점</Label>
                <Input
                  id="totalPoints"
                  type="number"
                  min={1}
                  value={totalPoints}
                  onChange={(e) => setTotalPoints(e.target.value)}
                  className="border-[#E5E8EB]"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Questions */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#191F28]">
                  문제 추가
                </h2>
                <p className="text-sm text-[#8B95A1] mt-1">
                  {questions.length}문제 / 배점 합계: {runningTotal}점
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowPicker(true);
                    loadQuestionBank();
                  }}
                  className="border-[#E5E8EB]"
                >
                  <Database className="size-4 mr-1.5" />
                  문제 은행에서 선택
                </Button>
              </div>
            </div>

            {/* Question list */}
            {questions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-[#8B95A1]">
                <FileEdit className="size-12 mb-3 opacity-40" />
                <p className="text-sm">아직 추가된 문제가 없습니다.</p>
                <p className="text-xs mt-1">
                  문제 은행에서 문제를 선택해 추가하세요.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {questions.map((q, idx) => (
                  <div
                    key={q.questionId}
                    className="flex items-center gap-3 rounded-lg border border-[#E5E8EB] p-3 bg-white hover:border-[#3182F6]/30 transition-colors"
                  >
                    <button
                      className="cursor-grab text-[#8B95A1] hover:text-[#4E5968]"
                      aria-label="순서 변경"
                      onClick={() => moveQuestion(idx, "up")}
                    >
                      <GripVertical className="size-4" />
                    </button>
                    <span className="flex size-7 items-center justify-center rounded-full bg-[#F7F8FA] text-xs font-bold text-[#4E5968]">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#191F28] truncate">
                        {q.questionText}
                      </p>
                      <p className="text-xs text-[#8B95A1]">
                        {TYPE_LABELS[q.type] || q.type}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        value={q.points}
                        onChange={(e) =>
                          updatePoints(idx, parseInt(e.target.value) || 1)
                        }
                        className="w-16 h-8 text-center text-sm border-[#E5E8EB]"
                        aria-label={`${idx + 1}번 문제 배점`}
                      />
                      <span className="text-xs text-[#8B95A1]">점</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => removeQuestion(idx)}
                        aria-label={`${idx + 1}번 문제 삭제`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Settings */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-[#191F28]">
              시험 설정
            </h2>

            {examType !== "ONLINE" ? (
              <div className="rounded-lg bg-[#F7F8FA] p-6 text-center text-[#8B95A1]">
                <p>온라인 시험 설정은 온라인 유형에서만 사용 가능합니다.</p>
                <p className="text-xs mt-1">
                  다음 단계로 진행하세요.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <label className="flex items-center gap-3 rounded-lg border border-[#E5E8EB] p-4 cursor-pointer hover:bg-[#F7F8FA]">
                  <Checkbox
                    checked={shuffleQuestions}
                    onCheckedChange={(v) =>
                      setShuffleQuestions(v as boolean)
                    }
                  />
                  <div>
                    <p className="text-sm font-medium text-[#191F28]">
                      문제 순서 섞기
                    </p>
                    <p className="text-xs text-[#8B95A1]">
                      학생마다 문제 순서가 랜덤으로 출제됩니다.
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 rounded-lg border border-[#E5E8EB] p-4 cursor-pointer hover:bg-[#F7F8FA]">
                  <Checkbox
                    checked={shuffleOptions}
                    onCheckedChange={(v) =>
                      setShuffleOptions(v as boolean)
                    }
                  />
                  <div>
                    <p className="text-sm font-medium text-[#191F28]">
                      선택지 순서 섞기
                    </p>
                    <p className="text-xs text-[#8B95A1]">
                      객관식 선택지 순서가 랜덤으로 표시됩니다.
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 rounded-lg border border-[#E5E8EB] p-4 cursor-pointer hover:bg-[#F7F8FA]">
                  <Checkbox
                    checked={showResults}
                    onCheckedChange={(v) =>
                      setShowResults(v as boolean)
                    }
                  />
                  <div>
                    <p className="text-sm font-medium text-[#191F28]">
                      결과 즉시 공개
                    </p>
                    <p className="text-xs text-[#8B95A1]">
                      제출 후 바로 점수와 정답을 확인할 수 있습니다.
                    </p>
                  </div>
                </label>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Preview */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-[#191F28]">
              미리보기 및 배포
            </h2>

            <div className="rounded-lg bg-[#F7F8FA] p-5 space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-[#8B95A1]">시험명:</span>{" "}
                  <span className="font-medium text-[#191F28]">{title}</span>
                </div>
                <div>
                  <span className="text-[#8B95A1]">유형:</span>{" "}
                  <span className="font-medium text-[#191F28]">
                    {examType === "OFFLINE"
                      ? "오프라인"
                      : examType === "ONLINE"
                        ? "온라인"
                        : examType === "VOCAB"
                          ? "단어"
                          : "모의"}
                  </span>
                </div>
                <div>
                  <span className="text-[#8B95A1]">문제 수:</span>{" "}
                  <span className="font-medium text-[#191F28]">
                    {questions.length}문제
                  </span>
                </div>
                <div>
                  <span className="text-[#8B95A1]">총점:</span>{" "}
                  <span className="font-medium text-[#191F28]">
                    {runningTotal}점 / {totalPoints}점
                  </span>
                </div>
                {examDate && (
                  <div>
                    <span className="text-[#8B95A1]">시험일:</span>{" "}
                    <span className="font-medium text-[#191F28]">
                      {examDate}
                    </span>
                  </div>
                )}
                {duration && (
                  <div>
                    <span className="text-[#8B95A1]">시간 제한:</span>{" "}
                    <span className="font-medium text-[#191F28]">
                      {duration}분
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Question Preview */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[#4E5968]">
                문제 목록
              </h3>
              {questions.map((q, idx) => (
                <div
                  key={q.questionId}
                  className="flex items-center gap-3 rounded-lg border border-[#E5E8EB] p-3"
                >
                  <span className="flex size-7 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-[#3182F6]">
                    {idx + 1}
                  </span>
                  <p className="flex-1 text-sm text-[#191F28] truncate">
                    {q.questionText}
                  </p>
                  <span className="text-xs text-[#8B95A1]">
                    {q.points}점
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
          className="border-[#E5E8EB]"
        >
          <ArrowLeft className="size-4 mr-1.5" />
          이전
        </Button>

        <div className="flex gap-2">
          {step === 4 ? (
            <>
              <Button
                variant="outline"
                onClick={() => handleSave(false)}
                disabled={isPending}
                className="border-[#E5E8EB]"
              >
                <Save className="size-4 mr-1.5" />
                {isPending ? "저장 중..." : "저장 (초안)"}
              </Button>
              <Button
                onClick={() => handleSave(true)}
                disabled={isPending}
                className="bg-[#3182F6] hover:bg-[#1B64DA]"
              >
                <Send className="size-4 mr-1.5" />
                {isPending ? "배포 중..." : "배포하기"}
              </Button>
            </>
          ) : (
            <Button
              onClick={() => setStep((s) => Math.min(4, s + 1))}
              disabled={!canProceed()}
              className="bg-[#3182F6] hover:bg-[#1B64DA]"
            >
              다음
              <ArrowRight className="size-4 ml-1.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Question Bank Picker Dialog */}
      <Dialog open={showPicker} onOpenChange={setShowPicker}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>문제 은행에서 선택</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#8B95A1]" />
              <Input
                placeholder="문제 검색..."
                value={bankSearch}
                onChange={(e) => setBankSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadQuestionBank()}
                className="pl-9 border-[#E5E8EB]"
              />
            </div>
            <Select value={bankType} onValueChange={setBankType}>
              <SelectTrigger className="w-[120px] border-[#E5E8EB]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">전체</SelectItem>
                <SelectItem value="MULTIPLE_CHOICE">객관식</SelectItem>
                <SelectItem value="SHORT_ANSWER">단답형</SelectItem>
                <SelectItem value="ESSAY">서술형</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={loadQuestionBank}
              className="border-[#E5E8EB]"
            >
              검색
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            {bankLoading ? (
              <div className="flex items-center justify-center py-12 text-[#8B95A1]">
                불러오는 중...
              </div>
            ) : bankQuestions.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-[#8B95A1]">
                문제가 없습니다.
              </div>
            ) : (
              bankQuestions.map((q) => (
                <label
                  key={q.id}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                    selectedIds.has(q.id)
                      ? "border-[#3182F6] bg-blue-50/50"
                      : "border-[#E5E8EB] hover:bg-[#F7F8FA]"
                  )}
                >
                  <Checkbox
                    checked={selectedIds.has(q.id)}
                    onCheckedChange={() => toggleBankQuestion(q)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#191F28] line-clamp-2">
                      {q.questionText}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-[#8B95A1]">
                        {TYPE_LABELS[q.type] || q.type}
                      </span>
                      <span className="text-xs text-[#8B95A1]">
                        {DIFFICULTY_LABELS[q.difficulty] || q.difficulty}
                      </span>
                      <span className="text-xs text-[#8B95A1]">
                        {q.points}점
                      </span>
                    </div>
                  </div>
                </label>
              ))
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[#E5E8EB]">
            <span className="text-sm text-[#8B95A1]">
              {selectedIds.size}개 선택됨
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowPicker(false)}
                className="border-[#E5E8EB]"
              >
                취소
              </Button>
              <Button
                onClick={addSelectedQuestions}
                disabled={selectedIds.size === 0}
                className="bg-[#3182F6] hover:bg-[#1B64DA]"
              >
                <Plus className="size-4 mr-1.5" />
                추가하기
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
