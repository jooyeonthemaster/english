import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";
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
type ExactOracle = { kind: "EXACT"; value: Actual; source: "REFERENCE_SCANNER" | "HAND_CLASS" };
type QuarantineOracle = { kind: "QUARANTINE"; source: "HAND_CLASS"; affirmativeUnits: number };
type InvariantOracle = { kind: "INVARIANTS"; source: "HAND_CLASS"; quarantineRequired: boolean };
type Oracle = ExactOracle | QuarantineOracle | InvariantOracle;
type AuditCase = {
  id: string;
  category: string;
  raw: string;
  oracle: Oracle;
  byteCuts?: number[];
};

const REVIEW_DIR = path.resolve(__dirname);
const REPO_ROOT = path.resolve(REVIEW_DIR, "../../../../");
const SUBJECT_PATH = path.join(
  REPO_ROOT,
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/strict-json-observer.ts",
);
const OFFLINE_PATH = path.join(
  REPO_ROOT,
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/offline.test.ts",
);
const EXPECTED_SUBJECT = "8df2072304c3bc48873dac05889c6d22ddf313f25fa321f9e6baac69fcc1fd3a";
const EXPECTED_OFFLINE = "212dadaad0f3812c2f4c2836bf4048694f237f8aeb618937bf09cd44149f5172";

// The subject's coordinated test is not imported, executed, or inspected. Its
// bytes are read once below solely to bind this independent review to a hash.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const observer = require(SUBJECT_PATH) as {
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const subjectBefore = sha256(readFileSync(SUBJECT_PATH));
const offlineHash = sha256(readFileSync(OFFLINE_PATH));
assert(subjectBefore === EXPECTED_SUBJECT, `subject drift: ${subjectBefore}`);
assert(offlineHash === EXPECTED_OFFLINE, `offline-test drift: ${offlineHash}`);

function actualOf(value: Observation): Actual {
  return {
    choicesObserved: value.choicesObserved,
    fullQuestionObjectsObserved: value.fullQuestionObjectsObserved,
    candidateUnitsEffective: value.candidateUnitsEffective,
    choiceCardinalityDrift: value.choiceCardinalityDrift,
    choiceCardinalityShortage: value.choiceCardinalityShortage,
    choiceCardinalityExcess: value.choiceCardinalityExcess,
    cardinalityAmbiguous: value.cardinalityAmbiguous,
    observationSaturated: value.observationSaturated,
    duplicateKeyCount: value.duplicateKeys.length,
  };
}

function exactFromCounts(choices: number, questions: number): Actual {
  const units = choices + questions;
  return {
    choicesObserved: choices,
    fullQuestionObjectsObserved: questions,
    candidateUnitsEffective: Math.max(1, units),
    choiceCardinalityDrift: choices !== 1,
    choiceCardinalityShortage: choices < 1,
    choiceCardinalityExcess: choices > 1,
    cardinalityAmbiguous: units > 1,
    observationSaturated: false,
    duplicateKeyCount: 0,
  };
}

type NarrowCounts = { choices: number; questions: number };
const zeroCounts = (): NarrowCounts => ({ choices: 0, questions: 0 });
function plus(left: NarrowCounts, right: NarrowCounts): NarrowCounts {
  return { choices: left.choices + right.choices, questions: left.questions + right.questions };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeExamQuestion(value: Record<string, unknown>): boolean {
  const keys = new Set(Object.keys(value));
  const form = keys.has("direction") || keys.has("blankDesign") || keys.has("originalExpression");
  const answer = keys.has("options") || keys.has("correctAnswer") || keys.has("explanation");
  return form && answer && [...keys].filter((key) =>
    ["direction", "blankDesign", "originalExpression", "options", "correctAnswer", "explanation"].includes(key)).length >= 3;
}

function scanReferenceText(text: string, depth = 0): NarrowCounts {
  if (depth > 64) throw new Error("reference scanner depth exceeded");
  let total = zeroCounts();
  let offset = 0;
  while (offset < text.length) {
    const start = text[offset];
    if (start !== "{" && start !== "[" && start !== '"') {
      offset += 1;
      continue;
    }
    const end = completeJsonTokenEnd(text, offset);
    if (end < 0) {
      offset += 1;
      continue;
    }
    try {
      const parsed = JSON.parse(text.slice(offset, end));
      total = plus(total, countReferenceValue(parsed, depth + 1));
      offset = end;
    } catch {
      offset += 1;
    }
  }
  return total;
}

function completeJsonTokenEnd(text: string, start: number): number {
  if (text[start] === '"') {
    let escaped = false;
    for (let index = start + 1; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (escaped) {
        escaped = false;
        continue;
      }
      if (code === 0x5c) {
        escaped = true;
        continue;
      }
      if (code === 0x22) return index + 1;
      if (code < 0x20) return -1;
    }
    return -1;
  }

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const token = text[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (token === "\\") escaped = true;
      else if (token === '"') inString = false;
      continue;
    }
    if (token === '"') {
      inString = true;
      continue;
    }
    if (token === "{" || token === "[") stack.push(token);
    else if (token === "}" || token === "]") {
      const expected = token === "}" ? "{" : "[";
      if (stack.pop() !== expected) return -1;
      if (stack.length === 0) return index + 1;
    }
  }
  return -1;
}

