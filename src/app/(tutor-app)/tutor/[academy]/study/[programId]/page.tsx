import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, CheckCircle2, ChevronRight, MessageCircleQuestion, Target } from "lucide-react";
import { getTutorStudentProgram } from "@/actions/tutor";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatTutorStatus } from "@/lib/tutor/ui-copy";
import { requireTutorRouteSession } from "@/lib/tutor/route-auth";

export default async function TutorProgramPage({
  params,
}: {
  params: Promise<{ academy: string; programId: string }>;
}) {
  const { academy: rawAcademy, programId } = await params;
  const { academy } = await requireTutorRouteSession(rawAcademy);
  const program = await getTutorStudentProgram(programId);
  if (!program) notFound();

  const assignmentProgress = program.assignments.flatMap((assignment) => assignment.progress);
  const lessonRows = program.lessons.map((link) => {
    const lesson = link.lesson;
    const lessonProgress = assignmentProgress.find((item) => item.lessonId === lesson.id);
    const done = lessonProgress ? ["SUBMITTED", "GRADED"].includes(lessonProgress.status) : false;
    return { link, lesson, lessonProgress, done };
  });
  const completed = lessonRows.filter((row) => row.done).length;
  const completion = lessonRows.length ? Math.round((completed / lessonRows.length) * 100) : 0;

  return (
    <div className="space-y-5 px-4 py-5 sm:px-6 md:px-8">
      <header className="flex items-start gap-3">
        <Link
          href={`/tutor/${academy}/study`}
          className="mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm"
          aria-label="학습 홈으로 돌아가기"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase text-blue-600">Program</p>
          <h1 className="mt-1 text-2xl font-black leading-8 text-slate-950">{program.title}</h1>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
            지문을 하나씩 열고, 분석 → 훈련 → 질문까지 한 흐름으로 마무리하세요.
          </p>
        </div>
      </header>

      <section className="rounded-[28px] border border-blue-100 bg-blue-50 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black text-blue-700">전체 진도</p>
            <p className="mt-1 text-3xl font-black text-slate-950">{completion}%</p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3 text-right shadow-sm">
            <p className="text-xs font-bold text-slate-500">완료 지문</p>
            <p className="mt-1 text-lg font-black text-blue-700">
              {completed}/{lessonRows.length}
            </p>
          </div>
        </div>
        <Progress value={completion} className="mt-4 h-2.5" />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-950">지문 로드맵</h2>
          <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-500">
            {lessonRows.length} lessons
          </Badge>
        </div>

        {lessonRows.map(({ link, lesson, lessonProgress, done }, index) => (
          <Card key={lesson.id} className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm">
            <CardContent className="p-0">
              <Link href={`/tutor/${academy}/study/${program.id}/units/${lesson.id}`} className="block p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex size-11 shrink-0 items-center justify-center rounded-2xl font-black ${
                      done ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {done ? <CheckCircle2 className="size-5" /> : index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="line-clamp-1 text-base font-black text-slate-950">{lesson.title}</p>
                      <ChevronRight className="size-4 shrink-0 text-slate-400" />
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{lesson.passage.content}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
                        {formatTutorStatus(lessonProgress?.status)}
                      </Badge>
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600">
                        <Target className="size-3.5" />
                        {lesson.activities.length}개 훈련
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500">
                        <BookOpen className="size-3.5" />
                        {link.orderNum + 1}번째 지문
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
              <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
                <Link
                  href={`/tutor/${academy}/study/${program.id}/units/${lesson.id}/ask`}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-3 text-sm font-black text-blue-700"
                >
                  <MessageCircleQuestion className="size-4" />
                  이 지문 질문하기
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
