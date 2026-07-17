/* eslint-disable @typescript-eslint/no-explicit-any -- adversarial fixtures intentionally mutate serialized state */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import passagesJson from "../../src/data/exam-passages/passages.json";

type JsonRecord = Record<string, any>;

const ROOT = process.cwd();
const HARNESS = path.join(ROOT, "scripts", "codex-native-webtoon-harness.ts");
const TSX_CLI = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const SOURCE_FILE = path.join(ROOT, "src", "data", "exam-passages", "passages.json");
const PASSAGES = passagesJson as Array<{ id: string; text: string }>;
const CONCEPTS = ["MACHO_BLACK_RED", "CUTE_PASTEL"] as const;
const createdRunDirs = new Set<string>();

test.afterEach(async () => {
  await Promise.all(
    [...createdRunDirs].map(async (runDir) => {
      assert.ok(runDir.startsWith(path.join(ROOT, "out", ".tmp-harness-")));
      await rm(runDir, { recursive: true, force: true });
      createdRunDirs.delete(runDir);
    }),
  );
});

test(
  "two simultaneous next processes never exceed the global cap or double-claim",
  { timeout: 60_000 },
  async () => {
    const runDir = await createRunDir();
    const state = await fixtureState(PASSAGES.slice(0, 6));
    await writeState(runDir, state);

    const [left, right] = await Promise.all([
      runHarness(runDir, "next", "--limit=10"),
      runHarness(runDir, "next", "--limit=10"),
    ]);
    assert.equal(left.code, 0, left.stderr);
    assert.equal(right.code, 0, right.stderr);

    const outputs = [JSON.parse(left.stdout), JSON.parse(right.stdout)];
    assert.equal(outputs.reduce((total, output) => total + output.count, 0), 10);
    const claimedIds = outputs.flatMap((output) =>
      output.items.map((item: JsonRecord) => item.assetId),
    );
    assert.equal(new Set(claimedIds).size, 10);

    const saved = await readState(runDir);
    assert.equal(saved.revision, 2);
    assert.equal(countStatus(saved, "GEN_QUEUED"), 10);
    assert.equal(countStatus(saved, "PENDING"), 2);
    assert.ok(
      Object.values(saved.assets).filter((asset: any) => asset.lease).every(
        (asset: any) => asset.lease.attempt === asset.attempt,
      ),
    );
  },
);

test(
  "lease token mismatch is fail-closed and stale leases are recovered with retry evidence",
  { timeout: 60_000 },
  async () => {
    const runDir = await createRunDir();
    await writeState(runDir, await fixtureState(PASSAGES.slice(0, 1), ["MACHO_BLACK_RED"]));
    const claimed = JSON.parse(
      expectSuccess(await runHarness(runDir, "next", "--limit=1", "--lease-ms=10")).stdout,
    ).items[0];

    const rejected = await runHarness(
      runDir,
      "generation-failed",
      `--asset-id=${claimed.assetId}`,
      `--attempt=${claimed.attempt}`,
      `--batch-id=${claimed.batchId}`,
      "--claim-token=wrong-token",
      "--failure-code=GENERATION_ERROR",
      "--correction=retry exactly",
    );
    assert.notEqual(rejected.code, 0);
    assert.match(rejected.stderr, /Lease mismatch/);
    let saved = await readState(runDir);
    assert.equal(saved.assets[claimed.assetId].status, "GEN_QUEUED");
    assert.equal(saved.assets[claimed.assetId].failureHistory.length, 0);

    await new Promise((resolve) => setTimeout(resolve, 30));
    const recovered = JSON.parse(expectSuccess(await runHarness(runDir, "recover")).stdout);
    assert.deepEqual(recovered.recovered, [claimed.assetId]);
    saved = await readState(runDir);
    const asset = saved.assets[claimed.assetId];
    assert.equal(asset.status, "RETRY_QUEUED");
    assert.equal(asset.lease, undefined);
    assert.equal(asset.promptRevision, 2);
    assert.deepEqual(asset.failureHistory.at(-1).failureCodes, ["LEASE_EXPIRED"]);
    assert.equal(saved.batches[claimed.batchId].status, "SETTLED");

    const retry = JSON.parse(expectSuccess(await runHarness(runDir, "next", "--limit=1")).stdout)
      .items[0];
    assert.equal(retry.attempt, 2);
    assert.notEqual(retry.claimToken, claimed.claimToken);
    assert.match(retry.prompt, /LEASE_EXPIRED/);
  },
);

