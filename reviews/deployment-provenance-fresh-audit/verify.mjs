import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep, posix } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const EXPERIMENT = join(ROOT, "experiments/question-quality-20260715");
const OFFLINE = join(EXPERIMENT, "offline");
const PINNED_PATH = join(OFFLINE, "production-deployment-source-index.json");
const REPORT_PATH = join(OFFLINE, "production-deployment-provenance.json");
const MARKDOWN_PATH = join(OFFLINE, "PRODUCTION-DEPLOYMENT-PROVENANCE.md");
const ORIGINAL_SCRIPT_PATH = join(
  OFFLINE,
  "audit-production-deployment-provenance.mjs",
);
const BASELINE_PATH = join(EXPERIMENT, "baseline-evidence.json");
const RESEARCH_NOTE_PATH = join(EXPERIMENT, "research-note.md");

const DEPLOYMENT_ID = "dpl_CKkd1eiFq2DeEidwSxQpFSgDm4ZD";
const TEAM_ID = "team_E667d87IgVl41eB1kUydTqPA";
const DEPLOYMENT_URL =
  "nara-qn6rcsvkh-jooyoens-projects-59877186.vercel.app";

const EXPECTED = {
  deployed: 69,
  union: 71,
  currentExact: 58,
  historyDrift: 11,
  localOnly: 2,
  unmatched: 0,
  pinnedSha256:
    "aae88590de597fb6d19c2884493337d4a97dcac43da654e956d9926142fa3fa1",
  reportSha256:
    "74a5a3c09f5dddf25f2acfc87d7ff57b0c14f646df78959a88aa030eaf2db636",
  markdownSha256:
    "30f346331b40f4864163e69bbf65b1e063538da89623dfc1ccc07e9a07c12806",
  originalScriptSha256:
    "7e27e45a463ba49b9ff4278b058b9e9e4f45fb18ad48bbae939f60de70abdfb5",
  driftPaths: [
    "src/app/api/ai/generate-questions-auto/_lib/constants.ts",
    "src/app/api/ai/generate-questions-auto/_lib/prompts.ts",
    "src/app/api/ai/generate-questions-auto/_lib/question-repair.ts",
    "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts",
    "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
    "src/lib/atlas-ai.ts",
    "src/lib/question-generation-prompt-contract.ts",
    "src/lib/question-quality/core.ts",
    "src/lib/question-quality/dispatcher.ts",
    "src/lib/question-quality/validators/blank/inference.ts",
    "src/lib/question-quality/validators/grammar/combo.ts",
  ],
  localOnlyPaths: [
    "src/lib/atlas-research-fetch-boundary.ts",
    "src/lib/question-quality/validators/blank/seam.ts",
  ],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function digest(algorithm, value) {
  return createHash(algorithm).update(value).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

function stableJson(value) {
  return `${JSON.stringify(stable(value), null, 2)}\n`;
}

function sameJson(left, right) {
  return stableJson(left) === stableJson(right);
}

function firstDifference(left, right, path = "$") {
  if (Object.is(left, right)) return null;
  if (typeof left !== typeof right) return { path, left, right };
  if (!left || !right || typeof left !== "object") return { path, left, right };
  if (Array.isArray(left) !== Array.isArray(right)) return { path, left, right };
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (!sameJson(leftKeys, rightKeys)) {
    return { path: `${path}.[keys]`, left: leftKeys, right: rightKeys };
  }
  for (const key of leftKeys) {
    const difference = firstDifference(left[key], right[key], `${path}.${key}`);
    if (difference) return difference;
  }
  return null;
}

function firstTextDifference(left, right) {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) index += 1;
  if (index === left.length && index === right.length) return null;
  return {
    index,
    left: left.slice(Math.max(0, index - 40), index + 80),
    right: right.slice(Math.max(0, index - 40), index + 80),
    leftLength: left.length,
    rightLength: right.length,
  };
}

function slash(value) {
  return value.split(sep).join("/");
}

// This intentionally re-states the original report's narrow selection rule.
// It is separately audited below against the actual static local import closure.
function withinPinnedSelection(localPath) {
  const exact = new Set([
    "package.json",
    "package-lock.json",
    "src/trigger/workbench-question-generation.ts",
    "src/lib/atlas-ai.ts",
    "src/lib/atlas.ts",
    "src/lib/atlas-chat-rest.ts",
    "src/lib/atlas-research-fetch-boundary.ts",
  ]);
  const prefixes = [
    "src/app/api/ai/generate-questions-auto/",
    "src/app/api/workbench/ai-jobs/question-generation/",
    "src/lib/question-generation",
    "src/lib/question-quality/",
  ];
  return exact.has(localPath) || prefixes.some((prefix) => localPath.startsWith(prefix));
}

function deploymentToLocal(deploymentPath) {
  return deploymentPath.startsWith("src/")
    ? deploymentPath.slice("src/".length)
    : deploymentPath;
}

function flattenTree(nodes, prefix = "") {
  const files = [];
  for (const node of nodes) {
    const deploymentPath = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === "file") {
      files.push({
        deploymentPath,
        localPath: deploymentToLocal(deploymentPath),
        type: node.type,
        uid: node.uid,
      });
    }
    if (Array.isArray(node.children)) {
      files.push(...flattenTree(node.children, deploymentPath));
    }
  }
  return files;
}

