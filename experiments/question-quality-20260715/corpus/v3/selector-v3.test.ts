import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sha256, stableStringify } from "../selector-core";
import { finalizeAuditV3, type AuditQueueItem } from "./audit-finalizer-v3";
import { scanHistoricalExposureV3 } from "./history-v3";
import {
  blankSourceHardGateV3,
  buildCorpusV3,
  stratifiedOrderV3,
  type V3AssessedCandidate,
} from "./selector-core-v3";
import {
  V3_NEW_PASS_TARGETS,
  type V3PinnedSnapshot,
  type V3RawCandidate,
  type V3RetainedPass,
  type V3SnapshotCore,
} from "./types-v3";
import { verifyPinnedArtifactsV3 } from "./verify-v3";

function passage(label: string, sentences = 12): string {
  return Array.from(
    { length: sentences },
    (_, index) =>
      `${label} sentence ${index + 1} explains how careful readers compare evidence because the apparent conclusion may change when context reveals another important relationship between ideas and consequences.`,
  ).join(" ");
}

function evidence() {
  return {
    candidateAcademyId: null,
    priorUseScope: "ALL_ACADEMIES" as const,
    matchedPassageCount: 0,
    matchedPassageIds: [],
    questionCount: 0,
    aiQuestionCount: 0,
    workbenchJobCount: 0,
    reviewed: false,
    representativeReviewed: false,
    reviewedPassageCount: 0,
    matchedAcademyCount: 0,
  };
}

function rawCandidate(id: string, text = passage(id)): V3RawCandidate {
  return {
    id: `repo:${id}`,
    sourceRecordId: id,
    origin: "repo-official",
    text,
    reviewed: true,
    confidence: "high",
    reconstructionKind: "none",
    hasDeliberateError: false,
    document: {
      documentKey: `doc:${id}`,
      sourceKind: "OFFICIAL_EXAM_REPOSITORY",
      sourceId: id,
      year: 2025,
      round: "test",
      qNumbers: [1],
      originalType: "주제",
    },
    databaseEvidence: evidence(),
  };
}

function retained(): V3RetainedPass[] {
  const specs = [
    ["dev", "db-global", 10],
    ["dev", "repo-official", 22],
    ["holdout", "db-global", 4],
    ["holdout", "repo-official", 21],
  ] as const;
  return specs.flatMap(([split, origin, count]) =>
    Array.from({ length: count }, (_, index) => {
      const id = `retained-${split}-${origin}-${index + 1}`;
      const base = rawCandidate(id, passage(`retained ${split} ${origin} ${index + 1}`));
      const candidate: V3RawCandidate =
        origin === "repo-official"
          ? base
          : {
              ...base,
              id: `retained-dbv3:${sha256(base.text).slice(0, 24)}`,
              sourceRecordId: id,
              origin: "db-global",
              reviewed: false,
              confidence: null,
              privateDatabaseProvenance: {
                representativePassageId: id,
                representativeAcademyId: `academy-${index}`,
                matchedPassageIds: [id],
                matchedAcademyIds: [`academy-${index}`],
                reviewedAtByPassageId: { [id]: null },
              },
              databaseEvidence: {
                ...evidence(),
                matchedPassageCount: 1,
                matchedPassageIds: [id],
                matchedAcademyCount: 1,
              },
            };
      return {
        candidate,
        split,
        finalDecision: "PASS",
        keepOrDrop: "KEEP",
        grammarRichness: "ADEQUATE",
        blankSuitability: "ADEQUATE",
        independentReviewCount: 2,
      };
    }),
  );
}

function snapshot(candidates: V3RawCandidate[], forbiddenText?: string): V3PinnedSnapshot {
  const core: V3SnapshotCore = {
    schemaVersion: 3,
    asOf: "2026-07-15T00:00:00.000Z",
    seed: "test-seed",
    gitSha: "a".repeat(40),
    gitDirty: false,
    codeHash: "code",
    repoPassagesFileHash: "repo",
    historicalFilesHash: "files",
    historicalExtractHash: "extract",
    databaseExtractHash: "database",
    candidates,
    retained: retained(),
    forbiddenReferences: forbiddenText
      ? [
          {
            id: "unrelated-history",
            text: forbiddenText,
            source: "experiments/unrelated.json",
            lineage: "ANTECEDENT_ARTIFACT",
          },
        ]
      : [],
    historicalPassageIds: [],
    diagnostics: {},
  };
  return { ...core, snapshotHash: sha256(stableStringify(core)) };
}

