import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Prisma } from "@prisma/client";
import passagesJson from "../src/data/exam-passages/passages.json";
import type { ExamPassage } from "../src/lib/exam-passages/types";
import { prisma } from "../src/lib/prisma";
import {
  deleteWebtoonImage,
  uploadImageBufferToExamPassageWebtoonBucket,
} from "../src/lib/webtoon-storage";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_ROOT = path.join(REPO_ROOT, "out");
const HARNESS_PATH = path.join(REPO_ROOT, "scripts", "codex-native-webtoon-harness.ts");
const TSX_CLI = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const CORPUS_PATH = path.join(REPO_ROOT, "src", "data", "exam-passages", "passages.json");
const NATIVE_MODEL = "codex-native-imagegen-only";
const NATIVE_LANGUAGE = "KO_EN";
const NATIVE_CONCEPTS = ["CUTE_PASTEL", "MACHO_BLACK_RED"] as const;

type NativeConcept = (typeof NATIVE_CONCEPTS)[number];
type JsonRecord = Record<string, unknown>;

interface ImportArgs {
  runDir: string;
  commit: boolean;
  confirmRunId: string | null;
}

interface HarnessVerificationReport extends JsonRecord {
  pass: boolean;
  failureCount: number;
  runId?: string;
}

interface NativeReceipt extends JsonRecord {
  sessionId: string;
  toolCallId: string;
  generatorAgentId: string;
  batchId: string;
  claimToken: string;
  attempt: number;
  promptHash: string;
  outputPath: string;
  outputSha256: string;
  stagedAt: string;
}

interface StoredReview extends JsonRecord {
  pass: boolean;
  artifactPath: string;
  artifactSha256: string;
  reviewerAgentId: string;
}

interface PairQa extends StoredReview {
  attempts: Record<NativeConcept, number>;
  imageSha256: Record<NativeConcept, string>;
  reviewedAt: string;
}

interface PromptRecord extends JsonRecord {
  attempt: number;
  prompt?: string;
  promptPath?: string;
  promptHash: string;
}

interface ApprovedAsset extends JsonRecord {
  assetId: string;
  passageId: string;
  concept: NativeConcept;
  language: string;
  sourceHash: string;
  attempt: number;
  status: string;
  prompts: PromptRecord[];
  nativeReceipt: NativeReceipt;
  nativeSourcePath: string;
  nativeSourceSha256: string;
  imageSha256: string;
  finalPath: string;
  finalSha256: string;
  approvedAt: string;
  qa: {
    TEXT_PROOF: StoredReview;
    NARRATIVE_ART: StoredReview;
  };
  pairQa: PairQa;
}

interface VerifiedRunState extends JsonRecord {
  schemaVersion: number;
  runId: string;
  sourceFile: string;
  sourceSha256: string;
  config: {
    language: string;
    concepts: string[];
    passageCount: number;
    expectedAssetCount: number;
    generator: string;
    postAddedTextAllowed: boolean;
    promptPolicyVersion: string;
    promptPolicySha256: string;
    qaPolicySha256: string;
    inventorySha256: string;
  };
  assets: Record<string, ApprovedAsset>;
}

export interface NativeRunImportItem {
  passage: ExamPassage;
  asset: ApprovedAsset;
  imagePath: string;
  promptSnapshot: string;
  nativeReceiptSha256: string;
}

export interface NativeRunImportPair {
  passageId: string;
  pairQaArtifactSha256: string;
  items: [NativeRunImportItem, NativeRunImportItem];
}

export interface NativeRunImportPlan {
  runId: string;
  stateSha256: string;
  verificationReportSha256: string;
  state: VerifiedRunState;
  pairs: NativeRunImportPair[];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runDir = await resolveAllowedRunDir(args.runDir);

  // Read both sides of the authoritative verifier. A concurrent state mutation
  // invalidates the import even if the verifier itself happened to pass.
  const stateBefore = await readHarnessStateSnapshot(runDir);
  const verification = await runAuthoritativeHarnessVerify(runDir);
  const stateAfter = await readHarnessStateSnapshot(runDir);
  if (stateBefore.sha256 !== stateAfter.sha256) {
    throw new Error("Harness state changed while authoritative verification was running");
  }