function walk(directory, output = []) {
  for (const entry of readdirSync(directory)) {
    if (entry === ".git" || entry === "node_modules" || entry === ".next") continue;
    const absolute = join(directory, entry);
    const info = statSync(absolute);
    if (info.isDirectory()) walk(absolute, output);
    if (info.isFile()) {
      const localPath = slash(relative(ROOT, absolute));
      if (withinPinnedSelection(localPath)) output.push(localPath);
    }
  }
  return output;
}

function git(args, encoding = "utf8") {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function eolVariants(content) {
  const lf = Buffer.from(content.toString("utf8").replace(/\r\n/g, "\n"));
  const crlf = Buffer.from(lf.toString("utf8").replace(/\n/g, "\r\n"));
  return { content, lf, crlf };
}

function reconstructingHistory(localPath, deployedUid) {
  let commits;
  try {
    commits = git(["rev-list", "--all", "--", localPath])
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  } catch {
    return [];
  }
  const matches = [];
  for (const commit of commits) {
    let content;
    try {
      content = git(["show", `${commit}:${localPath}`], null);
    } catch {
      continue;
    }
    const variants = eolVariants(content);
    let eolVariant = null;
    if (digest("sha1", variants.content) === deployedUid) {
      eolVariant = "git-object-bytes";
    } else if (digest("sha1", variants.lf) === deployedUid) {
      eolVariant = "lf";
    } else if (digest("sha1", variants.crlf) === deployedUid) {
      eolVariant = "crlf";
    }
    if (!eolVariant) continue;
    const [authoredAt, subject] = git([
      "show",
      "-s",
      "--format=%aI%x00%s",
      commit,
    ]).split("\0");
    matches.push({
      commit,
      authoredAt: authoredAt.trim(),
      subject: subject.trim(),
      eolVariant,
    });
  }
  return matches;
}

function classify(row) {
  if (!row.deployedUid) return "LOCAL_ONLY_POST_DEPLOYMENT";
  if (row.currentRawSha1 === row.deployedUid) return "CURRENT_EXACT";
  if (
    row.currentLfSha1 === row.deployedUid ||
    row.currentCrlfSha1 === row.deployedUid
  ) {
    return "CURRENT_EOL_EQUIVALENT";
  }
  if (row.historyMatches.length) return "HISTORY_RECONSTRUCTABLE_DRIFT";
  return "DEPLOYED_UNMATCHED_DRIFT";
}

function deriveReport(pinned) {
  const deployed = new Map(pinned.files.map((file) => [file.localPath, file]));
  const union = [...new Set([...deployed.keys(), ...walk(ROOT)])].sort();
  const files = union.map((localPath) => {
    const pinnedFile = deployed.get(localPath);
    const absolute = join(ROOT, ...localPath.split("/"));
    const current = existsSync(absolute) ? readFileSync(absolute) : null;
    const variants = current ? eolVariants(current) : null;
    const row = {
      localPath,
      deploymentPath: pinnedFile?.deploymentPath ?? null,
      deployedUid: pinnedFile?.uid ?? null,
      currentRawSha1: variants ? digest("sha1", variants.content) : null,
      currentLfSha1: variants ? digest("sha1", variants.lf) : null,
      currentCrlfSha1: variants ? digest("sha1", variants.crlf) : null,
      historyMatches: pinnedFile
        ? reconstructingHistory(localPath, pinnedFile.uid)
        : [],
    };
    return { ...row, status: classify(row) };
  });
  const statuses = [...new Set(files.map((file) => file.status))].sort();
  const statusCounts = Object.fromEntries(
    statuses.map((status) => [
      status,
      files.filter((file) => file.status === status).length,
    ]),
  );
  const origins = {};
  for (const file of files) {
    const commit = file.historyMatches[0]?.commit;
    if (commit) origins[commit] = (origins[commit] ?? 0) + 1;
  }
  return {
    schemaVersion: 1,
    pinnedIndexSha256: digest("sha256", Buffer.from(stableJson(pinned))),
    deployment: pinned.deployment,
    local: {
      head: git(["rev-parse", "HEAD"]).trim(),
      branch: git(["branch", "--show-current"]).trim(),
      isDirty: git(["status", "--porcelain"]).trim().length > 0,
    },
    summary: {
      relevantDeployedFiles: pinned.files.length,
      relevantUnionFiles: files.length,
      statusCounts,
      newestHistoryMatchCountByCommit: Object.fromEntries(
        Object.entries(origins).sort(([left], [right]) => left.localeCompare(right)),
      ),
      sourceClaim:
        "The deployment metadata pins a Git SHA but gitDirty=1. Per-file UIDs are treated as raw SHA-1 evidence; only exact current/history byte or EOL-normalized matches are reconstructable.",
    },
    files,
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Production deployment provenance",
    "",
    `Deployment: \`${report.deployment.id}\``,
    `URL: \`${report.deployment.url}\``,
    `Metadata Git SHA: \`${report.deployment.githubCommitSha}\``,
    `Metadata branch: \`${report.deployment.githubCommitRef}\``,
    `CLI dirty flag: \`${report.deployment.gitDirty}\``,
    "",
    "The metadata SHA is not the full source identity because this was a CLI deployment from a dirty worktree. The table below compares Vercel's pinned per-file raw SHA-1 identifiers with the current worktree and every content-changing Git revision. `HISTORY_RECONSTRUCTABLE_DRIFT` means the exact deployed bytes (allowing only line-ending normalization) can be reconstructed from the listed commit; `DEPLOYED_UNMATCHED_DRIFT` cannot.",
    "",
    "## Summary",
    "",
    `- Relevant deployed files: ${report.summary.relevantDeployedFiles}`,
    `- Relevant current/deployed union: ${report.summary.relevantUnionFiles}`,
    ...Object.entries(report.summary.statusCounts).map(
      ([status, count]) => `- ${status}: ${count}`,
    ),
    "",
    "## File provenance",
    "",
    "| File | Status | Deployed UID | Newest reconstructing commit |",
    "|---|---:|---|---|",
  ];
  for (const row of report.files) {
    const uid = row.deployedUid ? `\`${row.deployedUid}\`` : "—";
    const origin = row.historyMatches[0]
      ? `\`${row.historyMatches[0].commit.slice(0, 12)}\` (${row.historyMatches[0].eolVariant})`
      : "—";
    lines.push(`| \`${row.localPath}\` | ${row.status} | ${uid} | ${origin} |`);
  }
  lines.push(
    "",
    "## Interpretation guard",
    "",
    "Historical database rows must be joined to the production snapshot actually serving at their generation time. The current worktree, metadata SHA alone, and any single historical commit are not substitutes for this dirty deployment's per-file provenance.",
    "",
  );
  return lines.join("\n");
}

function parseBaseline() {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  const deployment = baseline.productionDeployment;
  assert(deployment, "baseline productionDeployment is absent");
  return deployment;
}

function verifyOffline() {
  const pinnedBytes = readFileSync(PINNED_PATH);
  const reportBytes = readFileSync(REPORT_PATH);
  const markdownBytes = readFileSync(MARKDOWN_PATH);
  const originalScriptBytes = readFileSync(ORIGINAL_SCRIPT_PATH);
  const pinned = JSON.parse(pinnedBytes);
  const recorded = JSON.parse(reportBytes);
  const baseline = parseBaseline();
  const note = readFileSync(RESEARCH_NOTE_PATH, "utf8");

  assert(digest("sha256", pinnedBytes) === EXPECTED.pinnedSha256, "pinned hash drift");
  assert(digest("sha256", reportBytes) === EXPECTED.reportSha256, "report hash drift");
  assert(
    digest("sha256", markdownBytes) === EXPECTED.markdownSha256,
    "markdown hash drift",
  );
  assert(
    digest("sha256", originalScriptBytes) === EXPECTED.originalScriptSha256,
    "original script hash drift",
  );
  assert(pinned.schemaVersion === 1, "unexpected pinned schema");
  assert(pinned.files.length === EXPECTED.deployed, "unexpected pinned file count");
  assert(pinned.deployment.id === DEPLOYMENT_ID, "deployment ID mismatch");
  assert(pinned.deployment.url === DEPLOYMENT_URL, "deployment URL mismatch");
  assert(pinned.deployment.source === "cli", "deployment source is not CLI");
  assert(pinned.deployment.gitDirty === "1", "dirty metadata mismatch");
  assert(
    pinned.deployment.githubCommitSha ===
      "467c6d107137a91088d3eba1620ba4036a63d709",
    "metadata Git SHA mismatch",
  );

  const localPaths = pinned.files.map((file) => file.localPath);
  assert(new Set(localPaths).size === localPaths.length, "duplicate local path");
  assert(
    sameJson(localPaths, [...localPaths].sort()),
    "pinned local paths are not sorted",
  );
  assert(
    pinned.files.every(
      (file) =>
        file.deploymentPath === `src/${file.localPath}` &&
        file.type === "file" &&
        /^[a-f0-9]{40}$/.test(file.uid) &&
        withinPinnedSelection(file.localPath),
    ),
    "path mapping, UID format, or narrow predicate mismatch",
  );

  const derived = deriveReport(pinned);
  const derivedBytes = Buffer.from(stableJson(derived));
  const reportDifference = firstDifference(derived, recorded);
  const recordedStableBytes = Buffer.from(stableJson(recorded));
  const recordedMarkdown = Buffer.from(renderMarkdown(recorded));
  assert(
    digest("sha256", recordedStableBytes) === EXPECTED.reportSha256,
    "recorded report is not canonical stable JSON",
  );
  assert(
    digest("sha256", recordedMarkdown) === EXPECTED.markdownSha256,
    `recorded report does not deterministically render the pinned markdown: ${JSON.stringify(
      firstTextDifference(recordedMarkdown.toString("utf8"), markdownBytes.toString("utf8")),
    )}`,
  );

  // Recheck every recorded history match and status without trusting the original
  // script. Current working-tree bytes may legitimately have moved since capture.
  const pinnedByPath = new Map(pinned.files.map((file) => [file.localPath, file]));
  const derivedByPath = new Map(derived.files.map((file) => [file.localPath, file]));
  for (const row of recorded.files) {
    const pinnedFile = pinnedByPath.get(row.localPath);
    assert(
      row.deployedUid === (pinnedFile?.uid ?? null) &&
        row.deploymentPath === (pinnedFile?.deploymentPath ?? null),
      `recorded pinned identity mismatch: ${row.localPath}`,
    );
    const freshHistory = derivedByPath.get(row.localPath)?.historyMatches ?? [];
    assert(
      sameJson(freshHistory, row.historyMatches),
      `recorded history mismatch: ${row.localPath}`,
    );
    assert(classify(row) === row.status, `recorded status misclassified: ${row.localPath}`);
  }

  const counts = recorded.summary.statusCounts;
  assert(recorded.summary.relevantDeployedFiles === EXPECTED.deployed, "69 mismatch");
  assert(recorded.summary.relevantUnionFiles === EXPECTED.union, "71 mismatch");
  assert(counts.CURRENT_EXACT === EXPECTED.currentExact, "58 mismatch");
  assert(
    counts.HISTORY_RECONSTRUCTABLE_DRIFT === EXPECTED.historyDrift,
    "11 mismatch",
  );
  assert(counts.LOCAL_ONLY_POST_DEPLOYMENT === EXPECTED.localOnly, "2 mismatch");
  assert(
    (counts.DEPLOYED_UNMATCHED_DRIFT ?? 0) === EXPECTED.unmatched,
    "unmatched mismatch",
  );
  const drift = recorded.files
    .filter((file) => file.status === "HISTORY_RECONSTRUCTABLE_DRIFT")
    .map((file) => file.localPath);
  const localOnly = recorded.files
    .filter((file) => file.status === "LOCAL_ONLY_POST_DEPLOYMENT")
    .map((file) => file.localPath);
  assert(sameJson(drift, EXPECTED.driftPaths), "drift path list mismatch");
  assert(sameJson(localOnly, EXPECTED.localOnlyPaths), "local-only path list mismatch");

  const snapshot = baseline.sourceSnapshot;
  assert(baseline.source === "cli" && baseline.gitDirty === true, "baseline metadata drift");
  assert(snapshot.relevantDeployedFiles === 69, "baseline deployed count drift");
  assert(snapshot.currentExact === 58, "baseline exact count drift");
  assert(snapshot.historyReconstructableDrift === 11, "baseline drift count drift");
  assert(snapshot.localOnlyPostDeployment === 2, "baseline local-only count drift");
  assert(snapshot.unmatchedDeployedFiles === 0, "baseline unmatched count drift");
  assert(snapshot.pinnedIndexSha256 === EXPECTED.pinnedSha256, "baseline pinned hash drift");
  assert(snapshot.reportSha256 === EXPECTED.reportSha256, "baseline report hash drift");
  assert(snapshot.markdownSha256 === EXPECTED.markdownSha256, "baseline markdown hash drift");
  assert(
    snapshot.auditScriptSha256 === EXPECTED.originalScriptSha256,
    "baseline script hash drift",
  );
  for (const value of [
    "source는 `cli`",
    "`gitDirty`는 `1`",
    "69개 파일",
    "58개는 현재와 exact",
    "11개는 현재와 다르지만",
    "unmatched 배포 파일은 0개",
    EXPECTED.pinnedSha256,
    EXPECTED.reportSha256,
    EXPECTED.markdownSha256,
  ]) {
    assert(note.includes(value), `research O40 evidence missing: ${value}`);
  }

  return {
    pinnedIndexSha256: digest("sha256", pinnedBytes),
    reportSha256: digest("sha256", recordedStableBytes),
    markdownSha256: digest("sha256", recordedMarkdown),
    originalScriptSha256: digest("sha256", originalScriptBytes),
    currentStateRebuildSha256: digest("sha256", derivedBytes),
    currentStateRebuildMatchesRecorded: reportDifference === null,
    currentStateFirstDifference: reportDifference,
    counts: {
      deployed: recorded.summary.relevantDeployedFiles,
      union: recorded.summary.relevantUnionFiles,
      ...counts,
      DEPLOYED_UNMATCHED_DRIFT: counts.DEPLOYED_UNMATCHED_DRIFT ?? 0,
    },
    currentStateCounts: {
      deployed: derived.summary.relevantDeployedFiles,
      union: derived.summary.relevantUnionFiles,
      ...derived.summary.statusCounts,
      DEPLOYED_UNMATCHED_DRIFT:
        derived.summary.statusCounts.DEPLOYED_UNMATCHED_DRIFT ?? 0,
    },
    driftPaths: drift,
    localOnlyPaths: localOnly,
  };
}

function loadStoredToken() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  const appData = process.env.APPDATA;
  const authPath = appData
    ? join(appData, "com.vercel.cli", "Data", "auth.json")
    : null;
  if (!authPath || !existsSync(authPath)) return null;
  const auth = JSON.parse(readFileSync(authPath, "utf8"));
  return typeof auth.token === "string" ? auth.token : null;
}

