export interface DuplicateJsonKeyV5 {
  objectPath: string;
  key: string;
}

export interface RawCandidateObservationV5 {
  choicesObserved: number;
  fullQuestionObjectsObserved: number;
  candidateUnitsEffective: number;
  choiceCardinalityDrift: boolean;
  choiceCardinalityShortage: boolean;
  choiceCardinalityExcess: boolean;
  cardinalityAmbiguous: boolean;
  observationSaturated: boolean;
  duplicateKeys: DuplicateJsonKeyV5[];
}

const MAX_JSON_DEPTH_V5 = 128;
const MAX_RECORDED_DUPLICATES_V5 = 64;
export const MAX_RAW_CANDIDATE_OBSERVATION_V5 = 1_001;

class StrictJsonObserverV5 {
  private offset = 0;
  private readonly duplicates: DuplicateJsonKeyV5[] = [];

  public constructor(private readonly source: string) {}

  public parse(): DuplicateJsonKeyV5[] {
    this.white();
    this.value("$", 0);
    this.white();
    if (this.offset !== this.source.length) throw new Error("JSON has trailing bytes");
    return this.duplicates;
  }

  public parseSequence(): {
    completedTopLevelValues: number;
    failed: boolean;
    duplicateKeys: DuplicateJsonKeyV5[];
  } {
    let completedTopLevelValues = 0;
    this.white();
    while (this.offset < this.source.length) {
      try {
        this.value(`$[${completedTopLevelValues}]`, 0);
        completedTopLevelValues += 1;
        this.white();
      } catch {
        return {
          completedTopLevelValues,
          failed: true,
          duplicateKeys: [...this.duplicates],
        };
      }
    }
    return {
      completedTopLevelValues,
      failed: false,
      duplicateKeys: [...this.duplicates],
    };
  }

  private white(): void {
    while (this.offset < this.source.length && /[\u0009\u000a\u000d\u0020]/u.test(this.source[this.offset]!)) {
      this.offset += 1;
    }
  }

  private value(path: string, depth: number): void {
    if (depth > MAX_JSON_DEPTH_V5) throw new Error("JSON nesting exceeds v5 observation bound");
    this.white();
    const token = this.source[this.offset];
    if (token === "{") return this.object(path, depth + 1);
    if (token === "[") return this.array(path, depth + 1);
    if (token === '"') {
      this.string();
      return;
    }
    if (token === "t" && this.source.slice(this.offset, this.offset + 4) === "true") {
      this.offset += 4;
      return;
    }
    if (token === "f" && this.source.slice(this.offset, this.offset + 5) === "false") {
      this.offset += 5;
      return;
    }
    if (token === "n" && this.source.slice(this.offset, this.offset + 4) === "null") {
      this.offset += 4;
      return;
    }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(this.source.slice(this.offset));
    if (!match) throw new Error(`invalid JSON token at byte ${this.offset}`);
    this.offset += match[0].length;
  }

  private object(path: string, depth: number): void {
    this.offset += 1;
    this.white();
    const keys = new Set<string>();
    if (this.source[this.offset] === "}") {
      this.offset += 1;
      return;
    }
    while (true) {
      this.white();
      if (this.source[this.offset] !== '"') throw new Error(`JSON object key missing at byte ${this.offset}`);
      const key = this.string();
      if (keys.has(key) && this.duplicates.length < MAX_RECORDED_DUPLICATES_V5) {
        this.duplicates.push({ objectPath: path, key });
      }
      keys.add(key);
      this.white();
      if (this.source[this.offset] !== ":") throw new Error(`JSON object colon missing at byte ${this.offset}`);
      this.offset += 1;
      this.value(`${path}.${key}`, depth);
      this.white();
      const token = this.source[this.offset];
      if (token === "}") {
        this.offset += 1;
        return;
      }
      if (token !== ",") throw new Error(`JSON object separator missing at byte ${this.offset}`);
      this.offset += 1;
    }
  }

  private array(path: string, depth: number): void {
    this.offset += 1;
    this.white();
    if (this.source[this.offset] === "]") {
      this.offset += 1;
      return;
    }
    let index = 0;
    while (true) {
      this.value(`${path}[${index}]`, depth);
      index += 1;
      this.white();
      const token = this.source[this.offset];
      if (token === "]") {
        this.offset += 1;
        return;
      }
      if (token !== ",") throw new Error(`JSON array separator missing at byte ${this.offset}`);
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
      if (code < 0x20) throw new Error(`unescaped JSON control character at byte ${this.offset}`);
      if (code === 0x5c) {
        this.offset += 1;
        const escape = this.source[this.offset];
        if (escape === "u") {
          if (!/^[a-fA-F0-9]{4}$/u.test(this.source.slice(this.offset + 1, this.offset + 5))) {
            throw new Error(`invalid JSON unicode escape at byte ${this.offset}`);
          }
          this.offset += 5;
          continue;
        }
        if (!escape || !'"\\/bfnrt'.includes(escape)) {
          throw new Error(`invalid JSON escape at byte ${this.offset}`);
        }
      }
      this.offset += 1;
    }
    throw new Error("unterminated JSON string");
  }
}

