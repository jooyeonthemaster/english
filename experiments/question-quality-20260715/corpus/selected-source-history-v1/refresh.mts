import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import nextEnv from "@next/env";

import * as selectorCoreModule from "../selector-core";
import * as selectorV3Module from "../v3/selector-core-v3";
import * as snapshotV3Module from "../v3/snapshot-v3";
import type { V3PinnedSnapshot } from "../v3/types-v3";

const selectorV3 =
  (selectorV3Module as unknown as { default?: typeof selectorV3Module })
    .default ?? selectorV3Module;
const snapshotV3 =
  (snapshotV3Module as unknown as { default?: typeof snapshotV3Module })
    .default ?? snapshotV3Module;
const { buildCorpusV3 } = selectorV3;
const { loadGlobalDatabaseV3, V3_REPO_ROOT } = snapshotV3;
const selectorCore =
  (selectorCoreModule as unknown as { default?: typeof selectorCoreModule })
    .default ?? selectorCoreModule;
const { contentHash, stableStringify } = selectorCore;
const { loadEnvConfig } = nextEnv;

type Split = "development" | "confirmatory" | "reserve";
type FocusType = "GRAMMAR_ERROR" | "BLANK_INFERENCE";

interface FrozenSelectionRow {
  frameId: string;
  contentHash: string;
  split: Split;
}

