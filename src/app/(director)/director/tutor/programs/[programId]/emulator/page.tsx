import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parsePassageAnalysis } from "@/lib/tutor/passage-analysis";
import { sanitizeTutorActivityPayload } from "@/lib/tutor/sanitize-activity";
import { Button } from "@/components/ui/button";
import { TutorProgramEmulatorClient } from "./tutor-program-emulator-client";

export default async function TutorProgramEmulatorPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const staff = await requireStaffAuth("DIRECTOR");
  const { programId } = await params;

  const program = await prisma.tutorProgram.findFirst({
    where: { id: programId, academyId: staff.academyId, deletedAt: null },
    include: {
      academy: { select: { slug: true, name: true } },
      assignments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { recipients: { take: 1, include: { student: { select: { name: true } } } } },
      },
      lessons: {
        orderBy: { orderNum: "asc" },
        include: {
          lesson: {
            include: {
              passage: { include: { analysis: true, school: true } },
              activities: {
                where: { status: { in: ["APPROVED", "PUBLISHED"] } },
                orderBy: { orderNum: "asc" },
              },
            },
          },
        },
      },
    },
  });

  if (!program) notFound();

  const previewStudentName = program.assignments[0]?.recipients[0]?.student.name ?? "학생";

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-5 py-4 lg:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Button asChild variant="outline" size="icon" className="mt-1 shrink-0 rounded-xl">
              <Link href={`/director/tutor/programs/${program.id}/builder`} aria-label="빌더로 돌아가기">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase text-blue-600">Student Device Emulator</p>
              <h1 className="mt-1 line-clamp-1 text-2xl font-black text-slate-950">{program.title}</h1>
              <p className="mt-1 text-sm font-medium text-slate-500">
                학생 모바일/태블릿에서 보이는 프로그램 화면을 실제 데이터로 확인합니다.
              </p>
            </div>
          </div>
        </div>
      </header>

      <TutorProgramEmulatorClient
        academyName={program.academy.name}
        academySlug={program.academy.slug}
        studentName={previewStudentName}
        program={{
          id: program.id,
          title: program.title,
          status: program.status,
          lessons: program.lessons.map((link) => {
            const lesson = link.lesson;
            const analysis = parsePassageAnalysis(lesson.passage.analysis?.analysisData);
            return {
              id: lesson.id,
              orderNum: link.orderNum,
              title: lesson.title,
              passageTitle: lesson.passage.title,
              passageContent: lesson.passage.content,
              schoolName: lesson.passage.school?.name ?? null,
              grade: lesson.passage.grade ?? null,
              unit: lesson.passage.unit ?? null,
              analysisData: analysis,
              sentences:
                analysis?.sentences.map((sentence) => ({
                  index: sentence.index,
                  english: sentence.english,
                  korean: sentence.korean,
                })) ?? fallbackSentences(lesson.passage.content),
              activities: lesson.activities.map((activity) => ({
                id: activity.id,
                lessonId: activity.lessonId,
                mode: activity.mode,
                type: activity.type,
                title: activity.title,
                instructions: activity.instructions,
                payload: sanitizeTutorActivityPayload(activity.payload),
                maxScore: activity.maxScore,
                estimatedSec: activity.estimatedSec,
              })),
            };
          }),
        }}
      />
    </div>
  );
}

function fallbackSentences(content: string) {
  const matches = content.match(/[^.!?]+[.!?]+/g) ?? [content];
  return matches.map((english, index) => ({
    index,
    english: english.trim(),
    korean: "",
  }));
}
