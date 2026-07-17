import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

type Observation = {
  choicesObserved: number;
  fullQuestionObjectsObserved: number;
  candidateUnitsEffective: number;
  choiceCardinalityDrift: boolean;
  choiceCardinalityShortage: boolean;
  choiceCardinalityExcess: boolean;
  cardinalityAmbiguous: boolean;
  observationSaturated: boolean;
  duplicateKeys: Array<{ objectPath: string; key: string }>;
};

type Expected = Omit<Observation, "duplicateKeys"> & { duplicateKeyCount?: number };

type AuditCase = {
  id: string;
  category: string;
  contract: string;
  raw: string;
  expected: Expected;
};

const REVIEW_DIR = path.resolve(__dirname);
const REPO_ROOT = path.resolve(REVIEW_DIR, "../../../../");
const SUBJECT_PATH = path.join(
  REPO_ROOT,
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/strict-json-observer.ts",
);
const COORDINATED_TEST_PATH = path.join(
  REPO_ROOT,
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/offline.test.ts",
);
const EXPECTED_SUBJECT_SHA256 = "a7900fd2026eac7d63a2aca53ec77402bd18b9274b12699470f7bc3df89ee47d";

// The require is deliberately limited to the exact subject under review. The
// matrix and its oracle below do not import or inspect the subject's own tests.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const subject = require(SUBJECT_PATH) as {
  observeRawCandidateCardinalityV6(rawText: string): Observation;
  MAX_JSON_DEPTH_V6: number;
  MAX_JSON_NODES_V6: number;
  MAX_RAW_CANDIDATE_OBSERVATION_BYTES_V6: number;
  MAX_RAW_CANDIDATE_OBSERVATION_V6: number;
};

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function expectation(
  choicesObserved: number,
  fullQuestionObjectsObserved: number,
  candidateUnitsEffective: number,
  cardinalityAmbiguous: boolean,
  observationSaturated = false,
  duplicateKeyCount?: number,
): Expected {
  return {
    choicesObserved,
    fullQuestionObjectsObserved,
    candidateUnitsEffective,
    choiceCardinalityDrift: choicesObserved !== 1,
    choiceCardinalityShortage: choicesObserved < 1,
    choiceCardinalityExcess: choicesObserved > 1,
    cardinalityAmbiguous,
    observationSaturated,
    ...(duplicateKeyCount === undefined ? {} : { duplicateKeyCount }),
  };
}

const cases: AuditCase[] = [];

function addCase(
  id: string,
  category: string,
  raw: string,
  expected: Expected,
  contract: string,
): void {
  if (cases.some((entry) => entry.id === id)) throw new Error(`duplicate audit case id: ${id}`);
  cases.push({ id, category, raw, expected, contract });
}

function question(seed: number): Record<string, unknown> {
  return {
    direction: `choose-${seed}`,
    options: [`a-${seed}`, `b-${seed}`, `c-${seed}`, `d-${seed}`, `e-${seed}`],
    correctAnswer: String((seed % 5) + 1),
    explanation: `because-${seed}`,
  };
}

function providerChoice(index: number, content: string): Record<string, unknown> {
  return {
    index,
    message: { role: "assistant", content },
    finish_reason: "stop",
  };
}

function openRouterEnvelope(contents: string[]): string {
  return JSON.stringify({
    id: "generation-independent-audit",
    model: "google/gemini-audit",
    provider: "Google",
    choices: contents.map((content, index) => providerChoice(index, content)),
    usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18, cost: 0.001 },
  });
}

const questionJson = (seed: number): string => JSON.stringify(question(seed));

