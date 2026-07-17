import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const FROM = new Date("2026-07-16T06:36:00.000Z");
const TO = new Date("2026-07-16T06:42:00.000Z");
const ARGUMENT = process.argv[2]?.trim() || null;
const SUMMARY_ONLY = ARGUMENT === "--summary";
const FILTER_SUFFIX = SUMMARY_ONLY ? null : ARGUMENT;

async function main(): Promise<void> {
  const { prisma } = await import("../src/lib/prisma");
  const questions = await prisma.question.findMany({
    where: {
      createdAt: { gte: FROM, lt: TO },
      deletedAt: null,
      aiGenerated: true,
    },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      type: true,
      subType: true,
      difficulty: true,
      questionText: true,
      structuredData: true,
      options: true,
      correctAnswer: true,
      tags: true,
      learningCategory: true,
      passage: {
        select: {
          id: true,
          title: true,
          content: true,
          source: true,
          grade: true,
          difficulty: true,
          reviewedAt: true,
          updatedAt: true,
        },
      },
      explanation: {
        select: {
          content: true,
          keyPoints: true,
          wrongOptionExplanations: true,
          relatedGrammar: true,
          difficulty: true,
          updatedAt: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const selected = FILTER_SUFFIX
    ? questions.filter((question) => question.id.endsWith(FILTER_SUFFIX))
    : questions;

  const rows = selected.map((question) => ({
    idSuffix: question.id.slice(-6),
    createdAtUtc: question.createdAt.toISOString(),
    updatedAtUtc: question.updatedAt.toISOString(),
    type: question.type,
    subType: question.subType,
    difficulty: question.difficulty,
    questionText: question.questionText,
    structuredData: question.structuredData,
    options: question.options,
    correctAnswer: question.correctAnswer,
    tags: question.tags,
    learningCategory: question.learningCategory,
    passage: question.passage && {
      idSuffix: question.passage.id.slice(-6),
      title: question.passage.title,
      content: question.passage.content,
      source: question.passage.source,
      grade: question.passage.grade,
      difficulty: question.passage.difficulty,
      reviewedAtUtc: question.passage.reviewedAt?.toISOString() ?? null,
      updatedAtUtc: question.passage.updatedAt.toISOString(),
    },
    explanation: question.explanation && {
      ...question.explanation,
      updatedAt: question.explanation.updatedAt.toISOString(),
    },
  }));
  const rowsCanonicalJson = JSON.stringify(rows);
  const contentSha256 = createHash("sha256").update(rowsCanonicalJson, "utf8").digest("hex");

  const output = {
    schemaVersion: "jul16-latest-production-question-content-read-only-v1",
    windowUtc: { from: FROM.toISOString(), to: TO.toISOString() },
    filterSuffix: FILTER_SUFFIX,
    count: selected.length,
    contentSha256,
    rows: SUMMARY_ONLY
      ? rows.map((row) => ({
          idSuffix: row.idSuffix,
          createdAtUtc: row.createdAtUtc,
          updatedAtUtc: row.updatedAtUtc,
          type: row.type,
          subType: row.subType,
          difficulty: row.difficulty,
          passageIdSuffix: row.passage?.idSuffix ?? null,
          passageUpdatedAtUtc: row.passage?.updatedAtUtc ?? null,
          explanationUpdatedAtUtc: row.explanation?.updatedAt ?? null,
        }))
      : rows,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
