import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as materializeModule from "./materialize";
import type { S1ExactWireRow, S1MaterializationInput } from "./materialize";

const materializeExports =
  (materializeModule as unknown as { default?: typeof materializeModule }).default ??
  materializeModule;
const {
  S1_ASSIGNMENT_COUNT,
  S1_BLANK_PROFILES,
  S1_EXACT_ENDPOINT,
  S1_GRAMMAR_PROFILES,
  S1_OUTPUT_CAP_BY_TYPE,
  S1_PROVIDER_ROUTING,
  S1_ROOT_STAGE,
  materializeS1Campaign,
  sha256,
  stableJson,
} = materializeExports;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const bundlePath = path.join(here, "fixture/controller-bundle-v1.json");
const publicPath = path.join(here, "controller-materialization-fixture-v1.json");
const manifestPath = path.join(here, "MANIFEST.sha256");

const MANIFEST_FILES = [
  "materialize.ts",
  "runtime.ts",
  "runtime.test-support.ts",
  "runtime.hostile-types.ts",
  "openrouter-question-parser.ts",
  "build-fixture.ts",
  "verify.mts",
  "materialize.test.ts",
  "tsconfig.json",
  "README.md",
  "fixture/controller-bundle-v1.json",
  "controller-materialization-fixture-v1.json",
] as const;

const SOURCE_CLOSURE_SEEDS = [
  "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/materialize.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/runtime.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/openrouter-question-parser.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/build-fixture.ts",
  "experiments/question-quality-20260715/harness/atlas-controller.ts",
  "experiments/question-quality-20260715/harness/ledger.ts",
  "experiments/question-quality-20260715/harness/question-generation-callsite-adapter.ts",
  "experiments/question-quality-20260715/pricing/snapshot-openrouter-pricing.ts",
  "src/lib/atlas-research-fetch-boundary.ts",
  "src/lib/atlas-ai.ts",
] as const;