// 1. OpenRouter array envelopes: 48 independent combinations.
const contentFamilies: Array<{ name: string; make(seed: number): string; questionsPerChoice: number }> = [
  { name: "opaque", make: (seed) => `opaque-${seed}`, questionsPerChoice: 0 },
  { name: "empty-object", make: () => "{}", questionsPerChoice: 0 },
  { name: "neutral-array", make: (seed) => JSON.stringify([`trace-${seed}`]), questionsPerChoice: 0 },
  { name: "question", make: questionJson, questionsPerChoice: 1 },
  { name: "encoded-question", make: (seed) => JSON.stringify(questionJson(seed)), questionsPerChoice: 1 },
  { name: "payload-question", make: (seed) => JSON.stringify({ payload: question(seed) }), questionsPerChoice: 1 },
  {
    name: "answer-choice-metadata",
    make: (seed) => JSON.stringify({ kind: `answer-choice-metadata-${seed}`, choices: ["A", "B", "C"] }),
    questionsPerChoice: 0,
  },
  { name: "unicode-neutral", make: (seed) => `중립-${seed}-\ud800`, questionsPerChoice: 0 },
];

for (const family of contentFamilies) {
  for (let count = 0; count <= 5; count += 1) {
    const contents = Array.from({ length: count }, (_, index) => family.make(100 + index));
    addCase(
      `openrouter-array-${family.name}-${count}`,
      "openrouter-array",
      openRouterEnvelope(contents),
      expectation(count, count * family.questionsPerChoice, Math.max(1, count), count > 1),
      "Each member of an explicitly typed provider choices array is one provider lineage; decoded question payloads are counted once inside that lineage.",
    );
  }
}

// 2. Typed choices maps and typed string containers: 56 combinations.
const mappedValueFamilies: Array<{
  name: string;
  make(index: number): unknown;
  questionsPerEntry: number;
}> = [
  { name: "provider-object", make: (index) => providerChoice(index, `opaque-${index}`), questionsPerEntry: 0 },
  { name: "plain-string", make: (index) => `choice-${index}`, questionsPerEntry: 0 },
  { name: "null", make: () => null, questionsPerEntry: 0 },
  { name: "number", make: (index) => index, questionsPerEntry: 0 },
  { name: "question-string", make: (index) => questionJson(200 + index), questionsPerEntry: 1 },
  { name: "question-object", make: (index) => question(300 + index), questionsPerEntry: 1 },
];

for (const family of mappedValueFamilies) {
  for (let count = 0; count <= 5; count += 1) {
    const mapped = Object.fromEntries(
      Array.from({ length: count }, (_, index) => [`slot-${index}`, family.make(index)]),
    );
    addCase(
      `typed-choices-map-${family.name}-${count}`,
      "typed-provider-choices",
      JSON.stringify({ model: "google/gemini-audit", choices: mapped }),
      expectation(count, count * family.questionsPerEntry, Math.max(1, count), count > 1),
      "A provider-evidenced choices map has one provider lineage per map entry, including scalar or malformed entries.",
    );
  }
}

for (let count = 0; count <= 4; count += 1) {
  const objectValues = Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`branch-${index}`, providerChoice(index, `bad-${index}`)]),
  );
  const arrayValues = Array.from({ length: count }, (_, index) => providerChoice(index, `bad-${index}`));
  addCase(
    `typed-choices-json-string-map-${count}`,
    "typed-provider-choices",
    JSON.stringify({ model: "google/gemini-audit", choices: JSON.stringify(objectValues) }),
    expectation(count, 0, Math.max(1, count), count > 1),
    "A JSON-encoded typed choices map preserves one provider lineage per decoded entry.",
  );
  addCase(
    `typed-choices-json-string-array-${count}`,
    "typed-provider-choices",
    JSON.stringify({ model: "google/gemini-audit", choices: JSON.stringify(arrayValues) }),
    expectation(count, 0, Math.max(1, count), count > 1),
    "A JSON-encoded typed choices array preserves one provider lineage per decoded entry.",
  );
  addCase(
    `typed-choices-json-string-question-map-${count}`,
    "typed-provider-choices",
    JSON.stringify({
      model: "google/gemini-audit",
      choices: JSON.stringify(Object.fromEntries(
        Array.from({ length: count }, (_, index) => [`branch-${index}`, question(400 + index)]),
      )),
    }),
    expectation(count, count, Math.max(1, count), count > 1),
    "Question-like values in a JSON-encoded typed choices map remain one provider lineage each and expose one semantic question each.",
  );
  addCase(
    `typed-choices-json-string-scalars-${count}`,
    "typed-provider-choices",
    JSON.stringify({ model: "google/gemini-audit", choices: JSON.stringify(Array.from({ length: count }, (_, i) => i)) }),
    expectation(count, 0, Math.max(1, count), count > 1),
    "Scalar entries in a JSON-encoded provider choices array are malformed but affirmative provider lineages.",
  );
}

