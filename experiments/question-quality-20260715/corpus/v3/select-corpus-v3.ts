import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sha256, stableStringify } from "../selector-core";
import { buildCorpusV3 } from "./selector-core-v3";
import type { V3PinnedSnapshot } from "./types-v3";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = path.join(HERE, "private/input-snapshot.json");
const PUBLIC_MANIFEST_PATH = path.join(HERE, "manifest-public.json");
const PRIVATE_MANIFEST_PATH = path.join(HERE, "private/manifest-private.json");
const PREFLIGHT_REPORT_PATH = path.join(HERE, "preflight-report-public.json");

function readPinnedSnapshot(): V3PinnedSnapshot {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    throw new Error(
      "Pinned snapshot is missing. Run snapshot-v3.ts --as-of <fixed timestamp> --write first.",
    );
  }
  return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8")) as V3PinnedSnapshot;
}

function writeExclusive(filePath: string, value: unknown): void {
  if (fs.existsSync(filePath)) throw new Error(`Refusing to overwrite ${filePath}`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, stableStringify(value), { encoding: "utf8", flag: "wx" });
}

function assertNoConflictingOutputs(): void {
  const existing = [PUBLIC_MANIFEST_PATH, PRIVATE_MANIFEST_PATH, PREFLIGHT_REPORT_PATH].filter(
    fs.existsSync,
  );
  if (existing.length > 0) {
    throw new Error(`Refusing to replace existing v3 output(s): ${existing.join(", ")}`);
  }
}

function main(): void {
  const write = process.argv.slice(2).includes("--write");
  const snapshot = readPinnedSnapshot();
  const result = buildCorpusV3(snapshot);
  if (write) {
    assertNoConflictingOutputs();
    if (result.status === "READY_FOR_BLIND_AUDIT") {
      writeExclusive(PUBLIC_MANIFEST_PATH, result.publicManifest);
      writeExclusive(PRIVATE_MANIFEST_PATH, result.privateManifest);
    } else {
      writeExclusive(PREFLIGHT_REPORT_PATH, result.publicReport);
    }
  }
  process.stdout.write(
    stableStringify({
      mode: write ? "write" : "dry-run",
      status: result.status,
      snapshotHash: snapshot.snapshotHash,
      resultHash: sha256(
        stableStringify(
          result.status === "READY_FOR_BLIND_AUDIT"
            ? result.publicManifest
            : result.publicReport,
        ),
      ),
      diagnostics: result.diagnostics,
      operationalManifestWritten: write && result.status === "READY_FOR_BLIND_AUDIT",
      preflightReportWritten: write && result.status !== "READY_FOR_BLIND_AUDIT",
      databaseWrites: 0,
      apiCalls: 0,
    }),
  );
  if (result.status !== "READY_FOR_BLIND_AUDIT") process.exitCode = 2;
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
