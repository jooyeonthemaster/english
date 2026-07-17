import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import passagesJson from "../src/data/exam-passages/passages.json";
import type { ExamPassage } from "../src/lib/exam-passages/types";
import {
  buildCodexNativeWebtoonPrompt,
  CODEX_NATIVE_WEBTOON_CONCEPTS,
  CODEX_NATIVE_WEBTOON_CONCURRENCY,
  CODEX_NATIVE_WEBTOON_LANGUAGE,
  CODEX_NATIVE_WEBTOON_PROMPT_POLICY_VERSION,
  extractCodexNativeCorePhrases,
  type CodexNativeWebtoonConceptId,
} from "../src/lib/exam-passages/codex-native-webtoon";
import {
  formatCodexNativeQaIssues,
  validateCodexNativeAssetReview,
  validateCodexNativePairReview,
  type CodexNativeAssetReview,
  type CodexNativePairReview,
  type CodexNativePairReviewAssetExpectation,
} from "../src/lib/exam-passages/codex-native-webtoon-qa";

type AssetStatus =
  | "PENDING"
  | "GEN_QUEUED"
  | "GENERATED_STAGED"
  | "QA_PENDING"
  | "QA_RUNNING"
  | "QA_PASSED"
  | "RETRY_QUEUED"
  | "RCA_REQUIRED"
  | "BLOCKED_RCA"
  | "PAIR_QA_PENDING"
  | "APPROVED";
type ReviewKind = "TEXT_PROOF" | "NARRATIVE_ART";

interface QaResult {
  kind: ReviewKind;
  pass: boolean;
  certain: boolean;
  reviewedAt: string;
  reviewerAgentId: string;
  hardGates: Record<string, boolean>;
  metrics: Record<string, number>;
  failureCodes: string[];
  correctionDirective: string;
  evidence: string[];
  artifactPath: string;
  artifactSha256?: string;
  attempt?: number;
  imageSha256?: string;
  promptHash?: string;
  sourceHash?: string;
  requiredPhraseEvidence?: Array<{
    requiredPhrase: string;
    englishTranscription: string;
    koreanTranscription: string;
    location: string;
    englishExact: true;
    koreanMeaningFaithful: true;
    koreanNatural: true;
    readable: true;
  }>;
}

interface PromptRecord {
  attempt: number;
  promptRevision: number;
  /** Legacy inline prompt; new runs store immutable promptPath instead. */
  prompt?: string;
  promptPath?: string;
  promptHash: string;
  requiredEnglishPhrases: string[];
  createdAt: string;
}

interface GenerationLease {
  batchId: string;
  claimToken: string;
  attempt: number;
  promptHash: string;
  claimedAt: string;
  expiresAt: string;
}

