import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const artifactPath = path.join(here, "callgraph-bound.json");
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const requireText = (relative, pattern, label) => {
  const source = read(relative);
  assert.match(source, pattern, `${label}: ${relative}`);
  return source;
};
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

assert.equal(artifact.verdict, "FAIL_BLOCKED");
assert.equal(artifact.scope.questionCountPerPrimaryRequest, 1);
assert.equal(artifact.defaultConstants.wrapperOuterRetries, 2);
assert.equal(artifact.defaultConstants.sdkHiddenRetries, 2);

const H = artifact.defaultConstants.sdkHiddenAttempts;
const R = artifact.defaultConstants.wrapperOuterRetries;
const G = 3 * H * (R + 1);
const F = 2 * H * (R + 1);
const ladderStage = 3 * H;
const L = 9 * ladderStage;
assert.equal(G, 27);
assert.equal(F, 18);
assert.equal(ladderStage, 9);
assert.equal(L, 81);
assert.equal(artifact.atomicBounds.normalGenerateQuestionObjectPhysicalCalls, G);
assert.equal(artifact.atomicBounds.forcedJsonGenerateQuestionObjectPhysicalCalls, F);
assert.equal(artifact.atomicBounds.grammarPremiumLadderPhysicalCalls, L);

const genericStd = (attempts, n = 1) => (attempts + 2) * G * (1 + n);
const genericPremium = (attempts, n = 1) => (attempts + 1) * G * (1 + n);
const grammarStd = (attempts, n = 1) =>
  (attempts + 1) * G * (1 + 2 * n) + 2 * G * (1 + n);
const grammarPremiumLegacy = (attempts, n = 1) =>
  attempts * G * (1 + 2 * n) + 2 * G * (1 + n);
const grammarPremiumLadder = (attempts, n = 1) =>
  attempts * (L + 3 * G) + 2 * G * (1 + n);

assert.equal(genericStd(4), 324);
assert.equal(genericStd(5), 378);
assert.equal(genericStd(6), 432);
assert.equal(genericStd(10), 648);
assert.equal(genericPremium(2), 162);
assert.equal(grammarStd(4), 513);
assert.equal(grammarStd(6), 675);
assert.equal(grammarPremiumLegacy(2), 270);
assert.equal(grammarPremiumLadder(2), 432);

const constants = requireText(
  "src/app/api/ai/generate-questions-auto/_lib/constants.ts",
  /export const TYPE_LABELS:[\s\S]*?=\s*\{([\s\S]*?)\n\};/,
  "English type registry",
);
const typeBlock = constants.match(
  /export const TYPE_LABELS:[\s\S]*?=\s*\{([\s\S]*?)\n\};/,
)[1];
const types = [...typeBlock.matchAll(/^\s{2}([A-Z][A-Z_]+):/gm)].map(
  (match) => match[1],
);
assert.equal(types.length, 26);
assert.deepEqual(
  artifact.primaryFastPathDefaultConfigPerItem.map((entry) => entry.type),
  types,
  "all English registry types must appear exactly once and in registry order",
);

requireText(
  "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts",
  /count:\s*z\.number\(\)\.int\(\)\.min\(1\)\.max\(1\)\.default\(1\)/,
  "fast request count=1",
);
requireText(
  "src/app/(director)/director/workbench/generate/use-generation-handlers.ts",
  /for \(let index = 0; index < repeatCount; index \+= 1\)[\s\S]*?count:\s*1/,
  "UI splits configured count into one-item fast calls",
);
requireText(
  "src/lib/concurrency-config.ts",
  /GEMINI_QUESTION_MAX_RETRIES[\s\S]*?2,[\s\S]*?GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS[\s\S]*?2\)/,
  "wrapper defaults",
);
requireText(
  "src/lib/question-generation-llm.ts",
  /for \(let attempt = 0; attempt <= maxRetries; attempt\+\+\)[\s\S]*?await generateObject\([\s\S]*?generateObjectViaJsonFallback/,
  "outer retry and fallback",
);
requireText(
  "src/lib/question-generation-llm.ts",
  /async function generateObjectViaJsonFallback[\s\S]*?await generateText\([\s\S]*?await repairPremiumJsonOutput/,
  "fallback repair continuation",
);
requireText(
  "src/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder.ts",
  /GRAMMAR_PREMIUM_MAX_REGENS\s*=\s*2[\s\S]*?for \(let attempt = 1; attempt <= 2; attempt\+\+\)[\s\S]*?reasoning-fallback/,
  "ladder retries",
);
requireText(
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
  /Math\.max\(10, requestedMaxAttempts\)[\s\S]*?Math\.max\(6, requestedMaxAttempts\)[\s\S]*?Math\.max\(5, requestedMaxAttempts\)[\s\S]*?Math\.max\(4, requestedMaxAttempts\)/,
  "strict attempt classes",
);
requireText(
  "src/lib/atlas-research-fetch-boundary.ts",
  /if \(!internal\) \{[\s\S]*?return delegate\(input, init\);/,
  "no-scope production passthrough",
);

const packageLock = JSON.parse(read("package-lock.json"));
assert.equal(packageLock.packages["node_modules/ai"].version, "6.0.99");
const aiDeclaration = read("node_modules/ai/dist/index.d.ts");
assert.match(
  aiDeclaration,
  /@param maxRetries - Maximum number of retries\. Set to 0 to disable retries\. Default: 2\./,
  "AI SDK hidden retry default changed",
);

for (const [relative, expected] of Object.entries(artifact.sourceSnapshot.files)) {
  assert.equal(sha256(read(relative)), expected, `source drift: ${relative}`);
}

console.log(
  JSON.stringify({
    verdict: artifact.verdict,
    types: types.length,
    H,
    G,
    F,
    L,
    primaryFastPathWorstDefaults: {
      standardBlankKiller: genericStd(10),
      standardGrammarExtended: grammarStd(6),
      premiumGrammarLadder: grammarPremiumLadder(2),
    },
    artifactSha256: sha256(readFileSync(artifactPath, "utf8")),
  }),
);
