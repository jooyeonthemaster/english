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

type Actual = Omit<Observation, "duplicateKeys"> & { duplicateKeyCount: number };
type Expected = Partial<Actual>;
type EvidenceClass = "AFFIRMATIVE_MULTIPLICITY" | "NEUTRAL_LIVENESS" | "EXACT_ACCOUNTING";
type AuditCase = {
  id: string;
  category: string;
  evidenceClass: EvidenceClass;
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
const EXPECTED_SUBJECT_SHA256 = "736911a9f5763c17ec839ed30c04e960503ab803fdd4c1b8af220a49106bb2bb";
const EXPECTED_OFFLINE_TEST_SHA256 = "30a04ca8e82fabca47f2a432a6c1182b17053f6e195ba5c9c40abb075606a4b3";

// This review imports only the exact observer. The coordinated test is never
// imported, executed, or inspected; its bytes are read once solely to bind its
// SHA-256. All oracles below were authored independently of that test.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const subject = require(SUBJECT_PATH) as {
  observeRawCandidateCardinalityV6(rawText: string): Observation;
  MAX_JSON_DEPTH_V6: number;
  MAX_JSON_NODES_V6: number;
  MAX_RAW_CANDIDATE_OBSERVATION_BYTES_V6: number;
  MAX_RAW_CANDIDATE_OBSERVATION_V6: number;
  MAX_JSON_RECOVERY_ATTEMPTS_V6: number;
};

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function exact(
  choicesObserved: number,
  fullQuestionObjectsObserved: number,
  candidateUnitsEffective: number,
  cardinalityAmbiguous: boolean,
  observationSaturated = false,
  duplicateKeyCount = 0,
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
    duplicateKeyCount,
  };
}

const quarantine = (): Expected => ({ cardinalityAmbiguous: true });
const neutral = (): Expected => exact(0, 0, 1, false);
const cases: AuditCase[] = [];
const ids = new Set<string>();

function addCase(
  id: string,
  category: string,
  evidenceClass: EvidenceClass,
  raw: string,
  expected: Expected,
  contract: string,
): void {
  if (ids.has(id)) throw new Error(`duplicate fresh audit case id: ${id}`);
  ids.add(id);
  cases.push({ id, category, evidenceClass, raw, expected, contract });
}

function question(seed: number): Record<string, unknown> {
  return {
    direction: `fresh-v3-direction-${seed}`,
    options: Array.from({ length: 5 }, (_, index) => `v3-${seed}-${index}`),
    correctAnswer: String((seed % 5) + 1),
    explanation: `fresh-v3-explanation-${seed}`,
  };
}

function choice(index: number, content: string, carrier: "message" | "delta" = "message"):
Record<string, unknown> {
  return {
    index,
    [carrier]: { role: "assistant", content },
    finish_reason: index % 2 === 0 ? "stop" : null,
  };
}

function envelope(contents: string[], carrier: "message" | "delta" = "message"): string {
  return JSON.stringify({
    id: "fresh-v3-observer-audit",
    model: "google/gemini-fresh-v3",
    provider: "Google",
    choices: contents.map((content, index) => choice(index, content, carrier)),
    usage: { prompt_tokens: 17, completion_tokens: 13, total_tokens: 30, cost: 0.002 },
  });
}

const qjson = (seed: number): string => JSON.stringify(question(seed));
const body = (value: string): string => JSON.stringify(value).slice(1, -1);
const oneProvider = envelope(["fresh-v3-one"]);
const twoChoices = envelope(["fresh-v3-left", "fresh-v3-right"]);
const twoProviderRoots = `${envelope(["fresh-v3-root-a"])} ${envelope(["fresh-v3-root-b"])}`;
const twoQuestions = `${qjson(61_001)} ${qjson(61_002)}`;
const questionsArray = JSON.stringify({ questions: [question(61_003), question(61_004)] });
const questionsMap = JSON.stringify({ questions: { west: question(61_005), east: question(61_006) } });
const providerMap = JSON.stringify({
  model: "google/gemini-fresh-v3",
  provider: "Google",
  choices: { west: choice(0, "map-west"), east: choice(1, "map-east", "delta") },
});
const messageCarrier = JSON.stringify({ message: { role: "assistant", content: twoQuestions } });
const mixedRoots = `${envelope(["fresh-v3-mixed"])} ${qjson(61_007)}`;
const positivePayloads = [
  ["two-choices", twoChoices],
  ["two-provider-roots", twoProviderRoots],
  ["two-questions", twoQuestions],
  ["questions-array", questionsArray],
  ["questions-map", questionsMap],
  ["provider-map", providerMap],
  ["message-carrier", messageCarrier],
  ["mixed-roots", mixedRoots],
] as const;

