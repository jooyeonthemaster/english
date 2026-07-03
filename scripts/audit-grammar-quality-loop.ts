import fs from "node:fs";
import path from "node:path";

import { loadEnvConfig } from "@next/env";
import { z } from "zod";

loadEnvConfig(process.cwd());

type GenerationPlan = "STANDARD" | "PREMIUM";
type Difficulty = "BASIC" | "INTERMEDIATE" | "KILLER";

type GrammarLoopCase = {
  type: "GRAMMAR_ERROR";
  difficulty: Difficulty;
  settings: Record<string, unknown>;
};

type LocalIssue = {
  severity: "critical" | "major" | "minor";
  code: string;
  message: string;
};

type AuditRow = Record<string, unknown>;

const DEFAULT_ACADEMY_ID = "cmommhl7a0000mmekxmbqfefe";

const CASES: GrammarLoopCase[] = [
  {
    type: "GRAMMAR_ERROR",
    difficulty: "BASIC",
    settings: { markerCount: 5, answerCount: 1, pointFocus: true },
  },
  {
    type: "GRAMMAR_ERROR",
    difficulty: "INTERMEDIATE",
    settings: { markerCount: 5, answerCount: 1, pointFocus: true },
  },
  {
    type: "GRAMMAR_ERROR",
    difficulty: "KILLER",
    settings: { markerCount: 5, answerCount: 1, pointFocus: true },
  },
];

const LlmJudgeSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  score: z.number().min(0).max(100),
  fatalIssues: z.array(z.string()).default([]),
  majorIssues: z.array(z.string()).default([]),
  minorIssues: z.array(z.string()).default([]),
  strengths: z.array(z.string()).default([]),
  improvementHint: z.string().default(""),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonlRows(inputPath: string): AuditRow[] {
  const content = fs.readFileSync(inputPath, "utf8");
  const rows: AuditRow[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = JSON.parse(trimmed) as unknown;
    if (isRecord(parsed)) rows.push(parsed);
  }
  return rows;
}

function defaultSummaryPath(inputPath: string): string {
  return /\.jsonl$/i.test(inputPath)
    ? inputPath.replace(/\.jsonl$/i, ".summary.json")
    : `${inputPath}.summary.json`;
}