test(
  "attempt six requires bound fresh RCA, while attempt nine needs terminal override before attempt ten",
  { timeout: 60_000 },
  async () => {
    const runDir = await createRunDir();
    const state = await fixtureState(PASSAGES.slice(0, 2), ["MACHO_BLACK_RED"]);
    const firstId = Object.keys(state.assets)[0];
    const secondId = Object.keys(state.assets)[1];
    state.assets[firstId].attempt = 5;
    state.assets[firstId].status = "RETRY_QUEUED";
    state.assets[secondId].attempt = 8;
    state.assets[secondId].status = "RETRY_QUEUED";
    await writeState(runDir, state);

    const firstClaim = JSON.parse(
      expectSuccess(
        await runHarness(runDir, "next", "--limit=1", `--passage-id=${state.assets[firstId].passageId}`),
      ).stdout,
    ).items[0];
    assert.equal(firstClaim.attempt, 6);
    expectSuccess(await failClaim(runDir, firstClaim));
    let saved = await readState(runDir);
    assert.equal(saved.assets[firstId].status, "RCA_REQUIRED");

    const rcaPath = path.join(runDir, "rca-attempt-6.json");
    await writeFile(
      rcaPath,
      JSON.stringify({
        ...boundRcaPayload(saved, firstId),
        reviewerAgentId: "fresh-rca-reviewer",
        evidence: ["The repeated prompt left the phone-size text unreadable."],
        rootCause: "The panel density remained too high.",
        correctionDirective: "Reduce density while preserving every required source phrase.",
      }),
    );
    expectSuccess(await runHarness(runDir, "record-rca", `--asset-id=${firstId}`, `--review=${rcaPath}`));
    saved = await readState(runDir);
    assert.equal(saved.assets[firstId].status, "RETRY_QUEUED");
    assert.deepEqual(saved.assets[firstId].failureHistory.at(-1).failureCodes, ["RCA_REDESIGNED"]);

    const secondClaim = JSON.parse(
      expectSuccess(
        await runHarness(runDir, "next", "--limit=1", `--passage-id=${state.assets[secondId].passageId}`),
      ).stdout,
    ).items[0];
    assert.equal(secondClaim.attempt, 9);
    expectSuccess(await failClaim(runDir, secondClaim));
    saved = await readState(runDir);
    assert.equal(saved.assets[secondId].status, "BLOCKED_RCA");
    const blockedRcaPath = path.join(runDir, "rca-attempt-9.json");
    const terminalRcaBinding = boundRcaPayload(saved, secondId);
    await writeFile(
      blockedRcaPath,
      JSON.stringify({
        ...terminalRcaBinding,
        reviewerAgentId: "fresh-terminal-rca-reviewer",
        evidence: ["Nine attempts show the same persistent layout failure."],
        rootCause: "The prior composition strategy cannot satisfy the readability gate.",
        correctionDirective: "Use a fundamentally redesigned panel hierarchy for the terminal retry.",
      }),
    );
    const blockedRca = await runHarness(
      runDir,
      "record-rca",
      `--asset-id=${secondId}`,
      `--review=${blockedRcaPath}`,
    );
    assert.notEqual(blockedRca.code, 0);
    assert.match(blockedRca.stderr, /explicit --terminal-override/);

    const overridden = JSON.parse(
      expectSuccess(
        await runHarness(
          runDir,
          "record-rca",
          `--asset-id=${secondId}`,
          `--review=${blockedRcaPath}`,
          "--terminal-override",
        ),
      ).stdout,
    );
    assert.equal(overridden.terminalOverride, true);
    saved = await readState(runDir);
    assert.equal(saved.assets[secondId].status, "RETRY_QUEUED");
    assert.equal(saved.rcaHistory.at(-1).terminalOverride, true);
    assert.equal(saved.rcaHistory.at(-1).failureHistoryHash, terminalRcaBinding.failureHistoryHash);

    const terminalClaim = JSON.parse(
      expectSuccess(
        await runHarness(runDir, "next", "--limit=1", `--passage-id=${state.assets[secondId].passageId}`),
      ).stdout,
    ).items[0];
    assert.equal(terminalClaim.attempt, 10);
  },
);

