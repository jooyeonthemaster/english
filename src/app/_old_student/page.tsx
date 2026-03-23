import { prisma } from "@/lib/prisma";
import { SchoolSelectionClient } from "./school-selection-client";

export default async function SchoolSelectionPage() {
  const schools = await prisma.school.findMany({
    where: { type: "HIGH" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      _count: { select: { passages: true } },
    },
  });

  // Find schools that have at least one passage analysis
  const analyzedSchoolIds = await prisma.passageAnalysis.findMany({
    select: { passage: { select: { schoolId: true } } },
    distinct: ["passageId"],
  });
  const schoolsWithAnalysis = new Set(
    analyzedSchoolIds.map((a) => a.passage.schoolId)
  );

  const schoolsData = schools.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    type: s.type,
    hasAnalysis: schoolsWithAnalysis.has(s.id),
  }));

  return <SchoolSelectionClient schools={schoolsData} />;
}
