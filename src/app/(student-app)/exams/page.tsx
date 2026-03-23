"use client";

import { useEffect, useState } from "react";
import { StudentExamList } from "@/components/exams/student-exam-list";
import { getAvailableExams } from "@/actions/exam-taking";

// Note: In production, studentId would come from session/auth context.
// For now we read from localStorage (set during student login).
export default function StudentExamsPage() {
  const [exams, setExams] = useState<never[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState<string | null>(null);

  useEffect(() => {
    const id = localStorage.getItem("studentId");
    setStudentId(id);
    if (id) {
      getAvailableExams(id).then((data) => {
        setExams(data as never[]);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[#8B95A1] text-sm">
        불러오는 중...
      </div>
    );
  }

  if (!studentId) {
    return (
      <div className="flex items-center justify-center h-64 text-[#8B95A1] text-sm">
        로그인이 필요합니다.
      </div>
    );
  }

  return <StudentExamList exams={exams} studentId={studentId} />;
}
