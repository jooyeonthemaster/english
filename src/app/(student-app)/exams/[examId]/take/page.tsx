"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { startExam } from "@/actions/exam-taking";
import { ExamTakingClient } from "@/components/exams/exam-taking-client";

export default function ExamTakePage() {
  const params = useParams();
  const router = useRouter();
  const examId = params.examId as string;
  const [examData, setExamData] = useState<never | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const studentId = localStorage.getItem("studentId");
    if (!studentId) {
      setError("로그인이 필요합니다.");
      setLoading(false);
      return;
    }

    startExam(examId, studentId).then((result) => {
      if (result.success) {
        setExamData(result.data as never);
      } else {
        setError(result.error || "시험을 시작할 수 없습니다.");
      }
      setLoading(false);
    });
  }, [examId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-[#8B95A1] text-sm">
        시험을 준비하고 있습니다...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-[#8B95A1] gap-4">
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

  if (!examData) return null;

  return <ExamTakingClient examData={examData} />;
}
