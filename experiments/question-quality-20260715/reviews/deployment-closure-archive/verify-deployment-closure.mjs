import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  aggregateSecretInventory,
  buildStaticClosure,
  eolVariants,
  scanSecretPatterns,
  sha1,
  sha256,
  stableJson,
} from "./deployment-closure-lib.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../../../..");
const PRIVATE_ROOT = resolve(
  SCRIPT_DIR,
  "../../private/deployment-closure-archive/dpl_CKkd1eiFq2DeEidwSxQpFSgDm4ZD",
);
const SOURCE_INDEX_PATH = resolve(SCRIPT_DIR, "deployment-source-file-index.json");
const MANIFEST_PATH = resolve(SCRIPT_DIR, "deployment-closure-manifest.json");
const SECRET_INVENTORY_PATH = resolve(
  SCRIPT_DIR,
  "deployment-secret-pattern-inventory.json",
);
const TRIGGER_PATH = resolve(SCRIPT_DIR, "trigger-worker-provenance.json");
const REPORT_PATH = resolve(SCRIPT_DIR, "deployment-closure-verification.json");
const AUDIT_PATH = resolve(SCRIPT_DIR, "AUDIT.md");
const CAPTURE_SCRIPT_PATH = resolve(SCRIPT_DIR, "capture-deployment-closure.mjs");
const LIBRARY_PATH = resolve(SCRIPT_DIR, "deployment-closure-lib.mjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: Object.prototype.hasOwnProperty.call(options, "encoding")
      ? options.encoding
      : "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function json(path) {
  assert(existsSync(path), `required artifact missing: ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function compare(label, actual, expected) {
  const actualJson = stableJson(actual);
  const expectedJson = stableJson(expected);
  assert(
    actualJson === expectedJson,
    `${label} mismatch: ${sha256(Buffer.from(actualJson))} != ${sha256(Buffer.from(expectedJson))}`,
  );
}

function reconstructGit(file) {
  const match = file.gitReconstruction?.newestMatch;
  assert(match?.commit, `git reconstruction commit missing: ${file.localPath}`);
  const blob = git(["show", `${match.commit}:${file.localPath}`], {
    encoding: null,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const variant = eolVariants(blob).find(
    (candidate) => candidate.variant === match.eolVariant,
  );
  assert(variant, `git EOL variant missing: ${file.localPath}`);
  return variant.bytes;
}

function reconstructPrivate(file) {
  const relativePath = file.privateBlob?.relativePath;
  assert(typeof relativePath === "string", `private blob locator missing: ${file.localPath}`);
  const absolute = resolve(REPO_ROOT, relativePath);
  assert(
    absolute === PRIVATE_ROOT || absolute.startsWith(`${PRIVATE_ROOT}${sep}`),
    `private blob escapes private root: ${file.localPath}`,
  );
  assert(existsSync(absolute), `private blob missing: ${file.localPath}`);
  const raw = readFileSync(absolute);
  assert(
    sha256(raw) === file.privateBlob.sha256,
    `private blob SHA-256 mismatch: ${file.localPath}`,
  );
  return raw;
}

function reconstruct(file) {
  const raw =
    file.gitReconstruction?.status === "GIT_HISTORY_RECONSTRUCTABLE"
      ? reconstructGit(file)
      : reconstructPrivate(file);
  assert(sha1(raw) === file.uid, `deployed UID mismatch: ${file.localPath}`);
  assert(sha256(raw) === file.rawSha256, `raw SHA-256 mismatch: ${file.localPath}`);
  assert(raw.length === file.byteLength, `byte length mismatch: ${file.localPath}`);
  return raw;
}

function walkFiles(directory, rows = []) {
  for (const name of readdirSync(directory)) {
    const absolute = resolve(directory, name);
    const info = statSync(absolute);
    if (info.isDirectory()) walkFiles(absolute, rows);
    if (info.isFile()) rows.push(absolute);
  }
  return rows;
}

function secretHashes(files) {
  const hashes = new Set();
  for (const file of files) {
    for (const match of file.matches) {
      for (const digest of match.uniqueMatchSha256) hashes.add(digest);
    }
  }
  return hashes;
}

async function main() {
  const sourceIndex = json(SOURCE_INDEX_PATH);
  const manifest = json(MANIFEST_PATH);
  const inventory = json(SECRET_INVENTORY_PATH);
  const trigger = json(TRIGGER_PATH);
  assert(manifest.schemaVersion === 1, "unsupported manifest schema");
  assert(sourceIndex.schemaVersion === 1, "unsupported source index schema");
  assert(
    manifest.deployment.id === "dpl_CKkd1eiFq2DeEidwSxQpFSgDm4ZD",
    "deployment identity mismatch",
  );
  assert(
    sha256(readFileSync(SOURCE_INDEX_PATH)) === manifest.sourceIndex.sha256,
    "source index digest mismatch",
  );
  assert(
    inventory.closureManifestSha256 === sha256(readFileSync(MANIFEST_PATH)),
    "secret inventory is not bound to closure manifest",
  );
  assert(
    manifest.captureTooling?.captureScriptSha256 ===
      sha256(readFileSync(CAPTURE_SCRIPT_PATH)),
    "capture script changed after frozen capture",
  );
  assert(
    manifest.captureTooling?.librarySha256 === sha256(readFileSync(LIBRARY_PATH)),
    "closure library changed after frozen capture",
  );

  const sortedSourcePaths = sourceIndex.files.map((file) => file.localPath);
  compare(
    "source index sort",
    sortedSourcePaths,
    [...sortedSourcePaths].sort((a, b) => a.localeCompare(b)),
  );
  assert(new Set(sortedSourcePaths).size === sortedSourcePaths.length, "source paths duplicate");
  for (const row of sourceIndex.files) {
    assert(/^[a-f0-9]{40}$/.test(row.uid), `malformed source UID: ${row.localPath}`);
    assert(
      row.deploymentPath === `src/${row.localPath}`,
      `source path mapping mismatch: ${row.localPath}`,
    );
  }

  const rawByPath = new Map();
  for (const file of manifest.closure.files) {
    rawByPath.set(file.localPath, reconstruct(file));
  }
  const recomputed = await buildStaticClosure({
    roots: manifest.roots,
    sourceRows: sourceIndex.files,
    readRaw: async (sourceRow) => {
      assert(rawByPath.has(sourceRow.localPath), `closure byte absent: ${sourceRow.localPath}`);
      return rawByPath.get(sourceRow.localPath);
    },
  });
  compare("closure file paths", recomputed.files, manifest.closure.files.map((f) => f.localPath));
  compare("closure edges", recomputed.edges, manifest.closure.edges);
  compare(
    "closure external references",
    recomputed.externalReferences,
    manifest.closure.externalReferences,
  );
  compare(
    "closure unresolved static references",
    recomputed.unresolvedStatic,
    manifest.closure.unresolvedStatic,
  );
  compare(
    "closure computed references",
    recomputed.computedReferences,
    manifest.closure.computedReferences,
  );

  const expectedSecretFiles = [];
  for (const file of manifest.closure.files) {
    const facts = recomputed.factsByPath.get(file.localPath);
    assert(facts.rawSha1 === file.uid, `facts UID mismatch: ${file.localPath}`);
    assert(facts.rawSha256 === file.rawSha256, `facts SHA mismatch: ${file.localPath}`);
    assert(facts.parseState === file.parseState, `parse state mismatch: ${file.localPath}`);
    compare(
      `parse diagnostics ${file.localPath}`,
      facts.parseDiagnostics,
      file.parseDiagnostics,
    );
    assert(
      facts.moduleReferences.length === file.moduleReferenceCount,
      `module reference count mismatch: ${file.localPath}`,
    );
    assert(
      facts.computedReferences.length === file.computedReferenceCount,
      `computed reference count mismatch: ${file.localPath}`,
    );
    compare(`environment names ${file.localPath}`, facts.environmentNames, file.environmentNames);
    compare(
      `root reachability ${file.localPath}`,
      recomputed.reachableFrom[file.localPath],
      file.reachableFromRootIds,
    );
    const matches = scanSecretPatterns(rawByPath.get(file.localPath));
    const count = matches.reduce((sum, match) => sum + match.count, 0);
    assert(count === file.secretPatternMatchCount, `secret count mismatch: ${file.localPath}`);
    expectedSecretFiles.push({
      localPath: file.localPath,
      rawSha256: file.rawSha256,
      matches,
    });
  }

  const expectedInventory = {
    schemaVersion: 1,
    capturedAt: manifest.capturedAt,
    deploymentId: manifest.deployment.id,
    closureManifestSha256: sha256(readFileSync(MANIFEST_PATH)),
    disclosurePolicy:
      "Counts and SHA-256 digests of exact matches only. No matched substring or source byte is stored in this public artifact.",
    summary: {
      scannedFileCount: expectedSecretFiles.length,
      filesWithMatches: expectedSecretFiles.filter((file) => file.matches.length > 0).length,
      totalMatches: expectedSecretFiles.reduce(
        (sum, file) =>
          sum + file.matches.reduce((inner, match) => inner + match.count, 0),
        0,
      ),
      byPattern: aggregateSecretInventory(expectedSecretFiles),
    },
    files: expectedSecretFiles.filter((file) => file.matches.length > 0),
  };
  compare("secret inventory", inventory, expectedInventory);

  const deployedSecretHashes = secretHashes(expectedSecretFiles);
  const publicPaths = [
    SOURCE_INDEX_PATH,
    MANIFEST_PATH,
    SECRET_INVENTORY_PATH,
    TRIGGER_PATH,
    fileURLToPath(import.meta.url),
    resolve(SCRIPT_DIR, "capture-deployment-closure.mjs"),
    resolve(SCRIPT_DIR, "deployment-closure-lib.mjs"),
    REPORT_PATH,
    AUDIT_PATH,
  ].filter(existsSync);
  const leakedDigests = new Set();
  for (const publicPath of publicPaths) {
    for (const pattern of scanSecretPatterns(readFileSync(publicPath))) {
      for (const digest of pattern.uniqueMatchSha256) {
        if (deployedSecretHashes.has(digest)) leakedDigests.add(digest);
      }
    }
  }
  assert(leakedDigests.size === 0, "a deployed secret-pattern value leaked to public artifacts");

  assert(
    trigger.vercelDeploymentId === manifest.deployment.id,
    "Trigger evidence is bound to another Vercel deployment",
  );
  if (trigger.captureStatus === "CAPTURED_READ_ONLY") {
    assert(trigger.worker?.targetTaskPresent, "Trigger target task absent");
    assert(
      trigger.correlationToVercel?.sameCommitSha,
      "Trigger/Vercel commit metadata diverges",
    );
    assert(
      !Object.prototype.hasOwnProperty.call(trigger.deployment, "imageReference"),
      "raw Trigger image reference was retained",
    );
    assert(
      !Object.prototype.hasOwnProperty.call(trigger.deployment, "externalBuildData"),
      "raw Trigger external build data was retained",
    );
  }

  const trackedPrivate = git([
    "ls-files",
    "--",
    "experiments/question-quality-20260715/private/deployment-closure-archive",
  ])
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((path) => !path.endsWith("/.gitignore"));
  assert(trackedPrivate.length === 0, "private deployment bytes are tracked by Git");

  const privateArchiveIndex = manifest.closure.files
    .filter((file) => file.privateBlob)
    .map((file) => ({
      localPath: file.localPath,
      uid: file.uid,
      byteLength: file.byteLength,
      rawSha256: file.rawSha256,
      blobSha256: file.privateBlob.sha256,
      relativePath: file.privateBlob.relativePath,
    }));
  const privateArchiveIndexSha256 = sha256(
    Buffer.from(stableJson(privateArchiveIndex), "utf8"),
  );
  const referencedPrivate = new Set(
    privateArchiveIndex.map((row) => resolve(REPO_ROOT, row.relativePath)),
  );
  const unreferencedPrivateRaw = walkFiles(PRIVATE_ROOT).filter(
    (absolute) => absolute.endsWith(".raw") && !referencedPrivate.has(absolute),
  );
  assert(
    unreferencedPrivateRaw.length === 0,
    `private archive has ${unreferencedPrivateRaw.length} unreferenced raw blobs`,
  );

  const report = {
    schemaVersion: 1,
    verdict: "PASS",
    deploymentId: manifest.deployment.id,
    sourceIndexSha256: sha256(readFileSync(SOURCE_INDEX_PATH)),
    closureManifestSha256: sha256(readFileSync(MANIFEST_PATH)),
    secretInventorySha256: sha256(readFileSync(SECRET_INVENTORY_PATH)),
    triggerProvenanceSha256: sha256(readFileSync(TRIGGER_PATH)),
    privateArchiveIndexSha256,
    tooling: {
      captureScriptSha256: sha256(readFileSync(CAPTURE_SCRIPT_PATH)),
      librarySha256: sha256(readFileSync(LIBRARY_PATH)),
      verifierScriptSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    },
    checks: {
      sourceIndexPathUidBinding: true,
      everyClosureByteReconstructed: true,
      everyClosureUidVerified: true,
      closureGraphRecomputed: true,
      secretInventoryRecomputed: true,
      deployedSecretValueAbsentFromPublicArtifacts: true,
      privateBytesUntracked: true,
      privateArchiveHasNoUnreferencedRawBlobs: true,
      triggerEvidenceSanitized: true,
    },
    counts: {
      sourceInputFiles: sourceIndex.files.length,
      closureFiles: manifest.closure.files.length,
      closureEdges: manifest.closure.edges.length,
      gitReconstructable: manifest.closure.gitReconstructableCount,
      privateBlobsRequired: manifest.closure.privateBlobRequiredCount,
      privateArchiveUniqueBlobs: new Set(
        privateArchiveIndex.map((row) => row.blobSha256),
      ).size,
      privateArchiveBytes: privateArchiveIndex.reduce(
        (sum, row) => sum + row.byteLength,
        0,
      ),
      unresolvedStatic: manifest.closure.unresolvedStaticCount,
      computedReferences: manifest.closure.computedReferenceCount,
      secretPatternMatches: manifest.closure.secretPatternMatchCount,
    },
  };
  writeFileSync(REPORT_PATH, stableJson(report), "utf8");
  process.stdout.write(
    `${JSON.stringify({ ...report, verificationReportSha256: sha256(readFileSync(REPORT_PATH)) })}\n`,
  );
}

await main();
