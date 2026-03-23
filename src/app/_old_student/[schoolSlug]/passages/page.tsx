import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { TopBarBack } from "@/components/layout/top-bar-back";
import { PassageListClient } from "./passage-list-client";

interface PassagesPageProps {
  params: Promise<{ schoolSlug: string }>;
}

export default async function PassagesPage({ params }: PassagesPageProps) {
  const { schoolSlug } = await params;

  const school = await prisma.school.findUnique({
    where: { slug: schoolSlug },
  });

  if (!school) {
    notFound();
  }

  const passages = await prisma.passage.findMany({
    where: { schoolId: school.id },
    orderBy: [{ grade: "asc" }, { semester: "asc" }, { order: "asc" }],
    select: {
      id: true,
      title: true,
      source: true,
      grade: true,
      semester: true,
      unit: true,
    },
  });

  const grades = [...new Set(passages.map((p) => p.grade))].sort();

  return (
    <>
      <TopBarBack title="핵심 지문 분석" />
      <PassageListClient
        passages={passages}
        grades={grades}
        schoolSlug={schoolSlug}
      />
    </>
  );
}
