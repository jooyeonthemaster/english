import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const designDir = path.join(
  root,
  "experiments/question-quality-20260715/design/campaign-v5-s1",
);
const controllerDir = path.join(
  root,
  "experiments/question-quality-20260715/execution/campaign-v5-s1-controller-v1",
);

const EXPECTED = Object.freeze({
  campaignPublic:
    "f4e2085c90736042329d4a921cc2d28bfc81fe47bf4b72f410253a688c8b909a",
  campaignManifest:
    "5a31e85be1b8c6c25fd0110f06566193c645f295e92566b60ecdd7ecefd6dff9",
  queueFile:
    "ba2e64ea9989d594147019c3cf88b066266bbeff11eefb74cb8299732af52583",
  queueSemantic:
    "c120ebcc5aea5f83c1c9e97447c2913b0ebf76932e2a0cf91d2e10887a86225e",
  campaignSourceClosure:
    "6f090968109ec26e8301cb89df726fae570e73ad7c3a1528ef8e4bcc492914a2",
  controllerPrivate:
    "b567bd41a5dc1673a5be0dd98c8e091430eb0360b6c6a22701272144dfe4dda2",
  controllerPublic:
    "e9c70852df618c9e1069c91cee6b6ff4efc362be3d11df8ccc35f29ece77b720",
  controllerManifest:
    "8ace7726634fd2cd2d579a517e0e16422975e34f169cd9b556a315be06ccdf05",
  controllerSemantic:
    "e72659dad93504a5aa96abdac38e0faedfc58934649f8c307a8cd8f1518c5446",
  atlasAi:
    "c69d9115e834b9a379c80791653e3bd51aecef117dca3367391460aa2ff60922",
});

const PROVIDER_ROUTING = Object.freeze({
  order: ["google-vertex/global"],
  only: ["google-vertex/global"],
  allow_fallbacks: false,
  require_parameters: true,
  data_collection: "deny",
  zdr: true,
});

const REQUIRED_CAMPAIGN_CLOSURE = Object.freeze([
  "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts",
  "src/trigger/workbench-question-generation.ts",
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
  "src/lib/atlas-ai.ts",
  "src/lib/atlas-fetch-scope-coordinator.ts",
  "src/lib/atlas-production-assignment-fetch-boundary.ts",
  "src/lib/atlas-research-fetch-boundary.ts",
  "src/lib/question-generation-assignment-budget.ts",
  "src/lib/question-generation-assignment-budget-policy.ts",
  "src/lib/question-generation-llm.ts",
  "src/lib/question-generation-research-profiles.ts",
  "src/lib/question-generation-research-runtime.ts",
  "experiments/question-quality-20260715/harness/question-generation-phase-c-runner.ts",
  "experiments/question-quality-20260715/harness/question-generation-callsite-adapter.ts",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha256(filePath) {
  return sha256(readFileSync(filePath));
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) =>
      left.localeCompare(right, "en"),
    ),
  );
}

function verifyManifest(manifestPath, base) {
  const lines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/gu);
  assert.ok(lines.length > 0);
  const seen = new Set();
  for (const [index, line] of lines.entries()) {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
    assert.ok(match, `${manifestPath}:${index + 1} malformed`);
    assert.ok(!seen.has(match[2]), `${manifestPath} repeats ${match[2]}`);
    seen.add(match[2]);
    const resolved = path.resolve(base, match[2]);
    assert.ok(
      resolved === root || resolved.startsWith(`${root}${path.sep}`),
      `${manifestPath} path escape`,
    );
    assert.equal(fileSha256(resolved), match[1], `${match[2]} drift`);
  }
}

function verifySourceClosure(entries, expectedSemantic, required = []) {
  assert.equal(new Set(entries.map((entry) => entry.role)).size, entries.length);
  assert.equal(new Set(entries.map((entry) => entry.path)).size, entries.length);
  for (const entry of entries) {
    const resolved = path.join(root, entry.path);
    assert.equal(statSync(resolved).size, entry.bytes, `${entry.path} bytes`);
    assert.equal(fileSha256(resolved), entry.sha256, `${entry.path} hash`);
  }
  assert.equal(sha256(stableJson(entries)), expectedSemantic);
  const paths = new Set(entries.map((entry) => entry.path));
  for (const requiredPath of required) {
    assert.ok(paths.has(requiredPath), `source closure omits ${requiredPath}`);
  }
}

