export interface DuplicateJsonKeyV6 {
  objectPath: string;
  key: string;
}

export interface RawCandidateObservationV6 {
  choicesObserved: number;
  fullQuestionObjectsObserved: number;
  candidateUnitsEffective: number;
  choiceCardinalityDrift: boolean;
  choiceCardinalityShortage: boolean;
  choiceCardinalityExcess: boolean;
  cardinalityAmbiguous: boolean;
  observationSaturated: boolean;
  duplicateKeys: DuplicateJsonKeyV6[];
}

export const MAX_JSON_DEPTH_V6 = 128;
export const MAX_JSON_NODES_V6 = 50_000;
export const MAX_RAW_CANDIDATE_OBSERVATION_BYTES_V6 = 2 * 1024 * 1024;
export const MAX_RAW_CANDIDATE_OBSERVATION_V6 = 1_001;
export const MAX_JSON_RECOVERY_ATTEMPTS_V6 = 4_096;

const MAX_RECORDED_DUPLICATES_V6 = 64;
const textEncoderV6 = new TextEncoder();

type JsonNodeV6 =
  | JsonObjectNodeV6
  | JsonArrayNodeV6
  | JsonStringNodeV6
  | JsonScalarNodeV6;

interface JsonNodeBaseV6 {
  path: string;
  complete: boolean;
}

interface JsonObjectEntryV6 {
  key: string;
  value: JsonNodeV6;
}

interface JsonObjectNodeV6 extends JsonNodeBaseV6 {
  kind: "object";
  entries: JsonObjectEntryV6[];
}

interface JsonArrayNodeV6 extends JsonNodeBaseV6 {
  kind: "array";
  items: JsonNodeV6[];
}

interface JsonStringNodeV6 extends JsonNodeBaseV6 {
  kind: "string";
  value: string;
}

interface JsonScalarNodeV6 extends JsonNodeBaseV6 {
  kind: "scalar";
}

interface ObservationBudgetV6 {
  nodes: number;
  expandedUtf8Bytes: number;
  saturated: boolean;
  duplicateKeys: DuplicateJsonKeyV6[];
}

interface ParsedSequenceV6 {
  roots: JsonNodeV6[];
  partialRoot: JsonNodeV6 | null;
  failed: boolean;
  endOffset: number;
  failureOffset: number | null;
  malformedStringSpan: MalformedStringSpanV6 | null;
}

interface MalformedStringSpanV6 {
  startOffset: number;
  endOffset: number;
  closed: boolean;
}

class JsonObservationFailureV6 extends Error {
  public constructor(message: string, public readonly partial: JsonNodeV6 | null = null) {
    super(message);
  }
}

function utf8BytesV6(value: string): number {
  return textEncoderV6.encode(value).byteLength;
}

function freshBudgetV6(initialUtf8Bytes: number): ObservationBudgetV6 {
  return {
    nodes: 0,
    expandedUtf8Bytes: initialUtf8Bytes,
    saturated: initialUtf8Bytes > MAX_RAW_CANDIDATE_OBSERVATION_BYTES_V6,
    duplicateKeys: [],
  };
}

/**
 * A bounded lossless JSON parser used only for observation. Unlike JSON.parse,
 * object entries are never overwritten, so duplicate values remain available
 * to candidate accounting. On malformed input, complete descendants are kept
 * in a partial root and can still be classified without treating neutral
 * transport garbage as affirmative multiplicity.
 */
class LosslessJsonParserV6 {
  private offset: number;
  private malformedStringSpan: MalformedStringSpanV6 | null = null;

  public constructor(
    private readonly source: string,
    private readonly budget: ObservationBudgetV6,
    initialOffset = 0,
  ) {
    this.offset = Math.max(0, Math.min(initialOffset, source.length));
  }

  public parseStrict(): DuplicateJsonKeyV6[] {
    if (this.budget.saturated) throw new Error("JSON observation byte bound exceeded");
    this.white();
    const root = this.value("$", 0);
    if (!root.complete) throw new Error("JSON root is incomplete");
    this.white();
    if (this.offset !== this.source.length) throw new Error("JSON has trailing bytes");
    return [...this.budget.duplicateKeys];
  }

  public parseSequence(): ParsedSequenceV6 {
    const roots: JsonNodeV6[] = [];
    if (this.budget.saturated) {
      return {
        roots,
        partialRoot: null,
        failed: true,
        endOffset: this.offset,
        failureOffset: this.offset,
        malformedStringSpan: this.malformedStringSpan,
      };
    }
    this.white();
    while (this.offset < this.source.length) {
      try {
        const root = this.value(`$[${roots.length}]`, 0);
        roots.push(root);
        this.white();
      } catch (error) {
        const partial = error instanceof JsonObservationFailureV6 ? error.partial : null;
        return {
          roots,
          partialRoot: partial,
          failed: true,
          endOffset: this.offset,
          failureOffset: this.offset,
          malformedStringSpan: this.malformedStringSpan,
        };
      }
    }
    return {
      roots,
      partialRoot: null,
      failed: false,
      endOffset: this.offset,
      failureOffset: null,
      malformedStringSpan: null,
    };
  }

  /** Parse one recovery root without consuming a later independent root. */
  public parseOne(path: string): ParsedSequenceV6 {
    const roots: JsonNodeV6[] = [];
    if (this.budget.saturated) {
      return {
        roots,
        partialRoot: null,
        failed: true,
        endOffset: this.offset,
        failureOffset: this.offset,
        malformedStringSpan: this.malformedStringSpan,
      };
    }
    this.white();
    if (this.offset >= this.source.length) {
      return {
        roots,
        partialRoot: null,
        failed: false,
        endOffset: this.offset,
        failureOffset: null,
        malformedStringSpan: null,
      };
    }
    try {
      roots.push(this.value(path, 0));
      this.white();
      return {
        roots,
        partialRoot: null,
        failed: false,
        endOffset: this.offset,
        failureOffset: null,
        malformedStringSpan: null,
      };
    } catch (error) {
      return {
        roots,
        partialRoot: error instanceof JsonObservationFailureV6 ? error.partial : null,
        failed: true,
        endOffset: this.offset,
        failureOffset: this.offset,
        malformedStringSpan: this.malformedStringSpan,
      };
    }
  }

