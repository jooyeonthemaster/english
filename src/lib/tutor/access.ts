import type { Prisma } from "@prisma/client";

export function openTutorAssignmentWhere({
  academyId,
  studentId,
  now = new Date(),
}: {
  academyId: string;
  studentId: string;
  now?: Date;
}): Prisma.TutorAssignmentWhereInput {
  return {
    academyId,
    status: "OPEN",
    availableFrom: { lte: now },
    OR: [{ closesAt: null }, { closesAt: { gt: now } }],
    recipients: { some: { studentId } },
  };
}