  const state = stateAfter.state;
  if (args.commit && args.confirmRunId !== state.runId) {
    throw new Error(
      `Commit requires --confirm-run-id=${state.runId}; received ${args.confirmRunId ?? "(missing)"}`,
    );
  }
  if (!args.commit && args.confirmRunId) {
    throw new Error("--confirm-run-id is only valid together with --commit");
  }

  const corpusBytes = await readFile(CORPUS_PATH);
  const plan = await buildNativeRunImportPlan({
    runDir,
    state,
    stateSha256: stateAfter.sha256,
    corpusBytes,
    verification,
    passages: passagesJson as ExamPassage[],
  });

  console.log(
    JSON.stringify(
      {
        dryRun: !args.commit,
        authoritativeVerification: {
          pass: verification.pass,
          failureCount: verification.failureCount,
          reportSha256: plan.verificationReportSha256,
        },
        runId: plan.runId,
        stateSha256: plan.stateSha256,
        passagePairs: plan.pairs.length,
        assets: plan.pairs.length * 2,
        language: NATIVE_LANGUAGE,
        concepts: NATIVE_CONCEPTS,
      },
      null,
      2,
    ),
  );

  if (!args.commit) {
    console.log(
      `[dry-run] No database or storage writes. To commit this exact run, add --commit --confirm-run-id=${plan.runId}`,
    );
    return;
  }

  const result = await importPlan(plan);
  console.log(JSON.stringify({ committed: true, ...result }, null, 2));
}