  private white(): void {
    while (this.offset < this.source.length && /[\u0009\u000a\u000d\u0020]/u.test(this.source[this.offset]!)) {
      this.offset += 1;
    }
  }

  private observeNode(path: string, depth: number): void {
    this.budget.nodes += 1;
    if (this.budget.nodes > MAX_JSON_NODES_V6 || depth > MAX_JSON_DEPTH_V6) {
      this.budget.saturated = true;
      throw new JsonObservationFailureV6(`JSON observation bound exceeded at ${path}`);
    }
  }

  private value(path: string, depth: number): JsonNodeV6 {
    this.observeNode(path, depth);
    this.white();
    const token = this.source[this.offset];
    if (token === "{") return this.object(path, depth + 1);
    if (token === "[") return this.array(path, depth + 1);
    if (token === '"') {
      const value = this.string();
      return { kind: "string", path, complete: true, value };
    }
    if (token === "t" && this.source.slice(this.offset, this.offset + 4) === "true") {
      this.offset += 4;
      return { kind: "scalar", path, complete: true };
    }
    if (token === "f" && this.source.slice(this.offset, this.offset + 5) === "false") {
      this.offset += 5;
      return { kind: "scalar", path, complete: true };
    }
    if (token === "n" && this.source.slice(this.offset, this.offset + 4) === "null") {
      this.offset += 4;
      return { kind: "scalar", path, complete: true };
    }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(this.source.slice(this.offset));
    if (!match) throw new JsonObservationFailureV6(`invalid JSON token at byte ${this.offset}`);
    this.offset += match[0].length;
    return { kind: "scalar", path, complete: true };
  }

  private object(path: string, depth: number): JsonObjectNodeV6 {
    const node: JsonObjectNodeV6 = { kind: "object", path, complete: false, entries: [] };
    const keys = new Set<string>();
    this.offset += 1;
    this.white();
    if (this.source[this.offset] === "}") {
      this.offset += 1;
      node.complete = true;
      return node;
    }
    while (true) {
      this.white();
      if (this.source[this.offset] !== '"') {
        throw new JsonObservationFailureV6(`JSON object key missing at byte ${this.offset}`, node);
      }
      let key: string;
      try {
        key = this.string();
      } catch (error) {
        throw new JsonObservationFailureV6(
          error instanceof Error ? error.message : String(error),
          node,
        );
      }
      const duplicate = keys.has(key);
      keys.add(key);
      if (duplicate && this.budget.duplicateKeys.length < MAX_RECORDED_DUPLICATES_V6) {
        this.budget.duplicateKeys.push({ objectPath: path, key });
      }
      this.white();
      if (this.source[this.offset] !== ":") {
        throw new JsonObservationFailureV6(`JSON object colon missing at byte ${this.offset}`, node);
      }
      this.offset += 1;
      const valuePath = `${path}.${key}`;
      try {
        node.entries.push({ key, value: this.value(valuePath, depth) });
      } catch (error) {
        if (error instanceof JsonObservationFailureV6 && error.partial) {
          node.entries.push({ key, value: error.partial });
        } else {
          // Preserve a successfully decoded key even when its value has not
          // produced a node yet. Candidate-bearing keys such as `questions`,
          // `options`, and `content` are affirmative evidence in a truncated
          // object; dropping the key would turn an unknown response into a
          // neutral transport failure.
          node.entries.push({ key, value: { kind: "scalar", path: valuePath, complete: false } });
        }
        throw new JsonObservationFailureV6(
          error instanceof Error ? error.message : String(error),
          node,
        );
      }
      this.white();
      const token = this.source[this.offset];
      if (token === "}") {
        this.offset += 1;
        node.complete = true;
        return node;
      }
      if (token !== ",") {
        throw new JsonObservationFailureV6(`JSON object separator missing at byte ${this.offset}`, node);
      }
      this.offset += 1;
    }
  }

  private array(path: string, depth: number): JsonArrayNodeV6 {
    const node: JsonArrayNodeV6 = { kind: "array", path, complete: false, items: [] };
    this.offset += 1;
    this.white();
    if (this.source[this.offset] === "]") {
      this.offset += 1;
      node.complete = true;
      return node;
    }
    let index = 0;
    while (true) {
      try {
        node.items.push(this.value(`${path}[${index}]`, depth));
      } catch (error) {
        if (error instanceof JsonObservationFailureV6 && error.partial) node.items.push(error.partial);
        throw new JsonObservationFailureV6(
          error instanceof Error ? error.message : String(error),
          node,
        );
      }
      index += 1;
      this.white();
      const token = this.source[this.offset];
      if (token === "]") {
        this.offset += 1;
        node.complete = true;
        return node;
      }
      if (token !== ",") {
        throw new JsonObservationFailureV6(`JSON array separator missing at byte ${this.offset}`, node);
      }
      this.offset += 1;
    }
  }

