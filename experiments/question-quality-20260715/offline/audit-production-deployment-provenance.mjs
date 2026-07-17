import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../../..");
const PINNED_PATH = join(SCRIPT_DIR, "production-deployment-source-index.json");
const REPORT_PATH = join(SCRIPT_DIR, "production-deployment-provenance.json");
const MARKDOWN_PATH = join(SCRIPT_DIR, "PRODUCTION-DEPLOYMENT-PROVENANCE.md");

const DEPLOYMENT_ID = "dpl_CKkd1eiFq2DeEidwSxQpFSgDm4ZD";
const TEAM_ID = "team_E667d87IgVl41eB1kUydTqPA";
const DEPLOYMENT_URL =
  "nara-qn6rcsvkh-jooyoens-projects-59877186.vercel.app";

function sha1(buffer) {
  return createHash("sha1").update(buffer).digest("hex");
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
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

function normalizePath(value) {
  return value.split(sep).join("/");
}

function isRelevant(localPath) {
  return (
    localPath === "package.json" ||
    localPath === "package-lock.json" ||
    localPath === "src/trigger/workbench-question-generation.ts" ||
    localPath.startsWith(
      "src/app/api/ai/generate-questions-auto/",
    ) ||
    localPath.startsWith(
      "src/app/api/workbench/ai-jobs/question-generation/",
    ) ||
    localPath === "src/lib/atlas-ai.ts" ||
    localPath === "src/lib/atlas.ts" ||
    localPath === "src/lib/atlas-chat-rest.ts" ||
    localPath === "src/lib/atlas-research-fetch-boundary.ts" ||
    localPath.startsWith("src/lib/question-generation") ||
    localPath.startsWith("src/lib/question-quality/")
  );
}

function flattenDeploymentTree(nodes, prefix = "") {
  const rows = [];
  for (const node of nodes) {
    const deploymentPath = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === "file") {
      const localPath = deploymentPath.startsWith("src/")
        ? deploymentPath.slice(4)
        : deploymentPath;
      if (isRelevant(localPath)) {
        rows.push({
          deploymentPath,
          localPath,
          type: node.type,
          uid: node.uid,
        });
      }
    }
    if (Array.isArray(node.children)) {
      rows.push(...flattenDeploymentTree(node.children, deploymentPath));
    }
  }
  return rows;
}

