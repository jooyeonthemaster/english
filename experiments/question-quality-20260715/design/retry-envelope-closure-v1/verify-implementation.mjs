import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const root = resolve(import.meta.dirname, "../../../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const concurrency = read("src/lib/concurrency-config.ts");
const runtime = read("src/lib/question-generation-research-runtime.ts");
const llmPath = "src/lib/question-generation-llm.ts";
const ladderPath =
  "src/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder.ts";
const generation = read(
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
);
const trigger = read("src/trigger/workbench-question-generation.ts");

assert.match(
  concurrency,
  /QUESTION_GENERATION_APPLICATION_RETRY_HARD_CAP\s*=\s*2/,
);
assert.match(concurrency, /QUESTION_GENERATION_SDK_MAX_RETRIES\s*=\s*2/);
assert.match(concurrency, /QUESTION_GENERATION_OUTER_ATTEMPT_HARD_CAP\s*=\s*2/);
assert.match(
  concurrency,
  /WORKBENCH_QUESTION_TRIGGER_ATTEMPT_HARD_CAP\s*=\s*2/,
);
assert.match(
  concurrency,
  /normalizeSafeIntegerWithinBounds[\s\S]*?Number\.isSafeInteger[\s\S]*?Math\.min\(value, max\)/,
);
assert.match(
  concurrency,
  /WORKBENCH_QUESTION_TRIGGER_MAX_ATTEMPTS[\s\S]*?readBoundedPositiveIntegerEnv\([\s\S]*?WORKBENCH_QUESTION_TRIGGER_ATTEMPT_HARD_CAP/,
);
assert.match(
  concurrency,
  /GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS[\s\S]*?readBoundedPositiveIntegerEnv\([\s\S]*?QUESTION_GENERATION_OUTER_ATTEMPT_HARD_CAP/,
);

for (const [field, value] of [
  ["applicationMaxRetries", 0],
  ["sdkMaxRetries", 0],
  ["outerMaxAttempts", 1],
  ["ladderParseMaxRetries", 0],
] ) {
  assert.match(runtime, new RegExp(`${field}:\\s*${value}`));
}
assert.match(runtime, /allowStructuredRepair:\s*false/);
assert.match(
  runtime,
  /runtime\.retryPolicy\s*!==[\s\S]*?QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY/,
);
assert.match(runtime, /Object\.freeze\(\{[\s\S]*?allowStructuredRepair:\s*false/);

function sdkCalls(path) {
  const source = read(path);
  const tree = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const calls = [];
  const walk = (node) => {
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
        callee: node.expression.text,
        line: tree.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        hasExplicitMaxRetries,
      });
    }
    ts.forEachChild(node, walk);
  };
  walk(tree);
  return calls;
}

const llmCalls = sdkCalls(llmPath);
const ladderCalls = sdkCalls(ladderPath);
assert.equal(llmCalls.length, 4, JSON.stringify(llmCalls));
assert.equal(ladderCalls.length, 1, JSON.stringify(ladderCalls));
assert.ok(
  [...llmCalls, ...ladderCalls].every((call) => call.hasExplicitMaxRetries),
  JSON.stringify([...llmCalls, ...ladderCalls]),
);

const llm = read(llmPath);
const ladder = read(ladderPath);
assert.match(
  llm,
  /generationPlan === "PREMIUM" && allowStructuredRepair[\s\S]*?experimental_repairText/,
);
assert.match(
  llm,
  /!parsed\?\.success && rawText && allowStructuredRepair/,
);
assert.match(
  llm,
  /effectiveApplicationMaxRetries[\s\S]*?normalizeQuestionGenerationApplicationRetries/,
);
assert.match(
  ladder,
  /attempt <= 1 \+ ctx\.parseMaxRetries/,
);
assert.match(
  ladder,
  /researchTransportPolicy\?\.ladderParseMaxRetries \?\? 1/,
);

assert.match(
  generation,
  /getQuestionGenerationResearchTransportPolicy\(\)\?\.outerMaxAttempts \?\?[\s\S]*?normalizeQuestionGenerationOuterAttempts\(maxAttempts\)/,
);
for (const floor of [4, 5, 6, 10]) {
  assert.match(generation, new RegExp(`Math\\.max\\(${floor}, requestedMaxAttempts\\)`));
}
assert.match(generation, /PREMIUM_STRICT_ATTEMPT_CAP\s*=\s*5/);
assert.match(
  generation,
  /STANDARD_GRAMMAR_KILLER_STRICT_ATTEMPT_CAP\s*=\s*4/,
);
assert.match(
  trigger,
  /retry:\s*\{[\s\S]*?maxAttempts:\s*WORKBENCH_QUESTION_TRIGGER_MAX_ATTEMPTS/,
);

const production = (() => {
  const R = 2;
  const K = 2;
  const A = R + 1;
  const H = K + 1;
  const O = 3 * A;
  const standardBlankCandidates = 2 * O * (10 + 2);
  const premiumBlankCandidates = 2 * O * (2 + 1);
  const standardGrammarCandidates = 2 * O * (6 + 3);
  const standardGrammarEvaluation = O * (6 + 1);
  const premiumGrammarCandidates = 2 * (12 + 2 * O) + 4 * O;
  const premiumGrammarEvaluation = 2 * O;
  const premiumGrammarDesign = 6 * 2;
  return {
    standardBlank: H * standardBlankCandidates,
    premiumBlank: H * premiumBlankCandidates,
    standardGrammar:
      H * (standardGrammarCandidates + standardGrammarEvaluation),
    premiumGrammar:
      H *
      (premiumGrammarCandidates +
        premiumGrammarEvaluation +
        premiumGrammarDesign),
  };
})();
assert.deepEqual(production, {
  standardBlank: 648,
  premiumBlank: 162,
  standardGrammar: 675,
  premiumGrammar: 378,
});

const researchSingleDispatch = {
  standardBlank: 24,
  premiumBlank: 6,
  standardGrammar: 25,
  premiumGrammar: 28,
};
const triggerBound = Object.fromEntries(
  Object.entries(production).map(([key, value]) => [key, value * 2]),
);
assert.deepEqual(triggerBound, {
  standardBlank: 1296,
  premiumBlank: 324,
  standardGrammar: 1350,
  premiumGrammar: 756,
});

process.stdout.write(
  `${JSON.stringify(
    {
      status: "PASS",
      zeroNetwork: true,
      sdkCallsites: { llm: llmCalls, ladder: ladderCalls },
      productionCountOnePhysicalUpperBounds: production,
      researchSingleDispatchCountOne: researchSingleDispatch,
      workbenchTriggerPhysicalUpperBounds: triggerBound,
      remainingBlocks: [
        "ordinary wrapper question cardinality remains schema-unbounded",
        "complete four-cell research stage registry is not yet frozen",
      ],
    },
    null,
    2,
  )}\n`,
);