test(
  "pair approval detects staged-pixel tampering before any final asset is committed",
  { timeout: 60_000 },
  async () => {
    const runDir = await createRunDir();
    const { state, pairReview, imagePaths } = await pairReadyFixture(runDir);
    await writeState(runDir, state);
    const reviewPath = path.join(runDir, "pair-review.json");
    await writeFile(reviewPath, JSON.stringify(pairReview));

    await writeFile(imagePaths[0], await solidPng("#ff0000"));
    const result = await runHarness(
      runDir,
      "approve-pair",
      `--passage-id=${PASSAGES[0].id}`,
      `--review=${reviewPath}`,
    );
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Staged pixels changed before pair QA/);
    const saved = await readState(runDir);
    assert.ok(Object.values(saved.assets).every((asset: any) => asset.status === "PAIR_QA_PENDING"));
    assert.ok(Object.values(saved.assets).every((asset: any) => asset.finalPath === undefined));
  },
);

test(
  "verification rejects reused native receipts and corrupt final bytes",
  { timeout: 60_000 },
  async () => {
    const runDir = await createRunDir();
    const { state, pairReview } = await pairReadyFixture(runDir);
    await writeState(runDir, state);
    const reviewPath = path.join(runDir, "pair-review.json");
    await writeFile(reviewPath, JSON.stringify(pairReview));
    expectSuccess(
      await runHarness(
        runDir,
        "approve-pair",
        `--passage-id=${PASSAGES[0].id}`,
        `--review=${reviewPath}`,
      ),
    );

    const approved = await readState(runDir);
    const assets = Object.values(approved.assets) as any[];
    assets[1].nativeReceipt.toolCallId = assets[0].nativeReceipt.toolCallId;
    await writeFile(path.resolve(assets[0].finalPath), Buffer.from("not-an-image"));
    await writeState(runDir, approved);

    const verified = await runHarness(runDir, "verify");
    assert.notEqual(verified.code, 0);
    const verificationOutput = `${verified.stdout}\n${verified.stderr}`;
    assert.match(verificationOutput, /missing or corrupt artifact/);
    assert.match(verificationOutput, /duplicate native tool call/);
  },
);

async function createRunDir(): Promise<string> {
  const parent = path.join(ROOT, "out");
  await mkdir(parent, { recursive: true });
  const runDir = await mkdtemp(path.join(parent, ".tmp-harness-"));
  createdRunDirs.add(runDir);
  return runDir;
}

async function fixtureState(
  selectedPassages: Array<{ id: string; text: string }>,
  concepts: readonly string[] = CONCEPTS,
): Promise<JsonRecord> {
  const now = new Date().toISOString();
  const assets: JsonRecord = {};
  for (const passage of selectedPassages) {
    const sourceHash = hash(`${passage.id}\n${passage.text}`);
    for (const concept of concepts) {
      const assetId = `${passage.id}__${concept}`;
      assets[assetId] = {
        assetId,
        passageId: passage.id,
        concept,
        language: "KO_EN",
        sourceHash,
        promptRevision: 1,
        attempt: 0,
        status: "PENDING",
        qa: {},
        failureHistory: [],
      };
    }
  }
  return {
    schemaVersion: 2,
    revision: 0,
    runId: `integration-${randomUUID()}`,
    createdAt: now,
    updatedAt: now,
    sourceFile: "src/data/exam-passages/passages.json",
    sourceSha256: hash(await readFile(SOURCE_FILE)),
    config: {
      concurrency: 10,
      language: "KO_EN",
      concepts: [...CONCEPTS],
      passageCount: PASSAGES.length,
      expectedAssetCount: Object.keys(assets).length,
      maxAttempts: 9,
      generator: "codex-native-imagegen-only",
      postAddedTextAllowed: false,
    },
    assets,
    batches: {},
  };
}

