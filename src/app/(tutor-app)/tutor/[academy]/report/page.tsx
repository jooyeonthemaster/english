import Link from "next/link";
import { BarChart3, ChevronRight, Target, Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { requireTutorRouteSession } from "@/lib/tutor/route-auth";

export default async function TutorReportPage({
  params,
}: {
  params: Promise<{ academy: string }>;
}) {
  const { academy: rawAcademy } = await params;
  const { academy, session } = await requireTutorRouteSession(rawAcademy);
  const attempts = await prisma.tutorAttempt.findMany({
    where: { academyId: session.academyId, studentId: session.studentId },
    orderBy: { startedAt: "desc" },
    take: 10,
    include: { lesson: true },
  });
  const average =
    attempts.length === 0
      ? 0
      : Math.round(attempts.reduce((sum, attempt) => sum + (attempt.percentScore ?? 0), 0) / attempts.length);
  const completed = attempts.filter((attempt) => ["SUBMITTED", "GRADED"].includes(attempt.status)).length;

  return (
    <div className="space-y-5 px-4 py-5 sm:px-6 md:px-8">
      <section className="rounded-[28px] bg-slate-950 p-5 text-white shadow-xl shadow-slate-200">
        <p className="text-sm font-bold text-blue-200">{session.name} 학생</p>
        <h1 className="mt-1 text-3xl font-black">MY 리포트</h1>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <Metric label="평균" value={`${average}`} />
          <Metric label="완료" value={`${completed}`} />
          <Metric label="기록" value={`${attempts.length}`} />
        </div>
      </section>

      <section className="rounded-3xl border border-blue-100 bg-blue-50 p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Trophy className="size-5 text-blue-600" />
          <p className="text-base font-black text-slate-950">최근 평균 점수</p>
        </div>
        <p className="mt-3 text-4xl font-black text-blue-700">{average}</p>
        <Progress value={average} className="mt-4 h-2.5" />
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
          80점 아래라면 해석과 어순 활동을 먼저 다시 풀고, 틀린 활동은 복습 탭에서 바로 확인하세요.
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-950">최근 학습 기록</h2>
          <BarChart3 className="size-5 text-blue-600" />
        </div>
        {attempts.map((attempt) => (
          <div key={attempt.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-black text-slate-950">{attempt.lesson.title}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{attempt.startedAt.toLocaleString("ko-KR")}</p>
              </div>
              <span className="rounded-2xl bg-blue-50 px-3 py-1 text-sm font-black text-blue-700">{attempt.percentScore ?? 0}점</span>
            </div>
          </div>
        ))}
        {attempts.length === 0 && (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm font-bold text-slate-500">
            아직 학습 기록이 없습니다. 학습 프로그램을 하나 완료하면 리포트가 채워집니다.
          </div>
        )}
      </section>

      <Button asChild className="h-12 w-full rounded-2xl bg-blue-600 text-base font-black hover:bg-blue-700">
        <Link href={`/tutor/${academy}/weakness`}>
          <Target className="mr-2 size-4" />
          약점 자세히 보기
          <ChevronRight className="ml-1 size-4" />
        </Link>
      </Button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-3">
      <p className="text-[10px] font-black text-blue-200">{label}</p>
      <p className="mt-1 text-2xl font-black text-white">{value}</p>
    </div>
  );
}
