import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

type Json = Record<string, unknown>;

const repoRoot = resolve(process.cwd());
const sourceDir = join(
  repoRoot,
  "experiments/grammar-quality-20260714/x/w3-triple-ladder",
);
const outDir = join(
  repoRoot,
  "experiments/question-quality-20260715/reviews/premium-grammar-60",
);

const sources = [
  { run: "R1", file: "results-run1-100pct.jsonl" },
  { run: "R2", file: "results.jsonl" },
] as const;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function readJsonl(path: string): Json[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as Json;
      } catch (error) {
        throw new Error(`Invalid JSONL at ${path}:${index + 1}: ${String(error)}`);
      }
    });
}

const candidates = sources.flatMap(({ run, file }) =>
  readJsonl(join(sourceDir, file)).map((row, sourceIndex) => {
    const question = row.question as Json | undefined;
    if (!question || row.ok !== true) {
      throw new Error(`${file}:${sourceIndex + 1} is not a successful question`);
    }
    const sourceKey = `${run}:${String(sourceIndex + 1).padStart(2, "0")}`;
    const sourceRowHash = sha256(JSON.stringify(row));
    return {
      sourceKey,
      sourceFile: file,
      sourceIndex: sourceIndex + 1,
      sourceRowHash,
      row,
      sortKey: sha256(`premium-grammar-60-blind-order-v1\0${sourceKey}\0${sourceRowHash}`),
    };
  }),
);

if (candidates.length !== 60) {
  throw new Error(`Expected exactly 60 candidates, got ${candidates.length}`);
}

candidates.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

const blindItems = candidates.map((candidate, index) => {
  const question = candidate.row.question as Json;
  return {
    itemId: `PG${String(index + 1).padStart(3, "0")}`,
    difficulty: candidate.row.difficulty,
    direction: question.direction,
    passageWithMarkers: question.passageWithMarkers,
    options: question.options,
  };
});

const sealedItems = candidates.map((candidate, index) => ({
  itemId: `PG${String(index + 1).padStart(3, "0")}`,
  sourceKey: candidate.sourceKey,
  sourceFile: candidate.sourceFile,
  sourceIndex: candidate.sourceIndex,
  sourceRowHash: candidate.sourceRowHash,
  passageId: candidate.row.passageId,
  fullCandidate: candidate.row,
}));

const duplicatePassageClusters = Object.entries(
  sealedItems.reduce<Record<string, string[]>>((acc, item) => {
    const key = String(item.passageId);
    (acc[key] ??= []).push(item.itemId);
    return acc;
  }, {}),
).map(([passageId, itemIds]) => ({ passageId, itemIds }));

if (
  duplicatePassageClusters.length !== 30 ||
  duplicatePassageClusters.some((cluster) => cluster.itemIds.length !== 2)
) {
  throw new Error("Expected 30 passage clusters with exactly two generated items each");
}

const manifest = {
  schemaVersion: 1,
  purpose:
    "Independent re-evaluation of the two claimed 30/30 PREMIUM grammar ladder runs",
  generatedAt: new Date().toISOString(),
  sourceFiles: sources.map(({ run, file }) => ({
    run,
    file: `experiments/grammar-quality-20260714/x/w3-triple-ladder/${file}`,
    fileSha256: sha256(readFileSync(join(sourceDir, file), "utf8")),
  })),
  itemCount: blindItems.length,
  independentPassageClusterCount: duplicatePassageClusters.length,
  warning:
    "The 60 items are two repeated generations over the same 30 passages, not 60 independent passages.",
  blindPacketSha256: sha256(`${JSON.stringify(blindItems, null, 2)}\n`),
  duplicatePassageClusters,
  items: sealedItems,
};

mkdirSync(outDir, { recursive: true });
const blindJson = `${JSON.stringify(blindItems, null, 2)}\n`;
writeFileSync(join(outDir, "blind-items.json"), blindJson, "utf8");
writeFileSync(
  join(outDir, "sealed-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

process.stdout.write(
  `${JSON.stringify(
    {
      blindItems: blindItems.length,
      passageClusters: duplicatePassageClusters.length,
      blindPacketSha256: manifest.blindPacketSha256,
      outDir,
    },
    null,
    2,
  )}\n`,
);