function countReferenceValue(value: unknown, depth: number): NarrowCounts {
  if (depth > 64) throw new Error("reference value depth exceeded");
  if (typeof value === "string") return scanReferenceText(value, depth + 1);
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => plus(sum, countReferenceValue(item, depth + 1)), zeroCounts());
  }
  if (!isRecord(value)) return zeroCounts();

  const provider = Object.hasOwn(value, "choices") &&
    ["model", "provider", "usage", "id"].some((key) => Object.hasOwn(value, key));
  if (provider) {
    const choices = value.choices;
    const width = Array.isArray(choices) ? choices.length
      : isRecord(choices) ? Object.keys(choices).length
        : choices === null || choices === undefined ? 0 : 1;
    return { choices: width, questions: 0 };
  }
  if (Object.hasOwn(value, "questions")) {
    const questions = value.questions;
    if (Array.isArray(questions)) return { choices: 0, questions: questions.length };
    if (isRecord(questions)) {
      return looksLikeExamQuestion(questions)
        ? { choices: 0, questions: 1 }
        : { choices: 0, questions: Object.keys(questions).length };
    }
    return { choices: 0, questions: 1 };
  }
  if (looksLikeExamQuestion(value)) return { choices: 0, questions: 1 };

  return Object.values(value).reduce(
    (sum, item) => plus(sum, countReferenceValue(item, depth + 1)),
    zeroCounts(),
  );
}

function exam(label: string): Record<string, unknown> {
  return {
    direction: `independent-v4-${label}`,
    options: [`${label}-가`, `${label}-나`, `${label}-다`, `${label}-라`, `${label}-마`],
    correctAnswer: "3",
    explanation: `evidence-${label}`,
  };
}

function providerWire(label: string, width = 2): string {
  return JSON.stringify({
    id: `or-v4-${label}`,
    provider: "independent-lab",
    model: "independent/model-v4",
    choices: Array.from({ length: width }, (_, ordinal) => ({
      index: ordinal,
      message: { role: "assistant", content: `canary-${label}-${ordinal}` },
      finish_reason: ordinal % 2 === 0 ? "stop" : null,
    })),
    usage: { input_tokens: 29, output_tokens: 31, total_tokens: 60 },
  });
}

const cases: AuditCase[] = [];
const caseIds = new Set<string>();
function add(spec: AuditCase): void {
  if (caseIds.has(spec.id)) throw new Error(`duplicate case id: ${spec.id}`);
  caseIds.add(spec.id);
  cases.push(spec);
}

function addReference(id: string, category: string, raw: string, byteCuts?: number[]): void {
  const counts = scanReferenceText(raw);
  add({
    id,
    category,
    raw,
    oracle: { kind: "EXACT", value: exactFromCounts(counts.choices, counts.questions), source: "REFERENCE_SCANNER" },
    ...(byteCuts ? { byteCuts } : {}),
  });
}

function addHandExact(id: string, category: string, raw: string, choices: number, questions: number): void {
  add({ id, category, raw, oracle: { kind: "EXACT", value: exactFromCounts(choices, questions), source: "HAND_CLASS" } });
}

function addQuarantine(id: string, category: string, raw: string, affirmativeUnits: number): void {
  assert(affirmativeUnits >= 2, `quarantine fixture lacks affirmative multiplicity: ${id}`);
  add({ id, category, raw, oracle: { kind: "QUARANTINE", source: "HAND_CLASS", affirmativeUnits } });
}