export async function buildNativeRunImportPlan(input: {
  runDir: string;
  state: VerifiedRunState;
  stateSha256: string;
  corpusBytes: Buffer;
  verification: HarnessVerificationReport;
  passages: ExamPassage[];
}): Promise<NativeRunImportPlan> {
  const { state, verification } = input;
  assertSha256(input.stateSha256, "state SHA-256");
  if (verification.pass !== true || verification.failureCount !== 0) {
    throw new Error("Authoritative harness verification did not return pass=true, failureCount=0");
  }
  if (verification.runId && verification.runId !== state.runId) {
    throw new Error("Harness verification report runId does not match state runId");
  }
  if (state.schemaVersion !== 2) throw new Error(`Unsupported harness schemaVersion: ${state.schemaVersion}`);
  if (!state.runId?.startsWith("codex-native-")) throw new Error(`Invalid native runId: ${state.runId}`);
  if (state.sourceFile !== "src/data/exam-passages/passages.json") {
    throw new Error(`Unexpected harness sourceFile: ${state.sourceFile}`);
  }
  if (sha256(input.corpusBytes) !== state.sourceSha256) {
    throw new Error("Current corpus SHA-256 does not match the verified native run");
  }
  if (state.config.generator !== NATIVE_MODEL || state.config.postAddedTextAllowed !== false) {
    throw new Error("Run is not codex-native-imagegen-only with post-added text forbidden");
  }
  if (state.config.language !== NATIVE_LANGUAGE) {
    throw new Error(`Run language must be ${NATIVE_LANGUAGE}`);
  }
  assertExactConceptSet(state.config.concepts);
  if (!state.config.promptPolicyVersion || !state.config.promptPolicySha256 || !state.config.qaPolicySha256) {
    throw new Error("Run is missing frozen prompt/QA policy provenance");
  }
  assertSha256(state.sourceSha256, "source SHA-256");
  assertSha256(state.config.promptPolicySha256, "prompt policy SHA-256");
  assertSha256(state.config.qaPolicySha256, "QA policy SHA-256");
  assertSha256(state.config.inventorySha256, "inventory SHA-256");

  if (state.config.passageCount !== input.passages.length) {
    throw new Error(`Passage count ${state.config.passageCount} != current corpus ${input.passages.length}`);
  }
  if (state.config.expectedAssetCount !== input.passages.length * NATIVE_CONCEPTS.length) {
    throw new Error("Expected asset count is not exactly two native concepts per corpus passage");
  }
  if (Object.keys(state.assets).length !== state.config.expectedAssetCount) {
    throw new Error("Harness asset map cardinality does not match expectedAssetCount");
  }

  const verificationReportSha256 = sha256(Buffer.from(JSON.stringify(verification), "utf8"));
  const pairs: NativeRunImportPair[] = [];
  for (const passage of input.passages) {
    const expectedSourceHash = sha256(Buffer.from(`${passage.id}\n${passage.text}`, "utf8"));
    const pairItems: NativeRunImportItem[] = [];
    let pairQaHash: string | null = null;

    for (const concept of NATIVE_CONCEPTS) {
      const expectedAssetId = `${passage.id}__${concept}`;
      const asset = state.assets[expectedAssetId];
      if (!asset) throw new Error(`${passage.id}: missing ${concept}`);
      assertApprovedAsset(asset, {
        expectedAssetId,
        passageId: passage.id,
        concept,
        sourceHash: expectedSourceHash,
      });
      if (pairQaHash && pairQaHash !== asset.pairQa.artifactSha256) {
        throw new Error(`${passage.id}: pair QA hash differs between concepts`);
      }
      pairQaHash = asset.pairQa.artifactSha256;

      const imagePath = resolveRepoPath(asset.finalPath);
      assertPathInside(imagePath, path.join(input.runDir, "final"), `${asset.assetId} final image`);
      const imageBytes = await readFile(imagePath);
      const actualFinalHash = sha256(imageBytes);
      if (actualFinalHash !== asset.finalSha256 || actualFinalHash !== asset.nativeReceipt.outputSha256) {
        throw new Error(`${asset.assetId}: final bytes no longer match native receipt`);
      }

      const nativeBytes = await readFile(asset.nativeSourcePath);
      if (sha256(nativeBytes) !== actualFinalHash) {
        throw new Error(`${asset.assetId}: native source bytes differ from final bytes`);
      }

      const prompt = asset.prompts.find((entry) => entry.attempt === asset.attempt);
      if (!prompt) throw new Error(`${asset.assetId}: current prompt snapshot is missing`);
      const promptSnapshot = await readPrompt(prompt);
      if (sha256(Buffer.from(promptSnapshot, "utf8")) !== prompt.promptHash) {
        throw new Error(`${asset.assetId}: prompt snapshot hash mismatch after verification`);
      }

      pairItems.push({
        passage,
        asset,
        imagePath,
        promptSnapshot,
        nativeReceiptSha256: sha256(Buffer.from(stableJson(asset.nativeReceipt), "utf8")),
      });
    }
    pairs.push({
      passageId: passage.id,
      pairQaArtifactSha256: pairQaHash!,
      items: pairItems as [NativeRunImportItem, NativeRunImportItem],
    });
  }

  return {
    runId: state.runId,
    stateSha256: input.stateSha256,
    verificationReportSha256,
    state,
    pairs,
  };
}

