import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { openTutorAssignmentWhere } from "@/lib/tutor/access";
import { requireTutorRouteSession } from "@/lib/tutor/route-auth";
import { TutorLessonAskClient } from "./tutor-lesson-ask-client";

export default async function TutorLessonAskPage({
  params,
}: {
  params: Promise<{ academy: string; programId: string; lessonId: string }>;
}) {
  const { academy: rawAcademy, programId, lessonId } = await params;
  const { academy, session } = await requireTutorRouteSession(rawAcademy);
  const now = new Date();
  const lesson = await prisma.tutorLesson.findFirst({
    where: {
      id: lessonId,
      academyId: session.academyId,
      programLinks: {
        some: {
          programId,
          program: {
            assignments: {
              some: openTutorAssignmentWhere({ academyId: session.academyId, studentId: session.studentId, now }),
            },
          },
        },
      },
    },
    include: {
      passage: true,
      activities: { where: { status: { in: ["APPROVED", "PUBLISHED"] } } },
      conversations: {
        where: { studentId: session.studentId, programId },
        orderBy: { updatedAt: "desc" },
        take: 1,
        include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } },
      },
    },
  });
  if (!lesson) notFound();

  return (
    <TutorLessonAskClient
      academy={academy}
      programId={programId}
      lessonId={lesson.id}
      title={lesson.title}
      passage={lesson.passage.content}
      initialMessages={lesson.conversations[0]?.messages.map((message) => ({
        id: message.id,
        role: message.role === "user" ? "user" : "assistant",
        content: message.content,
      })) ?? []}
    />
  );
}