// 3. Explicit questions arrays, maps, strings and scalars: 72 combinations.
const explicitQuestionFamilies: Array<{ name: string; make(index: number): unknown }> = [
  { name: "object", make: (index) => question(500 + index) },
  { name: "empty-object", make: () => ({}) },
  { name: "plain-string", make: (index) => `malformed-question-${index}` },
  { name: "json-string", make: (index) => questionJson(600 + index) },
  { name: "number", make: (index) => index },
  { name: "null", make: () => null },
];

for (const family of explicitQuestionFamilies) {
  for (let count = 0; count <= 5; count += 1) {
    const values = Array.from({ length: count }, (_, index) => family.make(index));
    addCase(
      `questions-array-${family.name}-${count}`,
      "explicit-questions",
      JSON.stringify({ questions: values }),
      expectation(0, count, Math.max(1, count), count > 1),
      "Every element under an explicit questions array is one question lineage even when malformed.",
    );
    addCase(
      `questions-map-${family.name}-${count}`,
      "explicit-questions",
      JSON.stringify({
        questions: Object.fromEntries(values.map((value, index) => [`question-${index}`, value])),
      }),
      expectation(0, count, Math.max(1, count), count > 1),
      "Every value under an explicit questions map is one question lineage even when malformed.",
    );
  }
}

// 4. Nested transport wrappers and repeated JSON string wrappers: 42 cases.
const wrapperNames = ["data", "result", "payload", "output", "response", "body"];
for (let depth = 1; depth <= 30; depth += 1) {
  let wrapped: unknown = question(700 + depth);
  for (let layer = 0; layer < depth; layer += 1) {
    wrapped = { [wrapperNames[layer % wrapperNames.length]!]: wrapped };
  }
  addCase(
    `nested-generic-wrapper-${depth}`,
    "nested-wrapper",
    JSON.stringify(wrapped),
    expectation(0, 1, 1, false),
    "A single question remains exactly one lineage under arbitrary neutral transport wrappers.",
  );
}

for (let depth = 1; depth <= 12; depth += 1) {
  let encoded = questionJson(800 + depth);
  for (let layer = 0; layer < depth; layer += 1) encoded = JSON.stringify(encoded);
  addCase(
    `nested-json-string-wrapper-${depth}`,
    "nested-wrapper",
    encoded,
    expectation(0, 1, 1, false),
    "Repeated JSON-string wrappers must not duplicate or erase a single decoded question lineage.",
  );
}

// 5. Liveness/context controls for the four prior blocker classes: 72 cases.
for (let index = 0; index < 30; index += 1) {
  const rawQuestion = {
    ...question(900 + index),
    metadata: {
      options: [`rubric-${index}`],
      difficulty: index % 2 === 0 ? "HARD" : "MEDIUM",
      choices: ["metadata-A", "metadata-B"],
    },
  };
  addCase(
    `question-with-answer-metadata-${index}`,
    "liveness-context",
    JSON.stringify(rawQuestion),
    expectation(0, 1, 1, false),
    "Question-local answer/rubric metadata is not a second naked question or a provider choices container.",
  );
}

for (let count = 0; count < 30; count += 1) {
  addCase(
    `neutral-answer-choice-metadata-${count}`,
    "liveness-context",
    JSON.stringify({
      kind: `answer-choice-metadata-${count}`,
      label: `rubric-${count}`,
      choices: Array.from({ length: (count % 7) + 1 }, (_, index) => `label-${index}`),
    }),
    expectation(0, 0, 1, false),
    "A neutral object merely containing answer-choice labels is not a provider response and has no generated question lineage.",
  );
}

for (let index = 0; index < 12; index += 1) {
  addCase(
    `neutral-options-only-${index}`,
    "liveness-context",
    JSON.stringify({ trace: `t-${index}`, options: [`metric-${index}`] }),
    expectation(0, 0, 1, false),
    "A lone options key without an independent question marker is neutral metadata.",
  );
}

