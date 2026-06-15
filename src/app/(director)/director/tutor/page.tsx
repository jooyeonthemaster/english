import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getStudents, getSchools, getTutorHubStats } from "@/actions/students";
import { getClasses } from "@/actions/classes";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { TutorOperationsHubClient } from "./_components/tutor-operations-hub-client";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    status?: string;
    schoolId?: string;
    classId?: string;
    grade?: string;
    search?: string;
    billing?: string;
  }>;
}

export default async function DirectorTutorPage({ searchParams }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const params = await searchParams;
  const filters = {
    page: params.page ? parseInt(params.page) : 1,
    status: params.status || "ALL",
    schoolId: params.schoolId || undefined,
    classId: params.classId || undefined,
    grade: params.grade ? parseInt(params.grade) : undefined,
    search: params.search || undefined,
    billing: params.billing || undefined,
  };

  const [studentsData, schools, classes, stats] = await Promise.all([
    getStudents(staff.academyId, filters),
    getSchools(staff.academyId),
    getClasses(staff.academyId),
    getTutorHubStats(staff.academyId),
  ]);

  return (
    <TutorOperationsHubClient
      academyId={staff.academyId}
      studentsData={studentsData}
      classes={classes}
      schools={schools}
      stats={stats}
      filters={filters}
      isDirector={staff.role === "DIRECTOR"}
      showBilling={FEATURE_FLAGS.SHOW_TUTOR_BILLING}
    />
  );
}