async function pairReadyFixture(runDir: string) {
  const state = await fixtureState(PASSAGES.slice(0, 1));
  const bytes = await solidPng("#111111");
  const imageSha256 = hash(bytes);
  const imagePaths: string[] = [];
  const nativePaths: string[] = [];
  const assets = Object.values(state.assets) as any[];
  for (const [index, asset] of assets.entries()) {
    const imagePath = path.join(runDir, "staging", `${index}.png`);
    const nativePath = path.join(runDir, "native-audit-copy", `${index}.png`);
    await mkdir(path.dirname(imagePath), { recursive: true });
    await mkdir(path.dirname(nativePath), { recursive: true });
    await writeFile(imagePath, bytes);
    await writeFile(nativePath, bytes);
    imagePaths.push(imagePath);
    nativePaths.push(nativePath);
    const prompt = `frozen prompt for ${asset.assetId}`;
    const promptHash = hash(prompt);
    asset.attempt = 1;
    asset.status = "PAIR_QA_PENDING";
    asset.prompts = [{ attempt: 1, promptRevision: 1, prompt, promptHash, createdAt: new Date().toISOString() }];
    asset.imagePath = path.relative(ROOT, imagePath).replaceAll("\\", "/");
    asset.imageSha256 = imageSha256;
    asset.nativeSourcePath = nativePath;
    asset.nativeSourceSha256 = imageSha256;
    asset.nativeReceipt = {
      sessionId: `session-${index}`,
      toolCallId: `exec-integration-${index}`,
      generatorAgentId: `generator-${index}`,
      batchId: `batch-${index}`,
      claimToken: `claim-${index}`,
      attempt: 1,
      promptHash,
      outputPath: nativePath,
      outputSha256: imageSha256,
      stagedAt: new Date().toISOString(),
    };
    asset.qa = {
      TEXT_PROOF: passingQa("TEXT_PROOF", `text-reviewer-${index}`),
      NARRATIVE_ART: passingQa("NARRATIVE_ART", `narrative-reviewer-${index}`),
    };
  }
  const pairReview = {
    runId: state.runId,
    passageId: PASSAGES[0].id,
    assets: assets.map((asset) => ({
      assetId: asset.assetId,
      concept: asset.concept,
      attempt: asset.attempt,
      imageSha256,
    })),
    reviewerAgentId: "pair-reviewer-fresh",
    pass: true,
    certain: true,
    hardGates: {
      contentEquivalent: true,
      conceptsDistinct: true,
      bothIndividuallyPassed: true,
      noMixedStyle: true,
    },
    failureConcepts: [],
    correctionDirective: "",
    evidence: ["Both distinct concepts preserve the same complete passage logic."],
  };
  return { state, pairReview, imagePaths, nativePaths };
}

function passingQa(kind: "TEXT_PROOF" | "NARRATIVE_ART", reviewerAgentId: string) {
  return {
    kind,
    pass: true,
    certain: true,
    reviewedAt: new Date().toISOString(),
    reviewerAgentId,
    hardGates: {},
    metrics: {},
    failureCodes: [],
    correctionDirective: "",
    evidence: ["passed"],
    artifactPath: "fixture-review.json",
  };
}

async function solidPng(background: string): Promise<Buffer> {
  return sharp({ create: { width: 16, height: 16, channels: 3, background } }).png().toBuffer();
}

async function failClaim(runDir: string, claim: JsonRecord) {
  return runHarness(
    runDir,
    "generation-failed",
    `--asset-id=${claim.assetId}`,
    `--attempt=${claim.attempt}`,
    `--batch-id=${claim.batchId}`,
    `--claim-token=${claim.claimToken}`,
    "--failure-code=GENERATION_ERROR",
    "--correction=Use a redesigned full-page composition.",
  );
}

async function writeState(runDir: string, state: JsonRecord) {
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(runDir, "state.json"), `${JSON.stringify(state, null, 2)}\n`);
  await writeFile(
    path.join(runDir, "inventory.jsonl"),
    `${PASSAGES.map((passage) => JSON.stringify({ passageId: passage.id })).join("\n")}\n`,
  );
}

async function readState(runDir: string): Promise<JsonRecord> {
  return JSON.parse(await readFile(path.join(runDir, "state.json"), "utf8"));
}

function countStatus(state: JsonRecord, status: string): number {
  return Object.values(state.assets).filter((asset: any) => asset.status === status).length;
}

function boundRcaPayload(state: JsonRecord, assetId: string) {
  const asset = state.assets[assetId];
  const prompt = asset.prompts.find((entry: JsonRecord) => entry.attempt === asset.attempt);
  assert.ok(prompt, `missing prompt snapshot for ${assetId} attempt ${asset.attempt}`);
  return {
    runId: state.runId,
    assetId,
    attempt: asset.attempt,
    sourceHash: asset.sourceHash,
    promptHash: prompt.promptHash,
    imageSha256: asset.imageSha256 ?? null,
    failureHistoryHash: hash(JSON.stringify(asset.failureHistory)),
  };
}

function hash(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function expectSuccess<T extends { code: number; stderr: string }>(result: T): T {
  assert.equal(result.code, 0, result.stderr);
  return result;
}

function runHarness(runDir: string, command: string, ...args: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [TSX_CLI, HARNESS, command, `--run-dir=${runDir}`, ...args],
      { cwd: ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}