  private string(): string {
    const start = this.offset;
    this.offset += 1;
    while (this.offset < this.source.length) {
      const code = this.source.charCodeAt(this.offset);
      if (code === 0x22) {
        this.offset += 1;
        return JSON.parse(this.source.slice(start, this.offset)) as string;
      }
      if (code < 0x20) {
        this.recordMalformedStringSpan(start);
        throw new JsonObservationFailureV6(`unescaped JSON control at byte ${this.offset}`);
      }
      if (code === 0x5c) {
        this.offset += 1;
        const escape = this.source[this.offset];
        if (escape === "u") {
          if (!/^[a-fA-F0-9]{4}$/u.test(this.source.slice(this.offset + 1, this.offset + 5))) {
            this.recordMalformedStringSpan(start);
            throw new JsonObservationFailureV6(`invalid JSON unicode escape at byte ${this.offset}`);
          }
          this.offset += 5;
          continue;
        }
        if (!escape || !'"\\/bfnrt'.includes(escape)) {
          this.recordMalformedStringSpan(start);
          throw new JsonObservationFailureV6(`invalid JSON escape at byte ${this.offset}`);
        }
      }
      this.offset += 1;
    }
    this.recordMalformedStringSpan(start);
    throw new JsonObservationFailureV6("unterminated JSON string");
  }

  private recordMalformedStringSpan(startOffset: number): void {
    this.malformedStringSpan ??= scanMalformedStringSpanV6(this.source, startOffset);
  }
}

export function observeDuplicateJsonKeysV6(rawText: string): DuplicateJsonKeyV6[] {
  const budget = freshBudgetV6(utf8BytesV6(rawText));
  return new LosslessJsonParserV6(rawText, budget).parseStrict();
}

const QUESTION_LIKE_KEYS_V6 = new Set([
  "direction", "blankDesign", "originalExpression", "surroundingText", "options", "choices",
  "correctAnswer", "wrongOptionExplanations", "explanation", "keyPoints", "tags", "difficulty",
]);
const QUESTION_STRUCTURAL_KEYS_V6 = new Set([
  "options", "choices", "correctAnswer", "wrongOptionExplanations",
]);
const PROVIDER_ENVELOPE_EVIDENCE_KEYS_V6 = new Set([
  "id", "model", "provider", "object", "created", "usage",
]);
const PROVIDER_CHOICE_EVIDENCE_KEYS_V6 = new Set([
  "message", "delta", "text", "finish_reason", "index", "logprobs",
]);
const MODEL_OUTPUT_CARRIER_OBJECT_KEYS_V6 = new Set(["message", "delta"]);
const MODEL_OUTPUT_TEXT_KEYS_V6 = new Set(["content", "text", "output_text"]);
const QUESTION_ANSWER_CONTAINER_KEYS_V6 = new Set(["options", "choices", "wrongOptionExplanations"]);
const DIRECT_QUESTION_OBJECT_KEYS_V6 = new Set([
  "id", ...QUESTION_LIKE_KEYS_V6,
]);
const BILLING_STRUCTURAL_KEYS_V6 = new Set([
  "usage", "cost", "is_byok",
  "prompt_tokens", "completion_tokens", "total_tokens",
  "prompt_tokens_details", "completion_tokens_details",
  "cached_tokens", "reasoning_tokens",
  "cache_read_tokens", "cache_write_tokens",
]);

interface CandidateSummaryV6 {
  units: number;
  choices: number;
  questions: number;
  modelSurface: boolean;
  ambiguous: boolean;
  saturated: boolean;
}

type DecodedRootModeV6 = "GENERAL" | "QUESTION_CONTAINER" | "PROVIDER_CHOICES_CONTAINER";

function emptySummaryV6(): CandidateSummaryV6 {
  return { units: 0, choices: 0, questions: 0, modelSurface: false, ambiguous: false, saturated: false };
}

function addCappedV6(left: number, right: number, summary: CandidateSummaryV6): number {
  const total = left + right;
  if (total >= MAX_RAW_CANDIDATE_OBSERVATION_V6) {
    summary.saturated = true;
    summary.ambiguous = true;
    return MAX_RAW_CANDIDATE_OBSERVATION_V6;
  }
  return total;
}

function mergeIndependentV6(target: CandidateSummaryV6, source: CandidateSummaryV6): void {
  target.units = addCappedV6(target.units, source.units, target);
  target.choices = addCappedV6(target.choices, source.choices, target);
  target.questions = addCappedV6(target.questions, source.questions, target);
  target.modelSurface ||= source.modelSurface;
  target.ambiguous ||= source.ambiguous;
  target.saturated ||= source.saturated;
}

function uniqueKeysV6(node: JsonObjectNodeV6): Set<string> {
  return new Set(node.entries.map((entry) => entry.key));
}

function questionLikeObjectV6(node: JsonObjectNodeV6): boolean {
  const keys = uniqueKeysV6(node);
  const markers = [...keys].filter((key) => QUESTION_LIKE_KEYS_V6.has(key));
  return markers.length >= 2 && markers.some((key) => QUESTION_STRUCTURAL_KEYS_V6.has(key));
}

function isProviderChoiceObjectV6(node: JsonObjectNodeV6): boolean {
  const keys = uniqueKeysV6(node);
  return [...keys].some((key) => PROVIDER_CHOICE_EVIDENCE_KEYS_V6.has(key));
}

function arrayContainsProviderChoiceV6(node: JsonNodeV6): boolean {
  if (node.kind === "array") return node.items.some((item) => arrayContainsProviderChoiceV6(item));
  return node.kind === "object" && isProviderChoiceObjectV6(node);
}

function isProviderEnvelopeV6(node: JsonObjectNodeV6): boolean {
  if (questionLikeObjectV6(node)) return false;
  const choiceEntries = node.entries.filter((entry) => entry.key === "choices");
  if (choiceEntries.length === 0) return false;
  const keys = uniqueKeysV6(node);
  return [...keys].some((key) => PROVIDER_ENVELOPE_EVIDENCE_KEYS_V6.has(key)) ||
    choiceEntries.some((entry) => arrayContainsProviderChoiceV6(entry.value)) ||
    (!node.complete && choiceEntries.some((entry) => !entry.value.complete));
}

