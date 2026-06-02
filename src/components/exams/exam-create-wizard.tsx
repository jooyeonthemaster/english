"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Save, Send } from "lucide-react";
import { createExam, publishExam } from "@/actions/exams";
import { getQuestionBank } from "@/actions/exam-questions";
import { Button } from "@/components/ui/button";
import { repairGrammarCorrectionQuestionText } from "@/lib/grammar-correction-display";
import type {
  ClassOption,
  QuestionBankItem,
  SchoolOption,
  SelectedQuestion,
} from "./exam-create-wizard-parts/types";
import { QuestionBankDialog } from "./exam-create-wizard-parts/question-bank-dialog";
import { StepBasicInfo } from "./exam-create-wizard-parts/step-basic-info";
import { StepIndicator } from "./exam-create-wizard-parts/step-indicator";
import { StepPreview } from "./exam-create-wizard-parts/step-preview";
import { StepQuestions } from "./exam-create-wizard-parts/step-questions";
import { StepSettings } from "./exam-create-wizard-parts/step-settings";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface Props {
  academyId: string;
  classes: ClassOption[];
  schools: SchoolOption[];
}

// ---------------------------------------------------------------------------
// 시험 생성 마법사 — 단계별 입력을 orchestrate 하는 진입점.
// 각 단계 UI 는 ./exam-create-wizard-parts/* 로 분리되어 있다.
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
      (q) => selectedIds.has(q.id) && !existing.has(q.id),
    );
    const newQuestions: SelectedQuestion[] = toAdd.map((q, i) => ({
      questionId: q.id,
      questionText: repairGrammarCorrectionQuestionText({
        subType: q.subType,
        questionText: q.questionText,
        structuredData: q.structuredData,
      }),
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
      prev.filter((_, i) => i !== idx).map((q, i) => ({ ...q, orderNum: i + 1 })),
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
      prev.map((q, i) => (i === idx ? { ...q, points: pts } : q)),
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

      <StepIndicator step={step} setStep={setStep} />

      {/* Step Content */}
      <div className="rounded-xl border border-[#E5E8EB] bg-white p-6">
        {step === 1 && (
          <StepBasicInfo
            title={title}
            setTitle={setTitle}
            examType={examType}
            setExamType={setExamType}
            classId={classId}
            setClassId={setClassId}
            schoolId={schoolId}
            setSchoolId={setSchoolId}
            grade={grade}
            setGrade={setGrade}
            semester={semester}
            setSemester={setSemester}
            examSubType={examSubType}
            setExamSubType={setExamSubType}
            examDate={examDate}
            setExamDate={setExamDate}
            duration={duration}
            setDuration={setDuration}
            totalPoints={totalPoints}
            setTotalPoints={setTotalPoints}
            classes={classes}
            schools={schools}
          />
        )}

        {step === 2 && (
          <StepQuestions
            questions={questions}
            runningTotal={runningTotal}
            onOpenPicker={() => {
              setShowPicker(true);
              loadQuestionBank();
            }}
            onMove={moveQuestion}
            onUpdatePoints={updatePoints}
            onRemove={removeQuestion}
          />
        )}

        {step === 3 && (
          <StepSettings
            examType={examType}
            shuffleQuestions={shuffleQuestions}
            setShuffleQuestions={setShuffleQuestions}
            shuffleOptions={shuffleOptions}
            setShuffleOptions={setShuffleOptions}
            showResults={showResults}
            setShowResults={setShowResults}
          />
        )}

        {step === 4 && (
          <StepPreview
            title={title}
            examType={examType}
            examDate={examDate}
            duration={duration}
            totalPoints={totalPoints}
            questions={questions}
            runningTotal={runningTotal}
          />
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

      <QuestionBankDialog
        open={showPicker}
        onOpenChange={setShowPicker}
        bankSearch={bankSearch}
        setBankSearch={setBankSearch}
        bankType={bankType}
        setBankType={setBankType}
        bankLoading={bankLoading}
        bankQuestions={bankQuestions}
        selectedIds={selectedIds}
        onSearch={loadQuestionBank}
        onToggle={toggleBankQuestion}
        onAddSelected={addSelectedQuestions}
      />
    </div>
  );
}
