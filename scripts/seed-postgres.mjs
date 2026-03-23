// Seed PostgreSQL (Supabase) from exported SQLite data
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const prisma = new PrismaClient();

async function seed() {
  const raw = readFileSync("scripts/sqlite-export.json", "utf-8");
  const data = JSON.parse(raw);

  console.log("Seeding PostgreSQL from exported data...\n");

  // 1. Schools
  if (data.schools.length) {
    console.log(`  Schools: ${data.schools.length}`);
    for (const s of data.schools) {
      await prisma.school.create({
        data: {
          id: s.id,
          name: s.name,
          slug: s.slug,
          type: s.type,
          createdAt: new Date(s.createdAt),
        },
      });
    }
  }

  // 2. Students
  if (data.students.length) {
    console.log(`  Students: ${data.students.length}`);
    for (const s of data.students) {
      await prisma.student.create({
        data: {
          id: s.id,
          name: s.name,
          studentCode: s.studentCode,
          phone: s.phone,
          grade: s.grade,
          schoolId: s.schoolId,
          isActive: Boolean(s.isActive),
          createdAt: new Date(s.createdAt),
        },
      });
    }
  }

  // 3. Admins
  if (data.admins.length) {
    console.log(`  Admins: ${data.admins.length}`);
    for (const a of data.admins) {
      await prisma.admin.create({
        data: {
          id: a.id,
          email: a.email,
          password: a.password,
          name: a.name,
          role: a.role,
          createdAt: new Date(a.createdAt),
        },
      });
    }
  }

  // 4. Passages
  if (data.passages.length) {
    console.log(`  Passages: ${data.passages.length}`);
    for (const p of data.passages) {
      await prisma.passage.create({
        data: {
          id: p.id,
          schoolId: p.schoolId,
          title: p.title,
          content: p.content,
          source: p.source,
          grade: p.grade,
          semester: p.semester,
          unit: p.unit,
          order: p.order,
          createdAt: new Date(p.createdAt),
          updatedAt: new Date(p.updatedAt),
        },
      });
    }
  }

  // 5. PassageAnalyses
  if (data.passage_analyses.length) {
    console.log(`  PassageAnalyses: ${data.passage_analyses.length}`);
    for (const pa of data.passage_analyses) {
      await prisma.passageAnalysis.create({
        data: {
          id: pa.id,
          passageId: pa.passageId,
          analysisData: pa.analysisData,
          contentHash: pa.contentHash,
          version: pa.version,
          createdAt: new Date(pa.createdAt),
          updatedAt: new Date(pa.updatedAt),
        },
      });
    }
  }

  // 6. PassageNotes
  if (data.passage_notes.length) {
    console.log(`  PassageNotes: ${data.passage_notes.length}`);
    // Batch insert for speed
    const batchSize = 100;
    for (let i = 0; i < data.passage_notes.length; i += batchSize) {
      const batch = data.passage_notes.slice(i, i + batchSize);
      await Promise.all(
        batch.map((n) =>
          prisma.passageNote.create({
            data: {
              id: n.id,
              passageId: n.passageId,
              content: n.content,
              highlightStart: n.highlightStart,
              highlightEnd: n.highlightEnd,
              noteType: n.noteType,
              order: n.order,
              createdAt: new Date(n.createdAt),
              updatedAt: new Date(n.updatedAt),
            },
          })
        )
      );
    }
  }

  // 7. VocabularyLists
  if (data.vocabulary_lists.length) {
    console.log(`  VocabularyLists: ${data.vocabulary_lists.length}`);
    for (const vl of data.vocabulary_lists) {
      await prisma.vocabularyList.create({
        data: {
          id: vl.id,
          schoolId: vl.schoolId,
          title: vl.title,
          grade: vl.grade,
          semester: vl.semester,
          unit: vl.unit,
          order: vl.order,
          createdAt: new Date(vl.createdAt),
          updatedAt: new Date(vl.updatedAt),
        },
      });
    }
  }

  // 8. VocabularyItems
  if (data.vocabulary_items.length) {
    console.log(`  VocabularyItems: ${data.vocabulary_items.length}`);
    const batchSize = 200;
    for (let i = 0; i < data.vocabulary_items.length; i += batchSize) {
      const batch = data.vocabulary_items.slice(i, i + batchSize);
      await Promise.all(
        batch.map((vi) =>
          prisma.vocabularyItem.create({
            data: {
              id: vi.id,
              listId: vi.listId,
              english: vi.english,
              korean: vi.korean,
              partOfSpeech: vi.partOfSpeech,
              exampleEn: vi.exampleEn,
              exampleKr: vi.exampleKr,
              phonetic: vi.phonetic,
              order: vi.order,
              createdAt: new Date(vi.createdAt),
            },
          })
        )
      );
    }
  }

  // 9. Exams
  if (data.exams.length) {
    console.log(`  Exams: ${data.exams.length}`);
    for (const e of data.exams) {
      await prisma.exam.create({
        data: {
          id: e.id,
          schoolId: e.schoolId,
          grade: e.grade,
          semester: e.semester,
          examType: e.examType,
          year: e.year,
          title: e.title,
          createdAt: new Date(e.createdAt),
          updatedAt: new Date(e.updatedAt),
        },
      });
    }
  }

  // 10. ExamQuestions
  if (data.exam_questions.length) {
    console.log(`  ExamQuestions: ${data.exam_questions.length}`);
    for (const q of data.exam_questions) {
      await prisma.examQuestion.create({
        data: {
          id: q.id,
          examId: q.examId,
          questionNumber: q.questionNumber,
          questionText: q.questionText,
          questionImage: q.questionImage,
          correctAnswer: q.correctAnswer,
          points: q.points,
          passageId: q.passageId,
          createdAt: new Date(q.createdAt),
          updatedAt: new Date(q.updatedAt),
        },
      });
    }
  }

  // 11. QuestionExplanations
  if (data.question_explanations.length) {
    console.log(`  QuestionExplanations: ${data.question_explanations.length}`);
    for (const qe of data.question_explanations) {
      await prisma.questionExplanation.create({
        data: {
          id: qe.id,
          questionId: qe.questionId,
          content: qe.content,
          keyPoints: qe.keyPoints,
          difficulty: qe.difficulty,
          createdAt: new Date(qe.createdAt),
          updatedAt: new Date(qe.updatedAt),
        },
      });
    }
  }

  // 12. TeacherPrompts
  if (data.teacher_prompts.length) {
    console.log(`  TeacherPrompts: ${data.teacher_prompts.length}`);
    for (const tp of data.teacher_prompts) {
      await prisma.teacherPrompt.create({
        data: {
          id: tp.id,
          schoolId: tp.schoolId,
          passageId: tp.passageId,
          content: tp.content,
          promptType: tp.promptType,
          isActive: Boolean(tp.isActive),
          createdAt: new Date(tp.createdAt),
          updatedAt: new Date(tp.updatedAt),
        },
      });
    }
  }

  // Empty tables skipped: vocabTestResults, wrongVocabAnswers, aiConversations, studyProgress

  console.log("\nSeeding complete!");
  await prisma.$disconnect();
}

seed().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
