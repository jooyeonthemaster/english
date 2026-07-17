import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { BudgetStore, openTestBudgetStore } from "../../harness/ledger";
import {
  buildMinimalConnectivityPilotChildEnvironmentForAudit,
  inspectConnectivityPilotLiveLaunchReadiness,
  launchConnectivityPilotInIsolatedChild,
} from "./live-launcher";
import {
  assertConnectivityPilotPublicResultPrivacy,
  buildConnectivityPilotPrivateRegistryJson,
  buildConnectivityPilotPublicResult,
  createOfflineInjectedTransportCapability,
  createOfflineInjectedTransportTestPermit,
  inspectConnectivityPilotFrozenWireMatchForOfflineAudit,
  leasePilotAssignmentWithoutNetworkForCrashTest,
  materializeConnectivityPilot,
  recoverPilotCrashWithoutReplay,
  runConnectivityPilotWithInjectedTransport,
  type PilotMaterializedExecution,
} from "./runner";
import {
  protocolAuthoritySha256,
  validateConnectivityPilotProtocolV2,
  validatePricingSnapshotV2,
} from "./protocol-schema";

process.env.QUESTION_QUALITY_CONNECTIVITY_PILOT_TEST_MODE = "1";
process.env.QUESTION_QUALITY_BUDGET_GUARD_TEST_MODE = "1";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, "$1"));
const protocolPath = path.join(here, "protocol-v2.json");
const privateRoot = path.join(here, "private");
const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function pricingSnapshot(fetchedAt = "2026-07-15T10:00:00.000Z") {
  const supportedParameters = ["max_tokens", "response_format"];
  const content = {
    schemaVersion: 2 as const,
    fetchedAt,
    source: "offline-hostile-test-fixture-no-network",
    routingContract: {
      allowedEndpointTags: ["google-vertex/global"] as ["google-vertex/global"],
      emergencyCeilingScope: "all-active-model-endpoints" as const,
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
    models: [{
      id: "google/gemini-3.5-flash",
      canonicalSlug: "google/gemini-3.5-flash-20260519",
      endpointRates: [{
        provider: "Google",
        endpointName: "Google Vertex Global | gemini-3.5-flash",
        tag: "google-vertex/global",
        status: "active" as const,
        contextLength: 1_048_576,
        promptUsdPerToken: 0.0000015,
        completionUsdPerToken: 0.000009,
        supportedParameters,
        structuredOutputs: true,
        overrides: [],
      }, {
        provider: "Google",
        endpointName: "Google Vertex Priority | gemini-3.5-flash",
        tag: "google-vertex/global/priority",
        status: "active" as const,
        contextLength: 1_048_576,
        promptUsdPerToken: 0.0000027,
        completionUsdPerToken: 0.0000162,
        supportedParameters,
        overrides: [],
      }],
    }, {
      id: "google/gemini-3.1-pro-preview",
      canonicalSlug: "google/gemini-3.1-pro-preview-20260219",
      endpointRates: [{
        provider: "Google",
        endpointName: "Google Vertex Global | gemini-3.1-pro-preview",
        tag: "google-vertex/global",
        status: "active" as const,
        contextLength: 1_048_576,
        promptUsdPerToken: 0.000002,
        completionUsdPerToken: 0.000012,
        supportedParameters,
        structuredOutputs: true,
        overrides: [{
          minPromptTokens: 200_000,
          promptUsdPerToken: 0.000004,
          completionUsdPerToken: 0.000018,
        }],
      }, {
        provider: "Google",
        endpointName: "Google Vertex Priority | gemini-3.1-pro-preview",
        tag: "google-vertex/global/priority",
        status: "active" as const,
        contextLength: 1_048_576,
        promptUsdPerToken: 0.0000036,
        completionUsdPerToken: 0.0000324,
        supportedParameters,
        overrides: [{
          minPromptTokens: 200_000,
          promptUsdPerToken: 0.0000072,
          completionUsdPerToken: 0.0000324,
        }],
      }],
    }],
  };
  return { ...content, snapshotSha256: sha256(JSON.stringify(content)) };
}

function materialized(now = Date.parse("2026-07-15T10:01:00.000Z")) {
  return materializeConnectivityPilot({
    priceSnapshotId: "openrouter-schema-v2-offline-hostile-fixture",
    snapshot: pricingSnapshot(),
    validThrough: "2026-07-15T10:15:00.000Z",
    now,
  });
}

function testStore(campaign: PilotMaterializedExecution) {
  const root = mkdtempSync(path.join(tmpdir(), "ocvp-v2-test-"));
  const registry = path.join(root, "registry.json");
  const database = path.join(root, "ledger.sqlite");
  writeFileSync(registry, buildConnectivityPilotPrivateRegistryJson(campaign), "utf8");
  return { root, store: openTestBudgetStore(database, registry) };
}

function validEnvelope(model: string, ordinal: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `generation-offline-${ordinal}`,
    model,
    provider: "Google",
    openrouter_metadata: {
      requested: model,
      strategy: "direct",
      attempt: 1,
      is_byok: false,
      endpoints: {
        total: 1,
        available: [{ provider: "Google", model, selected: true }],
      },
      attempts: [{ provider: "Google", model, status: 200 }],
    },
    choices: [{
      message: { content: JSON.stringify({ questions: [{ id: ordinal, stem: "offline" }] }) },
    }],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
      cost: 0.001,
      is_byok: false,
    },
    ...overrides,
  };
}