// 6. Decoded keys before missing/truncated values and other malformed surfaces.
const truncationCases: Array<[string, string, Expected, string]> = [
  ["questions-no-value", '{"questions":', expectation(0, 1, 1, true), "An explicit decoded questions key with no value is one malformed question lineage."],
  ["question-options-no-value", '{"direction":"choose","options":', expectation(0, 1, 1, true), "A question-like object retains its lineage when a structural value is truncated."],
  ["question-choices-no-value", '{"direction":"choose","choices":', expectation(0, 1, 1, true), "A question-like object retains its lineage when choices is truncated."],
  ["questions-array-first-missing", '{"questions":[', expectation(0, 0, 1, true), "An incomplete explicit questions array with no decoded element is ambiguous without inventing an element."],
  ["questions-array-second-missing", '{"questions":[{},', expectation(0, 1, 1, true), "A decoded first question remains observable when its array tail is truncated."],
  ["provider-choices-no-value", '{"model":"m","choices":', expectation(1, 0, 1, true), "An explicit provider choices key with no value is one malformed provider lineage."],
  ["provider-choice-message-no-value", '{"model":"m","choices":[{"index":0,"message":', expectation(1, 0, 1, true), "A typed provider choice remains one lineage when message is truncated."],
  ["provider-choice-content-no-value", '{"model":"m","choices":[{"index":0,"message":{"content":', expectation(1, 0, 1, true), "A typed provider choice remains one lineage when content is truncated."],
  ["provider-map-first-and-second-missing", '{"model":"m","choices":{"a":{"index":0},"b":', expectation(2, 0, 2, true), "A typed choices map counts a decoded first entry and the second entry whose key precedes a missing value."],
  ["explicit-map-first-and-second-missing", '{"questions":{"left":{},"right":', expectation(0, 2, 2, true), "An explicit questions map counts a decoded first value and the second key whose value is missing."],
  ["malformed-unicode-escape-neutral", '{"trace":"\\u12', expectation(0, 0, 1, false), "Pure neutral malformed transport does not affirm a candidate or model-surface ambiguity."],
  ["unterminated-neutral-string", '"neutral', expectation(0, 0, 1, false), "A pure neutral unterminated string does not affirm a candidate."],
];

for (const [id, raw, expected, contract] of truncationCases) {
  addCase(`truncated-${id}`, "truncation", raw, expected, contract);
}

// 7. Root-sequence oracle. These are the newly discovered adversarial cases.
const baseProvider = openRouterEnvelope(["opaque-single-choice"]);
const completeNeutralRoots = [
  ["object", "{}"],
  ["array", "[]"],
  ["null", "null"],
  ["number", "0"],
  ["string", '"neutral"'],
  ["boolean", "true"],
  ["metadata-object", '{"trace":1}'],
  ["metadata-array", '[1,2,3]'],
] as const;

for (const [name, neutral] of completeNeutralRoots) {
  addCase(
    `root-sequence-provider-then-${name}`,
    "root-sequence",
    `${baseProvider} \n ${neutral}`,
    expectation(1, 0, 1, true),
    "A valid single provider lineage plus any second complete root is cardinality-ambiguous even when the extra root is neutral.",
  );
  addCase(
    `root-sequence-${name}-then-provider`,
    "root-sequence",
    `${neutral}\t${baseProvider}`,
    expectation(1, 0, 1, true),
    "A neutral complete root before a valid provider lineage still makes the decoded root sequence cardinality-ambiguous.",
  );
}

const failedNeutralTails = [
  ["open-object", "{"],
  ["open-array", "["],
  ["unterminated-string", '"'],
  ["missing-object-value", '{"trace":'],
  ["missing-array-value", "[0,"],
  ["unterminated-object-string", '{"trace":"unterminated'],
  ["invalid-token", "tru"],
  ["invalid-exponent", "1e"],
  ["trailing-comma", ","],
  ["invalid-escape", '"\\q"'],
] as const;

