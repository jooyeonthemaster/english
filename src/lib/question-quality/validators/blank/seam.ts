export interface BlankSeamOption {
  label: string;
  text: string;
}

export interface BlankSeamInput {
  passageWithBlank: string;
  options: BlankSeamOption[];
  correctAnswer?: string;
}

export type BlankSeamSeverity = "review" | "high";

export interface BlankSeamFinding {
  code:
    | "blank-relative-tail-contract"
    | "blank-finite-tail-agreement-contract"
    | "blank-double-connector-boundary"
    | "blank-double-preposition-boundary"
    | "blank-double-punctuation-boundary"
    | "blank-article-boundary";
  severity: BlankSeamSeverity;
  message: string;
  evidence: Record<string, unknown>;
}

type NumberSignature = "singular" | "plural" | "unknown";

const BLANK_PATTERN = /_{3,}|\[\s*(?:blank|빈칸)\s*\]|<\s*(?:blank|빈칸)\s*>/gi;
const IRREGULAR_PLURAL = new Set([
  "children",
  "feet",
  "geese",
  "men",
  "mice",
  "people",
  "teeth",
  "women",
]);
const CLEAR_SINGULAR = new Set([
  "advice",
  "communication",
  "equipment",
  "evidence",
  "exchange",
  "feedback",
  "flow",
  "information",
  "interest",
  "knowledge",
  "news",
  "research",
  "resource",
  "structure",
]);
const SINGULAR_PRONOUNS = new Set(["he", "her", "him", "it", "she", "that", "this"]);
const PLURAL_PRONOUNS = new Set(["them", "these", "they", "those", "us", "we"]);
const CONNECTORS = new Set(["and", "but", "or", "nor", "to"]);
const PREPOSITIONS = new Set([
  "about",
  "across",
  "after",
  "against",
  "at",
  "before",
  "between",
  "by",
  "during",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "over",
  "through",
  "to",
  "under",
  "with",
  "without",
]);

