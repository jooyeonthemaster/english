/**
 * Save a passage analysis to the database.
 * Usage: node scripts/save-analysis.mjs <passageId> <jsonFilePath>
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import { readFileSync } from "fs";

const prisma = new PrismaClient();
const [passageId, jsonPath] = process.argv.slice(2);

if (!passageId || !jsonPath) {
  console.error("Usage: node scripts/save-analysis.mjs <passageId> <jsonFilePath>");
  process.exit(1);
}

const passage = await prisma.passage.findUnique({
  where: { id: passageId },
  select: { content: true },
});

if (!passage) {
  console.error(`Passage ${passageId} not found`);
  process.exit(1);
}

const analysisJson = readFileSync(jsonPath, "utf-8");
const contentHash = createHash("md5").update(passage.content).digest("hex");

await prisma.passageAnalysis.upsert({
  where: { passageId },
  update: {
    analysisData: analysisJson,
    contentHash,
    version: 1,
  },
  create: {
    passageId,
    analysisData: analysisJson,
    contentHash,
    version: 1,
  },
});

console.log(`Saved analysis for passage ${passageId}`);
await prisma.$disconnect();