for (const [name, tail] of failedNeutralTails) {
  addCase(
    `root-sequence-provider-then-failed-${name}`,
    "root-sequence",
    `${baseProvider} ${tail}`,
    expectation(1, 0, 1, true),
    "A successfully decoded provider lineage followed by a failed/truncated second root is cardinality-ambiguous; parser failure cannot be discarded.",
  );
}

const decodedCompleteVariants = ["{}", "[]", "null", "0", '"neutral"', '{"trace":1}'];
for (let index = 0; index < decodedCompleteVariants.length; index += 1) {
  const extra = decodedCompleteVariants[index]!;
  const q = questionJson(1_000 + index);
  addCase(
    `decoded-root-sequence-question-then-neutral-${index}`,
    "root-sequence-decoded-content",
    openRouterEnvelope([`${q} ${extra}`]),
    expectation(1, 1, 1, true),
    "message.content is an independently decoded root sequence; a semantic question plus another complete root is ambiguous.",
  );
  addCase(
    `decoded-root-sequence-neutral-then-question-${index}`,
    "root-sequence-decoded-content",
    openRouterEnvelope([`${extra} ${q}`]),
    expectation(1, 1, 1, true),
    "A neutral decoded root before the one semantic question still makes message.content root cardinality ambiguous.",
  );
  addCase(
    `decoded-root-sequence-neutral-only-${index}`,
    "root-sequence-decoded-content",
    openRouterEnvelope([`{} ${extra}`]),
    expectation(1, 0, 1, true),
    "Multiple complete roots inside a single provider choice are ambiguous even when neither independently looks like a question.",
  );
}

for (let index = 0; index < 8; index += 1) {
  const q = questionJson(1_100 + index);
  const tail = failedNeutralTails[index]![1];
  addCase(
    `decoded-root-sequence-question-failed-tail-${index}`,
    "root-sequence-decoded-content",
    openRouterEnvelope([`${q} ${tail}`]),
    expectation(1, 1, 1, true),
    "A decoded semantic question followed by a failed second root is ambiguous and must not silently collapse to the first root.",
  );
}

// 7b. Invalid-prefix recovery is a separate blind spot from losing root-count
// evidence after JSON parsing has begun. One or two complete questions can be
// hidden behind a non-JSON prefix because decoded-string observation is gated
// solely by the first non-whitespace character.
const invalidContentAffixes = [
  ["null", "null "],
  ["true", "true "],
  ["zero", "0 "],
  ["bom", "\ufeff"],
  ["code-fence", "```json\n"],
  ["prose", "Here is: "],
  ["comma", ", "],
  ["colon", ": "],
] as const;

for (let index = 0; index < invalidContentAffixes.length; index += 1) {
  const [name, affix] = invalidContentAffixes[index]!;
  const first = questionJson(1_150 + index * 2);
  const second = questionJson(1_151 + index * 2);
  addCase(
    `decoded-invalid-prefix-${name}-one-question`,
    "invalid-prefix-recovery",
    openRouterEnvelope([`${affix}${first}`]),
    expectation(1, 1, 1, true),
    "A complete semantic question behind invalid model-output prefix bytes remains observable, while the prefix makes decoded cardinality ambiguous.",
  );
  addCase(
    `decoded-invalid-prefix-${name}-two-questions`,
    "invalid-prefix-recovery",
    openRouterEnvelope([`${affix}${first} ${second}`]),
    expectation(1, 2, 2, true),
    "Invalid model-output prefix bytes must not hide two later complete semantic question roots or collapse them to one provider unit.",
  );
  addCase(
    `decoded-invalid-suffix-${name}-one-question`,
    "invalid-prefix-recovery",
    openRouterEnvelope([`${first} ${affix}`]),
    expectation(1, 1, 1, true),
    "A complete decoded semantic question followed by invalid model-output suffix bytes is cardinality-ambiguous.",
  );

  const twoChoiceEnvelope = openRouterEnvelope([
    `opaque-prefix-a-${index}`,
    `opaque-prefix-b-${index}`,
  ]);
  addCase(
    `raw-invalid-prefix-${name}-one-choice`,
    "invalid-prefix-recovery",
    `${affix}${baseProvider}`,
    expectation(1, 0, 1, true),
    "Invalid raw prefix bytes cannot erase the one affirmative provider choice that follows; prefix coexistence remains ambiguous.",
  );
  addCase(
    `raw-invalid-prefix-${name}-two-choices`,
    "invalid-prefix-recovery",
    `${affix}${twoChoiceEnvelope}`,
    expectation(2, 0, 2, true),
    "Invalid raw prefix bytes cannot erase a later complete two-choice provider envelope.",
  );
  addCase(
    `raw-invalid-prefix-${name}-two-provider-roots`,
    "invalid-prefix-recovery",
    `${affix}${baseProvider} ${baseProvider}`,
    expectation(2, 0, 2, true),
    "Invalid raw prefix bytes cannot erase two later complete single-choice provider roots.",
  );
}