function words(value: string): string[] {
  return value.toLowerCase().match(/[a-z]+(?:['’-][a-z]+)*/g) ?? [];
}

function lastWord(value: string): string | undefined {
  return words(value).at(-1);
}

function firstWord(value: string): string | undefined {
  return words(value)[0];
}

export function splitBlankSurface(passageWithBlank: string): {
  left: string;
  right: string;
  blankCount: number;
} {
  const matches = [...passageWithBlank.matchAll(BLANK_PATTERN)];
  if (matches.length !== 1) {
    return { left: passageWithBlank, right: "", blankCount: matches.length };
  }
  const match = matches[0];
  const index = match.index ?? 0;
  return {
    left: passageWithBlank.slice(0, index),
    right: passageWithBlank.slice(index + match[0].length),
    blankCount: 1,
  };
}

/**
 * Only explicit terminal noun-number cues are classified. In particular, an
 * arbitrary `and` in the final words is not enough: it may coordinate verbs
 * (`dominate and control the flow`) rather than noun heads.
 */
export function inferTerminalNumber(value: string): NumberSignature {
  const tokens = words(value);
  const terminal = tokens.at(-1);
  if (!terminal) return "unknown";

  const compact = value.toLowerCase().replace(/[^a-z'’-]+/g, " ").trim();
  const coordinatedNounTail =
    /\b(?:children|feet|geese|men|mice|people|teeth|women|[a-z]{3,}s)\s+and\s+(?:[a-z'’-]+\s+){0,2}(?:children|feet|geese|men|mice|people|teeth|women|[a-z]{3,}s|advice|communication|equipment|evidence|exchange|feedback|flow|information|interest|knowledge|news|research|resource|structure)(?:\s+(?:by|for|from|in|of|with)\s+(?:(?:a|an|the|their|its|our|your)\s+)?(?:[a-z'’-]+\s+){0,4}[a-z'’-]+)?$/i.test(
      compact,
    );
  if (coordinatedNounTail) return "plural";

  if (SINGULAR_PRONOUNS.has(terminal) || CLEAR_SINGULAR.has(terminal)) return "singular";
  if (PLURAL_PRONOUNS.has(terminal) || IRREGULAR_PLURAL.has(terminal)) return "plural";
  if (/^[a-z]+s$/.test(terminal) && !/(ss|us|is|ics)$/.test(terminal)) return "plural";
  if (/^[a-z]+$/.test(terminal)) return "singular";
  return "unknown";
}

function expectedNumberFromVerb(verb: string): NumberSignature {
  if (["are", "were", "have", "do"].includes(verb)) return "plural";
  if (["is", "was", "has", "does"].includes(verb)) return "singular";
  return "unknown";
}

function terminalSignatureMap(options: BlankSeamOption[]): Record<string, NumberSignature> {
  return Object.fromEntries(
    options.map((option) => [option.label, inferTerminalNumber(option.text)]),
  );
}

export function inferSubjectNumber(value: string): NumberSignature {
  const tokens = words(value);
  const first = tokens[0];
  if (!first) return "unknown";
  if (["a", "an", "another", "each", "every", "one", "this", "that"].includes(first)) {
    return "singular";
  }
  if (
    [
      "both",
      "few",
      "many",
      "multiple",
      "several",
      "these",
      "those",
      "two",
      "three",
      "four",
      "five",
    ].includes(first)
  ) {
    return "plural";
  }
  if (SINGULAR_PRONOUNS.has(first)) return "singular";
  if (PLURAL_PRONOUNS.has(first)) return "plural";
  return "unknown";
}

function subjectSignatureMap(options: BlankSeamOption[]): Record<string, NumberSignature> {
  return Object.fromEntries(
    options.map((option) => [option.label, inferSubjectNumber(option.text)]),
  );
}

function heterogeneousKnownSignatures(signatures: Record<string, NumberSignature>): boolean {
  const known = new Set(Object.values(signatures).filter((value) => value !== "unknown"));
  return known.size >= 2;
}

function incompatibleLabels(
  signatures: Record<string, NumberSignature>,
  expected: NumberSignature,
): string[] {
  if (expected === "unknown") return [];
  return Object.entries(signatures)
    .filter(([, signature]) => signature !== "unknown" && signature !== expected)
    .map(([label]) => label);
}

function boundaryWindow(value: string, side: "left" | "right"): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return side === "left" ? compact.slice(-120) : compact.slice(0, 120);
}

function articleSoundMismatch(article: string, option: string): boolean | undefined {
  const token = firstWord(option);
  if (!token) return undefined;
  const vowelSound = /^(hour|honest|honor|heir)/.test(token)
    ? true
    : /^(uni|use|user|euro|one)/.test(token)
      ? false
      : /^[aeiou]/.test(token);
  return article === "an" ? !vowelSound : vowelSound;
}

export function analyzeBlankSeam(input: BlankSeamInput): BlankSeamFinding[] {
  const { left, right, blankCount } = splitBlankSurface(input.passageWithBlank);
  if (blankCount !== 1 || input.options.length < 2) return [];
  const findings: BlankSeamFinding[] = [];
  const rightWords = words(right).slice(0, 4);
  const terminalSignatures = terminalSignatureMap(input.options);
  const answer = input.correctAnswer?.trim();

  const relative = right.match(
    /^\s*[,;:]?\s*(that|which|who)\s+(is|are|was|were|has|have|does|do)\b/i,
  );
  if (relative && heterogeneousKnownSignatures(terminalSignatures)) {
    const expected = expectedNumberFromVerb(relative[2].toLowerCase());
    const incompatible = incompatibleLabels(terminalSignatures, expected);
    findings.push({
      code: "blank-relative-tail-contract",
      severity: incompatible.length > 0 ? "high" : "review",
      message:
        "A relative-clause tail remains outside the blank while option endings expose different number contracts; distractors can be eliminated by seam grammar rather than meaning.",
      evidence: {
        relativePronoun: relative[1].toLowerCase(),
        tailVerb: relative[2].toLowerCase(),
        expectedNumber: expected,
        terminalNumberByLabel: terminalSignatures,
        incompatibleLabels: incompatible,
        correctAnswer: answer ?? null,
        correctAnswerFlagged: answer ? incompatible.includes(answer) : false,
        leftWindow: boundaryWindow(left, "left"),
        rightWindow: boundaryWindow(right, "right"),
      },
    });
  }

  const finiteTail = right.match(/^\s*(is|are|was|were|has|have|does|do)\b/i);
  const subjectSignatures = subjectSignatureMap(input.options);
  if (finiteTail && heterogeneousKnownSignatures(subjectSignatures)) {
    const expected = expectedNumberFromVerb(finiteTail[1].toLowerCase());
    const incompatible = incompatibleLabels(subjectSignatures, expected);
    findings.push({
      code: "blank-finite-tail-agreement-contract",
      severity: incompatible.length > 0 ? "high" : "review",
      message:
        "The finite verb after the blank imposes a number agreement contract that the options do not share.",
      evidence: {
        tailVerb: finiteTail[1].toLowerCase(),
        expectedNumber: expected,
        subjectNumberByLabel: subjectSignatures,
        incompatibleLabels: incompatible,
        correctAnswer: answer ?? null,
      },
    });
  }

  const leftTerminal = lastWord(left);
  if (leftTerminal && CONNECTORS.has(leftTerminal)) {
    const duplicated = input.options
      .filter((option) => firstWord(option.text) === leftTerminal)
      .map((option) => option.label);
    if (duplicated.length > 0 && duplicated.length < input.options.length) {
      findings.push({
        code: "blank-double-connector-boundary",
        severity: "high",
        message: "Only some options duplicate the connector immediately before the blank.",
        evidence: { connector: leftTerminal, affectedLabels: duplicated },
      });
    }
  }

  const rightInitial = rightWords[0];
  if (rightInitial && PREPOSITIONS.has(rightInitial)) {
    const duplicated = input.options
      .filter((option) => lastWord(option.text) === rightInitial)
      .map((option) => option.label);
    if (duplicated.length > 0 && duplicated.length < input.options.length) {
      findings.push({
        code: "blank-double-preposition-boundary",
        severity: "high",
        message: "Only some options duplicate the preposition immediately after the blank.",
        evidence: { preposition: rightInitial, affectedLabels: duplicated },
      });
    }
  }

  const rightPunctuation = right.match(/^\s*([,.;:!?])/u)?.[1];
  if (rightPunctuation) {
    const duplicated = input.options
      .filter((option) => option.text.trim().endsWith(rightPunctuation))
      .map((option) => option.label);
    if (duplicated.length > 0 && duplicated.length < input.options.length) {
      findings.push({
        code: "blank-double-punctuation-boundary",
        severity: "high",
        message: "Only some options duplicate punctuation already present after the blank.",
        evidence: { punctuation: rightPunctuation, affectedLabels: duplicated },
      });
    }
  }

  const article = left.match(/\b(a|an)\s*$/i)?.[1].toLowerCase();
  if (article) {
    const mismatched = input.options
      .filter((option) => articleSoundMismatch(article, option.text) === true)
      .map((option) => option.label);
    if (mismatched.length > 0 && mismatched.length < input.options.length) {
      findings.push({
        code: "blank-article-boundary",
        severity: "high",
        message: "The fixed article before the blank grammatically eliminates only some options.",
        evidence: { article, affectedLabels: mismatched },
      });
    }
  }

  return findings;
}
