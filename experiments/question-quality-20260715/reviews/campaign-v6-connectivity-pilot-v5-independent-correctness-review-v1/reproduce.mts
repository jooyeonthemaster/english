import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import * as strictJsonModule from "../../execution/campaign-v6-connectivity-pilot-v5/strict-json-observer.ts";
import * as liveIoModule from "../../execution/campaign-v6-connectivity-pilot-v5/live-io.ts";
import * as buildRuntimeModule from "../../execution/campaign-v6-connectivity-pilot-v5/build-frozen-runtime.mts";
import * as priceModule from "../../execution/campaign-v6-connectivity-pilot-v5/price-snapshot-core.ts";
import * as responseParserModule from "../../execution/campaign-v6-connectivity-pilot-v5/response-parser.ts";
import * as authorGateModule from "../../execution/campaign-v6-connectivity-pilot-v5/author-freeze-gate.ts";

function moduleExports<T extends object>(module: T): T {
  return ((module as T & { default?: T }).default ?? module) as T;
}

const { observeRawCandidateCardinalityV5 } = moduleExports(strictJsonModule);
const { withExclusiveRepoJsonTransactionV5 } = moduleExports(liveIoModule);
const { buildFrozenRuntimeV5 } = moduleExports(buildRuntimeModule);
const { priceEvidenceForModelV5 } = moduleExports(priceModule);
const { extractConnectivityBillingEvidenceV5, parseConnectivityResponseV5 } = moduleExports(responseParserModule);
const { assertAuthorFreezePermanentlyNoDispatchV5 } = moduleExports(authorGateModule);

const reviewRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(reviewRoot, "../../../..");
const subjectRelative = "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5";
const subjectRoot = path.join(repoRoot, subjectRelative);
const manifestPath = path.join(subjectRoot, "MANIFEST.sha256");

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function readJson(filePath: string): any {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function assertReviewLocalScratch(scratch: string): void {
  const absolute = path.resolve(scratch);
  const relative = path.relative(reviewRoot, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !path.basename(absolute).startsWith("_scratch-")) {
    throw new Error(`unsafe scratch path: ${absolute}`);
  }
}

function parseSubjectManifest(): Array<{ expectedSha256: string; relativePath: string }> {
  return readFileSync(manifestPath, "utf8").trim().split(/\r?\n/u).map((line) => {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
    if (!match) throw new Error(`invalid subject manifest line: ${line}`);
    return { expectedSha256: match[1]!, relativePath: match[2]!.replaceAll("\\", "/") };
  });
}

function publicSubjectSnapshot(entries: ReturnType<typeof parseSubjectManifest>) {
  const rows = entries.filter((entry) => !entry.relativePath.includes("/private/"))
    .map((entry) => {
      const absolute = path.join(repoRoot, entry.relativePath);
      const actualSha256 = sha256(readFileSync(absolute));
      return { ...entry, actualSha256, matchesManifest: actualSha256 === entry.expectedSha256 };
    });
  return {
    publicManifestEntryCount: rows.length,
    skippedPrivateEntryCount: entries.length - rows.length,
    allPublicEntriesMatch: rows.every((row) => row.matchesManifest),
    snapshotSha256: sha256(JSON.stringify(rows.map(({ relativePath, actualSha256 }) => ({ relativePath, actualSha256 })))),
  };
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function containsText(node: ts.Node, sourceFile: ts.SourceFile, text: string): boolean {
  return node.getText(sourceFile).includes(text);
}

function analyzeTerminalIntentControlFlow() {
  const sourcePath = path.join(subjectRoot, "production-runner.ts");
  const source = readFileSync(sourcePath, "utf8");
  const sf = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let intentTry: ts.TryStatement | undefined;
  let settlementTry: ts.TryStatement | undefined;
  function visit(node: ts.Node): void {
    if (ts.isTryStatement(node)) {
      if (containsText(node.tryBlock, sf, 'run.writeMarker("terminal-reconciliation-intent.private.json"')) intentTry = node;
      if (containsText(node.tryBlock, sf, "settleGlobal(settlement)") &&
          containsText(node.tryBlock, sf, "quarantineGlobalCandidateCapacity(settlement)")) settlementTry = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  if (!intentTry || !settlementTry || !ts.isBlock(intentTry.parent) || intentTry.parent !== settlementTry.parent) {
    throw new Error("failed to locate the intent and settlement tries in one block");
  }
  const block = intentTry.parent;
  const intentIndex = block.statements.indexOf(intentTry);
  const settlementIndex = block.statements.indexOf(settlementTry);
  const between = block.statements.slice(intentIndex + 1, settlementIndex);
  const terminatingKinds = new Set([
    ts.SyntaxKind.ReturnStatement,
    ts.SyntaxKind.ThrowStatement,
    ts.SyntaxKind.BreakStatement,
    ts.SyntaxKind.ContinueStatement,
  ]);
  const hasUnconditionalTerminator = between.some((statement) => terminatingKinds.has(statement.kind));
  const hasReconciliationErrorGate = between.some((statement) =>
    ts.isIfStatement(statement) && statement.expression.getText(sf).includes("reconciliationError"));
  const catchText = intentTry.catchClause?.block.getText(sf) ?? "";
  return {
    intentTryLine: lineOf(sf, intentTry),
    intentWriteLine: source.slice(0, source.indexOf('run.writeMarker("terminal-reconciliation-intent.private.json"')).split(/\r?\n/u).length,
    catchAssignsReconciliationError: /reconciliationError\s*=\s*error/u.test(catchText),
    settlementTryLine: lineOf(sf, settlementTry),
    settlementCallLines: {
      quarantine: source.slice(0, source.indexOf("quarantineGlobalCandidateCapacity(settlement)", source.indexOf('run.writeMarker("terminal-reconciliation-intent.private.json"'))).split(/\r?\n/u).length,
      ordinary: source.slice(0, source.indexOf("settleGlobal(settlement)", source.indexOf('run.writeMarker("terminal-reconciliation-intent.private.json"'))).split(/\r?\n/u).length,
    },
    interveningTopLevelStatements: between.map((statement) => statement.getText(sf)),
    hasUnconditionalTerminator,
    hasReconciliationErrorGate,
    settlementReachableAfterCaughtIntentFailure: settlementIndex > intentIndex &&
      /reconciliationError\s*=\s*error/u.test(catchText) && !hasUnconditionalTerminator && !hasReconciliationErrorGate,
  };
}

async function main(): Promise<void> {
  const manifestEntries = parseSubjectManifest();
  const targetStart = publicSubjectSnapshot(manifestEntries);

  const arrayWrapperRaw = JSON.stringify([{ questions: [{ id: 1 }, { id: 2 }] }]);
  const stringWrapperRaw = JSON.stringify(JSON.stringify({ questions: [{ id: 1 }, { id: 2 }] }));
  const c1Array = observeRawCandidateCardinalityV5(arrayWrapperRaw);
  const c1String = observeRawCandidateCardinalityV5(stringWrapperRaw);
  const c1 = {
    cases: [
      { name: "valid_root_array_containing_two_questions", rawText: arrayWrapperRaw, observation: c1Array },
      { name: "valid_root_string_wrapping_two_questions", rawText: stringWrapperRaw, observation: c1String },
    ],
    reproduced: [c1Array, c1String].every((row) => row.candidateUnitsEffective === 1 && row.cardinalityAmbiguous === false),
  };

  const scratch = path.join(reviewRoot, `_scratch-transaction-${process.pid}`);
  assertReviewLocalScratch(scratch);
  mkdirSync(scratch, { recursive: false });
  const target = path.join(scratch, "ledger.json");
  const lockSuffix = "independent-file-identity-counterexample";
  const replacement = { identity: "replacement-path-node", amount: 999 };
  const intended = { identity: "transaction-created-node", amount: 1 };
  writeFileSync(target, `${JSON.stringify({ identity: "original", amount: 0 }, null, 2)}\n`, "utf8");
  const targetRelative = path.relative(repoRoot, target).replaceAll("\\", "/");
  const predictableTemp = `${target}.${lockSuffix}.${process.pid}.tmp`;
  let beforeSwapIdentity: { dev: string; ino: string } | null = null;
  let afterSwapIdentity: { dev: string; ino: string } | null = null;
  let c2Outcome: unknown = null;
  let committedBytes = "";
  try {
    c2Outcome = withExclusiveRepoJsonTransactionV5({
      relativePath: targetRelative,
      lockSuffix,
      mutate() {
        return { next: intended, value: { mutateReturned: "intended" } };
      },
      raceHooksForOfflineTestOnly: {
        beforeCommitReattestation() {
          const before = lstatSync(predictableTemp, { bigint: true });
          beforeSwapIdentity = { dev: before.dev.toString(), ino: before.ino.toString() };
          const displaced = `${predictableTemp}.displaced`;
          renameSync(predictableTemp, displaced);
          writeFileSync(predictableTemp, `${JSON.stringify(replacement, null, 2)}\n`, "utf8");
          const after = lstatSync(predictableTemp, { bigint: true });
          afterSwapIdentity = { dev: after.dev.toString(), ino: after.ino.toString() };
          unlinkSync(displaced);
        },
      },
    });
    committedBytes = readFileSync(target, "utf8");
  } finally {
    assertReviewLocalScratch(scratch);
    rmSync(scratch, { recursive: true, force: true });
  }
  const committedJson = JSON.parse(committedBytes);
  const c2 = {
    tempPathIdentityBeforeSwap: beforeSwapIdentity,
    tempPathIdentityAfterSwap: afterSwapIdentity,
    identityChanged: JSON.stringify(beforeSwapIdentity) !== JSON.stringify(afterSwapIdentity),
    transactionOutcome: c2Outcome,
    intendedValue: intended,
    bytesActuallyCommitted: committedJson,
    reproduced: (c2Outcome as any)?.committed === true &&
      JSON.stringify(committedJson) === JSON.stringify(replacement) &&
      JSON.stringify(committedJson) !== JSON.stringify(intended) &&
      JSON.stringify(beforeSwapIdentity) !== JSON.stringify(afterSwapIdentity),
  };

  const require = createRequire(import.meta.url);
  const esbuildJs = require.resolve("esbuild");
  const nativeCandidates = [
    path.join(repoRoot, "node_modules/@esbuild/win32-x64/esbuild.exe"),
    path.join(repoRoot, "node_modules/esbuild/bin/esbuild"),
  ];
  const esbuildNative = nativeCandidates.find((candidate) => existsSync(candidate));
  if (!esbuildNative) throw new Error("cannot locate installed esbuild native executable");
  const esbuildRows = [esbuildJs, esbuildNative].map((absolutePath) => {
    const relativePath = path.relative(repoRoot, absolutePath).replaceAll("\\", "/");
    return {
      relativePath,
      sha256: sha256(readFileSync(absolutePath)),
      presentInSubjectManifest: manifestEntries.some((entry) => entry.relativePath === relativePath),
    };
  });
  const frozenArtifact = readJson(path.join(subjectRoot, "frozen-runtime-v5.json"));
  const frozenArtifactText = JSON.stringify(frozenArtifact);
  const compilerClosureText = readFileSync(path.join(subjectRoot, "compiler-closure-v5.json"), "utf8");
  const liveClosureText = readFileSync(path.join(subjectRoot, "live-closure-v5.json"), "utf8");
  const independentMappingArtifactPaths = manifestEntries.map((entry) => entry.relativePath).filter((entryPath) =>
    /(?:source[-_]?map|metafile|source.*bundle.*equivalence|bundle.*source.*equivalence|build[-_]?provenance)/iu.test(entryPath));
  const currentBuild = await buildFrozenRuntimeV5();
  const bundleComparisons = frozenArtifact.bundles.map((row: any) => {
    const built = currentBuild.bundleBytesByRole.get(row.role);
    const stored = readFileSync(path.join(repoRoot, row.path));
    return {
      role: row.role,
      builtSha256: built ? sha256(built) : null,
      storedSha256: sha256(stored),
      byteEqual: built ? Buffer.compare(built, stored) === 0 : false,
    };
  });
  const verifySource = readFileSync(path.join(subjectRoot, "verify.mts"), "utf8");
  const buildSource = readFileSync(path.join(subjectRoot, "build-frozen-runtime.mts"), "utf8");
  const c3 = {
    declaredBundler: frozenArtifact.bundler,
    implementationFiles: esbuildRows,
    implementationHashesPresentInFrozenArtifact: esbuildRows.map((row) => frozenArtifactText.includes(row.sha256)),
    sourceMapDisabled: /sourcemap:\s*false/u.test(buildSource),
    metafileNotPersistedInFrozenArtifact: !Object.hasOwn(frozenArtifact, "metafile") && !frozenArtifactText.includes('"inputs"'),
    compilerClosureMentionsEsbuildImplementation: /node_modules[\\/](@esbuild|esbuild)[\\/]/iu.test(compilerClosureText),
    liveClosureMentionsEsbuildImplementation: /node_modules[\\/](@esbuild|esbuild)[\\/]/iu.test(liveClosureText),
    independentMappingArtifactPaths,
    ambientRebuildUsesSameBuildFunction: verifySource.includes("buildFrozenRuntimeV5()"),
    ambientRebuildMatchesStoredBundles: bundleComparisons.every((row: any) => row.byteEqual),
    bundleComparisons,
    independentSourceBundleEquivalenceArtifactFound: independentMappingArtifactPaths.length > 0,
    reproduced: esbuildRows.every((row) => !row.presentInSubjectManifest) &&
      esbuildRows.every((row, index) => !frozenArtifactText.includes(esbuildRows[index]!.sha256)) &&
      !Object.hasOwn(frozenArtifact, "metafile") && independentMappingArtifactPaths.length === 0 &&
      !/node_modules[\\/](@esbuild|esbuild)[\\/]/iu.test(compilerClosureText) &&
      !/node_modules[\\/](@esbuild|esbuild)[\\/]/iu.test(liveClosureText) &&
      bundleComparisons.every((row: any) => row.byteEqual),
  };

  const c4 = analyzeTerminalIntentControlFlow();

  const protocol = readJson(path.join(subjectRoot, "protocol-v5.json"));
  const assignments = protocol.durableBounds.assignments;
  const runnerSource = readFileSync(path.join(subjectRoot, "production-runner.ts"), "utf8");
  const modelRouteReasoning = {
    serialOrder: protocol.durableBounds.serialOrder,
    assignments: assignments.map((row: any) => ({ ordinal: row.ordinal, plan: row.plan, modelId: row.modelId })),
    endpoint: protocol.providerContract.endpoint,
    order: protocol.providerContract.order,
    only: protocol.providerContract.only,
    allowFallbacks: protocol.providerContract.allowFallbacks,
    requireParameters: protocol.providerContract.requireParameters,
    reasoning: protocol.providerContract.reasoning,
    runnerIteratesAssignmentArray: /for \(let index = 0; index < loaded\.protocol\.durableBounds\.assignments\.length;/u.test(runnerSource),
    runnerStopsAfterFailure: /if \(!success\) break;/u.test(runnerSource),
  };

  const endpoint = (tag: string, provider: string, prompt: number, completion: number, request: number,
    cacheRead: number, cacheWrite: number, reasoning: number, overrides: any[] = []) => ({
      provider,
      endpointName: provider,
      tag,
      status: "active",
      contextLength: 1_000_000,
      promptUsdPerToken: prompt,
      completionUsdPerToken: completion,
      fixedRequestUsd: request,
      extraChargeUsdPerUnit: {
        image: 0,
        web_search: 0,
        input_cache_read: cacheRead,
        input_cache_write: cacheWrite,
        internal_reasoning: reasoning,
      },
      supportedParameters: ["response_format", "structured_outputs"],
      overrides,
    });
  const override = {
    minPromptTokens: 1,
    promptUsdPerToken: 0.000011,
    completionUsdPerToken: 0.000021,
    fixedRequestUsd: 0.4,
    extraChargeUsdPerUnit: {
      image: 0,
      web_search: 0,
      input_cache_read: 0.000031,
      input_cache_write: 0.000041,
      internal_reasoning: 0.000051,
    },
  };
  const syntheticSnapshot: any = {
    models: [{
      requestedModelId: "synthetic/model",
      canonicalSlug: "synthetic/model-v1",
      topLevelPromptUsdPerToken: 0.000001,
      topLevelCompletionUsdPerToken: 0.000002,
      topLevelFixedRequestUsd: 0.1,
      topLevelExtraChargeUsdPerUnit: {
        input_cache_read: 0.000003,
        input_cache_write: 0.000004,
        internal_reasoning: 0.000005,
      },
      endpointRates: [
        endpoint("google-vertex/global", "Google Vertex", 0.000002, 0.000003, 0.2, 0.000006, 0.000007, 0.000008),
        endpoint("other/active", "Other Active", 0.000010, 0.000020, 0.3, 0.000030, 0.000040, 0.000050, [override]),
      ],
    }],
  };
  const priceActual = priceEvidenceForModelV5(syntheticSnapshot, "synthetic/model");
  const priceExpected = {
    exactPromptUsdPer1M: 2,
    exactCompletionUsdPer1M: 3,
    exactRequestUsd: 0.2,
    emergencyPromptUsdPer1M: 83,
    emergencyCompletionUsdPer1M: 72,
    emergencyRequestUsd: 0.4,
    emergencyCacheReadUsdPer1M: 31,
    emergencyCacheWriteUsdPer1M: 41,
    emergencyInternalReasoningUsdPer1M: 51,
  };
  const priceMaxima = {
    expected: priceExpected,
    actual: priceActual,
    pass: Object.entries(priceExpected).every(([key, value]) => Math.abs((priceActual as any)[key] - value) < 1e-9),
  };

  const responseSchema: any = {
    type: "object",
    properties: {
      questions: {
        type: "array",
        minItems: 1,
        maxItems: 1,
        items: {
          type: "object",
          properties: { id: { type: "integer", minimum: 1, maximum: 1 } },
          required: ["id"],
          additionalProperties: false,
        },
      },
    },
    required: ["questions"],
    additionalProperties: false,
  };
  const makeResponse = (totalTokens: number) => JSON.stringify({
    id: "req-independent-1",
    model: "synthetic/model",
    provider: "Google Vertex",
    object: "chat.completion",
    created: 1,
    choices: [{
      index: 0,
      finish_reason: "stop",
      message: { role: "assistant", content: JSON.stringify({ questions: [{ id: 1 }] }) },
    }],
    usage: {
      prompt_tokens: 11,
      completion_tokens: 7,
      total_tokens: totalTokens,
      cost: 0.125,
      is_byok: false,
      prompt_tokens_details: { cached_tokens: 0 },
      completion_tokens_details: { reasoning_tokens: 0 },
    },
  });
  const validRaw = makeResponse(18);
  const extracted = extractConnectivityBillingEvidenceV5(validRaw);
  const parsed = parseConnectivityResponseV5({
    rawText: validRaw,
    requestedModel: "synthetic/model",
    allowedServedModels: ["synthetic/model"],
    expectedProvider: "Google Vertex",
    allowedFinishReasons: ["stop"],
    responseSchema,
  });
  const invalidRaw = makeResponse(19);
  const invalidExtracted = extractConnectivityBillingEvidenceV5(invalidRaw);
  let inconsistentParserRejected = false;
  try {
    parseConnectivityResponseV5({
      rawText: invalidRaw,
      requestedModel: "synthetic/model",
      allowedServedModels: ["synthetic/model"],
      expectedProvider: "Google Vertex",
      allowedFinishReasons: ["stop"],
      responseSchema,
    });
  } catch {
    inconsistentParserRejected = true;
  }
  const billingEquality = {
    extracted: {
      actualCostUsd: extracted.actualCostUsd,
      promptTokens: extracted.promptTokens,
      completionTokens: extracted.completionTokens,
      totalTokens: extracted.totalTokens,
      reasoningTokens: extracted.reasoningTokens,
      cachedTokens: extracted.cachedTokens,
    },
    parsed: {
      actualCostUsd: parsed.actualCostUsd,
      promptTokens: parsed.promptTokens,
      completionTokens: parsed.completionTokens,
      totalTokens: parsed.totalTokens,
      reasoningTokens: parsed.reasoningTokens,
      cachedTokens: parsed.cachedTokens,
    },
    exactEquality: extracted.actualCostUsd === parsed.actualCostUsd &&
      extracted.promptTokens === parsed.promptTokens &&
      extracted.completionTokens === parsed.completionTokens &&
      extracted.totalTokens === parsed.totalTokens &&
      extracted.reasoningTokens === parsed.reasoningTokens &&
      extracted.cachedTokens === parsed.cachedTokens,
    inconsistentTotalEvidenceUnknown: invalidExtracted.usageActualKnown === false,
    inconsistentTotalParserRejected: inconsistentParserRejected,
  };

  let authorGateThrew = false;
  let authorGateMessage = "";
  try {
    assertAuthorFreezePermanentlyNoDispatchV5();
  } catch (error) {
    authorGateThrew = true;
    authorGateMessage = error instanceof Error ? error.message : String(error);
  }
  const operatorSource = readFileSync(path.join(subjectRoot, "operator-wrapper.mts"), "utf8");
  const liveChildSource = readFileSync(path.join(subjectRoot, "live-child.mts"), "utf8");
  const permanentNoDispatch = {
    authorization: protocol.authorization,
    gateThrew: authorGateThrew,
    gateMessage: authorGateMessage,
    productionRunnerCallsGateBeforeExactWire: runnerSource.indexOf("assertAuthorFreezePermanentlyNoDispatchV5();") <
      runnerSource.indexOf("const loaded = exactWire();"),
    operatorCallsGate: operatorSource.includes("assertAuthorFreezePermanentlyNoDispatchV5();"),
    liveChildCallsGate: liveChildSource.includes("assertAuthorFreezePermanentlyNoDispatchV5();"),
  };

  const targetEnd = publicSubjectSnapshot(manifestEntries);
  const evidence = {
    schemaVersion: "campaign-v6-connectivity-pilot-v5-independent-correctness-evidence-v1",
    verdict: "FAIL_BLOCKERS",
    blockerCodes: [
      "C1_VALID_WRAPPER_CARDINALITY_UNDERCOUNT",
      "C2_CLOSED_TEMP_PATH_IDENTITY_NOT_REATTESTED",
      "C3_BUNDLER_IMPLEMENTATION_UNSEALED_NO_INDEPENDENT_EQUIVALENCE",
      "C4_INTENT_WRITE_FAILURE_DOES_NOT_GATE_SETTLEMENT",
    ],
    constraints: {
      networkCalls: 0,
      credentialReads: 0,
      globalLedgerAccesses: 0,
      apiCalls: 0,
      modelCalls: 0,
      databaseCalls: 0,
      privateExactWireReads: 0,
      subjectWrites: 0,
      transactionScratchScope: path.relative(repoRoot, reviewRoot).replaceAll("\\", "/"),
    },
    targetStart,
    counterexamples: { c1, c2, c3, c4 },
    independentChecks: { modelRouteReasoning, priceMaxima, billingEquality, permanentNoDispatch },
    targetEnd,
    subjectUnchangedDuringReproduction: targetStart.snapshotSha256 === targetEnd.snapshotSha256 &&
      targetStart.allPublicEntriesMatch && targetEnd.allPublicEntriesMatch,
  };
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

await main();
