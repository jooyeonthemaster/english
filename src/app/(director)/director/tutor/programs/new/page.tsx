import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TutorProgramCreateForm } from "../_components/tutor-program-create-form";

export default async function NewTutorProgramPage() {
  const staff = await requireStaffAuth("DIRECTOR");
  const [classes, students] = await Promise.all([
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
  ]);

  return (
    <TutorProgramCreateForm
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
    />
  );
}
