import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sha256, stableStringify } from "../selector-core";
import {
  finalizeAuditV3,
  type AdjudicationRecordV3,
  type AuditQueueItem,
  type IndependentReview,
} from "./audit-finalizer-v3";
import type { V3PanelName } from "./types-v3";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REVIEW_DIR = path.resolve(HERE, "../../reviews/corpus-v3");
const TARGET_MAP_PATH = path.join(REVIEW_DIR, "private/target-map.json");
const REVIEW_A_PATH = path.join(REVIEW_DIR, "private/reviewer-a.json");
const REVIEW_B_PATH = path.join(REVIEW_DIR, "private/reviewer-b.json");
const ADJUDICATION_PATH = path.join(REVIEW_DIR, "private/adjudication.json");
const PRIVATE_MANIFEST_PATH = path.join(HERE, "private/manifest-private.json");
const PUBLIC_OUTPUT_PATH = path.join(REVIEW_DIR, "certification-public.json");
const PRIVATE_OUTPUT_PATH = path.join(REVIEW_DIR, "private/certification-private.json");

interface TargetMap {
  snapshotHash: string;
  records: Array<{
    blindId: string;
    candidateId: string;
    targetPanel: V3PanelName;
    queueSequence: number;
    origin: "repo-official" | "db-global";
  }>;
}

interface ManifestItem {
  id: string;
  strata: { wordBand: string; discourse: string };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeExclusive(filePath: string, value: unknown): void {
  if (fs.existsSync(filePath)) throw new Error(`Refusing to overwrite ${filePath}`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, stableStringify(value), { encoding: "utf8", flag: "wx" });
}

function main(): void {
  for (const required of [
    TARGET_MAP_PATH,
    REVIEW_A_PATH,
    REVIEW_B_PATH,
    ADJUDICATION_PATH,
    PRIVATE_MANIFEST_PATH,
  ]) {
    if (!fs.existsSync(required)) throw new Error(`Missing sealed audit input: ${required}`);
  }
  const targetMap = readJson<TargetMap>(TARGET_MAP_PATH);
  const manifest = readJson<{ panels: Record<string, ManifestItem[]> }>(PRIVATE_MANIFEST_PATH);
  const itemById = new Map(
    Object.values(manifest.panels)
      .flat()
      .map((item) => [item.id, item]),
  );
  const queue: AuditQueueItem[] = targetMap.records.map((record) => {
    const item = itemById.get(record.candidateId);
    if (!item) throw new Error(`Sealed target has no manifest row: ${record.candidateId}`);
    return {
      blindId: record.blindId,
      candidateId: record.candidateId,
      panel: record.targetPanel,
      queueSequence: record.queueSequence,
      origin: record.origin,
      strata: item.strata,
    };
  });
  const result = finalizeAuditV3({
    queue,
    reviewA: readJson<IndependentReview>(REVIEW_A_PATH),
    reviewB: readJson<IndependentReview>(REVIEW_B_PATH),
    adjudication: readJson<{ records: AdjudicationRecordV3[] }>(ADJUDICATION_PATH).records,
  });
  const publicCore = {
    schemaVersion: 3,
    status: result.status,
    snapshotHash: targetMap.snapshotHash,
    diagnostics: result.diagnostics,
    privateIdentifiersPublished: false,
    usableForGeneration: result.status === "CERTIFIED",
  };
  const publicOutput = { ...publicCore, sha256: sha256(stableStringify(publicCore)) };
  const privateOutput = {
    schemaVersion: 3,
    confidentiality: "SEALED certification membership",
    snapshotHash: targetMap.snapshotHash,
    publicCertificationSha256: sha256(stableStringify(publicOutput)),
    result,
  };
  writeExclusive(PUBLIC_OUTPUT_PATH, publicOutput);
  writeExclusive(PRIVATE_OUTPUT_PATH, privateOutput);
  process.stdout.write(stableStringify(publicOutput));
  if (result.status !== "CERTIFIED") process.exitCode = 2;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]).toLowerCase() : "";
if (invoked === fileURLToPath(import.meta.url).toLowerCase()) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
