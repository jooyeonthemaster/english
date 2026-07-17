import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { stableStringify } from "../selector-core";
import { scanHistoricalExposure } from "./history-index";
import { writeExclusive } from "./select-corpus-v2";
import {
  buildCorpusV2,
  NearDuplicateIndex,
  type SourceDocumentMetadata,
  type V2BuildInput,
  type V2RawCandidate,
} from "./selector-core-v2";

const uniqueWords = [
  "amber",
  "birch",
  "cedar",
  "delta",
  "elm",
  "frost",
  "grove",
  "harbor",
  "island",
  "juniper",
  "kernel",
  "lagoon",
  "meadow",
  "nectar",
  "orchard",
  "prairie",
  "quartz",
  "river",
  "summit",
  "timber",
  "upland",
  "valley",
  "willow",
  "xenon",
  "yarrow",
  "zephyr",
];

function passage(index: number, words = 240): string {
  const token = uniqueWords[index % uniqueWords.length];
  const sentences: string[] = [];
  let cursor = 0;
  while ((sentences.join(" ").match(/[A-Za-z]+/g)?.length ?? 0) < words) {
    const pivot = cursor % 2 === 0 ? "However" : "Therefore";
    sentences.push(
      `${pivot}, ${token} researchers ${token} who ${token} examine ${token} evidence ${token} argue ${token} that ${token} systems ${token} are ${token} connected ${token} to ${token} choices, although ${token} being ${token} careful ${token} is ${token} not only ${token} useful but ${token} necessary when ${token} conclusions are ${token} revised.`,
    );
    cursor += 1;
  }
  return sentences.join(" ");
}

function document(index: number, originalType = "grammar"): SourceDocumentMetadata {
  return {
    documentKey: `doc-${index}`,
    sourceKind: "OFFICIAL_EXAM_REPOSITORY",
    sourceId: `exam-${index}`,
    year: 2020 + (index % 5),
    round: "mock",
    qNumbers: [20 + index],
    originalType,
  };
}

function candidate(
  index: number,
  originalType: "grammar" | "blank" = "grammar",
  overrides: Partial<V2RawCandidate> = {},
): V2RawCandidate {
  return {
    id: `repo:test-${index}`,
    origin: "repo-official",
    text: passage(index),
    sourceKind: "EXAM",
    typeHint: originalType,
    confidence: "high",
    reconstructionKind: "none",
    hasDeliberateError: false,
    reviewed: true,
    priorGeneratedQuestions: 0,
    priorWorkbenchJobs: 0,
    document: document(index, originalType),
    databaseEvidence: {
      candidateAcademyId: "academy-test",
      priorUseScope: "ALL_ACADEMIES",
      matchedPassageCount: 0,
      matchedPassageIds: [],
      questionCount: 0,
      aiQuestionCount: 0,
      workbenchJobCount: 0,
      reviewed: true,
    },
    ...overrides,
  };
}

function tinyTargets(overrides: Partial<V2BuildInput["targets"]> = {}): V2BuildInput["targets"] {
  return {
    generalDevMissing: 0,
    generalHoldoutMissing: 0,
    generalDevObservedPass: { passed: 1, audited: 1 },
    generalHoldoutObservedPass: { passed: 1, audited: 1 },
    focusGrammarPrimary: 0,
    focusGrammarObservedPass: { passed: 1, eligible: 1 },
    focusBlankPrimary: 0,
    focusBlankObservedPass: { passed: 1, eligible: 1 },
    ...overrides,
  };
}

function build(
  candidates: V2RawCandidate[],
  options: Partial<Pick<V2BuildInput, "forbiddenReferences" | "historicalPassageIds" | "targets" | "seed">> = {},
) {
  return buildCorpusV2({
    candidates,
    retained: [],
    forbiddenReferences: options.forbiddenReferences ?? [],
    historicalPassageIds: options.historicalPassageIds ?? new Set(),
    targets: options.targets ?? tinyTargets(),
    seed: options.seed ?? "v2-test-seed",
  });
}

