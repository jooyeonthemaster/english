import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { listStudyAssignments } from "@/actions/study-assignments";
import { AssignmentsBoardClient } from "@/components/study-assignments/assignments-board-client";

// ============================================================================
// 과제 달력 — /director/students/assignments (설계 §5 · v3 §D4-1)
//
// 배포한 시험지·학습지·문제 세트·어법 훈련 과제를 목록+월 캘린더+상세로
// 한눈에 관리하는 허브. 초기 데이터는 서버에서 두 갈래로 적재한다:
//  - 전체 최근 과제(목록 패널) = listStudyAssignments({})
//  - 이번 달(서울 달력월) 과제(캘린더) = listStudyAssignments({ month })
// ?open={assignmentId} 딥링크(학생 상세 과제 탭 발신)는 클라이언트 보드가
// 상세 모달 자동 오픈으로 소비한다. ?student={studentId} 딥링크(학생별 필터,
// 유저 확정)는 초기 적재부터 서버 필터를 적용해 깜빡임 없이 착지시킨다.
//
// v3 C-2: students/(manage) 라우트 그룹으로 이동(URL 불변 — 딥링크 2종 무접촉).
// PageShell·헤더·뷰 스위처는 (manage)/layout.tsx 셸이 담당하므로 embedded 렌더.
// ============================================================================

/** 서울(UTC+9) 기준 현재 달 — "YYYY-MM" */
function seoulMonthNow(): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

interface PageProps {
  searchParams: Promise<{ open?: string; student?: string }>;
}

export default async function AssignmentsPage({ searchParams }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const params = await searchParams;
  const month = seoulMonthNow();
  // ?student= 딥링크 — 목록·캘린더 두 갈래 모두 같은 필터 객체를 스프레드
  const studentFilter = params.student ? { studentId: params.student } : {};

  const [allRes, monthRes] = await Promise.all([
    listStudyAssignments({ ...studentFilter }),
    listStudyAssignments({ ...studentFilter, month }),
  ]);

  return (
    <AssignmentsBoardClient
      initialMonth={month}
      initialMonthRows={monthRes.success ? (monthRes.data ?? []) : []}
      initialRows={allRes.success ? (allRes.data ?? []) : []}
      openAssignmentId={params.open ?? null}
      initialStudentId={params.student ?? null}
      embedded
    />
  );
}
