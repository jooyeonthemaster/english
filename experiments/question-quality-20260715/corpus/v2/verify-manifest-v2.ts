import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sha256, stableStringify } from "../selector-core";
import {
  NearDuplicateIndex,
  type PanelName,
  type V2AssessedCandidate,
} from "./selector-core-v2";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_PATH = path.join(HERE, "manifest-public.json");
const PRIVATE_PATH = path.join(HERE, "private/manifest-private.json");
const HISTORY_PATH = path.join(HERE, "historical-exposure-public.json");

interface PublicRow {
  id: string;
  panel: PanelName;
  queueRole: string;
  origin: "repo-official" | "db-real";
  contentHash: string;
  comparisonHash: string;
  automaticStatus: string;
  historicalExposure: Record<string, unknown>;
  manualAudit: Record<string, unknown>;
  sourceDocument: V2AssessedCandidate["document"];
  strata: V2AssessedCandidate["strata"];
  features: V2AssessedCandidate["features"];
  wordCount: number;
}

interface PrivateRow extends PublicRow {
  passageContent: string;
  databaseEvidence: V2AssessedCandidate["databaseEvidence"];
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function main(): void {
  const publicRaw = fs.readFileSync(PUBLIC_PATH, "utf8");
  const historyRaw = fs.readFileSync(HISTORY_PATH, "utf8");
  const publicManifest = JSON.parse(publicRaw) as {
    panels: Record<PanelName, PublicRow[]>;
  };
  const privateManifest = readJson<{
    publicManifestSha256: string;
    panels: Record<PanelName, PrivateRow[]>;
  }>(PRIVATE_PATH);

  assert.equal(privateManifest.publicManifestSha256, sha256(stableStringify(publicManifest)));
  const publicRows = Object.values(publicManifest.panels).flat();
  const privateRows = Object.values(privateManifest.panels).flat();
  assert.equal(publicRows.length, privateRows.length);
  assert.deepEqual(publicRows.map((row) => row.id), privateRows.map((row) => row.id));

  const ids = new Set<string>();
  const hashes = new Set<string>();
  const comparisonHashes = new Set<string>();
  const nearIndex = new NearDuplicateIndex();
  for (const row of privateRows) {
    assert.ok(!ids.has(row.id), `duplicate id: ${row.id}`);
    assert.ok(!hashes.has(row.contentHash), `duplicate content hash: ${row.id}`);
    assert.ok(!comparisonHashes.has(row.comparisonHash), `duplicate comparison hash: ${row.id}`);
    ids.add(row.id);
    hashes.add(row.contentHash);
    comparisonHashes.add(row.comparisonHash);

    assert.ok(!publicRaw.includes(row.passageContent), `private passage leaked to public: ${row.id}`);
    assert.ok(!historyRaw.includes(row.passageContent), `private passage leaked to history public: ${row.id}`);
    const assessed = {
      ...row,
      text: row.passageContent,
      document: row.sourceDocument,
      integrityFlags: [],
      candidateOnly: undefined,
    } as unknown as V2AssessedCandidate;
    const duplicate = nearIndex.query(assessed);
    assert.equal(duplicate, null, `near duplicate ${row.id}: ${JSON.stringify(duplicate)}`);
    nearIndex.add({
      id: row.id,
      text: row.passageContent,
      source: row.panel,
      document: row.sourceDocument,
    });

    if (row.queueRole !== "RETAINED_PASS") {
      assert.equal(row.automaticStatus, "CLEAN_CANDIDATE");
      assert.equal(row.manualAudit.status, "PENDING");
      assert.equal(row.manualAudit.requiredIndependentReviews, 2);
      assert.equal(row.manualAudit.usableForGeneration, false);
      assert.equal(row.historicalExposure.artifactPassageIdOccurrences, 0);
      assert.equal(row.historicalExposure.artifactExactOrNearTextMatches, 0);
      assert.equal(row.historicalExposure.dbContentQuestionCount, 0);
      assert.equal(row.historicalExposure.dbContentAiQuestionCount, 0);
      assert.equal(row.historicalExposure.dbContentWorkbenchJobCount, 0);
      assert.equal(row.historicalExposure.dbPriorUseScope, "ALL_ACADEMIES");
    }
  }

  const grammar = publicManifest.panels["focus-grammar-killer"];
  const blank = publicManifest.panels["focus-blank-killer"];
  assert.equal(grammar.length, 165);
  assert.equal(blank.length, 143);
  assert.equal(grammar.filter((row) => row.queueRole === "PRIMARY_CANDIDATE").length, 60);
  assert.equal(blank.filter((row) => row.queueRole === "PRIMARY_CANDIDATE").length, 60);
  assert.ok(grammar.every((row) => row.strata.grammarSuitability === "rich"));
  assert.ok(blank.every((row) => row.strata.blankSuitability === "central-span"));
  assert.ok(blank.every((row) => row.sourceDocument.originalType === "빈칸추론"));
  assert.equal(publicManifest.panels["general-dev-retained"].length, 32);
  assert.equal(publicManifest.panels["general-holdout-retained"].length, 25);
  assert.equal(publicManifest.panels["general-dev-replacement"].length, 53);
  assert.equal(publicManifest.panels["general-holdout-replacement"].length, 84);

  const forbiddenPublicKeys: string[] = [];
  const visit = (value: unknown, location: string) => {
    if (Array.isArray(value)) value.forEach((child, index) => visit(child, `${location}[${index}]`));
    else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (["text", "content", "passageContent"].includes(key)) forbiddenPublicKeys.push(`${location}.${key}`);
        visit(child, `${location}.${key}`);
      }
    }
  };
  visit(publicManifest, "$public");
  visit(JSON.parse(historyRaw), "$history");
  assert.deepEqual(forbiddenPublicKeys, []);

  process.stdout.write(
    stableStringify({
      passed: true,
      selectedRows: publicRows.length,
      panels: Object.fromEntries(
        Object.entries(publicManifest.panels).map(([panel, rows]) => [panel, rows.length]),
      ),
      pairwiseExactAndNearDuplicateMatches: 0,
      newCandidatePriorExposureViolations: 0,
      publicPassageLeaks: 0,
    }),
  );
}

main();
