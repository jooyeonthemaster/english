import { notFound } from "next/navigation";
import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatTutorStatus } from "@/lib/tutor/ui-copy";

const modeLabels: Record<string, string> = {
  interpret: "해석",
  memorize: "암기",
  order: "순서",
  vocab: "어휘",
  grammar: "어법",
  transfer: "전이",
  mastery: "마스터리",
};

export default async function TutorProgramMonitorPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const staff = await requireStaffAuth("DIRECTOR");
  const { programId } = await params;
  const program = await prisma.tutorProgram.findFirst({
    where: { id: programId, academyId: staff.academyId },
    include: {
      lessons: {
        orderBy: { orderNum: "asc" },
        include: {
          lesson: {
            include: {
              passage: true,
              activities: {
                where: { status: { in: ["APPROVED", "PUBLISHED"] } },
                orderBy: { orderNum: "asc" },
              },
            },
          },
        },
      },
      assignments: {
        include: {
          recipients: { include: { student: { include: { school: true } } } },
          progress: true,
          attempts: {
            include: {
              items: {
                include: {
                  activity: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!program) notFound();

  const allActivities = program.lessons.flatMap((link) => link.lesson.activities);
  const totalActivities = allActivities.length;
  const recipients = program.assignments.flatMap((assignment) =>
    assignment.recipients.map((recipient) => ({
      ...recipient,
      assignmentId: assignment.id,
      assignmentTitle: assignment.titleSnapshot,
    })),
  );
  const progress = program.assignments.flatMap((assignment) => assignment.progress);
  const attempts = program.assignments.flatMap((assignment) => assignment.attempts);
  const rows = recipients.map((recipient) => {
    const rowProgress = progress.filter(
      (item) => item.studentId === recipient.studentId && item.assignmentId === recipient.assignmentId,
    );
    const lessonProgress = rowProgress.filter((item) => item.lessonId);
    const programProgress = rowProgress.find((item) => item.lessonId === null);
    const rowAttempts = attempts.filter(
      (attempt) => attempt.studentId === recipient.studentId && attempt.assignmentId === recipient.assignmentId,
    );
    const items = rowAttempts.flatMap((attempt) => attempt.items);
    const answeredActivityIds = new Set(items.map((item) => item.activityId));
    const completed = answeredActivityIds.size;
    const completion = totalActivities ? Math.round((completed / totalActivities) * 100) : 0;
    const correctItems = items.filter((item) => item.isCorrect).length;
    const accuracy = items.length ? Math.round((correctItems / items.length) * 100) : 0;
    const wrongByMode = new Map<string, number>();
    for (const item of items) {
      if (item.isCorrect) continue;
      const mode = item.activity.mode;
      wrongByMode.set(mode, (wrongByMode.get(mode) ?? 0) + 1);
    }
    const weakModes = Array.from(wrongByMode.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const needsContent = items.length > 0 ? accuracy < 70 || weakModes.some(([, count]) => count >= 2) : completion === 0;
    return {
      recipient,
      status: programProgress?.status ?? "NOT_STARTED",
      lessonDone: lessonProgress.filter((item) => ["GRADED", "SUBMITTED"].includes(item.status)).length,
      lessonTotal: program.lessons.length,
      completion,
      accuracy,
      completed,
      totalActivities,
      attempts: rowAttempts.length,
      weakModes,
      needsContent,
    };
  });

  const startedCount = rows.filter((row) => row.status !== "NOT_STARTED").length;
  const averageCompletion = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.completion, 0) / rows.length) : 0;
  const averageAccuracy = rows.filter((row) => row.completed > 0).length
    ? Math.round(
        rows
          .filter((row) => row.completed > 0)
          .reduce((sum, row) => sum + row.accuracy, 0) / rows.filter((row) => row.completed > 0).length,
      )
    : 0;
  const needsContentRows = rows.filter((row) => row.needsContent);
  const modeCounts = allActivities.reduce((map, activity) => {
    map.set(activity.mode, (map.get(activity.mode) ?? 0) + 1);
    return map;
  }, new Map<string, number>());

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-blue-600">수강 현황</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">{program.title}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {program.lessons.length}개 지문 · {totalActivities}개 활동 · {recipients.length}명 배포
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="대상 학생" value={recipients.length} />
        <Metric label="진행 시작" value={startedCount} />
        <Metric label="평균 완료율" value={`${averageCompletion}%`} />
        <Metric label="평균 정답률" value={`${averageAccuracy}%`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">학생별 현황</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {rows.map((row) => (
                <div key={`${row.recipient.assignmentId}-${row.recipient.id}`} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-slate-950">{row.recipient.student.name}</p>
                        <Badge
                          variant="outline"
                          className={
                            row.needsContent
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-blue-100 bg-blue-50 text-blue-700"
                          }
                        >
                          {row.needsContent ? "추가 콘텐츠 필요" : formatTutorStatus(row.status)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.recipient.student.school?.name ?? "학교 미지정"} · {row.recipient.student.grade}학년
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center md:w-[280px]">
                      <MiniStat label="완료율" value={`${row.completion}%`} />
                      <MiniStat label="정답률" value={row.completed > 0 ? `${row.accuracy}%` : "-"} />
                      <MiniStat label="응시" value={`${row.attempts}회`} />
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500">
                      <span>
                        활동 {row.completed}/{row.totalActivities}
                      </span>
                      <span>
                        지문 {row.lessonDone}/{row.lessonTotal}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${row.completion}%` }} />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {row.weakModes.length > 0 ? (
                      row.weakModes.map(([mode, count]) => (
                        <Badge key={mode} variant="outline" className="border-rose-100 bg-rose-50 text-rose-700">
                          {modeLabels[mode] ?? mode} 오답 {count}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-500">
                        누적 오답 데이터 없음
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
              {rows.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                  아직 배포된 학생이 없습니다.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">콘텐츠 구성</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Array.from(modeCounts.entries()).map(([mode, count]) => (
                <div key={mode} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-sm font-semibold text-slate-700">{modeLabels[mode] ?? mode}</span>
                  <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                    {count}개
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">추가 콘텐츠 추천 대상</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {needsContentRows.length > 0 ? (
                needsContentRows.map((row) => (
                  <div key={`${row.recipient.assignmentId}-${row.recipient.id}`} className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                    <p className="text-sm font-bold text-slate-950">{row.recipient.student.name}</p>
                    <p className="mt-1 text-xs leading-5 text-amber-800">
                      {row.completed === 0
                        ? "아직 시작하지 않았습니다. 첫 활동 진입 안내가 필요합니다."
                        : `${row.weakModes.map(([mode]) => modeLabels[mode] ?? mode).join(", ") || "정답률"} 보강 콘텐츠가 필요합니다.`}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-lg bg-slate-50 p-4 text-sm font-medium text-slate-500">
                  현재 추가 콘텐츠가 시급한 학생은 없습니다.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="p-4">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-950">{typeof value === "number" ? value.toLocaleString() : value}</p>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}
