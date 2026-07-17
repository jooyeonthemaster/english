import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ACTIVE_UI_TYPES,
  assessCandidate,
  buildCorpus,
  contentHash,
  type RawCandidate,
  stableStringify,
} from "./selector-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const topicWords = [
  "philosophy ethics memory language meaning", 
  "society market policy community education", 
  "biology science species energy climate", 
  "artist music painting culture museum", 
  "yesterday she walked suddenly felt remembered",
];
const pivots = ["However", "Therefore", "In contrast", "Consequently", "For this reason"];

function prose(index: number, words = 180): string {
  const lead = `${topicWords[index % topicWords.length]} case ${index}`;
  const sentences: string[] = [];
  let cursor = 0;
  while ((sentences.join(" ").match(/[A-Za-z]+/g)?.length ?? 0) < words) {
    const pivot = pivots[(index + cursor) % pivots.length];
    sentences.push(
      `${pivot}, ${lead} can shape what people understand because the evidence that researchers examine is connected to the choices they make in a changing context.`,
    );
    cursor += 1;
  }
  return sentences.join(" ");
}

function fixtures(origin: RawCandidate["origin"], count: number, offset = 0): RawCandidate[] {
  const sourceKinds = ["EXAM", "TEXTBOOK", "HANDOUT", "OTHER"];
  return Array.from({ length: count }, (_, localIndex) => {
    const index = localIndex + offset;
    const bands = [145, 195, 275];
    return {
      id: `${origin}-${index}`,
      origin,
      text: prose(index, bands[index % bands.length]),
      title: topicWords[index % topicWords.length],
      sourceKind: origin === "repo-official" ? "EXAM" : sourceKinds[index % sourceKinds.length],
      typeHint: index % 5 === 4 ? "narrative story" : index % 7 === 0 ? "argument" : "expository",
      reviewed: index % 3 !== 0,
      priorGeneratedQuestions: index % 4 === 0 ? 1 : 0,
      priorWorkbenchJobs: index % 5 === 0 ? 1 : 0,
      confidence: origin === "repo-official" ? "high" : undefined,
      reconstructionKind: origin === "repo-official" ? "none" : undefined,
    };
  });
}

test("selection and schedules are deterministic for identical inputs", () => {
  const input = {
    repo: fixtures("repo-official", 16),
    db: fixtures("db-real", 16, 100),
    excludedHashes: new Set<string>(),
    seed: "determinism-test",
    targets: { perOriginPerSplit: 4, robustness: 0 },
  };
  const first = buildCorpus(input);
  const second = buildCorpus(input);
  assert.equal(stableStringify(first.publicManifest), stableStringify(second.publicManifest));
  assert.equal(stableStringify(first.scheduleTemplate), stableStringify(second.scheduleTemplate));
});

test("excluded hashes and ids never enter either split", () => {
  const repo = fixtures("repo-official", 12);
  const db = fixtures("db-real", 12, 100);
  const excludedHash = contentHash(repo[0].text);
  const excludedId = db[0].id;
  const result = buildCorpus({
    repo,
    db,
    excludedHashes: new Set([excludedHash]),
    excludedIds: new Set([excludedId]),
    targets: { perOriginPerSplit: 2, robustness: 0 },
  });
  const selected = [...result.selected.dev, ...result.selected.holdout];
  assert.ok(selected.every((item) => item.contentHash !== excludedHash));
  assert.ok(selected.every((item) => item.id !== excludedId));
});

test("duplicate normalized content is removed across origins", () => {
  const repo = fixtures("repo-official", 12);
  const db = fixtures("db-real", 12, 100);
  db[0] = { ...db[0], text: `  ${repo[0].text.replace(/ /g, "  ")}  ` };
  const result = buildCorpus({
    repo,
    db,
    excludedHashes: new Set(),
    targets: { perOriginPerSplit: 2, robustness: 0 },
  });
  const hashes = [...result.selected.dev, ...result.selected.holdout].map((item) => item.contentHash);
  assert.equal(hashes.length, new Set(hashes).size);
  const diagnostic = result.diagnostics.deduplication as Record<string, number>;
  assert.ok(diagnostic.dbExcludedOrRepoHashCollision >= 1);
});

