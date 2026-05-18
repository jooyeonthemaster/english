import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { openTutorAssignmentWhere } from "@/lib/tutor/access";
import { requireTutorRouteSession } from "@/lib/tutor/route-auth";
import { sanitizeTutorActivityPayload } from "@/lib/tutor/sanitize-activity";
import { ActivityPlayer } from "./activity-player";

export default async function TutorActivityPage({
  params,
}: {
  params: Promise<{ academy: string; programId: string; lessonId: string; activityId: string }>;
}) {
  const { academy: rawAcademy, programId, activityId } = await params;
  const { academy, session } = await requireTutorRouteSession(rawAcademy);
  const now = new Date();
  const activity = await prisma.tutorActivity.findFirst({
    where: {
      id: activityId,
      academyId: session.academyId,
      status: { in: ["APPROVED", "PUBLISHED"] },
      lesson: {
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
    },
    include: {
      lesson: {
        include: {
          passage: true,
          activities: { where: { status: { in: ["APPROVED", "PUBLISHED"] } }, orderBy: { orderNum: "asc" } },
        },
      },
    },
  });
  if (!activity) notFound();
  const currentIndex = activity.lesson.activities.findIndex((item) => item.id === activity.id);
  const next = activity.lesson.activities[currentIndex + 1];

  return (
    <ActivityPlayer
      academy={academy}
      programId={programId}
      activity={{
        id: activity.id,
        lessonId: activity.lessonId,
        mode: activity.mode,
        type: activity.type,
        title: activity.title,
        instructions: activity.instructions,
        payload: sanitizeTutorActivityPayload(activity.payload),
      }}
      passage={activity.lesson.passage}
      nextActivityId={next?.id}
    />
  );
}