function assertApprovedAsset(
  asset: ApprovedAsset,
  expected: { expectedAssetId: string; passageId: string; concept: NativeConcept; sourceHash: string },
) {
  if (
    asset.assetId !== expected.expectedAssetId ||
    asset.passageId !== expected.passageId ||
    asset.concept !== expected.concept
  ) {
    throw new Error(`${expected.expectedAssetId}: asset identity/concept mismatch`);
  }
  if (asset.language !== NATIVE_LANGUAGE) throw new Error(`${asset.assetId}: language must be KO_EN`);
  if (asset.status !== "APPROVED") throw new Error(`${asset.assetId}: status is not APPROVED`);
  if (asset.sourceHash !== expected.sourceHash) throw new Error(`${asset.assetId}: current corpus source hash mismatch`);
  if (!Number.isInteger(asset.attempt) || asset.attempt < 1) throw new Error(`${asset.assetId}: invalid attempt`);
  if (!asset.nativeReceipt || asset.nativeReceipt.attempt !== asset.attempt) {
    throw new Error(`${asset.assetId}: native receipt is missing or stale`);
  }
  if (asset.nativeReceipt.promptHash !== asset.prompts?.find((entry) => entry.attempt === asset.attempt)?.promptHash) {
    throw new Error(`${asset.assetId}: native receipt prompt binding is stale`);
  }
  const exactHash = asset.nativeReceipt.outputSha256;
  assertSha256(exactHash, `${asset.assetId} native output SHA-256`);
  if (
    asset.nativeSourceSha256 !== exactHash ||
    asset.imageSha256 !== exactHash ||
    asset.finalSha256 !== exactHash
  ) {
    throw new Error(`${asset.assetId}: final/staged/native recorded hashes are not identical`);
  }
  for (const [kind, review] of Object.entries(asset.qa ?? {})) {
    if ((kind === "TEXT_PROOF" || kind === "NARRATIVE_ART") && (!review?.pass || !review.artifactSha256)) {
      throw new Error(`${asset.assetId}: ${kind} is not a hashed passing review`);
    }
  }
  if (!asset.qa?.TEXT_PROOF?.pass || !asset.qa?.NARRATIVE_ART?.pass) {
    throw new Error(`${asset.assetId}: both independent reviews must pass`);
  }
  assertSha256(asset.qa.TEXT_PROOF.artifactSha256, `${asset.assetId} text review SHA-256`);
  assertSha256(asset.qa.NARRATIVE_ART.artifactSha256, `${asset.assetId} narrative review SHA-256`);
  if (!asset.pairQa?.pass) throw new Error(`${asset.assetId}: pair QA must pass`);
  assertSha256(asset.pairQa.artifactSha256, `${asset.assetId} pair QA SHA-256`);
  if (
    asset.pairQa.attempts?.[asset.concept] !== asset.attempt ||
    asset.pairQa.imageSha256?.[asset.concept] !== exactHash
  ) {
    throw new Error(`${asset.assetId}: pair QA is stale for this attempt/hash`);
  }
}

async function importPlan(plan: NativeRunImportPlan) {
  let importedPairs = 0;
  let importedAssets = 0;
  for (const pair of plan.pairs) {
    const keys = pair.items.map((item) => ({
      examPassageId: item.passage.id,
      language: NATIVE_LANGUAGE,
      style: item.asset.concept,
    }));
    const existing = await prisma.examPassageWebtoonAsset.findMany({
      where: { OR: keys },
      select: { id: true, examPassageId: true, language: true, style: true, storagePath: true },
    });
    const existingByKey = new Map(
      existing.map((asset) => [`${asset.examPassageId}|${asset.language}|${asset.style}`, asset]),
    );
    const uploads: Array<{
      item: NativeRunImportItem;
      dbId: string;
      uploaded: Awaited<ReturnType<typeof uploadImageBufferToExamPassageWebtoonBucket>>;
      previousStoragePath: string | null;
    }> = [];

    try {
      for (const item of pair.items) {
        // Re-read and hash the harness-owned final immediately before the only
        // external write. Nothing is read from a caller-supplied image argument.
        const imageBytes = await readFile(item.imagePath);
        const finalHash = sha256(imageBytes);
        if (finalHash !== item.asset.finalSha256 || finalHash !== item.asset.nativeReceipt.outputSha256) {
          throw new Error(`${item.asset.assetId}: image buffer changed before upload`);
        }
        const key = `${item.passage.id}|${NATIVE_LANGUAGE}|${item.asset.concept}`;
        const prior = existingByKey.get(key);
        const dbId = prior?.id ?? `native_${randomUUID().replaceAll("-", "")}`;
        const uploaded = await uploadImageBufferToExamPassageWebtoonBucket({
          imageBuffer: imageBytes,
          assetId: dbId,
          contentType: contentTypeForPath(item.imagePath),
          version: `${plan.runId}-${finalHash.slice(0, 16)}`,
        });
        uploads.push({ item, dbId, uploaded, previousStoragePath: prior?.storagePath ?? null });
      }

      await prisma.$transaction(
        uploads.map(({ item, dbId, uploaded }) => {
          const qaReport = buildQaReport(plan, pair, item, uploaded);
          const data = {
            status: "APPROVED",
            imageUrl: uploaded.publicUrl,
            storagePath: uploaded.storagePath,
            rawAtlasUrl: null,
            promptSnapshot: item.promptSnapshot,
            promptHash: item.asset.nativeReceipt.promptHash,
            imageModel: NATIVE_MODEL,
            imageSize: null,
            imageQuality: null,
            imageOutputFormat: extensionForContentType(uploaded.contentType),
            atlasPredictionId: null,
            sourceHash: item.asset.sourceHash,
            sourceMeta: sourceMeta(item.passage),
            qaReport,
            attempts: item.asset.attempt,
            errorMessage: null,
            generatedAt: new Date(item.asset.nativeReceipt.stagedAt),
            reviewedAt: new Date(item.asset.pairQa.reviewedAt),
          } satisfies Prisma.ExamPassageWebtoonAssetUpdateInput;
          return prisma.examPassageWebtoonAsset.upsert({
            where: {
              examPassageId_language_style: {
                examPassageId: item.passage.id,
                language: NATIVE_LANGUAGE,
                style: item.asset.concept,
              },
            },
            create: {
              id: dbId,
              examPassageId: item.passage.id,
              language: NATIVE_LANGUAGE,
              style: item.asset.concept,
              ...data,
            },
            update: data,
          });
        }),
      );
    } catch (error) {
      await Promise.all(uploads.map(({ uploaded }) => deleteWebtoonImage(uploaded.storagePath).catch(() => undefined)));
      throw error;
    }

    // Only retire superseded objects after both concept rows commit together.
    await Promise.all(
      uploads.map(({ previousStoragePath, uploaded }) =>
        previousStoragePath && previousStoragePath !== uploaded.storagePath
          ? deleteWebtoonImage(previousStoragePath).catch((error) => {
              console.warn(`[cleanup-warning] ${previousStoragePath}: ${String(error)}`);
            })
          : Promise.resolve(),
      ),
    );
    importedPairs += 1;
    importedAssets += uploads.length;
    if (importedPairs % 25 === 0 || importedPairs === plan.pairs.length) {
      console.log(`[commit] passage pairs ${importedPairs}/${plan.pairs.length}`);
    }
  }
  return { importedPairs, importedAssets };
}

