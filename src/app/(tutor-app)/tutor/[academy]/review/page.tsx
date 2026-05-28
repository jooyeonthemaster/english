import Link from "next/link";
import { BookOpenCheck, ChevronRight, RotateCcw } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireTutorRouteSession } from "@/lib/tutor/route-auth";
import { UserResultsDisabled } from "@/components/shared/user-results-disabled";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { labelTutorActivityType, labelTutorMode, studentActivityTitle } from "@/lib/tutor/activity-labels";

export default async function TutorReviewPage({
  params,
}: {
  params: Promise<{ academy: string }>;
}) {
  const { academy: rawAcademy } = await params;
  const { academy, session } = await requireTutorRouteSession(rawAcademy);
  if (!FEATURE_FLAGS.SHOW_USER_RESULTS) {
    return <UserResultsDisabled homeHref={`/tutor/${academy}/study`} />;
  }

  const wrongItems = await prisma.tutorAttemptItem.findMany({
    where: { academyId: session.academyId, attempt: { studentId: session.studentId }, isCorrect: false },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { activity: true, attempt: { include: { assignment: true, lesson: true } } },
  });

  return (
    <div className="space-y-5 px-4 py-5 sm:px-6 md:px-8">
      <section className="rounded-[28px] border border-amber-100 bg-amber-50 p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <RotateCcw className="size-5 text-amber-600" />
          <p className="text-sm font-black text-amber-700">오답 복습</p>
        </div>
        <h1 className="mt-2 text-3xl font-black text-slate-950">틀린 문제만 다시 보기</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
          최근 오답을 다시 풀 수 있게 모았습니다. 같은 유형을 두 번 맞히면 약점이 빠르게 줄어듭니다.
        </p>
      </section>

      <div className="space-y-3">
        {wrongItems.map((item) => (
          <Link
            key={item.id}
            href={`/tutor/${academy}/study/${item.attempt.assignment.programId}/units/${item.attempt.lessonId}/activity/${item.activityId}`}
            className="block rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-amber-200 hover:bg-amber-50/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap gap-2">
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-700">
                    {labelTutorMode(item.activity.mode)}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-500">
                    {labelTutorActivityType(item.activity.type)}
                  </span>
                </div>
                <p className="line-clamp-2 text-sm font-black leading-6 text-slate-950">
                  {studentActivityTitle(item.activity.type, item.activity.title, item.activity.payload as Record<string, unknown>)}
                </p>
                <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-slate-500">{item.attempt.lesson.title}</p>
              </div>
              <ChevronRight className="size-5 shrink-0 text-slate-400" />
            </div>
          </Link>
        ))}
        {wrongItems.length === 0 && (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-14 text-center">
            <BookOpenCheck className="mx-auto size-10 text-blue-600" />
            <p className="mt-3 text-base font-black text-slate-800">아직 복습할 오답이 없습니다.</p>
            <p className="mt-1 text-sm font-medium text-slate-500">평가 활동에서 틀린 문항이 생기면 이곳에 자동으로 모입니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
