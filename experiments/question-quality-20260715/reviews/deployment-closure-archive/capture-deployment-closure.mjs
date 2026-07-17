import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
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
const CAPTURE_SCRIPT_PATH = fileURLToPath(import.meta.url);
const LIBRARY_PATH = join(SCRIPT_DIR, "deployment-closure-lib.mjs");
const REPO_ROOT = resolve(SCRIPT_DIR, "../../../..");
const EXPERIMENT_ROOT = resolve(SCRIPT_DIR, "../..");
const PRIVATE_ROOT = join(
  EXPERIMENT_ROOT,
  "private",
  "deployment-closure-archive",
  "dpl_CKkd1eiFq2DeEidwSxQpFSgDm4ZD",
);
const SOURCE_INDEX_PATH = join(SCRIPT_DIR, "deployment-source-file-index.json");
const MANIFEST_PATH = join(SCRIPT_DIR, "deployment-closure-manifest.json");
const SECRET_INVENTORY_PATH = join(
  SCRIPT_DIR,
  "deployment-secret-pattern-inventory.json",
);
const TRIGGER_PATH = join(SCRIPT_DIR, "trigger-worker-provenance.json");

const DEPLOYMENT_ID = "dpl_CKkd1eiFq2DeEidwSxQpFSgDm4ZD";
const TEAM_ID = "team_E667d87IgVl41eB1kUydTqPA";
const EXPECTED_URL = "nara-qn6rcsvkh-jooyoens-projects-59877186.vercel.app";
const TARGET_TRIGGER_TASK = "workbench-question-generation";

const ROOTS = [
  {
    id: "route-generate-questions-auto",
    role: "route",
    localPath: "src/app/api/ai/generate-questions-auto/route.ts",
  },
  {
    id: "route-workbench-question-generation-enqueue",
    role: "route",
    localPath: "src/app/api/workbench/ai-jobs/question-generation/route.ts",
  },
  {
    id: "route-workbench-question-generation-fast",
    role: "route",
    localPath: "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts",
  },
  {
    id: "provider-atlas-ai",
    role: "provider",
    localPath: "src/lib/atlas-ai.ts",
  },
  {
    id: "provider-atlas",
    role: "provider",
    localPath: "src/lib/atlas.ts",
  },
  {
    id: "provider-atlas-chat-rest",
    role: "provider",
    localPath: "src/lib/atlas-chat-rest.ts",
  },
  {
    id: "provider-question-generation-llm",
    role: "provider",
    localPath: "src/lib/question-generation-llm.ts",
  },
  {
    id: "trigger-workbench-question-generation",
    role: "trigger-worker",
    localPath: "src/trigger/workbench-question-generation.ts",
  },
  { id: "config-package", role: "build-config", localPath: "package.json" },
  {
    id: "config-package-lock",
    role: "build-config",
    localPath: "package-lock.json",
  },
  { id: "config-typescript", role: "build-config", localPath: "tsconfig.json" },
  {
    id: "config-trigger",
    role: "trigger-build-config",
    localPath: "trigger.config.ts",
  },
  {
    id: "config-prisma-schema",
    role: "generated-runtime-input",
    localPath: "prisma/schema.prisma",
  },
  { id: "config-next", role: "build-config", localPath: "next.config.ts" },
  { id: "config-vercel", role: "runtime-config", localPath: "vercel.json" },
];

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

function readVercelToken() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  const appData = process.env.APPDATA;
  const candidates = [
    appData && join(appData, "com.vercel.cli", "Data", "auth.json"),
    join(homedir(), ".vercel", "auth.json"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const parsed = JSON.parse(readFileSync(candidate, "utf8"));
    if (typeof parsed.token === "string" && parsed.token.length > 0) {
      return parsed.token;
    }
  }
  throw new Error("Vercel read credential is unavailable");
}

function readEnvValue(filePath, key) {
  if (!existsSync(filePath)) return null;
  const text = readFileSync(filePath, "utf8");
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(
    new RegExp(`^\\s*(?:export\\s+)?${escaped}\\s*=\\s*(.*)$`, "m"),
  );
  if (!match) return null;
  let value = match[1].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  } else {
    value = value.replace(/\s+#.*$/, "").trim();
  }
  return value || null;
}