test("dev and holdout are nonoverlapping and retain bounded stratum concentration", () => {
  const result = buildCorpus({
    repo: fixtures("repo-official", 30),
    db: fixtures("db-real", 30, 100),
    excludedHashes: new Set(),
    targets: { perOriginPerSplit: 6, robustness: 0 },
  });
  const devHashes = new Set(result.selected.dev.map((item) => item.contentHash));
  assert.ok(result.selected.holdout.every((item) => !devHashes.has(item.contentHash)));
  for (const split of [result.selected.dev, result.selected.holdout]) {
    assert.equal(split.filter((item) => item.origin === "repo-official").length, 6);
    assert.equal(split.filter((item) => item.origin === "db-real").length, 6);
    const maxWordBand = Math.max(
      ...["120-169", "170-229", "230-360"].map(
        (band) => split.filter((item) => item.strata.wordBand === band).length,
      ),
    );
    assert.ok(maxWordBand / split.length <= 0.6);
    assert.ok(new Set(split.map((item) => item.strata.topic)).size >= 3);
    assert.ok(new Set(split.map((item) => item.strata.discourse)).size >= 2);
  }
});

test("schedule covers 25 x 2 x 3 and rotates instead of pinning passage zero", () => {
  const result = buildCorpus({
    repo: fixtures("repo-official", 20),
    db: fixtures("db-real", 20, 100),
    excludedHashes: new Set(),
    targets: { perOriginPerSplit: 5, robustness: 0 },
  });
  const schedule = result.scheduleTemplate as {
    dev: { cells: Array<{ passageId: string }> };
  };
  assert.equal(schedule.dev.cells.length, ACTIVE_UI_TYPES.length * 2 * 3);
  assert.ok(new Set(schedule.dev.cells.map((cell) => cell.passageId)).size >= 5);
  const counts = new Map<string, number>();
  for (const cell of schedule.dev.cells) counts.set(cell.passageId, (counts.get(cell.passageId) ?? 0) + 1);
  assert.ok(Math.max(...counts.values()) < schedule.dev.cells.length / 2);
});

test("public structures contain no passage text or content fields", () => {
  const sentinel = "PRIVATE_DB_SENTINEL_DO_NOT_LEAK";
  const repo = fixtures("repo-official", 12);
  const db = fixtures("db-real", 12, 100);
  db[0] = { ...db[0], text: `${prose(777, 180)} ${sentinel}` };
  const result = buildCorpus({
    repo,
    db,
    excludedHashes: new Set(),
    targets: { perOriginPerSplit: 2, robustness: 0 },
  });
  const publicJson = stableStringify({
    publicManifest: result.publicManifest,
    robustnessQueue: result.robustnessQueue,
    scheduleTemplate: result.scheduleTemplate,
  });
  assert.ok(!publicJson.includes(sentinel));
  const forbiddenKeys: string[] = [];
  const visit = (value: unknown, pathParts: string[]) => {
    if (Array.isArray(value)) value.forEach((child, index) => visit(child, [...pathParts, String(index)]));
    else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (key === "text" || key === "content") forbiddenKeys.push([...pathParts, key].join("."));
        visit(child, [...pathParts, key]);
      }
    }
  };
  visit(result.publicManifest, ["publicManifest"]);
  visit(result.robustnessQueue, ["robustnessQueue"]);
  visit(result.scheduleTemplate, ["scheduleTemplate"]);
  assert.deepEqual(forbiddenKeys, []);
});

test("obvious corruption is queued rather than certified clean", () => {
  const corrupted = assessCandidate({
    id: "bad",
    origin: "db-real",
    text: `${prose(1, 180)} .. <<< template >>>`,
  });
  assert.equal(corrupted.automaticStatus, "ROBUSTNESS_CANDIDATE");
  assert.ok(corrupted.integrityFlags.some((flag) => flag.code === "PUNCTUATION_CORRUPTION"));
  assert.ok(corrupted.integrityFlags.some((flag) => flag.code === "MODEL_OR_DELIMITER_ARTIFACT"));
});

test("written public manifest never contains any private DB passage text", () => {
  const publicPath = path.join(HERE, "manifest-public.json");
  const privatePath = path.join(HERE, "private/manifest-private.json");
  if (!fs.existsSync(publicPath) || !fs.existsSync(privatePath)) return;
  const publicText = fs.readFileSync(publicPath, "utf8");
  const privateManifest = JSON.parse(fs.readFileSync(privatePath, "utf8")) as {
    splits: { dev: Array<{ origin: string; content: string }>; holdout: Array<{ origin: string; content: string }> };
  };
  const dbTexts = [...privateManifest.splits.dev, ...privateManifest.splits.holdout]
    .filter((item) => item.origin === "db-real")
    .map((item) => item.content);
  for (const text of dbTexts) assert.ok(!publicText.includes(text));
});
