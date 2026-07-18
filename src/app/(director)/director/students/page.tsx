import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getStudents, getSchools, getTutorHubStats } from "@/actions/students";
import { getClasses } from "@/actions/classes";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { StudentsRosterClient } from "@/components/students/list/students-roster-client";

// 26-07-11 학원 플랫폼 대개편(설계 §5): /director/students 를 정본 로스터
// 허브로 재구축. 구 StudentListClient(토스 스킨)를 폐기하고 tutor 허브의
// 데이터 계약(getStudents/getSchools/getClasses/getTutorHubStats)을 그대로
// 이어받아 신식 디자인 언어(PageShell + SectionCard, slate/blue)로 렌더한다.
// /director/tutor 는 이 경로로 리다이렉트된다(별도 유닛).

interface PageProps {
  searchParams: Promise<{
    page?: string;
    status?: string;
    schoolId?: string;
    classId?: string;
    grade?: string;
    search?: string;
    billing?: string;
    sort?: string;
    dir?: string;
  }>;
}

export default async function DirectorStudentsPage({ searchParams }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const params = await searchParams;
  // 정렬 키 화이트리스트 — 그 외 값은 기본(recent, 최근 등록순)으로.
  // 서버 정렬 가능한 키만 받는다(buildStudentsOrderBy 주석 참조).
  const SORT_KEYS = ["name", "grade", "school", "status", "contact"] as const;
  const sortParam = params.sort;
  const sort = (SORT_KEYS as readonly string[]).includes(sortParam ?? "")
    ? (sortParam as (typeof SORT_KEYS)[number])
    : undefined;
  const dir: "asc" | "desc" = params.dir === "desc" ? "desc" : "asc";
  const filters = {
    page: params.page ? parseInt(params.page) : 1,
    status: params.status || "ALL",
    schoolId: params.schoolId || undefined,
    classId: params.classId || undefined,
    grade: params.grade ? parseInt(params.grade) : undefined,
    search: params.search || undefined,
    billing: params.billing || undefined,
    sort,
    dir,
  };

  // 각 액션은 내부에서 세션 academyId 와 교차검증하므로 여기서 넘기는
  // academyId 는 세션값 그대로(위조 불가 경로).
  const [studentsData, schools, classes, stats] = await Promise.all([
    getStudents(staff.academyId, filters),
    getSchools(staff.academyId),
    getClasses(staff.academyId),
    getTutorHubStats(staff.academyId),
  ]);

  return (
    <StudentsRosterClient
      academyId={staff.academyId}
      studentsData={studentsData}
      schools={schools}
      classes={classes}
      stats={stats}
      filters={filters}
      sort={sort ?? "recent"}
      dir={dir}
      isDirector={staff.role === "DIRECTOR"}
      showBilling={FEATURE_FLAGS.SHOW_TUTOR_BILLING}
    />
  );
}