test("selection is seed deterministic and every panel is exact/near-cluster disjoint", () => {
  const candidates = Array.from({ length: 14 }, (_, index) =>
    candidate(index, index % 2 === 0 ? "grammar" : "blank"),
  );
  const targets = tinyTargets({
    generalDevMissing: 2,
    generalHoldoutMissing: 2,
    focusGrammarPrimary: 2,
    focusBlankPrimary: 2,
  });
  const first = build(candidates, { targets });
  const second = build(candidates, { targets });
  assert.equal(stableStringify(first.publicManifest), stableStringify(second.publicManifest));

  const all = Object.values(first.selected).flat();
  assert.equal(all.length, new Set(all.map((item) => item.contentHash)).size);
  assert.equal(all.length, new Set(all.map((item) => item.id)).size);
});

test("exact historical content and passage ID exposure are hard exclusions", () => {
  const exact = candidate(1);
  const byId = candidate(2);
  const safe = candidate(3);
  const result = build([exact, byId, safe], {
    forbiddenReferences: [{ id: "old", text: exact.text, source: "old-result.json" }],
    historicalPassageIds: new Set([byId.id, byId.id.replace("repo:", "")]),
    targets: tinyTargets({ focusGrammarPrimary: 1 }),
  });
  assert.deepEqual(result.selected["focus-grammar-killer"].map((item) => item.id), [safe.id]);
});

test("source-range and sequential-document overlap catch duplicates without relying on 5-token Jaccard", () => {
  const shared = "the archival record preserves a long sequence whose unusual wording remains stable across both extracted fragments";
  const leftText = `${passage(4)} ${shared}.`;
  const rightText = `${shared}. ${passage(5)}`;
  const left = candidate(4, "grammar", {
    text: leftText,
    document: { ...document(77), qNumbers: [31] },
  });
  const right = candidate(5, "grammar", {
    text: rightText,
    document: { ...document(77), qNumbers: [32] },
  });
  const index = new NearDuplicateIndex();
  index.add({ id: "prior-fragment", text: left.text, source: "prior", document: left.document });
  const evidence = index.query({
    ...right,
    ...({
      contentHash: "unused",
      wordCount: 175,
      strata: {
        source: "official-exam",
        wordBand: "170-229",
        discourse: "expository",
        topic: "humanities",
        grammarSuitability: "rich",
        blankSuitability: "central-span",
      },
      features: {
        sentenceCount: 8,
        hasReferents: true,
        hasDiscoursePivot: true,
        grammarSignalKinds: 4,
        grammarSignalCount: 8,
      },
      integrityFlags: [],
      automaticStatus: "CLEAN_CANDIDATE",
    } as const),
  });
  assert.equal(evidence?.code, "SEQUENTIAL_DOCUMENT_FRAGMENT");
  assert.ok((evidence?.fiveGramJaccard ?? 1) < 0.45);
});

test("focus panels enforce type suitability and zero prior exposure evidence", () => {
  const grammar = candidate(6, "grammar");
  const blank = candidate(7, "blank", { reconstructionKind: "blank" });
  const result = build([grammar, blank], {
    targets: tinyTargets({ focusGrammarPrimary: 1, focusBlankPrimary: 1 }),
  });
  assert.equal(result.selected["focus-grammar-killer"].length, 1);
  assert.equal(result.selected["focus-blank-killer"].length, 1);
  assert.equal(result.selected["focus-grammar-killer"][0].strata.grammarSuitability, "rich");
  assert.equal(result.selected["focus-blank-killer"][0].strata.blankSuitability, "central-span");
  assert.equal(result.selected["focus-blank-killer"][0].reconstructionKind, "blank");

  const manifest = result.publicManifest as { panels: Record<string, Array<Record<string, unknown>>> };
  for (const row of [
    ...manifest.panels["focus-grammar-killer"],
    ...manifest.panels["focus-blank-killer"],
  ]) {
    const exposure = row.historicalExposure as Record<string, number>;
    assert.equal(exposure.artifactPassageIdOccurrences, 0);
    assert.equal(exposure.artifactExactOrNearTextMatches, 0);
    assert.equal(exposure.dbContentQuestionCount, 0);
    assert.equal(exposure.dbContentWorkbenchJobCount, 0);
    assert.deepEqual(row.manualAudit, {
      status: "PENDING",
      requiredIndependentReviews: 2,
      adjudicationRequired: true,
      usableForGeneration: false,
    });
  }
});

