import crypto from "node:crypto";

export const CORPUS_SCHEMA_VERSION = 1;
export const DEFAULT_SEED = "question-quality-20260715-corpus-v1";

export const ACTIVE_UI_TYPES = [
  "BLANK_INFERENCE",
  "GRAMMAR_ERROR",
  "GRAMMAR_CHOICE_COMBO",
  "VOCAB_CHOICE",
  "SENTENCE_ORDER",
  "SENTENCE_INSERT",
  "TOPIC",
  "MAIN_IDEA",
  "TITLE",
  "IMPLIED_MEANING",
  "REFERENCE",
  "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC",
  "IRRELEVANT",
  "CONDITIONAL_WRITING",
  "SENTENCE_TRANSFORM",
  "FILL_BLANK_KEY",
  "SUMMARY_COMPLETE",
  "SUMMARY_WRITING",
  "WORD_ORDER",
  "TOPIC_SENTENCE_WRITING",
  "GRAMMAR_CORRECTION",
  "CONTEXT_MEANING",
  "SYNONYM",
  "ANTONYM",
] as const;

export const GENERATION_PLANS = ["STANDARD", "PREMIUM"] as const;
export const DIFFICULTIES = ["BASIC", "INTERMEDIATE", "KILLER"] as const;

export type Origin = "repo-official" | "db-real";
export type Split = "dev" | "holdout";
export type WordBand = "120-169" | "170-229" | "230-360" | "outside";
export type Discourse = "argumentative" | "expository" | "narrative" | "practical";
export type Topic =
  | "humanities"
  | "social"
  | "science"
  | "art-culture"
  | "narrative-practical";
export type GrammarSuitability = "rich" | "normal" | "scarce";
export type BlankSuitability = "central-span" | "local-only";
export type FlagSeverity = "blocking" | "warning";

export interface IntegrityFlag {
  code: string;
  severity: FlagSeverity;
  note: string;
}

export interface RawCandidate {
  id: string;
  origin: Origin;
  text: string;
  title?: string | null;
  source?: string | null;
  sourceKind?: string | null;
  sourceSubject?: string | null;
  sourceExamType?: string | null;
  typeHint?: string | null;
  topicHint?: string | null;
  confidence?: string | null;
  reconstructionKind?: string | null;
  hasDeliberateError?: boolean;
  reviewed?: boolean;
  priorGeneratedQuestions?: number;
  priorWorkbenchJobs?: number;
  metadata?: Record<string, unknown>;
}

export interface CandidateStrata {
  source: "official-exam" | "textbook-workbook" | "handout" | "manual-other";
  wordBand: WordBand;
  discourse: Discourse;
  topic: Topic;
  grammarSuitability: GrammarSuitability;
  blankSuitability: BlankSuitability;
}

export interface CandidateFeatures {
  sentenceCount: number;
  hasReferents: boolean;
  hasDiscoursePivot: boolean;
  grammarSignalKinds: number;
  grammarSignalCount: number;
}

export interface AssessedCandidate extends RawCandidate {
  contentHash: string;
  wordCount: number;
  strata: CandidateStrata;
  features: CandidateFeatures;
  integrityFlags: IntegrityFlag[];
  automaticStatus: "CLEAN_CANDIDATE" | "ROBUSTNESS_CANDIDATE";
}

export interface PublicCandidate {
  id: string;
  origin: Origin;
  contentHash: string;
  wordCount: number;
  strata: CandidateStrata;
  features: CandidateFeatures;
  integrityFlags: IntegrityFlag[];
  automaticStatus: "CLEAN_CANDIDATE" | "ROBUSTNESS_CANDIDATE";
  candidateOnly: true;
  manualAudit: {
    status: "PENDING";
    requiredIndependentReviews: 2;
    logicalIntegrityProven: false;
  };
  provenance: {
    reviewed: boolean;
    priorGeneratedQuestions: number;
    priorWorkbenchJobs: number;
    holdoutRelaxations: string[];
  };
}

export interface ScheduleCell {
  cellId: string;
  split: Split;
  type: (typeof ACTIVE_UI_TYPES)[number];
  plan: (typeof GENERATION_PLANS)[number];
  difficulty: (typeof DIFFICULTIES)[number];
  passageId: string;
  contentHash: string;
  feasibility: {
    status: "PREFERRED" | "FALLBACK";
    criteria: string[];
    notes: string[];
  };
}

export interface SelectorTargets {
  perOriginPerSplit: number;
  robustness: number;
}

