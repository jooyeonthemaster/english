import { PrismaClient } from "@prisma/client";
import { MS_VOCAB_DATA } from "./data/ms-vocab";
import { HS_VOCAB_DATA } from "./data/hs-vocab";
import { MS_PASSAGE_DATA } from "./data/ms-passages";
import { HS_PASSAGE_DATA } from "./data/hs-passages";

const prisma = new PrismaClient();

async function seedVocabForSchool(
  schoolId: string,
  schoolSlug: string,
  vocabData: typeof MS_VOCAB_DATA
) {
  let totalLists = 0;
  let totalItems = 0;

  for (const gradeData of vocabData) {
    for (const list of gradeData.lists) {
      // Check if list already exists
      const existing = await prisma.vocabularyList.findFirst({
        where: {
          schoolId,
          grade: gradeData.grade,
          semester: gradeData.semester,
          unit: list.unit,
        },
      });

      if (existing) {
        continue; // Skip if already exists
      }

      await prisma.vocabularyList.create({
        data: {
          schoolId,
          title: list.title,
          grade: gradeData.grade,
          semester: gradeData.semester,
          unit: list.unit,
          order: list.order,
          items: {
            create: list.items.map((item) => ({
              english: item.english,
              korean: item.korean,
              partOfSpeech: item.partOfSpeech,
              exampleEn: item.exampleEn,
              exampleKr: item.exampleKr,
              order: item.order,
            })),
          },
        },
      });
      totalLists++;
      totalItems += list.items.length;
    }
  }

  return { totalLists, totalItems };
}

async function seedPassagesForSchool(
  schoolId: string,
  schoolSlug: string,
  passageData: typeof MS_PASSAGE_DATA
) {
  let totalPassages = 0;
  let totalNotes = 0;

  for (const gradeData of passageData) {
    for (const passage of gradeData.passages) {
      // Check if passage already exists
      const existing = await prisma.passage.findFirst({
        where: {
          schoolId,
          grade: gradeData.grade,
          semester: gradeData.semester,
          unit: passage.unit,
          title: passage.title,
        },
      });

      if (existing) {
        continue; // Skip if already exists
      }

      await prisma.passage.create({
        data: {
          schoolId,
          title: passage.title,
          content: passage.content,
          source: passage.source,
          grade: gradeData.grade,
          semester: gradeData.semester,
          unit: passage.unit,
          order: passage.order,
          notes: {
            create: passage.notes.map((note) => ({
              content: note.content,
              noteType: note.noteType,
              order: note.order,
            })),
          },
        },
      });
      totalPassages++;
      totalNotes += passage.notes.length;
    }
  }

  return { totalPassages, totalNotes };
}

async function main() {
  console.log("🚀 Starting full data seed for ALL schools...\n");

  const schools = await prisma.school.findMany({
    orderBy: [{ type: "asc" }, { slug: "asc" }],
  });

  console.log(`📋 Found ${schools.length} schools\n`);

  let grandTotalLists = 0;
  let grandTotalItems = 0;
  let grandTotalPassages = 0;
  let grandTotalNotes = 0;

  for (const school of schools) {
    const isHigh = school.type === "HIGH";
    const vocabData = isHigh ? HS_VOCAB_DATA : MS_VOCAB_DATA;
    const passageData = isHigh ? HS_PASSAGE_DATA : MS_PASSAGE_DATA;

    console.log(`📖 Seeding ${school.name} (${school.slug})...`);

    const vocabResult = await seedVocabForSchool(
      school.id,
      school.slug,
      vocabData
    );
    const passageResult = await seedPassagesForSchool(
      school.id,
      school.slug,
      passageData
    );

    console.log(
      `   ✅ 단어장: ${vocabResult.totalLists}개 (${vocabResult.totalItems}단어) | 지문: ${passageResult.totalPassages}개 (${passageResult.totalNotes}노트)`
    );

    grandTotalLists += vocabResult.totalLists;
    grandTotalItems += vocabResult.totalItems;
    grandTotalPassages += passageResult.totalPassages;
    grandTotalNotes += passageResult.totalNotes;
  }

  console.log("\n" + "=".repeat(60));
  console.log("🎉 SEEDING COMPLETE!");
  console.log(`   📚 단어장: ${grandTotalLists}개 생성 (${grandTotalItems}개 단어)`);
  console.log(`   📄 지문: ${grandTotalPassages}개 생성 (${grandTotalNotes}개 노트)`);
  console.log(`   🏫 총 ${schools.length}개 학교에 데이터 삽입 완료`);
  console.log("=".repeat(60));
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
