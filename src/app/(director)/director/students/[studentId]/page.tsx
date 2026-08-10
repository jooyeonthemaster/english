import { redirect, notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getStudent, getStudentStats } from "@/actions/students";
import { listStudentExamReports } from "@/actions/students/exam-reports";
import { listStudentStudyTasks } from "@/actions/study-assignments";
import { getGrammarLabStudentDetail } from "@/actions/grammar-drill-admin";
import { StudentHubClient } from "@/components/students/hub/student-hub-client";
import { aggregateStudentExamHistory } from "@/lib/exam-scoring/trend";
import { summarize } from "@/lib/exam-scoring/summarize";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

interface PageProps {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ tab?: string }>;
}

/**
 * 학생 상세 허브 — 학생의 모든 데이터(개요·응시·어법·과제·리포트·출결·수납·
 * 상담·학부모)를 한 화면으로 통합한 후계 페이지. 응시 이력·수납은 탭 진입 시
 * 클라이언트 지연 로드, 나머지는 여기서 병렬 프리로드한다.
 */
export default async function StudentDetailPage({ params, searchParams }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const { studentId } = await params;
  const { tab } = await searchParams;

  const [student, stats, grammarDetail, tasksRes, reportsRes, examSittings] =
    await Promise.all([
      getStudent(studentId),
      getStudentStats(studentId),
      FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL
        ? getGrammarLabStudentDetail(studentId)
        : Promise.resolve(null),
      listStudentStudyTasks(studentId),
      listStudentExamReports(studentId),
      // M-10 — 헤더 「평균 점수율」 퀵스탯을 시험 탭과 동일 모집단으로:
      // INTERNAL+EXTERNAL 통합 시계열(trend.ts 정본) → summarize(lib 정본) 1콜
      aggregateStudentExamHistory(studentId, staff.academyId),
    ]);

  if (!student) notFound();

  const header = {
    id: student.id,
    name: student.name,
    status: student.status,
    studentCode: student.studentCode,
    grade: student.grade,
    phone: student.phone ?? null,
    schoolName: student.school?.name ?? null,
    // 현재 재원 반만 헤더에 노출 — 대기(WAITLISTED)·퇴원(DROPPED) 반 제외
    classes: student.classEnrollments
      .filter((e) => e.status === "ENROLLED")
      .map((e) => ({
        id: e.class.id,
        name: e.class.name,
      })),
  };

  const overview = {
    id: student.id,
    studentCode: student.studentCode,
    enrollDate: student.enrollDate?.toISOString() ?? null,
    birthDate: student.birthDate?.toISOString() ?? null,
    gender: student.gender ?? null,
    phone: student.phone ?? null,
    memo: student.memo ?? null,
    // 특이사항 저장(updateStudent) 시 schoolId||null 클로버 방지용 원본 보존값
    schoolId: student.schoolId ?? null,
  };

  // 헤더 「평균 점수율」 퀵스탯 — 시험 탭과 동일 모집단·동일 요약기(M-10).
  // 구 stats.averageScore(examSubmissions, SHOW_USER_RESULTS 게이트) 축 폐기.
  const examSummary = summarize(examSittings);

  const hubStats = {
    attendanceRate: stats.attendanceRate ?? 0,
    streak: stats.streak ?? 0,
    recentAttendances: (stats.recentAttendances ?? []).map(
      (a: { id: string; date: Date; status: string }) => ({
        id: a.id,
        date: a.date.toISOString(),
        status: a.status,
      }),
    ),
    examAvgScorePct: examSummary.avgScorePct,
    examSittings: examSummary.totalSittings,
  };

  return (
    <StudentHubClient
      header={header}
      overview={overview}
      stats={hubStats}
      grammar={grammarDetail}
      tasks={tasksRes.success ? (tasksRes.data ?? []) : []}
      reports={reportsRes.success ? (reportsRes.data ?? []) : []}
      legacyStats={stats}
      legacyStudent={student}
      flags={{
        examHistory: FEATURE_FLAGS.ENABLE_EXAM_DEPLOYMENT,
        grammar: FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL,
      }}
      isDirector
      initialTab={tab ?? null}
    />
  );
}
