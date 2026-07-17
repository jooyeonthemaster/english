import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { ExamPassage } from "../../src/lib/exam-passages/types";
import { buildNativeRunImportPlan } from "../../scripts/import-codex-native-webtoon-run";

const CONCEPTS = ["CUTE_PASTEL", "MACHO_BLACK_RED"] as const;
const HASH = "a".repeat(64);
type ImportState = Parameters<typeof buildNativeRunImportPlan>[0]["state"];

test("buildNativeRunImportPlan accepts only an exact approved native pair", async (t) => {
  const fixture = await makeFixture();
  t.after(() => rm(fixture.runDir, { recursive: true, force: true }));

  const plan = await buildNativeRunImportPlan(fixture.input);

  assert.equal(plan.pairs.length, 1);
  assert.deepEqual(plan.pairs[0].items.map((item) => item.asset.concept), CONCEPTS);
  assert.equal(plan.pairs[0].pairQaArtifactSha256, HASH);
  assert.ok(plan.pairs[0].items.every((item) => item.asset.language === "KO_EN"));
});

test("buildNativeRunImportPlan rejects a stale pair-QA image binding", async (t) => {
  const fixture = await makeFixture();
  t.after(() => rm(fixture.runDir, { recursive: true, force: true }));
  fixture.input.state.assets[`p1__CUTE_PASTEL`].pairQa.imageSha256.CUTE_PASTEL = "b".repeat(64);

  await assert.rejects(
    buildNativeRunImportPlan(fixture.input),
    /pair QA is stale for this attempt\/hash/,
  );
});

test("buildNativeRunImportPlan rejects non-KO_EN or unrecognized concept runs", async (t) => {
  const fixture = await makeFixture();
  t.after(() => rm(fixture.runDir, { recursive: true, force: true }));
  fixture.input.state.config.language = "KO";

  await assert.rejects(buildNativeRunImportPlan(fixture.input), /Run language must be KO_EN/);

  fixture.input.state.config.language = "KO_EN";
  (fixture.input.state.config.concepts as string[]) = ["CUTE_PASTEL", "KOREAN_WEBTOON"];
  await assert.rejects(buildNativeRunImportPlan(fixture.input), /Unrecognized or missing native concept set/);
});

test("buildNativeRunImportPlan rejects source drift and final/native byte drift", async (t) => {
  const sourceFixture = await makeFixture();
  t.after(() => rm(sourceFixture.runDir, { recursive: true, force: true }));
  sourceFixture.input.state.sourceSha256 = "b".repeat(64);
  await assert.rejects(buildNativeRunImportPlan(sourceFixture.input), /Current corpus SHA-256/);

  const imageFixture = await makeFixture();
  t.after(() => rm(imageFixture.runDir, { recursive: true, force: true }));
  await writeFile(imageFixture.finalPaths.CUTE_PASTEL, Buffer.from("post-verified mutation"));
  await assert.rejects(buildNativeRunImportPlan(imageFixture.input), /final bytes no longer match native receipt/);
});

test("buildNativeRunImportPlan requires authoritative pass=true and failureCount=0", async (t) => {
  const fixture = await makeFixture();
  t.after(() => rm(fixture.runDir, { recursive: true, force: true }));
  fixture.input.verification = { pass: false, failureCount: 1, runId: fixture.input.state.runId };

  await assert.rejects(buildNativeRunImportPlan(fixture.input), /Authoritative harness verification/);
});

async function makeFixture() {
  const runDir = await mkdtemp(path.join(os.tmpdir(), "native-run-import-test-"));
  const passage = {
    id: "p1",
    examId: "e1",
    year: 2027,
    exam: "6월",
    form: "",
    board: "평가원",
    era: "modern",
    qNumbers: [20],
    type: "주제",
    typeGroup: "주제",
    answer: 1,
    reconstructionKind: "none",
    confidence: "high",
    hasDeliberateError: false,
    wordCount: 7,
    grade: "고3",
    text: "A source passage used for importer verification.",
  } satisfies ExamPassage;
  const corpusBytes = Buffer.from(JSON.stringify([passage]), "utf8");
  const sourceHash = digest(Buffer.from(`${passage.id}\n${passage.text}`, "utf8"));
  const imageBytes = Buffer.from("native image bytes");
  const imageHash = digest(imageBytes);
  const prompt = "immutable native prompt";
  const promptHash = digest(Buffer.from(prompt, "utf8"));
  const finalPaths = {} as Record<(typeof CONCEPTS)[number], string>;
  const assets = {} as ImportState["assets"];

  for (const concept of CONCEPTS) {
    const finalPath = path.join(runDir, "final", passage.id, `${concept}.png`);
    const nativePath = path.join(runDir, "native", `${concept}.png`);
    await mkdir(path.dirname(finalPath), { recursive: true });
    await mkdir(path.dirname(nativePath), { recursive: true });
    await writeFile(finalPath, imageBytes);
    await writeFile(nativePath, imageBytes);
    finalPaths[concept] = finalPath;
    assets[`${passage.id}__${concept}`] = {
      assetId: `${passage.id}__${concept}`,
      passageId: passage.id,
      concept,
      language: "KO_EN",
      sourceHash,
      attempt: 1,
      status: "APPROVED",
      prompts: [{ attempt: 1, prompt, promptHash }],
      nativeReceipt: {
        sessionId: `session-${concept}`,
        toolCallId: `exec-${concept}`,
        generatorAgentId: "generator",
        batchId: "batch",
        claimToken: `claim-${concept}`,
        attempt: 1,
        promptHash,
        outputPath: nativePath,
        outputSha256: imageHash,
        stagedAt: new Date().toISOString(),
      },
      nativeSourcePath: nativePath,
      nativeSourceSha256: imageHash,
      imageSha256: imageHash,
      finalPath,
      finalSha256: imageHash,
      approvedAt: new Date().toISOString(),
      qa: {
        TEXT_PROOF: passingReview("text"),
        NARRATIVE_ART: passingReview("narrative"),
      },
      pairQa: {
        ...passingReview("pair"),
        attempts: { CUTE_PASTEL: 1, MACHO_BLACK_RED: 1 },
        imageSha256: { CUTE_PASTEL: imageHash, MACHO_BLACK_RED: imageHash },
        reviewedAt: new Date().toISOString(),
      },
    };
  }

  const state = {
    schemaVersion: 2,
    runId: `codex-native-${randomUUID()}`,
    sourceFile: "src/data/exam-passages/passages.json",
    sourceSha256: digest(corpusBytes),
    config: {
      language: "KO_EN",
      concepts: [...CONCEPTS],
      passageCount: 1,
      expectedAssetCount: 2,
      generator: "codex-native-imagegen-only",
      postAddedTextAllowed: false,
      promptPolicyVersion: "policy-v4",
      promptPolicySha256: HASH,
      qaPolicySha256: HASH,
      inventorySha256: HASH,
    },
    assets,
  };
  return {
    runDir,
    finalPaths,
    input: {
      runDir,
      state,
      stateSha256: HASH,
      corpusBytes,
      verification: { pass: true, failureCount: 0, runId: state.runId },
      passages: [passage],
    },
  };
}

function passingReview(reviewerAgentId: string) {
  return {
    pass: true,
    artifactPath: `${reviewerAgentId}.json`,
    artifactSha256: HASH,
    reviewerAgentId,
  };
}

function digest(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}