// A. Malformed JSON-string decoder: 304 independently varied affirmative cases.
const malformedPrefixes = [
  "transport-v3 ",
  "answer follows => ",
  "\ufeff",
  "```JSON\r\n",
  "~~~payload\n",
  "slashes-\\\\\\ ",
  "quote-' and math={x} ",
  "emoji-🚀-다국어 ",
  "line-1\nline-2\t",
  `${String.fromCharCode(0x1f)}control-prefix`,
  ")]}'\n",
  "<pre data-audit=v3>",
] as const;

for (const [payloadName, payload] of positivePayloads) {
  for (let index = 0; index < malformedPrefixes.length; index += 1) {
    const prefix = malformedPrefixes[index]!;
    addCase(
      `malformed-unterminated-${payloadName}-${index}`,
      "malformed-unterminated-string",
      "AFFIRMATIVE_MULTIPLICITY",
      JSON.stringify(prefix + payload).slice(0, -1),
      quarantine(),
      "An unterminated JSON string containing encoded affirmative multiplicity must recover it or globally quarantine.",
    );
  }
}

const surrogateFragments = [
  ["pair", "\\ud83d\\ude80"],
  ["lone-high", "\\ud800"],
  ["lone-low", "\\udfff"],
  ["reversed", "\\udfff\\ud800"],
  ["pair-plus-high", "\\ud83d\\ude80\\ud800"],
  ["high-plus-pair", "\\ud800\\ud83d\\ude80"],
] as const;
for (const [payloadName, payload] of positivePayloads) {
  for (const [surrogateName, fragment] of surrogateFragments) {
    addCase(
      `malformed-surrogate-${payloadName}-${surrogateName}`,
      "malformed-surrogate-boundary",
      "AFFIRMATIVE_MULTIPLICITY",
      `"surrogate-v3:${fragment}:${body(payload)}`,
      quarantine(),
      "Valid pairs, lone surrogates, and reversed surrogate escapes before an encoded affirmative payload must recover or quarantine.",
    );
  }
}

const invalidEscapes = ["\\q", "\\x", "\\v", "\\U0000", "\\u", "\\u0", "\\u00", "\\u000", "\\u0Z00", "\\9"] as const;
for (const [payloadName, payload] of positivePayloads) {
  for (let index = 0; index < invalidEscapes.length; index += 1) {
    const bad = invalidEscapes[index]!;
    const prefix = `invalid-before-${index}:`;
    addCase(
      `malformed-invalid-before-${payloadName}-${index}`,
      "malformed-invalid-escape-before",
      "AFFIRMATIVE_MULTIPLICITY",
      `"${body(prefix)}${bad}${body(payload)}"`,
      quarantine(),
      "Invalid or incomplete escapes before an escaped candidate payload cannot erase affirmative multiplicity.",
    );
    addCase(
      `malformed-invalid-after-${payloadName}-${index}`,
      "malformed-invalid-escape-after",
      "AFFIRMATIVE_MULTIPLICITY",
      `"${body(payload)}${bad}${body(`:tail-${index}`)}"`,
      quarantine(),
      "Invalid or incomplete escapes after an escaped candidate payload cannot retroactively erase it.",
    );
  }
}

for (const [payloadName, payload] of positivePayloads) {
  const encoded = body(payload);
  const positions = [
    Math.max(1, Math.floor(encoded.length * 0.12)),
    Math.max(1, Math.floor(encoded.length * 0.29)),
    Math.max(1, Math.floor(encoded.length * 0.47)),
    Math.max(1, Math.floor(encoded.length * 0.63)),
    Math.max(1, Math.floor(encoded.length * 0.81)),
    Math.max(1, encoded.length - 2),
  ];
  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index]!;
    const broken = `${encoded.slice(0, position)}\\q${encoded.slice(position)}`;
    addCase(
      `malformed-invalid-inside-${payloadName}-${index}`,
      "malformed-invalid-escape-inside",
      "AFFIRMATIVE_MULTIPLICITY",
      `"${broken}`,
      quarantine(),
      "An invalid escape inserted inside an encoded affirmative payload must not yield an ordinary single-candidate state.",
    );
  }
}

