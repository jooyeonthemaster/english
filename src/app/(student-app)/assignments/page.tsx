"use client";

import { useEffect, useState } from "react";
import { StudentAssignmentList } from "@/components/assignments/student-assignment-list";
import { getStudentAssignments } from "@/actions/assignments";

export default function StudentAssignmentsPage() {
  const [assignments, setAssignments] = useState<never[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState<string | null>(null);

  useEffect(() => {
    const id = localStorage.getItem("studentId");
    setStudentId(id);
    if (id) {
      getStudentAssignments(id).then((data) => {
        setAssignments(data as never[]);
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

  return (
    <StudentAssignmentList assignments={assignments} studentId={studentId} />
  );
}