async function vercelFetch(token, apiPath) {
  const url = new URL(`https://api.vercel.com${apiPath}`);
  url.searchParams.set("teamId", TEAM_ID);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`${apiPath}: HTTP ${response.status}`);
  return response;
}

async function mapLimit(values, limit, mapper) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return output;
}

const MODULE_EXTENSIONS = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.json",
];

function importSpecifiers(source) {
  const values = [];
  const expressions = [
    /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s*)?["']([^"']+)["']/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const expression of expressions) {
    for (const match of source.matchAll(expression)) values.push(match[1]);
  }
  return [...new Set(values)];
}

function resolveLocalImport(from, specifier, allByLocalPath) {
  let base;
  if (specifier.startsWith("@/")) {
    base = `src/${specifier.slice(2)}`;
  } else if (specifier.startsWith(".")) {
    base = posix.normalize(posix.join(posix.dirname(from), specifier));
  } else {
    return null;
  }
  for (const extension of MODULE_EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (allByLocalPath.has(candidate)) return candidate;
  }
  return undefined;
}

async function verifyLive({ fullClosure }) {
  const token = loadStoredToken();
  assert(token, "no Vercel credential available for read-only live verification");
  const pinned = JSON.parse(readFileSync(PINNED_PATH, "utf8"));
  const [deployment, tree] = await Promise.all([
    vercelFetch(token, `/v13/deployments/${DEPLOYMENT_ID}`).then((r) => r.json()),
    vercelFetch(token, `/v6/deployments/${DEPLOYMENT_ID}/files`).then((r) => r.json()),
  ]);
  const liveMetadata = {
    id: deployment.id,
    url: deployment.url,
    source: deployment.source ?? null,
    target: deployment.target ?? null,
    readyState: deployment.readyState ?? null,
    createdAt: deployment.createdAt ?? null,
    githubCommitSha: deployment.meta?.githubCommitSha ?? null,
    githubCommitRef: deployment.meta?.githubCommitRef ?? null,
    githubCommitMessage: deployment.meta?.githubCommitMessage ?? null,
    gitDirty: deployment.meta?.gitDirty ?? null,
    actor: deployment.meta?.actor ?? null,
  };
  assert(sameJson(liveMetadata, pinned.deployment), "live deployment metadata drift");

  const allFiles = flattenTree(tree);
  const allByLocalPath = new Map(allFiles.map((file) => [file.localPath, file]));
  assert(allByLocalPath.size === allFiles.length, "local path collision after prefix mapping");
  const liveNarrowSelection = allFiles
    .filter((file) => withinPinnedSelection(file.localPath))
    .sort((left, right) => left.localPath.localeCompare(right.localPath));
  assert(
    sameJson(liveNarrowSelection, pinned.files),
    "live narrow selection differs from pinned index",
  );

  const sourceCache = new Map();
  let downloadedBytes = 0;
  async function deployedSource(localPath) {
    if (sourceCache.has(localPath)) return sourceCache.get(localPath);
    const file = allByLocalPath.get(localPath);
    assert(file, `deployment file missing: ${localPath}`);
    const payload = await vercelFetch(
      token,
      `/v8/deployments/${DEPLOYMENT_ID}/files/${file.uid}`,
    ).then((response) => response.json());
    assert(typeof payload.data === "string", `base64 data missing: ${localPath}`);
    const bytes = Buffer.from(payload.data, "base64");
    assert(digest("sha1", bytes) === file.uid, `raw SHA-1 mismatch: ${localPath}`);
    downloadedBytes += bytes.length;
    const source = bytes.toString("utf8");
    sourceCache.set(localPath, source);
    return source;
  }

  await mapLimit(pinned.files, 6, (file) => deployedSource(file.localPath));
  const pinnedSet = new Set(pinned.files.map((file) => file.localPath));
  const directEdges = [];
  const unresolved = [];
  for (const file of pinned.files) {
    if (!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(file.localPath)) continue;
    const source = await deployedSource(file.localPath);
    for (const specifier of importSpecifiers(source)) {
      const resolved = resolveLocalImport(file.localPath, specifier, allByLocalPath);
      if (resolved === undefined) {
        unresolved.push({ from: file.localPath, specifier });
      } else if (resolved && !pinnedSet.has(resolved)) {
        directEdges.push({ from: file.localPath, specifier, resolved });
      }
    }
  }
  assert(unresolved.length === 0, "unresolved local import in pinned sources");
  const directOmitted = [
    ...new Map(directEdges.map((edge) => [edge.resolved, edge])).values(),
  ].sort((left, right) => left.resolved.localeCompare(right.resolved));

  let closure = [...pinnedSet];
  if (fullClosure) {
    const seen = new Set();
    let cursor = 0;
    while (cursor < closure.length) {
      const batch = closure.slice(cursor, cursor + 8);
      cursor += batch.length;
      await Promise.all(
        batch.map(async (localPath) => {
          seen.add(localPath);
          if (!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(localPath)) return;
          const source = await deployedSource(localPath);
          for (const specifier of importSpecifiers(source)) {
            const resolved = resolveLocalImport(localPath, specifier, allByLocalPath);
            if (resolved === undefined) {
              unresolved.push({ from: localPath, specifier });
            } else if (resolved && !seen.has(resolved) && !closure.includes(resolved)) {
              closure.push(resolved);
            }
          }
        }),
      );
      assert(closure.length <= 1000, "static local import closure exceeded safety bound");
    }
    assert(unresolved.length === 0, "unresolved local import in transitive closure");
  }
  const closureFiles = closure
    .map((localPath) => {
      const file = allByLocalPath.get(localPath);
      return { localPath, uid: file.uid };
    })
    .sort((left, right) => left.localPath.localeCompare(right.localPath));

  return {
    metadata: {
      source: liveMetadata.source,
      githubCommitSha: liveMetadata.githubCommitSha,
      gitDirty: liveMetadata.gitDirty,
      readyState: liveMetadata.readyState,
    },
    deploymentTreeFiles: allFiles.length,
    narrowSelectionFiles: liveNarrowSelection.length,
    rawSha1VerifiedFiles: pinned.files.length,
    downloadedSourceFiles: sourceCache.size,
    downloadedSourceBytes: downloadedBytes,
    directOmittedDependencyFiles: directOmitted.length,
    directOmittedDependencyEdges: directEdges.length,
    directOmittedDependencies: directOmitted.map((edge) => edge.resolved),
    staticLocalImportClosureFiles: fullClosure ? closureFiles.length : null,
    omittedFromPinnedClosure: fullClosure ? closureFiles.length - pinned.files.length : null,
    closureManifestSha256: fullClosure
      ? digest("sha256", Buffer.from(stableJson(closureFiles)))
      : null,
  };
}

const offline = verifyOffline();
const wantsLive = process.argv.includes("--live") || process.argv.includes("--live-closure");
const live = wantsLive
  ? await verifyLive({ fullClosure: process.argv.includes("--live-closure") })
  : null;

console.log(
  JSON.stringify(
    {
      verdict:
        live && live.directOmittedDependencyFiles > 0
          ? "FAIL_SELECTION_INCOMPLETE"
          : "OFFLINE_NUMERICS_PASS_LIVE_COMPLETENESS_NOT_RUN",
      offline,
      live,
    },
    null,
    2,
  ),
);