function rowText(row: AuditRow, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function rowNumber(row: AuditRow, key: string): number | null {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function issueKey(source: string, code: string): string {
  return `${source}:${code.replace(/\s+/g, " ").trim().slice(0, 120)}`;
}

function collectRowIssueKeys(row: AuditRow): string[] {
  const keys: string[] = [];
  const push = (key: string) => {
    if (key && !keys.includes(key)) keys.push(key);
  };

  const localAudit = isRecord(row.localAudit) ? row.localAudit : null;
  const localIssues = Array.isArray(localAudit?.issues) ? localAudit.issues : [];
  for (const issue of localIssues) {
    if (!isRecord(issue)) continue;
    const code = rowText(issue, "code");
    if (code) push(issueKey("local", code));
  }

  const llmJudge = isRecord(row.llmJudge) ? row.llmJudge : null;
  for (const issue of Array.isArray(llmJudge?.fatalIssues) ? llmJudge.fatalIssues : []) {
    if (typeof issue === "string") push(issueKey("llmFatal", issue));
  }
  for (const issue of Array.isArray(llmJudge?.majorIssues) ? llmJudge.majorIssues : []) {
    if (typeof issue === "string") push(issueKey("llmMajor", issue));
  }
  if (typeof row.llmJudgeError === "string" && row.llmJudgeError.trim()) {
    push(issueKey("llmJudgeError", row.llmJudgeError));
  }
  if (typeof row.error === "string" && row.error.trim()) {
    push(issueKey("runtime", row.error));
  }
  return keys;
}

function collectRejectionIssueCounts(row: AuditRow): Record<string, number> {
  const out: Record<string, number> = {};
  const rejectionSummary = isRecord(row.rejectionSummary) ? row.rejectionSummary : null;
  const topCodes = Array.isArray(rejectionSummary?.topCodes) ? rejectionSummary.topCodes : [];
  for (const item of topCodes) {
    if (!isRecord(item)) continue;
    const code = rowText(item, "code");
    if (!code) continue;
    const count = Math.max(1, rowNumber(item, "count") ?? 1);
    const key = issueKey("rejection", code);
    out[key] = (out[key] ?? 0) + count;
  }
  const lastIssue = isRecord(rejectionSummary?.lastIssue) ? rejectionSummary.lastIssue : null;
  const lastCodes = Array.isArray(lastIssue?.codes) ? lastIssue.codes : [];
  for (const code of lastCodes) {
    if (typeof code !== "string" || !code.trim()) continue;
    const key = issueKey("rejectionLast", code);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function collectAnswerSurfaces(row: AuditRow): string[] {
  const question = isRecord(row.question) ? row.question : null;
  const marked = Array.isArray(question?.markedExpressions) ? question.markedExpressions : [];
  return marked
    .filter(isRecord)
    .filter((item) => item.isError === true || rowText(item, "isError").toLowerCase() === "true")
    .map((item) => {
      const label = rowText(item, "label") || "?";
      const expression = rowText(item, "expression");
      const errorExpression = rowText(item, "errorExpression");
      const pointCode = rowText(item, "pointCode");
      return `${label}:${expression}${errorExpression ? `->${errorExpression}` : ""}${pointCode ? `(${pointCode})` : ""}`;
    })
    .filter(Boolean)
    .slice(0, 3);
}

function buildAuditSummary(rows: AuditRow[], outPath: string) {
  const passed = rows.filter((row) => row.ok === true).length;
  const failed = rows.length - passed;
  const issueCounts: Record<string, number> = {};
  const byPlanDifficulty: Record<string, { total: number; passed: number; failed: number; passRate: number }> = {};

  for (const row of rows) {
    const groupKey = `${rowText(row, "generationPlan") || "UNKNOWN"}:${rowText(row, "difficulty") || "UNKNOWN"}`;
    const group = byPlanDifficulty[groupKey] ?? { total: 0, passed: 0, failed: 0, passRate: 0 };
    group.total += 1;
    if (row.ok === true) group.passed += 1;
    else group.failed += 1;
    group.passRate = group.total > 0 ? group.passed / group.total : 0;
    byPlanDifficulty[groupKey] = group;

    for (const key of collectRowIssueKeys(row)) {
      issueCounts[key] = (issueCounts[key] ?? 0) + 1;
    }
    for (const [key, count] of Object.entries(collectRejectionIssueCounts(row))) {
      issueCounts[key] = (issueCounts[key] ?? 0) + count;
    }
  }

  const topIssues = Object.entries(issueCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([code, count]) => ({ code, count }));

  const worstSamples = rows
    .filter((row) => row.ok !== true)
    .map((row) => {
      const localAudit = isRecord(row.localAudit) ? row.localAudit : {};
      const llmJudge = isRecord(row.llmJudge) ? row.llmJudge : {};
      const localScore = rowNumber(localAudit, "score");
      const llmScore = rowNumber(llmJudge, "score");
      return {
        runIndex: row.runIndex,
        generationPlan: row.generationPlan,
        difficulty: row.difficulty,
        passageId: row.passageId,
        title: row.title,
        localScore,
        llmScore,
        issueKeys: [
          ...collectRowIssueKeys(row),
          ...Object.keys(collectRejectionIssueCounts(row)),
        ].slice(0, 8),
        answerSurfaces: collectAnswerSurfaces(row),
        rejectionSummary: isRecord(row.rejectionSummary) ? row.rejectionSummary.message : undefined,
        error: row.error,
      };
    })
    .sort((a, b) => (a.localScore ?? 0) - (b.localScore ?? 0) || (a.llmScore ?? 0) - (b.llmScore ?? 0))
    .slice(0, 12);

  return {
    createdAt: new Date().toISOString(),
    outPath,
    total: rows.length,
    passed,
    failed,
    passRate: rows.length > 0 ? passed / rows.length : 0,
    byPlanDifficulty,
    issueCounts,
    topIssues,
    worstSamples,
  };
}

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readBoolEnv(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return /^(1|true|yes|y)$/i.test(raw.trim());
}

function readListEnv<T extends string>(
  name: string,
  allowed: readonly T[],
  fallback: T[],
): T[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  const allowedSet = new Set(allowed);
  const out = raw
    .split(",")
    .map((item) => item.trim().toUpperCase() as T)
    .filter((item) => allowedSet.has(item));
  return out.length > 0 ? out : fallback;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeLabel(value: unknown): string {
  return text(value)
    .replace(/^[\(\[]?([A-Ja-j]|\d{1,3})[\)\].:]?\s*$/, "$1")
    .toUpperCase();
}

function collectCorrectLabels(question: Record<string, unknown>): string[] {
  const labels: string[] = [];
  const push = (value: unknown) => {
    const label = normalizeLabel(value);
    if (label && !labels.includes(label)) labels.push(label);
  };
  if (Array.isArray(question.correctAnswers)) {
    for (const value of question.correctAnswers) push(value);
  }
  const raw = text(question.correctAnswer);
  const matches = raw.match(/[\(\[]?\s*[A-Ja-j]\s*[\)\].:]?/g);
  if (matches?.length) {
    for (const match of matches) push(match);
  } else {
    push(raw);
  }
  return labels;
}

function collectMarked(question: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(question.markedExpressions)
    ? question.markedExpressions.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

function collectWrongExplanations(question: Record<string, unknown>): Record<string, string> {
  const raw = question.wrongOptionExplanations;
  const out: Record<string, string> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      const label = normalizeLabel(key);
      const explanation = text(value);
      if (label && explanation) out[label] = explanation;
    }
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const label = normalizeLabel((item as Record<string, unknown>).label);
      const explanation = text((item as Record<string, unknown>).explanation);
      if (label && explanation) out[label] = explanation;
    }
  }
  return out;
}

function codeOf(marked: Record<string, unknown>): string {
  return text(marked.pointCode).toLowerCase().replace(/[^a-m]/g, "");
}

function sourceSurface(marked: Record<string, unknown>): string {
  return text(marked.expression);
}

function displayedSurface(marked: Record<string, unknown>): string {
  return text(marked.isError) === "true" || marked.isError === true
    ? text(marked.errorExpression) || text(marked.expression)
    : text(marked.expression);
}

function isErrorMarked(marked: Record<string, unknown>): boolean {
  return marked.isError === true || text(marked.isError).toLowerCase() === "true";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSimpleThirdPersonSFlip(source: string, displayed: string): boolean {
  if (!source || !displayed) return false;
  if (source.endsWith("ies") && displayed === `${source.slice(0, -3)}y`) return true;
  if (displayed.endsWith("ies") && source === `${displayed.slice(0, -3)}y`) return true;
  if (source.endsWith("es") && displayed === source.slice(0, -2)) return true;
  if (displayed.endsWith("es") && source === displayed.slice(0, -2)) return true;
  if (source.endsWith("s") && displayed === source.slice(0, -1)) return true;
  if (displayed.endsWith("s") && source === displayed.slice(0, -1)) return true;
  return false;
}

function isWeakGrammarDecoySurface(surface: string, surrounding: string): boolean {
  if (/^(?:hard|quite|more|misshapen|thicker|as one|one|ones|this|these|those|as a|than|does|latter|former|uneven)$/.test(surface)) {
    return true;
  }
  if (/^looks?$/.test(surface) && /\blooks?\s+more\s+like\b/i.test(surrounding)) return true;
  if (/^looks?\s+more\s+like$/.test(surface)) return true;
  if (/^seems?$/.test(surface) && /\bseems?\s+to\s+[a-z]/i.test(surrounding)) return true;
  if (/^seems?\s+to\s+[a-z]+$/.test(surface)) return true;
  if (surface === "it" && /\b(?:as\s+it\s+might\s+appear|the\s+way\s+it\s+does|it\s+(?:is|was|has|does)|it's)\b/i.test(surrounding)) {
    return true;
  }
  if (surface === "that" && /\bthat\s+way\b/i.test(surrounding)) return true;
  if (surface === "though" && /\bthough\s*,/i.test(surrounding)) return true;
  if (surface === "who" && /\bwho\s+(?:you(?:'re|\s+are)?\s+)?asking\b/i.test(surrounding)) return true;
  if (surface === "depends" && /\b(?:term|mess|thing|fact|answer|result)\b[^.;!?]{0,80}\bdepends\s+on\b/i.test(surrounding)) return true;
  if (surface === "being" && /\b(?:despite|in spite of|because of|due to|without|with)\s+it\s+being\b/i.test(surrounding)) return true;
  return false;
}

function auditLocalGrammarQuestion({
  question,
  difficulty,
  passage,
}: {
  question: Record<string, unknown>;
  difficulty: Difficulty;
  passage?: string;
}): { score: number; pass: boolean; issues: LocalIssue[] } {
  const issues: LocalIssue[] = [];
  const add = (severity: LocalIssue["severity"], code: string, message: string) => {
    issues.push({ severity, code, message });
  };

  const marked = collectMarked(question);
  const correctLabels = collectCorrectLabels(question);
  const wrongExplanations = collectWrongExplanations(question);
  const answerSet = new Set(correctLabels);
  const errorMarked = marked.filter(isErrorMarked);
  const nonAnswerMarked = marked.filter((item) => !answerSet.has(normalizeLabel(item.label)));
  const pointCodes = marked.map(codeOf).filter(Boolean);
  const uniquePointCodes = new Set(pointCodes);
  const answerCodes = errorMarked.map(codeOf).filter(Boolean);
  const explanation = text(question.explanation);
  const passageWithMarkers = text(question.passageWithMarkers);
  const sourceText = `${passage ?? ""} ${passageWithMarkers}`;
  const keyPointAndExplanationText = JSON.stringify([
    question.keyPoints,
    question.explanation,
    question.wrongOptionExplanations,
  ]);

  if (marked.length < 5) {
    add("critical", "marker-count-too-low", `Expected enough marked expressions, got ${marked.length}.`);
  }
  if (correctLabels.length === 0 || errorMarked.length === 0) {
    add("critical", "missing-answer", "No clear answer labels or no marked error.");
  }
  if (correctLabels.length !== errorMarked.length) {
    add(
      "critical",
      "answer-error-count-mismatch",
      `correctAnswer labels (${correctLabels.join(",")}) do not match marked error count (${errorMarked.length}).`,
    );
  }
  if (uniquePointCodes.size < 3) {
    add("major", "weak-point-diversity", `Only ${uniquePointCodes.size} grammar point codes used.`);
  }
  if (difficulty === "KILLER" && uniquePointCodes.size < 4) {
    add("major", "killer-point-diversity-low", "KILLER should feel like a mixed structural item, not one repeated frame.");
  }
  const markerMatches = [...passageWithMarkers.matchAll(/__\([A-Ja-j]\)\s*[^_]+__/g)];
  for (let i = 1; i < markerMatches.length; i += 1) {
    const prev = markerMatches[i - 1];
    const cur = markerMatches[i];
    if (prev.index === undefined || cur.index === undefined) continue;
    const between = passageWithMarkers.slice(prev.index + prev[0].length, cur.index);
    const betweenWords = between.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
    if (betweenWords.length < 2) {
      add("major", "markers-too-dense", "Marked expressions are packed too closely together.");
      break;
    }
  }
  if (/\bwhether\b/i.test(keyPointAndExplanationText) && !/\bwhether\b/i.test(sourceText)) {
    add("major", "unsupported-whether-analysis", "Explanation/keyPoints mention whether even though it is absent from the source/question.");
  }
  if (/다른\s+유력한\s+함정|정답인?\s*\([A-Ja-j]\)[^.!?]{0,80}(?:아니라|다른)|반면[^.!?]{0,160}(?:점검해야|고쳐야|정답)|wrong hypotheses|scratchpad|chain[- ]of[- ]thought/i.test(explanation)) {
    add("major", "self-contradictory-explanation", "Explanation looks like scratchpad/self-correction instead of a polished rationale.");
  }
  for (const item of errorMarked) {
    const surface = displayedSurface(item).toLowerCase();
    const source = sourceSurface(item).toLowerCase();
    const surrounding = text(item.surroundingText).toLowerCase();
    if (
      /\b(?:can|could|may|might|must|shall|should|will|would|do|does|did)\s+[a-z]+ing\b/i.test(surface) ||
      (/^[a-z]+ing$/.test(surface) && new RegExp(`\\b(?:can|could|may|might|must|shall|should|will|would|do|does|did)\\s+${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(surrounding))
    ) {
      add("major", "too-obvious-modal-gerund", `Too visibly broken modal/auxiliary + gerund mutation: ${surface}.`);
    }
    if (
      /\bbeing\s+[a-z]+ing\b/i.test(surface) ||
      (/^[a-z]+ing$/.test(surface) && /\bbeing\s+[a-z]+(?:ed|en)\b/i.test(surrounding))
    ) {
      add("major", "too-obvious-double-ing", `Too visibly broken double -ing mutation: ${surface}.`);
    }
    if (
      /^(?:is|are|was|were|has|have)$/.test(surface) &&
      /\b(?:the|this|that|a|an)\s+[a-z][a-z'-]*\s+(?:is|are|was|were|has|have)\b/i.test(surrounding)
    ) {
      add("major", "too-obvious-local-agreement", `Adjacent determiner+noun+verb agreement flip is too local: ${surface}.`);
    }
    if (
      isSimpleThirdPersonSFlip(source, surface) &&
      new RegExp(`(?:^|[.!?]\\s+|\\b)(?:[a-z]+)\\s+${escapeRegex(source)}\\b`, "i").test(surrounding)
    ) {
      add("major", "too-obvious-adjacent-sv-agreement", `Adjacent subject-verb -s flip is too local: ${surface}.`);
    }
    if (
      /^[a-z]+$/.test(source) &&
      /^[a-z]+ing$/.test(surface) &&
      /\b(?:afford|agree|decide|expect|hope|learn|manage|offer|plan|promise|refuse|want|wish)\s+to\s+[a-z]+\b/i.test(surrounding)
    ) {
      add("major", "too-obvious-to-gerund-after-verb", `Visibly broken to-infinitive complement mutation: ${surface}.`);
    }
    if (/\bbeing\s+[a-z]+(?:ed|en)\b/i.test(source) && /\b(?:are|is|was|were|be|been)?\s*[a-z]+ing\b/i.test(surface)) {
      add("major", "too-obvious-passive-to-gap-ing", `Passive participle changed into incomplete active -ing form: ${surface}.`);
    }
    if (
      difficulty !== "BASIC" &&
      [source, surface].sort().join("|") === "what|who" &&
      /\b(?:who|what)\s+(?:you|we|they|he|she|i|one|'re|are|were|is|was|ask|asking|asked)/i.test(surrounding)
    ) {
      add("major", "semantic-who-what-answer", "who/what with asking is semantic disambiguation, not structural grammar.");
    }
    const adjectiveBase = source.endsWith("ibly")
      ? `${source.slice(0, -4)}ible`
      : source.endsWith("ably")
        ? `${source.slice(0, -4)}able`
        : source.endsWith("ly")
          ? source.slice(0, -2)
          : "";
    if (adjectiveBase && surface === adjectiveBase && new RegExp(`\\b${escapeRegex(source)}\\s+[a-z]+\\b`, "i").test(surrounding)) {
      add("major", "too-obvious-adverb-adjective", `Bare adverb-to-adjective modifier swap is too shallow: ${source} -> ${surface}.`);
    }
    if (source === "is" && surface === "being" && /\bthat\s+is\s*,/i.test(surrounding)) {
      add("major", "fixed-that-is-idiom", "Mutates fixed parenthetical idiom 'that is,' into 'that being'.");
    }
    if (source === "living" && surface === "lived" && /\bpeople\s+living\s+in\b/i.test(surrounding)) {
      add("major", "too-obvious-living-lived", "'people living in' -> 'people lived in' is too visibly broken.");
    }
    if (
      difficulty === "KILLER" &&
      /\b(?:has|have|had|is|are|was|were|be|been)\s+(?:been\s+)?[a-z]+(?:ed|en)\b/i.test(source) &&
      /^[a-z]+(?:ed|en)$/.test(surface)
    ) {
      add("major", "killer-thin-missing-aux", "KILLER answer is a simple missing auxiliary before a participle.");
    }
    if (
      difficulty === "KILLER" &&
      /^(?:who|which|that)$/.test(source) &&
      /^(?:who|which|that)$/.test(surface) &&
      !/\b(?:in|at|on|for|from|through|by|with)\s+(?:which|whom)\b/i.test(surrounding)
    ) {
      add("major", "killer-thin-relative-animacy", "KILLER answer is a simple who/which/that animacy swap.");
    }
  }
  for (const item of marked.filter((candidate) => !isErrorMarked(candidate))) {
    const surface = sourceSurface(item).toLowerCase();
    const surrounding = text(item.surroundingText).toLowerCase();
    if (surface === "who" && /\bwho\s+(?:(?:you|we|they|he|she|i|one)\s+(?:are\s+|were\s+|is\s+|was\s+)?|(?:you|we|they|he|she|i|one)'re\s+)(?:ask|asking|asked)\b/i.test(surrounding)) {
      add("major", "debatable-who-object-decoy", "Correct decoy uses colloquial object who, which can invite who/whom disputes.");
    }
    if (surface === "though" && /\bthough\s*,/i.test(surrounding)) {
      add("major", "debatable-discourse-though-decoy", "Correct decoy marks discourse-adverb though, which is easy to misexplain.");
    }
    if (surface === "that" && /\bthat(?:'s|\s+is)\s+the\s+way\b/i.test(surrounding)) {
      add("major", "demonstrative-that-way-decoy", "Correct decoy marks demonstrative that in 'that's the way'.");
    }
  }
  const weakFillers = marked
    .filter((candidate) => !isErrorMarked(candidate))
    .map((candidate) => ({
      surface: sourceSurface(candidate).toLowerCase(),
      surrounding: text(candidate.surroundingText).toLowerCase(),
    }))
    .filter(({ surface, surrounding }) => isWeakGrammarDecoySurface(surface, surrounding))
    .map(({ surface }) => surface);
  if (weakFillers.length > 0) {
    add("major", "weak-filler-decoys", `Too many weak filler decoys: ${weakFillers.join(", ")}.`);
  }
  if (difficulty !== "BASIC") {
    for (const item of errorMarked) {
      const surface = displayedSurface(item).toLowerCase();
      const source = sourceSurface(item).toLowerCase();
      const surrounding = text(item.surroundingText).toLowerCase();
      if (/^(?:is|are|was|were|has|have|do|does)$/.test(surface) && /\bit\s+(?:is|was|has|does)\b/.test(surrounding)) {
        add("major", "too-obvious-it-agreement", `Too visibly broken local pronoun agreement: ${surface}.`);
      }
      if (source === "that" && surface === "what" && /\b[a-z][a-z'-]*s?\s+that\b/.test(surrounding)) {
        add("major", "too-obvious-noun-what", "Post-nominal N + what relative is too visibly broken for intermediate or harder.");
      }
      if (/^to\s+[a-z]/.test(source) && /^[a-z]+ing$/.test(surface) && /\bseems?\s+to\b/.test(surrounding)) {
        add("major", "too-obvious-seem-gerund", "Simple seem + V-ing mutation is too local and visually broken.");
      }
    }
  }
  if (difficulty === "KILLER") {
    const hasLoadedAnswer = errorMarked.some((item) => {
      const code = codeOf(item);
      const surrounding = text(item.surroundingText);
      return (
        ["b", "c", "d", "i", "k", "l"].includes(code) &&
        (
          surrounding.length >= 70 ||
          /\b(?:which|that|who|whom|whose|where|what|with|without|despite|both|not only|either|neither|than)\b/i.test(surrounding)
        )
      );
    });
    if (!hasLoadedAnswer) {
      add("major", "killer-answer-not-structurally-loaded", "KILLER answer lacks long-distance/cross-clause structural load.");
    }
  }
  if (/(?:나머지|remaining|the rest).{0,40}\([A-Ja-j]\)\s*(?:~|-|–|—|to)\s*\([A-Ja-j]\)/i.test(explanation)) {
    add("major", "range-shorthand-explanation", "Main explanation uses ugly/fragile remaining-label range shorthand.");
  }
  for (const label of correctLabels) {
    if (wrongExplanations[label]) {
      add("critical", "answer-in-wrong-explanations", `Answer label ${label} appears in wrongOptionExplanations.`);
    }
  }
  const expectedWrongExplanationCount = nonAnswerMarked.length;
  if (Object.keys(wrongExplanations).length !== expectedWrongExplanationCount) {
    add(
      "major",
      "wrong-explanation-count",
      `Expected ${expectedWrongExplanationCount} wrong-option explanations, got ${Object.keys(wrongExplanations).length}.`,
    );
  }
  for (const [label, explanationText] of Object.entries(wrongExplanations)) {
    if (explanationText.length < 42) {
      add("minor", "thin-wrong-explanation", `Wrong explanation for ${label} is too thin.`);
    }
    if (/융합\s*관계절|융합관계절/.test(explanationText) && /\bwho\b/i.test(explanationText)) {
      add("major", "misnamed-who-clause", `Wrong explanation for ${label} mislabels a who indirect question as a fused relative.`);
    }
  }
  if (explanation.length < (difficulty === "KILLER" ? 260 : 150)) {
    add("major", "main-explanation-too-thin", "Main explanation is too thin for the requested difficulty.");
  }
  if (!Array.isArray(question.keyPoints) || question.keyPoints.length < (difficulty === "KILLER" ? 3 : 2)) {
    add("minor", "keypoints-too-few", "Key points are too sparse.");
  }

  let score = 100;
  for (const issue of issues) {
    score -= issue.severity === "critical" ? 35 : issue.severity === "major" ? 15 : 5;
  }
  score = Math.max(0, score);
  return {
    score,
    pass: !issues.some((issue) => issue.severity !== "minor") && score >= 92,
    issues,
  };
}

function buildJudgePrompt({
  passage,
  question,
  generationPlan,
  difficulty,
  localIssues,
}: {
  passage: string;
  question: Record<string, unknown>;
  generationPlan: GenerationPlan;
  difficulty: Difficulty;
  localIssues: LocalIssue[];
}) {
  return [
    "You are an adversarial Korean CSAT/평가원 English grammar-item reviewer.",
    "Judge whether this generated GRAMMAR_ERROR item is genuinely publication-grade.",
    "Be strict. Passing means a paying academy director would feel the item is elegant, unambiguous, and exam-like.",
    "Return ONLY compact JSON matching the schema. No markdown, no prose outside JSON.",
    "Keep each issue under 160 characters. Use at most 2 fatalIssues, 3 majorIssues, 2 minorIssues, 3 strengths.",
    "",
    "Fail if any of these are true:",
    "- the answer is grammatically debatable or not source-backed",
    "- the wrong form is too visibly broken for the difficulty",
    "- distractors are padded, shallow, or not attractive",
    "- explanations use wrong grammar terminology or confuse displayed wrong form vs correction",
    "- KILLER does not require long-distance/cross-clause structure",
    "- the item feels like AI-made formatting compliance rather than CSAT-style design",
    "",
    "Schema note:",
    "- For markedExpressions where isError=true, expression/correction are the original correct source form, and errorExpression is the student-visible wrong form.",
    "- Do NOT fail merely because expression differs from errorExpression. Fail only if the visible passage/options/explanation contradict each other.",
    "",
    "Scoring guide:",
    "95-100: excellent, 평가원-like, clean trap and elegant explanations",
    "90-94: usable but not breathtaking; verdict must be fail for this audit",
    "80-89: ordinary academy item",
    "<80: defective or too easy",
    "",
    `Generation plan: ${generationPlan}`,
    `Difficulty: ${difficulty}`,
    "",
    "Local deterministic issues:",
    JSON.stringify(localIssues, null, 2),
    "",
    "Original passage:",
    passage,
    "",
    "Generated question JSON:",
    JSON.stringify(question, null, 2),
  ].join("\n");
}

async function main() {
  const summaryOnlyInput = process.env.GRAMMAR_LOOP_SUMMARY_ONLY ?? process.env.GRAMMAR_LOOP_INPUT;
  if (summaryOnlyInput) {
    const inputPath = path.resolve(process.cwd(), summaryOnlyInput);
    const summaryPath =
      process.env.GRAMMAR_LOOP_SUMMARY_OUT ??
      defaultSummaryPath(inputPath);
    const rows = readJsonlRows(inputPath);
    const summary = buildAuditSummary(rows, inputPath);
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");
    console.log(`Wrote ${summaryPath}`);
    console.log(JSON.stringify(summary));
    return;
  }

  const [
    { prisma },
    { buildQuestionAnnotationBlock },
    { DIFF_DESCRIPTION },
    { buildAnalysisContext, extractTeacherAnnotations },
    { runQuestionGenerationWithEmptyRetry },
    { generateQuestionObject },
  ] = await Promise.all([
    import("../src/lib/prisma"),
    import("../src/lib/annotation-prompt"),
    import("../src/app/api/ai/generate-questions-auto/_lib/constants"),
    import("../src/app/api/ai/generate-questions-auto/_lib/build-analysis-context"),
    import("../src/app/api/ai/generate-questions-auto/_lib/run-question-generation"),
    import("../src/lib/question-generation-llm"),
  ]);

  const academyId = process.env.GRAMMAR_LOOP_ACADEMY_ID ?? DEFAULT_ACADEMY_ID;
  const runLimit = readIntEnv("GRAMMAR_LOOP_RUNS", 12);
  const passageLimit = readIntEnv("GRAMMAR_LOOP_PASSAGES", 10);
  const maxAttempts = readIntEnv("GRAMMAR_LOOP_ATTEMPTS", 2);
  const useLlmJudge = readBoolEnv("GRAMMAR_LOOP_LLM_JUDGE", true);
  const generationPlans = readListEnv<GenerationPlan>(
    "GRAMMAR_LOOP_PLANS",
    ["STANDARD", "PREMIUM"],
    ["STANDARD", "PREMIUM"],
  );
  const difficulties = readListEnv<Difficulty>(
    "GRAMMAR_LOOP_DIFFICULTIES",
    ["BASIC", "INTERMEDIATE", "KILLER"],
    ["BASIC", "INTERMEDIATE", "KILLER"],
  );
  const cases = CASES.filter((item) => difficulties.includes(item.difficulty));

  const passages = await prisma.passage.findMany({
    where: {
      academyId,
      OR: [{ subject: null }, { subject: { not: "KOREAN" } }],
    },
    orderBy: { updatedAt: "desc" },
    take: passageLimit,
    include: {
      school: { select: { type: true } },
      notes: { orderBy: { order: "asc" } },
      analysis: { select: { analysisData: true } },
    },
  });

  const outDir = path.join(process.cwd(), "artifacts", "ai-audits");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath =
    process.env.GRAMMAR_LOOP_OUT ??
    path.join(outDir, `grammar-quality-loop-${Date.now()}.jsonl`);
  const summaryPath = defaultSummaryPath(outPath);
  const rows: Array<Record<string, unknown>> = [];
  let runIndex = 0;

  outer: for (const generationPlan of generationPlans) {
    for (const passage of passages) {
      for (const testCase of cases) {
        if (runIndex >= runLimit) break outer;
        runIndex += 1;
        const startedAt = Date.now();
        const usageEvents: unknown[] = [];
        const diffInstruction =
          DIFF_DESCRIPTION[testCase.difficulty] ?? DIFF_DESCRIPTION.INTERMEDIATE;
        const teacherIntentBlock = buildQuestionAnnotationBlock(
          extractTeacherAnnotations(passage),
        );
        const analysisContext = buildAnalysisContext(passage);
        const logPrefix = `GRAMMAR-QUALITY:${runIndex}:${generationPlan}:${testCase.difficulty}`;
        const deadlineAt = Date.now() + (generationPlan === "PREMIUM" ? 360_000 : 180_000);

        try {
          const result = await runQuestionGenerationWithEmptyRetry(
            {
              plan: [
                {
                  subType: testCase.type,
                  count: 1,
                  reason: "Grammar quality loop",
                  targetPoints: [],
                },
              ],
              schoolType: passage.school?.type === "MIDDLE" ? "중학교" : "고등학교",
              gradeInfo: passage.grade ? `${passage.grade}학년` : "",
              passageContent: passage.content,
              teacherIntentBlock,
              analysisContext,
              diffLabel: testCase.difficulty,
              diffInstruction,
              generationPlan,
              typeSettings: {
                [testCase.type]: {
                  ...testCase.settings,
                  difficulty: testCase.difficulty,
                  generationPlan,
                },
              },
              onModelUsage: (event) => usageEvents.push(event),
            },
            {
              maxAttempts,
              logPrefix,
              deadlineAt,
            },
          );

          const question = result.questions[0] ?? null;
          const localAudit = question
            ? auditLocalGrammarQuestion({
                question,
                difficulty: testCase.difficulty,
                passage: passage.content,
              })
            : {
                score: 0,
                pass: false,
                issues: [
                  {
                    severity: "critical" as const,
                    code: "no-question",
                    message: "Generation returned no question.",
                  },
                ],
              };

          let llmJudge: z.infer<typeof LlmJudgeSchema> | null = null;
          let llmJudgeError: string | null = null;
          if (useLlmJudge && question) {
            const judgePlan: GenerationPlan =
              generationPlan === "PREMIUM" ? "STANDARD" : "PREMIUM";
            try {
              const judgeResult = await generateQuestionObject({
                schema: LlmJudgeSchema,
                generationPlan: judgePlan,
                prompt: buildJudgePrompt({
                  passage: passage.content,
                  question,
                  generationPlan,
                  difficulty: testCase.difficulty,
                  localIssues: localAudit.issues,
                }),
                logPrefix: `${logPrefix}:JUDGE:${judgePlan}`,
                maxTokens: 8192,
                maxRetries: 1,
                timeoutMs: judgePlan === "PREMIUM" ? 180_000 : 90_000,
              });
              llmJudge = judgeResult.object;
            } catch (error) {
              llmJudgeError = error instanceof Error ? error.message : String(error);
            }
          }

          const pass =
            result.questions.length > 0 &&
            localAudit.pass &&
            !llmJudgeError &&
            (!llmJudge || (llmJudge.verdict === "pass" && llmJudge.score >= 95));

          const row = {
            runIndex,
            ok: pass,
            generated: result.questions.length > 0,
            generationPlan,
            difficulty: testCase.difficulty,
            passageId: passage.id,
            title: passage.title,
            durationMs: Date.now() - startedAt,
            attempts: result.attempts,
            relaxedFallback: result.relaxedFallback,
            rejectionSummary: result.rejectionSummary,
            localAudit,
            llmJudge,
            llmJudgeError,
            usageEvents,
            question,
          };
          rows.push(row);
          fs.appendFileSync(outPath, `${JSON.stringify(row)}\n`, "utf8");
          console.log(
            JSON.stringify({
              runIndex,
              ok: row.ok,
              generationPlan,
              difficulty: testCase.difficulty,
              localScore: localAudit.score,
              llmScore: llmJudge?.score,
              localIssues: localAudit.issues.map((issue) => issue.code),
              llmFatal: llmJudge?.fatalIssues,
              llmMajor: llmJudge?.majorIssues,
            }),
          );
        } catch (error) {
          const row = {
            runIndex,
            ok: false,
            generated: false,
            generationPlan,
            difficulty: testCase.difficulty,
            passageId: passage.id,
            title: passage.title,
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
            usageEvents,
          };
          rows.push(row);
          fs.appendFileSync(outPath, `${JSON.stringify(row)}\n`, "utf8");
          console.log(JSON.stringify(row));
        }
      }
    }
  }

  const summary = buildAuditSummary(rows, outPath);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${summaryPath}`);
  console.log(JSON.stringify(summary));

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
