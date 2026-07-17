import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";

import { validateQuestionQuality } from "../src/lib/question-quality";

loadEnvConfig(process.cwd());

const FROM = new Date("2026-07-16T06:36:00.000Z");
const TO = new Date("2026-07-16T06:42:00.000Z");

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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
      subType: true,
      difficulty: true,
      structuredData: true,
      passage: { select: { content: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const rows = questions.map((stored) => {
    const question = isRecord(stored.structuredData)
      ? structuredClone(stored.structuredData)
      : {};
    const issues = validateQuestionQuality({
      typeId: stored.subType ?? "",
      question,
      passage: stored.passage?.content ?? undefined,
      requestedDifficulty: stored.difficulty ?? undefined,
    });
    return {
      idSuffix: stored.id.slice(-6),
      createdAtUtc: stored.createdAt.toISOString(),
      subType: stored.subType,
      difficulty: stored.difficulty,
      errors: issues.filter((issue) => issue.severity === "error"),
      warnings: issues.filter((issue) => issue.severity === "warning"),
    };
  });

  const canonical = JSON.stringify(rows);
  const output = {
    schemaVersion: "jul16-current-validator-replay-v1",
    sourceWindowUtc: { from: FROM.toISOString(), to: TO.toISOString() },
    count: rows.length,
    rowsSha256: createHash("sha256").update(canonical, "utf8").digest("hex"),
    summary: {
      withErrors: rows.filter((row) => row.errors.length > 0).length,
      withWarnings: rows.filter((row) => row.warnings.length > 0).length,
      errorCount: rows.reduce((sum, row) => sum + row.errors.length, 0),
      warningCount: rows.reduce((sum, row) => sum + row.warnings.length, 0),
    },
    rows,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