test("DB reviewed plus content-level zero prior rule has no relaxed fallback", () => {
  const unreviewedDb = candidate(8, "grammar", {
    id: "db-unreviewed",
    origin: "db-real",
    confidence: undefined,
    reconstructionKind: undefined,
    reviewed: false,
    databaseEvidence: {
      ...candidate(8).databaseEvidence,
      reviewed: false,
    },
  });
  const usedRepo = candidate(9, "grammar", {
    databaseEvidence: {
      ...candidate(9).databaseEvidence,
      matchedPassageCount: 2,
      questionCount: 1,
      workbenchJobCount: 1,
    },
  });
  const noDbProof = candidate(10, "grammar", {
    databaseEvidence: {
      ...candidate(10).databaseEvidence,
      priorUseScope: null,
    },
  });
  const result = build([unreviewedDb, usedRepo, noDbProof], {
    targets: tinyTargets({ focusGrammarPrimary: 1 }),
  });
  assert.equal(result.selected["focus-grammar-killer"].length, 0);
  const diagnostics = result.diagnostics as { shortfalls: Record<string, number> };
  assert.equal(diagnostics.shortfalls["focus-grammar-killer"], 1);
});

test("high-confidence blank restoration is isolated to blank focus, never general or grammar", () => {
  const restoredBlank = candidate(15, "blank", { reconstructionKind: "blank" });
  const result = build([restoredBlank], {
    targets: tinyTargets({ generalDevMissing: 1, focusGrammarPrimary: 1, focusBlankPrimary: 0 }),
  });
  assert.equal(result.selected["general-dev-replacement"].length, 0);
  assert.equal(result.selected["focus-grammar-killer"].length, 0);
});

test("shortfalls are reported rather than relaxing review, exposure, or suitability gates", () => {
  const result = build([candidate(11)], {
    targets: tinyTargets({ focusGrammarPrimary: 3 }),
  });
  const diagnostics = result.diagnostics as { shortfalls: Record<string, number> };
  assert.equal(result.selected["focus-grammar-killer"].length, 1);
  assert.equal(diagnostics.shortfalls["focus-grammar-killer"], 2);
});

test("public manifest contains no passage text/content field or private sentinel", () => {
  const sentinel = "PRIVATE_SENTINEL_MAPLE_ORBIT";
  const item = candidate(12, "grammar", { text: `${passage(12)} ${sentinel}.` });
  const result = build([item], { targets: tinyTargets({ focusGrammarPrimary: 1 }) });
  const serialized = stableStringify(result.publicManifest);
  assert.ok(!serialized.includes(sentinel));
  const forbiddenKeys: string[] = [];
  const visit = (value: unknown, location: string) => {
    if (Array.isArray(value)) value.forEach((child, index) => visit(child, `${location}[${index}]`));
    else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (["text", "content", "passageContent"].includes(key)) forbiddenKeys.push(`${location}.${key}`);
        visit(child, `${location}.${key}`);
      }
    }
  };
  visit(result.publicManifest, "$public");
  assert.deepEqual(forbiddenKeys, []);
});

test("historical scanner indexes IDs, original passages, and rendered variants deterministically", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-v2-history-"));
  try {
    const root = path.join(temp, "repo");
    const experiments = path.join(root, "experiments");
    fs.mkdirSync(experiments, { recursive: true });
    fs.writeFileSync(
      path.join(experiments, "result.json"),
      JSON.stringify({ passageId: "repo:test-history", passageText: passage(13), note: "short" }),
    );
    fs.writeFileSync(
      path.join(experiments, "rendered.jsonl"),
      `${JSON.stringify({ sourcePassageId: "test-render", passageWithBlank: passage(14).replace("evidence", "_____") })}\n`,
    );
    fs.writeFileSync(path.join(experiments, "bad.jsonl"), "{not json}\n");
    const first = scanHistoricalExposure(root, [experiments]);
    const second = scanHistoricalExposure(root, [experiments]);
    assert.equal(stableStringify({ texts: first.texts, ids: first.ids }), stableStringify({ texts: second.texts, ids: second.ids }));
    assert.equal(first.texts.length, 2);
    assert.ok(first.uniquePassageIds.has("test-history"));
    assert.ok(first.uniquePassageIds.has("test-render"));
    assert.equal(first.parseFailures.length, 1);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("exclusive writer refuses a second manifest write and preserves the first bytes", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-v2-write-"));
  try {
    const output = path.join(temp, "manifest-public.json");
    writeExclusive([[output, { version: 1 }]]);
    const before = fs.readFileSync(output, "utf8");
    assert.throws(() => writeExclusive([[output, { version: 2 }]]), /Refusing to overwrite/);
    assert.equal(fs.readFileSync(output, "utf8"), before);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
