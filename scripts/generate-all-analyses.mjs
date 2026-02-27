/**
 * Batch generate AI passage analyses for all passages.
 * Processes in parallel batches with rate limiting.
 *
 * Usage: node scripts/generate-all-analyses.mjs
 */

import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const prisma = new PrismaClient();
const CONCURRENCY = 3; // Number of parallel requests
const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

function hashContent(content) {
  return createHash("md5").update(content).digest("hex");
}

async function main() {
  // 1. Get all passages with their analysis status
  const passages = await prisma.passage.findMany({
    select: {
      id: true,
      title: true,
      content: true,
      analysis: { select: { contentHash: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // 2. Filter out passages that already have valid cached analysis
  const needsAnalysis = passages.filter((p) => {
    if (!p.analysis) return true;
    const currentHash = hashContent(p.content);
    return p.analysis.contentHash !== currentHash;
  });

  console.log(`\n=== Passage Analysis Batch Generator ===`);
  console.log(`Total passages: ${passages.length}`);
  console.log(`Already analyzed: ${passages.length - needsAnalysis.length}`);
  console.log(`Need analysis: ${needsAnalysis.length}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`API URL: ${BASE_URL}`);
  console.log(`=========================================\n`);

  if (needsAnalysis.length === 0) {
    console.log("All passages already have valid analyses. Done!");
    await prisma.$disconnect();
    return;
  }

  let completed = 0;
  let failed = 0;
  const errors = [];

  // 3. Process in batches
  for (let i = 0; i < needsAnalysis.length; i += CONCURRENCY) {
    const batch = needsAnalysis.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (passage) => {
        const startTime = Date.now();
        try {
          const res = await fetch(
            `${BASE_URL}/api/ai/passage-analysis/${passage.id}`
          );
          if (!res.ok) {
            const body = await res.text();
            throw new Error(`HTTP ${res.status}: ${body}`);
          }
          const data = await res.json();
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          return { id: passage.id, title: passage.title, elapsed, cached: data.cached };
        } catch (err) {
          throw { id: passage.id, title: passage.title, error: err.message };
        }
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        completed++;
        const r = result.value;
        console.log(
          `[${completed + failed}/${needsAnalysis.length}] ✓ ${r.title} (${r.elapsed}s${r.cached ? ", cached" : ""})`
        );
      } else {
        failed++;
        const e = result.reason;
        errors.push(e);
        console.log(
          `[${completed + failed}/${needsAnalysis.length}] ✗ ${e.title}: ${e.error}`
        );
      }
    }

    // Brief pause between batches to avoid rate limiting
    if (i + CONCURRENCY < needsAnalysis.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`Completed: ${completed}`);
  console.log(`Failed: ${failed}`);
  if (errors.length > 0) {
    console.log(`\nFailed passages:`);
    errors.forEach((e) => console.log(`  - ${e.title}: ${e.error}`));
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