test("v3 derived output never contaminates history while unrelated output remains blocking", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-v3-history-"));
  try {
    const unrelatedDir = path.join(root, "experiments/unrelated");
    const derivedDir = path.join(
      root,
      "experiments/question-quality-20260715/corpus/v3/private",
    );
    fs.mkdirSync(unrelatedDir, { recursive: true });
    fs.mkdirSync(derivedDir, { recursive: true });
    const unrelatedText = passage("unrelated antecedent");
    fs.writeFileSync(
      path.join(unrelatedDir, "artifact.json"),
      JSON.stringify({ arbitraryLeaf: unrelatedText }),
    );
    fs.writeFileSync(
      path.join(derivedDir, "self.json"),
      JSON.stringify({ arbitraryLeaf: passage("own campaign") }),
    );
    const first = scanHistoricalExposureV3(root, [path.join(root, "experiments")]);
    assert.equal(first.texts.length, 1);
    assert.equal(first.texts[0].text, unrelatedText);
    assert.equal(first.excludedDerivedFiles.length, 1);
    const before = { filesHash: first.filesHash, extractHash: first.extractHash };
    fs.writeFileSync(
      path.join(derivedDir, "second-self.json"),
      JSON.stringify({ arbitraryLeaf: passage("another own campaign") }),
    );
    const second = scanHistoricalExposureV3(root, [path.join(root, "experiments")]);
    assert.deepEqual(
      { filesHash: second.filesHash, extractHash: second.extractHash },
      before,
    );

    const pinned = snapshot([rawCandidate("blocked", unrelatedText)], unrelatedText);
    const result = buildCorpusV3(pinned);
    assert.equal(result.status, "HARD_FAIL_SUPPLY_SHORTAGE");
    assert.equal(
      (result.diagnostics.exclusions as { historicalExactOrNear: number })
        .historicalExactOrNear,
      1,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("same pinned selector run is byte-identical and self-contamination count is zero", () => {
  const pinned = snapshot([rawCandidate("one")]);
  const first = buildCorpusV3(pinned);
  const second = buildCorpusV3(pinned);
  if (first.status === "READY_FOR_BLIND_AUDIT" || second.status === "READY_FOR_BLIND_AUDIT") {
    throw new Error("Synthetic one-row supply unexpectedly filled v3 queues.");
  }
  assert.equal(stableStringify(first.publicReport), stableStringify(second.publicReport));
  assert.equal(
    (first.diagnostics.exclusions as { historicalExactOrNear: number })
      .historicalExactOrNear,
    0,
  );
});

test("blank hard gate rejects a blank hint when source originalType is not blank", () => {
  const candidate = rawCandidate("blank-negative");
  candidate.typeHint = "blank inference";
  candidate.reconstructionKind = "blank";
  candidate.document.originalType = "문법";
  assert.equal(blankSourceHardGateV3(candidate), false);
  candidate.document.originalType = "빈칸추론";
  assert.equal(blankSourceHardGateV3(candidate), true);
  candidate.reconstructionKind = "none";
  assert.equal(blankSourceHardGateV3(candidate), false);
});

test("stratified order is deterministic and alternates populated cells", () => {
  const base = rawCandidate("strata") as unknown as V3AssessedCandidate;
  const candidates = [
    { ...base, id: "a", contentHash: "a", strata: { ...base.strata, wordBand: "120-169", discourse: "expository" } },
    { ...base, id: "b", contentHash: "b", strata: { ...base.strata, wordBand: "120-169", discourse: "expository" } },
    { ...base, id: "c", contentHash: "c", strata: { ...base.strata, wordBand: "170-229", discourse: "argumentative" } },
    { ...base, id: "d", contentHash: "d", strata: { ...base.strata, wordBand: "170-229", discourse: "argumentative" } },
  ] as V3AssessedCandidate[];
  const first = stratifiedOrderV3(candidates, "seed", "panel");
  const second = stratifiedOrderV3(candidates, "seed", "panel");
  assert.deepEqual(first.map((item) => item.id), second.map((item) => item.id));
  assert.notEqual(first[0].strata.wordBand, first[1].strata.wordBand);
});

test("snapshot and public artifact tampering fail closed", () => {
  const pinned = snapshot([rawCandidate("tamper")]);
  const rebuilt = buildCorpusV3(pinned);
  if (rebuilt.status === "READY_FOR_BLIND_AUDIT") {
    throw new Error("Synthetic one-row supply unexpectedly filled v3 queues.");
  }
  const valid = verifyPinnedArtifactsV3(pinned, rebuilt.publicReport);
  assert.equal(valid.passed, true);
  const publicTamper = structuredClone(rebuilt.publicReport) as Record<string, unknown>;
  publicTamper.status = "PASS";
  assert.equal(verifyPinnedArtifactsV3(pinned, publicTamper).passed, false);
  const snapshotTamper = structuredClone(pinned);
  snapshotTamper.databaseExtractHash = "changed";
  assert.throws(() => verifyPinnedArtifactsV3(snapshotTamper, rebuilt.publicReport));
});

function fullAuditQueue(): AuditQueueItem[] {
  return (Object.keys(V3_NEW_PASS_TARGETS) as Array<keyof typeof V3_NEW_PASS_TARGETS>).flatMap(
    (panel) =>
      Array.from({ length: V3_NEW_PASS_TARGETS[panel] + 2 }, (_, index) => ({
        blindId: `${panel}-${index + 1}`,
        candidateId: `candidate-${panel}-${index + 1}`,
        panel,
        queueSequence: index + 1,
        origin: panel.endsWith("db") ? "db-global" : "repo-official",
        strata: { wordBand: index % 2 ? "120-169" : "170-229", discourse: index % 2 ? "expository" : "argumentative" },
      })),
  );
}

test("finalizer requires two audits, stops exactly at target, and leaves reserve unusable", () => {
  const queue = fullAuditQueue();
  const records = queue.map((item) => ({ blindId: item.blindId, finalDecision: "PASS" as const }));
  const result = finalizeAuditV3({
    queue,
    reviewA: { reviewerId: "reviewer-a", attested: true, records },
    reviewB: { reviewerId: "reviewer-b", attested: true, records },
    adjudication: [],
  });
  assert.equal(result.status, "CERTIFIED");
  for (const panel of Object.keys(V3_NEW_PASS_TARGETS) as Array<keyof typeof V3_NEW_PASS_TARGETS>) {
    assert.equal(result.certified[panel].length, V3_NEW_PASS_TARGETS[panel]);
  }
  assert.equal(result.unusableBlindIds.length, Object.keys(V3_NEW_PASS_TARGETS).length * 2);
});

test("unreviewed and unadjudicated disagreement can never become usable", () => {
  const queue = fullAuditQueue();
  const recordsA = queue.map((item, index) => ({
    blindId: item.blindId,
    finalDecision: index === 0 ? ("PASS" as const) : ("PENDING" as const),
  }));
  const recordsB = queue.map((item, index) => ({
    blindId: item.blindId,
    finalDecision: index === 0 ? ("FAIL" as const) : ("PENDING" as const),
  }));
  const result = finalizeAuditV3({
    queue,
    reviewA: { reviewerId: "reviewer-a", attested: true, records: recordsA },
    reviewB: { reviewerId: "reviewer-b", attested: true, records: recordsB },
    adjudication: [],
  });
  assert.equal(result.status, "INCOMPLETE");
  assert.ok(result.unusableBlindIds.includes(queue[0].blindId));
  assert.equal(
    (result.diagnostics as { unreviewedUsable: number }).unreviewedUsable,
    0,
  );
});
