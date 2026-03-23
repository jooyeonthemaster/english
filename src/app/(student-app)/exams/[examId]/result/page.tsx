"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getExamResult } from "@/actions/exam-taking";
import { ExamResultClient } from "@/components/exams/exam-result-client";

export default function ExamResultPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params.examId as string;
  const [result, setResult] = useState<never | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // We need the submission ID. For now, we search by examId + studentId.
    // The getExamResult action takes a submissionId, so we need to find it first.
    // Alternative approach: look up submission by examining student context.
    const studentId = localStorage.getItem("studentId");
    if (!studentId) {
      setError("로그인이 필요합니다.");
      setLoading(false);
      return;
    }

    // We'll use a helper to find submission by exam+student
    findAndLoadResult(examId, studentId);
  }, [examId]);

  async function findAndLoadResult(examId: string, studentId: string) {
    try {
      // Import the prisma lookup via a server action approach:
      // Since we can't directly query here, we pass the submissionId from URL or
      // search by student. For simplicity, we try to get all exam results.
      const { getAvailableExams } = await import("@/actions/exam-taking");
      const exams = await getAvailableExams(studentId);
      const exam = exams.find((e) => e.id === examId);

      if (!exam?.submission?.id) {
        setError("시험 결과를 찾을 수 없습니다.");
        setLoading(false);
        return;
      }

      const data = await getExamResult(exam.submission.id);
      if (!data) {
        setError("결과를 불러올 수 없습니다.");
      } else {
        setResult(data as never);
      }
    } catch {
      setError("결과를 불러오는 중 오류가 발생했습니다.");
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[#8B95A1] text-sm">
        결과를 불러오는 중...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[#8B95A1] gap-4">
        <p className="text-sm">{error}</p>
        <button
          onClick={() => router.push("/exams")}
          className="text-sm text-[#3182F6] font-medium hover:underline"
        >
          시험 목록으로 돌아가기
        </button>
      </div>
    );
  }

  if (!result) return null;

  return <ExamResultClient result={result} />;
}