// B. Nested quoted transport wrappers and every requested decoded prefix: 272 cases.
const decodedPrefixes = [
  " ", "\t\r\n", "\ufeff", " \ufeff ", "result-v3:\n", "```json\n", "~~~JSON\r\n", ",", ":", ")]}'\n",
] as const;
for (const [payloadName, payload] of positivePayloads.slice(0, 4)) {
  for (let prefixIndex = 0; prefixIndex < 6; prefixIndex += 1) {
    for (let depth = 1; depth <= 8; depth += 1) {
      let nested = decodedPrefixes[prefixIndex]! + payload;
      for (let layer = 0; layer < depth; layer += 1) nested = JSON.stringify(nested);
      addCase(
        `nested-quoted-${payloadName}-prefix${prefixIndex}-depth${depth}`,
        "nested-quoted-wrapper",
        "AFFIRMATIVE_MULTIPLICITY",
        `invalid-raw-prefix-v3!${nested}`,
        quarantine(),
        "Bounded nested JSON-string wrappers behind an invalid raw prefix must recover multiplicity or quarantine.",
      );
    }
  }
}
for (const [payloadName, payload] of positivePayloads) {
  for (let index = 0; index < decodedPrefixes.length; index += 1) {
    addCase(
      `complete-quoted-prefix-${payloadName}-${index}`,
      "complete-quoted-prefix",
      "AFFIRMATIVE_MULTIPLICITY",
      JSON.stringify(decodedPrefixes[index]! + payload),
      quarantine(),
      "A complete top-level quoted output beginning with whitespace, BOM, prose, fence, comma, or colon must not hide multiplicity.",
    );
  }
}