// Pure-neutral controls: malformed/multiple roots do not by themselves affirm a
// model candidate. Choice shortage already fails closed, but ambiguity remains
// false until a model-surface lineage coexists with the extra root/failure.
for (const [name, neutral] of completeNeutralRoots.slice(0, 6)) {
  addCase(
    `neutral-only-multi-root-${name}`,
    "root-sequence-neutral-control",
    `{} ${neutral}`,
    expectation(0, 0, 1, false),
    "Pure neutral multi-root transport does not invent a model lineage; the zero-choice shortage remains the fail-closed signal.",
  );
}
for (const [name, tail] of failedNeutralTails.slice(0, 6)) {
  addCase(
    `neutral-only-failed-tail-${name}`,
    "root-sequence-neutral-control",
    `{} ${tail}`,
    expectation(0, 0, 1, false),
    "Pure neutral failed transport does not invent a model lineage; the zero-choice shortage remains the fail-closed signal.",
  );
}

addCase(
  "root-sequence-two-valid-provider-roots",
  "root-sequence-positive-control",
  `${baseProvider}\n${baseProvider}`,
  expectation(2, 0, 2, true),
  "Two valid provider roots expose two provider lineages and are ambiguous.",
);
addCase(
  "root-sequence-provider-and-question",
  "root-sequence-positive-control",
  `${baseProvider}\n${questionJson(1_200)}`,
  expectation(1, 1, 2, true),
  "A provider lineage and a separate semantic question root are two independent candidate units.",
);
addCase(
  "root-sequence-whitespace-only-tail-control",
  "root-sequence-positive-control",
  `${baseProvider}\r\n\t  `,
  expectation(1, 0, 1, false),
  "JSON whitespace after one valid provider root is not an extra root or parse failure.",
);

// 8. Duplicate keys and escape equivalence.
for (let index = 0; index < 8; index += 1) {
  addCase(
    `duplicate-provider-choices-${index}`,
    "duplicate-key",
    `{"model":"m-${index}","choices":[{"index":0}],"choi\\u0063es":[{"index":1}]}`,
    expectation(2, 0, 2, true, false, 1),
    "Escaped-equivalent duplicate structural keys retain both provider lineages and record the duplicate.",
  );
  addCase(
    `duplicate-message-content-${index}`,
    "duplicate-key",
    `{"model":"m-${index}","choices":[{"index":0,"message":{"content":"bad-a","content":"bad-b"}}]}`,
    expectation(1, 0, 1, true, false, 1),
    "Duplicate model content keys are ambiguous without duplicating the enclosing provider lineage.",
  );
  addCase(
    `duplicate-neutral-key-${index}`,
    "duplicate-key",
    `{"trace":${index},"trace":${index + 1}}`,
    expectation(0, 0, 1, false, false, 1),
    "A duplicate neutral key is reported but does not invent candidate ambiguity.",
  );
}

// 9. Exact byte/node/depth/candidate-cap boundaries.
const byteCap = subject.MAX_RAW_CANDIDATE_OBSERVATION_BYTES_V6;
const nodeCap = subject.MAX_JSON_NODES_V6;
const depthCap = subject.MAX_JSON_DEPTH_V6;
const candidateCap = subject.MAX_RAW_CANDIDATE_OBSERVATION_V6;