function buildQaReport(
  plan: NativeRunImportPlan,
  pair: NativeRunImportPair,
  item: NativeRunImportItem,
  uploaded: { bytes: number; contentType: string },
): Prisma.InputJsonObject {
  return {
    schemaVersion: 1,
    status: "APPROVED",
    source: "codex-native-approved-pair-import",
    approvalAuthority: "codex-native-webtoon-harness:verify",
    importedWithoutLegacyReview: true,
    run: {
      runId: plan.runId,
      harnessSchemaVersion: plan.state.schemaVersion,
      stateSha256: plan.stateSha256,
      verificationReportSha256: plan.verificationReportSha256,
      sourceFile: plan.state.sourceFile,
      sourceSha256: plan.state.sourceSha256,
      inventorySha256: plan.state.config.inventorySha256,
    },
    policy: {
      promptPolicyVersion: plan.state.config.promptPolicyVersion,
      promptPolicySha256: plan.state.config.promptPolicySha256,
      qaPolicySha256: plan.state.config.qaPolicySha256,
      generator: NATIVE_MODEL,
      language: NATIVE_LANGUAGE,
      postAddedTextAllowed: false,
    },
    asset: {
      harnessAssetId: item.asset.assetId,
      passageId: item.asset.passageId,
      concept: item.asset.concept,
      attempt: item.asset.attempt,
      approvedAt: item.asset.approvedAt,
      sourceHashAlgorithm: "sha256(id + newline + text)",
      sourceHash: item.asset.sourceHash,
      promptHash: item.asset.nativeReceipt.promptHash,
      nativeReceiptSha256: item.nativeReceiptSha256,
      nativeOutputSha256: item.asset.nativeReceipt.outputSha256,
      nativeSourceSha256: item.asset.nativeSourceSha256,
      stagedImageSha256: item.asset.imageSha256,
      finalImageSha256: item.asset.finalSha256,
      nativeReceipt: {
        sessionId: item.asset.nativeReceipt.sessionId,
        toolCallId: item.asset.nativeReceipt.toolCallId,
        generatorAgentId: item.asset.nativeReceipt.generatorAgentId,
        batchId: item.asset.nativeReceipt.batchId,
        attempt: item.asset.nativeReceipt.attempt,
      },
    },
    reviews: {
      textProofArtifactSha256: item.asset.qa.TEXT_PROOF.artifactSha256,
      textProofReviewerAgentId: item.asset.qa.TEXT_PROOF.reviewerAgentId,
      narrativeArtArtifactSha256: item.asset.qa.NARRATIVE_ART.artifactSha256,
      narrativeArtReviewerAgentId: item.asset.qa.NARRATIVE_ART.reviewerAgentId,
      pairArtifactSha256: pair.pairQaArtifactSha256,
      pairReviewerAgentId: item.asset.pairQa.reviewerAgentId,
      pairReviewedAt: item.asset.pairQa.reviewedAt,
    },
    upload: { bytes: uploaded.bytes, contentType: uploaded.contentType },
  };
}

