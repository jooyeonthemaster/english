import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getStudents, getSchools } from "@/actions/students";
import { StudentListClient } from "@/components/students/student-list-client";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    status?: string;
    schoolId?: string;
    grade?: string;
    search?: string;
  }>;
}

export default async function StudentsPage({ searchParams }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const params = await searchParams;
  const page = params.page ? parseInt(params.page) : 1;
  const filters = {
    page,
    status: params.status || "ALL",
    schoolId: params.schoolId || undefined,
    grade: params.grade ? parseInt(params.grade) : undefined,
    search: params.search || undefined,
  };

  const [studentsData, schools] = await Promise.all([
    getStudents(staff.academyId, filters),
    getSchools(staff.academyId),
  ]);

  return (
    <StudentListClient
      studentsData={studentsData}
      schools={schools}
      filters={filters}
      isDirector
    />
  );
}
