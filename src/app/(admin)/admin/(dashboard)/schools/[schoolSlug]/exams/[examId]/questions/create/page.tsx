"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createQuestion } from "@/actions/exams";
import { ChevronRight, ArrowLeft } from "lucide-react";
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

const DIFFICULTIES = [
  { value: "EASY", label: "쉬움" },
  { value: "MEDIUM", label: "보통" },
  { value: "HARD", label: "어려움" },
] as const;

interface PassageOption {
  id: string;
  title: string;
}

export default function CreateQuestionPage() {
  const router = useRouter();
  const params = useParams();
  const schoolSlug = params.schoolSlug as string;
  const examId = params.examId as string;

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [passages, setPassages] = useState<PassageOption[]>([]);

  const [questionNumber, setQuestionNumber] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [points, setPoints] = useState("1");
  const [passageId, setPassageId] = useState("");

  // Explanation fields
  const [expContent, setExpContent] = useState("");
  const [expKeyPoints, setExpKeyPoints] = useState("");
  const [expDifficulty, setExpDifficulty] = useState("");

  // Load available passages for the school
  useEffect(() => {
    async function loadPassages() {
      try {
        const res = await fetch(`/api/schools/${schoolSlug}`);
        if (!res.ok) return;
        const school = await res.json();

        // Load passages via a simple approach - we can use the API
        const passagesRes = await fetch(
          `/api/schools/${schoolSlug}/passages`
        ).catch(() => null);

        if (passagesRes?.ok) {
          const data = await passagesRes.json();
          setPassages(data);
        }
      } catch {
        // Silently fail - passages dropdown will just be empty
      }
    }
    loadPassages();
  }, [schoolSlug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!questionNumber || isNaN(parseInt(questionNumber))) {
      setError("문항 번호를 입력해주세요.");
      return;
    }
    if (!questionText.trim()) {
      setError("문항 내용을 입력해주세요.");
      return;
    }
    if (!correctAnswer.trim()) {
      setError("정답을 입력해주세요.");
      return;
    }

    startTransition(async () => {
      const explanation =
        expContent.trim()
          ? {
              content: expContent.trim(),
              keyPoints: expKeyPoints.trim()
                ? JSON.stringify(
                    expKeyPoints.split(",").map((s) => s.trim())
                  )
                : "[]",
              difficulty: expDifficulty || undefined,
            }
          : undefined;

      const result = await createQuestion(examId, {
        questionNumber: parseInt(questionNumber),
        questionText: questionText.trim(),
        correctAnswer: correctAnswer.trim(),
        points: parseInt(points) || 1,
        passageId: passageId || undefined,
        explanation,
      });

      if (result.success) {
        router.push(
          `/admin/schools/${schoolSlug}/exams/${examId}/questions`
        );
      } else {
        setError(result.error || "문항 등록에 실패했습니다.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[13px] text-[#8B95A1]">
        <Link
          href="/admin/schools"
          className="transition-colors hover:text-[#3182F6]"
        >
          학교 관리
        </Link>
        <ChevronRight className="size-3.5" />
        <Link
          href={`/admin/schools/${schoolSlug}`}
          className="transition-colors hover:text-[#3182F6]"
        >
          학교
        </Link>
        <ChevronRight className="size-3.5" />
        <Link
          href={`/admin/schools/${schoolSlug}/exams`}
          className="transition-colors hover:text-[#3182F6]"
        >
          시험 관리
        </Link>
        <ChevronRight className="size-3.5" />
        <Link
          href={`/admin/schools/${schoolSlug}/exams/${examId}/questions`}
          className="transition-colors hover:text-[#3182F6]"
        >
          문항 관리
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-[#191F28]">문항 추가</span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/admin/schools/${schoolSlug}/exams/${examId}/questions`}
        >
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-[#8B95A1] hover:text-[#191F28]"
          >
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <h1 className="text-[24px] font-bold text-[#191F28]">문항 추가</h1>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {error && (
          <div className="rounded-lg border border-[#FEE2E2] bg-[#FFF5F5] px-4 py-3 text-[14px] text-[#F04452]">
            {error}
          </div>
        )}

        {/* Question info */}
        <div className="rounded-xl border border-[#F2F4F6] bg-white p-6">
          <h2 className="mb-4 text-[16px] font-semibold text-[#191F28]">
            문항 정보
          </h2>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-[13px] font-medium text-[#4E5968]">
                  문항 번호 <span className="text-[#F04452]">*</span>
                </Label>
                <Input
                  type="number"
                  value={questionNumber}
                  onChange={(e) => setQuestionNumber(e.target.value)}
                  placeholder="1"
                  min={1}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-[13px] font-medium text-[#4E5968]">
                  정답 <span className="text-[#F04452]">*</span>
                </Label>
                <Input
                  value={correctAnswer}
                  onChange={(e) => setCorrectAnswer(e.target.value)}
                  placeholder="정답"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-[13px] font-medium text-[#4E5968]">
                  배점
                </Label>
                <Input
                  type="number"
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                  placeholder="1"
                  min={1}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label className="text-[13px] font-medium text-[#4E5968]">
                문항 내용 <span className="text-[#F04452]">*</span>
              </Label>
              <Textarea
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                placeholder="문항 내용을 입력하세요..."
                className="mt-1.5 min-h-[120px]"
              />
            </div>

            {passages.length > 0 && (
              <div>
                <Label className="text-[13px] font-medium text-[#4E5968]">
                  관련 지문 (선택)
                </Label>
                <Select value={passageId} onValueChange={setPassageId}>
                  <SelectTrigger className="mt-1.5 w-full">
                    <SelectValue placeholder="지문 선택 (선택사항)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">선택 없음</SelectItem>
                    {passages.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {/* Explanation */}
        <div className="rounded-xl border border-[#F2F4F6] bg-white p-6">
          <h2 className="mb-4 text-[16px] font-semibold text-[#191F28]">
            해설 (선택)
          </h2>
          <div className="flex flex-col gap-4">
            <div>
              <Label className="text-[13px] font-medium text-[#4E5968]">
                해설 내용
              </Label>
              <Textarea
                value={expContent}
                onChange={(e) => setExpContent(e.target.value)}
                placeholder="해설 내용 (HTML 사용 가능)..."
                className="mt-1.5 min-h-[120px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[13px] font-medium text-[#4E5968]">
                  핵심 포인트 (쉼표 구분)
                </Label>
                <Input
                  value={expKeyPoints}
                  onChange={(e) => setExpKeyPoints(e.target.value)}
                  placeholder="포인트1, 포인트2, 포인트3"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-[13px] font-medium text-[#4E5968]">
                  난이도
                </Label>
                <Select
                  value={expDifficulty}
                  onValueChange={setExpDifficulty}
                >
                  <SelectTrigger className="mt-1.5 w-full">
                    <SelectValue placeholder="난이도 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Link
            href={`/admin/schools/${schoolSlug}/exams/${examId}/questions`}
          >
            <Button type="button" variant="outline">
              취소
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={isPending}
            className="bg-[#3182F6] text-white hover:bg-[#1B64DA]"
          >
            {isPending ? "등록 중..." : "문항 등록"}
          </Button>
        </div>
      </form>
    </div>
  );
}
