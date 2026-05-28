import Link from "next/link";
import { ArrowRight, BookOpenCheck, CheckCircle2, Flame, MessageCircleQuestion, Target } from "lucide-react";
import { getTutorStudentHome } from "@/actions/tutor";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { formatTutorStatus } from "@/lib/tutor/ui-copy";
import { requireTutorRouteSession } from "@/lib/tutor/route-auth";

export default async function TutorStudyHomePage({
  params,
}: {
  params: Promise<{ academy: string }>;
}) {
  const { academy: rawAcademy } = await params;
  const { academy } = await requireTutorRouteSession(rawAcademy);
  const { session, recipients } = await getTutorStudentHome();

  const totalPrograms = recipients.length;
  const totalLessons = recipients.reduce((sum, recipient) => sum + recipient.assignment.program.lessons.length, 0);
  const completedPrograms = recipients.filter((recipient) =>
    recipient.assignment.progress.some((item) => item.lessonId === null && ["SUBMITTED", "GRADED"].includes(item.status)),
  ).length;
  const activeProgram = recipients[0]?.assignment.program;

  return (
    <div className="space-y-5 px-4 py-5 sm:px-6 md:px-8">
      <section className="overflow-hidden rounded-[28px] bg-slate-950 text-white shadow-xl shadow-slate-200">
        <div className="relative px-5 py-6 sm:px-7">
          <div className="absolute right-4 top-4 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-black text-blue-100">
            Tutor Lab
          </div>
          <p className="text-sm font-bold text-blue-200">{session.name} 학생</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">오늘의 학습</h1>
          <p className="mt-2 max-w-xl text-sm font-medium leading-6 text-slate-300">
            선생님이 배포한 지문을 순서대로 풀면 해석, 암기, 어법, 문맥 흐름이 한 번에 누적됩니다.
          </p>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <HeroMetric label="배포" value={`${totalPrograms}`} />
            <HeroMetric label="지문" value={`${totalLessons}`} />
            <HeroMetric label="완료" value={`${completedPrograms}`} />
          </div>

          {activeProgram && (
            <Link
              href={`/tutor/${academy}/study/${activeProgram.id}`}
              className="mt-5 flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-slate-950 shadow-lg"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-black text-blue-600">바로 이어서</p>
                <p className="mt-0.5 truncate text-sm font-black">{activeProgram.title}</p>
              </div>
              <ArrowRight className="size-5 text-blue-600" />
            </Link>
          )}
        </div>
      </section>

      <section className={FEATURE_FLAGS.SHOW_USER_RESULTS ? "grid grid-cols-3 gap-2 sm:gap-3" : "grid grid-cols-1 gap-2 sm:gap-3"}>
        {FEATURE_FLAGS.SHOW_USER_RESULTS && (
          <QuickLink href={`/tutor/${academy}/review`} icon={Target} label="오답 복습" sub="틀린 것만" />
        )}
        <QuickLink href={`/tutor/${academy}/question-history`} icon={MessageCircleQuestion} label="질문 기록" sub="해설 모음" />
        {FEATURE_FLAGS.SHOW_USER_RESULTS && (
          <QuickLink href={`/tutor/${academy}/report`} icon={Flame} label="MY 리포트" sub="성장 확인" />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-black uppercase text-blue-600">Assignments</p>
            <h2 className="text-xl font-black text-slate-950">학습 프로그램</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">{totalPrograms}개</span>
        </div>

        {recipients.map((recipient) => {
          const program = recipient.assignment.program;
          const programProgress = recipient.assignment.progress.find((item) => item.lessonId === null);
          const lessonProgress = recipient.assignment.progress.filter((item) => item.lessonId !== null);
          const completedLessons = lessonProgress.filter((item) => ["SUBMITTED", "GRADED"].includes(item.status)).length;
          const completion = program.lessons.length ? Math.round((completedLessons / program.lessons.length) * 100) : 0;
          const status = formatTutorStatus(programProgress?.status);

          return (
            <Link key={recipient.id} href={`/tutor/${academy}/study/${program.id}`}>
              <Card className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700">
                          {status}
                        </span>
                        {completion === 100 && <CheckCircle2 className="size-4 text-blue-600" />}
                      </div>
                      <p className="line-clamp-2 text-base font-black leading-6 text-slate-950">{program.title}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {program.lessons.length}개 지문 · {completedLessons}개 완료
                      </p>
                    </div>
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-blue-600 ring-1 ring-slate-100">
                      <BookOpenCheck className="size-6" />
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-[11px] font-bold text-slate-500">
                      <span>진행률</span>
                      <span>{completion}%</span>
                    </div>
                    <Progress value={completion} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}

        {recipients.length === 0 && (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-14 text-center">
            <p className="text-base font-black text-slate-800">아직 배포된 학습이 없습니다.</p>
            <p className="mt-2 text-sm font-medium text-slate-500">선생님이 지문 프로그램을 열면 이곳에 바로 표시됩니다.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-3">
      <p className="text-[10px] font-black text-blue-200">{label}</p>
      <p className="mt-1 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
  sub,
}: {
  href: string;
  icon: typeof Target;
  label: string;
  sub: string;
}) {
  return (
    <Link href={href} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-blue-200 hover:bg-blue-50">
      <Icon className="size-5 text-blue-600" />
      <p className="mt-2 text-xs font-black text-slate-950">{label}</p>
      <p className="mt-0.5 text-[10px] font-semibold text-slate-500">{sub}</p>
    </Link>
  );
}
