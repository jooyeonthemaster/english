import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { TopBarBack } from "@/components/layout/top-bar-back";
import { VocabListClient } from "./vocab-list-client";

interface VocabPageProps {
  params: Promise<{ schoolSlug: string }>;
}

export default async function VocabPage({ params }: VocabPageProps) {
  const { schoolSlug } = await params;

  const school = await prisma.school.findUnique({
    where: { slug: schoolSlug },
  });

  if (!school) {
    notFound();
  }

  const vocabLists = await prisma.vocabularyList.findMany({
    where: { schoolId: school.id },
    orderBy: [{ grade: "asc" }, { semester: "asc" }, { order: "asc" }],
    select: {
      id: true,
      title: true,
      grade: true,
      semester: true,
      unit: true,
      _count: {
        select: { items: true },
      },
    },
  });

  const grades = [...new Set(vocabLists.map((v) => v.grade))].sort();

  const listsWithCount = vocabLists.map((list) => ({
    id: list.id,
    title: list.title,
    grade: list.grade,
    semester: list.semester,
    unit: list.unit,
    itemCount: list._count.items,
  }));

  return (
    <>
      <TopBarBack title="영단어 학습" />
      <VocabListClient
        lists={listsWithCount}
        grades={grades}
        schoolSlug={schoolSlug}
      />
    </>
  );
}