function assertGitPrivate(relativePath) {
  const ignored = spawnSync("git", ["check-ignore", "-q", relativePath], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(ignored.status, 0, `${relativePath} is not ignored`);
  const tracked = spawnSync(
    "git",
    ["ls-files", "--error-unmatch", relativePath],
    { cwd: root, encoding: "utf8" },
  );
  assert.notEqual(tracked.status, 0, `${relativePath} is tracked`);
}

function verifyAtlasRoutingSource() {
  const atlasPath = path.join(root, "src/lib/atlas-ai.ts");
  const source = readFileSync(atlasPath, "utf8");
  assert.equal(fileSha256(atlasPath), EXPECTED.atlasAi);
  const matches = [
    ...source.matchAll(
      /export const ATLAS_RESEARCH_OPENROUTER_PROVIDER_ROUTING\s*=\s*Object\.freeze\(\{([\s\S]*?)\n\}\);/gu,
    ),
  ];
  assert.equal(matches.length, 1, "research provider-routing declaration count");
  const actualBody = matches[0][1].replace(/\s+/gu, "");
  const expectedBody = [
    'order:Object.freeze(["google-vertex/global"]),',
    'only:Object.freeze(["google-vertex/global"]),',
    "allow_fallbacks:false,",
    "require_parameters:true,",
    'data_collection:"deny"asconst,',
    "zdr:true,",
  ].join("");
  assert.equal(actualBody, expectedBody);
  assert.match(source, /fetch:\s*atlasProductionAssignmentFetch/u);
  assert.match(
    source,
    /if \(ATLAS_GATEWAY_PROVIDER !== "OPENROUTER"\)[\s\S]*structured question-generation research requires the pinned OpenRouter route/u,
  );
  assert.match(
    source,
    /provider:\s*ATLAS_RESEARCH_OPENROUTER_PROVIDER_ROUTING/u,
  );
  assert.doesNotMatch(
    source,
    /provider:\s*\{\s*\.\.\.ATLAS_RESEARCH_OPENROUTER_PROVIDER_ROUTING/u,
  );
}

function verifyFastAndTransportSources() {
  const fast = readFileSync(
    path.join(
      root,
      "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts",
    ),
    "utf8",
  );
  assert.match(fast, /runWithQuestionGenerationAssignmentBudget/u);
  assert.match(fast, /route:\s*"FAST"/u);
  assert.match(fast, /runQuestionGenerationWithEmptyRetry/u);
  const productionBoundary = readFileSync(
    path.join(root, "src/lib/atlas-production-assignment-fetch-boundary.ts"),
    "utf8",
  );
  assert.match(
    productionBoundary,
    /createAtlasProductionAssignmentFetchDispatcher\(atlasResearchFetch\)/u,
  );
  assert.match(
    productionBoundary,
    /if \(!internal\) return delegate\(input, init\)/u,
  );
}

function verifyPrivacy(publicTexts, queue, controllerPrivate) {
  const sensitive = new Set();
  for (const passage of queue.passages) {
    for (const key of [
      "frameId",
      "contentHash",
      "candidateId",
      "sourceRecordId",
      "documentKey",
      "sourceDocumentId",
      "passageContentExact",
      "passageUtf8Sha256",
      "passageToken",
    ]) {
      if (typeof passage[key] === "string" && passage[key].length >= 8) {
        sensitive.add(passage[key]);
      }
    }
  }
  for (const assignment of queue.assignments) {
    for (const key of ["assignmentId", "assignmentKey", "orderRank"]) {
      sensitive.add(assignment[key]);
    }
  }
  for (const row of controllerPrivate.rows) {
    for (const key of [
      "requestEnvelopeSha256",
      "wireBodySha256",
      "wirePromptSha256",
      "wireSchemaSha256",
    ]) {
      sensitive.add(row[key]);
    }
  }
  const combined = publicTexts.join("\n");
  const leaks = [...sensitive].filter(
    (value) => typeof value === "string" && combined.includes(value),
  );
  assert.deepEqual(leaks, [], "public artifacts contain private row values");
  assert.doesNotMatch(combined, /AIza[0-9A-Za-z_-]{20,}/u);
  assert.doesNotMatch(combined, /sk-[0-9A-Za-z_-]{20,}/u);
  assert.doesNotMatch(combined, /Bearer\s+[0-9A-Za-z._-]{12,}/iu);
}

function observedResult() {
  const campaignPublicPath = path.join(designDir, "campaign-v5-s1.json");
  const campaignManifestPath = path.join(designDir, "MANIFEST.sha256");
  const queuePath = path.join(designDir, "private/s1-queue-v5.json");
  const controllerPublicPath = path.join(
    controllerDir,
    "controller-preflight-v1.json",
  );
  const controllerPrivatePath = path.join(
    controllerDir,
    "private/controller-preflight-v1.json",
  );
  const controllerManifestPath = path.join(controllerDir, "MANIFEST.sha256");

  assert.equal(fileSha256(campaignPublicPath), EXPECTED.campaignPublic);
  assert.equal(fileSha256(campaignManifestPath), EXPECTED.campaignManifest);
  assert.equal(fileSha256(queuePath), EXPECTED.queueFile);
  assert.equal(fileSha256(controllerPublicPath), EXPECTED.controllerPublic);
  assert.equal(fileSha256(controllerPrivatePath), EXPECTED.controllerPrivate);
  assert.equal(fileSha256(controllerManifestPath), EXPECTED.controllerManifest);
  verifyManifest(campaignManifestPath, designDir);
  verifyManifest(controllerManifestPath, controllerDir);

  const campaignRaw = readFileSync(campaignPublicPath, "utf8");
  const controllerPublicRaw = readFileSync(controllerPublicPath, "utf8");
  const campaign = JSON.parse(campaignRaw);
  const queue = readJson(queuePath);
  const controllerPublic = JSON.parse(controllerPublicRaw);
  const controllerPrivate = readJson(controllerPrivatePath);

  const queueCore = { ...queue };
  delete queueCore.privateQueueSemanticSha256;
  assert.equal(sha256(stableJson(queueCore)), EXPECTED.queueSemantic);
  assert.equal(queue.privateQueueSemanticSha256, EXPECTED.queueSemantic);
  assert.equal(campaign.queue.privateQueueSemanticSha256, EXPECTED.queueSemantic);
  assert.equal(campaign.queue.privateQueueFileSha256, EXPECTED.queueFile);

  const controllerCore = { ...controllerPrivate };
  delete controllerCore.controllerPreflightSemanticSha256;
  assert.equal(sha256(stableJson(controllerCore)), EXPECTED.controllerSemantic);
  assert.equal(
    controllerPrivate.controllerPreflightSemanticSha256,
    EXPECTED.controllerSemantic,
  );
  assert.equal(
    controllerPublic.controllerPreflightSemanticSha256,
    EXPECTED.controllerSemantic,
  );

  verifySourceClosure(
    campaign.upstream.files,
    EXPECTED.campaignSourceClosure,
    REQUIRED_CAMPAIGN_CLOSURE,
  );
  verifySourceClosure(
    controllerPrivate.sourceClosure,
    controllerPublic.sourceClosureSha256,
  );
  verifyAtlasRoutingSource();
  verifyFastAndTransportSources();

  assert.equal(queue.passages.length, 12);
  assert.equal(queue.assignments.length, 180);
  assert.equal(new Set(queue.passages.map((row) => row.contentHash)).size, 12);
  assert.equal(new Set(queue.assignments.map((row) => row.assignmentId)).size, 180);
  assert.equal(queue.campaignEligibleAssignments, 0);
  assert.equal(queue.generationAuthorized, false);
  assert.equal(queue.safety.modelApiCalls, 0);
  assert.equal(queue.safety.networkCalls, 0);
  assert.equal(queue.safety.databaseCalls, 0);
  assert.equal(queue.safety.globalApiCandidateCount, 0);

  const expectedReasoning = { enabled: false, effort: "none", exclude: true };
  let reservationCents = 0;
  for (const assignment of queue.assignments) {
    assert.equal(assignment.generationAuthorized, false);
    assert.equal(assignment.admission.physicalFetchCap, 1);
    assert.equal(assignment.admission.candidateOpportunityCap, 1);
    assert.equal(assignment.admission.outerAttempts, 1);
    assert.equal(assignment.admission.sdkRetries, 0);
    assert.equal(assignment.wireContract.providerRequireParameters, true);
    assert.deepEqual(assignment.wireContract.reasoning, expectedReasoning);
    reservationCents += assignment.admission.perCallUsdCapCents;
  }
  assert.equal(reservationCents, 4_416);

  assert.equal(controllerPrivate.rows.length, 180);
  assert.equal(new Set(controllerPrivate.rows.map((row) => row.wireBodySha256)).size, 180);
  const queueById = new Map(
    queue.assignments.map((assignment) => [assignment.assignmentId, assignment]),
  );
  const providerRoutingSha256 = sha256(stableJson(PROVIDER_ROUTING));
  for (const row of controllerPrivate.rows) {
    const assignment = queueById.get(row.assignmentId);
    assert.ok(assignment, `unknown controller assignment ${row.assignmentId}`);
    assert.equal(row.queueOrdinal, assignment.queueOrdinal);
    assert.equal(row.assignmentKey, assignment.assignmentKey);
    assert.equal(row.modelId, assignment.modelId);
    assert.equal(row.questionType, assignment.questionType);
    assert.equal(row.plan, assignment.plan);
    assert.equal(row.difficulty, assignment.difficulty);
    assert.equal(row.maxOutputTokens, assignment.wireContract.maxOutputTokens);
    assert.equal(row.perCallUsdCapCents, assignment.admission.perCallUsdCapCents);
    assert.equal(row.endpoint, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(row.responseFormatType, "json_schema");
    assert.equal(row.completionCount, 1);
    assert.equal(row.candidateOutputsPerCompletion, 1);
    assert.equal(row.providerRequireParameters, true);
    assert.deepEqual(row.providerOnly, PROVIDER_ROUTING.only);
    assert.deepEqual(row.providerOrder, PROVIDER_ROUTING.order);
    assert.equal(row.providerAllowFallbacks, false);
    assert.equal(row.providerDataCollection, "deny");
    assert.equal(row.providerZdr, true);
    assert.equal(row.providerRoutingSha256, providerRoutingSha256);
    assert.deepEqual(row.reasoning, expectedReasoning);
    assert.equal(row.observedFetches, 1);
  }

  assert.equal(controllerPublic.counts.assignments, 180);
  assert.equal(controllerPublic.counts.interceptedFetches, 180);
  assert.equal(controllerPublic.counts.uniqueWireBodies, 180);
  assert.equal(controllerPublic.wire.strictJsonSchemaRows, 180);
  assert.equal(controllerPublic.wire.reasoningOffRows, 180);
  assert.equal(controllerPublic.wire.providerRequireParametersRows, 180);
  assert.equal(controllerPublic.wire.providerZdrRows, 180);
  assert.equal(controllerPublic.wire.providerDataCollectionDenyRows, 180);
  assert.equal(controllerPublic.wire.providerFallbackDisabledRows, 180);
  assert.equal(controllerPublic.wire.exactGoogleVertexGlobalOnlyRows, 180);
  assert.equal(controllerPublic.safety.externalNetworkCalls, 0);
  assert.equal(controllerPublic.safety.providerCalls, 0);
  assert.equal(controllerPublic.safety.apiCandidatesConsumed, 0);
  assert.equal(controllerPublic.safety.liveExecutionAuthorized, false);
  assert.equal(controllerPublic.safety.pricingAttached, false);
  assert.equal(controllerPublic.safety.rightsGateAttached, false);
  assert.equal(controllerPublic.safety.privacyGateAttached, false);

  assert.equal(campaign.authorization.campaignEligibleAssignments, 0);
  assert.equal(campaign.authorization.generationAuthorized, false);
  assert.equal(campaign.authorization.apiCandidateCount, 0);
  assert.equal(campaign.authorization.globalCandidateLimit, 1_000);
  assert.match(campaign.executionHolds.sourceRights, /^BLOCKED_/u);
  assert.match(campaign.executionHolds.providerPrivacy, /^BLOCKED_/u);
  assert.match(campaign.executionHolds.limitedCredential, /^BLOCKED_/u);
  assert.match(campaign.executionHolds.freshPrice, /^BLOCKED_/u);

  assertGitPrivate(
    path.relative(root, queuePath),
  );
  assertGitPrivate(
    path.relative(root, controllerPrivatePath),
  );

  const auditResultPath = path.join(here, "audit-result.json");
  const readmePath = path.join(here, "README.md");
  const additionalPublic = [];
  if (!process.argv.includes("--print-observed")) {
    additionalPublic.push(
      readFileSync(auditResultPath, "utf8"),
      readFileSync(readmePath, "utf8"),
    );
  }
  verifyPrivacy(
    [campaignRaw, controllerPublicRaw, ...additionalPublic],
    queue,
    controllerPrivate,
  );

  const allocation = {
    grammar: queue.assignments.filter((row) => row.questionType === "GRAMMAR_ERROR").length,
    blank: queue.assignments.filter((row) => row.questionType === "BLANK_INFERENCE").length,
    standard: queue.assignments.filter((row) => row.plan === "STANDARD").length,
    premium: queue.assignments.filter((row) => row.plan === "PREMIUM").length,
    intermediate: queue.assignments.filter((row) => row.difficulty === "INTERMEDIATE").length,
    killer: queue.assignments.filter((row) => row.difficulty === "KILLER").length,
  };
  assert.deepEqual(allocation, {
    grammar: 96,
    blank: 84,
    standard: 96,
    premium: 84,
    intermediate: 90,
    killer: 90,
  });
  assert.deepEqual(controllerPublic.counts.byType, countBy(queue.assignments.map((row) => row.questionType)));
  assert.deepEqual(controllerPublic.counts.byPlan, countBy(queue.assignments.map((row) => row.plan)));

  return {
    schemaVersion: "campaign-v5-s1-independent-source-closure-audit-v3",
    verdict: "PASS_CURRENT_SOURCE_AND_OFFLINE_WIRE_EXECUTION_REMAINS_BLOCKED",
    scope:
      "Offline delta re-audit after research-wire privacy hardening; no live provider request or execution authorization",
    builderDeterminism: {
      writeReplayPassed: true,
      prePostHashesIdentical: true,
      officialVerifierPassed: true,
    },
    campaign: {
      passages: 12,
      assignments: 180,
      allocation,
      reservationUsd: reservationCents / 100,
      privateQueueFileSha256: EXPECTED.queueFile,
      privateQueueSemanticSha256: EXPECTED.queueSemantic,
      semanticQueueUnchangedFromV2: true,
      campaignPublicArtifactSha256: EXPECTED.campaignPublic,
      campaignManifestSha256: EXPECTED.campaignManifest,
      currentFastWorkbenchIncludedInClosure: true,
    },
    exactWire: {
      offlineRows: 180,
      interceptedFetches: 180,
      uniqueWireBodies: 180,
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      providerRouting: PROVIDER_ROUTING,
      reasoning: expectedReasoning,
      staticAtlasSourcePassed: true,
      emittedWirePreflightPassed: true,
      profilePlanWireTestsPassed: 4,
      controllerPreflightSemanticSha256: EXPECTED.controllerSemantic,
    },
    privacy: {
      privateQueueGitIgnoredAndUntracked: true,
      privateControllerGitIgnoredAndUntracked: true,
      publicPrivateValueLeaks: 0,
      credentialValueLeaks: 0,
      accountPrivacyStateAttested: false,
    },
    authorization: {
      campaignEligibleAssignments: 0,
      generationAuthorized: false,
      apiCandidateCount: 0,
      globalCandidateLimit: 1_000,
    },
    executionBlocks: {
      sourceRights: true,
      accountLoggingRetentionAndGuardrailAttestation: true,
      freshAllowlistedProviderPrice: true,
      dedicatedLimitedCredentialAndHardCeiling: true,
      durableExecutionRegistryAndLedger: true,
    },
    verification: {
      independentVerifierPassed: true,
      officialCampaignVerifierPassed: true,
      controllerPreflightVerifierPassed: true,
      campaignAndControllerTypechecksPassed: true,
      globalTypecheckPassed: true,
      targetedWireTestPassed: true,
    },
    safety: {
      externalNetworkCalls: 0,
      providerCalls: 0,
      databaseCalls: 0,
      apiCandidatesConsumed: 0,
      liveExecutionAuthorized: false,
      credentialValuesRecorded: 0,
    },
  };
}

const observed = observedResult();
if (process.argv.includes("--print-observed")) {
  process.stdout.write(`${JSON.stringify(observed, null, 2)}\n`);
} else {
  assert.deepEqual(observed, readJson(path.join(here, "audit-result.json")));
  verifyManifest(path.join(here, "MANIFEST.sha256"), here);
  process.stdout.write(
    `${JSON.stringify(
      {
        verdict: observed.verdict,
        assignments: observed.campaign.assignments,
        exactWireRows: observed.exactWire.offlineRows,
        providerOnly: observed.exactWire.providerRouting.only,
        apiCandidateCount: observed.authorization.apiCandidateCount,
      },
      null,
      2,
    )}\n`,
  );
}