async function runAuthoritativeHarnessVerify(runDir: string): Promise<HarnessVerificationReport> {
  const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [TSX_CLI, HARNESS_PATH, "verify", `--run-dir=${runDir}`],
      { cwd: REPO_ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
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
  if (result.code !== 0) {
    throw new Error(
      `Authoritative native harness verification failed (exit ${result.code})` +
        `${result.stderr ? `\nstderr:\n${result.stderr.trim()}` : ""}` +
        `${result.stdout ? `\nstdout:\n${result.stdout.trim()}` : ""}`,
    );
  }
  const report = parseJsonObject<HarnessVerificationReport>(Buffer.from(result.stdout), "harness verify stdout");
  if (report.pass !== true || report.failureCount !== 0) {
    throw new Error("Authoritative native harness verification did not prove full completion");
  }
  return report;
}

async function readHarnessStateSnapshot(
  runDir: string,
): Promise<{ state: VerifiedRunState; sha256: string }> {
  const sqlitePath = path.join(runDir, "state.sqlite");
  const jsonPath = path.join(runDir, "state.json");
  let state: VerifiedRunState;
  if (await fileExists(sqlitePath)) {
    // Keep scripts type-checkable on the project's older @types/node while the
    // runtime is Node 22+, where node:sqlite is available (the harness uses it too).
    const sqliteModuleName = "node:sqlite";
    const { DatabaseSync } = await import(sqliteModuleName);
    const db = new DatabaseSync(sqlitePath, { readOnly: true });
    try {
      db.exec("PRAGMA busy_timeout=30000; BEGIN");
      const headerRow = db.prepare("SELECT header_json FROM run_state WHERE id = 1").get() as
        | { header_json?: unknown }
        | undefined;
      if (!headerRow || typeof headerRow.header_json !== "string") {
        throw new Error(`SQLite run header missing: ${sqlitePath}`);
      }
      const header = parseJsonObject<JsonRecord>(Buffer.from(headerRow.header_json), "SQLite run header");
      const assets = Object.fromEntries(
        (db.prepare("SELECT asset_id, state_json FROM assets ORDER BY asset_id").all() as unknown as Array<{
          asset_id: string;
          state_json: string;
        }>).map((row) => [
          row.asset_id,
          parseJsonObject<ApprovedAsset>(Buffer.from(row.state_json), `asset ${row.asset_id}`),
        ]),
      );
      const batches = Object.fromEntries(
        (db.prepare("SELECT batch_id, state_json FROM batches ORDER BY batch_id").all() as unknown as Array<{
          batch_id: string;
          state_json: string;
        }>).map((row) => [row.batch_id, JSON.parse(row.state_json) as unknown]),
      );
      const receiptLedger: JsonRecord = { byToolCallId: {}, byOutputSha256: {} };
      const byToolCallId = receiptLedger.byToolCallId as JsonRecord;
      const byOutputSha256 = receiptLedger.byOutputSha256 as JsonRecord;
      for (const row of db.prepare(
        "SELECT tool_call_id, output_sha256, asset_id, state_json FROM receipts ORDER BY tool_call_id",
      ).all() as unknown as Array<{
        tool_call_id: string;
        output_sha256: string;
        asset_id: string;
        state_json: string;
      }>) {
        byToolCallId[row.tool_call_id] = JSON.parse(row.state_json) as unknown;
        byOutputSha256[row.output_sha256] = row.asset_id;
      }
      const rows = (table: string) =>
        (db.prepare(`SELECT state_json FROM ${table} ORDER BY id`).all() as unknown as Array<{
          state_json: string;
        }>).map((row) => JSON.parse(row.state_json) as unknown);
      state = {
        ...header,
        assets,
        batches,
        receiptLedger,
        reviewLedger: rows("reviews"),
        pairReviewHistory: rows("pair_reviews"),
        rcaHistory: rows("rcas"),
      } as unknown as VerifiedRunState;
      db.exec("COMMIT");
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // The read transaction may not have started if schema validation failed.
      }
      throw error;
    } finally {
      db.close();
    }
  } else {
    state = parseJsonObject<VerifiedRunState>(await readFile(jsonPath), "state.json");
  }
  return {
    state,
    sha256: sha256(Buffer.from(stableJson(state), "utf8")),
  };
}