export interface BuildInput {
  repo: RawCandidate[];
  db: RawCandidate[];
  excludedHashes: Set<string>;
  excludedIds?: Set<string>;
  seed?: string;
  targets?: Partial<SelectorTargets>;
  academyId?: string;
  exclusionEvidence?: {
    grammarCorpusHashes: number;
    dawnPassageIds: number;
    dawnPassageHashes: number;
  };
}

export interface BuildResult {
  publicManifest: Record<string, unknown>;
  privateManifest: Record<string, unknown>;
  robustnessQueue: Record<string, unknown>;
  scheduleTemplate: Record<string, unknown>;
  selected: Record<Split, AssessedCandidate[]>;
  robustness: AssessedCandidate[];
  diagnostics: Record<string, unknown>;
}

const DEFAULT_TARGETS: SelectorTargets = {
  perOriginPerSplit: 30,
  robustness: 20,
};

const SOURCE_KINDS = new Set(["EXAM", "MOCK", "SUNEUNG"]);
const TEXTBOOK_KINDS = new Set(["TEXTBOOK", "WORKBOOK"]);

export function normalizeContent(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n+ */g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function contentHash(text: string): string {
  return sha256(normalizeContent(text));
}

export function stableStringify(value: unknown, space = 2): string {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sort);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, child]) => [key, sort(child)]),
      );
    }
    return input;
  };
  return `${JSON.stringify(sort(value), null, space)}\n`;
}