// C. Unicode-escaped structure/quotes and backslash-parity recovery: 88 cases.
function encodeJsonSymbols(value: string, variant: number): string {
  const symbolMap: Record<string, string> = {
    "{": "\\u007b", "}": "\\u007d", "[": "\\u005b", "]": "\\u005d", '"': "\\u0022",
  };
  let encoded = body(value);
  if (variant % 3 === 0) encoded = encoded.replace(/[{}\[\]]/gu, (token) => symbolMap[token]!);
  if (variant % 3 === 1) encoded = encoded.replace(/\\"/gu, "\\u0022");
  if (variant % 3 === 2) {
    encoded = encoded
      .replace(/[{}\[\]]/gu, (token) => symbolMap[token]!)
      .replace(/\\"/gu, "\\u0022");
  }
  if (variant >= 3) encoded = encoded.replace(/\\u/gu, "\\\\u");
  return encoded;
}
for (const [payloadName, payload] of positivePayloads) {
  for (let variant = 0; variant < 6; variant += 1) {
    addCase(
      `unicode-encoded-hint-${payloadName}-${variant}`,
      "candidate-hint-false-negative",
      "AFFIRMATIVE_MULTIPLICITY",
      `"unicode-v3:${encodeJsonSymbols(payload, variant)}`,
      quarantine(),
      "Unicode-escaped or double-escaped structural candidate evidence in a malformed string must recover or quarantine.",
    );
  }
}
for (let slashCount = 0; slashCount < 10; slashCount += 1) {
  for (let payloadIndex = 0; payloadIndex < 4; payloadIndex += 1) {
    const [payloadName, payload] = positivePayloads[payloadIndex]!;
    addCase(
      `raw-quote-backslash-parity-${slashCount}-${payloadName}`,
      "quote-backslash-parity",
      "AFFIRMATIVE_MULTIPLICITY",
      `invalid-v3!${"\\".repeat(slashCount)}${JSON.stringify(payload)}`,
      quarantine(),
      "Odd and even raw backslash runs before a quoted candidate wrapper must not create a multiplicity blind spot.",
    );
  }
}

// D. Later-root recovery, monotonic/disjoint accounting, and mixed lineages: 110 cases.
const rawGaps = [
  "\ufeff", "<gap-v3>", "~~~\n", ",", ":", "tru ", "1e ", "\"\\q\"", String.fromCharCode(0), "[broken",
] as const;
for (let index = 0; index < rawGaps.length; index += 1) {
  const gap = rawGaps[index]!;
  addCase(`later-root-prefix-${index}`, "raw-later-root", "AFFIRMATIVE_MULTIPLICITY",
    gap + twoChoices, quarantine(), "A later two-choice root after malformed bytes must remain visible or quarantined.");
  addCase(`later-root-middle-${index}`, "raw-later-root", "AFFIRMATIVE_MULTIPLICITY",
    `${oneProvider}${gap}${oneProvider}`, quarantine(), "Two provider roots separated by malformed bytes must remain disjoint.");
  addCase(`later-root-neutral-first-${index}`, "raw-later-root", "AFFIRMATIVE_MULTIPLICITY",
    `{"trace":"fresh-v3-${index}"}${gap}${twoQuestions}`, quarantine(), "A neutral first root and later two-question payload cannot collapse to an ordinary state.");
  addCase(`later-root-quoted-${index}`, "raw-later-root", "AFFIRMATIVE_MULTIPLICITY",
    `${gap}${JSON.stringify(decodedPrefixes[index]! + twoChoices)}`, quarantine(), "Malformed raw bytes before a prefixed quoted provider output must recover or quarantine.");
}
for (const count of [2, 3, 5, 8, 13, 21, 34, 55, 89, 144]) {
  const roots = Array.from({ length: count }, (_, index) =>
    envelope([`disjoint-v3-${count}-${index}`])).join(indexedGap(count));
  addCase(
    `disjoint-provider-roots-${count}`,
    "disjoint-root-accounting",
    "EXACT_ACCOUNTING",
    roots,
    exact(count, 0, count, true),
    "Complete provider roots separated by an invalid constant gap are parsed as disjoint lineages exactly once.",
  );
}

function indexedGap(seed: number): string {
  return seed % 2 === 0 ? "<invalid-v3-gap>" : "\ufeff,broken:";
}

for (let variant = 0; variant < 30; variant += 1) {
  const count = 2 + (variant % 5);
  const carrier: "message" | "delta" = variant % 2 === 0 ? "message" : "delta";
  const contents = Array.from({ length: count }, (_, index) =>
    index % 2 === 0 ? qjson(63_000 + variant * 10 + index) : `opaque-v3-${variant}-${index}`);
  addCase(
    `typed-provider-mixed-${variant}`,
    "typed-mixed-lineage",
    "EXACT_ACCOUNTING",
    envelope(contents, carrier),
    exact(count, Math.ceil(count / 2), count, true),
    "A typed provider choices array retains exactly one provider lineage per choice and one decoded question on alternating entries.",
  );
}
for (let variant = 0; variant < 30; variant += 1) {
  const count = 2 + (variant % 5);
  const values = Array.from({ length: count }, (_, index) => {
    if (index % 3 === 0) return question(64_000 + variant * 10 + index);
    if (index % 3 === 1) return qjson(64_500 + variant * 10 + index);
    return `malformed-explicit-v3-${variant}-${index}`;
  });
  const container = variant % 2 === 0
    ? values
    : Object.fromEntries(values.map((value, index) => [`slot-v3-${index}`, value]));
  addCase(
    `typed-questions-mixed-${variant}`,
    "typed-mixed-lineage",
    "EXACT_ACCOUNTING",
    JSON.stringify({ questions: container }),
    exact(0, count, count, true),
    "Every typed questions element or map value is exactly one lineage even when its representation is mixed or malformed.",
  );
}

// E. Semantic-leaf, arbitrary non-provider, HTML/Cloudflare, and quote-storm liveness: 124 cases.
for (let index = 0; index < 30; index += 1) {
  const semantic = {
    ...question(65_000 + index),
    explanation: `Use {x:[x>0]}; code=if (x) { return [a,b]; }; math f(x)={x^2}; html=<div data-i="${index}">[ok]</div>`,
    keyPoints: [
      `quoted neutral JSON ${JSON.stringify({ trace: index, content: "not-output" })}`,
      `code fence \`\`\`json\n${JSON.stringify({ options: ["rubric-only"] })}\n\`\`\``,
      `literal words "questions": and "choices": without a carrier`,
    ],
    metadata: {
      content: qjson(66_000 + index),
      code: `const choices = [${index}, ${index + 1}];`,
      html: `<script>window.trace={"ray":"v3-${index}"}</script>`,
    },
    wrongOptionExplanations: { A: qjson(66_500 + index) },
  };
  addCase(
    `semantic-leaf-question-v3-${index}`,
    "semantic-leaf-liveness",
    "EXACT_ACCOUNTING",
    JSON.stringify(semantic),
    exact(0, 1, 1, false),
    "JSON/code/math/HTML-like semantic leaves inside one established question cannot become extra candidates.",
  );
  if (index < 20) {
    addCase(
      `semantic-leaf-provider-v3-${index}`,
      "semantic-leaf-liveness",
      "EXACT_ACCOUNTING",
      envelope([JSON.stringify(semantic)]),
      exact(1, 1, 1, false),
      "One provider choice carrying one semantic question remains exactly one lineage despite JSON-looking leaves.",
    );
  }
}

for (let index = 0; index < 36; index += 1) {
  const arbitrary = {
    kind: `telemetry-fragment-v3-${index}`,
    content: `not model output v3: ${decodedPrefixes[index % decodedPrefixes.length]}${twoQuestions}`,
    output_text: `diagnostic output_text v3: ${twoChoices}`,
    text: `literal code v3: {"questions":[1,2]} // diagnostic only`,
    nested: { payload: { note: `metadata only v3: ${qjson(67_000 + index)}`, options: ["trace"] } },
  };
  addCase(
    `arbitrary-non-provider-content-v3-${index}`,
    "arbitrary-non-provider-liveness",
    "NEUTRAL_LIVENESS",
    JSON.stringify(arbitrary),
    neutral(),
    "Content/text/output_text fields outside a provider/message/delta boundary are inert even when their prose contains candidate-shaped strings.",
  );
}

for (let index = 0; index < 12; index += 1) {
  const fragment = surrogateFragments[index % surrogateFragments.length]![1];
  addCase(
    `neutral-surrogate-string-v3-${index}`,
    "surrogate-neutral-liveness",
    "NEUTRAL_LIVENESS",
    `"neutral-surrogate-v3-${index}:${fragment}:no-candidate"`,
    neutral(),
    "Valid surrogate pairs and lone surrogate code units without a candidate surface remain neutral and live.",
  );
}

const neutralBodies = [
  "<!doctype html><html><body><h1>502</h1><script>window.trace={\"ray\":\"v3\",\"retry\":true}</script></body></html>",
  "\ufeff<!DOCTYPE html><title>Cloudflare challenge</title><div id=cf>Please wait...</div>",
  ")]}'\n{\"error\":{\"message\":\"denied\",\"retry_after\":30}}",
  JSON.stringify({ error: { type: "rate_limit", message: "choices unavailable", code: 429 } }),
  JSON.stringify({ cfRay: "fresh-v3", success: false, errors: [{ code: 1000, message: "edge [trace] {retry}" }] }),
  "upstream connect error: reset before headers; trace={edge:[a,b]}",
  "<pre>{\"trace\":1,\"content\":\"diagnostic only\"}</pre>",
  "service unavailable // code: if (retry) { wait([1,2]); }",
] as const;
for (let index = 0; index < 24; index += 1) {
  addCase(
    `neutral-html-cloudflare-v3-${index}`,
    "neutral-html-cloudflare-liveness",
    "NEUTRAL_LIVENESS",
    neutralBodies[index % neutralBodies.length]!,
    neutral(),
    "HTML, Cloudflare, and upstream error bodies without affirmative candidate containers remain live neutral shortages.",
  );
}
for (let index = 0; index < 14; index += 1) {
  const quote = JSON.stringify(`neutral-v3-${index}-{trace}-[metric]-\\-\"`);
  const storm = `invalid-prefix-v3!${Array.from({ length: 500 + index * 250 }, () => quote).join(":")}`;
  addCase(
    `neutral-quote-storm-v3-${index}`,
    "quote-storm-liveness",
    "NEUTRAL_LIVENESS",
    storm,
    neutral(),
    "A large storm of complete neutral JSON strings is skipped monotonically without consuming recovery attempts or inventing candidates.",
  );
}
const oneStructuralNeutralQuote = JSON.stringify("neutral-v3-{trace}-no-candidate");
addCase(
  "neutral-quote-storm-recovery-exact-4096",
  "quote-storm-exact-boundary",
  "NEUTRAL_LIVENESS",
  `invalid-prefix-v3!${Array.from({ length: 4_096 }, () => oneStructuralNeutralQuote).join(":")}`,
  neutral(),
  "Exactly 4,096 complete neutral quoted strings containing one prose brace each must stay live without consuming candidate-recovery capacity.",
);
addCase(
  "neutral-quote-storm-recovery-plus-one-4097",
  "quote-storm-exact-boundary",
  "NEUTRAL_LIVENESS",
  `invalid-prefix-v3!${Array.from({ length: 4_097 }, () => oneStructuralNeutralQuote).join(":")}`,
  neutral(),
  "A 4,097th complete neutral quoted string must still stay live; neutral strings are not recovery attempts.",
);

// F. Fresh byte/node/depth/candidate/recovery boundaries and linear probes: 26 cases.
const byteCap = subject.MAX_RAW_CANDIDATE_OBSERVATION_BYTES_V6;
const nodeCap = subject.MAX_JSON_NODES_V6;
const depthCap = subject.MAX_JSON_DEPTH_V6;
const candidateCap = subject.MAX_RAW_CANDIDATE_OBSERVATION_V6;
const recoveryCap = subject.MAX_JSON_RECOVERY_ATTEMPTS_V6;

function jsonStringAtUtf8Bytes(totalBytes: number, token: string): string {
  const tokenBytes = Buffer.byteLength(token, "utf8");
  const bodyBudget = totalBytes - 2;
  const repeats = Math.floor(bodyBudget / tokenBytes);
  const remainder = bodyBudget - repeats * tokenBytes;
  const raw = JSON.stringify(token.repeat(repeats) + "x".repeat(remainder));
  if (Buffer.byteLength(raw, "utf8") !== totalBytes) throw new Error("UTF-8 boundary constructor drift");
  return raw;
}
for (const [name, token] of [["latin2", "é"], ["hangul3", "한"], ["emoji4", "🚀"]] as const) {
  addCase(`byte-cap-exact-${name}`, "fresh-exact-boundary", "NEUTRAL_LIVENESS",
    jsonStringAtUtf8Bytes(byteCap, token), neutral(), "A multibyte neutral JSON string at exactly 2 MiB remains live and unsaturated.");
  addCase(`byte-cap-plus-one-${name}`, "fresh-exact-boundary", "EXACT_ACCOUNTING",
    `${jsonStringAtUtf8Bytes(byteCap, token)}x`, exact(0, 0, 1, true, true), "One raw byte above 2 MiB saturates globally.");
}
addCase("byte-cap-invalid-neutral-exact", "fresh-exact-boundary", "NEUTRAL_LIVENESS",
  "z".repeat(byteCap), neutral(), "An invalid but neutral raw body exactly at 2 MiB is scanned once without saturation.");
addCase("byte-cap-invalid-neutral-plus-one", "fresh-exact-boundary", "EXACT_ACCOUNTING",
  "z".repeat(byteCap + 1), exact(0, 0, 1, true, true), "An invalid raw body one byte above 2 MiB saturates globally.");

const exactNodeObject = `{${Array.from({ length: nodeCap - 1 }, (_, index) => `"n${index}":0`).join(",")}}`;
const overNodeObject = `{${Array.from({ length: nodeCap }, (_, index) => `"n${index}":0`).join(",")}}`;
addCase("node-cap-object-exact", "fresh-exact-boundary", "NEUTRAL_LIVENESS", exactNodeObject, neutral(),
  "One object root plus nodeCap-1 scalar values is exactly the node cap.");
addCase("node-cap-object-plus-one", "fresh-exact-boundary", "EXACT_ACCOUNTING", overNodeObject,
  exact(0, 0, 1, true, true), "One object root plus nodeCap scalar values exceeds the node cap by one.");

function alternatingDepth(containers: number): string {
  let open = "";
  let close = "";
  for (let index = 0; index < containers; index += 1) {
    if (index % 2 === 0) { open += '{"x":'; close = `}${close}`; }
    else { open += "["; close = `]${close}`; }
  }
  return `${open}0${close}`;
}
addCase("depth-cap-alternating-exact", "fresh-exact-boundary", "NEUTRAL_LIVENESS",
  alternatingDepth(depthCap), neutral(), "Alternating object/array containers ending at the exact parser depth remain live.");
addCase("depth-cap-alternating-plus-one", "fresh-exact-boundary", "EXACT_ACCOUNTING",
  alternatingDepth(depthCap + 1), exact(0, 0, 1, true, true), "One alternating container beyond the depth cap saturates globally.");

const exactQuestionCount = candidateCap - 1;
addCase("candidate-cap-questions-1000", "fresh-exact-boundary", "EXACT_ACCOUNTING",
  JSON.stringify({ questions: Array.from({ length: exactQuestionCount }, () => ({})) }),
  exact(0, exactQuestionCount, exactQuestionCount, true), "Exactly 1,000 explicit question lineages remain representable without saturation.");
addCase("candidate-cap-questions-1001", "fresh-exact-boundary", "EXACT_ACCOUNTING",
  JSON.stringify({ questions: Array.from({ length: candidateCap }, () => ({})) }),
  exact(0, candidateCap, candidateCap, true, true), "The 1,001st explicit question reaches the overflow sentinel.");

for (const [name, invalidRoot] of [["array", "[x"], ["object", "{x"]] as const) {
  addCase(`recovery-cap-${name}-exact-neutral`, "fresh-recovery-boundary", "NEUTRAL_LIVENESS",
    `!${invalidRoot.repeat(recoveryCap)}`, neutral(), "Exactly 4,096 failed recovery starts stay live and unsaturated.");
  addCase(`recovery-cap-${name}-plus-one-neutral`, "fresh-recovery-boundary", "EXACT_ACCOUNTING",
    `!${invalidRoot.repeat(recoveryCap + 1)}`, exact(0, 0, 1, true, true), "The 4,097th failed recovery start saturates globally.");
  addCase(`recovery-cap-${name}-4095-provider`, "fresh-recovery-boundary", "EXACT_ACCOUNTING",
    `!${invalidRoot.repeat(recoveryCap - 1)}${oneProvider}`, exact(1, 0, 1, true), "A provider at recovery attempt 4,096 remains observable.");
  addCase(`recovery-cap-${name}-4096-provider`, "fresh-recovery-boundary", "EXACT_ACCOUNTING",
    `!${invalidRoot.repeat(recoveryCap)}${oneProvider}`, exact(0, 0, 1, true, true), "A provider beyond the recovery cap yields global quarantine.");
}

const linearProbeSizes = [128 * 1024, 256 * 1024, 512 * 1024, 1024 * 1024];
for (const size of linearProbeSizes) {
  addCase(`linear-prefix-provider-${size}`, "linear-scan-probe", "EXACT_ACCOUNTING",
    `${"L".repeat(size - Buffer.byteLength(oneProvider, "utf8"))}${oneProvider}`,
    exact(1, 0, 1, true), "A later provider root behind a large neutral prefix is recovered once with no earlier-span duplication.");
}

if (cases.length < 600) throw new Error(`fresh matrix too small: ${cases.length}`);
if (cases.filter((entry) => entry.evidenceClass === "AFFIRMATIVE_MULTIPLICITY").length < 500) {
  throw new Error("fresh affirmative multiplicity matrix too small");
}
if (cases.filter((entry) => entry.evidenceClass === "NEUTRAL_LIVENESS").length < 70) {
  throw new Error("fresh neutral liveness matrix too small");
}

const subjectBytesBefore = readFileSync(SUBJECT_PATH);
const subjectShaBefore = sha256(subjectBytesBefore);
if (subjectShaBefore !== EXPECTED_SUBJECT_SHA256) throw new Error(`strict observer drift: ${subjectShaBefore}`);
const offlineTestSha256 = sha256(readFileSync(COORDINATED_TEST_PATH));
if (offlineTestSha256 !== EXPECTED_OFFLINE_TEST_SHA256) throw new Error(`offline-test hash drift: ${offlineTestSha256}`);

const source = subjectBytesBefore.toString("utf8");
const staticRecoveryProof = {
  parserOffsetInitializations: [...source.matchAll(/this\.offset\s*=/gu)].length,
  parserOffsetIncrements: [...source.matchAll(/this\.offset\s*\+=/gu)].length,
  parserOffsetDecrements: [...source.matchAll(/this\.offset\s*(?:-=|--)/gu)].length,
  scanStartsAtPriorOffset: source.includes("for (let offset = Math.max(0, fromOffset); offset < source.length; offset += 1)"),
  recoveryAdvancesMonotonically: source.includes("recoveryOffset = Math.max(recoveryStart + 1, recovered.endOffset)"),
  malformedDecoderAdvances: source.includes("function tolerantDecodeMalformedJsonStringV6") &&
    source.includes("offset += 2") && source.includes("offset += 6"),
  attemptCapBound: source.includes("if (recoveryAttempts >= MAX_JSON_RECOVERY_ATTEMPTS_V6)"),
  byteExpansionBound: source.includes("this.budget.expandedUtf8Bytes > MAX_RAW_CANDIDATE_OBSERVATION_BYTES_V6"),
};
if (staticRecoveryProof.parserOffsetInitializations !== 1 ||
    staticRecoveryProof.parserOffsetIncrements < 10 ||
    staticRecoveryProof.parserOffsetDecrements !== 0 ||
    !staticRecoveryProof.scanStartsAtPriorOffset ||
    !staticRecoveryProof.recoveryAdvancesMonotonically ||
    !staticRecoveryProof.malformedDecoderAdvances ||
    !staticRecoveryProof.attemptCapBound ||
    !staticRecoveryProof.byteExpansionBound) {
  throw new Error("static monotonic/bounded recovery proof failed");
}

type Failure = {
  id: string;
  category: string;
  evidenceClass: EvidenceClass;
  contract: string;
  rawSha256: string;
  rawBytes: number;
  rawPreview: string;
  expected: Expected;
  actual: Actual;
  mismatches: string[];
};
const failures: Failure[] = [];
const categoryCounts: Record<string, number> = {};
const categoryFailures: Record<string, number> = {};
const evidenceCounts: Record<EvidenceClass, number> = {
  AFFIRMATIVE_MULTIPLICITY: 0,
  NEUTRAL_LIVENESS: 0,
  EXACT_ACCOUNTING: 0,
};
const evidenceFailures: Record<EvidenceClass, number> = {
  AFFIRMATIVE_MULTIPLICITY: 0,
  NEUTRAL_LIVENESS: 0,
  EXACT_ACCOUNTING: 0,
};
const startedAt = process.hrtime.bigint();
const perCaseDurationsMs: Array<{ id: string; durationMs: number }> = [];

for (const auditCase of cases) {
  categoryCounts[auditCase.category] = (categoryCounts[auditCase.category] ?? 0) + 1;
  evidenceCounts[auditCase.evidenceClass] += 1;
  const caseStart = process.hrtime.bigint();
  const observed = subject.observeRawCandidateCardinalityV6(auditCase.raw);
  const durationMs = Number(process.hrtime.bigint() - caseStart) / 1_000_000;
  perCaseDurationsMs.push({ id: auditCase.id, durationMs });
  const actual: Actual = {
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
    const actualValue = actual[key as keyof Actual];
    if (actualValue !== expectedValue) mismatches.push(`${key}: expected=${expectedValue} actual=${actualValue}`);
  }
  if (!Number.isInteger(actual.choicesObserved) || actual.choicesObserved < 0) mismatches.push("choicesObserved invariant");
  if (!Number.isInteger(actual.fullQuestionObjectsObserved) || actual.fullQuestionObjectsObserved < 0) mismatches.push("questions invariant");
  if (!Number.isInteger(actual.candidateUnitsEffective) || actual.candidateUnitsEffective < 1) mismatches.push("units invariant");
  if (actual.choiceCardinalityDrift !== (actual.choicesObserved !== 1)) mismatches.push("choiceCardinalityDrift invariant");
  if (actual.choiceCardinalityShortage !== (actual.choicesObserved < 1)) mismatches.push("choiceCardinalityShortage invariant");
  if (actual.choiceCardinalityExcess !== (actual.choicesObserved > 1)) mismatches.push("choiceCardinalityExcess invariant");
  if (actual.observationSaturated && !actual.cardinalityAmbiguous) mismatches.push("saturation must quarantine");
  if (actual.candidateUnitsEffective > 1 && !actual.cardinalityAmbiguous) mismatches.push("multiplicity must quarantine");
  if (mismatches.length > 0) {
    categoryFailures[auditCase.category] = (categoryFailures[auditCase.category] ?? 0) + 1;
    evidenceFailures[auditCase.evidenceClass] += 1;
    failures.push({
      id: auditCase.id,
      category: auditCase.category,
      evidenceClass: auditCase.evidenceClass,
      contract: auditCase.contract,
      rawSha256: sha256(auditCase.raw),
      rawBytes: Buffer.byteLength(auditCase.raw, "utf8"),
      rawPreview: auditCase.raw.length <= 360 ? auditCase.raw : `${auditCase.raw.slice(0, 357)}...`,
      expected: auditCase.expected,
      actual,
      mismatches,
    });
  }
}

const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
const linearProbeTimings = perCaseDurationsMs.filter((entry) => entry.id.startsWith("linear-prefix-provider-"));
const maxCase = perCaseDurationsMs.reduce((left, right) => right.durationMs > left.durationMs ? right : left);
const subjectShaAfter = sha256(readFileSync(SUBJECT_PATH));
if (subjectShaAfter !== subjectShaBefore) throw new Error("strict observer changed during fresh audit");

const result = {
  schemaVersion: "campaign-v6-observer-independent-fresh-result-v3",
  verdict: failures.length === 0 ? "PASS_NO_BLOCKERS" : "FAIL_BLOCKERS",
  authority: "NONE",
  scope: "OBSERVER_ONLY",
  authorizesV6: false,
  subjectSha256: subjectShaAfter,
  coordinatedOfflineTestSha256: offlineTestSha256,
  totalCases: cases.length,
  passingCases: cases.length - failures.length,
  failingCases: failures.length,
  categoryCounts,
  categoryFailures,
  evidenceCounts,
  evidenceFailures,
  exactFullOutputCases: cases.filter((entry) => Object.keys(entry.expected).length === 9).length,
  safetyPredicateCases: cases.filter((entry) => Object.keys(entry.expected).length < 9).length,
  boundsObserved: { byteCap, nodeCap, depthCap, candidateCap, recoveryCap },
  executionTelemetry: {
    elapsedMs: Number(elapsedMs.toFixed(3)),
    maxCase: { id: maxCase.id, durationMs: Number(maxCase.durationMs.toFixed(3)) },
    linearProbeTimings: linearProbeTimings.map((entry) => ({
      id: entry.id,
      durationMs: Number(entry.durationMs.toFixed(3)),
    })),
  },
  staticRecoveryProof,
  matrixFingerprintSha256: sha256(JSON.stringify(cases.map((entry) => ({
    id: entry.id,
    category: entry.category,
    evidenceClass: entry.evidenceClass,
    contract: entry.contract,
    rawSha256: sha256(entry.raw),
    expected: entry.expected,
  })))),
  failureFingerprintSha256: sha256(JSON.stringify(failures.map((entry) => ({
    id: entry.id,
    category: entry.category,
    evidenceClass: entry.evidenceClass,
    rawSha256: entry.rawSha256,
    expected: entry.expected,
    actual: entry.actual,
    mismatches: entry.mismatches,
  })))),
  independence: {
    subjectTestsImportedOrExecuted: false,
    subjectTestsContentInspected: false,
    coordinatedTestHashReadOnly: true,
    matrixDerivedFromSubjectTests: false,
    providerCalls: 0,
    modelCalls: 0,
    networkCalls: 0,
    databaseReads: 0,
    databaseWrites: 0,
    secretReads: 0,
    privateArtifactReads: 0,
    ledgerReads: 0,
    ledgerWrites: 0,
    buildOrFreezeCommands: 0,
    liveCommands: 0,
    subjectEdits: 0,
  },
  failures,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
