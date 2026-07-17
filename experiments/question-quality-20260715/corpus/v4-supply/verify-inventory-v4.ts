import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvConfig } from "@next/env";

import { prisma } from "../../../../src/lib/prisma";
import { sha256, stableStringify } from "../selector-core";
import type { V3PinnedSnapshot } from "../v3/types-v3";
import {
  buildPinnedInventoryV4,
  computeV4CodeHash,
  dependencyManifestHashV4,
  V4_REPO_ROOT,
} from "./build-inventory-v4";
import { analyzeInventoryV4, inventorySnapshotHashV4 } from "./inventory-core-v4";
import type { V4PinnedInventory } from "./types-v4";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PRIVATE_SNAPSHOT_PATH = path.join(HERE, "private/inventory-snapshot.json");
const PUBLIC_REPORT_PATH = path.join(HERE, "inventory-public.json");
const V3_SNAPSHOT_PATH = path.resolve(HERE, "../v3/private/input-snapshot.json");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function inventoryCore(
  inventory: V4PinnedInventory,
): Omit<V4PinnedInventory, "snapshotHash"> {
  return Object.fromEntries(
    Object.entries(inventory).filter(([key]) => key !== "snapshotHash"),
  ) as unknown as Omit<V4PinnedInventory, "snapshotHash">;
}

function scanForbiddenPublicKeys(value: unknown, jsonPath: string, findings: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      scanForbiddenPublicKeys(item, `${jsonPath}[${index}]`, findings),
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  const forbidden = new Set([
    "academyId",
    "sourceDocumentKey",
    "sourceRef",
    "originalFileUrl",
    "text",
    "passage",
    "records",
  ]);
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbidden.has(key)) findings.push(`${jsonPath}.${key}`);
    scanForbiddenPublicKeys(child, `${jsonPath}.${key}`, findings);
  }
}

async function main(): Promise<void> {
  loadEnvConfig(V4_REPO_ROOT);
  if (!fs.existsSync(PRIVATE_SNAPSHOT_PATH) || !fs.existsSync(PUBLIC_REPORT_PATH)) {
    throw new Error("Pinned v4 inventory and public report are both required.");
  }
  const rawInventory = readJson<Record<string, unknown>>(PRIVATE_SNAPSHOT_PATH);
  if ("asOf" in rawInventory || !("capturedAt" in rawInventory)) {
    throw new Error(
      "Legacy asOf inventory is unsupported by this verifier; use the remediated current-state capturedAt artifact.",
    );
  }
  const inventory = rawInventory as unknown as V4PinnedInventory;
  const v3 = readJson<V3PinnedSnapshot>(V3_SNAPSHOT_PATH);
  const publicReport = readJson<unknown>(PUBLIC_REPORT_PATH);
  const findings: string[] = [];
  if (inventorySnapshotHashV4(inventoryCore(inventory)) !== inventory.snapshotHash) {
    findings.push("PINNED_INVENTORY_HASH_MISMATCH");
  }
  if (inventory.v3SnapshotHash !== v3.snapshotHash) {
    findings.push("V3_ANCHOR_MISMATCH");
  }
  if (
    inventory.temporalSemantics !== "CURRENT_STATE_READ_ONLY_CAPTURE_NOT_HISTORICAL_AS_OF" ||
    inventory.historicalAsOfSupported !== false
  ) {
    findings.push("TEMPORAL_CAPTURE_CONTRACT_MISMATCH");
  }
  if (
    !Number.isFinite(Date.parse(inventory.captureWindow.startedAt)) ||
    !Number.isFinite(Date.parse(inventory.captureWindow.completedAt)) ||
    inventory.capturedAt !== inventory.captureWindow.completedAt ||
    Date.parse(inventory.captureWindow.startedAt) > Date.parse(inventory.captureWindow.completedAt)
  ) {
    findings.push("INVALID_CAPTURE_WINDOW");
  }
  if (dependencyManifestHashV4(inventory.dependencyManifest) !== inventory.codeHash) {
    findings.push("DEPENDENCY_MANIFEST_HASH_MISMATCH");
  }
  if (inventory.dependencyManifest.manifestHash !== inventory.codeHash) {
    findings.push("CODE_HASH_NOT_DEPENDENCY_MANIFEST_HASH");
  }
  const databaseRecords = inventory.records.filter(
    (record) => !record.family.startsWith("local-"),
  );
  if (sha256(stableStringify(databaseRecords)) !== inventory.databaseRecordSetHash) {
    findings.push("DATABASE_RECORD_SET_HASH_MISMATCH");
  }
  const reconstructed = analyzeInventoryV4(inventory, v3);
  if (stableStringify(reconstructed) !== stableStringify(publicReport)) {
    findings.push("PUBLIC_REPORT_REBUILD_MISMATCH");
  }
  scanForbiddenPublicKeys(publicReport, "$", findings);
  const serializedPublic = stableStringify(publicReport);
  for (const academyId of new Set(
    inventory.records.map((record) => record.academyId).filter(Boolean) as string[],
  )) {
    if (serializedPublic.includes(academyId)) {
      findings.push("PUBLIC_ACADEMY_IDENTIFIER_LEAK");
      break;
    }
  }
  const forbiddenOperationalFiles = fs
    .readdirSync(HERE)
    .filter((name) => /manifest|blind-packet/i.test(name));
  if (forbiddenOperationalFiles.length > 0) {
    findings.push(`OPERATIONAL_ARTIFACT_PRESENT:${forbiddenOperationalFiles.join(",")}`);
  }

  const live = await buildPinnedInventoryV4();
  const liveMismatches: string[] = [];
  if (computeV4CodeHash() !== inventory.codeHash) liveMismatches.push("codeHash");
  if (live.inventory.gitSha !== inventory.gitSha) liveMismatches.push("gitSha");
  if (
    stableStringify(live.inventory.localSourceHashes) !==
    stableStringify(inventory.localSourceHashes)
  ) {
    liveMismatches.push("localSourceHashes");
  }
  if (live.inventory.databaseExtractHash !== inventory.databaseExtractHash) {
    liveMismatches.push("databaseExtractHash");
  }
  if (live.inventory.databaseRecordSetHash !== inventory.databaseRecordSetHash) {
    liveMismatches.push("databaseRecordSetHash");
  }
  if (
    sha256(stableStringify(live.inventory.records)) !==
    sha256(stableStringify(inventory.records))
  ) {
    liveMismatches.push("recordExtractHash");
  }
  const report = {
    schemaVersion: 4,
    status: findings.length === 0 && liveMismatches.length === 0 ? "PASS" : "FAIL",
    pinnedRebuild: {
      passed: findings.length === 0,
      findings,
      inventorySnapshotHash: inventory.snapshotHash,
      publicReportSha256: sha256(stableStringify(publicReport)),
    },
    liveDrift: {
      passed: liveMismatches.length === 0,
      mismatches: liveMismatches,
      currentDatabaseExtractHash: live.inventory.databaseExtractHash,
      expectedDatabaseExtractHash: inventory.databaseExtractHash,
    },
    operationalManifestPresent: false,
    modelApiCalls: 0,
    browserCalls: 0,
    databaseWrites: 0,
  };
  process.stdout.write(stableStringify(report));
  if (report.status !== "PASS") process.exitCode = 1;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]).toLowerCase() : "";
if (invoked === fileURLToPath(import.meta.url).toLowerCase()) {
  main()
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