function parseArgs(argv: string[]): ImportArgs {
  const valueOf = (name: string) => {
    const found = argv.find((arg) => arg.startsWith(`${name}=`));
    return found ? found.slice(name.length + 1).trim() : null;
  };
  const runDir = valueOf("--run-dir");
  if (!runDir) throw new Error("Missing --run-dir=<completed native harness directory>");
  const unknown = argv.filter(
    (arg) => arg !== "--commit" && !arg.startsWith("--run-dir=") && !arg.startsWith("--confirm-run-id="),
  );
  if (unknown.length) throw new Error(`Unknown arguments: ${unknown.join(", ")}`);
  return { runDir, commit: argv.includes("--commit"), confirmRunId: valueOf("--confirm-run-id") };
}

async function resolveAllowedRunDir(input: string): Promise<string> {
  const [resolvedRun, resolvedOut] = await Promise.all([realpath(path.resolve(input)), realpath(OUT_ROOT)]);
  assertPathInside(resolvedRun, resolvedOut, "run directory");
  if (!path.basename(resolvedRun).startsWith("codex-native-exam-webtoons-")) {
    throw new Error("Run directory name must start with codex-native-exam-webtoons-");
  }
  return resolvedRun;
}

function assertExactConceptSet(concepts: string[]) {
  if (!Array.isArray(concepts) || concepts.length !== NATIVE_CONCEPTS.length) {
    throw new Error("Run must contain exactly the two recognized native concepts");
  }
  const actual = [...concepts].sort().join("|");
  const expected = [...NATIVE_CONCEPTS].sort().join("|");
  if (actual !== expected) throw new Error(`Unrecognized or missing native concept set: ${actual}`);
}

function assertPathInside(candidate: string, parent: string, label: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return;
  throw new Error(`${label} escapes approved directory: ${candidate}`);
}

function resolveRepoPath(filePath: string): string {
  return path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(REPO_ROOT, filePath);
}

async function readPrompt(prompt: PromptRecord): Promise<string> {
  if (typeof prompt.promptPath === "string") return readFile(resolveRepoPath(prompt.promptPath), "utf8");
  if (typeof prompt.prompt === "string") return prompt.prompt;
  throw new Error(`Prompt attempt ${prompt.attempt} has no immutable snapshot`);
}

function sourceMeta(passage: ExamPassage): Prisma.InputJsonObject {
  return {
    year: passage.year,
    exam: passage.exam,
    grade: passage.grade ?? "고등",
    qNumbers: passage.qNumbers,
    type: passage.type,
    typeGroup: passage.typeGroup,
    reconstructionKind: passage.reconstructionKind,
    confidence: passage.confidence,
    wordCount: passage.wordCount,
  };
}

function contentTypeForPath(filePath: string): "image/jpeg" | "image/png" | "image/webp" {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  throw new Error(`Unsupported final image extension: ${extension || "(none)"}`);
}

function extensionForContentType(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/jpeg") return "jpeg";
  throw new Error(`Unsupported uploaded content type: ${contentType}`);
}

function parseJsonObject<T extends JsonRecord>(bytes: Buffer, label: string): T {
  const parsed: unknown = JSON.parse(bytes.toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} is not a JSON object`);
  }
  return parsed as T;
}

async function fileExists(filePath: string): Promise<boolean> {
  return Boolean(await stat(filePath).catch(() => null));
}

function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} is not a lowercase SHA-256 digest`);
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as JsonRecord)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