// 1. Quotes at a raw-output boundary are not governed by an imaginary string
// begun before the response. Odd and even slash runs therefore have the same
// affirmative payload contract. 288 cases.
const parityPayloads = [
  providerWire("parity-provider"),
  JSON.stringify({ questions: [exam("parity-q-a"), exam("parity-q-b")] }),
  `${providerWire("parity-mixed", 2)} ${JSON.stringify(exam("parity-tail"))}`,
];
const parityLeads = ["edge=>", "\ufeff전송 ", "```wire\r\n"];
for (let slashes = 0; slashes < 32; slashes += 1) {
  for (let payloadIndex = 0; payloadIndex < parityPayloads.length; payloadIndex += 1) {
    for (let leadIndex = 0; leadIndex < parityLeads.length; leadIndex += 1) {
      const payload = parityPayloads[payloadIndex]!;
      const raw = `${parityLeads[leadIndex]}${"\\".repeat(slashes)}${JSON.stringify(payload)} end-${slashes}`;
      addQuarantine(
        `parity-${slashes}-${payloadIndex}-${leadIndex}`,
        "raw-boundary-backslash-parity",
        raw,
        scanReferenceText(JSON.stringify(payload)).choices + scanReferenceText(JSON.stringify(payload)).questions,
      );
    }
  }
}

// 2. A malformed but physically closed string must not consume the opening
// quote of a later root. Invalid escape forms, separators, and direct/quoted
// roots are crossed independently. 120 cases.
const malformedEscapes = ["\\q", "\\x", "\\v", "\\0", "\\u12", "\\uZ19Q"];
const gapForms = [" ", ",", ":", "\r\n---\r\n", " ]=> "];
for (let round = 0; round < 4; round += 1) {
  for (let escapeIndex = 0; escapeIndex < malformedEscapes.length; escapeIndex += 1) {
    for (let gapIndex = 0; gapIndex < gapForms.length; gapIndex += 1) {
      const payload = round % 2 === 0
        ? providerWire(`later-${round}-${escapeIndex}-${gapIndex}`)
        : JSON.stringify({ questions: [exam(`later-a-${round}-${escapeIndex}-${gapIndex}`), exam(`later-b-${round}-${escapeIndex}-${gapIndex}`)] });
      const later = round < 2 ? payload : JSON.stringify(payload);
      const raw = `"fault-${round}-${malformedEscapes[escapeIndex]}-closed"${gapForms[gapIndex]}${later}`;
      addQuarantine(`malformed-later-${round}-${escapeIndex}-${gapIndex}`, "malformed-string-later-root", raw, 2);
    }
  }
}

// 3. Complete neutral strings are indivisible tokens. Braces, brackets,
// escaped quotes, and schema-adjacent English in them cannot spend recovery
// attempts or become candidate evidence. 156 cases including cap crossings.
const neutralPhrases = [
  "trace {alpha} [beta] metric=7",
  "문장 {중립} [관찰] — 모델이라는 일반 명사",
  "escaped quote: \\\"hello\\\" and path C:\\\\tmp",
  "HTML <div data-x='{neutral}'>[copy]</div>",
  "choices are life decisions; provider is a noun; no JSON keys here",
  "数学集合 {x | x > 0} と配列 [a,b]",
];
for (let index = 0; index < 144; index += 1) {
  const count = 1 + ((index * 37) % 233);
  const tokens = Array.from({ length: count }, (_, ordinal) =>
    JSON.stringify(`${neutralPhrases[(index + ordinal) % neutralPhrases.length]} #${index}-${ordinal}`));
  addHandExact(`neutral-token-${index}`, "complete-neutral-quoted-prose", `invalid-prefix:${tokens.join(" ")}`, 0, 0);
}
for (let index = 0; index < 12; index += 1) {
  const count = 4_090 + index;
  const token = JSON.stringify(`neutral storm ${index} {trace} [metric] \\\"quoted\\\"`);
  addHandExact(`neutral-cap-crossing-${count}`, "complete-neutral-recovery-cap", `broken:${Array(count).fill(token).join(" ")}`, 0, 0);
}

