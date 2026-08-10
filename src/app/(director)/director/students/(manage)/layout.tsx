import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getSchools } from "@/actions/students";
import { getClasses } from "@/actions/classes";
import { PageShell } from "@/components/layout/page-frame";
import { StudentsManageShell } from "@/components/students/manage/students-manage-shell";

// ============================================================================
// students/(manage) 공통 layout — 학생 관리 IA 통합의 본체 (v3 design §D4-1, C-2)
//
// (manage) 라우트 그룹은 URL 에 나타나지 않는다 — /director/students ·
// /students/assignments · /students/classes · /students/grammar 4경로가
// 이 layout(PageShell + StudentsManageShell 헤더·뷰 스위처)을 공유한다.
// 학생 허브([studentId])는 그룹 밖 — 스위처 없이 기존 그대로.
//
// schools·classes 는 셸 리프트 다이얼로그(학생 등록 StudentFormDialog)용 —
// 반·과제 뷰 진입 시에도 layout 은 유지 렌더되므로 뷰 전환에 재적재가 없다.
// ============================================================================

export default async function StudentsManageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const [schools, classes] = await Promise.all([
    getSchools(staff.academyId),
    getClasses(staff.academyId),
  ]);

  return (
    <PageShell>
      <StudentsManageShell
        academyId={staff.academyId}
        schools={schools}
        classes={classes}
      >
        {children}
      </StudentsManageShell>
    </PageShell>
  );
}
