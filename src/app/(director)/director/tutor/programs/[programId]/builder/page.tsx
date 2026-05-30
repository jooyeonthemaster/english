import { notFound } from "next/navigation";
import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TutorProgramBuilderClient } from "./tutor-program-builder-client";

export default async function TutorProgramBuilderPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const staff = await requireStaffAuth("DIRECTOR");
  const { programId } = await params;

  const program = await prisma.tutorProgram.findFirst({
    where: { id: programId, academyId: staff.academyId, deletedAt: null },
    include: {
      lessons: {
        orderBy: { orderNum: "asc" },
        include: {
          lesson: {
            include: {
              passage: { include: { school: true, analysis: true } },
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

  const [classes, students, activeStudentCount] = await Promise.all([
    prisma.class.findMany({
      where: { academyId: staff.academyId, isActive: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        _count: { select: { enrollments: { where: { status: "ENROLLED" } } } },
      },
    }),
    prisma.student.findMany({
      where: { academyId: staff.academyId, status: "ACTIVE" },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        grade: true,
        school: { select: { name: true } },
      },
    }),
    prisma.student.count({ where: { academyId: staff.academyId, status: "ACTIVE" } }),
  ]);

  return (
    <TutorProgramBuilderClient
      academyId={staff.academyId}
      activeStudentCount={activeStudentCount}
      classes={classes.map((item) => ({
        id: item.id,
        label: item.name,
        count: item._count.enrollments,
      }))}
      students={students.map((student) => ({
        id: student.id,
        label: student.name,
        meta: [student.school?.name, `${student.grade}학년`].filter(Boolean).join(" · "),
      }))}
      initialProgram={{
        id: program.id,
        title: program.title,
        description: program.description,
        status: program.status,
        estimatedMin: program.estimatedMin,
        lessons: program.lessons.map((link) => ({
          id: link.lesson.id,
          passageId: link.lesson.passageId,
          title: link.lesson.title,
          passageContent: link.lesson.passage.content,
          schoolName: link.lesson.passage.school?.name ?? null,
          grade: link.lesson.passage.grade ?? null,
          unit: link.lesson.passage.unit ?? null,
          analysisData: link.lesson.passage.analysis?.analysisData ?? null,
          activityCount: link.lesson.activityCount,
          totalMaxScore: link.lesson.totalMaxScore,
          activities: link.lesson.activities.map((activity) => ({
            id: activity.id,
            mode: activity.mode,
            type: activity.type,
            title: activity.title,
            itemCount: activity.itemCount,
            maxScore: activity.maxScore,
            estimatedSec: activity.estimatedSec,
          })),
        })),
      }}
    />
  );
}
