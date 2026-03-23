import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getWorkbenchPassages, getAcademySchools } from "@/actions/workbench";
import { PassageListClient } from "@/components/workbench/passage-list-client";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    schoolId?: string;
    grade?: string;
    semester?: string;
    publisher?: string;
    search?: string;
  }>;
}

export default async function PassagesPage({ searchParams }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const params = await searchParams;
  const filters = {
    page: params.page ? parseInt(params.page) : 1,
    schoolId: params.schoolId || undefined,
    grade: params.grade ? parseInt(params.grade) : undefined,
    semester: params.semester || undefined,
    publisher: params.publisher || undefined,
    search: params.search || undefined,
  };

  const [passagesData, schools] = await Promise.all([
    getWorkbenchPassages(staff.academyId, filters),
    getAcademySchools(staff.academyId),
  ]);

  return (
    <PassageListClient
      passagesData={passagesData}
      schools={schools}
      filters={filters}
    />
  );
}
