import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { TopBarBack } from "@/components/layout/top-bar-back";
import { VocabDetailClient } from "./vocab-detail-client";

interface VocabDetailProps {
  params: Promise<{ schoolSlug: string; listId: string }>;
}

export default async function VocabDetailPage({ params }: VocabDetailProps) {
  const { schoolSlug, listId } = await params;

  const vocabList = await prisma.vocabularyList.findUnique({
    where: { id: listId },
    include: {
      items: {
        orderBy: { order: "asc" },
      },
    },
  });

  if (!vocabList) {
    notFound();
  }

  const items = vocabList.items.map((item) => ({
    id: item.id,
    english: item.english,
    korean: item.korean,
    partOfSpeech: item.partOfSpeech,
    exampleEn: item.exampleEn,
    exampleKr: item.exampleKr,
    phonetic: item.phonetic,
  }));

  return (
    <>
      <TopBarBack title={vocabList.title} />
      <VocabDetailClient
        items={items}
        totalCount={items.length}
        schoolSlug={schoolSlug}
        listId={listId}
      />
    </>
  );
}