// 4. Valid quoted wrappers use an independent narrow JSON scanner as oracle.
// Depth, Unicode whitespace, escaped quotes, and heterogeneous payloads are
// crossed. 240 cases.
const wrapperBases = [
  providerWire("nested-provider"),
  JSON.stringify({ questions: [exam("nested-one"), exam("nested-two")] }),
  `${providerWire("nested-mix", 2)}\n${JSON.stringify(exam("nested-three"))}`,
  JSON.stringify({ north: providerWire("nested-string-carrier", 2) }),
];
const wrapperLeads = ["", " \t\r\n", "\ufeff", "prose=>", "```json\n"];
for (let depth = 1; depth <= 12; depth += 1) {
  for (let baseIndex = 0; baseIndex < wrapperBases.length; baseIndex += 1) {
    for (let leadIndex = 0; leadIndex < wrapperLeads.length; leadIndex += 1) {
      let wrapped = wrapperBases[baseIndex]!;
      for (let layer = 0; layer < depth; layer += 1) wrapped = JSON.stringify(wrapped);
      addReference(`wrapper-${depth}-${baseIndex}-${leadIndex}`, "nested-escaped-unicode-wrapper", `${wrapperLeads[leadIndex]}${wrapped}`);
    }
  }
}

// 5. Multiple independent roots, prefix/suffix garbage, nesting punctuation,
// and non-ASCII whitespace. 240 cases.
const separators = [" ", "\r\n", ",", ":", "\n---\n", "\u00a0", " ] stray [ ", "```\n"];
for (let index = 0; index < 240; index += 1) {
  const first = index % 3 === 0 ? providerWire(`multi-a-${index}`, 2) : JSON.stringify(exam(`multi-a-${index}`));
  const second = index % 3 === 1
    ? providerWire(`multi-b-${index}`, 2)
    : JSON.stringify({ questions: [exam(`multi-b1-${index}`), exam(`multi-b2-${index}`)] });
  const third = index % 5 === 0 ? JSON.stringify(exam(`multi-c-${index}`)) : "";
  const raw = `prefix-${index}{neutral-prose}${first}${separators[index % separators.length]}${second}${third} suffix [not-json`;
  const expected = plus(scanReferenceText(first), plus(scanReferenceText(second), scanReferenceText(third)));
  addQuarantine(`multi-root-${index}`, "multiple-roots-prefix-suffix", raw, expected.choices + expected.questions);
}

// 6. Every UTF-16 truncation position of one provider response. Once the
// second choice object is physically complete the result must be quarantined;
// earlier positions still exercise determinism and all public invariants.
const truncationCore = providerWire("truncation-every-position", 2);
const secondChoiceBoundary = truncationCore.indexOf('}],"usage"') + 1;
assert(secondChoiceBoundary > 0, "second choice boundary marker missing");
for (let cut = 0; cut <= truncationCore.length; cut += 1) {
  add({
    id: `truncation-${cut}`,
    category: "truncation-every-position",
    raw: truncationCore.slice(0, cut),
    oracle: {
      kind: "INVARIANTS",
      source: "HAND_CLASS",
      quarantineRequired: cut >= secondChoiceBoundary,
    },
  });
}

// 7. Streaming transport reconstruction at UTF-8 byte splits, including
// splits inside Korean, emoji, em dash, escaped quotes, braces, and JSON keys.
// The StringDecoder reconstruction must be byte-exact and observation-exact.
const streamRaw = `${providerWire("스트림-🙂-—-\\\"quote\\\"", 2)}\n${JSON.stringify(exam("스트림-후속-漢字"))}`;
const streamBytes = Buffer.from(streamRaw, "utf8");
for (let index = 1; index <= 320; index += 1) {
  const first = 1 + ((index * 17) % (streamBytes.length - 1));
  const second = 1 + ((index * 43) % (streamBytes.length - 1));
  const cuts = [...new Set([first, second])].sort((a, b) => a - b);
  addReference(`stream-${index}`, "streaming-utf8-chunk-split", streamRaw, cuts);
}

// 8. Hand-class controls around nested braces/brackets, escaped quotes,
// Unicode whitespace, neutral arrays, and affirmative arrays. 160 cases.
const oddSpaces = ["\u2003", "\u2028", "\u2029", "\u00a0", "\t", "\r\n"];
for (let index = 0; index < 160; index += 1) {
  const level = 1 + (index % 8);
  let positive: unknown = { questions: [exam(`deep-a-${index}`), exam(`deep-b-${index}`)] };
  for (let layer = 0; layer < level; layer += 1) positive = [positive];
  const raw = `${oddSpaces[index % oddSpaces.length]}${JSON.stringify(positive)}${oddSpaces[(index + 1) % oddSpaces.length]}`;
  addReference(`nested-structural-${index}`, "nested-braces-brackets-unicode", raw);
}

