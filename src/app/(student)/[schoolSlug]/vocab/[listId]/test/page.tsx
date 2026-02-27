import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { VocabTestClient } from "./vocab-test-client";

interface VocabTestPageProps {
  params: Promise<{ schoolSlug: string; listId: string }>;
}

export default async function VocabTestPage({ params }: VocabTestPageProps) {
  const { schoolSlug, listId } = await params;

  const vocabList = await prisma.vocabularyList.findUnique({
    where: { id: listId },
    include: {
      items: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          english: true,
          korean: true,
          partOfSpeech: true,
        },
      },
    },
  });

  if (!vocabList || vocabList.items.length === 0) {
    notFound();
  }

  const items = vocabList.items.map((item) => ({
    id: item.id,
    english: item.english,
    korean: item.korean,
    partOfSpeech: item.partOfSpeech,
  }));

  return (
    <VocabTestClient
      items={items}
      listId={listId}
      listTitle={vocabList.title}
      schoolSlug={schoolSlug}
    />
  );
}