function resolveLocalImport(fromRelativePath: string, specifier: string): string | null {
  if (specifier.startsWith("node:") || (!specifier.startsWith(".") && !specifier.startsWith("@/"))) {
    return null;
  }
  const base = specifier.startsWith("@/")
    ? path.join(repoRoot, "src", specifier.slice(2))
    : path.resolve(repoRoot, path.dirname(fromRelativePath), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.cts`,
    `${base}.json`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.mts"),
  ];
  const resolved = candidates.find((candidate) =>
    existsSync(candidate) && statSync(candidate).isFile());
  return resolved ? path.relative(repoRoot, resolved).replace(/\\/g, "/") : null;
}

/** Generated local static/dynamic import graph; no hand-maintained transitive omissions. */
export function collectS1LocalSourceClosure(): string[] {
  const pending: string[] = [...SOURCE_CLOSURE_SEEDS];
  const visited = new Set<string>();
  const specifierPattern =
    /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\sfrom\s*)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/gu;
  while (pending.length > 0) {
    const relativePath = pending.pop()!;
    if (visited.has(relativePath)) continue;
    visited.add(relativePath);
    const absolutePath = path.join(repoRoot, relativePath);
    if (!existsSync(absolutePath)) {
      throw new Error(`source-closure seed/import is missing: ${relativePath}`);
    }
    if (relativePath.endsWith(".json")) continue;
    const source = readFileSync(absolutePath, "utf8");
    for (const match of source.matchAll(specifierPattern)) {
      const dependency = resolveLocalImport(relativePath, match[1] ?? match[2] ?? match[3] ?? "");
      if (dependency && !visited.has(dependency)) pending.push(dependency);
    }
  }
  return [...visited].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function snapshotV2(): unknown {
  const content = {
    schemaVersion: 2,
    fetchedAt: "2026-07-15T00:00:00.000Z",
    source: {
      kind: "OFFLINE_FIXTURE_NO_NETWORK",
      unit: "USD per token",
    },
    routingContract: {
      allowedEndpointTags: ["google-vertex/global"],
      emergencyCeilingScope: "all-active-model-endpoints",
    },
    chargeDimensions: {
      textInputTokens: "MODELED_BY_PROMPT_RATE",
      textOutputTokens: "MODELED_BY_COMPLETION_RATE",
      cachedInputTokens: "INAPPLICABLE_NO_CACHE",
      reasoningTokens: "INAPPLICABLE_REASONING_DISABLED",
      imageTokens: "INAPPLICABLE_TEXT_ONLY",
      webSearch: "INAPPLICABLE_NO_WEB_PLUGIN",
      fixedRequestFees: "NONE",
      unknownDimensions: "REJECT",
    },
    models: [
      {
        id: "google/gemini-3.5-flash",
        canonicalSlug: "google/gemini-3.5-flash-20260519",
        endpointRates: [
          {
            provider: "Google",
            endpointName: "Google Vertex Global | gemini-3.5-flash",
            tag: "google-vertex/global",
            status: "active",
            contextLength: 1_048_576,
            promptUsdPerToken: 0.0000015,
            completionUsdPerToken: 0.000009,
            overrides: [],
          },
          {
            provider: "Google",
            endpointName: "Google Vertex Flex | gemini-3.5-flash",
            tag: "google-vertex/global/flex",
            status: "active",
            contextLength: 1_048_576,
            promptUsdPerToken: 0.00000075,
            completionUsdPerToken: 0.0000045,
            overrides: [],
          },
          {
            provider: "Google",
            endpointName: "Google Vertex Priority | gemini-3.5-flash",
            tag: "google-vertex/global/priority",
            status: "active",
            contextLength: 1_048_576,
            promptUsdPerToken: 0.0000027,
            completionUsdPerToken: 0.0000162,
            overrides: [],
          },
        ],
      },
      {
        id: "google/gemini-3.1-pro-preview",
        canonicalSlug: "google/gemini-3.1-pro-preview-20260219",
        endpointRates: [
          {
            provider: "Google",
            endpointName: "Google Vertex Global | gemini-3.1-pro-preview",
            tag: "google-vertex/global",
            status: "active",
            contextLength: 1_048_576,
            promptUsdPerToken: 0.000002,
            completionUsdPerToken: 0.000012,
            overrides: [{
              minPromptTokens: 200_000,
              promptUsdPerToken: 0.000004,
              completionUsdPerToken: 0.000018,
            }],
          },
          {
            provider: "Google",
            endpointName: "Google Vertex Flex | gemini-3.1-pro-preview",
            tag: "google-vertex/global/flex",
            status: "active",
            contextLength: 1_048_576,
            promptUsdPerToken: 0.000001,
            completionUsdPerToken: 0.000006,
            overrides: [{
              minPromptTokens: 200_000,
              promptUsdPerToken: 0.000002,
              completionUsdPerToken: 0.000009,
            }],
          },
          {
            provider: "Google",
            endpointName: "Google Vertex Priority | gemini-3.1-pro-preview",
            tag: "google-vertex/global/priority",
            status: "active",
            contextLength: 1_048_576,
            promptUsdPerToken: 0.0000036,
            completionUsdPerToken: 0.0000216,
            overrides: [{
              minPromptTokens: 200_000,
              promptUsdPerToken: 0.0000072,
              completionUsdPerToken: 0.0000324,
            }],
          },
        ],
      },
    ],
  };
  return { ...content, snapshotSha256: sha256(JSON.stringify(content)) };
}

function row(
  ordinal: number,
  spec: Pick<
    S1ExactWireRow,
    "passageToken" | "questionType" | "profileId" | "plan" | "difficulty"
  >,
): S1ExactWireRow {
  const padded = String(ordinal).padStart(3, "0");
  const passageUtf8Sha256 = sha256(`fixture-only-original-text:${spec.passageToken}`);
  const rightsRecord = {
    authorship: "CAMPAIGN_ORIGINAL",
    externalModelProcessingAuthorized: true,
    piiReview: "NO_PII_FOUND",
    passageUtf8Sha256,
  } as const;
  return {
    queueOrdinal: ordinal,
    assignmentId: `s1v6-assignment-${padded}`,
    assignmentKey: `fixture-${padded}`,
    ...spec,
    modelId: spec.plan === "STANDARD"
      ? "google/gemini-3.5-flash"
      : "google/gemini-3.1-pro-preview",
    endpoint: S1_EXACT_ENDPOINT,
    endpointSha256: sha256(S1_EXACT_ENDPOINT),
    requestEnvelopeSha256: sha256(`request-envelope:${padded}`),
    wireBodySha256: sha256(`exact-wire-body:${padded}`),
    wireBodyUtf8Bytes: 12_000 + ordinal,
    wirePromptSha256: sha256(`wire-prompt:${padded}`),
    wireSchemaSha256: sha256(`wire-schema:${spec.questionType}`),
    maxOutputTokens: S1_OUTPUT_CAP_BY_TYPE[spec.questionType],
    completionCount: 1,
    candidateOutputsPerCompletion: 1,
    providerRouting: S1_PROVIDER_ROUTING,
    providerRoutingSha256: sha256(stableJson(S1_PROVIDER_ROUTING)),
    reasoning: { enabled: false, effort: "none", exclude: true },
    rootStage: S1_ROOT_STAGE,
    promptProfileArtifactHash: sha256(`profile:${spec.profileId}`),
    gateArtifactHash: sha256("fixture-gate-v1"),
    policyArtifactHash: sha256("fixture-policy-v1"),
    runnerVersion: "campaign-v6-s1-durable-controller-fixture-v1.1",
    gitVersion: "offline-fixture-no-network",
    rights: {
      ...rightsRecord,
      rightsRecordHash: sha256(stableJson(rightsRecord)),
    },
  };
}

function fixtureRows(): S1ExactWireRow[] {
  const specs: Array<Pick<
    S1ExactWireRow,
    "passageToken" | "questionType" | "profileId" | "plan" | "difficulty"
  >> = [];
  for (let passage = 1; passage <= 6; passage++) {
    const passageToken = `original-grammar-${String(passage).padStart(2, "0")}`;
    for (const profileId of S1_GRAMMAR_PROFILES) {
      for (const plan of ["STANDARD", "PREMIUM"] as const) {
        for (const difficulty of ["INTERMEDIATE", "KILLER"] as const) {
          specs.push({ passageToken, questionType: "GRAMMAR_ERROR", profileId, plan, difficulty });
        }
      }
    }
  }
  for (let passage = 1; passage <= 6; passage++) {
    const passageToken = `original-blank-${String(passage).padStart(2, "0")}`;
    for (const profileId of S1_BLANK_PROFILES) {
      const plans = profileId === "B1_TYPE_SCOPED_TAIL"
        ? ["STANDARD"] as const
        : ["STANDARD", "PREMIUM"] as const;
      for (const plan of plans) {
        for (const difficulty of ["INTERMEDIATE", "KILLER"] as const) {
          specs.push({ passageToken, questionType: "BLANK_INFERENCE", profileId, plan, difficulty });
        }
      }
    }
  }
  if (specs.length !== S1_ASSIGNMENT_COUNT) {
    throw new Error(`fixture matrix emitted ${specs.length} cells, expected 180`);
  }
  return specs.map((spec, index) => row(index + 1, spec));
}

export function buildFixtureInput(): S1MaterializationInput {
  const snapshot = snapshotV2() as { snapshotSha256: string };
  const profileManifestMaterial = {
    schemaVersion: "question-quality-s1-v6-profile-artifact-manifest-v1" as const,
    aliasesAllowed: false as const,
    profiles: Object.fromEntries(
      [...S1_GRAMMAR_PROFILES, ...S1_BLANK_PROFILES]
        .map((profileId) => [profileId, sha256(`profile:${profileId}`)]),
    ) as S1MaterializationInput["profileArtifactManifest"]["profiles"],
  };
  return {
    schemaVersion: "question-quality-s1-v6-materializer-input-v1.2",
    experimentId: "S1-V6",
    phaseId: "confirmatory",
    batchId: "campaign-v6-s1",
    campaignId: "campaign-v6-original-corpus",
    preflightSemanticSha256: sha256("fixture-preflight-semantic"),
    preflightArtifactSha256: sha256("fixture-preflight-artifact"),
    parser: {
      attestationId: "openrouter-full-question-v1",
      parserArtifactHash: sha256(
        readFileSync(path.join(here, "openrouter-question-parser.ts")),
      ),
    },
    profileArtifactManifest: {
      ...profileManifestMaterial,
      manifestSha256: sha256(stableJson(profileManifestMaterial)),
    },
    pricing: {
      priceSnapshotId: "openrouter-tagged-fixture-20260715",
      snapshot,
      expectedSnapshotSha256: snapshot.snapshotSha256,
      validThrough: "2026-07-15T00:15:00.000Z",
      safetyMultiplier: 1.1,
      serverTokenOverheadUpperBound: 4_096,
    },
    designAuthorization: {
      status: "BLOCKED_FIXTURE",
      authorizationRecordHash: null,
    },
    assignments: fixtureRows(),
  };
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

export function buildFixtureArtifacts() {
  const bundle = materializeS1Campaign(buildFixtureInput());
  const sourceClosure = collectS1LocalSourceClosure().map((relativePath) => ({
    path: relativePath,
    sha256: sha256(readFileSync(path.join(repoRoot, relativePath))),
  }));
  const publicCore = {
    schemaVersion: "question-quality-s1-v6-durable-controller-fixture-public-v1.2",
    status: bundle.status,
    fixtureOnly: true,
    campaignSemanticSha256: bundle.campaignSemanticSha256,
    durableBatchIdentitySha256: bundle.durableBatchIdentitySha256,
    frozenPricingEnvelopeSha256: bundle.frozenPricingEnvelopeSha256,
    sourceClosure,
    sourceClosureSha256: sha256(stableJson(sourceClosure)),
    tagBoundPricingSnapshotSha256: bundle.priceProof.snapshotSha256,
    counts: {
      assignments: bundle.assignments.length,
      registries: bundle.assignments.length,
      registryEntries: bundle.assignments.reduce(
        (sum, assignment) => sum + assignment.registry.entries.length,
        0,
      ),
      byPlan: countBy(bundle.assignments.map((row) => row.plan)),
      byType: countBy(bundle.assignments.map((row) => row.questionType)),
      byDifficulty: countBy(bundle.assignments.map((row) => row.difficulty)),
      byProfile: countBy(bundle.assignments.map((row) => row.profileId)),
      distinctPassageTokens: new Set(
        bundle.assignments.map((row) => row.registry.entries[0]!.provenance.corpus?.rowId),
      ).size,
      b1Premium: bundle.assignments.filter(
        (row) => row.profileId === "B1_TYPE_SCOPED_TAIL" && row.plan === "PREMIUM",
      ).length,
    },
    caps: bundle.globalEnvelope,
    transportPolicy: bundle.transportPolicy,
    priceProof: bundle.priceProof,
    pricingRefreshPolicy: bundle.pricingRefreshPolicy,
    safety: bundle.safety,
    executionHolds: [
      "replace synthetic fixture with the independently audited v6 original corpus and exact-wire preflight",
      "capture a fresh schema-v2 endpoint-tag pricing snapshot no older than 15 minutes",
      "create a dedicated zero-use OPENROUTER_S1_API_KEY whose provider hard limit equals the local cap",
      "seal account privacy/ZDR and live authorization evidence",
      "run an independent materialization audit before any network dispatch",
    ],
  };
  return {
    bundle,
    publicArtifact: {
      ...publicCore,
      publicArtifactSemanticSha256: sha256(stableJson(publicCore)),
    },
  };
}

function main(): void {
  const artifacts = buildFixtureArtifacts();
  if (process.argv.includes("--write")) {
    mkdirSync(path.dirname(bundlePath), { recursive: true });
    writeFileSync(bundlePath, `${JSON.stringify(artifacts.bundle, null, 2)}\n`, "utf8");
    writeFileSync(publicPath, `${JSON.stringify(artifacts.publicArtifact, null, 2)}\n`, "utf8");
    const manifest = MANIFEST_FILES.map((relativePath) =>
      `${sha256(readFileSync(path.join(here, relativePath)))}  ${relativePath}`
    );
    writeFileSync(manifestPath, `${manifest.join("\n")}\n`, "utf8");
  }
  process.stdout.write(`${JSON.stringify({
    status: artifacts.publicArtifact.status,
    assignments: artifacts.publicArtifact.counts.assignments,
    registries: artifacts.publicArtifact.counts.registries,
    candidateOpportunityCap: artifacts.publicArtifact.caps.candidateOpportunityCap,
    physicalFetchCap: artifacts.publicArtifact.caps.physicalFetchCap,
    maxCostUsd: artifacts.publicArtifact.caps.maxCostUsd,
    externalNetworkCalls: artifacts.publicArtifact.safety.externalNetworkCallsDuringMaterialization,
    providerCalls: artifacts.publicArtifact.safety.providerCallsDuringMaterialization,
    apiCandidatesConsumed: artifacts.publicArtifact.safety.apiCandidatesConsumedDuringMaterialization,
    campaignSemanticSha256: artifacts.publicArtifact.campaignSemanticSha256,
  }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
