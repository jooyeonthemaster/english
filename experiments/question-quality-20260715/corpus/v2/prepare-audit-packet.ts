import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type JsonRecord = Record<string, unknown>;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../..");
const SOURCE = path.join(HERE, "private/manifest-private.json");
const OUTPUT_DIR = path.join(
  ROOT,
  "experiments/question-quality-20260715/reviews/corpus-v2",
);
const SEED = "question-quality-20260715-corpus-v2-semantic-audit-v1";

const PANEL_TARGET: Record<string, "GENERAL" | "GRAMMAR_KILLER" | "BLANK_KILLER"> = {
  "focus-blank-killer": "BLANK_KILLER",
  "focus-grammar-killer": "GRAMMAR_KILLER",
  "general-dev-replacement": "GENERAL",
  "general-holdout-replacement": "GENERAL",
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function pretty(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readSource(): JsonRecord {
  const parsed = JSON.parse(fs.readFileSync(SOURCE, "utf8")) as unknown;
  if (!isRecord(parsed) || !isRecord(parsed.panels)) {
    throw new Error("Invalid corpus v2 private manifest");
  }
  return parsed;
}

function main(): void {
  if (!process.argv.slice(2).includes("--write")) {
    throw new Error("Refusing to create audit artifacts without --write");
  }
  const source = readSource();
  const panels = source.panels as JsonRecord;
  const rows: Array<JsonRecord & { panel: string }> = [];
  for (const [panel, target] of Object.entries(PANEL_TARGET)) {
    const values = panels[panel];
    if (!Array.isArray(values)) throw new Error(`Missing panel: ${panel}`);
    for (const value of values) {
      if (!isRecord(value) || value.candidateOnly !== true) {
        throw new Error(`Non-candidate row found in ${panel}`);
      }
      if (typeof value.id !== "string" || typeof value.passageContent !== "string") {
        throw new Error(`Malformed candidate row in ${panel}`);
      }
      rows.push({ ...value, panel, auditTarget: target });
    }
  }
  if (rows.length !== 445) throw new Error(`Expected 445 candidates, got ${rows.length}`);
  if (new Set(rows.map((row) => String(row.id))).size !== rows.length) {
    throw new Error("Candidate IDs are not unique");
  }

  rows.sort((left, right) => {
    const a = sha256(`${SEED}:${left.id}`);
    const b = sha256(`${SEED}:${right.id}`);
    return a.localeCompare(b) || String(left.id).localeCompare(String(right.id));
  });

  const blindItems = rows.map((row, index) => ({
    blindId: `CV2-${String(index + 1).padStart(3, "0")}`,
    auditTarget: row.auditTarget,
    passage: row.passageContent,
    wordCount: row.wordCount,
  }));
  const packetCore = { schemaVersion: 1, seed: SEED, items: blindItems };
  const packetHash = sha256(stable(packetCore));
  const packet = { ...packetCore, packetHash };
  const sealedMap = {
    schemaVersion: 1,
    packetHash,
    sourceManifestSha256: sha256(fs.readFileSync(SOURCE, "utf8")),
    items: rows.map((row, index) => ({
      blindId: `CV2-${String(index + 1).padStart(3, "0")}`,
      id: row.id,
      panel: row.panel,
      queueRole: row.queueRole,
      sequence: row.sequence,
      contentHash: row.contentHash,
      comparisonHash: row.comparisonHash,
      sourceDocument: row.sourceDocument,
      origin: row.origin,
    })),
  };
  const template = {
    schemaVersion: 1,
    packetHash,
    raterId: "REPLACE_ME",
    frozen: false,
    items: blindItems.map((item) => ({
      blindId: item.blindId,
      status: "PENDING",
      surfaceValid: null,
      coherenceValid: null,
      domainRisk: null,
      grammarSuitability: item.auditTarget === "GRAMMAR_KILLER" ? null : "NOT_APPLICABLE",
      blankSuitability: item.auditTarget === "BLANK_KILLER" ? null : "NOT_APPLICABLE",
      issueCodes: [],
      reason: "",
    })),
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputs: Array<[string, unknown]> = [
    ["blind-packet.json", packet],
    ["sealed-map.json", sealedMap],
    ["review-template.json", template],
  ];
  for (const [name, value] of outputs) {
    const output = path.join(OUTPUT_DIR, name);
    if (fs.existsSync(output)) throw new Error(`Refusing to overwrite ${output}`);
    fs.writeFileSync(output, pretty(value), "utf8");
  }
  process.stdout.write(
    pretty({
      packetHash,
      itemCount: blindItems.length,
      byTarget: Object.fromEntries(
        Object.values(PANEL_TARGET).map((target) => [
          target,
          blindItems.filter((item) => item.auditTarget === target).length,
        ]),
      ),
      outputDir: path.relative(ROOT, OUTPUT_DIR).replaceAll("\\", "/"),
    }),
  );
}

main();
