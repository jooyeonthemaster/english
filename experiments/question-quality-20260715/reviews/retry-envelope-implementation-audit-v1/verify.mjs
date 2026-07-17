import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

globalThis.fetch = async () => {
  throw new Error("EXTERNAL_NETWORK_FORBIDDEN_BY_RETRY_ENVELOPE_IMPLEMENTATION_AUDIT_V1");
};

const auditDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(auditDir, "../../../..");
const relativeAuditDir =
  "experiments/question-quality-20260715/reviews/retry-envelope-implementation-audit-v1";
const readRoot = (path) => readFile(resolve(root, path), "utf8");
const hashBuffer = (value) =>
  createHash("sha256").update(value).digest("hex");
const hashRootFile = async (path) =>
  hashBuffer(await readFile(resolve(root, path)));

const sourceClosure = JSON.parse(await readRoot(`${relativeAuditDir}/source-closure.json`));
const envelope = JSON.parse(await readRoot(`${relativeAuditDir}/envelope.json`));
const findings = JSON.parse(await readRoot(`${relativeAuditDir}/findings.json`));
const testEvidence = JSON.parse(await readRoot(`${relativeAuditDir}/test-evidence.json`));

assert.equal(sourceClosure.schemaVersion, 1);
assert.equal(envelope.schemaVersion, 1);
assert.equal(findings.schemaVersion, 1);
assert.equal(testEvidence.schemaVersion, 1);
assert.equal(sourceClosure.snapshot.gitHead, "467c6d107137a91088d3eba1620ba4036a63d709");
assert.equal(sourceClosure.snapshot.implementationFreezeConfirmed, true);
assert.equal(sourceClosure.snapshot.auditProductionSourceEdits, 0);
assert.equal(sourceClosure.snapshot.auditExistingDesignArtifactEdits, 0);
assert.equal(sourceClosure.files.length, 41);
assert.equal(
  sourceClosure.snapshot.authorizedPostInitialFreezeDrift.retryEnvelopeReauditedAfterDrift,
  true,
);

const currentHead = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
assert.equal(currentHead, sourceClosure.snapshot.gitHead, "Git HEAD drift");

const closurePaths = new Set();
for (const entry of sourceClosure.files) {
  assert.equal(typeof entry.path, "string");
  assert.match(entry.path, /^[^\\/]+(?:\/[^\\/]+)*$/);
  assert.doesNotMatch(entry.path, /(?:^|\/)\.\.(?:\/|$)/);
  assert.match(entry.sha256, /^[0-9a-f]{64}$/);
  assert.equal(typeof entry.role, "string");
  assert.ok(entry.role.length > 0);
  assert.equal(closurePaths.has(entry.path), false, `duplicate closure path: ${entry.path}`);
  closurePaths.add(entry.path);
  assert.equal(
    await hashRootFile(entry.path),
    entry.sha256,
    `source closure drift: ${entry.path}`,
  );
}

const requiredClosurePaths = [
  "src/lib/concurrency-config.ts",
  "src/lib/atlas-ai.ts",
  "src/lib/atlas-research-fetch-boundary.ts",
  "src/lib/question-generation-research-runtime.ts",
  "src/lib/question-generation-research-schema.ts",
  "src/lib/question-ai-schemas-mc.ts",
  "src/lib/question-generation-llm.ts",
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
  "src/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder.ts",
  "src/trigger/workbench-question-generation.ts",
  "experiments/question-quality-20260715/harness/question-generation-callsite-adapter.ts",
  "tests/unit/question-generation-retry-envelope.test.ts",
  "tests/unit/question-generation-response-cardinality.test.ts",
  "node_modules/ai/dist/index.js",
];
for (const path of requiredClosurePaths) {
  assert.equal(closurePaths.has(path), true, `missing required closure path: ${path}`);
}