function responseFor(model: string, ordinal: number, overrides: Record<string, unknown> = {}) {
  return new Response(JSON.stringify(validEnvelope(model, ordinal, overrides)), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("strict v2 protocol, Unicode authority, and immutable v1 corpus commitments validate", () => {
  const protocol = validateConnectivityPilotProtocolV2(
    JSON.parse(readFileSync(protocolPath, "utf8")) as unknown,
  );
  assert.equal(protocol.completeProductionInput.schoolType, "고등학교");
  assert.equal(protocol.completeProductionInput.gradeInfo, "2학년");
  assert.equal(protocol.authorityCommitment.authoritySemanticSha256, protocolAuthoritySha256(protocol));
  assert.equal(protocol.authorityCommitment.v1MojibakeSurfaceRejected, true);

  const extra = clone(protocol) as Record<string, unknown>;
  extra.attacker = true;
  assert.throws(() => validateConnectivityPilotProtocolV2(extra), /unknown|keys differ/i);
  const corruptUnicode = clone(protocol);
  corruptUnicode.completeProductionInput.schoolType = "怨좊벑" as "고등학교";
  assert.throws(() => validateConnectivityPilotProtocolV2(corruptUnicode), /schoolType/);
  const nestedUnknown = clone(protocol) as unknown as {
    exactProviderContract: { provider: Record<string, unknown> };
  };
  nestedUnknown.exactProviderContract.provider.attacker = true;
  assert.throws(() => validateConnectivityPilotProtocolV2(nestedUnknown), /unknown|keys differ/i);
  const timeoutDrift = clone(protocol);
  timeoutDrift.durableBounds.timeoutMsByPlan.STANDARD = 60_001;
  assert.throws(() => validateConnectivityPilotProtocolV2(timeoutDrift), /timeoutMsByPlan/);
  const envExpansion = clone(protocol) as unknown as {
    liveIsolationContract: { inheritedEnvironmentAllowlist: string[] };
  };
  envExpansion.liveIsolationContract.inheritedEnvironmentAllowlist.push("HOME");
  assert.throws(() => validateConnectivityPilotProtocolV2(envExpansion), /minimal allowlist/i);
});

test("strict schema-v2 price proof rejects unknowns, stale/noncanonical timestamps, tag and canonical slug drift", () => {
  const valid = pricingSnapshot();
  assert.equal(validatePricingSnapshotV2(valid).models.length, 2);
  const unknown = clone(valid) as Record<string, unknown>;
  unknown.extra = true;
  assert.throws(() => validatePricingSnapshotV2(unknown), /unknown|keys differ/i);
  const nestedUnknown = clone(valid) as unknown as {
    models: Array<{ endpointRates: Array<Record<string, unknown>> }>;
  };
  nestedUnknown.models[0]!.endpointRates[0]!.attacker = true;
  assert.throws(() => validatePricingSnapshotV2(nestedUnknown), /unknown|keys differ/i);
  const tampered = clone(valid);
  tampered.models[0]!.endpointRates[0]!.contextLength += 1;
  assert.throws(() => validatePricingSnapshotV2(tampered), /snapshotSha256/);
  const slug = clone(valid);
  slug.models[0]!.canonicalSlug = "other/model";
  slug.snapshotSha256 = sha256(JSON.stringify(Object.fromEntries(Object.entries(slug).filter(([key]) => key !== "snapshotSha256"))));
  assert.throws(() => validatePricingSnapshotV2(slug), /canonicalSlug/);
  const undatedSlug = clone(valid);
  undatedSlug.models[0]!.canonicalSlug = "google/gemini-3.5-flash-attacker";
  undatedSlug.snapshotSha256 = sha256(JSON.stringify(Object.fromEntries(Object.entries(undatedSlug).filter(([key]) => key !== "snapshotSha256"))));
  assert.throws(() => validatePricingSnapshotV2(undatedSlug), /canonicalSlug/);
  const providerDrift = clone(valid);
  providerDrift.models[0]!.endpointRates[0]!.provider = "Attacker";
  providerDrift.snapshotSha256 = sha256(JSON.stringify(Object.fromEntries(Object.entries(providerDrift).filter(([key]) => key !== "snapshotSha256"))));
  assert.throws(() => validatePricingSnapshotV2(providerDrift), /provider/);
  const duplicateTag = clone(valid);
  duplicateTag.models[0]!.endpointRates[1]!.tag = "google-vertex/global";
  const duplicateContent = { ...duplicateTag };
  delete (duplicateContent as { snapshotSha256?: string }).snapshotSha256;
  duplicateTag.snapshotSha256 = sha256(JSON.stringify(duplicateContent));
  assert.throws(() => validatePricingSnapshotV2(duplicateTag), /tags must be unique|exact-tag/);
  assert.throws(
    () => materializeConnectivityPilot({
      priceSnapshotId: "stale-proof",
      snapshot: valid,
      validThrough: "2026-07-15T10:15:00.000Z",
      now: Date.parse("2026-07-15T10:15:00.001Z"),
    }),
    /stale|window/i,
  );
  const aboveFrozenCeiling = clone(valid);
  aboveFrozenCeiling.models[0]!.endpointRates[1]!.promptUsdPerToken = 0.0001;
  const aboveContent = { ...aboveFrozenCeiling };
  delete (aboveContent as { snapshotSha256?: string }).snapshotSha256;
  aboveFrozenCeiling.snapshotSha256 = sha256(JSON.stringify(aboveContent));
  assert.throws(() => materializeConnectivityPilot({
    priceSnapshotId: "above-frozen-ceiling",
    snapshot: aboveFrozenCeiling,
    validThrough: "2026-07-15T10:15:00.000Z",
    now: Date.parse("2026-07-15T10:01:00.000Z"),
  }), /ceiling|price|rate|protocol/i);
});

test("two serial successful responses alone satisfy the non-vacuous completion barrier", async () => {
  const campaign = materialized();
  assert.deepEqual(inspectConnectivityPilotFrozenWireMatchForOfflineAudit(campaign.assignments[0]!), {
    endpointHash: true,
    schemaHash: true,
    outputShape: true,
    structurallyFixedOutputs: true,
    completionCount: true,
    maxOutputTokens: true,
    bodyBytes: true,
    model: true,
    bodyHash: true,
    promptHash: true,
    provenance: true,
  });
  const fixture = testStore(campaign);
  const permit = createOfflineInjectedTransportTestPermit(campaign);
  const seen: string[] = [];
  const transport = createOfflineInjectedTransportCapability(async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { model: string };
    seen.push(body.model);
    return responseFor(body.model, seen.length);
  });
  try {
    const result = await runConnectivityPilotWithInjectedTransport({
      materialized: campaign,
      store: fixture.store,
      transport,
      permit,
      now: () => Date.parse("2026-07-15T10:02:00.000Z"),
    });
    assert.deepEqual(seen, ["google/gemini-3.5-flash", "google/gemini-3.1-pro-preview"]);
    assert.equal(result.status, "COMPLETED_BOUNDED_CONNECTIVITY_PILOT");
    assert.equal(result.startedAssignments, 2);
    assert.equal(result.settledAssignments, 2);
    assert.equal(result.successfulAssignments, 2);
    assert.equal(result.usageEvidenceComplete, true);
    assert.equal(result.routeEvidenceComplete, true);
    assert.equal(result.parserEvidenceComplete, true);
    assert.equal(result.physicalFetches, 2);
    assert.equal(result.candidateOpportunitiesConsumed, 2);
    assert.equal(result.batchBreached, false);
  } finally {
    fixture.store.close();
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("zero-success and empty stores cannot exploit Array.every vacuous truth", () => {
  const campaign = materialized();
  const fixture = testStore(campaign);
  try {
    const result = buildConnectivityPilotPublicResult(campaign, fixture.store);
    assert.equal(result.status, "PARTIAL_OR_BLOCKED");
    assert.equal(result.successfulAssignments, 0);
    assert.equal(result.usageEvidenceComplete, false);
    assert.equal(result.routeEvidenceComplete, false);
    assert.equal(result.parserEvidenceComplete, false);
  } finally {
    fixture.store.close();
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("mixed failure consumes exactly two opportunities but cannot complete", async () => {
  const campaign = materialized();
  const fixture = testStore(campaign);
  const permit = createOfflineInjectedTransportTestPermit(campaign);
  let calls = 0;
  const transport = createOfflineInjectedTransportCapability(async (_input, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body)) as { model: string };
    if (calls === 1) return new Response("provider rejected", { status: 500 });
    return responseFor(body.model, calls);
  });
  try {
    const result = await runConnectivityPilotWithInjectedTransport({
      materialized: campaign, store: fixture.store, transport, permit,
      now: () => Date.parse("2026-07-15T10:02:00.000Z"),
    });
    assert.equal(calls, 2);
    assert.equal(result.status, "PARTIAL_OR_BLOCKED");
    assert.equal(result.startedAssignments, 2);
    assert.equal(result.settledAssignments, 2);
    assert.equal(result.successfulAssignments, 1);
    assert.equal(result.usageEvidenceComplete, false);
  } finally {
    fixture.store.close();
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("malformed, semantic overflow, route drift, and missing evidence fail closed without retries", async (t) => {
  const cases: Array<{ name: string; response: (model: string) => Response }> = [{
    name: "malformed",
    response: () => new Response("{broken", { status: 200 }),
  }, {
    name: "multi-choice",
    response: (model) => responseFor(model, 1, {
      choices: [
        { message: { content: JSON.stringify({ questions: [{ id: 1 }] }) } },
        { message: { content: JSON.stringify({ questions: [{ id: 2 }] }) } },
      ],
    }),
  }, {
    name: "multi-semantic-output",
    response: (model) => responseFor(model, 1, {
      choices: [{
        message: {
          content: JSON.stringify({ questions: [{ id: 1 }, { id: 2 }] }),
        },
      }],
    }),
  }, {
    name: "missing-route",
    response: (model) => {
      const envelope = validEnvelope(model, 1);
      delete (envelope as { openrouter_metadata?: unknown }).openrouter_metadata;
      return new Response(JSON.stringify(envelope), { status: 200 });
    },
  }, {
    name: "wrong-provider",
    response: (model) => responseFor(model, 1, { provider: "Anthropic" }),
  }, {
    name: "served-model-drift",
    response: (model) => responseFor(model, 1, { model: "google/gemini-3.5-flash-attacker" }),
  }, {
    name: "missing-usage",
    response: (model) => {
      const envelope = validEnvelope(model, 1);
      delete (envelope as { usage?: unknown }).usage;
      return new Response(JSON.stringify(envelope), { status: 200 });
    },
  }];
  for (const hostile of cases) {
    await t.test(hostile.name, async () => {
      const campaign = materialized();
      const fixture = testStore(campaign);
      const permit = createOfflineInjectedTransportTestPermit(campaign);
      let calls = 0;
      const transport = createOfflineInjectedTransportCapability(async (_input, init) => {
        calls += 1;
        const body = JSON.parse(String(init?.body)) as { model: string };
        return hostile.response(body.model);
      });
      try {
        await assert.rejects(
          () => runConnectivityPilotWithInjectedTransport({
            materialized: campaign, store: fixture.store, transport, permit,
            now: () => Date.parse("2026-07-15T10:02:00.000Z"),
          }),
        );
        assert.equal(calls, 1);
        const result = buildConnectivityPilotPublicResult(campaign, fixture.store);
        assert.equal(result.status, "PARTIAL_OR_BLOCKED");
        assert.equal(result.candidateOpportunitiesConsumed, 1);
        assert.equal(result.physicalFetches, 1);
      } finally {
        fixture.store.close();
        rmSync(fixture.root, { recursive: true, force: true });
      }
    });
  }
});

test("transport rejection/timeout consumes one call and never auto-retries", async () => {
  const campaign = materialized();
  const fixture = testStore(campaign);
  const permit = createOfflineInjectedTransportTestPermit(campaign);
  let calls = 0;
  const transport = createOfflineInjectedTransportCapability(async () => {
    calls += 1;
    throw new DOMException("offline timeout", "TimeoutError");
  });
  try {
    await assert.rejects(() => runConnectivityPilotWithInjectedTransport({
      materialized: campaign, store: fixture.store, transport, permit,
      now: () => Date.parse("2026-07-15T10:02:00.000Z"),
    }));
    assert.equal(calls, 1);
    const result = buildConnectivityPilotPublicResult(campaign, fixture.store);
    assert.equal(result.physicalFetches, 1);
    assert.equal(result.status, "PARTIAL_OR_BLOCKED");
  } finally {
    fixture.store.close();
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("crash before/after send, durable restart, and duplicate physical IDs cannot replay", async (t) => {
  for (const disposition of ["never_sent", "unknown_after_send"] as const) {
    await t.test(disposition, async () => {
      const campaign = materialized();
      const fixture = testStore(campaign);
      const permit = createOfflineInjectedTransportTestPermit(campaign);
      const transport = createOfflineInjectedTransportCapability(async () => {
        throw new Error("delegate must not be reached by crash lease test");
      });
      const physicalCallId = leasePilotAssignmentWithoutNetworkForCrashTest({
        materialized: campaign, store: fixture.store, plan: "STANDARD", permit, transport,
        now: () => Date.parse("2026-07-15T10:02:00.000Z"),
      });
      assert.throws(() => leasePilotAssignmentWithoutNetworkForCrashTest({
        materialized: campaign, store: fixture.store, plan: "STANDARD", permit, transport,
        now: () => Date.parse("2026-07-15T10:02:00.000Z"),
      }), /duplicate|already|replay|execute/i);
      const database = fixture.store.storePath;
      const registry = fixture.store.registryPath;
      fixture.store.close();
      const restarted = openTestBudgetStore(database, registry);
      try {
        await recoverPilotCrashWithoutReplay({
          materialized: campaign, store: restarted, plan: "STANDARD", physicalCallId,
          disposition, permit, transport,
          now: () => Date.parse("2026-07-15T10:02:00.000Z"),
        });
        const result = buildConnectivityPilotPublicResult(campaign, restarted);
        assert.equal(result.startedAssignments, 1);
        assert.equal(result.settledAssignments, 1);
        assert.equal(result.successfulAssignments, 0);
        assert.equal(result.status, "PARTIAL_OR_BLOCKED");
        assert.equal(result.physicalFetches, 1);
      } finally {
        restarted.close();
        rmSync(fixture.root, { recursive: true, force: true });
      }
    });
  }
});

test("rolling price expiry is rechecked before Premium and prevents a second fetch", async () => {
  let clock = Date.parse("2026-07-15T10:02:00.000Z");
  const campaign = materialized(clock);
  const fixture = testStore(campaign);
  const permit = createOfflineInjectedTransportTestPermit(campaign);
  let calls = 0;
  const transport = createOfflineInjectedTransportCapability(async (_input, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body)) as { model: string };
    const response = responseFor(body.model, calls);
    if (calls === 1) clock = Date.parse("2026-07-15T10:15:00.001Z");
    return response;
  });
  try {
    await assert.rejects(() => runConnectivityPilotWithInjectedTransport({
      materialized: campaign, store: fixture.store, transport, permit, now: () => clock,
    }), /expired|validity|pricing/i);
    assert.equal(calls, 1);
    assert.equal(buildConnectivityPilotPublicResult(campaign, fixture.store).status, "PARTIAL_OR_BLOCKED");
  } finally {
    fixture.store.close();
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("offline transport capability cannot become live authority and the production launcher fails closed", async () => {
  const readiness = inspectConnectivityPilotLiveLaunchReadiness();
  assert.deepEqual(readiness, {
    status: "BLOCKED_PENDING_SEPARATE_HOSTILE_AUDIT_AND_PROTOCOL_AMENDMENT",
    liveExecutionAuthorized: false,
    hostileAuditPassed: false,
    dispatchCommandPresent: false,
  });
  const campaign = materialized();
  const transport = createOfflineInjectedTransportCapability(async () => new Response("offline"));
  assert.notEqual(Symbol.for("connectivity-pilot-live-child-credential") in transport, true);
  assert.equal(Object.isFrozen(campaign), true);
  assert.equal(Object.isFrozen(campaign.assignments), true);
  assert.equal(Object.isFrozen(campaign.assignments[0]!), true);
  await assert.rejects(() => launchConnectivityPilotInIsolatedChild({
    priceSnapshotPath: path.join(privateRoot, "nonexistent.private.json"),
    validThrough: "2026-07-15T10:15:00.000Z",
  }), /NO_AUTHORIZED_DISPATCH|not authorized|blocked/i);
});

test("minimal child env rejects alternate credentials and strips cwd/profile/env-loader attacks", () => {
  const controlled = {
    executionName: "live-execution-offlineaudit01",
    priceSnapshotPath: path.join(privateRoot, "pricing.private.json"),
    validThrough: "2026-07-15T10:15:00.000Z",
  };
  const minimal = buildMinimalConnectivityPilotChildEnvironmentForAudit({
    SystemRoot: "C:\\Windows",
    PATH: "C:\\safe",
    HOME: "C:\\attacker-home",
    USERPROFILE: "C:\\attacker-profile",
    APPDATA: "C:\\attacker-appdata",
    LOCALAPPDATA: "C:\\attacker-local",
    NODE_OPTIONS: "--require=.env-loader.js",
    TSX_TSCONFIG_PATH: "attacker.json",
    OPENROUTER_API_KEY: "offline-fake-key",
  }, controlled);
  for (const forbidden of ["HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "NODE_OPTIONS", "TSX_TSCONFIG_PATH"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(minimal, forbidden), false);
  }
  assert.deepEqual(Object.keys(minimal).sort(), [
    "OPENROUTER_API_KEY", "PATH", "QUESTION_QUALITY_CONNECTIVITY_PILOT_EXECUTION_NAME",
    "QUESTION_QUALITY_CONNECTIVITY_PILOT_LIVE_CHILD",
    "QUESTION_QUALITY_CONNECTIVITY_PILOT_PRICE_SNAPSHOT",
    "QUESTION_QUALITY_CONNECTIVITY_PILOT_VALID_THROUGH", "SystemRoot",
  ].sort());
  assert.throws(() => buildMinimalConnectivityPilotChildEnvironmentForAudit({
    OPENROUTER_API_KEY: "offline-fake-key",
    GEMINI_API_KEY: "attacker-second-key",
  }, controlled), /exactly one credential/i);
});

test("exclusive private SQLite guard uses a new canonical direct child and refuses overwrite", () => {
  const campaign = materialized();
  const name = `live-execution-test${randomUUID().replace(/-/gu, "").slice(0, 20)}`;
  const executionRoot = path.join(privateRoot, name);
  const contaminatedName = `live-execution-test${randomUUID().replace(/-/gu, "").slice(0, 20)}`;
  const contaminatedRoot = path.join(privateRoot, contaminatedName);
  let store: BudgetStore | null = null;
  try {
    store = BudgetStore.createConnectivityPilotPrivateExecution({
      executionDirectoryName: name,
      registryJson: buildConnectivityPilotPrivateRegistryJson(campaign),
    });
    assert.equal(path.dirname(store.storePath), path.resolve(executionRoot));
    assert.equal(path.basename(store.storePath), "pilot-ledger.sqlite");
    assert.equal(existsSync(store.storePath), true);
    store.close();
    store = null;
    assert.throws(() => BudgetStore.createConnectivityPilotPrivateExecution({
      executionDirectoryName: name,
      registryJson: buildConnectivityPilotPrivateRegistryJson(campaign),
    }), /new direct child|already|existing/i);
    assert.throws(() => BudgetStore.createConnectivityPilotPrivateExecution({
      executionDirectoryName: "../live-execution-attacker",
      registryJson: buildConnectivityPilotPrivateRegistryJson(campaign),
    }), /name is invalid|forbidden/i);
    BudgetStore.prepareConnectivityPilotPrivateExecutionDirectory(contaminatedName);
    writeFileSync(path.join(contaminatedRoot, ".env"), "OPENROUTER_API_KEY=attacker", "utf8");
    assert.throws(() => BudgetStore.initializePreparedConnectivityPilotPrivateExecution({
      executionDirectoryName: contaminatedName,
      registryJson: buildConnectivityPilotPrivateRegistryJson(campaign),
    }), /empty|existing/i);
    assert.throws(() => BudgetStore.createConnectivityPilotPrivateExecution({
      executionDirectoryName: `live-execution-test${randomUUID().replace(/-/gu, "").slice(0, 20)}`,
      registryJson: '{"OPENROUTER_API_KEY":"attacker"}',
    }), /secret|env|registry/i);
  } finally {
    store?.close();
    const canonicalPrivate = path.resolve(privateRoot).toLowerCase();
    const candidate = path.resolve(executionRoot).toLowerCase();
    assert.equal(candidate.startsWith(`${canonicalPrivate}${path.sep}`), true);
    rmSync(executionRoot, { recursive: true, force: true });
    rmSync(contaminatedRoot, { recursive: true, force: true });
  }
});

test("public result allowlist and secret scan reject hostile leakage", () => {
  const campaign = materialized();
  const fixture = testStore(campaign);
  try {
    const result = buildConnectivityPilotPublicResult(campaign, fixture.store);
    assertConnectivityPilotPublicResultPrivacy(result);
    assert.throws(() => assertConnectivityPilotPublicResultPrivacy({
      ...result,
      prompt: "leak",
    }), /keys differ|allowlist|forbidden/i);
    assert.throws(() => assertConnectivityPilotPublicResultPrivacy({
      ...result,
      auditHeadHash: "Bearer sk-or-v1-attacker-secret",
    }), /credential|SHA|invalid/i);
  } finally {
    fixture.store.close();
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