addCase(
  "boundary-byte-exact",
  "exact-boundary",
  `"${"x".repeat(byteCap - 2)}"`,
  expectation(0, 0, 1, false),
  "A valid neutral JSON string whose UTF-8 length equals the byte cap is observable without saturation.",
);
addCase(
  "boundary-byte-plus-one",
  "exact-boundary",
  `"${"x".repeat(byteCap - 1)}"`,
  expectation(0, 0, 1, true, true),
  "A raw response one byte above the cap saturates and becomes ambiguous.",
);

const exactNodeArray = `[${Array.from({ length: nodeCap - 1 }, () => "0").join(",")}]`;
const overNodeArray = `[${Array.from({ length: nodeCap }, () => "0").join(",")}]`;
addCase(
  "boundary-node-exact",
  "exact-boundary",
  exactNodeArray,
  expectation(0, 0, 1, false),
  "The array root plus nodeCap-1 scalar children is exactly the node cap and does not saturate.",
);
addCase(
  "boundary-node-plus-one",
  "exact-boundary",
  overNodeArray,
  expectation(0, 0, 1, true, true),
  "The array root plus nodeCap scalar children exceeds the node cap by one and saturates.",
);

const exactDepthJson = `${"[".repeat(depthCap)}0${"]".repeat(depthCap)}`;
const overDepthJson = `${"[".repeat(depthCap + 1)}0${"]".repeat(depthCap + 1)}`;
addCase(
  "boundary-depth-exact",
  "exact-boundary",
  exactDepthJson,
  expectation(0, 0, 1, false),
  "A scalar at exactly the maximum parser depth is accepted.",
);
addCase(
  "boundary-depth-plus-one",
  "exact-boundary",
  overDepthJson,
  expectation(0, 0, 1, true, true),
  "A scalar one level beyond maximum depth saturates and is ambiguous.",
);

addCase(
  "boundary-candidate-cap-minus-one",
  "exact-boundary",
  openRouterEnvelope(Array.from({ length: candidateCap - 1 }, (_, index) => `opaque-${index}`)),
  expectation(candidateCap - 1, 0, candidateCap - 1, true),
  "Exactly 1,000 provider lineages remain representable without observer saturation.",
);
addCase(
  "boundary-candidate-cap-sentinel",
  "exact-boundary",
  openRouterEnvelope(Array.from({ length: candidateCap }, (_, index) => `opaque-${index}`)),
  expectation(candidateCap, 0, candidateCap, true, true),
  "The 1,001st provider lineage reaches the overflow sentinel and saturates.",
);

// 10. Gemini-native diagnostics. The production contract is OpenRouter, so
// native `candidates` is not treated as a provider `choices` surface. These
// cases still assert safe shortage or semantic-question multiplicity.
for (let count = 0; count <= 5; count += 1) {
  const candidates = Array.from({ length: count }, (_, index) => ({
    content: { parts: [{ text: `opaque-gemini-${index}` }] },
    finishReason: "STOP",
  }));
  addCase(
    `gemini-native-opaque-${count}`,
    "gemini-native-diagnostic",
    JSON.stringify({ modelVersion: "gemini-audit", candidates }),
    expectation(0, 0, 1, false),
    "Native Gemini candidates are outside the OpenRouter provider-choice contract; zero choices produces a fail-closed shortage.",
  );
  const questionCandidates = Array.from({ length: count }, (_, index) => ({
    content: { parts: [{ text: questionJson(1_300 + index) }] },
    finishReason: "STOP",
  }));
  addCase(
    `gemini-native-question-${count}`,
    "gemini-native-diagnostic",
    JSON.stringify({ modelVersion: "gemini-audit", candidates: questionCandidates }),
    expectation(0, count, Math.max(1, count), count > 1),
    "Even outside the provider-choice contract, decoded semantic questions in native Gemini parts remain observable and multiple questions are ambiguous.",
  );
}

if (cases.length < 250) throw new Error(`audit matrix too small: ${cases.length}`);

const subjectBytesBefore = readFileSync(SUBJECT_PATH);
const subjectShaBefore = sha256(subjectBytesBefore);
if (subjectShaBefore !== EXPECTED_SUBJECT_SHA256) {
  throw new Error(`strict observer subject drift: ${subjectShaBefore}`);
}