export function countWords(text: string): number {
  return text.match(/[A-Za-z]+(?:[’'-][A-Za-z]+)*/g)?.length ?? 0;
}

function wordBand(wordCount: number): WordBand {
  if (wordCount >= 120 && wordCount <= 169) return "120-169";
  if (wordCount >= 170 && wordCount <= 229) return "170-229";
  if (wordCount >= 230 && wordCount <= 360) return "230-360";
  return "outside";
}

function sentenceCount(text: string): number {
  const normalized = normalizeContent(text);
  const matches = normalized.match(/[.!?](?:["'”’)]*)\s+(?=[A-Z“‘"]|$)/g)?.length ?? 0;
  return Math.max(1, matches + (/[.!?]["'”’)]*$/.test(normalized) ? 1 : 0));
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function sourceStratum(candidate: RawCandidate): CandidateStrata["source"] {
  if (candidate.origin === "repo-official") return "official-exam";
  const kind = (candidate.sourceKind ?? "").toUpperCase();
  if (SOURCE_KINDS.has(kind)) return "official-exam";
  if (TEXTBOOK_KINDS.has(kind)) return "textbook-workbook";
  if (kind === "HANDOUT") return "handout";
  return "manual-other";
}

function discourseStratum(candidate: RawCandidate, lower: string): Discourse {
  const hint = `${candidate.typeHint ?? ""} ${candidate.title ?? ""}`.toLowerCase();
  if (
    /편지|안내|도표|실용|공지|letter|notice|advertisement|e-?mail/.test(hint) ||
    /\b(dear|sincerely|register|registration|deadline|admission|reservation|schedule)\b/.test(lower)
  ) {
    return "practical";
  }
  const dialogueMarks = countMatches(candidate.text, /[“”"]/g);
  const narrativeSignals = countMatches(
    lower,
    /\b(i|we|he|she)\b|\b(suddenly|yesterday|one day|when i was|remembered|walked|looked|said|asked|felt)\b/g,
  );
  if (/narrative|story|일화|심경/.test(hint) || (dialogueMarks >= 2 && narrativeSignals >= 3)) {
    return "narrative";
  }
  const argumentSignals = countMatches(
    lower,
    /\b(should|must|ought|need to|argue|claim|therefore|however|nevertheless|thus|in fact|it is important|we need)\b/g,
  );
  if (/주장|요지|논설|argument/.test(hint) || argumentSignals >= 3) return "argumentative";
  return "expository";
}

function topicStratum(candidate: RawCandidate, lower: string, discourse: Discourse): Topic {
  const hint = `${candidate.topicHint ?? ""} ${candidate.typeHint ?? ""} ${candidate.title ?? ""}`.toLowerCase();
  const haystack = `${hint} ${lower}`;
  if (discourse === "narrative" || discourse === "practical") return "narrative-practical";
  if (
    /\b(biology|chemical|physics|scientist|science|species|evolution|cell|brain|neuron|planet|climate|energy|plant|animal|ecosystem|technology|algorithm|data)\b/.test(
      haystack,
    )
  ) {
    return "science";
  }
  if (
    /\b(art|artist|music|painting|novel|poem|literature|film|dance|museum|architecture|design|culture|aesthetic)\b/.test(
      haystack,
    )
  ) {
    return "art-culture";
  }
  if (
    /\b(society|social|economy|economic|market|politic|government|law|community|organization|education|consumer|business|institution|policy)\b/.test(
      haystack,
    )
  ) {
    return "social";
  }
  return "humanities";
}

function grammarSignals(text: string): { count: number; kinds: number } {
  const patterns = [
    /\b(which|who|whom|whose|that)\b/gi,
    /\b(although|though|while|whereas|because|since|unless|whether|if)\b/gi,
    /\b(having|being|given|compared|considering)\b/gi,
    /\b(?:is|are|was|were|be|been|being)\s+\w+(?:ed|en)\b/gi,
    /\b(?:not only|either|neither|rather than|as well as|the more|so that|such that)\b/gi,
    /\b(?:what|how|why|where|when)\s+[A-Za-z]+/gi,
  ];
  const counts = patterns.map((pattern) => countMatches(text, pattern));
  return { count: counts.reduce((sum, value) => sum + value, 0), kinds: counts.filter(Boolean).length };
}

function integrityFlags(candidate: RawCandidate, words: number): IntegrityFlag[] {
  const text = candidate.text;
  const normalized = normalizeContent(text);
  const flags: IntegrityFlag[] = [];
  const add = (code: string, severity: FlagSeverity, note: string) =>
    flags.push({ code, severity, note });

  if (words < 120 || words > 360) {
    add("WORD_COUNT_OUTSIDE_CORE", "blocking", `Core benchmark requires 120-360 English words; observed ${words}.`);
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) {
    add("CONTROL_CHARACTER", "blocking", "Contains a non-layout control character.");
  }
  if (/\uFFFD|Ã.|â€|â€™|ðŸ|\?\?\?/.test(text)) {
    add("ENCODING_OR_MOJIBAKE", "blocking", "Contains a replacement or common mojibake sequence.");
  }
  if (/<\|[^>]*\|>|<<<|>>>|\|\|\||\{\{[^}]+\}\}|```/.test(text)) {
    add("MODEL_OR_DELIMITER_ARTIFACT", "blocking", "Contains a template/model delimiter artifact.");
  }
  if (/\.{2}(?!\.)|,{2,}|[!?]{2,}|\s+[,.!?;]/.test(normalized)) {
    add("PUNCTUATION_CORRUPTION", "blocking", "Contains doubled or visibly displaced punctuation.");
  }
  const openingParens = countMatches(normalized, /\(/g);
  const closingParens = countMatches(normalized, /\)/g);
  const openingBrackets = countMatches(normalized, /\[/g);
  const closingBrackets = countMatches(normalized, /\]/g);
  if (openingParens !== closingParens || openingBrackets !== closingBrackets) {
    add("UNBALANCED_DELIMITER", "blocking", "Parenthesis or square-bracket counts are unbalanced.");
  }
  const koreanChars = countMatches(normalized, /[가-힣]/g);
  const latinChars = countMatches(normalized, /[A-Za-z]/g);
  if (koreanChars >= 3 || latinChars / Math.max(1, normalized.replace(/\s/g, "").length) < 0.55) {
    add("NON_ENGLISH_INTRUSION", "blocking", "English-language heuristic failed or found Korean instruction text.");
  }
  const scaffoldMarkers = countMatches(normalized, /[①-⑳]|\([A-Ea-e]\)|_{3,}|\b(?:Question|Answer)\s*\d*\s*:/g);
  if (/다음\s*(?:글|문장)|정답|해설/.test(normalized) || scaffoldMarkers >= 3) {
    add("QUESTION_SCAFFOLD_CONTAMINATION", "blocking", "Contains likely question, answer, or annotation scaffolding.");
  }
  if (/\bpage\s+\d+\b|copyright|all rights reserved|www\.[a-z]/i.test(normalized)) {
    add("SOURCE_FOOTER_OR_OCR", "blocking", "Contains a likely page footer, URL, or copyright/OCR remnant.");
  }
  if (/\S{80,}/.test(normalized)) {
    add("UNBROKEN_TOKEN_RUN", "blocking", "Contains an implausibly long unbroken token.");
  }
  if (candidate.hasDeliberateError) {
    add("DELIBERATE_SOURCE_ERROR", "blocking", "Repository metadata marks a deliberate error in the source.");
  }
  if (candidate.confidence && candidate.confidence.toLowerCase() !== "high") {
    add("NON_HIGH_SOURCE_CONFIDENCE", "blocking", "Repository reconstruction confidence is not high.");
  }
  if (candidate.reconstructionKind && candidate.reconstructionKind !== "none") {
    add("RECONSTRUCTED_SOURCE", "blocking", "Repository metadata says the source was reconstructed.");
  }
  return flags;
}

export function assessCandidate(candidate: RawCandidate): AssessedCandidate {
  const normalized = normalizeContent(candidate.text);
  const lower = normalized.toLowerCase();
  const words = countWords(normalized);
  const sentences = sentenceCount(normalized);
  const discourse = discourseStratum(candidate, lower);
  const grammar = grammarSignals(normalized);
  const hasDiscoursePivot = /\b(however|therefore|thus|yet|but|because|consequently|in contrast|rather|instead|for this reason)\b/i.test(
    normalized,
  );
  const flags = integrityFlags(candidate, words);
  const grammarSuitability: GrammarSuitability =
    grammar.kinds >= 3 && grammar.count >= 5 ? "rich" : grammar.kinds >= 2 && grammar.count >= 2 ? "normal" : "scarce";
  const blankSuitability: BlankSuitability =
    sentences >= 5 && words >= 150 && hasDiscoursePivot ? "central-span" : "local-only";

  return {
    ...candidate,
    text: normalized,
    contentHash: contentHash(normalized),
    wordCount: words,
    strata: {
      source: sourceStratum(candidate),
      wordBand: wordBand(words),
      discourse,
      topic: topicStratum(candidate, lower, discourse),
      grammarSuitability,
      blankSuitability,
    },
    features: {
      sentenceCount: sentences,
      hasReferents: /\b(this|that|these|those|it|they|which|who|such)\b/i.test(normalized),
      hasDiscoursePivot,
      grammarSignalKinds: grammar.kinds,
      grammarSignalCount: grammar.count,
    },
    integrityFlags: flags,
    automaticStatus: flags.some((flag) => flag.severity === "blocking")
      ? "ROBUSTNESS_CANDIDATE"
      : "CLEAN_CANDIDATE",
  };
}

function stableOrder<T extends { id: string; contentHash: string }>(items: T[], seed: string, salt: string): T[] {
  return [...items].sort((a, b) => {
    const left = sha256(`${seed}|${salt}|${a.contentHash}|${a.id}`);
    const right = sha256(`${seed}|${salt}|${b.contentHash}|${b.id}`);
    return left.localeCompare(right) || a.id.localeCompare(b.id);
  });
}

function categoryCounts(selected: AssessedCandidate[], key: keyof CandidateStrata): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of selected) {
    const value = item.strata[key];
    result.set(value, (result.get(value) ?? 0) + 1);
  }
  return result;
}

const BALANCE_TARGETS: Record<keyof CandidateStrata, Record<string, number>> = {
  source: {
    "official-exam": 0.5,
    "textbook-workbook": 0.17,
    handout: 0.17,
    "manual-other": 0.16,
  },
  wordBand: { "120-169": 0.3, "170-229": 0.45, "230-360": 0.25, outside: 0 },
  discourse: { argumentative: 0.25, expository: 0.4, narrative: 0.2, practical: 0.15 },
  topic: {
    humanities: 0.2,
    social: 0.2,
    science: 0.2,
    "art-culture": 0.2,
    "narrative-practical": 0.2,
  },
  grammarSuitability: { rich: 0.35, normal: 0.5, scarce: 0.15 },
  blankSuitability: { "central-span": 0.55, "local-only": 0.45 },
};

const BALANCE_WEIGHTS: Record<keyof CandidateStrata, number> = {
  source: 1.2,
  wordBand: 2.5,
  discourse: 1.7,
  topic: 1.7,
  grammarSuitability: 1.2,
  blankSuitability: 1.1,
};

function balanceScore(
  candidate: AssessedCandidate,
  selected: AssessedCandidate[],
  targetTotal: number,
  seed: string,
  salt: string,
): number {
  let score = 0;
  for (const key of Object.keys(BALANCE_TARGETS) as (keyof CandidateStrata)[]) {
    const value = candidate.strata[key];
    const counts = categoryCounts(selected, key);
    const desired = (BALANCE_TARGETS[key][value] ?? 0) * targetTotal;
    const current = counts.get(value) ?? 0;
    score += BALANCE_WEIGHTS[key] * (desired - current) / Math.max(1, desired);
  }
  const jitter = Number.parseInt(sha256(`${seed}|${salt}|${candidate.contentHash}`).slice(0, 8), 16) / 0xffffffff;
  return score + jitter * 0.001;
}

function greedyBalancedSelect(
  pool: AssessedCandidate[],
  count: number,
  seed: string,
  salt: string,
  alreadySelected: AssessedCandidate[] = [],
): AssessedCandidate[] {
  const chosen: AssessedCandidate[] = [];
  const remaining = stableOrder(pool, seed, salt);
  while (chosen.length < count && remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const score = balanceScore(
        remaining[index],
        [...alreadySelected, ...chosen],
        alreadySelected.length + count,
        seed,
        salt,
      );
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    chosen.push(remaining.splice(bestIndex, 1)[0]);
  }
  return chosen;
}

function deduplicate(
  candidates: AssessedCandidate[],
  excludedHashes: Set<string>,
  excludedIds: Set<string>,
): { unique: AssessedCandidate[]; excluded: number; duplicates: number } {
  const seen = new Set<string>();
  const unique: AssessedCandidate[] = [];
  let excluded = 0;
  let duplicates = 0;
  for (const item of candidates) {
    if (excludedHashes.has(item.contentHash) || excludedIds.has(item.id)) {
      excluded += 1;
      continue;
    }
    if (seen.has(item.contentHash)) {
      duplicates += 1;
      continue;
    }
    seen.add(item.contentHash);
    unique.push(item);
  }
  return { unique, excluded, duplicates };
}

function holdoutTier(candidate: AssessedCandidate): number {
  const unused = (candidate.priorGeneratedQuestions ?? 0) === 0 && (candidate.priorWorkbenchJobs ?? 0) === 0;
  if (candidate.reviewed && unused) return 0;
  if (unused) return 1;
  if (candidate.reviewed) return 2;
  return 3;
}

function holdoutRelaxations(candidate: AssessedCandidate): string[] {
  const result: string[] = [];
  if (!candidate.reviewed) result.push("UNREVIEWED");
  if ((candidate.priorGeneratedQuestions ?? 0) > 0 || (candidate.priorWorkbenchJobs ?? 0) > 0) {
    result.push("PRIOR_GENERATION_PRESENT");
  }
  return result;
}

function selectDbHoldout(
  pool: AssessedCandidate[],
  count: number,
  seed: string,
  splitContext: AssessedCandidate[],
): { selected: AssessedCandidate[]; tierCounts: Record<string, number> } {
  const selected: AssessedCandidate[] = [];
  const tierCounts: Record<string, number> = { strict: 0, unreviewedUnused: 0, reviewedUsed: 0, unreviewedUsed: 0 };
  const labels = ["strict", "unreviewedUnused", "reviewedUsed", "unreviewedUsed"];
  for (let tier = 0; tier <= 3 && selected.length < count; tier += 1) {
    const candidates = pool.filter((item) => holdoutTier(item) === tier);
    const picked = greedyBalancedSelect(
      candidates,
      count - selected.length,
      seed,
      `db-holdout-tier-${tier}`,
      [...splitContext, ...selected],
    );
    selected.push(...picked);
    tierCounts[labels[tier]] += picked.length;
  }
  return { selected, tierCounts };
}

function publicCandidate(item: AssessedCandidate, split?: Split): PublicCandidate {
  return {
    id: item.id,
    origin: item.origin,
    contentHash: item.contentHash,
    wordCount: item.wordCount,
    strata: item.strata,
    features: item.features,
    integrityFlags: item.integrityFlags,
    automaticStatus: item.automaticStatus,
    candidateOnly: true,
    manualAudit: {
      status: "PENDING",
      requiredIndependentReviews: 2,
      logicalIntegrityProven: false,
    },
    provenance: {
      reviewed: item.reviewed === true,
      priorGeneratedQuestions: item.priorGeneratedQuestions ?? 0,
      priorWorkbenchJobs: item.priorWorkbenchJobs ?? 0,
      holdoutRelaxations: split === "holdout" && item.origin === "db-real" ? holdoutRelaxations(item) : [],
    },
  };
}

function summarize(items: AssessedCandidate[]): Record<string, unknown> {
  const by = (getter: (item: AssessedCandidate) => string): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const item of items) out[getter(item)] = (out[getter(item)] ?? 0) + 1;
    return out;
  };
  return {
    total: items.length,
    origin: by((item) => item.origin),
    source: by((item) => item.strata.source),
    wordBand: by((item) => item.strata.wordBand),
    discourse: by((item) => item.strata.discourse),
    topic: by((item) => item.strata.topic),
    grammarSuitability: by((item) => item.strata.grammarSuitability),
    blankSuitability: by((item) => item.strata.blankSuitability),
  };
}

function feasibilityCriteria(type: (typeof ACTIVE_UI_TYPES)[number]): string[] {
  if (["GRAMMAR_ERROR", "GRAMMAR_CHOICE_COMBO", "GRAMMAR_CORRECTION"].includes(type)) {
    return ["grammarSuitability != scarce", "sentenceCount >= 4"];
  }
  if (["BLANK_INFERENCE", "FILL_BLANK_KEY"].includes(type)) {
    return ["blankSuitability = central-span"];
  }
  if (["SENTENCE_ORDER", "SENTENCE_INSERT", "IRRELEVANT"].includes(type)) {
    return ["sentenceCount >= 6", "wordCount >= 170"];
  }
  if (type === "REFERENCE") return ["hasReferents = true"];
  if (["SUMMARY_COMPLETE_MC", "SUMMARY_COMPLETE", "SUMMARY_WRITING"].includes(type)) {
    return ["wordCount >= 170", "sentenceCount >= 5"];
  }
  if (["IMPLIED_MEANING", "TOPIC_SENTENCE_WRITING"].includes(type)) {
    return ["wordCount >= 150", "discourse is argumentative or expository"];
  }
  return ["automaticStatus = CLEAN_CANDIDATE"];
}

function isPreferred(item: AssessedCandidate, type: (typeof ACTIVE_UI_TYPES)[number]): boolean {
  if (["GRAMMAR_ERROR", "GRAMMAR_CHOICE_COMBO", "GRAMMAR_CORRECTION"].includes(type)) {
    return item.strata.grammarSuitability !== "scarce" && item.features.sentenceCount >= 4;
  }
  if (["BLANK_INFERENCE", "FILL_BLANK_KEY"].includes(type)) {
    return item.strata.blankSuitability === "central-span";
  }
  if (["SENTENCE_ORDER", "SENTENCE_INSERT", "IRRELEVANT"].includes(type)) {
    return item.features.sentenceCount >= 6 && item.wordCount >= 170;
  }
  if (type === "REFERENCE") return item.features.hasReferents;
  if (["SUMMARY_COMPLETE_MC", "SUMMARY_COMPLETE", "SUMMARY_WRITING"].includes(type)) {
    return item.wordCount >= 170 && item.features.sentenceCount >= 5;
  }
  if (["IMPLIED_MEANING", "TOPIC_SENTENCE_WRITING"].includes(type)) {
    return item.wordCount >= 150 && ["argumentative", "expository"].includes(item.strata.discourse);
  }
  return true;
}

export function buildSchedule(
  split: Split,
  candidates: AssessedCandidate[],
  seed: string,
): { cells: ScheduleCell[]; passageUseCounts: Record<string, number>; fallbackCells: number } {
  if (candidates.length === 0) return { cells: [], passageUseCounts: {}, fallbackCells: 0 };
  const cells: ScheduleCell[] = [];
  const useCounts = new Map<string, number>();
  let fallbackCells = 0;
  for (const type of ACTIVE_UI_TYPES) {
    for (const plan of GENERATION_PLANS) {
      for (const difficulty of DIFFICULTIES) {
        const cellId = `${split}:${type}:${plan}:${difficulty}`;
        const preferred = candidates.filter((item) => isPreferred(item, type));
        const pool = preferred.length > 0 ? preferred : candidates;
        const ordered = [...pool].sort((a, b) => {
          const useDelta = (useCounts.get(a.id) ?? 0) - (useCounts.get(b.id) ?? 0);
          if (useDelta !== 0) return useDelta;
          return sha256(`${seed}|${cellId}|${a.contentHash}|${a.id}`).localeCompare(
            sha256(`${seed}|${cellId}|${b.contentHash}|${b.id}`),
          );
        });
        const selected = ordered[0];
        const fallback = preferred.length === 0;
        if (fallback) fallbackCells += 1;
        useCounts.set(selected.id, (useCounts.get(selected.id) ?? 0) + 1);
        cells.push({
          cellId,
          split,
          type,
          plan,
          difficulty,
          passageId: selected.id,
          contentHash: selected.contentHash,
          feasibility: {
            status: fallback ? "FALLBACK" : "PREFERRED",
            criteria: feasibilityCriteria(type),
            notes: fallback
              ? ["No selected passage met every heuristic criterion; manual feasibility check is required before generation."]
              : ["Heuristic fit only; this does not certify item-level validity."],
          },
        });
      }
    }
  }
  return {
    cells,
    passageUseCounts: Object.fromEntries([...useCounts.entries()].sort(([a], [b]) => a.localeCompare(b))),
    fallbackCells,
  };
}

function selectRobustness(
  pool: AssessedCandidate[],
  count: number,
  seed: string,
): AssessedCandidate[] {
  const chosen: AssessedCandidate[] = [];
  const remaining = stableOrder(pool, seed, "robustness");
  const usedPrimaryFlags = new Set<string>();
  while (chosen.length < count && remaining.length > 0) {
    remaining.sort((a, b) => {
      const aFlag = a.integrityFlags.find((flag) => flag.severity === "blocking")?.code ?? "EDGE";
      const bFlag = b.integrityFlags.find((flag) => flag.severity === "blocking")?.code ?? "EDGE";
      const aNovel = usedPrimaryFlags.has(aFlag) ? 0 : 1;
      const bNovel = usedPrimaryFlags.has(bFlag) ? 0 : 1;
      if (aNovel !== bNovel) return bNovel - aNovel;
      const aOrigin = chosen.filter((item) => item.origin === a.origin).length;
      const bOrigin = chosen.filter((item) => item.origin === b.origin).length;
      if (aOrigin !== bOrigin) return aOrigin - bOrigin;
      return sha256(`${seed}|robustness|${a.contentHash}`).localeCompare(
        sha256(`${seed}|robustness|${b.contentHash}`),
      );
    });
    const picked = remaining.shift()!;
    chosen.push(picked);
    usedPrimaryFlags.add(picked.integrityFlags.find((flag) => flag.severity === "blocking")?.code ?? "EDGE");
  }
  return chosen;
}

export function buildCorpus(input: BuildInput): BuildResult {
  const seed = input.seed ?? DEFAULT_SEED;
  const targets: SelectorTargets = { ...DEFAULT_TARGETS, ...input.targets };
  const excludedIds = input.excludedIds ?? new Set<string>();

  const repoRaw = input.repo.map(assessCandidate);
  const dbRaw = input.db.map(assessCandidate);
  const repoDeduped = deduplicate(repoRaw, input.excludedHashes, excludedIds);
  const repoHashes = new Set(repoDeduped.unique.map((item) => item.contentHash));
  const dbDeduped = deduplicate(
    dbRaw,
    new Set([...input.excludedHashes, ...repoHashes]),
    excludedIds,
  );

  const repoClean = repoDeduped.unique.filter((item) => item.automaticStatus === "CLEAN_CANDIDATE");
  const dbClean = dbDeduped.unique.filter((item) => item.automaticStatus === "CLEAN_CANDIDATE");

  const repoHoldout = greedyBalancedSelect(
    repoClean,
    targets.perOriginPerSplit,
    seed,
    "repo-holdout",
  );
  const selectedHashes = new Set(repoHoldout.map((item) => item.contentHash));
  const repoDev = greedyBalancedSelect(
    repoClean.filter((item) => !selectedHashes.has(item.contentHash)),
    targets.perOriginPerSplit,
    seed,
    "repo-dev",
  );
  for (const item of repoDev) selectedHashes.add(item.contentHash);

  const dbHoldoutResult = selectDbHoldout(
    dbClean.filter((item) => !selectedHashes.has(item.contentHash)),
    targets.perOriginPerSplit,
    seed,
    repoHoldout,
  );
  const dbHoldout = dbHoldoutResult.selected;
  for (const item of dbHoldout) selectedHashes.add(item.contentHash);

  const dbDevPool = dbClean.filter((item) => !selectedHashes.has(item.contentHash));
  const usedDb = dbDevPool.filter(
    (item) => (item.priorGeneratedQuestions ?? 0) > 0 || (item.priorWorkbenchJobs ?? 0) > 0,
  );
  const unusedDb = dbDevPool.filter(
    (item) => (item.priorGeneratedQuestions ?? 0) === 0 && (item.priorWorkbenchJobs ?? 0) === 0,
  );
  const dbDevUsed = greedyBalancedSelect(
    usedDb,
    Math.min(targets.perOriginPerSplit, usedDb.length),
    seed,
    "db-dev-used",
    repoDev,
  );
  const dbDev = [
    ...dbDevUsed,
    ...greedyBalancedSelect(
      unusedDb,
      targets.perOriginPerSplit - dbDevUsed.length,
      seed,
      "db-dev-unused",
      [...repoDev, ...dbDevUsed],
    ),
  ];

  const selected: Record<Split, AssessedCandidate[]> = {
    dev: [...repoDev, ...dbDev],
    holdout: [...repoHoldout, ...dbHoldout],
  };

  const noisyPool = [...repoDeduped.unique, ...dbDeduped.unique].filter(
    (item) => item.automaticStatus === "ROBUSTNESS_CANDIDATE" && !selectedHashes.has(item.contentHash),
  );
  const robustness = selectRobustness(noisyPool, targets.robustness, seed);
  const devSchedule = buildSchedule("dev", selected.dev, seed);
  const holdoutSchedule = buildSchedule("holdout", selected.holdout, seed);

  const allInputFingerprint = sha256(
    stableStringify(
      [...repoDeduped.unique, ...dbDeduped.unique]
        .map((item) => `${item.origin}:${item.id}:${item.contentHash}`)
        .sort(),
      0,
    ),
  );
  const splitPublic = {
    dev: selected.dev.map((item) => publicCandidate(item, "dev")),
    holdout: selected.holdout.map((item) => publicCandidate(item, "holdout")),
  };
  const diagnostics = {
    input: { repo: input.repo.length, db: input.db.length },
    deduplication: {
      repoExcluded: repoDeduped.excluded,
      repoDuplicates: repoDeduped.duplicates,
      dbExcludedOrRepoHashCollision: dbDeduped.excluded,
      dbDuplicates: dbDeduped.duplicates,
    },
    eligibleClean: { repo: repoClean.length, db: dbClean.length },
    shortfalls: {
      devRepo: Math.max(0, targets.perOriginPerSplit - repoDev.length),
      devDb: Math.max(0, targets.perOriginPerSplit - dbDev.length),
      holdoutRepo: Math.max(0, targets.perOriginPerSplit - repoHoldout.length),
      holdoutDb: Math.max(0, targets.perOriginPerSplit - dbHoldout.length),
      robustness: Math.max(0, targets.robustness - robustness.length),
    },
    dbHoldoutFeasibilityTiers: dbHoldoutResult.tierCounts,
    selectedSummary: { dev: summarize(selected.dev), holdout: summarize(selected.holdout) },
    schedule: {
      devFallbackCells: devSchedule.fallbackCells,
      holdoutFallbackCells: holdoutSchedule.fallbackCells,
      expectedCellsPerSplit: ACTIVE_UI_TYPES.length * GENERATION_PLANS.length * DIFFICULTIES.length,
    },
  };

  const publicManifest = {
    schemaVersion: CORPUS_SCHEMA_VERSION,
    selectionVersion: "2026-07-15-v1",
    seed,
    deterministicGivenInputs: true,
    inputFingerprintSha256: allInputFingerprint,
    academyId: input.academyId ?? null,
    policy: {
      target: "120 clean candidates: dev=60 and holdout=60; each split targets 30 repo-official and 30 DB-real.",
      automaticCleanMeaning:
        "Passed limited English/length/punctuation/OCR/delimiter/control/source-scaffold heuristics only.",
      certificationWarning:
        "CLEAN_CANDIDATE is candidate-only. It does not prove factual, semantic, logical, or item-design integrity.",
      manualGate: "Two independent manual passage audits are required before benchmark generation.",
      dbHoldoutPreference:
        "Reviewed plus zero prior AI-generated questions and zero Workbench jobs; relaxations are recorded per candidate.",
    },
    exclusions: input.exclusionEvidence ?? null,
    targets,
    diagnostics,
    splits: splitPublic,
    relatedArtifacts: {
      privateContentManifest: "private/manifest-private.json",
      robustnessQueue: "robustness-queue.json",
      scheduleTemplate: "schedule-template.json",
    },
  };

  const robustnessQueue = {
    schemaVersion: CORPUS_SCHEMA_VERSION,
    seed,
    policy:
      "Robustness candidates are intentionally outside the clean benchmark and must never be silently promoted.",
    candidates: robustness.map((item) => publicCandidate(item)),
    summary: summarize(robustness),
  };

  const scheduleTemplate = {
    schemaVersion: CORPUS_SCHEMA_VERSION,
    seed,
    activeUiTypeCount: ACTIVE_UI_TYPES.length,
    plans: GENERATION_PLANS,
    difficulties: DIFFICULTIES,
    policy: {
      rotation: "Least-used feasible passage, then seeded SHA-256 tie-break per cell.",
      feasibilityWarning: "Type-fit labels are heuristics and require a pre-generation human check.",
      legacyExcluded: ["TOPIC_MAIN_IDEA"],
    },
    dev: devSchedule,
    holdout: holdoutSchedule,
  };

  const privateManifest = {
    schemaVersion: CORPUS_SCHEMA_VERSION,
    seed,
    confidentiality:
      "Contains production passage text. Keep private; use manifest-public.json for review logistics and reporting.",
    publicManifestSha256: sha256(stableStringify(publicManifest)),
    splits: {
      dev: selected.dev.map((item) => ({ ...publicCandidate(item, "dev"), content: item.text })),
      holdout: selected.holdout.map((item) => ({ ...publicCandidate(item, "holdout"), content: item.text })),
    },
    robustness: robustness.map((item) => ({ ...publicCandidate(item), content: item.text })),
  };

  return {
    publicManifest,
    privateManifest,
    robustnessQueue,
    scheduleTemplate,
    selected,
    robustness,
    diagnostics,
  };
}