function readTriggerKey() {
  if (process.env.TRIGGER_SECRET_KEY) return process.env.TRIGGER_SECRET_KEY;
  for (const name of [".env.local", ".env"]) {
    const value = readEnvValue(join(REPO_ROOT, name), "TRIGGER_SECRET_KEY");
    if (value) return value;
  }
  return null;
}

async function jsonRequest(url, token, provider) {
  const response = await fetch(url, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`${provider} read failed with HTTP ${response.status}`);
  }
  return response.json();
}

function vercelUrl(path) {
  const separator = path.includes("?") ? "&" : "?";
  return `https://api.vercel.com${path}${separator}teamId=${TEAM_ID}`;
}

function flattenTree(nodes, prefix = "") {
  const rows = [];
  for (const node of nodes) {
    const deploymentPath = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === "file") {
      rows.push({
        deploymentPath,
        uid: node.uid ?? null,
        size: Number.isFinite(node.size) ? node.size : null,
        mode: node.mode ?? null,
      });
    }
    if (Array.isArray(node.children)) {
      rows.push(...flattenTree(node.children, deploymentPath));
    }
  }
  return rows;
}

async function captureVercel() {
  const token = readVercelToken();
  const [deployment, tree] = await Promise.all([
    jsonRequest(vercelUrl(`/v13/deployments/${DEPLOYMENT_ID}`), token, "Vercel"),
    jsonRequest(vercelUrl(`/v6/deployments/${DEPLOYMENT_ID}/files`), token, "Vercel"),
  ]);
  if (deployment.id !== DEPLOYMENT_ID || deployment.url !== EXPECTED_URL) {
    throw new Error("Vercel deployment identity mismatch");
  }
  const allFiles = flattenTree(tree);
  const sourceRows = allFiles
    .filter((row) => row.deploymentPath.startsWith("src/"))
    .map((row) => ({
      localPath: row.deploymentPath.slice(4),
      deploymentPath: row.deploymentPath,
      uid: row.uid,
      size: row.size,
      mode: row.mode,
    }))
    .sort((a, b) => a.localPath.localeCompare(b.localPath));
  if (
    sourceRows.length < 100 ||
    sourceRows.some((row) => !/^[a-f0-9]{40}$/.test(row.uid))
  ) {
    throw new Error("Vercel source file tree is incomplete or malformed");
  }
  const duplicatePaths = sourceRows.filter(
    (row, index) => index > 0 && row.localPath === sourceRows[index - 1].localPath,
  );
  if (duplicatePaths.length > 0) throw new Error("duplicate Vercel source paths");

  const sanitizedDeployment = {
    id: deployment.id,
    url: deployment.url,
    source: deployment.source ?? null,
    target: deployment.target ?? null,
    readyState: deployment.readyState ?? null,
    createdAt: deployment.createdAt ?? null,
    projectId: deployment.projectId ?? null,
    git: {
      commitSha: deployment.meta?.githubCommitSha ?? null,
      commitRef: deployment.meta?.githubCommitRef ?? null,
      dirty: deployment.meta?.gitDirty ?? null,
      actor: deployment.meta?.actor ?? null,
    },
  };
  return {
    token,
    deployment: sanitizedDeployment,
    sourceRows,
    counts: {
      allDeploymentFiles: allFiles.length,
      sourceInputFiles: sourceRows.length,
      buildOutputFiles: allFiles.filter((row) => row.deploymentPath.startsWith("out/"))
        .length,
    },
  };
}

async function readVercelRaw(token, sourceRow) {
  const payload = await jsonRequest(
    vercelUrl(`/v7/deployments/${DEPLOYMENT_ID}/files/${sourceRow.uid}`),
    token,
    "Vercel file",
  );
  if (typeof payload.data !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload.data)) {
    throw new Error(`Vercel file payload malformed for ${sourceRow.localPath}`);
  }
  const raw = Buffer.from(payload.data, "base64");
  if (sha1(raw) !== sourceRow.uid) {
    throw new Error(`Vercel file UID mismatch for ${sourceRow.localPath}`);
  }
  return raw;
}