interface FrozenReconciliation {
  sourceBindingHash: string;
  selection: { rows: FrozenSelectionRow[] };
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = path.resolve(HERE, "../v3/private/input-snapshot.json");
const GRAMMAR_RECONCILIATION_PATH = path.resolve(
  HERE,
  "../cross-type-grammar-source-frame-v2/private/reconciliation-and-split-v2.json",
);
const BLANK_RECONCILIATION_PATH = path.resolve(
  HERE,
  "../cross-type-blank-source-frame-v2/private/reconciliation-and-split-v2.json",
);
const RUNS_DIR = path.join(HERE, "runs");
const PRIVATE_DIR = path.join(HERE, "private");
const LABEL_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function countBy<T extends string>(values: readonly T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

function parseArgs(): { label: string; write: boolean } {
  const args = process.argv.slice(2);
  const labelAt = args.indexOf("--label");
  const inline = args.find((arg) => arg.startsWith("--label="));
  const label = inline?.slice("--label=".length) ??
    (labelAt >= 0 ? args[labelAt + 1] : undefined);
  if (!label || !LABEL_PATTERN.test(label)) {
    throw new Error("--label must match /^[a-z0-9][a-z0-9-]{0,79}$/");
  }
  return { label, write: args.includes("--write") };
}

function writeExclusive(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, { encoding: "utf8", flag: "wx" });
}

async function main(): Promise<void> {
  const { label, write } = parseArgs();
  loadEnvConfig(V3_REPO_ROOT);

  const snapshotRaw = fs.readFileSync(SNAPSHOT_PATH, "utf8");
  const snapshot = JSON.parse(snapshotRaw) as V3PinnedSnapshot;
  const grammarRaw = fs.readFileSync(GRAMMAR_RECONCILIATION_PATH, "utf8");
  const blankRaw = fs.readFileSync(BLANK_RECONCILIATION_PATH, "utf8");
  const grammar = JSON.parse(grammarRaw) as FrozenReconciliation;
  const blank = JSON.parse(blankRaw) as FrozenReconciliation;

  const selected = [
    ...grammar.selection.rows.map((row) => ({
      ...row,
      focusType: "GRAMMAR_ERROR" as const,
    })),
    ...blank.selection.rows.map((row) => ({
      ...row,
      focusType: "BLANK_INFERENCE" as const,
    })),
  ];
  assert.equal(grammar.selection.rows.length, 38);
  assert.equal(blank.selection.rows.length, 38);
  assert.equal(selected.length, 76);
  assert.equal(new Set(selected.map((row) => row.contentHash)).size, 76);
  assert.deepEqual(countBy(selected.map((row) => row.focusType)), {
    BLANK_INFERENCE: 38,
    GRAMMAR_ERROR: 38,
  });
  assert.deepEqual(countBy(selected.map((row) => row.split)), {
    confirmatory: 40,
    development: 12,
    reserve: 24,
  });

  const frozenPool = buildCorpusV3(snapshot).selected["focus-grammar-killer"];
  const frozenByHash = new Map(frozenPool.map((row) => [row.contentHash, row]));
  for (const row of selected) {
    const frozen = frozenByHash.get(row.contentHash);
    assert.ok(frozen, `selected row ${row.frameId} is absent from the pinned pool`);
    assert.equal(contentHash(frozen.text), row.contentHash);
    assert.equal(frozen.databaseEvidence.questionCount, 0);
    assert.equal(frozen.databaseEvidence.aiQuestionCount, 0);
    assert.equal(frozen.databaseEvidence.workbenchJobCount, 0);
  }

  const database = await loadGlobalDatabaseV3();
  const currentByHash = new Map(database.groups.map((group) => [group.hash, group]));
  const privateRows = selected
    .map((row) => {
      const current = currentByHash.get(row.contentHash);
      const questionCount = current?.questionCount ?? 0;
      const aiQuestionCount = current?.aiQuestionCount ?? 0;
      const workbenchJobCount = current?.workbenchJobCount ?? 0;
      return {
        focusType: row.focusType,
        split: row.split,
        frameId: row.frameId,
        contentHash: row.contentHash,
        matchedPassageCount: current?.rows.length ?? 0,
        questionCount,
        aiQuestionCount,
        workbenchJobCount,
        historyClean:
          questionCount === 0 &&
          aiQuestionCount === 0 &&
          workbenchJobCount === 0,
      };
    })
    .sort(
      (left, right) =>
        left.focusType.localeCompare(right.focusType, "en") ||
        left.split.localeCompare(right.split, "en") ||
        left.frameId.localeCompare(right.frameId, "en"),
    );

  const capturedAt = new Date().toISOString();
  const privateCore = {
    schemaVersion: "selected-source-history-refresh-v1",
    label,
    capturedAt,
    sourceSnapshotHash: snapshot.snapshotHash,
    sourceSnapshotFileSha256: sha256(snapshotRaw),
    grammarSourceBindingHash: grammar.sourceBindingHash,
    grammarReconciliationFileSha256: sha256(grammarRaw),
    blankSourceBindingHash: blank.sourceBindingHash,
    blankReconciliationFileSha256: sha256(blankRaw),
    databaseExtractHash: database.extractHash,
    rows: privateRows,
    safety: {
      databaseReadsOnly: true,
      databaseWrites: 0,
      modelApiCalls: 0,
      fullQuestionCandidatesGenerated: 0,
      networkCallsOtherThanDatabase: 0,
    },
  };
  const privateJson = stableStringify({
    ...privateCore,
    artifactSha256: sha256(stableStringify(privateCore)),
  });
  const cleanRows = privateRows.filter((row) => row.historyClean);
  const exposedRows = privateRows.filter((row) => !row.historyClean);
  const aggregateCell = (focusType: FocusType, split: Split) => {
    const rows = privateRows.filter(
      (row) => row.focusType === focusType && row.split === split,
    );
    return {
      selectedRows: rows.length,
      currentDatabaseContentMatches: rows.filter(
        (row) => row.matchedPassageCount > 0,
      ).length,
      historyCleanRows: rows.filter((row) => row.historyClean).length,
      exposedRows: rows.filter((row) => !row.historyClean).length,
    };
  };
  const publicCore = {
    schemaVersion: "selected-source-history-refresh-public-v1",
    label,
    capturedAt,
    status:
      exposedRows.length === 0
        ? "CURRENT_DATABASE_HISTORY_CLEAN_NOT_AUTHORIZED"
        : "CURRENT_DATABASE_HISTORY_EXPOSURE_BLOCK",
    sourceSnapshotHash: snapshot.snapshotHash,
    sourceBindings: sha256(
      stableStringify({
        grammar: grammar.sourceBindingHash,
        blank: blank.sourceBindingHash,
      }),
    ),
    databaseExtractHash: database.extractHash,
    selectedRows: privateRows.length,
    historyCleanRows: cleanRows.length,
    exposedRows: exposedRows.length,
    byTypeAndSplit: Object.fromEntries(
      (["GRAMMAR_ERROR", "BLANK_INFERENCE"] as const).map((focusType) => [
        focusType,
        Object.fromEntries(
          (["development", "confirmatory", "reserve"] as const).map(
            (split) => [split, aggregateCell(focusType, split)],
          ),
        ),
      ]),
    ),
    databaseDiagnostics: database.diagnostics,
    privacy: {
      containsPassageText: false,
      containsFrameIds: false,
      containsContentHashes: false,
      containsDatabaseIds: false,
      containsAcademyIds: false,
    },
    interpretation: {
      mutableScope:
        "Current production DB normalized-content matches and all Question/WorkbenchAiJob rows across academies.",
      antecedentRepositoryHistory:
        "Already sealed in the pinned v3 snapshot; prospective campaign artifacts are not relabelled as antecedent exposure.",
      authorization:
        "This refresh never authorizes generation; rights, provider/key/cost, operational queue and independent audit remain required.",
    },
    safety: privateCore.safety,
  };
  const publicJson = stableStringify({
    ...publicCore,
    privateArtifactSha256: sha256(privateJson),
    artifactSha256: sha256(stableStringify(publicCore)),
  });
  const scriptHash = sha256(fs.readFileSync(fileURLToPath(import.meta.url)));
  const manifest = [
    `${sha256(publicJson)}  runs/${label}-public.json`,
    `${sha256(privateJson)}  private/${label}-private.json`,
    `${scriptHash}  refresh.mts`,
    `${sha256(snapshotRaw)}  ../v3/private/input-snapshot.json`,
    `${sha256(grammarRaw)}  ../cross-type-grammar-source-frame-v2/private/reconciliation-and-split-v2.json`,
    `${sha256(blankRaw)}  ../cross-type-blank-source-frame-v2/private/reconciliation-and-split-v2.json`,
    "",
  ].join("\n");

  if (write) {
    writeExclusive(path.join(RUNS_DIR, `${label}-public.json`), publicJson);
    writeExclusive(path.join(PRIVATE_DIR, `${label}-private.json`), privateJson);
    writeExclusive(path.join(RUNS_DIR, `${label}-MANIFEST.sha256`), manifest);
  }
  process.stdout.write(publicJson);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
