import { redirect, notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getStudent, getStudentStats } from "@/actions/students";
import { StudentDetailClient } from "@/components/students/student-detail-client";

interface PageProps {
  params: Promise<{ studentId: string }>;
}

export default async function StudentDetailPage({ params }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const { studentId } = await params;

  const [student, stats] = await Promise.all([
    getStudent(studentId),
    getStudentStats(studentId),
  ]);

  if (!student) notFound();

  return (
    <StudentDetailClient
      student={student}
      stats={stats}
      isDirector
    />
  );
}
