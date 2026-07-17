import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sha256, stableStringify } from "../selector-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = path.resolve(HERE, "../..");
const PRIVATE_MANIFEST_PATH = path.join(CORPUS_DIR, "corpus/v3/private/manifest-private.json");
const PUBLIC_MANIFEST_PATH = path.join(CORPUS_DIR, "corpus/v3/manifest-public.json");
const PACKET_PATH = path.join(HERE, "blind-packet.json");
const SEALED_MAP_PATH = path.join(HERE, "private/target-map.json");
const REVIEW_A_PATH = path.join(HERE, "private/reviewer-a.json");
const REVIEW_B_PATH = path.join(HERE, "private/reviewer-b.json");

interface PrivateItem {
  id: string;
  panel: string;
  queueSequence: number;
  queueRole: string;
  origin: string;
  contentHash: string;
  passage: string;
  sourceRecordId: string;
}

interface PrivateManifest {
  snapshotHash: string;
  publicManifestSha256: string;
  panels: Record<string, PrivateItem[]>;
}

function writeExclusive(filePath: string, value: unknown): void {
  if (fs.existsSync(filePath)) throw new Error(`Refusing to overwrite ${filePath}`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, stableStringify(value), { encoding: "utf8", flag: "wx" });
}

function reviewTemplate(reviewerId: "A" | "B", packetHash: string, blindIds: string[]) {
  return {
    schemaVersion: 3,
    reviewerId,
    independenceAttestation:
      "I completed this audit without seeing the sealed target/source map or the other review.",
    attested: false,
    blindPacketSha256: packetHash,
    frozenOrder: true,
    records: blindIds.map((blindId) => ({
      blindId,
      surfaceIntegrity: "PENDING",
      discourseCoherence: "PENDING",
      domainIntegrity: "PENDING",
      grammarSuitability: "PENDING",
      blankSuitability: "PENDING",
      finalDecision: "PENDING",
      rationale: "",
    })),
  };
}

function main(): void {
  if (!fs.existsSync(PRIVATE_MANIFEST_PATH) || !fs.existsSync(PUBLIC_MANIFEST_PATH)) {
    throw new Error(
      "Operational v3 manifests do not exist. A supply-shortage preflight must not produce an audit packet.",
    );
  }
  const privateManifest = JSON.parse(
    fs.readFileSync(PRIVATE_MANIFEST_PATH, "utf8"),
  ) as PrivateManifest;
  const publicManifestRaw = fs.readFileSync(PUBLIC_MANIFEST_PATH, "utf8");
  if (sha256(publicManifestRaw) !== privateManifest.publicManifestSha256) {
    throw new Error("Private/public manifest hash mismatch; audit packet refused.");
  }
  const ordered = Object.values(privateManifest.panels)
    .flat()
    .sort((left, right) => {
      const leftKey = sha256(
        `${privateManifest.snapshotHash}|blind-order|${left.panel}|${left.queueSequence}|${left.contentHash}`,
      );
      const rightKey = sha256(
        `${privateManifest.snapshotHash}|blind-order|${right.panel}|${right.queueSequence}|${right.contentHash}`,
      );
      return leftKey.localeCompare(rightKey) || left.id.localeCompare(right.id);
    });
  const mapped = ordered.map((item, index) => ({
    blindId: `v3-${String(index + 1).padStart(4, "0")}-${sha256(
      `${privateManifest.snapshotHash}|${item.contentHash}`,
    ).slice(0, 8)}`,
    item,
  }));
  const packetCore = {
    schemaVersion: 3,
    packetId: `corpus-v3-${privateManifest.snapshotHash.slice(0, 12)}`,
    frozenOrder: true,
    instructions:
      "Assess every passage on all five generic dimensions. Do not infer or request its source, origin, panel, or intended target.",
    items: mapped.map(({ blindId, item }) => ({ blindId, passage: item.passage })),
  };
  const packet = {
    ...packetCore,
    packetSha256: sha256(stableStringify(packetCore)),
  };
  const sealedMap = {
    schemaVersion: 3,
    confidentiality: "SEALED: do not disclose before both independent reviews are frozen.",
    snapshotHash: privateManifest.snapshotHash,
    publicManifestSha256: privateManifest.publicManifestSha256,
    blindPacketSha256: sha256(stableStringify(packet)),
    records: mapped.map(({ blindId, item }) => ({
      blindId,
      candidateId: item.id,
      targetPanel: item.panel,
      queueSequence: item.queueSequence,
      queueRole: item.queueRole,
      origin: item.origin,
      contentHash: item.contentHash,
      sourceRecordId: item.sourceRecordId,
    })),
  };
  const packetHash = sha256(stableStringify(packet));
  writeExclusive(PACKET_PATH, packet);
  writeExclusive(SEALED_MAP_PATH, sealedMap);
  writeExclusive(REVIEW_A_PATH, reviewTemplate("A", packetHash, mapped.map((item) => item.blindId)));
  writeExclusive(REVIEW_B_PATH, reviewTemplate("B", packetHash, mapped.map((item) => item.blindId)));
  process.stdout.write(
    stableStringify({
      status: "AUDIT_PACKET_STAGED",
      items: mapped.length,
      packetSha256: packetHash,
      itemVisibleFields: ["blindId", "passage"],
      targetMapSealed: true,
      sourceMapSealed: true,
      independentReviewTemplates: 2,
      apiCalls: 0,
      databaseWrites: 0,
    }),
  );
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