function findGitReconstruction(localPath, deployedUid) {
  let commits;
  try {
    commits = git(["log", "--all", "--format=%H", "--", localPath])
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  } catch {
    commits = [];
  }
  commits = [...new Set(commits)];
  const matches = [];
  for (const commit of commits) {
    let blob;
    try {
      blob = git(["show", `${commit}:${localPath}`], {
        encoding: null,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      continue;
    }
    for (const variant of eolVariants(blob)) {
      if (sha1(variant.bytes) === deployedUid) {
        matches.push({ commit, eolVariant: variant.variant });
        break;
      }
    }
  }
  return {
    status: matches.length > 0 ? "GIT_HISTORY_RECONSTRUCTABLE" : "NOT_IN_GIT_HISTORY",
    newestMatch: matches[0] ?? null,
    matchingRevisionCount: matches.length,
    revisionsChecked: commits.length,
  };
}

function archivePrivateBlob(raw) {
  const digest = sha256(raw);
  const relativePath = join(
    "experiments",
    "question-quality-20260715",
    "private",
    "deployment-closure-archive",
    DEPLOYMENT_ID,
    "blobs",
    "sha256",
    digest.slice(0, 2),
    `${digest}.raw`,
  );
  const absolute = join(REPO_ROOT, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  if (existsSync(absolute)) {
    const existing = readFileSync(absolute);
    if (sha256(existing) !== digest) throw new Error("private blob hash collision");
  } else {
    writeFileSync(absolute, raw, { flag: "wx", mode: 0o600 });
  }
  return { sha256: digest, relativePath: relativePath.replaceAll("\\", "/") };
}

function summarizeTriggerRuns(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.version ?? "unknown"}\u0000${row.status ?? "unknown"}`;
    const group = groups.get(key) ?? {
      version: row.version ?? null,
      status: row.status ?? null,
      count: 0,
      earliestCreatedAt: null,
      latestCreatedAt: null,
    };
    group.count += 1;
    if (!group.earliestCreatedAt || row.createdAt < group.earliestCreatedAt) {
      group.earliestCreatedAt = row.createdAt;
    }
    if (!group.latestCreatedAt || row.createdAt > group.latestCreatedAt) {
      group.latestCreatedAt = row.createdAt;
    }
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) =>
      String(b.latestCreatedAt).localeCompare(String(a.latestCreatedAt)) ||
      String(a.version).localeCompare(String(b.version)),
  );
}

async function captureTrigger(deployment) {
  const key = readTriggerKey();
  if (!key) {
    return {
      schemaVersion: 1,
      captureStatus: "UNAVAILABLE",
      reasonCode: "TRIGGER_PRODUCTION_READ_CREDENTIAL_UNAVAILABLE",
    };
  }
  if (!key.startsWith("tr_prod_")) {
    return {
      schemaVersion: 1,
      captureStatus: "UNAVAILABLE",
      reasonCode: "TRIGGER_CREDENTIAL_IS_NOT_PRODUCTION_SCOPED",
    };
  }
  const listUrl = new URL("https://api.trigger.dev/api/v1/deployments");
  listUrl.searchParams.set("page[size]", "100");
  listUrl.searchParams.set("status", "DEPLOYED");
  const listed = await jsonRequest(listUrl.toString(), key, "Trigger deployment list");
  const candidates = (listed.data ?? []).filter(
    (row) => row.git?.commitSha === deployment.git.commitSha,
  );
  const vercelCreated = Number(deployment.createdAt);
  candidates.sort((a, b) => {
    const aDelta = Math.abs(new Date(a.createdAt).getTime() - vercelCreated);
    const bDelta = Math.abs(new Date(b.createdAt).getTime() - vercelCreated);
    return aDelta - bDelta;
  });
  const matched = candidates[0];
  if (!matched) {
    return {
      schemaVersion: 1,
      captureStatus: "NO_MATCHING_DEPLOYMENT_METADATA",
      deploymentCommitSha: deployment.git.commitSha,
      deployedRowsInspected: (listed.data ?? []).length,
    };
  }
  const detail = await jsonRequest(
    `https://api.trigger.dev/api/v1/deployments/${encodeURIComponent(matched.id)}`,
    key,
    "Trigger deployment detail",
  );
  const targetRunsUrl = new URL("https://api.trigger.dev/api/v1/runs");
  targetRunsUrl.searchParams.set("filter[taskIdentifier]", TARGET_TRIGGER_TASK);
  targetRunsUrl.searchParams.set("filter[createdAt][period]", "90d");
  targetRunsUrl.searchParams.set("page[size]", "100");
  const targetRuns = await jsonRequest(
    targetRunsUrl.toString(),
    key,
    "Trigger run metadata",
  );
  const tasks = (detail.worker?.tasks ?? [])
    .map((task) => ({
      id: task.id ?? null,
      slug: task.slug ?? null,
      filePath: task.filePath ?? null,
      exportName: task.exportName ?? null,
    }))
    .sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
  const triggerCreated = new Date(matched.createdAt).getTime();
  const externalBuildData = detail.externalBuildData ?? null;
  const errorData = detail.errorData ?? null;
  return {
    schemaVersion: 1,
    captureStatus: "CAPTURED_READ_ONLY",
    environmentAttestation: "production credential prefix",
    deployment: {
      id: matched.id,
      shortCode: matched.shortCode ?? detail.shortCode ?? null,
      version: matched.version ?? detail.version ?? null,
      status: detail.status ?? matched.status ?? null,
      createdAt: matched.createdAt ?? null,
      deployedAt: matched.deployedAt ?? null,
      runtime: matched.runtime ?? null,
      runtimeVersion: matched.runtimeVersion ?? null,
      contentHash: detail.contentHash ?? null,
      commitSha: detail.commitSHA ?? matched.git?.commitSha ?? null,
      git: {
        dirty: matched.git?.dirty ?? null,
        source: matched.git?.source ?? null,
        commitRef: matched.git?.commitRef ?? null,
        commitSha: matched.git?.commitSha ?? null,
      },
      imagePlatform: detail.imagePlatform ?? null,
      imageReferenceSha256:
        typeof detail.imageReference === "string"
          ? sha256(Buffer.from(detail.imageReference, "utf8"))
          : null,
      externalBuildDataKeys:
        externalBuildData && typeof externalBuildData === "object"
          ? Object.keys(externalBuildData).sort()
          : [],
      externalBuildDataSha256:
        externalBuildData && typeof externalBuildData === "object"
          ? sha256(Buffer.from(stableJson(externalBuildData), "utf8"))
          : null,
      errorDataKeys:
        errorData && typeof errorData === "object" ? Object.keys(errorData).sort() : [],
      errorDataSha256:
        errorData && typeof errorData === "object"
          ? sha256(Buffer.from(stableJson(errorData), "utf8"))
          : null,
    },
    worker: {
      id: detail.worker?.id ?? null,
      version: detail.worker?.version ?? null,
      tasks,
      targetTaskPresent: tasks.some((task) => task.slug === TARGET_TRIGGER_TASK),
    },
    correlationToVercel: {
      sameCommitSha:
        (detail.commitSHA ?? matched.git?.commitSha ?? null) === deployment.git.commitSha,
      bothDirty:
        Boolean(matched.git?.dirty) && String(deployment.git.dirty) === "1",
      sameCommitRef: matched.git?.commitRef === deployment.git.commitRef,
      triggerCreatedAfterVercelMs: triggerCreated - vercelCreated,
      sourceByteParity:
        "UNPROVEN_TRIGGER_API_EXPOSES_OPAQUE_BUNDLE_HASH_NOT_SOURCE_BYTES",
    },
    targetTaskRunObservation: {
      period: "90d",
      returnedRows: (targetRuns.data ?? []).length,
      groups: summarizeTriggerRuns(targetRuns.data ?? []),
      latestVersionObserved:
        (targetRuns.data ?? []).length > 0 ? targetRuns.data[0].version ?? null : null,
      currentDeploymentVersionObserved:
        (targetRuns.data ?? []).some(
          (run) => String(run.version) === String(matched.version),
        ),
    },
    limitations: [
      "Trigger deployment contentHash is an opaque build/bundle hash; the API does not expose the uploaded source bytes or a per-source-file digest map.",
      "The newest matching deployment may have been created with --skip-promotion; the deployment list/detail response does not expose promotion state.",
      "Run metadata can attest only versions that actually executed; no payloads or outputs were requested or retained.",
    ],
  };
}

async function main() {
  if (!process.argv.includes("--capture-live")) {
    throw new Error("live capture is explicit: pass --capture-live");
  }
  mkdirSync(SCRIPT_DIR, { recursive: true });
  mkdirSync(PRIVATE_ROOT, { recursive: true });
  const capturedAt = new Date().toISOString();
  const vercel = await captureVercel();
  const sourceIndex = {
    schemaVersion: 1,
    capturedAt,
    captureMethod: "Vercel read-only deployment files API v6",
    deployment: vercel.deployment,
    counts: vercel.counts,
    files: vercel.sourceRows,
  };
  writeFileSync(SOURCE_INDEX_PATH, stableJson(sourceIndex), "utf8");
  const sourceIndexSha256 = sha256(readFileSync(SOURCE_INDEX_PATH));

  const roots = ROOTS.filter((root) =>
    vercel.sourceRows.some((row) => row.localPath === root.localPath),
  );
  const missingOptionalRoots = ROOTS.filter(
    (root) => !vercel.sourceRows.some((row) => row.localPath === root.localPath),
  ).map((root) => root.localPath);
  const rawByUid = new Map();
  async function readRaw(sourceRow) {
    if (!rawByUid.has(sourceRow.uid)) {
      rawByUid.set(sourceRow.uid, await readVercelRaw(vercel.token, sourceRow));
    }
    return rawByUid.get(sourceRow.uid);
  }
  const closure = await buildStaticClosure({
    roots,
    sourceRows: vercel.sourceRows,
    readRaw,
  });
  const sourceByPath = new Map(
    vercel.sourceRows.map((row) => [row.localPath, row]),
  );
  const secretFiles = [];
  const closureFiles = [];
  for (const localPath of closure.files) {
    const sourceRow = sourceByPath.get(localPath);
    const raw = await readRaw(sourceRow);
    const facts = closure.factsByPath.get(localPath);
    const gitReconstruction = findGitReconstruction(localPath, sourceRow.uid);
    const privateBlob =
      gitReconstruction.status === "GIT_HISTORY_RECONSTRUCTABLE"
        ? null
        : archivePrivateBlob(raw);
    const matches = scanSecretPatterns(raw);
    secretFiles.push({
      localPath,
      rawSha256: facts.rawSha256,
      matches,
    });
    closureFiles.push({
      localPath,
      deploymentPath: sourceRow.deploymentPath,
      uid: sourceRow.uid,
      rawSha256: facts.rawSha256,
      byteLength: facts.byteLength,
      utf8: facts.utf8,
      parseState: facts.parseState,
      parseDiagnostics: facts.parseDiagnostics,
      moduleReferenceCount: facts.moduleReferences.length,
      computedReferenceCount: facts.computedReferences.length,
      environmentNames: facts.environmentNames,
      reachableFromRootIds: closure.reachableFrom[localPath],
      gitReconstruction,
      privateBlob,
      secretPatternMatchCount: matches.reduce((sum, match) => sum + match.count, 0),
    });
  }
  closureFiles.sort((a, b) => a.localPath.localeCompare(b.localPath));
  const manifest = {
    schemaVersion: 1,
    capturedAt,
    captureTooling: {
      captureScriptSha256: sha256(readFileSync(CAPTURE_SCRIPT_PATH)),
      librarySha256: sha256(readFileSync(LIBRARY_PATH)),
    },
    deployment: vercel.deployment,
    sourceIndex: {
      relativePath: relative(REPO_ROOT, SOURCE_INDEX_PATH).replaceAll("\\", "/"),
      sha256: sourceIndexSha256,
      sourceInputFileCount: vercel.sourceRows.length,
    },
    roots,
    missingOptionalRoots,
    resolutionPolicy: {
      localKinds: ["relative-local", "alias-local"],
      alias: "@/* -> src/*",
      includesTypeOnlyEdges: true,
      includesLiteralDynamicImport: true,
      includesLiteralRequireAndRequireResolve: true,
      includesLiteralNewUrlImportMetaUrl: true,
      computedReferencesAreRecordedButNotResolved: true,
    },
    closure: {
      fileCount: closureFiles.length,
      edgeCount: closure.edges.length,
      externalReferenceCount: closure.externalReferences.length,
      unresolvedStaticCount: closure.unresolvedStatic.length,
      computedReferenceCount: closure.computedReferences.length,
      gitReconstructableCount: closureFiles.filter(
        (file) => file.gitReconstruction.status === "GIT_HISTORY_RECONSTRUCTABLE",
      ).length,
      privateBlobRequiredCount: closureFiles.filter((file) => file.privateBlob).length,
      secretPatternMatchCount: secretFiles.reduce(
        (sum, file) =>
          sum + file.matches.reduce((inner, match) => inner + match.count, 0),
        0,
      ),
      files: closureFiles,
      edges: closure.edges,
      externalReferences: closure.externalReferences,
      unresolvedStatic: closure.unresolvedStatic,
      computedReferences: closure.computedReferences,
    },
    gitAtCapture: {
      head: git(["rev-parse", "HEAD"]).trim(),
      branch: git(["branch", "--show-current"]).trim(),
      workingTreeDirty: git(["status", "--porcelain"]).trim().length > 0,
    },
    scopeGuards: {
      sourceInputNotRuntimeBundle:
        "This closure is over Vercel's raw deployment source inputs. Production executes compiled output under out/, whose module graph may differ after bundling and tree-shaking.",
      generatedPrisma:
        "Bare @prisma/client imports resolve to generated/package runtime code outside the raw source tree. prisma/schema.prisma is pinned as an evidence root, not as proof of generated-client byte identity.",
      runtimeData:
        "Database rows, environment values, remote prompt/config services, filesystem reads not represented as literal new URL(..., import.meta.url), and package-internal runtime data are outside this static closure.",
      computedImports:
        "Computed import/require/asset expressions are hashed and counted but cannot be resolved without runtime values.",
      frameworkGeneratedCode:
        "Next.js route manifests, generated Prisma code, package postinstall output, and Trigger build transforms are not recoverable from import syntax alone.",
    },
  };
  writeFileSync(MANIFEST_PATH, stableJson(manifest), "utf8");
  const manifestSha256 = sha256(readFileSync(MANIFEST_PATH));
  const secretInventory = {
    schemaVersion: 1,
    capturedAt,
    deploymentId: DEPLOYMENT_ID,
    closureManifestSha256: manifestSha256,
    disclosurePolicy:
      "Counts and SHA-256 digests of exact matches only. No matched substring or source byte is stored in this public artifact.",
    summary: {
      scannedFileCount: secretFiles.length,
      filesWithMatches: secretFiles.filter((file) => file.matches.length > 0).length,
      totalMatches: secretFiles.reduce(
        (sum, file) =>
          sum + file.matches.reduce((inner, match) => inner + match.count, 0),
        0,
      ),
      byPattern: aggregateSecretInventory(secretFiles),
    },
    files: secretFiles.filter((file) => file.matches.length > 0),
  };
  writeFileSync(SECRET_INVENTORY_PATH, stableJson(secretInventory), "utf8");
  const trigger = await captureTrigger(vercel.deployment);
  trigger.capturedAt = capturedAt;
  trigger.vercelDeploymentId = DEPLOYMENT_ID;
  writeFileSync(TRIGGER_PATH, stableJson(trigger), "utf8");

  const summary = {
    captureStatus: "PASS",
    sourceInputFileCount: vercel.sourceRows.length,
    closureFileCount: closureFiles.length,
    closureEdgeCount: closure.edges.length,
    unresolvedStaticCount: closure.unresolvedStatic.length,
    computedReferenceCount: closure.computedReferences.length,
    gitReconstructableCount: manifest.closure.gitReconstructableCount,
    privateBlobRequiredCount: manifest.closure.privateBlobRequiredCount,
    secretPatternMatchCount: manifest.closure.secretPatternMatchCount,
    triggerCaptureStatus: trigger.captureStatus,
    sourceIndexSha256,
    manifestSha256,
    secretInventorySha256: sha256(readFileSync(SECRET_INVENTORY_PATH)),
    triggerProvenanceSha256: sha256(readFileSync(TRIGGER_PATH)),
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

await main();