const concurrency = await readRoot("src/lib/concurrency-config.ts");
for (const [name, value] of [
  ["QUESTION_GENERATION_APPLICATION_RETRY_HARD_CAP", 2],
  ["QUESTION_GENERATION_SDK_MAX_RETRIES", 2],
  ["QUESTION_GENERATION_OUTER_ATTEMPT_HARD_CAP", 2],
  ["WORKBENCH_QUESTION_TRIGGER_ATTEMPT_HARD_CAP", 2],
]) {
  assert.match(concurrency, new RegExp(`export const ${name}\\s*=\\s*${value}`));
}
assert.match(
  concurrency,
  /function normalizeSafeIntegerWithinBounds[\s\S]*?typeof value !== "number"[\s\S]*?Number\.isSafeInteger\(value\)[\s\S]*?value < min[\s\S]*?return Math\.min\(value, max\)/,
);
assert.match(
  concurrency,
  /normalizeQuestionGenerationApplicationRetries[\s\S]*?QUESTION_GENERATION_APPLICATION_RETRY_HARD_CAP,[\s\S]*?0,[\s\S]*?QUESTION_GENERATION_APPLICATION_RETRY_HARD_CAP/,
);
assert.match(
  concurrency,
  /normalizeQuestionGenerationOuterAttempts[\s\S]*?QUESTION_GENERATION_OUTER_ATTEMPT_HARD_CAP,[\s\S]*?1,[\s\S]*?QUESTION_GENERATION_OUTER_ATTEMPT_HARD_CAP/,
);
assert.match(
  concurrency,
  /GEMINI_QUESTION_MAX_RETRIES\s*=\s*readQuestionGenerationApplicationRetryEnv\([\s\S]*?"GEMINI_QUESTION_MAX_RETRIES",[\s\S]*?2/,
);
assert.match(
  concurrency,
  /WORKBENCH_QUESTION_TRIGGER_MAX_ATTEMPTS\s*=\s*readBoundedPositiveIntegerEnv\([\s\S]*?WORKBENCH_QUESTION_TRIGGER_ATTEMPT_HARD_CAP/,
);
assert.match(
  concurrency,
  /GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS\s*=\s*readBoundedPositiveIntegerEnv\([\s\S]*?QUESTION_GENERATION_OUTER_ATTEMPT_HARD_CAP/,
);

const independentNormalize = (value, fallback, min, max) =>
  typeof value !== "number" || !Number.isSafeInteger(value) || value < min
    ? fallback
    : Math.min(value, max);
const malformed = [
  undefined,
  null,
  "2",
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  -1,
  0.5,
  1.5,
  Number.MAX_SAFE_INTEGER + 1,
];
for (const value of malformed) {
  assert.equal(independentNormalize(value, 2, 0, 2), 2);
  assert.equal(independentNormalize(value, 2, 1, 2), 2);
}
assert.deepEqual(
  [0, 1, 2, 3, 999].map((value) => independentNormalize(value, 2, 0, 2)),
  [0, 1, 2, 2, 2],
);
assert.deepEqual(
  [0, 1, 2, 3, 999].map((value) => independentNormalize(value, 2, 1, 2)),
  [2, 1, 2, 2, 2],
);

function sdkCalls(path, source) {
  const tree = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const calls = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === "generateObject" ||
        node.expression.text === "generateText")
    ) {
      const options = node.arguments[0];
      const hasExplicitMaxRetries =
        options &&
        ts.isObjectLiteralExpression(options) &&
        options.properties.some(
          (property) =>
            ts.isPropertyAssignment(property) &&
            ((ts.isIdentifier(property.name) &&
              property.name.text === "maxRetries") ||
              (ts.isStringLiteral(property.name) &&
                property.name.text === "maxRetries")),
        );
      calls.push({
        path,
        callee: node.expression.text,
        line: tree.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        hasExplicitMaxRetries,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return calls;
}

const questionGenerationClosurePaths = sourceClosure.files
  .map((entry) => entry.path)
  .filter(
    (path) =>
      path.startsWith("src/") &&
      (path.endsWith(".ts") || path.endsWith(".tsx")),
  );
const allSdkCalls = [];
for (const path of questionGenerationClosurePaths) {
  allSdkCalls.push(...sdkCalls(path, await readRoot(path)));
}
assert.equal(allSdkCalls.length, 5, JSON.stringify(allSdkCalls));
assert.deepEqual(
  allSdkCalls.map((call) => [call.path, call.callee, call.line]),
  [
    ["src/lib/question-generation-llm.ts", "generateObject", 374],
    ["src/lib/question-generation-llm.ts", "generateText", 716],
    ["src/lib/question-generation-llm.ts", "generateText", 863],
    ["src/lib/question-generation-llm.ts", "generateText", 941],
    [
      "src/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder.ts",
      "generateObject",
      540,
    ],
  ],
);
assert.ok(allSdkCalls.every((call) => call.hasExplicitMaxRetries));

const installedAiPackage = JSON.parse(await readRoot("node_modules/ai/package.json"));
assert.equal(installedAiPackage.version, "6.0.99");
assert.match(
  await readRoot("node_modules/ai/dist/index.js"),
  /retryWithExponentialBackoffRespectingRetryHeaders\s*=\s*\(\{[\s\S]*?maxRetries\s*=\s*2/,
);

const researchRuntime = await readRoot(
  "src/lib/question-generation-research-runtime.ts",
);
for (const [field, value] of [
  ["applicationMaxRetries", 0],
  ["sdkMaxRetries", 0],
  ["outerMaxAttempts", 1],
  ["ladderParseMaxRetries", 0],
]) {
  assert.match(researchRuntime, new RegExp(`${field}:\\s*${value}`));
}
assert.match(researchRuntime, /allowStructuredRepair:\s*false/);
assert.match(
  researchRuntime,
  /QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY[\s\S]*?Object\.freeze\(\{/,
);
assert.match(
  researchRuntime,
  /runtime\.retryPolicy\s*!==[\s\S]*?QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY/,
);
assert.match(
  researchRuntime,
  /A registered[\s\S]*?provider stage gets one application dispatch[\s\S]*?Subtype quality floors remain/,
);

const llm = await readRoot("src/lib/question-generation-llm.ts");
assert.match(
  llm,
  /effectiveApplicationMaxRetries\s*=\s*researchTransportPolicy[\s\S]*?applicationMaxRetries[\s\S]*?normalizeQuestionGenerationApplicationRetries\(maxRetries\)/,
);
assert.match(
  llm,
  /effectiveSdkMaxRetries\s*=\s*researchTransportPolicy[\s\S]*?sdkMaxRetries[\s\S]*?QUESTION_GENERATION_SDK_MAX_RETRIES/,
);
assert.match(
  llm,
  /allowStructuredRepair\s*=\s*researchTransportPolicy\?\.allowStructuredRepair\s*\?\?\s*true/,
);
assert.match(
  llm,
  /generationPlan === "PREMIUM" && allowStructuredRepair[\s\S]*?experimental_repairText/,
);
assert.match(llm, /!parsed\?\.success && rawText && allowStructuredRepair/);
assert.match(
  llm,
  /hasQuestionGenerationResearchRuntime\(\)[\s\S]*?Research strict structured-output failure is an ITT no-candidate[\s\S]*?throw error/,
);

const ladder = await readRoot(
  "src/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder.ts",
);
assert.match(ladder, /attempt <= 1 \+ ctx\.parseMaxRetries/);
assert.match(
  ladder,
  /researchTransportPolicy\?\.sdkMaxRetries\s*\?\?[\s\S]*?QUESTION_GENERATION_SDK_MAX_RETRIES/,
);
assert.match(
  ladder,
  /researchTransportPolicy\?\.ladderParseMaxRetries\s*\?\?\s*1/,
);
assert.doesNotMatch(
  ladder,
  /reasoning_effort\s*:\s*["'](?:low|medium|high)["']/i,
);
assert.doesNotMatch(ladder, /reasoning-fallback/i);

const atlasAi = await readRoot("src/lib/atlas-ai.ts");
assert.match(
  atlasAi,
  /if \(isAtlasGeminiModel\(normalized\)\)[\s\S]*?if \(explicitGeminiReasoning\) return explicitGeminiReasoning;[\s\S]*?return "none";/,
);
assert.match(
  atlasAi,
  /reasoning:\s*\{[\s\S]*?enabled:\s*false,[\s\S]*?effort:\s*"none"/,
);

const generation = await readRoot(
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
);
assert.match(
  generation,
  /getQuestionGenerationResearchTransportPolicy\(\)\?\.outerMaxAttempts\s*\?\?[\s\S]*?normalizeQuestionGenerationOuterAttempts\(maxAttempts\)/,
);
for (const floor of [4, 5, 6, 10]) {
  assert.match(generation, new RegExp(`Math\\.max\\(${floor}, requestedMaxAttempts\\)`));
}
assert.match(generation, /PREMIUM_STRICT_ATTEMPT_CAP\s*=\s*5/);
assert.match(
  generation,
  /STANDARD_GRAMMAR_KILLER_STRICT_ATTEMPT_CAP\s*=\s*4/,
);

const trigger = await readRoot("src/trigger/workbench-question-generation.ts");
assert.match(
  trigger,
  /retry:\s*\{[\s\S]*?maxAttempts:\s*WORKBENCH_QUESTION_TRIGGER_MAX_ATTEMPTS/,
);

const researchSchema = await readRoot(
  "src/lib/question-generation-research-schema.ts",
);
assert.match(researchSchema, /const questions = z\.array\(questionSchema\)/);
assert.match(
  researchSchema,
  /productionQuestionCount\s*=\s*cardinality\.expectedQuestionCount/,
);
assert.match(
  researchSchema,
  /return z\.object\(\{ questions: questions\.length\(researchQuestionCount\) \}\)/,
);
assert.match(
  researchSchema,
  /return z\.object\(\{ questions: questions\.length\(productionQuestionCount\) \}\)/,
);
assert.match(researchSchema, /return z\.object\(\{ questions \}\)/);
assert.doesNotMatch(
  researchSchema,
  /const questions = z\.array\(questionSchema\)\.(?:max|length)\(/,
);
const aiSchemas = await readRoot("src/lib/question-ai-schemas-mc.ts");
assert.match(
  aiSchemas,
  /expectedQuestionCount\?: number[\s\S]*?buildResearchAwareQuestionResponseSchema\(schema,[\s\S]*?expectedQuestionCount: options\?\.expectedQuestionCount/,
);
assert.match(
  generation,
  /getAiResponseSchema\(subType,[\s\S]*?expectedQuestionCount: expectedTypeCount/,
);
assert.match(
  generation,
  /buildResearchAwareQuestionResponseSchema\([\s\S]*?QUESTION_SCHEMAS\[subType\],[\s\S]*?expectedQuestionCount: expectedTypeCount/,
);

const questionRepair = await readRoot(
  "src/app/api/ai/generate-questions-auto/_lib/question-repair.ts",
);
const grammarSolver = await readRoot(
  "src/app/api/ai/generate-questions-auto/_lib/grammar-solver-gate.ts",
);
const koSolver = await readRoot("src/lib/korean/quality/solver-gate.ts");
const adapter = await readRoot(
  "experiments/question-quality-20260715/harness/question-generation-callsite-adapter.ts",
);
assert.match(
  questionRepair,
  /QUESTION_CANDIDATE_REPAIR_JSON[\s\S]*?QUESTION_CANDIDATE_REPAIR[\s\S]*?derivationParentValue:\s*researchParentCandidate/,
);
assert.match(
  grammarSolver,
  /GRAMMAR_SOLVER[\s\S]*?derivationParentValue:\s*input\.researchParentCandidate/,
);
assert.match(
  koSolver,
  /QUESTION_SOLVER[\s\S]*?derivationParentValue:\s*input\.researchParentCandidate/,
);
assert.match(ladder, /GRAMMAR_LADDER_ANSWER_REGEN/);
assert.match(ladder, /GRAMMAR_LADDER_ADD_DECOYS/);
assert.match(ladder, /GRAMMAR_LADDER_REPAIR/);
assert.match(
  ladder,
  /answerRegeneration:\s*previousQuestion !== undefined,[\s\S]*?derivationParentValue:\s*previousQuestion/,
);
assert.match(
  ladder,
  /purpose:\s*"repair",[\s\S]*?derivationParentValue:\s*previousQuestion/,
);
assert.match(
  adapter,
  /outer retry root stage has no trusted prior physical call[\s\S]*?lineage\.lastPhysicalCallId/,
);
assert.match(
  adapter,
  /stage\.derivationParentValue !== undefined[\s\S]*?producerByObjectIdentity\.get\(parentValue as object\)[\s\S]*?no trusted producer/,
);
assert.match(
  adapter,
  /unregistered research child stage[\s\S]*?research child stage \$\{stage\.key\} has no trusted latest parent/,
);

async function walkFiles(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await walkFiles(path)));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}
for (const path of await walkFiles(resolve(root, "src"))) {
  if (!/\.(?:ts|tsx|js|mjs)$/.test(path)) continue;
  const source = await readFile(path, "utf8");
  assert.doesNotMatch(source, /new\s+QuestionGenerationCallsiteAdapter/);
  assert.doesNotMatch(source, /runPhaseCQuestionGenerationAssignment/);
}

assert.equal(findings.verdict.retryEnvelopeImplementation, "PASS");
assert.equal(findings.verdict.overall, "PASS_SCOPED_WITH_EXPLICIT_BLOCKS");
assert.equal(findings.verdict.workbenchStructuredQuestionCardinality, "PASS");
assert.equal(findings.verdict.ordinarySemanticQuestionCardinality, "BLOCK");
assert.equal(findings.verdict.completeFourCellResearchRegistry, "BLOCK");
assert.equal(findings.verdict.campaignAuthorization, "NONE");
const findingById = new Map(findings.findings.map((finding) => [finding.id, finding]));
for (let index = 1; index <= 9; index += 1) {
  assert.equal(findingById.get(`RETRY-${String(index).padStart(2, "0")}`)?.status, "PASS");
}
assert.equal(findingById.get("BLOCK-01")?.status, "BLOCK");
assert.equal(findingById.get("BLOCK-02")?.status, "BLOCK");
assert.equal(envelope.researchTransportPolicy.wholeAssignmentSingleDispatch, false);
assert.equal(
  envelope.researchTransportPolicy.accurateScope,
  "one physical provider dispatch per admitted registered stage",
);
assert.equal(
  envelope.semanticAndOperationalLimits.ordinaryQuestionsArray,
  "BLOCK_PLAINTEXT_PROMPT_JSON_UNBOUNDED",
);
assert.equal(
  envelope.semanticAndOperationalLimits.workbenchStructuredQuestionsArray,
  "PASS_EXACT_SERVER_PLAN_COUNT",
);
assert.equal(
  envelope.semanticAndOperationalLimits.completeFourCellResearchRegistry,
  "BLOCK_NOT_PRESENT",
);
assert.equal(
  envelope.semanticAndOperationalLimits.researchFourCellNumericTableClaimedByThisAudit,
  false,
);

const R = envelope.sourceCapsAndDefaults.applicationMaxRetriesR;
const K = envelope.sourceCapsAndDefaults.sdkMaxRetriesK;
const E = envelope.sourceCapsAndDefaults.outerRequestedAttemptsHardCapE;
const T = envelope.sourceCapsAndDefaults.workbenchTriggerAttemptsT;
assert.deepEqual({ R, K, E, T }, { R: 2, K: 2, E: 2, T: 2 });
const A = R + 1;
const H = K + 1;
const O = 3 * A;
assert.equal(A, envelope.sourceCapsAndDefaults.applicationAttemptsA);
assert.equal(H, envelope.sourceCapsAndDefaults.physicalFetchesPerSdkInvocationH);
assert.equal(O, envelope.sourceCapsAndDefaults.logicalResponsesPerFullSchemaWrapperO);

const standardBlankStrict = Math.max(10, E);
const premiumStrict = Math.max(1, Math.min(Math.max(4, E), 5, E));
const standardGrammarStrict = Math.max(6, E);
const calculated = {
  STANDARD_BLANK_INFERENCE: {
    candidateLogicalResponses: 2 * O * (standardBlankStrict + 2),
    evaluationLogicalResponses: 0,
    designLogicalResponses: 0,
  },
  PREMIUM_BLANK_INFERENCE: {
    candidateLogicalResponses: 2 * O * (premiumStrict + 1),
    evaluationLogicalResponses: 0,
    designLogicalResponses: 0,
  },
  STANDARD_GRAMMAR_ERROR: {
    candidateLogicalResponses: 2 * O * (standardGrammarStrict + 3),
    evaluationLogicalResponses: O * (standardGrammarStrict + 1),
    designLogicalResponses: 0,
  },
  PREMIUM_GRAMMAR_ERROR: {
    candidateLogicalResponses: premiumStrict * (12 + 2 * O) + 4 * O,
    evaluationLogicalResponses: premiumStrict * O,
    designLogicalResponses: 6 * premiumStrict,
  },
};
for (const [cell, counts] of Object.entries(calculated)) {
  const recorded = envelope.ordinaryProductionResponseOpportunityUpperBounds[cell];
  assert.equal(recorded.candidateLogicalResponses, counts.candidateLogicalResponses);
  assert.equal(recorded.evaluationLogicalResponses, counts.evaluationLogicalResponses);
  assert.equal(recorded.designLogicalResponses, counts.designLogicalResponses);
  const physical =
    H *
    (counts.candidateLogicalResponses +
      counts.evaluationLogicalResponses +
      counts.designLogicalResponses);
  assert.equal(recorded.physicalProviderFetches, physical);
  assert.equal(
    envelope.workbenchTriggerResponseOpportunityUpperBounds[cell],
    T * physical,
  );
}
assert.deepEqual(
  Object.fromEntries(
    Object.entries(envelope.ordinaryProductionResponseOpportunityUpperBounds).map(
      ([cell, value]) => [cell, value.physicalProviderFetches],
    ),
  ),
  {
    STANDARD_BLANK_INFERENCE: 648,
    PREMIUM_BLANK_INFERENCE: 162,
    STANDARD_GRAMMAR_ERROR: 675,
    PREMIUM_GRAMMAR_ERROR: 378,
  },
);
assert.deepEqual(
  {
    STANDARD_BLANK_INFERENCE:
      envelope.workbenchTriggerResponseOpportunityUpperBounds.STANDARD_BLANK_INFERENCE,
    PREMIUM_BLANK_INFERENCE:
      envelope.workbenchTriggerResponseOpportunityUpperBounds.PREMIUM_BLANK_INFERENCE,
    STANDARD_GRAMMAR_ERROR:
      envelope.workbenchTriggerResponseOpportunityUpperBounds.STANDARD_GRAMMAR_ERROR,
    PREMIUM_GRAMMAR_ERROR:
      envelope.workbenchTriggerResponseOpportunityUpperBounds.PREMIUM_GRAMMAR_ERROR,
  },
  {
    STANDARD_BLANK_INFERENCE: 1296,
    PREMIUM_BLANK_INFERENCE: 324,
    STANDARD_GRAMMAR_ERROR: 1350,
    PREMIUM_GRAMMAR_ERROR: 756,
  },
);

assert.equal(testEvidence.totals.testAssertions, 326);
assert.equal(testEvidence.totals.passed, 326);
assert.equal(testEvidence.totals.failed, 0);
assert.equal(testEvidence.totals.externalNetworkOrApiCalls, 0);
assert.equal(testEvidence.totals.applicationOrExternalDatabaseCalls, 0);
assert.equal(testEvidence.totals.secretValuesInspected, false);
assert.equal(testEvidence.totals.liveCandidateOutputsGenerated, 0);
assert.equal(testEvidence.totals.productionSourceEditsByAudit, 0);
assert.equal(testEvidence.totals.existingDesignArtifactEditsByAudit, 0);
assert.equal(testEvidence.totals.sourceClosureDriftAfterTests, 0);
for (const command of testEvidence.commands) {
  assert.equal(command.exitCode, 0, command.id);
  if (typeof command.tests === "number") {
    assert.equal(command.passed, command.tests, command.id);
    assert.equal(command.failed, 0, command.id);
  }
}

const artifactNames = [
  "AUDIT.md",
  "envelope.json",
  "findings.json",
  "source-closure.json",
  "test-evidence.json",
  "verify.mjs",
];
const forbiddenCredentialPatterns = [
  /AIza[0-9A-Za-z_-]{20,}/,
  /\bsk-[0-9A-Za-z_-]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /GEMINI_API_KEY\s*=\s*[^\s<]+/,
];
for (const name of artifactNames) {
  const text = await readRoot(`${relativeAuditDir}/${name}`);
  for (const pattern of forbiddenCredentialPatterns) {
    assert.doesNotMatch(text, pattern, `credential-shaped text in ${name}`);
  }
}

const manifestText = await readRoot(`${relativeAuditDir}/MANIFEST.sha256`);
const manifestEntries = manifestText
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    assert.ok(match, `malformed manifest line: ${line}`);
    return { sha256: match[1], path: match[2] };
  });
assert.deepEqual(
  manifestEntries.map((entry) => entry.path),
  artifactNames,
);
for (const entry of manifestEntries) {
  assert.equal(
    await hashRootFile(`${relativeAuditDir}/${entry.path}`),
    entry.sha256,
    `artifact drift: ${entry.path}`,
  );
}

for (const name of [...artifactNames, "MANIFEST.sha256"]) {
  const fileStat = await stat(resolve(auditDir, name));
  assert.equal(fileStat.isFile(), true);
  assert.ok(fileStat.size > 0);
}

process.stdout.write(
  `${JSON.stringify(
    {
      status: "PASS_SCOPED_WITH_EXPLICIT_BLOCKS",
      gitHead: currentHead,
      sourceClosureFiles: sourceClosure.files.length,
      sdkCallsites: allSdkCalls,
      ordinaryEnginePhysical: Object.fromEntries(
        Object.entries(
          envelope.ordinaryProductionResponseOpportunityUpperBounds,
        ).map(([cell, value]) => [cell, value.physicalProviderFetches]),
      ),
      workbenchTriggerPhysical: {
        STANDARD_BLANK_INFERENCE: 1296,
        PREMIUM_BLANK_INFERENCE: 324,
        STANDARD_GRAMMAR_ERROR: 1350,
        PREMIUM_GRAMMAR_ERROR: 756,
      },
      researchScope: envelope.researchTransportPolicy.accurateScope,
      remainingBlocks: [
        envelope.semanticAndOperationalLimits.ordinaryQuestionsArray,
        envelope.semanticAndOperationalLimits.completeFourCellResearchRegistry,
      ],
      externalNetworkOrApiCalls: 0,
      campaignAuthorization: "NONE",
    },
    null,
    2,
  )}\n`,
);