// 9. Independent hard-bound controls use distinct bodies from predecessor
// matrices. 24 cases.
const byteCap = observer.MAX_RAW_CANDIDATE_OBSERVATION_BYTES_V6;
for (let index = 0; index < 8; index += 1) {
  const overflow = "가".repeat(Math.ceil((byteCap + 1 + index) / 3));
  add({
    id: `byte-overflow-${index}`,
    category: "hard-bound-controls",
    raw: overflow,
    oracle: {
      kind: "EXACT",
      source: "HAND_CLASS",
      value: {
        choicesObserved: 0,
        fullQuestionObjectsObserved: 0,
        candidateUnitsEffective: 1,
        choiceCardinalityDrift: true,
        choiceCardinalityShortage: true,
        choiceCardinalityExcess: false,
        cardinalityAmbiguous: true,
        observationSaturated: true,
        duplicateKeyCount: 0,
      },
    },
  });
}
for (let index = 0; index < 8; index += 1) {
  let deepValue: unknown = JSON.parse(providerWire(`depth-${index}`, 2));
  for (let layer = 0; layer < observer.MAX_JSON_DEPTH_V6 + 2 + index; layer += 1) deepValue = [deepValue];
  addQuarantine(`depth-overflow-${index}`, "hard-bound-controls", JSON.stringify(deepValue), 2);
}
for (let index = 0; index < 8; index += 1) {
  const width = observer.MAX_RAW_CANDIDATE_OBSERVATION_V6 + index;
  addQuarantine(`candidate-overflow-${index}`, "hard-bound-controls", providerWire(`candidate-cap-${index}`, width), width);
}

assert(cases.length >= 1_000, `fresh matrix too small: ${cases.length}`);

