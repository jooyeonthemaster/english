"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "./_helpers";

/** Get schools for the academy (for dropdown) */
export async function getSchools(academyId: string) {
  await requireAuth();

  return prisma.school.findMany({
    where: { academyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true },
  });
}

/** Get classes for the academy (for dropdown) */
export async function getClasses(academyId: string) {
  await requireAuth();

  return prisma.class.findMany({
    where: { academyId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
