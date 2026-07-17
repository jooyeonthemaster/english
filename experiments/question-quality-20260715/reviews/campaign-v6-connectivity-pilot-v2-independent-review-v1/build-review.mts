import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const tsxCli = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const verifierPath = path.join(here, "verify.mts");

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

const sourceRun = spawnSync(process.execPath, [tsxCli, verifierPath, "--print-source-hashes"], {
  cwd: repoRoot,
  encoding: "utf8",
  env: {
    PATH: process.env.PATH ?? "",
    SystemRoot: process.env.SystemRoot ?? "",
    TEMP: process.env.TEMP ?? "",
    TMP: process.env.TMP ?? "",
  },
  windowsHide: true,
});
if (sourceRun.status !== 0) {
  throw new Error(`source-hash build failed: ${sourceRun.stderr}`);
}
writeFileSync(path.join(here, "SOURCE-HASHES.sha256"), sourceRun.stdout.replace(/\r\n/gu, "\n"), "utf8");

const result = {
  schemaVersion: "question-quality-independent-review-result-v1",
  reviewId: "campaign-v6-connectivity-pilot-v2-independent-review-v1",
  reviewedTarget: "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2",
  verdict: "FAIL",
  disposition: "DO_NOT_AUTHORIZE_OR_DISPATCH; PRESERVE_V2_AS_HISTORY; REBUILD_AS_V3",
  findings: [
    {
      id: "F-001",
      severity: "CRITICAL",
      title: "Production runner exposes a mutable test-mode injected transport path",
      evidence: {
        file: "runner.ts",
        exports: [
          "createOfflineInjectedTransportCapability",
          "createOfflineInjectedTransportTestPermit",
          "runConnectivityPilotWithInjectedTransport",
        ],
        syntheticDelegateInvocations: 1,
        syntheticProviderCallsRecorded: 1,
        realNetworkUsed: false,
      },
      consequence: "The sealed live authorization booleans are not the sole execution authority in this package.",
      requiredCorrection: "Remove every injected-transport/test-mode path from the production runner and place network-incapable deterministic tests outside the live import closure.",
    },
    {
      id: "F-002",
      severity: "CRITICAL",
      title: "The committed source closure is partial",
      evidence: {
        independentlyResolvedFullRepositoryFiles: 198,
        independentlyResolvedCompilerRepositoryFiles: 189,
        independentlyResolvedRuntimeRepositoryFiles: 9,
        targetPrivateArtifactClaimedFiles: 32,
        omittedCompilerImportFiles: 162,
        targetVerifierRule: "local closure count >= 7",
      },
      consequence: "A minimum file-count check and a hand-maintained subset do not bind the complete code graph that builds the exact wire.",
      requiredCorrection: "Commit and verify exact sorted transitive live/compiler closure sets, hashes, data inputs, and zero unresolved local imports.",
    },
  ],
  reproducedTargetGates: {
    targetManifestRows: 13,
    targetOfflineTestsPassed: 22,
    targetScopedTypeScriptPassed: true,
    targetDocumentedVerifierPassed: true,
    note: "Passing author gates does not offset F-001 or F-002.",
  },
  safetyCounters: {
    externalNetworkCalls: 0,
    providerCalls: 0,
    modelCalls: 0,
    apiCandidatesConsumed: 0,
    realCredentialValueReads: 0,
    productionDatabaseReads: 0,
    ephemeralSyntheticSQLiteOnly: true,
  },
};
writeFileSync(path.join(here, "result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");

const readme = `# Connectivity pilot v2 independent review v1

Verdict: **FAIL**. This review used only local source inspection, deterministic synthetic responses, and an ephemeral synthetic SQLite store. It made no external network, provider, model, production database, or real-credential access and consumed 0/1,000 candidates.

Two independent release-blocking findings were reproduced: the production runner exposes a mutable test-mode injected-transport execution path, and the package does not commit the complete transitive source graph used to build the wire. The target package remains unmodified and its author tests still pass; those facts do not resolve either design defect.

Run \`node --import tsx experiments/question-quality-20260715/reviews/campaign-v6-connectivity-pilot-v2-independent-review-v1/verify.mts\` from the repository root to reproduce the review.
`;
writeFileSync(path.join(here, "README.md"), readme, "utf8");

const artifactPaths = ["README.md", "SOURCE-HASHES.sha256", "result.json", "verify.mts"];
const manifest = {
  schemaVersion: "question-quality-independent-review-manifest-v1",
  reviewId: "campaign-v6-connectivity-pilot-v2-independent-review-v1",
  selfExcluded: true,
  artifacts: artifactPaths.map((relativePath) => {
    const bytes = readFileSync(path.join(here, relativePath));
    return { path: relativePath, bytes: bytes.byteLength, sha256: sha256(bytes) };
  }),
};
writeFileSync(path.join(here, "REVIEW-MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

process.stdout.write(`${JSON.stringify({ built: true, artifacts: manifest.artifacts.length }, null, 2)}\n`);
