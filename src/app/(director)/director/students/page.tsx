import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getClass, getClasses } from "@/actions/classes";
import { getStudents, getSchools } from "@/actions/students";
import { StudentClassManagementClient } from "./student-class-management-client";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    status?: string;
    schoolId?: string;
    classId?: string;
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
    classId: params.classId || undefined,
    grade: params.grade ? parseInt(params.grade) : undefined,
    search: params.search || undefined,
  };

  const [studentsData, schools, classes, selectedClassData] = await Promise.all([
    getStudents(staff.academyId, filters),
    getSchools(staff.academyId),
    getClasses(staff.academyId),
    params.classId ? getClass(params.classId) : Promise.resolve(null),
  ]);

  return (
    <StudentClassManagementClient
      academyId={staff.academyId}
      studentsData={studentsData}
      schools={schools}
      filters={filters}
      classes={classes}
      selectedClassData={selectedClassData}
    />
  );
}
