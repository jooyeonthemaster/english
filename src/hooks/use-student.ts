"use client";
import { useState, useEffect } from "react";

interface StudentSession {
  studentId: string;
  name: string;
  schoolSlug: string;
  grade: number;
}

export function useStudent() {
  const [student, setStudent] = useState<StudentSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/student/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setStudent(data))
      .catch(() => setStudent(null))
      .finally(() => setLoading(false));
  }, []);

  return { student, loading, isLoggedIn: !!student };
}