interface NativeReceipt {
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

interface PairQaRecord {
  pass: boolean;
  artifactPath: string;
  artifactSha256: string;
  reviewerAgentId: string;
  attempts: Record<CodexNativeWebtoonConceptId, number>;
  imageSha256: Record<CodexNativeWebtoonConceptId, string>;
  reviewedAt: string;
}

interface RcaRecord {
  assetId: string;
  attempt: number;
  reviewerAgentId: string;
  artifactPath: string;
  artifactSha256: string;
  sourceHash: string;
  promptHash: string;
  imageSha256: string;
  failureHistoryHash: string;
  terminalOverride: boolean;
  reviewedAt: string;
}

interface AssetState {
  assetId: string;
  passageId: string;
  concept: CodexNativeWebtoonConceptId;
  language: typeof CODEX_NATIVE_WEBTOON_LANGUAGE;
  sourceHash: string;
  promptRevision: number;
  attempt: number;
  status: AssetStatus;
  queuedAt?: string;
  lease?: GenerationLease;
  prompts?: PromptRecord[];
  nativeReceipt?: NativeReceipt;
  imagePath?: string;
  imageSha256?: string;
  imageWidth?: number;
  imageHeight?: number;
  imageAspectRatio?: number;
  nativeSourcePath?: string;
  nativeSourceSha256?: string;
  qa: Partial<Record<ReviewKind, QaResult>>;
  failureHistory: Array<{
    attempt: number;
    kind: ReviewKind;
    failureCodes: string[];
    correctionDirective: string;
  }>;
  approvedAt?: string;
  finalPath?: string;
  finalSha256?: string;
  pairQa?: PairQaRecord;
}

interface HarnessState {
  schemaVersion: 2;
  revision: number;
  runId: string;
  createdAt: string;
  updatedAt: string;
  sourceFile: string;
  sourceSha256: string;
  config: {
    concurrency: number;
    language: typeof CODEX_NATIVE_WEBTOON_LANGUAGE;
    concepts: CodexNativeWebtoonConceptId[];
    passageCount: number;
    expectedAssetCount: number;
    maxAttempts: number;
    generator: "codex-native-imagegen-only";
    postAddedTextAllowed: false;
    promptPolicyVersion: typeof CODEX_NATIVE_WEBTOON_PROMPT_POLICY_VERSION;
    promptPolicySha256: string;
    qaPolicySha256: string;
    inventorySha256: string;
  };
  assets: Record<string, AssetState>;
  batches: Record<string, {
    batchId: string;
    claimedAt: string;
    assetIds: string[];
    status: "ACTIVE" | "SETTLED";
  }>;
  receiptLedger: {
    byToolCallId: Record<string, { assetId: string; receipt: NativeReceipt }>;
    byOutputSha256: Record<string, string>;
  };
  reviewLedger: Array<{ assetId: string; attempt: number; review: QaResult }>;
  pairReviewHistory: Array<{ passageId: string; record: PairQaRecord }>;
  rcaHistory: RcaRecord[];
}

const argv = process.argv.slice(2);
const command = argv[0] ?? "status";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_FILE = "src/data/exam-passages/passages.json";
const PROMPT_POLICY_FILE = "src/lib/exam-passages/codex-native-webtoon.ts";
const QA_POLICY_FILE = "src/lib/exam-passages/codex-native-webtoon-qa.ts";
const runDir = path.resolve(REPO_ROOT, valueOf("--run-dir") ?? "out/codex-native-exam-webtoons-20260715-v2");
const statePath = path.join(runDir, "state.json");
const stateDbPath = path.join(runDir, "state.sqlite");
const lockPath = path.join(runDir, "state.lock");
const DEFAULT_LEASE_MS = 30 * 60 * 1000;
const passages = passagesJson as ExamPassage[];
const passageById = new Map(passages.map((passage) => [passage.id, passage]));

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  switch (command) {
    case "init":
      await init();
      break;
    case "next":
      await nextBatch();
      break;
    case "stage":
      await stageGenerated();
      break;
    case "generation-failed":
      await recordGenerationFailure();
      break;
    case "recover":
      await recoverExpiredLeases();
      break;
    case "record-qa":
      await recordQa();
      break;
    case "record-rca":
      await recordRca();
      break;
    case "approve-pair":
      await approvePair();
      break;
    case "status":
      await printStatus();
      break;
    case "verify":
      await verify();
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

async function init() {
  await mkdir(runDir, { recursive: true });
  const initLock = await acquireStateLock();
  try {
    const force = argv.includes("--force");
    const existingState = await firstExistingPath([stateDbPath, statePath]);
    if (existingState && !force) {
      throw new Error(`State already exists: ${existingState}. Use --force to replace.`);
    }
    if (force) {
      await Promise.all([
        unlink(stateDbPath).catch(() => undefined),
        unlink(`${stateDbPath}-wal`).catch(() => undefined),
        unlink(`${stateDbPath}-shm`).catch(() => undefined),
        unlink(statePath).catch(() => undefined),
      ]);
    }

  const now = new Date().toISOString();
  const assets: Record<string, AssetState> = {};
  const inventoryLines: string[] = [];
  for (const passage of passages) {
    if (!passage.id || !passage.text.trim()) throw new Error(`Invalid passage: ${passage.id}`);
    const sourceHash = sha256(`${passage.id}\n${passage.text}`);
    inventoryLines.push(
      JSON.stringify({
        passageId: passage.id,
        examId: passage.examId,
        year: passage.year,
        exam: passage.exam,
        grade: passage.grade ?? "고3",
        board: passage.board,
        qNumbers: passage.qNumbers,
        type: passage.type,
        reconstructionKind: passage.reconstructionKind,
        confidence: passage.confidence,
        wordCount: passage.wordCount,
        sourceHash,
        text: passage.text,
      }),
    );
    for (const concept of CODEX_NATIVE_WEBTOON_CONCEPTS) {
      const assetId = `${passage.id}__${concept.id}`;
      assets[assetId] = {
        assetId,
        passageId: passage.id,
        concept: concept.id,
        language: CODEX_NATIVE_WEBTOON_LANGUAGE,
        sourceHash,
        promptRevision: 1,
        attempt: 0,
        status: "PENDING",
        qa: {},
        failureHistory: [],
      };
    }
  }

  const inventoryContent = `${inventoryLines.join("\n")}\n`;
  const [sourceBytes, promptPolicyBytes, qaPolicyBytes] = await Promise.all([
    readFile(path.join(REPO_ROOT, SOURCE_FILE)),
    readFile(path.join(REPO_ROOT, PROMPT_POLICY_FILE)),
    readFile(path.join(REPO_ROOT, QA_POLICY_FILE)),
  ]);
  const state: HarnessState = {
    schemaVersion: 2,
    revision: 0,
    runId: `codex-native-${randomUUID()}`,
    createdAt: now,
    updatedAt: now,
    sourceFile: SOURCE_FILE,
    sourceSha256: sha256(sourceBytes),
    config: {
      concurrency: CODEX_NATIVE_WEBTOON_CONCURRENCY,
      language: CODEX_NATIVE_WEBTOON_LANGUAGE,
      concepts: CODEX_NATIVE_WEBTOON_CONCEPTS.map((concept) => concept.id),
      passageCount: passages.length,
      expectedAssetCount: passages.length * CODEX_NATIVE_WEBTOON_CONCEPTS.length,
      maxAttempts: 9,
      generator: "codex-native-imagegen-only",
      postAddedTextAllowed: false,
      promptPolicyVersion: CODEX_NATIVE_WEBTOON_PROMPT_POLICY_VERSION,
      promptPolicySha256: sha256(promptPolicyBytes),
      qaPolicySha256: sha256(qaPolicyBytes),
      inventorySha256: sha256(inventoryContent),
    },
    assets,
    batches: {},
    receiptLedger: { byToolCallId: {}, byOutputSha256: {} },
    reviewLedger: [],
    pairReviewHistory: [],
    rcaHistory: [],
  };

  await atomicWrite(path.join(runDir, "inventory.jsonl"), inventoryContent);
  await initializeSqliteState(state);
    console.log(JSON.stringify(summary(state), null, 2));
  } finally {
    await releaseStateLock(initLock);
  }
}

async function nextBatch() {
  const requestedLimit = positiveInt(valueOf("--limit")) ?? CODEX_NATIVE_WEBTOON_CONCURRENCY;
  const passageId = valueOf("--passage-id");
  const concept = valueOf("--concept") as CodexNativeWebtoonConceptId | null;
  const leaseMs = positiveInt(valueOf("--lease-ms")) ?? DEFAULT_LEASE_MS;
  const response = await withLockedState(async (state) => {
    if (requestedLimit > state.config.concurrency) {
      throw new Error(`Limit ${requestedLimit} exceeds native concurrency ${state.config.concurrency}`);
    }
    expireLeasesInState(state, Date.now());
    const active = Object.values(state.assets).filter((asset) => asset.status === "GEN_QUEUED").length;
    const capacity = Math.max(0, state.config.concurrency - active);
    const limit = Math.min(requestedLimit, capacity);
    const candidates = Object.values(state.assets).filter((asset) => {
      if (!(["PENDING", "RETRY_QUEUED"] as AssetStatus[]).includes(asset.status)) return false;
      if (passageId && asset.passageId !== passageId) return false;
      if (concept && asset.concept !== concept) return false;
      return true;
    });
    const claimed = candidates.slice(0, limit);
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const batchId = claimed.length > 0 ? `batch-${randomUUID()}` : null;
    const items = await Promise.all(claimed.map(async (asset) => {
      const passage = passageById.get(asset.passageId);
      if (!passage) throw new Error(`Passage disappeared: ${asset.passageId}`);
      const currentHash = sha256(`${passage.id}\n${passage.text}`);
      if (currentHash !== asset.sourceHash) throw new Error(`Frozen source drift: ${asset.passageId}`);
      asset.status = "GEN_QUEUED";
      asset.attempt += 1;
      asset.queuedAt = now;
      asset.qa = {};
      asset.nativeReceipt = undefined;
      const latestFailedAttempt = asset.failureHistory.at(-1)?.attempt;
      const correction = latestFailedAttempt
        ? asset.failureHistory
            .filter((failure) => failure.attempt === latestFailedAttempt)
            .map((failure) => `[${failure.kind}/${failure.failureCodes.join(",")}] ${failure.correctionDirective}`)
            .filter(Boolean)
            .join("\n")
        : undefined;
      const basePrompt = buildCodexNativeWebtoonPrompt({
        passage,
        concept: asset.concept,
        correction,
        styleReferenceNote:
          "Match the appropriate user-provided macho or cute reference only at the level of mood and production quality; preserve original characters and composition.",
      });
      const prompt = [
        "CURRENT USER LAYOUT OVERRIDE — HIGHEST PRIORITY:",
        "Compose the complete tall page as a strict TWO-COLUMN grid of compact rectangular panels.",
        "Do not create any page-wide horizontal strip panel or long cinematic panel spanning both columns.",
        "Keep both columns present from the top story row through the bottom story row; use balanced paired panels with clear gutters.",
        "A title or final takeaway must also stay inside one column cell, never span the full page width.",
        "",
        basePrompt,
      ].join("\n");
      const promptHash = sha256(prompt);
      const requiredEnglishPhrases = extractCodexNativeCorePhrases(
        passage.text,
        asset.concept,
      );
      const claimToken = randomUUID();
      asset.lease = {
        batchId: batchId!,
        claimToken,
        attempt: asset.attempt,
        promptHash,
        claimedAt: now,
        expiresAt: new Date(nowMs + leaseMs).toISOString(),
      };
      asset.prompts ??= [];
      const promptSnapshot = path.join(
        runDir,
        "prompts",
        asset.passageId,
        asset.concept,
        `attempt-${String(asset.attempt).padStart(2, "0")}.txt`,
      );
      await atomicWrite(promptSnapshot, prompt);
      asset.prompts.push({
        attempt: asset.attempt,
        promptRevision: asset.promptRevision,
        promptPath: workspaceRelative(promptSnapshot),
        promptHash,
        requiredEnglishPhrases,
        createdAt: now,
      });
      return {
        assetId: asset.assetId,
        passageId: asset.passageId,
        concept: asset.concept,
        language: asset.language,
        attempt: asset.attempt,
        promptRevision: asset.promptRevision,
        promptHash,
        batchId,
        claimToken,
        leaseExpiresAt: asset.lease.expiresAt,
        prompt,
      };
    }));
    if (batchId) {
      state.batches[batchId] = { batchId, claimedAt: now, assetIds: claimed.map((asset) => asset.assetId), status: "ACTIVE" };
    }
    return { runId: state.runId, batchId, activeBeforeClaim: active, capacityBeforeClaim: capacity, count: items.length, items };
  });
  console.log(JSON.stringify(response, null, 2));
}

async function stageGenerated() {
  const assetId = requiredValue("--asset-id");
  const image = path.resolve(REPO_ROOT, requiredValue("--image"));
  const attempt = requiredPositiveInt("--attempt");
  const batchId = requiredValue("--batch-id");
  const claimToken = requiredValue("--claim-token");
  const sessionId = requiredValue("--session-id");
  const toolCallId = requiredValue("--tool-call-id");
  const generatorAgentId = requiredValue("--generator-agent-id");
  await assertNativeOutputPath(image, sessionId, toolCallId);
  const sourceBytes = await readFile(image);
  assertImageBytes(sourceBytes, image);
  const metadata = await sharp(sourceBytes, { failOn: "error" }).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Image dimensions unavailable: ${image}`);
  const aspectRatio = metadata.height / metadata.width;
  if (metadata.width < 768 || metadata.height < 1300 || aspectRatio < 1.65 || aspectRatio > 2.35) {
    throw new Error(
      `Native page must be a high-resolution tall webtoon (min 768x1300, height/width 1.65-2.35): ${metadata.width}x${metadata.height}`,
    );
  }
  const ext = imageExtension(sourceBytes);
  const sourceSha = sha256(sourceBytes);

  const response = await withLockedState(async (state) => {
    const asset = requiredAsset(state, assetId);
    const lease = asset.lease;
    if (asset.status !== "GEN_QUEUED" || !lease) {
      throw new Error(`Cannot stage ${assetId} from status ${asset.status}`);
    }
    if (lease.attempt !== attempt || lease.batchId !== batchId || lease.claimToken !== claimToken) {
      throw new Error(`Lease mismatch for ${assetId}`);
    }
    if (Date.parse(lease.expiresAt) <= Date.now()) throw new Error(`Lease expired for ${assetId}`);
    const duplicateToolCall = state.receiptLedger.byToolCallId[toolCallId];
    const duplicateOutputAssetId = state.receiptLedger.byOutputSha256[sourceSha];
    if (duplicateToolCall || duplicateOutputAssetId) {
      throw new Error(`Native output receipt already used by ${duplicateToolCall?.assetId ?? duplicateOutputAssetId}`);
    }
    const destination = path.join(
      runDir,
      "staging",
      asset.passageId,
      asset.concept,
      `attempt-${String(asset.attempt).padStart(2, "0")}.${ext}`,
    );
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(image, destination);
    const copiedBytes = await readFile(destination);
    const copiedSha = sha256(copiedBytes);
    if (sourceSha !== copiedSha) throw new Error(`Byte hash changed while staging ${assetId}`);
    asset.nativeReceipt = {
      sessionId,
      toolCallId,
      generatorAgentId,
      batchId,
      claimToken,
      attempt,
      promptHash: lease.promptHash,
      outputPath: image,
      outputSha256: sourceSha,
      stagedAt: new Date().toISOString(),
    };
    state.receiptLedger.byToolCallId[toolCallId] = { assetId, receipt: asset.nativeReceipt };
    state.receiptLedger.byOutputSha256[sourceSha] = assetId;
    asset.nativeSourcePath = image;
    asset.nativeSourceSha256 = sourceSha;
    asset.imagePath = workspaceRelative(destination);
    asset.imageSha256 = copiedSha;
    asset.imageWidth = metadata.width;
    asset.imageHeight = metadata.height;
    asset.imageAspectRatio = aspectRatio;
    asset.status = "QA_PENDING";
    asset.lease = undefined;
    settleBatchIfDone(state, batchId);
    return {
      assetId,
      status: asset.status,
      imagePath: asset.imagePath,
      sha256: copiedSha,
      width: metadata.width,
      height: metadata.height,
      aspectRatio: asset.imageAspectRatio,
      nativeReceipt: { sessionId, toolCallId, batchId, attempt },
    };
  });
  console.log(JSON.stringify(response));
}

async function recordGenerationFailure() {
  const assetId = requiredValue("--asset-id");
  const attempt = requiredPositiveInt("--attempt");
  const batchId = requiredValue("--batch-id");
  const claimToken = requiredValue("--claim-token");
  const failureCode = requiredValue("--failure-code");
  const correctionDirective = requiredValue("--correction");
  const response = await withLockedState(async (state) => {
    const asset = requiredAsset(state, assetId);
    const lease = asset.lease;
    if (asset.status !== "GEN_QUEUED" || !lease) throw new Error(`No active generation lease for ${assetId}`);
    if (lease.attempt !== attempt || lease.batchId !== batchId || lease.claimToken !== claimToken) {
      throw new Error(`Lease mismatch for ${assetId}`);
    }
    asset.failureHistory.push({
      attempt,
      kind: "NARRATIVE_ART",
      failureCodes: [failureCode],
      correctionDirective,
    });
    asset.promptRevision += 1;
    asset.lease = undefined;
    asset.status = failureStatus(asset, state.config.maxAttempts);
    settleBatchIfDone(state, batchId);
    return { assetId, attempt, status: asset.status, failureCode };
  });
  console.log(JSON.stringify(response));
}

async function recoverExpiredLeases() {
  const response = await withLockedState(async (state) => {
    const before = Object.values(state.assets).filter((asset) => asset.status === "GEN_QUEUED").length;
    const recovered = expireLeasesInState(state, Date.now());
    const after = Object.values(state.assets).filter((asset) => asset.status === "GEN_QUEUED").length;
    return { recovered, activeBefore: before, activeAfter: after };
  });
  console.log(JSON.stringify(response, null, 2));
}

async function recordRca() {
  const assetId = requiredValue("--asset-id");
  const artifactPath = path.resolve(REPO_ROOT, requiredValue("--review"));
  const rawText = await readFile(artifactPath, "utf8");
  const payload = JSON.parse(rawText) as {
    runId: string;
    assetId: string;
    attempt: number;
    sourceHash: string;
    promptHash: string;
    imageSha256: string | null;
    failureHistoryHash: string;
    reviewerAgentId: string;
    evidence: string[];
    rootCause: string;
    correctionDirective: string;
  };
  const terminalOverride = argv.includes("--terminal-override");
  const response = await withLockedState(async (state) => {
    const asset = requiredAsset(state, assetId);
    const validStatus = asset.status === "RCA_REQUIRED" || (asset.status === "BLOCKED_RCA" && terminalOverride);
    if (!validStatus) throw new Error(`${assetId} requires RCA_REQUIRED or explicit --terminal-override from BLOCKED_RCA`);
    const prompt = asset.prompts?.find((item) => item.attempt === asset.attempt);
    if (!prompt) throw new Error(`Missing prompt snapshot for RCA: ${assetId}`);
    if (sha256(await readPromptText(prompt)) !== prompt.promptHash) throw new Error(`Prompt snapshot changed before RCA: ${assetId}`);
    const failureHistoryHash = sha256(JSON.stringify(asset.failureHistory));
    const forbiddenReviewers = new Set([
      ...Object.values(state.receiptLedger.byToolCallId)
        .filter((entry) => entry.assetId === assetId)
        .map((entry) => entry.receipt.generatorAgentId),
      ...state.reviewLedger
        .filter((entry) => entry.assetId === assetId)
        .map((entry) => entry.review.reviewerAgentId),
      ...state.pairReviewHistory
        .filter((entry) => entry.passageId === asset.passageId)
        .map((entry) => entry.record.reviewerAgentId),
      ...state.rcaHistory
        .filter((entry) => entry.assetId === assetId)
        .map((entry) => entry.reviewerAgentId),
    ]);
    if (
      payload.runId !== state.runId ||
      payload.assetId !== assetId ||
      payload.attempt !== asset.attempt ||
      payload.sourceHash !== asset.sourceHash ||
      payload.promptHash !== prompt.promptHash ||
      payload.imageSha256 !== (asset.imageSha256 ?? null) ||
      payload.failureHistoryHash !== failureHistoryHash ||
      !payload.reviewerAgentId?.trim() ||
      forbiddenReviewers.has(payload.reviewerAgentId) ||
      !payload.rootCause?.trim() ||
      !payload.correctionDirective?.trim() ||
      !Array.isArray(payload.evidence) ||
      payload.evidence.length === 0 ||
      payload.evidence.some((item) => typeof item !== "string" || !item.trim())
    ) {
      throw new Error(`Invalid RCA payload for ${assetId}`);
    }
    const destination = path.join(
      runDir,
      "reviews",
      asset.passageId,
      asset.concept,
      `attempt-${String(asset.attempt).padStart(2, "0")}-rca.json`,
    );
    await mkdir(path.dirname(destination), { recursive: true });
    await atomicWrite(destination, rawText);
    const artifactSha256 = sha256(rawText);
    state.rcaHistory.push({
      assetId,
      attempt: asset.attempt,
      reviewerAgentId: payload.reviewerAgentId,
      artifactPath: workspaceRelative(destination),
      artifactSha256,
      sourceHash: asset.sourceHash,
      promptHash: prompt.promptHash,
      imageSha256: asset.imageSha256 ?? "",
      failureHistoryHash,
      terminalOverride,
      reviewedAt: new Date().toISOString(),
    });
    asset.failureHistory.push({
      attempt: asset.attempt,
      kind: "NARRATIVE_ART",
      failureCodes: ["RCA_REDESIGNED"],
      correctionDirective: payload.correctionDirective.trim(),
    });
    asset.promptRevision += 1;
    asset.status = "RETRY_QUEUED";
    return { assetId, status: asset.status, artifactPath: workspaceRelative(destination), artifactSha256, terminalOverride };
  });
  console.log(JSON.stringify(response));
}

async function recordQa() {
  const reviewPath = path.resolve(REPO_ROOT, requiredValue("--review"));
  const rawText = await readFile(reviewPath, "utf8");
  const raw = JSON.parse(rawText) as { assetId?: unknown; kind?: unknown };
  if (typeof raw.assetId !== "string") throw new Error("Review assetId is required");
  if (raw.kind !== "TEXT_PROOF" && raw.kind !== "NARRATIVE_ART") throw new Error("Review kind is invalid");
  const assetId = raw.assetId;
  const kind: ReviewKind = raw.kind;
  const response = await withLockedState(async (state) => {
    const asset = requiredAsset(state, assetId);
    if (!(["QA_PENDING", "QA_RUNNING"] as AssetStatus[]).includes(asset.status)) {
      throw new Error(`Cannot review ${asset.assetId} from status ${asset.status}`);
    }
    if (asset.qa[kind]) throw new Error(`${kind} review already recorded for ${asset.assetId} attempt ${asset.attempt}`);
    if (!asset.nativeReceipt || !asset.imagePath || !asset.imageSha256) throw new Error(`Missing staged native receipt for ${asset.assetId}`);
    const stagedBytes = await readFile(resolveStoredPath(asset.imagePath));
    const actualImageSha = sha256(stagedBytes);
    if (actualImageSha !== asset.imageSha256 || actualImageSha !== asset.nativeReceipt.outputSha256) {
      throw new Error(`Staged pixels changed before QA: ${asset.assetId}`);
    }
    await sharp(stagedBytes, { failOn: "error" }).metadata();
    const prompt = asset.prompts?.find((item) => item.attempt === asset.attempt);
    if (!prompt || prompt.promptHash !== asset.nativeReceipt.promptHash || sha256(await readPromptText(prompt)) !== prompt.promptHash) {
      throw new Error(`Prompt snapshot mismatch for ${asset.assetId}`);
    }
    const otherReviewerAgentIds = [
      ...state.reviewLedger
        .filter((entry) => entry.assetId === asset.assetId)
        .map((entry) => entry.review.reviewerAgentId),
      ...Object.values(asset.qa)
        .map((review) => review?.reviewerAgentId)
        .filter((value): value is string => Boolean(value)),
    ];
    const validation = validateCodexNativeAssetReview(raw, {
      runId: state.runId,
      assetId: asset.assetId,
      kind,
      attempt: asset.attempt,
      sourceHash: asset.sourceHash,
      promptHash: prompt.promptHash,
      imageSha256: actualImageSha,
      generatorAgentId: asset.nativeReceipt.generatorAgentId,
      otherReviewerAgentIds,
      ...(kind === "TEXT_PROOF" ? { requiredEnglishPhrases: prompt.requiredEnglishPhrases } : {}),
    });
    if (!validation.ok) throw new Error(`Invalid QA payload:\n${formatCodexNativeQaIssues(validation.issues)}`);
    const payload: CodexNativeAssetReview = validation.value;
    const artifact = path.join(
      runDir,
      "reviews",
      asset.passageId,
      asset.concept,
      `attempt-${String(asset.attempt).padStart(2, "0")}-${payload.kind.toLowerCase()}.json`,
    );
    await mkdir(path.dirname(artifact), { recursive: true });
    await atomicWrite(artifact, rawText);
    const artifactSha = sha256(rawText);
    const result: QaResult = {
      kind: payload.kind,
      pass: payload.pass,
      certain: payload.certain,
      reviewedAt: new Date().toISOString(),
      reviewerAgentId: payload.reviewerAgentId,
      hardGates: { ...payload.hardGates },
      metrics: { ...payload.metrics },
      failureCodes: payload.failureCodes,
      correctionDirective: payload.correctionDirective,
      evidence: payload.evidence,
      artifactPath: workspaceRelative(artifact),
      artifactSha256: artifactSha,
      attempt: asset.attempt,
      imageSha256: actualImageSha,
      promptHash: prompt.promptHash,
      sourceHash: asset.sourceHash,
      ...(payload.kind === "TEXT_PROOF"
        ? { requiredPhraseEvidence: payload.requiredPhraseEvidence.map((entry) => ({ ...entry })) }
        : {}),
    };
    asset.qa[payload.kind] = result;
    state.reviewLedger.push({ assetId: asset.assetId, attempt: asset.attempt, review: result });

    if (!payload.pass) {
      asset.failureHistory.push({
        attempt: asset.attempt,
        kind: payload.kind,
        failureCodes: result.failureCodes,
        correctionDirective: result.correctionDirective,
      });
      asset.promptRevision += 1;
    }
    const bothReviewsPresent = Boolean(asset.qa.TEXT_PROOF && asset.qa.NARRATIVE_ART);
    if (!bothReviewsPresent) {
      asset.status = "QA_RUNNING";
    } else if (!asset.qa.TEXT_PROOF!.pass || !asset.qa.NARRATIVE_ART!.pass) {
      asset.status = failureStatus(asset, state.config.maxAttempts);
    } else if (asset.qa.TEXT_PROOF!.pass && asset.qa.NARRATIVE_ART!.pass) {
      asset.status = "PAIR_QA_PENDING";
    }
    return { assetId: asset.assetId, kind: payload.kind, pass: payload.pass, status: asset.status, artifactSha256: artifactSha };
  });
  console.log(JSON.stringify(response));
}

async function approvePair() {
  const passageId = requiredValue("--passage-id");
  const reviewPath = path.resolve(REPO_ROOT, requiredValue("--review"));
  const rawText = await readFile(reviewPath, "utf8");
  const raw = JSON.parse(rawText);
  const response = await withLockedState(async (state) => {
    const pair = CODEX_NATIVE_WEBTOON_CONCEPTS.map((concept) =>
      requiredAsset(state, `${passageId}__${concept.id}`),
    ) as [AssetState, AssetState];
    if (!pair.every((asset) => asset.status === "PAIR_QA_PENDING")) {
      throw new Error(`Both concepts must be PAIR_QA_PENDING for ${passageId}`);
    }
    const expectedAssetList = await Promise.all(pair.map(async (asset) => {
      if (!asset.imagePath || !asset.imageSha256 || !asset.nativeReceipt) {
        throw new Error(`Missing staged provenance for ${asset.assetId}`);
      }
      const bytes = await readFile(resolveStoredPath(asset.imagePath));
      await sharp(bytes, { failOn: "error" }).metadata();
      const actualHash = sha256(bytes);
      if (actualHash !== asset.imageSha256 || actualHash !== asset.nativeReceipt.outputSha256) {
        throw new Error(`Staged pixels changed before pair QA: ${asset.assetId}`);
      }
      return {
        assetId: asset.assetId,
        concept: asset.concept,
        attempt: asset.attempt,
        imageSha256: actualHash,
        generatorAgentId: asset.nativeReceipt.generatorAgentId,
        individualReviewerAgentIds: [asset.qa.TEXT_PROOF?.reviewerAgentId, asset.qa.NARRATIVE_ART?.reviewerAgentId]
          .filter((value): value is string => Boolean(value)),
        individualReviewsPassed: asset.qa.TEXT_PROOF?.pass === true && asset.qa.NARRATIVE_ART?.pass === true,
      };
    }));
    const expectedAssets: [CodexNativePairReviewAssetExpectation, CodexNativePairReviewAssetExpectation] = [
      expectedAssetList[0],
      expectedAssetList[1],
    ];
    const validation = validateCodexNativePairReview(raw, {
      runId: state.runId,
      passageId,
      assets: expectedAssets,
      priorPairReviewerAgentIds: state.pairReviewHistory
        .filter((entry) => entry.passageId === passageId)
        .map((entry) => entry.record.reviewerAgentId),
    });
    if (!validation.ok) throw new Error(`Invalid pair QA payload:\n${formatCodexNativeQaIssues(validation.issues)}`);
    const pairReview: CodexNativePairReview = validation.value;
    const artifactName = `pair-a${pair[0].attempt}-a${pair[1].attempt}-${pair[0].imageSha256!.slice(0, 8)}-${pair[1].imageSha256!.slice(0, 8)}.json`;
    const artifact = path.join(runDir, "reviews", passageId, artifactName);
    await mkdir(path.dirname(artifact), { recursive: true });
    await atomicWrite(artifact, rawText);
    const artifactSha256 = sha256(rawText);
    const pairRecord: PairQaRecord = {
      pass: pairReview.pass,
      artifactPath: workspaceRelative(artifact),
      artifactSha256,
      reviewerAgentId: pairReview.reviewerAgentId,
      attempts: Object.fromEntries(pair.map((asset) => [asset.concept, asset.attempt])) as Record<CodexNativeWebtoonConceptId, number>,
      imageSha256: Object.fromEntries(pair.map((asset) => [asset.concept, asset.imageSha256!])) as Record<CodexNativeWebtoonConceptId, string>,
      reviewedAt: new Date().toISOString(),
    };
    state.pairReviewHistory.push({ passageId, record: pairRecord });
    for (const asset of pair) asset.pairQa = pairRecord;

    if (pairReview.pass) {
      const prepared: Array<{ asset: AssetState; destination: string; finalSha: string }> = [];
      for (const asset of pair) {
        const source = resolveStoredPath(asset.imagePath!);
        const bytes = await readFile(source);
        const actualSha = sha256(bytes);
        if (actualSha !== asset.nativeReceipt!.outputSha256) throw new Error(`Approval TOCTOU detected: ${asset.assetId}`);
        const destination = path.join(runDir, "final", asset.passageId, `${asset.concept}${path.extname(source)}`);
        await mkdir(path.dirname(destination), { recursive: true });
        await copyFile(source, destination);
        const finalBytes = await readFile(destination);
        await sharp(finalBytes, { failOn: "error" }).metadata();
        const finalSha = sha256(finalBytes);
        if (finalSha !== actualSha) throw new Error(`Final copy changed bytes: ${asset.assetId}`);
        prepared.push({ asset, destination, finalSha });
      }
      for (const item of prepared) {
        item.asset.finalPath = workspaceRelative(item.destination);
        item.asset.finalSha256 = item.finalSha;
        item.asset.status = "APPROVED";
        item.asset.approvedAt = new Date().toISOString();
      }
    } else {
      const failures = new Set(pairReview.failureConcepts);
      for (const asset of pair) {
        if (!failures.has(asset.concept)) continue;
        asset.failureHistory.push({
          attempt: asset.attempt,
          kind: "NARRATIVE_ART",
          failureCodes: ["PAIR_QA_FAILED"],
          correctionDirective: pairReview.correctionDirective,
        });
        asset.promptRevision += 1;
        asset.status = failureStatus(asset, state.config.maxAttempts);
      }
    }
    return { passageId, pass: pairReview.pass, artifactSha256, statuses: pair.map((asset) => [asset.assetId, asset.status]) };
  });
  console.log(JSON.stringify(response));
}

async function printStatus() {
  const state = await loadState();
  console.log(JSON.stringify({ ...summary(state), sourceDrift: await sourceDrift(state) }, null, 2));
}

async function verify() {
  const state = await loadState();
  await assertSourceFrozen(state);
  const failures: string[] = [];
  if (Object.keys(state.assets).length !== state.config.expectedAssetCount) {
    failures.push(`asset count ${Object.keys(state.assets).length} != ${state.config.expectedAssetCount}`);
  }
  const inventory = await readFile(path.join(runDir, "inventory.jsonl"), "utf8");
  const inventoryCount = inventory.split(/\r?\n/).filter(Boolean).length;
  if (inventoryCount !== state.config.passageCount) {
    failures.push(`inventory count ${inventoryCount} != ${state.config.passageCount}`);
  }
  const usedToolCalls = new Set<string>();
  for (const passage of passages) {
    const pair = CODEX_NATIVE_WEBTOON_CONCEPTS.map((concept) =>
      state.assets[`${passage.id}__${concept.id}`],
    );
    if (pair.some((asset) => !asset)) failures.push(`${passage.id}: missing concept asset`);
    for (const asset of pair.filter(Boolean)) {
      if (asset.status !== "APPROVED") failures.push(`${asset.assetId}: ${asset.status}`);
      if (asset.status !== "APPROVED") continue;
      failures.push(...await verifyApprovedAsset(state, asset, usedToolCalls));
    }
    if (pair.every((asset): asset is AssetState => Boolean(asset) && asset.status === "APPROVED")) {
      failures.push(...await verifyApprovedPair(state, passage.id, pair));
    }
  }
  const report = { ...summary(state), pass: failures.length === 0, failures: failures.slice(0, 100), failureCount: failures.length };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}

async function verifyApprovedAsset(state: HarnessState, asset: AssetState, usedToolCalls: Set<string>): Promise<string[]> {
  const failures: string[] = [];
  if (!asset.nativeReceipt || !asset.nativeSourcePath || !asset.imagePath || !asset.finalPath) {
    return [`${asset.assetId}: missing native/staged/final provenance`];
  }
  const receipt = asset.nativeReceipt;
  if (usedToolCalls.has(receipt.toolCallId)) failures.push(`${asset.assetId}: duplicate native tool call ${receipt.toolCallId}`);
  usedToolCalls.add(receipt.toolCallId);
  const ledger = state.receiptLedger.byToolCallId[receipt.toolCallId];
  if (!ledger || ledger.assetId !== asset.assetId || ledger.receipt.outputSha256 !== receipt.outputSha256) {
    failures.push(`${asset.assetId}: native receipt missing or mismatched in append-only ledger`);
  }
  if (state.receiptLedger.byOutputSha256[receipt.outputSha256] !== asset.assetId) {
    failures.push(`${asset.assetId}: native output hash ledger mismatch`);
  }
  try {
    await assertNativeOutputPath(asset.nativeSourcePath, receipt.sessionId, receipt.toolCallId);
  } catch (error) {
    failures.push(`${asset.assetId}: invalid native path provenance: ${error instanceof Error ? error.message : String(error)}`);
  }
  const prompt = asset.prompts?.find((item) => item.attempt === receipt.attempt);
  if (!prompt || sha256(await readPromptText(prompt)) !== prompt.promptHash || prompt.promptHash !== receipt.promptHash) {
    failures.push(`${asset.assetId}: prompt snapshot/hash mismatch`);
  }
  if (!asset.qa.TEXT_PROOF?.pass || !asset.qa.NARRATIVE_ART?.pass || !asset.pairQa) {
    failures.push(`${asset.assetId}: missing independent QA or pair QA`);
  }
  if (prompt && asset.qa.TEXT_PROOF && asset.qa.NARRATIVE_ART) {
    const textReviewer = asset.qa.TEXT_PROOF.reviewerAgentId;
    const narrativeReviewer = asset.qa.NARRATIVE_ART.reviewerAgentId;
    if (textReviewer === narrativeReviewer || textReviewer === receipt.generatorAgentId || narrativeReviewer === receipt.generatorAgentId) {
      failures.push(`${asset.assetId}: reviewer independence violated`);
    }
    const reviewHistory = state.reviewLedger.filter((entry) => entry.assetId === asset.assetId);
    const reviewerIds = reviewHistory.map((entry) => entry.review.reviewerAgentId);
    if (new Set(reviewerIds).size !== reviewerIds.length) failures.push(`${asset.assetId}: reviewer reused across attempts`);
    for (const kind of ["TEXT_PROOF", "NARRATIVE_ART"] as const) {
      const stored = asset.qa[kind]!;
      try {
        const rawText = await readFile(resolveStoredPath(stored.artifactPath), "utf8");
        if (!stored.artifactSha256 || sha256(rawText) !== stored.artifactSha256) {
          failures.push(`${asset.assetId}/${kind}: QA artifact hash mismatch`);
          continue;
        }
        const input = JSON.parse(rawText);
        const common = {
          runId: state.runId,
          assetId: asset.assetId,
          attempt: asset.attempt,
          sourceHash: asset.sourceHash,
          promptHash: prompt.promptHash,
          imageSha256: receipt.outputSha256,
          generatorAgentId: receipt.generatorAgentId,
          otherReviewerAgentIds: [kind === "TEXT_PROOF" ? narrativeReviewer : textReviewer],
        };
        const validation = kind === "TEXT_PROOF"
          ? validateCodexNativeAssetReview(input, { ...common, kind, requiredEnglishPhrases: prompt.requiredEnglishPhrases })
          : validateCodexNativeAssetReview(input, { ...common, kind });
        if (!validation.ok) failures.push(`${asset.assetId}/${kind}: ${formatCodexNativeQaIssues(validation.issues)}`);
        if (!reviewHistory.some((entry) => entry.attempt === asset.attempt && entry.review.artifactSha256 === stored.artifactSha256)) {
          failures.push(`${asset.assetId}/${kind}: QA artifact absent from append-only review ledger`);
        }
      } catch (error) {
        failures.push(`${asset.assetId}/${kind}: missing or invalid QA artifact: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  try {
    const [nativeBytes, stagedBytes, finalBytes] = await Promise.all([
      readFile(asset.nativeSourcePath),
      readFile(resolveStoredPath(asset.imagePath)),
      readFile(resolveStoredPath(asset.finalPath)),
    ]);
    const metadata = await Promise.all([
      sharp(nativeBytes, { failOn: "error" }).metadata(),
      sharp(stagedBytes, { failOn: "error" }).metadata(),
      sharp(finalBytes, { failOn: "error" }).metadata(),
    ]);
    const hashes = [sha256(nativeBytes), sha256(stagedBytes), sha256(finalBytes)];
    const expected = receipt.outputSha256;
    if (hashes.some((hash) => hash !== expected) || asset.nativeSourceSha256 !== expected || asset.imageSha256 !== expected || asset.finalSha256 !== expected) {
      failures.push(`${asset.assetId}: actual native/staged/final hash mismatch`);
    }
    if (metadata.some((item) => !item.width || !item.height || item.width < 768 || item.height < 1300 || item.height / item.width < 1.65 || item.height / item.width > 2.35)) {
      failures.push(`${asset.assetId}: invalid final webtoon dimensions/aspect`);
    }
  } catch (error) {
    failures.push(`${asset.assetId}: missing or corrupt artifact: ${error instanceof Error ? error.message : String(error)}`);
  }
  return failures;
}

async function verifyApprovedPair(state: HarnessState, passageId: string, pair: [AssetState, AssetState]): Promise<string[]> {
  const failures: string[] = [];
  const record = pair[0].pairQa;
  if (!record || !record.pass || pair[1].pairQa?.artifactSha256 !== record.artifactSha256) {
    return [`${passageId}: pair QA missing, failed, or inconsistent across concepts`];
  }
  for (const asset of pair) {
    if (record.attempts[asset.concept] !== asset.attempt || record.imageSha256[asset.concept] !== asset.imageSha256) {
      failures.push(`${passageId}: stale pair QA binding for ${asset.concept}`);
    }
  }
  try {
    const rawText = await readFile(resolveStoredPath(record.artifactPath), "utf8");
    if (sha256(rawText) !== record.artifactSha256) return [`${passageId}: pair QA artifact hash mismatch`];
    const expectedAssetList = pair.map((asset) => ({
      assetId: asset.assetId,
      concept: asset.concept,
      attempt: asset.attempt,
      imageSha256: asset.imageSha256!,
      generatorAgentId: asset.nativeReceipt!.generatorAgentId,
      individualReviewerAgentIds: [asset.qa.TEXT_PROOF!.reviewerAgentId, asset.qa.NARRATIVE_ART!.reviewerAgentId],
      individualReviewsPassed: asset.qa.TEXT_PROOF!.pass && asset.qa.NARRATIVE_ART!.pass,
    }));
    const validation = validateCodexNativePairReview(JSON.parse(rawText), {
      runId: state.runId,
      passageId,
      assets: [expectedAssetList[0], expectedAssetList[1]],
      priorPairReviewerAgentIds: state.pairReviewHistory
        .filter((entry) => entry.passageId === passageId && entry.record.artifactSha256 !== record.artifactSha256)
        .map((entry) => entry.record.reviewerAgentId),
    });
    if (!validation.ok) failures.push(`${passageId}: ${formatCodexNativeQaIssues(validation.issues)}`);
    if (!state.pairReviewHistory.some((entry) => entry.passageId === passageId && entry.record.artifactSha256 === record.artifactSha256)) {
      failures.push(`${passageId}: pair QA absent from append-only history`);
    }
  } catch (error) {
    failures.push(`${passageId}: missing or invalid pair QA artifact: ${error instanceof Error ? error.message : String(error)}`);
  }
  return failures;
}

function summary(state: HarnessState) {
  const statuses: Record<string, number> = {};
  const concepts: Record<string, number> = {};
  for (const asset of Object.values(state.assets)) {
    statuses[asset.status] = (statuses[asset.status] ?? 0) + 1;
    if (asset.status === "APPROVED") concepts[asset.concept] = (concepts[asset.concept] ?? 0) + 1;
  }
  const activeLeases = Object.values(state.assets).filter((asset) => asset.status === "GEN_QUEUED").length;
  const approvedCount = statuses.APPROVED ?? 0;
  const approvedPassages = passages.filter((passage) =>
    CODEX_NATIVE_WEBTOON_CONCEPTS.every(
      (concept) => state.assets[`${passage.id}__${concept.id}`]?.status === "APPROVED",
    ),
  ).length;
  return {
    runId: state.runId,
    runDir,
    sourceSha256: state.sourceSha256,
    passageCount: state.config.passageCount,
    expectedAssetCount: state.config.expectedAssetCount,
    concurrency: state.config.concurrency,
    generator: state.config.generator,
    postAddedTextAllowed: state.config.postAddedTextAllowed,
    revision: state.revision,
    activeLeases,
    availableGenerationSlots: Math.max(0, state.config.concurrency - activeLeases),
    statuses,
    approvedByConcept: concepts,
    approvedCount,
    approvedPassages,
    progressPercent: Number(((approvedCount / state.config.expectedAssetCount) * 100).toFixed(4)),
  };
}

async function loadState(): Promise<HarnessState> {
  if (await pathExists(stateDbPath)) return ensureStateDefaults(await loadStateFromSqlite());
  const raw = JSON.parse(await readFile(statePath, "utf8")) as HarnessState | (Omit<HarnessState, "schemaVersion" | "revision" | "batches"> & { schemaVersion: 1 });
  if (raw.schemaVersion === 1) {
    const migrated = raw as unknown as HarnessState;
    migrated.schemaVersion = 2;
    migrated.revision = 0;
    migrated.batches = {};
    return ensureStateDefaults(migrated);
  }
  if (raw.schemaVersion !== 2) throw new Error(`Unsupported state schema: ${(raw as { schemaVersion?: unknown }).schemaVersion}`);
  return ensureStateDefaults(raw);
}

async function ensureStateDefaults(state: HarnessState): Promise<HarnessState> {
  const hadReceiptLedger = Boolean(state.receiptLedger);
  const hadReviewLedger = Boolean(state.reviewLedger);
  const hadPairHistory = Boolean(state.pairReviewHistory);
  state.receiptLedger ??= { byToolCallId: {}, byOutputSha256: {} };
  state.reviewLedger ??= [];
  state.pairReviewHistory ??= [];
  state.rcaHistory ??= [];
  for (const asset of Object.values(state.assets)) {
    asset.prompts ??= [];
    const passage = passageById.get(asset.passageId);
    for (const prompt of asset.prompts) {
      prompt.requiredEnglishPhrases ??= passage
        ? extractCodexNativeCorePhrases(passage.text, asset.concept)
        : [];
    }
    if (!hadReceiptLedger && asset.nativeReceipt) {
      state.receiptLedger.byToolCallId[asset.nativeReceipt.toolCallId] = { assetId: asset.assetId, receipt: asset.nativeReceipt };
      state.receiptLedger.byOutputSha256[asset.nativeReceipt.outputSha256] = asset.assetId;
    }
    if (!hadReviewLedger) {
      for (const review of Object.values(asset.qa).filter(Boolean) as QaResult[]) {
        state.reviewLedger.push({ assetId: asset.assetId, attempt: review.attempt ?? asset.attempt, review });
      }
    }
    if (!hadPairHistory && asset.pairQa && !state.pairReviewHistory.some((entry) => entry.record.artifactSha256 === asset.pairQa!.artifactSha256)) {
      state.pairReviewHistory.push({ passageId: asset.passageId, record: asset.pairQa });
    }
  }
  const [promptPolicyBytes, qaPolicyBytes] = await Promise.all([
    readFile(path.join(REPO_ROOT, PROMPT_POLICY_FILE)),
    readFile(path.join(REPO_ROOT, QA_POLICY_FILE)),
  ]);
  state.config.promptPolicyVersion ??= CODEX_NATIVE_WEBTOON_PROMPT_POLICY_VERSION;
  state.config.promptPolicySha256 ??= sha256(promptPolicyBytes);
  state.config.qaPolicySha256 ??= sha256(qaPolicyBytes);
  if (!state.config.inventorySha256) {
    state.config.inventorySha256 = sha256(await readFile(path.join(runDir, "inventory.jsonl")));
  }
  return state;
}

async function saveState(state: HarnessState) {
  state.updatedAt = new Date().toISOString();
  await atomicWrite(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

async function withLockedState<T>(mutate: (state: HarnessState) => Promise<T> | T): Promise<T> {
  await mkdir(runDir, { recursive: true });
  const lock = await acquireStateLock();
  try {
    const sqlite = await pathExists(stateDbPath);
    const state = await loadState();
    const snapshot = sqlite ? captureSqliteSnapshot(state) : null;
    await assertSourceFrozen(state);
    const result = await mutate(state);
    state.revision += 1;
    if (snapshot) await persistStateToSqlite(state, snapshot);
    else await saveState(state);
    return result;
  } finally {
    await releaseStateLock(lock);
  }
}

interface SqliteStateSnapshot {
  assetFingerprints: Map<string, string>;
  batchFingerprints: Map<string, string>;
  receiptToolCallIds: Set<string>;
  reviewCount: number;
  pairReviewCount: number;
  rcaCount: number;
}

async function openStateDatabase() {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(stateDbPath);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=30000; PRAGMA foreign_keys=ON;");
  return db;
}

async function initializeSqliteState(state: HarnessState) {
  const db = await openStateDatabase();
  try {
    db.exec(`
      CREATE TABLE run_state (id INTEGER PRIMARY KEY CHECK (id = 1), header_json TEXT NOT NULL);
      CREATE TABLE assets (asset_id TEXT PRIMARY KEY, passage_id TEXT NOT NULL, concept TEXT NOT NULL, status TEXT NOT NULL, state_json TEXT NOT NULL);
      CREATE INDEX assets_status_idx ON assets(status, passage_id, concept);
      CREATE TABLE batches (batch_id TEXT PRIMARY KEY, state_json TEXT NOT NULL);
      CREATE TABLE receipts (tool_call_id TEXT PRIMARY KEY, output_sha256 TEXT NOT NULL UNIQUE, asset_id TEXT NOT NULL, state_json TEXT NOT NULL);
      CREATE TABLE reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, asset_id TEXT NOT NULL, attempt INTEGER NOT NULL, kind TEXT NOT NULL, artifact_sha256 TEXT, state_json TEXT NOT NULL, UNIQUE(asset_id, attempt, kind));
      CREATE INDEX reviews_asset_idx ON reviews(asset_id, attempt);
      CREATE TABLE pair_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, passage_id TEXT NOT NULL, artifact_sha256 TEXT NOT NULL UNIQUE, state_json TEXT NOT NULL);
      CREATE INDEX pair_reviews_passage_idx ON pair_reviews(passage_id);
      CREATE TABLE rcas (id INTEGER PRIMARY KEY AUTOINCREMENT, asset_id TEXT NOT NULL, attempt INTEGER NOT NULL, artifact_sha256 TEXT NOT NULL UNIQUE, state_json TEXT NOT NULL);
    `);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("INSERT INTO run_state(id, header_json) VALUES(1, ?)").run(stateHeaderJson(state));
      const insertAsset = db.prepare("INSERT INTO assets(asset_id, passage_id, concept, status, state_json) VALUES(?, ?, ?, ?, ?)");
      for (const asset of Object.values(state.assets)) {
        insertAsset.run(asset.assetId, asset.passageId, asset.concept, asset.status, JSON.stringify(asset));
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.close();
  }
}

async function loadStateFromSqlite(): Promise<HarnessState> {
  const db = await openStateDatabase();
  try {
    const headerRow = db.prepare("SELECT header_json FROM run_state WHERE id = 1").get() as { header_json?: unknown } | undefined;
    if (!headerRow || typeof headerRow.header_json !== "string") throw new Error(`SQLite run header missing: ${stateDbPath}`);
    const header = JSON.parse(headerRow.header_json) as Omit<HarnessState, "assets" | "batches" | "receiptLedger" | "reviewLedger" | "pairReviewHistory" | "rcaHistory">;
    const assets = Object.fromEntries(
      (db.prepare("SELECT asset_id, state_json FROM assets").all() as unknown as Array<{ asset_id: string; state_json: string }>)
        .map((row) => [row.asset_id, JSON.parse(row.state_json) as AssetState]),
    );
    const batches = Object.fromEntries(
      (db.prepare("SELECT batch_id, state_json FROM batches").all() as unknown as Array<{ batch_id: string; state_json: string }>)
        .map((row) => [row.batch_id, JSON.parse(row.state_json) as HarnessState["batches"][string]]),
    );
    const receiptLedger: HarnessState["receiptLedger"] = { byToolCallId: {}, byOutputSha256: {} };
    for (const row of db.prepare("SELECT tool_call_id, output_sha256, asset_id, state_json FROM receipts").all() as unknown as Array<{ tool_call_id: string; output_sha256: string; asset_id: string; state_json: string }>) {
      const entry = JSON.parse(row.state_json) as { assetId: string; receipt: NativeReceipt };
      receiptLedger.byToolCallId[row.tool_call_id] = entry;
      receiptLedger.byOutputSha256[row.output_sha256] = row.asset_id;
    }
    const reviewLedger = (db.prepare("SELECT state_json FROM reviews ORDER BY id").all() as unknown as Array<{ state_json: string }>)
      .map((row) => JSON.parse(row.state_json) as HarnessState["reviewLedger"][number]);
    const pairReviewHistory = (db.prepare("SELECT state_json FROM pair_reviews ORDER BY id").all() as unknown as Array<{ state_json: string }>)
      .map((row) => JSON.parse(row.state_json) as HarnessState["pairReviewHistory"][number]);
    const rcaHistory = (db.prepare("SELECT state_json FROM rcas ORDER BY id").all() as unknown as Array<{ state_json: string }>)
      .map((row) => JSON.parse(row.state_json) as RcaRecord);
    return { ...header, assets, batches, receiptLedger, reviewLedger, pairReviewHistory, rcaHistory };
  } finally {
    db.close();
  }
}

function captureSqliteSnapshot(state: HarnessState): SqliteStateSnapshot {
  return {
    assetFingerprints: new Map(Object.values(state.assets).map((asset) => [asset.assetId, assetFingerprint(asset)])),
    batchFingerprints: new Map(Object.values(state.batches).map((batch) => [batch.batchId, batchFingerprint(batch)])),
    receiptToolCallIds: new Set(Object.keys(state.receiptLedger.byToolCallId)),
    reviewCount: state.reviewLedger.length,
    pairReviewCount: state.pairReviewHistory.length,
    rcaCount: state.rcaHistory.length,
  };
}

async function persistStateToSqlite(state: HarnessState, snapshot: SqliteStateSnapshot) {
  const db = await openStateDatabase();
  try {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("UPDATE run_state SET header_json = ? WHERE id = 1").run(stateHeaderJson(state));
      const upsertAsset = db.prepare("INSERT INTO assets(asset_id, passage_id, concept, status, state_json) VALUES(?, ?, ?, ?, ?) ON CONFLICT(asset_id) DO UPDATE SET passage_id=excluded.passage_id, concept=excluded.concept, status=excluded.status, state_json=excluded.state_json");
      for (const asset of Object.values(state.assets)) {
        if (snapshot.assetFingerprints.get(asset.assetId) === assetFingerprint(asset)) continue;
        upsertAsset.run(asset.assetId, asset.passageId, asset.concept, asset.status, JSON.stringify(asset));
      }
      const upsertBatch = db.prepare("INSERT INTO batches(batch_id, state_json) VALUES(?, ?) ON CONFLICT(batch_id) DO UPDATE SET state_json=excluded.state_json");
      for (const batch of Object.values(state.batches)) {
        if (snapshot.batchFingerprints.get(batch.batchId) === batchFingerprint(batch)) continue;
        upsertBatch.run(batch.batchId, JSON.stringify(batch));
      }
      const insertReceipt = db.prepare("INSERT INTO receipts(tool_call_id, output_sha256, asset_id, state_json) VALUES(?, ?, ?, ?)");
      for (const [toolCallId, entry] of Object.entries(state.receiptLedger.byToolCallId)) {
        if (snapshot.receiptToolCallIds.has(toolCallId)) continue;
        insertReceipt.run(toolCallId, entry.receipt.outputSha256, entry.assetId, JSON.stringify(entry));
      }
      const insertReview = db.prepare("INSERT INTO reviews(asset_id, attempt, kind, artifact_sha256, state_json) VALUES(?, ?, ?, ?, ?)");
      for (const entry of state.reviewLedger.slice(snapshot.reviewCount)) {
        insertReview.run(entry.assetId, entry.attempt, entry.review.kind, entry.review.artifactSha256 ?? null, JSON.stringify(entry));
      }
      const insertPair = db.prepare("INSERT INTO pair_reviews(passage_id, artifact_sha256, state_json) VALUES(?, ?, ?)");
      for (const entry of state.pairReviewHistory.slice(snapshot.pairReviewCount)) {
        insertPair.run(entry.passageId, entry.record.artifactSha256, JSON.stringify(entry));
      }
      const insertRca = db.prepare("INSERT INTO rcas(asset_id, attempt, artifact_sha256, state_json) VALUES(?, ?, ?, ?)");
      for (const entry of state.rcaHistory.slice(snapshot.rcaCount)) {
        insertRca.run(entry.assetId, entry.attempt, entry.artifactSha256, JSON.stringify(entry));
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.close();
  }
}

function stateHeaderJson(state: HarnessState): string {
  const header = { ...state } as Partial<HarnessState>;
  delete header.assets;
  delete header.batches;
  delete header.receiptLedger;
  delete header.reviewLedger;
  delete header.pairReviewHistory;
  delete header.rcaHistory;
  return JSON.stringify(header);
}

function assetFingerprint(asset: AssetState): string {
  return [
    asset.status,
    asset.attempt,
    asset.promptRevision,
    asset.queuedAt ?? "",
    asset.lease?.claimToken ?? "",
    asset.prompts?.length ?? 0,
    asset.prompts?.at(-1)?.promptHash ?? "",
    asset.nativeReceipt?.toolCallId ?? "",
    asset.imageSha256 ?? "",
    asset.qa.TEXT_PROOF?.artifactSha256 ?? "",
    asset.qa.NARRATIVE_ART?.artifactSha256 ?? "",
    asset.failureHistory.length,
    asset.pairQa?.artifactSha256 ?? "",
    asset.finalSha256 ?? "",
  ].join("|");
}

function batchFingerprint(batch: HarnessState["batches"][string]): string {
  return `${batch.status}|${batch.assetIds.join(",")}`;
}

async function acquireStateLock() {
  const startedAt = Date.now();
  for (;;) {
    try {
      const handle = await open(lockPath, "wx");
      const token = randomUUID();
      await handle.writeFile(JSON.stringify({ pid: process.pid, token, acquiredAt: new Date().toISOString() }));
      await handle.sync();
      return { handle, token };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const [info, raw] = await Promise.all([
        stat(lockPath).catch(() => null),
        readFile(lockPath, "utf8").catch(() => ""),
      ]);
      const owner = parseLockOwner(raw);
      const invalidAndOld = Boolean(info && !owner && Date.now() - info.mtimeMs > 30_000);
      if ((owner && !isProcessAlive(owner.pid)) || invalidAndOld) {
        const quarantine = `${lockPath}.stale-${randomUUID()}`;
        try {
          await rename(lockPath, quarantine);
          await unlink(quarantine).catch(() => undefined);
        } catch (renameError) {
          if ((renameError as NodeJS.ErrnoException).code !== "ENOENT") throw renameError;
        }
        continue;
      }
      if (Date.now() - startedAt > 30_000) throw new Error(`Timed out waiting for state lock: ${lockPath}`);
      await delay(50);
    }
  }
}

async function releaseStateLock(lock: Awaited<ReturnType<typeof acquireStateLock>>) {
  const owner = parseLockOwner(await readFile(lockPath, "utf8").catch(() => ""));
  if (!owner || owner.token !== lock.token || owner.pid !== process.pid) {
    await lock.handle.close();
    throw new Error(`State lock ownership changed before release: ${lockPath}`);
  }
  await lock.handle.close();
  await unlink(lockPath);
}

function parseLockOwner(raw: string): { pid: number; token: string } | null {
  try {
    const parsed = JSON.parse(raw) as { pid?: unknown; token?: unknown };
    return Number.isInteger(parsed.pid) && typeof parsed.token === "string" && parsed.token
      ? { pid: parsed.pid as number, token: parsed.token }
      : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

async function assertSourceFrozen(state: HarnessState) {
  const sourcePath = resolveStoredPath(state.sourceFile);
  const [sourceBytes, promptPolicyBytes, qaPolicyBytes, inventoryBytes] = await Promise.all([
    readFile(sourcePath),
    readFile(path.join(REPO_ROOT, PROMPT_POLICY_FILE)),
    readFile(path.join(REPO_ROOT, QA_POLICY_FILE)),
    readFile(path.join(runDir, "inventory.jsonl")),
  ]);
  const actual = sha256(sourceBytes);
  if (actual !== state.sourceSha256) throw new Error(`SOURCE_DRIFT: ${sourcePath}`);
  if (passages.length !== state.config.passageCount) throw new Error("SOURCE_DRIFT: passage count changed");
  if (
    state.config.promptPolicyVersion !== CODEX_NATIVE_WEBTOON_PROMPT_POLICY_VERSION ||
    sha256(promptPolicyBytes) !== state.config.promptPolicySha256 ||
    sha256(qaPolicyBytes) !== state.config.qaPolicySha256
  ) {
    throw new Error("POLICY_DRIFT: prompt or QA policy changed after run initialization");
  }
  if (sha256(inventoryBytes) !== state.config.inventorySha256) {
    throw new Error("INVENTORY_DRIFT: frozen inventory changed");
  }
}

async function sourceDrift(state: HarnessState): Promise<boolean> {
  try {
    await assertSourceFrozen(state);
    return false;
  } catch {
    return true;
  }
}

async function atomicWrite(filePath: string, content: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, content, "utf8");
  const handle = await open(temporary, "r+");
  await handle.sync();
  await handle.close();
  await rename(temporary, filePath);
}

function expireLeasesInState(state: HarnessState, nowMs: number): string[] {
  const recovered: string[] = [];
  for (const asset of Object.values(state.assets)) {
    if (asset.status !== "GEN_QUEUED") continue;
    if (asset.lease && Date.parse(asset.lease.expiresAt) > nowMs) continue;
    const batchId = asset.lease?.batchId;
    asset.failureHistory.push({
      attempt: asset.attempt,
      kind: "NARRATIVE_ART",
      failureCodes: [asset.lease ? "LEASE_EXPIRED" : "LEASE_MISSING"],
      correctionDirective:
        "The native generation did not produce a valid staged receipt before its lease ended. Retry the same complete page through native Codex image generation only.",
    });
    asset.promptRevision += 1;
    asset.lease = undefined;
    asset.status = failureStatus(asset, state.config.maxAttempts);
    if (batchId) settleBatchIfDone(state, batchId);
    recovered.push(asset.assetId);
  }
  return recovered;
}

function settleBatchIfDone(state: HarnessState, batchId: string) {
  const batch = state.batches[batchId];
  if (!batch) return;
  const active = batch.assetIds.some((assetId) => {
    const asset = state.assets[assetId];
    return asset?.status === "GEN_QUEUED" && asset.lease?.batchId === batchId;
  });
  if (!active) batch.status = "SETTLED";
}

function failureStatus(asset: AssetState, maxAttempts: number): AssetStatus {
  if (asset.attempt >= maxAttempts) return "BLOCKED_RCA";
  if (asset.attempt >= 6) return "RCA_REQUIRED";
  return "RETRY_QUEUED";
}

async function assertNativeOutputPath(imagePath: string, sessionId: string, toolCallId: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(sessionId) || !/^exec-[a-zA-Z0-9-]+$/.test(toolCallId)) {
    throw new Error("Invalid native session/tool-call identity");
  }
  const nativeRoot = path.resolve("C:\\Users\\jooye\\.codex\\generated_images", sessionId);
  const [canonicalRoot, canonicalImage] = await Promise.all([realpath(nativeRoot), realpath(imagePath)]);
  const relative = path.relative(canonicalRoot, canonicalImage);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Native output must be under ${nativeRoot}`);
  }
  if (path.parse(canonicalImage).name !== toolCallId) {
    throw new Error(`Native tool-call ID does not match output filename: ${imagePath}`);
  }
  const runRelative = path.relative(runDir, imagePath);
  if (runRelative && !runRelative.startsWith("..") && !path.isAbsolute(runRelative)) {
    throw new Error("Staging/final files cannot be reused as native outputs");
  }
}

function workspaceRelative(filePath: string): string {
  return path.relative(REPO_ROOT, filePath).replaceAll("\\", "/");
}

function resolveStoredPath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

async function pathExists(filePath: string): Promise<boolean> {
  return Boolean(await stat(filePath).catch(() => null));
}

async function firstExistingPath(filePaths: string[]): Promise<string | null> {
  for (const filePath of filePaths) {
    if (await pathExists(filePath)) return filePath;
  }
  return null;
}

async function readPromptText(prompt: PromptRecord): Promise<string> {
  if (prompt.promptPath) return readFile(resolveStoredPath(prompt.promptPath), "utf8");
  if (typeof prompt.prompt === "string") return prompt.prompt;
  throw new Error(`Prompt snapshot is missing for attempt ${prompt.attempt}`);
}

function requiredPositiveInt(name: string): number {
  const parsed = positiveInt(requiredValue(name));
  if (!parsed) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requiredAsset(state: HarnessState, assetId: string): AssetState {
  const asset = state.assets[assetId];
  if (!asset) throw new Error(`Unknown asset: ${assetId}`);
  return asset;
}

function valueOf(name: string): string | null {
  const prefix = `${name}=`;
  return argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function requiredValue(name: string): string {
  const value = valueOf(name)?.trim();
  if (!value) throw new Error(`Missing ${name}=...`);
  return value;
}

function positiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertImageBytes(bytes: Buffer, filePath: string) {
  if (bytes.length < 12) throw new Error(`Image is too small: ${filePath}`);
  imageExtension(bytes);
}

function imageExtension(bytes: Buffer): "png" | "jpg" | "webp" {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  throw new Error("Only unmodified PNG, JPEG, and WebP native outputs are accepted");
}