export function observeDuplicateJsonKeysV5(rawText: string): DuplicateJsonKeyV5[] {
  return new StrictJsonObserverV5(rawText).parse();
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedQuestionObjectCountV5(value: unknown): {
  count: number;
  saturated: boolean;
} {
  const visited = new Set<object>();
  let count = 0;
  let saturated = false;
  const visit = (candidate: unknown, depth: number): void => {
    if (saturated || depth > MAX_JSON_DEPTH_V5 || candidate === null || typeof candidate !== "object") return;
    if (visited.has(candidate)) return;
    visited.add(candidate);
    if (Array.isArray(candidate)) {
      for (const child of candidate) visit(child, depth + 1);
      return;
    }
    for (const [key, child] of Object.entries(candidate as Record<string, unknown>)) {
      if (key === "questions" && Array.isArray(child)) {
        for (const question of child) {
          if (objectOrNull(question)) {
            count += 1;
            if (count >= MAX_RAW_CANDIDATE_OBSERVATION_V5) {
              count = MAX_RAW_CANDIDATE_OBSERVATION_V5;
              saturated = true;
              return;
            }
          }
        }
      }
      visit(child, depth + 1);
      if (saturated) return;
    }
  };
  visit(value, 0);
  return { count, saturated };
}

function incompleteJsonHasAffirmativeModelEnvelopeMarkersV5(rawText: string): boolean {
  if (!/^\s*[\[{]/u.test(rawText)) return false;
  const choices = /"choices"\s*:/u.test(rawText);
  const message = /"message"\s*:/u.test(rawText);
  const questions = /(?:"questions"|\\"questions\\")\s*:/u.test(rawText);
  return questions || (choices && message);
}

export function observeRawCandidateCardinalityV5(rawText: string): RawCandidateObservationV5 {
  const rootSequence = new StrictJsonObserverV5(rawText).parseSequence();
  const duplicateKeys = rootSequence.duplicateKeys;
  // Global quarantine is intentionally narrower than ordinary parser failure:
  // it requires affirmative evidence that more than one candidate may have
  // been returned. HTML errors and neutral truncated JSON consume the sent
  // opportunity without proving excess; an incomplete JSON model envelope is
  // ambiguous because complete inner output can precede the missing delimiter.
  let cardinalityAmbiguous = duplicateKeys.length > 0 || rootSequence.completedTopLevelValues > 1 ||
    (rootSequence.failed && ((rootSequence.completedTopLevelValues >= 1 && /^\s*[\[{]/u.test(rawText)) ||
      incompleteJsonHasAffirmativeModelEnvelopeMarkersV5(rawText)));
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    const affirmativeRoots = Math.min(
      rootSequence.completedTopLevelValues,
      MAX_RAW_CANDIDATE_OBSERVATION_V5,
    );
    return {
      choicesObserved: 0,
      fullQuestionObjectsObserved: 0,
      candidateUnitsEffective: Math.max(1, affirmativeRoots),
      choiceCardinalityDrift: true,
      choiceCardinalityShortage: true,
      choiceCardinalityExcess: false,
      cardinalityAmbiguous,
      observationSaturated: rootSequence.completedTopLevelValues >= MAX_RAW_CANDIDATE_OBSERVATION_V5,
      duplicateKeys,
    };
  }
  // A syntactically valid value that exceeds the bounded strict observer is
  // different from ordinary invalid transport text: candidate cardinality is
  // genuinely unobservable inside a valid JSON envelope, so fail closed.
  cardinalityAmbiguous ||= rootSequence.failed;
  const root = objectOrNull(parsed);
  const choices = Array.isArray(root?.choices) ? root.choices : [];
  const alternateRootQuestions = boundedQuestionObjectCountV5(root);
  let fullQuestionObjectsObserved = alternateRootQuestions.count;
  let observationSaturated = choices.length >= MAX_RAW_CANDIDATE_OBSERVATION_V5;
  observationSaturated ||= alternateRootQuestions.saturated;
  for (const candidate of choices.slice(0, MAX_RAW_CANDIDATE_OBSERVATION_V5)) {
    const choice = objectOrNull(candidate);
    const message = objectOrNull(choice?.message);
    if (typeof message?.content !== "string") {
      continue;
    }
    const contentSequence = new StrictJsonObserverV5(message.content).parseSequence();
    if (contentSequence.duplicateKeys.length > 0 || contentSequence.completedTopLevelValues > 1 ||
        (contentSequence.failed && ((contentSequence.completedTopLevelValues >= 1 && /^\s*[\[{]/u.test(message.content)) ||
          incompleteJsonHasAffirmativeModelEnvelopeMarkersV5(message.content)))) {
      cardinalityAmbiguous = true;
    }
    let content: unknown;
    try {
      content = JSON.parse(message.content) as unknown;
    } catch {
      continue;
    }
    cardinalityAmbiguous ||= contentSequence.failed;
    const contentQuestions = boundedQuestionObjectCountV5(content);
    fullQuestionObjectsObserved = Math.min(
      MAX_RAW_CANDIDATE_OBSERVATION_V5,
      fullQuestionObjectsObserved + contentQuestions.count,
    );
    observationSaturated ||= contentQuestions.saturated ||
      fullQuestionObjectsObserved >= MAX_RAW_CANDIDATE_OBSERVATION_V5;
    if (observationSaturated) break;
  }
  const choicesObserved = Math.min(choices.length, MAX_RAW_CANDIDATE_OBSERVATION_V5);
  const candidateUnitsEffective = Math.max(1, choicesObserved, fullQuestionObjectsObserved);
  cardinalityAmbiguous ||= choices.length > 1 || fullQuestionObjectsObserved > 1;
  return {
    choicesObserved,
    fullQuestionObjectsObserved,
    candidateUnitsEffective,
    choiceCardinalityDrift: choices.length !== 1,
    choiceCardinalityShortage: choices.length < 1,
    choiceCardinalityExcess: choices.length > 1,
    cardinalityAmbiguous,
    observationSaturated,
    duplicateKeys,
  };
}
