import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { openTutorAssignmentWhere } from "@/lib/tutor/access";
import { requireTutorRouteSession } from "@/lib/tutor/route-auth";
import { TutorActivityPayloadSchema } from "@/lib/tutor/activity-payload-schema";
import { toStudentPayload } from "@/lib/tutor/student-payload";
import { buildViewablePassage, resolvePassagePolicy } from "@/lib/tutor/visibility";
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

  const assignment = await prisma.tutorAssignment.findFirst({
    where: { ...openTutorAssignmentWhere({ academyId: session.academyId, studentId: session.studentId, now }), programId },
    orderBy: { createdAt: "desc" },
    select: { hintsAllowed: true },
  });
  const hintsAllowed = assignment?.hintsAllowed ?? true;

  // v2 payload 파싱 → 학생용(정답키 제거) + 정책 기반 원문 가시성. 구버전이면 폴백.
  const parsed = TutorActivityPayloadSchema.safeParse(activity.payload);
  const studentPayload = parsed.success ? toStudentPayload(parsed.data) : null;
  const policy = parsed.success
    ? resolvePassagePolicy(activity.type, parsed.data.passagePolicy, hintsAllowed)
    : "visible";
  const viewable = buildViewablePassage(policy, activity.lesson.passage.content);

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
        studentPayload,
      }}
      passageTitle={activity.lesson.passage.title}
      viewable={viewable}
      nextActivityId={next?.id}
    />
  );
}