function reconstructUtf8(raw: string, cuts: readonly number[]): string {
  const bytes = Buffer.from(raw, "utf8");
  const decoder = new StringDecoder("utf8");
  const pieces: string[] = [];
  let offset = 0;
  for (const cut of cuts) {
    assert(cut > offset && cut < bytes.length, `invalid stream cut ${cut}/${bytes.length}`);
    pieces.push(decoder.write(bytes.subarray(offset, cut)));
    offset = cut;
  }
  pieces.push(decoder.end(bytes.subarray(offset)));
  return pieces.join("");
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function invariantFailures(actual: Actual): string[] {
  const failures: string[] = [];
  if (!Number.isSafeInteger(actual.choicesObserved) || actual.choicesObserved < 0) failures.push("choices-not-natural");
  if (!Number.isSafeInteger(actual.fullQuestionObjectsObserved) || actual.fullQuestionObjectsObserved < 0) failures.push("questions-not-natural");
  if (!Number.isSafeInteger(actual.candidateUnitsEffective) || actual.candidateUnitsEffective < 1) failures.push("units-not-positive");
  if (actual.choiceCardinalityDrift !== (actual.choicesObserved !== 1)) failures.push("drift-flag-inconsistent");
  if (actual.choiceCardinalityShortage !== (actual.choicesObserved < 1)) failures.push("shortage-flag-inconsistent");
  if (actual.choiceCardinalityExcess !== (actual.choicesObserved > 1)) failures.push("excess-flag-inconsistent");
  if (actual.candidateUnitsEffective > 1 && !actual.cardinalityAmbiguous) failures.push("multiple-units-not-ambiguous");
  if (actual.observationSaturated && !actual.cardinalityAmbiguous) failures.push("saturation-not-ambiguous");
  return failures;
}

const started = performance.now();
const results: Array<{
  id: string;
  category: string;
  rawSha256: string;
  rawUtf8Bytes: number;
  oracle: Oracle;
  actual: Actual;
  failures: string[];
}> = [];

for (const spec of cases) {
  const supplied = spec.byteCuts ? reconstructUtf8(spec.raw, spec.byteCuts) : spec.raw;
  const failures: string[] = [];
  if (supplied !== spec.raw) failures.push("stream-reconstruction-byte-drift");
  const first = actualOf(observer.observeRawCandidateCardinalityV6(supplied));
  const second = actualOf(observer.observeRawCandidateCardinalityV6(supplied));
  if (stable(first) !== stable(second)) failures.push("non-deterministic-observation");
  failures.push(...invariantFailures(first));

  if (spec.oracle.kind === "EXACT") {
    if (stable(first) !== stable(spec.oracle.value)) failures.push("exact-oracle-mismatch");
  } else if (spec.oracle.kind === "QUARANTINE") {
    if (!first.cardinalityAmbiguous) failures.push("affirmative-multiplicity-not-quarantined");
  } else if (spec.oracle.quarantineRequired && !first.cardinalityAmbiguous) {
    failures.push("truncated-known-multiplicity-not-quarantined");
  }

  results.push({
    id: spec.id,
    category: spec.category,
    rawSha256: sha256(Buffer.from(spec.raw, "utf8")),
    rawUtf8Bytes: Buffer.byteLength(spec.raw, "utf8"),
    oracle: spec.oracle,
    actual: first,
    failures,
  });
}

const elapsedMs = performance.now() - started;
const failing = results.filter((entry) => entry.failures.length > 0);
const categoryCounts = Object.fromEntries([...new Set(results.map((entry) => entry.category))].sort().map((category) => [
  category,
  results.filter((entry) => entry.category === category).length,
]));
const categoryFailures = Object.fromEntries([...new Set(failing.map((entry) => entry.category))].sort().map((category) => [
  category,
  failing.filter((entry) => entry.category === category).length,
]));
const oracleCounts = Object.fromEntries(["EXACT", "QUARANTINE", "INVARIANTS"].map((kind) => [
  kind,
  cases.filter((entry) => entry.oracle.kind === kind).length,
]));
const referenceScannerCases = cases.filter((entry) => entry.oracle.source === "REFERENCE_SCANNER").length;
const handClassCases = cases.filter((entry) => entry.oracle.source === "HAND_CLASS").length;
const distinctRawBodies = new Set(cases.map((entry) => sha256(Buffer.from(entry.raw, "utf8")))).size;
const streamScheduleCases = cases.filter((entry) => entry.byteCuts !== undefined).length;
const minimalFailures = [...new Set(failing.map((entry) => entry.category))].sort().map((category) =>
  failing.filter((entry) => entry.category === category)
    .sort((left, right) => left.rawUtf8Bytes - right.rawUtf8Bytes || left.id.localeCompare(right.id))[0]);

const matrixFingerprintSha256 = sha256(stable(cases.map((entry) => ({
  id: entry.id,
  category: entry.category,
  rawSha256: sha256(Buffer.from(entry.raw, "utf8")),
  rawUtf8Bytes: Buffer.byteLength(entry.raw, "utf8"),
  oracle: entry.oracle,
  byteCuts: entry.byteCuts ?? [],
}))));
const resultFingerprintSha256 = sha256(stable(results.map((entry) => ({
  id: entry.id,
  actual: entry.actual,
  failures: entry.failures,
}))));
const failureFingerprintSha256 = sha256(stable(failing.map((entry) => ({
  id: entry.id,
  rawSha256: entry.rawSha256,
  failures: entry.failures,
  actual: entry.actual,
}))));

const subjectAfter = sha256(readFileSync(SUBJECT_PATH));
assert(subjectAfter === subjectBefore, "subject changed during audit");

process.stdout.write(`${JSON.stringify({
  schemaVersion: "campaign-v6-observer-independent-fresh-result-v4",
  verdict: failing.length === 0 ? "PASS_NO_BLOCKERS" : "FAIL_BLOCKERS",
  authority: "NONE",
  scope: "OBSERVER_ONLY",
  authorizesV6: false,
  subjectSha256: subjectAfter,
  coordinatedOfflineTestSha256: offlineHash,
  totalCases: cases.length,
  passingCases: cases.length - failing.length,
  failingCases: failing.length,
  categoryCounts,
  categoryFailures,
  oracleCounts,
  referenceScannerCases,
  handClassCases,
  distinctRawBodies,
  streamScheduleCases,
  matrixFingerprintSha256,
  resultFingerprintSha256,
  failureFingerprintSha256,
  executionTelemetry: { elapsedMs: Number(elapsedMs.toFixed(3)) },
  boundsObserved: {
    byteCap,
    nodeCap: observer.MAX_JSON_NODES_V6,
    depthCap: observer.MAX_JSON_DEPTH_V6,
    candidateCap: observer.MAX_RAW_CANDIDATE_OBSERVATION_V6,
    recoveryCap: observer.MAX_JSON_RECOVERY_ATTEMPTS_V6,
  },
  independence: {
    subjectTestsImportedOrExecuted: false,
    subjectTestsContentInspected: false,
    coordinatedTestHashReadOnly: true,
    priorFreshGeneratorsOrFixturesCopied: false,
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
  failures: failing,
  minimalFailures,
}, null, 2)}\n`);