const failures: Array<{
  id: string;
  category: string;
  contract: string;
  rawSha256: string;
  rawPreview: string;
  expected: Expected;
  actual: Omit<Observation, "duplicateKeys"> & { duplicateKeyCount: number };
  mismatches: string[];
}> = [];
const categoryCounts: Record<string, number> = {};
const categoryFailures: Record<string, number> = {};

for (const auditCase of cases) {
  categoryCounts[auditCase.category] = (categoryCounts[auditCase.category] ?? 0) + 1;
  const observed = subject.observeRawCandidateCardinalityV6(auditCase.raw);
  const actual = {
    choicesObserved: observed.choicesObserved,
    fullQuestionObjectsObserved: observed.fullQuestionObjectsObserved,
    candidateUnitsEffective: observed.candidateUnitsEffective,
    choiceCardinalityDrift: observed.choiceCardinalityDrift,
    choiceCardinalityShortage: observed.choiceCardinalityShortage,
    choiceCardinalityExcess: observed.choiceCardinalityExcess,
    cardinalityAmbiguous: observed.cardinalityAmbiguous,
    observationSaturated: observed.observationSaturated,
    duplicateKeyCount: observed.duplicateKeys.length,
  };
  const mismatches: string[] = [];
  for (const [key, expectedValue] of Object.entries(auditCase.expected)) {
    const actualValue = actual[key as keyof typeof actual];
    if (actualValue !== expectedValue) mismatches.push(`${key}: expected=${expectedValue} actual=${actualValue}`);
  }
  if (mismatches.length > 0) {
    categoryFailures[auditCase.category] = (categoryFailures[auditCase.category] ?? 0) + 1;
    failures.push({
      id: auditCase.id,
      category: auditCase.category,
      contract: auditCase.contract,
      rawSha256: sha256(auditCase.raw),
      rawPreview: auditCase.raw.length <= 500 ? auditCase.raw : `${auditCase.raw.slice(0, 497)}...`,
      expected: auditCase.expected,
      actual,
      mismatches,
    });
  }
}

const subjectShaAfter = sha256(readFileSync(SUBJECT_PATH));
if (subjectShaAfter !== subjectShaBefore) throw new Error("strict observer changed during audit");

const coordinatedTestSha256 = sha256(readFileSync(COORDINATED_TEST_PATH));
const result = {
  schemaVersion: "campaign-v6-observer-independent-reaudit-result-v1",
  verdict: failures.length === 0 ? "PASS_NO_BLOCKERS" : "FAIL_BLOCKERS",
  independence: {
    subjectTestsImportedOrExecuted: false,
    subjectTestsContentInspected: false,
    coordinatedTestHashRead: true,
    matrixDerivedFromSubjectTests: false,
    providerCalls: 0,
    modelCalls: 0,
    networkCalls: 0,
    ledgerReads: 0,
    ledgerWrites: 0,
    privateArtifactReads: 0,
    liveOrFreezeCommands: 0,
    reviewedSubjectFiles: [
      "execution/campaign-v6-connectivity-pilot-v6/strict-json-observer.ts",
      "execution/campaign-v6-connectivity-pilot-v6/offline.test.ts (hash only)",
    ],
  },
  subjectSha256: subjectShaAfter,
  coordinatedOfflineTestSha256: coordinatedTestSha256,
  totalCases: cases.length,
  passingCases: cases.length - failures.length,
  failingCases: failures.length,
  categoryCounts,
  categoryFailures,
  boundsObserved: { byteCap, nodeCap, depthCap, candidateCap },
  matrixFingerprintSha256: sha256(JSON.stringify(cases.map((entry) => ({
    id: entry.id,
    category: entry.category,
    contract: entry.contract,
    rawSha256: sha256(entry.raw),
    expected: entry.expected,
  })))),
  failureFingerprintSha256: sha256(JSON.stringify(failures.map((entry) => ({
    id: entry.id,
    category: entry.category,
    rawSha256: entry.rawSha256,
    expected: entry.expected,
    actual: entry.actual,
    mismatches: entry.mismatches,
  })))),
  failures,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