async function vercelJson(path) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error("VERCEL_TOKEN is required for --live");
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(
    `https://api.vercel.com${path}${separator}teamId=${TEAM_ID}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    throw new Error(`Vercel ${path} failed with HTTP ${response.status}`);
  }
  return response.json();
}

async function capturePinnedIndex() {
  const [deployment, fileTree] = await Promise.all([
    vercelJson(`/v13/deployments/${DEPLOYMENT_ID}`),
    vercelJson(`/v6/deployments/${DEPLOYMENT_ID}/files`),
  ]);
  if (deployment.id !== DEPLOYMENT_ID || deployment.url !== DEPLOYMENT_URL) {
    throw new Error("deployment identity mismatch");
  }
  const files = flattenDeploymentTree(fileTree).sort((a, b) =>
    a.localPath.localeCompare(b.localPath),
  );
  if (files.length < 40 || files.some((row) => !/^[a-f0-9]{40}$/.test(row.uid))) {
    throw new Error("unexpected or incomplete relevant deployment file index");
  }
  const pinned = {
    schemaVersion: 1,
    capturedAtKst: new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .format(new Date())
      .replace(" ", "T") + "+09:00",
    deployment: {
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
    },
    files,
  };
  writeFileSync(PINNED_PATH, stableJson(pinned), "utf8");
  return pinned;
}

function walkLocalFiles(directory, rows = []) {
  for (const name of readdirSync(directory)) {
    if (name === ".git" || name === "node_modules" || name === ".next") continue;
    const absolute = join(directory, name);
    const info = statSync(absolute);
    if (info.isDirectory()) walkLocalFiles(absolute, rows);
    if (info.isFile()) {
      const localPath = normalizePath(relative(REPO_ROOT, absolute));
      if (isRelevant(localPath)) rows.push(localPath);
    }
  }
  return rows;
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: options.encoding ?? "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "ignore"],
  });
}

function historyMatches(localPath, deployedUid) {
  let commits = [];
  try {
    commits = git(["log", "--all", "--format=%H", "--", localPath])
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
      content = git(["show", `${commit}:${localPath}`], {
        encoding: null,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      continue;
    }
    const lf = Buffer.from(content.toString("utf8").replace(/\r\n/g, "\n"));
    const crlf = Buffer.from(lf.toString("utf8").replace(/\n/g, "\r\n"));
    let eolVariant = null;
    if (sha1(content) === deployedUid) eolVariant = "git-object-bytes";
    else if (sha1(lf) === deployedUid) eolVariant = "lf";
    else if (sha1(crlf) === deployedUid) eolVariant = "crlf";
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
  if (row.currentLfSha1 === row.deployedUid || row.currentCrlfSha1 === row.deployedUid) {
    return "CURRENT_EOL_EQUIVALENT";
  }
  if (row.historyMatches.length > 0) return "HISTORY_RECONSTRUCTABLE_DRIFT";
  return "DEPLOYED_UNMATCHED_DRIFT";
}

function deriveReport(pinned) {
  const deployedByPath = new Map(
    pinned.files.map((row) => [row.localPath, row]),
  );
  const localPaths = walkLocalFiles(REPO_ROOT);
  const union = [...new Set([...deployedByPath.keys(), ...localPaths])].sort();
  const files = union.map((localPath) => {
    const deployed = deployedByPath.get(localPath);
    const absolute = join(REPO_ROOT, ...localPath.split("/"));
    const current = existsSync(absolute) ? readFileSync(absolute) : null;
    const currentLf = current
      ? Buffer.from(current.toString("utf8").replace(/\r\n/g, "\n"))
      : null;
    const currentCrlf = currentLf
      ? Buffer.from(currentLf.toString("utf8").replace(/\n/g, "\r\n"))
      : null;
    const row = {
      localPath,
      deploymentPath: deployed?.deploymentPath ?? null,
      deployedUid: deployed?.uid ?? null,
      currentRawSha1: current ? sha1(current) : null,
      currentLfSha1: currentLf ? sha1(currentLf) : null,
      currentCrlfSha1: currentCrlf ? sha1(currentCrlf) : null,
      historyMatches: deployed ? historyMatches(localPath, deployed.uid) : [],
    };
    return { ...row, status: classify(row) };
  });
  const statusCounts = Object.fromEntries(
    [...new Set(files.map((row) => row.status))]
      .sort()
      .map((status) => [
        status,
        files.filter((row) => row.status === status).length,
      ]),
  );
  const originCommitCounts = {};
  for (const row of files) {
    const commit = row.historyMatches[0]?.commit;
    if (commit) originCommitCounts[commit] = (originCommitCounts[commit] ?? 0) + 1;
  }
  return {
    schemaVersion: 1,
    pinnedIndexSha256: sha256(Buffer.from(stableJson(pinned))),
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
        Object.entries(originCommitCounts).sort((a, b) =>
          a[0].localeCompare(b[0]),
        ),
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
    lines.push(
      `| \`${row.localPath}\` | ${row.status} | ${row.deployedUid ? `\`${row.deployedUid}\`` : "—"} | ${row.historyMatches[0] ? `\`${row.historyMatches[0].commit.slice(0, 12)}\` (${row.historyMatches[0].eolVariant})` : "—"} |`,
    );
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

const live = process.argv.includes("--live");
if (!live && !existsSync(PINNED_PATH)) {
  throw new Error("pinned index missing; run once with --live and VERCEL_TOKEN");
}
const pinned = live
  ? await capturePinnedIndex()
  : JSON.parse(readFileSync(PINNED_PATH, "utf8"));
const report = deriveReport(pinned);
writeFileSync(REPORT_PATH, stableJson(report), "utf8");
writeFileSync(MARKDOWN_PATH, renderMarkdown(report), "utf8");

console.log(
  JSON.stringify({
    mode: live ? "live-capture" : "pinned-rebuild",
    pinnedIndexSha256: report.pinnedIndexSha256,
    reportSha256: sha256(readFileSync(REPORT_PATH)),
    markdownSha256: sha256(readFileSync(MARKDOWN_PATH)),
    ...report.summary,
  }),
);