function duplicateGroupsV6(node: JsonObjectNodeV6): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  node.entries.forEach((entry, index) => {
    const indexes = groups.get(entry.key) ?? [];
    indexes.push(index);
    groups.set(entry.key, indexes);
  });
  return groups;
}

function applyDuplicateAmbiguityV6(
  summary: CandidateSummaryV6,
  node: JsonObjectNodeV6,
  entrySummaries: readonly CandidateSummaryV6[],
  structuralKeys: ReadonlySet<string>,
): void {
  for (const [key, indexes] of duplicateGroupsV6(node)) {
    if (indexes.length < 2) continue;
    if (structuralKeys.has(key) || BILLING_STRUCTURAL_KEYS_V6.has(key) ||
        indexes.some((index) => entrySummaries[index]?.modelSurface)) {
      summary.ambiguous = true;
    }
  }
}

interface ScannedJsonStringV6 {
  complete: boolean;
  decoded: string | null;
  endOffset: number;
}

function scanMalformedStringSpanV6(source: string, startOffset: number): MalformedStringSpanV6 {
  let offset = startOffset + 1;
  while (offset < source.length) {
    const code = source.charCodeAt(offset);
    if (code === 0x22) {
      return { startOffset, endOffset: offset + 1, closed: true };
    }
    if (code !== 0x5c) {
      offset += 1;
      continue;
    }

    const escape = source[offset + 1];
    if (!escape) break;
    if (escape === "u" && /^[a-fA-F0-9]{4}$/u.test(source.slice(offset + 2, offset + 6))) {
      offset += 6;
      continue;
    }
    // Invalid escapes still consume their introducer and following code unit
    // for span discovery. This preserves the next unescaped quote as the real
    // close without reinterpreting escaped payload quotes as boundaries.
    offset += 2;
  }
  return { startOffset, endOffset: source.length, closed: false };
}

function scanJsonStringTokenV6(source: string, startOffset: number): ScannedJsonStringV6 {
  let offset = startOffset + 1;
  while (offset < source.length) {
    const code = source.charCodeAt(offset);
    if (code === 0x22) {
      const endOffset = offset + 1;
      try {
        return {
          complete: true,
          decoded: JSON.parse(source.slice(startOffset, endOffset)) as string,
          endOffset,
        };
      } catch {
        return { complete: false, decoded: null, endOffset: offset };
      }
    }
    if (code < 0x20) return { complete: false, decoded: null, endOffset: offset };
    if (code === 0x5c) {
      const escape = source[offset + 1];
      if (escape === "u") {
        if (!/^[a-fA-F0-9]{4}$/u.test(source.slice(offset + 2, offset + 6))) {
          return { complete: false, decoded: null, endOffset: offset + 1 };
        }
        offset += 6;
        continue;
      }
      if (!escape || !'"\\/bfnrt'.includes(escape)) {
        return { complete: false, decoded: null, endOffset: offset + 1 };
      }
      offset += 2;
      continue;
    }
    offset += 1;
  }
  return { complete: false, decoded: null, endOffset: source.length };
}

function candidateStructuralHintV6(value: string): boolean {
  return /[\[{]/u.test(value) || /\\u00(?:5[bB]|7[bB])/u.test(value);
}

function candidateSemanticHintV6(value: string): boolean {
  if (!candidateStructuralHintV6(value)) return false;
  const normalized = value
    .replace(/\\+u([a-fA-F0-9]{4})/gu, (_match, digits: string) =>
      String.fromCharCode(Number.parseInt(digits, 16)))
    .replace(/\\+(?=")/gu, "");
  if (/"questions"\s*:/u.test(normalized)) return true;
  const providerChoice = /"choices"\s*:/u.test(normalized) &&
    /"(?:model|provider|usage|message|delta|index|finish_reason)"\s*:/u.test(normalized);
  if (providerChoice) return true;
  const questionMarkers = [
    "direction", "blankDesign", "originalExpression", "surroundingText", "options", "choices",
    "correctAnswer", "wrongOptionExplanations", "explanation", "keyPoints", "tags", "difficulty",
  ].filter((key) => new RegExp(`"${key}"\\s*:`, "u").test(normalized));
  return questionMarkers.length >= 2 &&
    questionMarkers.some((key) => QUESTION_STRUCTURAL_KEYS_V6.has(key));
}

function tolerantDecodeMalformedJsonStringV6(source: string, startOffset: number): string {
  const decodedParts: string[] = [];
  let offset = startOffset + 1;
  let plainStart = offset;
  while (offset < source.length) {
    const code = source.charCodeAt(offset);
    if (code === 0x22) break;
    if (code !== 0x5c) {
      offset += 1;
      continue;
    }

    decodedParts.push(source.slice(plainStart, offset));
    const escape = source[offset + 1];
    if (!escape) {
      plainStart = offset;
      break;
    }
    if (escape === "u") {
      const digits = source.slice(offset + 2, offset + 6);
      if (/^[a-fA-F0-9]{4}$/u.test(digits)) {
        decodedParts.push(String.fromCharCode(Number.parseInt(digits, 16)));
        offset += 6;
        plainStart = offset;
        continue;
      }
      // Preserve the malformed lexeme while consuming only the introducer;
      // later escaped payload bytes remain available to this single pass.
      decodedParts.push("u");
      offset += 2;
      plainStart = offset;
      continue;
    }
    let decodedEscape: string;
    switch (escape) {
      case '"': decodedEscape = '"'; break;
      case "\\": decodedEscape = "\\"; break;
      case "/": decodedEscape = "/"; break;
      case "b": decodedEscape = "\b"; break;
      case "f": decodedEscape = "\f"; break;
      case "n": decodedEscape = "\n"; break;
      case "r": decodedEscape = "\r"; break;
      case "t": decodedEscape = "\t"; break;
      default: decodedEscape = escape;
    }
    decodedParts.push(decodedEscape);
    offset += 2;
    plainStart = offset;
  }
  decodedParts.push(source.slice(plainStart, offset));
  return decodedParts.join("");
}

function isCompleteStringTokenBoundaryV6(source: string, offset: number): boolean {
  if (offset === 0) return true;
  return !/[\p{L}\p{N}_$]/u.test(source[offset - 1]!);
}

function findRecoveryRootStartV6(
  source: string,
  fromOffset: number,
  suppressQuotesBeforeOffset = -1,
): number {
  for (let offset = Math.max(0, fromOffset); offset < source.length; offset += 1) {
    const token = source[offset];
    if (token === "{" || token === "[") return offset;
    if (token === '"' && offset >= suppressQuotesBeforeOffset) {
      const scanned = scanJsonStringTokenV6(source, offset);
      if (!scanned.complete) return offset;
      if (scanned.decoded !== null && candidateSemanticHintV6(scanned.decoded)) return offset;
      if (!isCompleteStringTokenBoundaryV6(source, offset)) {
        // A stray closing quote can pair with the next root's first key quote.
        // It is not a proven neutral token, so retain bytewise brace recovery.
        continue;
      }
      // A complete neutral string is scanned once but does not consume a
      // recovery attempt or node. Skip its interior, preserving quote-storm
      // liveness while keeping the scan globally monotonic.
      offset = Math.max(offset, scanned.endOffset - 1);
    }
  }
  return -1;
}

function decodedStringMayContainJsonV6(value: string, allowInvalidPrefixRecovery: boolean): boolean {
  if (/^\s*(?:\[|\{|"|true(?:\s|$)|false(?:\s|$)|null(?:\s|$)|-?(?:0|[1-9]\d*))/u.test(value)) {
    return true;
  }
  if (!allowInvalidPrefixRecovery) return false;
  return candidateStructuralHintV6(value);
}

class CandidateLineageAnalyzerV6 {
  public constructor(private readonly budget: ObservationBudgetV6) {}

  public analyzeSequence(
    source: string,
    sequence: ParsedSequenceV6,
    wrapperDepth = 0,
  ): CandidateSummaryV6 {
    return this.analyzeParsedSequence(
      source,
      sequence,
      "GENERAL",
      wrapperDepth,
      true,
      false,
      true,
    );
  }

  private analyzeParsedSequence(
    source: string,
    sequence: ParsedSequenceV6,
    mode: DecodedRootModeV6,
    wrapperDepth: number,
    allowNakedQuestion: boolean,
    insideModelLineage: boolean,
    allowInvalidPrefixRecovery: boolean,
  ): CandidateSummaryV6 {
    const summary = emptySummaryV6();
    let rootEvidenceCount = 0;
    for (const root of sequence.roots) {
      rootEvidenceCount += 1;
      mergeIndependentV6(
        summary,
        this.decodedRootSummaryV6(
          root,
          mode,
          wrapperDepth,
          allowNakedQuestion,
          insideModelLineage,
          allowInvalidPrefixRecovery,
        ),
      );
    }
    if (sequence.partialRoot) {
      rootEvidenceCount += 1;
      mergeIndependentV6(
        summary,
        this.decodedRootSummaryV6(
          sequence.partialRoot,
          mode,
          wrapperDepth,
          allowNakedQuestion,
          insideModelLineage,
          allowInvalidPrefixRecovery,
        ),
      );
    }

    if (allowInvalidPrefixRecovery && sequence.malformedStringSpan !== null) {
      mergeIndependentV6(
        summary,
        this.analyzeMalformedStringPayloadV6(
          source,
          sequence.malformedStringSpan.startOffset,
          mode,
          wrapperDepth,
          allowNakedQuestion,
          insideModelLineage,
        ),
      );
    }

    let sequenceAnomaly = sequence.failed || rootEvidenceCount > 1;
    let recoveryOffset = sequence.failureOffset ?? sequence.endOffset;
    let suppressQuotesBeforeOffset = sequence.malformedStringSpan?.endOffset ?? -1;
    let recoveryAttempts = 0;
    while (allowInvalidPrefixRecovery && sequence.failed && !this.budget.saturated) {
      const recoveryStart = findRecoveryRootStartV6(
        source,
        recoveryOffset,
        suppressQuotesBeforeOffset,
      );
      if (recoveryStart < 0) break;
      if (recoveryAttempts >= MAX_JSON_RECOVERY_ATTEMPTS_V6) {
        this.budget.saturated = true;
        break;
      }
      recoveryAttempts += 1;
      const recovered = new LosslessJsonParserV6(source, this.budget, recoveryStart)
        .parseOne(`$recovered[${recoveryAttempts - 1}]`);
      sequenceAnomaly = true;
      for (const root of recovered.roots) {
        rootEvidenceCount += 1;
        mergeIndependentV6(
          summary,
          this.decodedRootSummaryV6(
            root,
            mode,
            wrapperDepth,
            allowNakedQuestion,
            insideModelLineage,
            allowInvalidPrefixRecovery,
          ),
        );
      }
      if (recovered.partialRoot) {
        rootEvidenceCount += 1;
        mergeIndependentV6(
          summary,
          this.decodedRootSummaryV6(
            recovered.partialRoot,
            mode,
            wrapperDepth,
            allowNakedQuestion,
            insideModelLineage,
            allowInvalidPrefixRecovery,
          ),
        );
      }
      if (recovered.malformedStringSpan !== null) {
        mergeIndependentV6(
          summary,
          this.analyzeMalformedStringPayloadV6(
            source,
            recovered.malformedStringSpan.startOffset,
            mode,
            wrapperDepth,
            allowNakedQuestion,
            insideModelLineage,
          ),
        );
        suppressQuotesBeforeOffset = Math.max(
          suppressQuotesBeforeOffset,
          recovered.malformedStringSpan.endOffset,
        );
      }

      // Every recovery iteration advances. A complete root jumps to its end.
      // A failed root resumes at the actual failure token: that token may be
      // the opening brace of a later root rejected only because a separator
      // was missing in the broken prefix. The attempted start itself is never
      // revisited, so offsets remain monotonic without hiding that later root.
      recoveryOffset = Math.max(recoveryStart + 1, recovered.endOffset);
      if (rootEvidenceCount > 1) sequenceAnomaly = true;
    }

    if ((insideModelLineage || summary.modelSurface) && sequenceAnomaly) {
      summary.ambiguous = true;
    }
    if (this.budget.saturated) {
      summary.saturated = true;
      summary.ambiguous = true;
    }
    if (summary.units > 1) summary.ambiguous = true;
    return summary;
  }

  private analyzeMalformedStringPayloadV6(
    source: string,
    startOffset: number,
    mode: DecodedRootModeV6,
    wrapperDepth: number,
    allowNakedQuestion: boolean,
    insideModelLineage: boolean,
  ): CandidateSummaryV6 {
    const summary = emptySummaryV6();
    const decoded = tolerantDecodeMalformedJsonStringV6(source, startOffset);
    if (!candidateStructuralHintV6(decoded)) return summary;

    this.budget.expandedUtf8Bytes += utf8BytesV6(decoded);
    if (wrapperDepth + 1 > MAX_JSON_DEPTH_V6 ||
        this.budget.expandedUtf8Bytes > MAX_RAW_CANDIDATE_OBSERVATION_BYTES_V6) {
      this.budget.saturated = true;
      summary.saturated = true;
      summary.ambiguous = true;
      return summary;
    }

    const sequence = new LosslessJsonParserV6(decoded, this.budget).parseSequence();
    const recovered = this.analyzeParsedSequence(
      decoded,
      sequence,
      mode,
      wrapperDepth + 1,
      allowNakedQuestion,
      insideModelLineage,
      true,
    );
    mergeIndependentV6(summary, recovered);
    if (summary.modelSurface || candidateSemanticHintV6(decoded)) summary.ambiguous = true;
    return summary;
  }

  private malformedQuestionLineageV6(ambiguous = false): CandidateSummaryV6 {
    return {
      units: 1,
      choices: 0,
      questions: 1,
      modelSurface: true,
      ambiguous,
      saturated: false,
    };
  }

  private analyzeNode(
    node: JsonNodeV6,
    wrapperDepth: number,
    allowNakedQuestion: boolean,
    insideModelLineage = false,
    allowInvalidPrefixRecovery = false,
  ): CandidateSummaryV6 {
    if (node.kind === "scalar") return emptySummaryV6();
    if (node.kind === "string") {
      return this.analyzeDecodedString(
        node,
        "GENERAL",
        wrapperDepth + 1,
        allowNakedQuestion,
        insideModelLineage,
        allowInvalidPrefixRecovery,
      );
    }
    if (node.kind === "array") {
      const summary = emptySummaryV6();
      for (const item of node.items) {
        mergeIndependentV6(
          summary,
          this.analyzeNode(
            item,
            wrapperDepth,
            allowNakedQuestion,
            insideModelLineage,
            allowInvalidPrefixRecovery,
          ),
        );
      }
      if (!node.complete && summary.modelSurface) summary.ambiguous = true;
      return summary;
    }
    if (allowNakedQuestion && questionLikeObjectV6(node)) return this.analyzeQuestionRoot(node, wrapperDepth);
    if (isProviderEnvelopeV6(node)) return this.analyzeProviderEnvelope(node, wrapperDepth);
    return this.analyzeGeneralObject(
      node,
      wrapperDepth,
      allowNakedQuestion,
      insideModelLineage,
      allowInvalidPrefixRecovery,
    );
  }

  private decodedRootSummaryV6(
    root: JsonNodeV6,
    mode: DecodedRootModeV6,
    wrapperDepth: number,
    allowNakedQuestion: boolean,
    insideModelLineage: boolean,
    allowBoundaryRecovery: boolean,
  ): CandidateSummaryV6 {
    if (mode === "QUESTION_CONTAINER") return this.analyzeQuestionContainer(root, wrapperDepth);
    if (mode === "PROVIDER_CHOICES_CONTAINER") return this.analyzeProviderChoicesContainer(root, wrapperDepth);
    if (root.kind === "string") {
      return this.analyzeDecodedString(
        root,
        "GENERAL",
        wrapperDepth + 1,
        allowNakedQuestion,
        insideModelLineage,
        allowBoundaryRecovery,
      );
    }
    // Recovery applies to the decoded boundary itself. Once a root has been
    // recovered, ordinary semantic leaf strings inside it keep the prior
    // starts-with-JSON behavior unless they are an explicit output carrier.
    return this.analyzeNode(root, wrapperDepth, allowNakedQuestion, insideModelLineage, false);
  }

  private analyzeDecodedString(
    node: JsonStringNodeV6,
    mode: DecodedRootModeV6,
    wrapperDepth: number,
    allowNakedQuestion = true,
    insideModelLineage = false,
    allowInvalidPrefixRecovery = false,
  ): CandidateSummaryV6 {
    if (!decodedStringMayContainJsonV6(node.value, allowInvalidPrefixRecovery)) return emptySummaryV6();
    const summary = emptySummaryV6();
    this.budget.expandedUtf8Bytes += utf8BytesV6(node.value);
    if (wrapperDepth > MAX_JSON_DEPTH_V6 ||
        this.budget.expandedUtf8Bytes > MAX_RAW_CANDIDATE_OBSERVATION_BYTES_V6) {
      this.budget.saturated = true;
      summary.saturated = true;
      summary.ambiguous = true;
      return summary;
    }
    const sequence = new LosslessJsonParserV6(node.value, this.budget).parseSequence();
    mergeIndependentV6(
      summary,
      this.analyzeParsedSequence(
        node.value,
        sequence,
        mode,
        wrapperDepth,
        allowNakedQuestion,
        insideModelLineage,
        allowInvalidPrefixRecovery,
      ),
    );
    if (this.budget.saturated) {
      summary.saturated = true;
      summary.ambiguous = true;
    }
    if (summary.units > 1) summary.ambiguous = true;
    return summary;
  }

  private analyzeGeneralObject(
    node: JsonObjectNodeV6,
    wrapperDepth: number,
    allowNakedQuestion: boolean,
    insideModelLineage = false,
    allowInvalidPrefixRecovery = false,
  ): CandidateSummaryV6 {
    const summary = emptySummaryV6();
    const entrySummaries: CandidateSummaryV6[] = [];
    for (const entry of node.entries) {
      let child: CandidateSummaryV6;
      if (entry.key === "questions") {
        child = this.analyzeQuestionContainer(entry.value, wrapperDepth);
      } else if (MODEL_OUTPUT_CARRIER_OBJECT_KEYS_V6.has(entry.key) && entry.value.kind === "object") {
        child = this.analyzeNode(entry.value, wrapperDepth, allowNakedQuestion, true, true);
        if (entry.value.entries.some((candidate) => MODEL_OUTPUT_TEXT_KEYS_V6.has(candidate.key))) {
          child.modelSurface = true;
        }
      } else {
        const outputTextBoundary = allowInvalidPrefixRecovery && MODEL_OUTPUT_TEXT_KEYS_V6.has(entry.key);
        child = this.analyzeNode(
          entry.value,
          wrapperDepth,
          allowNakedQuestion,
          insideModelLineage && outputTextBoundary,
          outputTextBoundary,
        );
      }
      entrySummaries.push(child);
      mergeIndependentV6(summary, child);
    }
    applyDuplicateAmbiguityV6(
      summary,
      node,
      entrySummaries,
      new Set(["questions", "message", "content"]),
    );
    if (!node.complete && summary.modelSurface) summary.ambiguous = true;
    return summary;
  }

  private analyzeQuestionRoot(node: JsonObjectNodeV6, wrapperDepth: number): CandidateSummaryV6 {
    const summary = this.malformedQuestionLineageV6(!node.complete);
    const entrySummaries: CandidateSummaryV6[] = [];
    for (const entry of node.entries) {
      let child = emptySummaryV6();
      if (entry.key === "questions") {
        child = this.analyzeQuestionContainer(entry.value, wrapperDepth);
      } else if (!QUESTION_ANSWER_CONTAINER_KEYS_V6.has(entry.key)) {
        // Once a question root is established, similarly named metadata below
        // it is not another naked question. Explicit `questions` containers
        // and independently evidenced provider envelopes remain observable.
        child = this.analyzeNode(
          entry.value,
          wrapperDepth,
          false,
          false,
          false,
        );
      }
      entrySummaries.push(child);
      mergeIndependentV6(summary, child);
    }
    applyDuplicateAmbiguityV6(
      summary,
      node,
      entrySummaries,
      new Set(["questions", "message", "content"]),
    );
    return summary;
  }

  private analyzeExplicitQuestionElement(node: JsonNodeV6, wrapperDepth: number): CandidateSummaryV6 {
    if (node.kind === "object") return this.analyzeQuestionRoot(node, wrapperDepth);
    if (node.kind === "array") {
      const nested = this.analyzeQuestionContainer(node, wrapperDepth);
      if (nested.units > 0) return nested;
      return this.malformedQuestionLineageV6(!node.complete);
    }
    if (node.kind === "string") {
      const decoded = this.analyzeDecodedString(
        node,
        "QUESTION_CONTAINER",
        wrapperDepth + 1,
        true,
        true,
        true,
      );
      if (decoded.units > 0 || decoded.ambiguous || decoded.saturated) {
        if (decoded.units === 0) {
          decoded.units = 1;
          decoded.questions = 1;
          decoded.modelSurface = true;
        }
        return decoded;
      }
      return this.malformedQuestionLineageV6(!node.complete);
    }
    return this.malformedQuestionLineageV6(!node.complete);
  }

  private analyzeQuestionContainer(node: JsonNodeV6, wrapperDepth: number): CandidateSummaryV6 {
    const summary = emptySummaryV6();
    summary.modelSurface = true;
    if (node.kind === "scalar") {
      mergeIndependentV6(summary, this.malformedQuestionLineageV6(!node.complete));
      return summary;
    }
    if (node.kind === "string") {
      if (decodedStringMayContainJsonV6(node.value, true)) {
        mergeIndependentV6(
          summary,
          this.analyzeDecodedString(
            node,
            "QUESTION_CONTAINER",
            wrapperDepth + 1,
            true,
            true,
            true,
          ),
        );
      } else {
        mergeIndependentV6(summary, this.malformedQuestionLineageV6(!node.complete));
      }
      return summary;
    }
    if (node.kind === "array") {
      for (const item of node.items) {
        mergeIndependentV6(summary, this.analyzeExplicitQuestionElement(item, wrapperDepth));
      }
      if (!node.complete) summary.ambiguous = true;
      return summary;
    }

    if (node.entries.length === 0) {
      if (!node.complete) summary.ambiguous = true;
      return summary;
    }
    const keys = uniqueKeysV6(node);
    if ([...keys].some((key) => DIRECT_QUESTION_OBJECT_KEYS_V6.has(key))) {
      mergeIndependentV6(summary, this.analyzeQuestionRoot(node, wrapperDepth));
      return summary;
    }

    const mappedEntries: CandidateSummaryV6[] = [];
    for (const entry of node.entries) {
      const child = this.analyzeExplicitQuestionElement(entry.value, wrapperDepth);
      mappedEntries.push(child);
      mergeIndependentV6(summary, child);
    }
    applyDuplicateAmbiguityV6(summary, node, mappedEntries, new Set(["questions"]));
    if (!node.complete) summary.ambiguous = true;
    return summary;
  }

  private providerChoiceLineageV6(node: JsonNodeV6, wrapperDepth: number): CandidateSummaryV6 {
    const descendant = this.analyzeNode(node, wrapperDepth, true, true, true);
    const lineage = emptySummaryV6();
    lineage.units = Math.max(1, descendant.units);
    lineage.choices = addCappedV6(1, descendant.choices, lineage);
    lineage.questions = descendant.questions;
    lineage.modelSurface = true;
    lineage.ambiguous = descendant.ambiguous || !node.complete;
    lineage.saturated = descendant.saturated;
    return lineage;
  }

  private analyzeProviderChoicesContainer(node: JsonNodeV6, wrapperDepth: number): CandidateSummaryV6 {
    const summary = emptySummaryV6();
    summary.modelSurface = true;
    if (node.kind === "scalar") {
      mergeIndependentV6(summary, this.providerChoiceLineageV6(node, wrapperDepth));
      return summary;
    }
    if (node.kind === "string") {
      if (decodedStringMayContainJsonV6(node.value, true)) {
        const decoded = this.analyzeDecodedString(
          node,
          "PROVIDER_CHOICES_CONTAINER",
          wrapperDepth + 1,
          true,
          true,
          true,
        );
        mergeIndependentV6(summary, decoded);
      } else {
        mergeIndependentV6(summary, this.providerChoiceLineageV6(node, wrapperDepth));
      }
      return summary;
    }
    if (node.kind === "array") {
      for (const item of node.items) {
        if (item.kind === "array") {
          mergeIndependentV6(summary, this.analyzeProviderChoicesContainer(item, wrapperDepth));
        } else {
          mergeIndependentV6(summary, this.providerChoiceLineageV6(item, wrapperDepth));
        }
      }
      if (!node.complete) summary.ambiguous = true;
      return summary;
    }

    if (node.entries.length === 0) {
      if (!node.complete) summary.ambiguous = true;
      return summary;
    }
    if (isProviderChoiceObjectV6(node) || questionLikeObjectV6(node)) {
      mergeIndependentV6(summary, this.providerChoiceLineageV6(node, wrapperDepth));
      return summary;
    }

    const mappedEntries: CandidateSummaryV6[] = [];
    for (const entry of node.entries) {
      const child = this.providerChoiceLineageV6(entry.value, wrapperDepth);
      mappedEntries.push(child);
      mergeIndependentV6(summary, child);
    }
    applyDuplicateAmbiguityV6(summary, node, mappedEntries, new Set(["choices"]));
    if (!node.complete) summary.ambiguous = true;
    return summary;
  }

  private analyzeProviderEnvelope(node: JsonObjectNodeV6, wrapperDepth: number): CandidateSummaryV6 {
    const summary = emptySummaryV6();
    summary.modelSurface = true;
    const entrySummaries: CandidateSummaryV6[] = [];
    for (const entry of node.entries) {
      const child = entry.key === "choices"
        ? this.analyzeProviderChoicesContainer(entry.value, wrapperDepth)
        : entry.key === "questions"
          ? this.analyzeQuestionContainer(entry.value, wrapperDepth)
          : this.analyzeNode(
            entry.value,
            wrapperDepth,
            true,
            MODEL_OUTPUT_TEXT_KEYS_V6.has(entry.key) || MODEL_OUTPUT_CARRIER_OBJECT_KEYS_V6.has(entry.key),
            MODEL_OUTPUT_TEXT_KEYS_V6.has(entry.key) || MODEL_OUTPUT_CARRIER_OBJECT_KEYS_V6.has(entry.key),
          );
      entrySummaries.push(child);
      mergeIndependentV6(summary, child);
    }
    applyDuplicateAmbiguityV6(
      summary,
      node,
      entrySummaries,
      new Set(["choices", "questions", "message", "content"]),
    );
    if (!node.complete) summary.ambiguous = true;
    return summary;
  }
}

export function observeRawCandidateCardinalityV6(rawText: string): RawCandidateObservationV6 {
  const rootBytes = utf8BytesV6(rawText);
  if (rootBytes > MAX_RAW_CANDIDATE_OBSERVATION_BYTES_V6) {
    return {
      choicesObserved: 0,
      fullQuestionObjectsObserved: 0,
      candidateUnitsEffective: 1,
      choiceCardinalityDrift: true,
      choiceCardinalityShortage: true,
      choiceCardinalityExcess: false,
      cardinalityAmbiguous: true,
      observationSaturated: true,
      duplicateKeys: [],
    };
  }

  const budget = freshBudgetV6(rootBytes);
  const sequence = new LosslessJsonParserV6(rawText, budget).parseSequence();
  const summary = new CandidateLineageAnalyzerV6(budget).analyzeSequence(rawText, sequence);
  const choicesObserved = summary.choices;
  const fullQuestionObjectsObserved = summary.questions;
  const candidateUnitsEffective = Math.max(1, summary.units);
  const observationSaturated = budget.saturated || summary.saturated;
  const cardinalityAmbiguous = observationSaturated || summary.ambiguous || candidateUnitsEffective > 1;

  return {
    choicesObserved,
    fullQuestionObjectsObserved,
    candidateUnitsEffective,
    choiceCardinalityDrift: choicesObserved !== 1,
    choiceCardinalityShortage: choicesObserved < 1,
    choiceCardinalityExcess: choicesObserved > 1,
    cardinalityAmbiguous,
    observationSaturated,
    duplicateKeys: [...budget.duplicateKeys],
  };
}
