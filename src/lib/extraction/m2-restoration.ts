import { z } from "zod";
import type { ProblemEvidenceResponse } from "./problem-evidence";

export const restorationChangeSchema = z.object({
  sentenceOrder: z.number().int().min(1).nullable().optional(),
  before: z.string().default(""),
  after: z.string().default(""),
  reason: z.string().default(""),
  evidenceQuestionNumber: z.number().int().min(1).nullable().optional(),
  evidenceType: z
    .enum([
      "VOCAB",
      "GRAMMAR",
      "WORD_ORDER",
      "BLANK",
      "INSERTION",
      "ORDERING",
      "SUMMARY",
      "SOURCE_MATCH",
      "MANUAL_REQUIRED",
      "OTHER",
    ])
    .default("OTHER"),
  confidence: z.number().min(0).max(1).default(0.5),
});

export const restorationSentenceSchema = z.object({
  order: z.number().int().min(1),
  text: z.string(),
  status: z.enum(["OK", "RESTORED", "CHECK", "UNRESOLVED"]).default("OK"),
});

export const passageRestorationResponseSchema = z.preprocess(
  normalizeRestorationResponse,
  z.object({
    status: z
      .enum(["ORIGINAL_MATCHED", "RESTORED", "PARTIAL", "FAILED"])
      .default("PARTIAL"),
    method: z
      .enum(["SOURCE_MATCH", "QUESTION_EVIDENCE", "MIXED", "FAILED"])
      .default("QUESTION_EVIDENCE"),
    restoredText: z.string(),
    confidence: z.number().min(0).max(1).default(0.5),
    sentences: z.array(restorationSentenceSchema).default([]),
    changes: z.array(restorationChangeSchema).default([]),
    unresolvedMarkers: z.array(z.string()).default([]),
    warnings: z.array(z.string()).default([]),
  }),
);

export const passageVerificationResponseSchema = z.preprocess(
  normalizeVerificationResponse,
  z.object({
    status: z.enum(["PASS", "WARN", "FAIL"]).default("WARN"),
    confidence: z.number().min(0).max(1).default(0.5),
    warnings: z.array(z.string()).default([]),
    remainingProblemMarkers: z.array(z.string()).default([]),
    suspiciousChanges: z.array(z.string()).default([]),
    teacherReviewRequired: z.boolean().default(true),
  }),
);

// ─── Grounded restoration (one-shot search + restore + compare) ──────────────
// 한 호출 안에서 google_search 툴로 출처 검색 + 별도로 풀이 정보 기반 AI 복원을
// 동시에 진행하고 두 결과를 비교한다. cascade(grounding 호출 → restoration 호출
// 분리)를 단일 호출로 압축해 호출 수와 토큰을 줄이고, 출처 ↔ AI 복원 cross-check
// 검증을 응답 안에서 받는다.
export const groundedSourceMatchSchema = z.object({
  title: z.string().default(""),
  url: z.string().nullable().optional(),
  publisher: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  content: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0),
  reason: z.string().default(""),
});

export const groundedAiRestorationSchema = z.object({
  status: z.enum(["RESTORED", "PARTIAL", "FAILED"]).default("PARTIAL"),
  method: z
    .enum(["SOURCE_MATCH", "QUESTION_EVIDENCE", "MIXED", "FAILED"])
    .default("QUESTION_EVIDENCE"),
  restoredText: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.5),
  sentences: z.array(restorationSentenceSchema).default([]),
  changes: z.array(restorationChangeSchema).default([]),
  unresolvedMarkers: z.array(z.string()).default([]),
});

export const groundedComparisonSchema = z.object({
  agreement: z.number().min(0).max(1).default(0),
  differences: z.array(z.string()).default([]),
  recommendation: z
    .enum([
      "SOURCE_PRIMARY",
      "AI_PRIMARY",
      "BOTH_AGREE",
      "TEACHER_REVIEW_REQUIRED",
    ])
    .default("TEACHER_REVIEW_REQUIRED"),
});

export const groundedRestorationResponseSchema = z.preprocess(
  normalizeGroundedRestorationResponse,
  z.object({
    sourceMatch: groundedSourceMatchSchema.nullable().optional(),
    aiRestoration: groundedAiRestorationSchema,
    comparison: groundedComparisonSchema.nullable().optional(),
    finalRestoredText: z.string().default(""),
    finalStatus: z
      .enum(["RESTORED", "PARTIAL", "FAILED"])
      .default("PARTIAL"),
    finalMethod: z
      .enum(["SOURCE_MATCH", "QUESTION_EVIDENCE", "MIXED", "FAILED"])
      .default("QUESTION_EVIDENCE"),
    warnings: z.array(z.string()).default([]),
  }),
);

export type PassageRestorationResponse = z.infer<
  typeof passageRestorationResponseSchema
>;
export type PassageVerificationResponse = z.infer<
  typeof passageVerificationResponseSchema
>;
export type GroundedRestorationResponse = z.infer<
  typeof groundedRestorationResponseSchema
>;
export type GroundedSourceMatch = z.infer<typeof groundedSourceMatchSchema>;
export type GroundedAiRestoration = z.infer<typeof groundedAiRestorationSchema>;
export type GroundedComparison = z.infer<typeof groundedComparisonSchema>;

// ─── Batched grounded restoration ────────────────────────────────────────────
// 여러 draft 를 한 grounded 호출에 묶어서 처리한다.
// - Google Search 도구 호출당 과금($0.035/query)이 비용의 ~80%인 점을 고려해
//   호출 수 자체를 줄이는 게 효과가 크다.
// - 모델은 각 task 에 대해 (A) source-match via search, (B) AI restoration from
//   evidence, (C) comparison & final pick 을 동일하게 수행하고, 결과를 array
//   형태로 반환한다.
// - 응답이 어떤 task 의 결과인지 키잉을 위해 사용자가 부여한 `id` 를 그대로
//   에코해야 한다.
export const groundedRestorationBatchItemSchema = z.object({
  id: z.string(),
  sourceMatch: groundedSourceMatchSchema.nullable().optional(),
  aiRestoration: groundedAiRestorationSchema,
  comparison: groundedComparisonSchema.nullable().optional(),
  finalRestoredText: z.string().default(""),
  finalStatus: z.enum(["RESTORED", "PARTIAL", "FAILED"]).default("PARTIAL"),
  finalMethod: z
    .enum(["SOURCE_MATCH", "QUESTION_EVIDENCE", "MIXED", "FAILED"])
    .default("QUESTION_EVIDENCE"),
  warnings: z.array(z.string()).default([]),
});

export const groundedRestorationBatchResponseSchema = z.preprocess(
  (value) => {
    // 응답이 배열로 오는 케이스도, { results: [...] } 형태로 오는 케이스도
    // 모두 받아들인다. 정규화는 per-item 으로 위임.
    if (!value || typeof value !== "object") return value;
    const row = value as Record<string, unknown>;
    const rawList = Array.isArray(row.results)
      ? row.results
      : Array.isArray(value)
        ? (value as unknown[])
        : Array.isArray(row.items)
          ? row.items
          : [];
    const results = rawList.map((item) => {
      if (!item || typeof item !== "object") return item;
      const normalized = normalizeGroundedRestorationResponse(item);
      // 정규화 후에도 id 가 누락되면 그대로 둠(Zod 가 reject).
      return normalized;
    });
    return { results };
  },
  z.object({
    results: z.array(groundedRestorationBatchItemSchema).default([]),
  }),
);

export type GroundedRestorationBatchItem = z.infer<
  typeof groundedRestorationBatchItemSchema
>;
export type GroundedRestorationBatchResponse = z.infer<
  typeof groundedRestorationBatchResponseSchema
>;

export interface RestorationQuestionInput {
  questionNumber: number | null;
  stem: string;
  choices: Array<{
    label: string;
    content: string;
    isAnswer: boolean;
  }>;
  explanation: string | null;
}

export interface SourceMatchInput {
  title: string;
  sourceType: string;
  confidence: number;
  reason: string;
  content?: string;
  sourceId?: string;
  sourceRef?: string;
  publisher?: string;
  unit?: string;
  year?: number;
  metadata?: Record<string, unknown>;
}

export interface BuildRestorationPromptInput {
  problemText: string;
  questions: RestorationQuestionInput[];
  sourceMatches: SourceMatchInput[];
  problemEvidence?: ProblemEvidenceResponse | null;
}

function normalizeGroundedRestorationResponse(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const row = value as Record<string, unknown>;
  const aiRestorationRaw =
    row.aiRestoration && typeof row.aiRestoration === "object"
      ? (row.aiRestoration as Record<string, unknown>)
      : {};
  const aiRestoration = {
    ...aiRestorationRaw,
    status: normalizeFinalStatus(aiRestorationRaw.status),
    method: normalizeRestorationMethod(aiRestorationRaw.method),
    sentences: normalizeSentenceArray(aiRestorationRaw.sentences),
    changes: normalizeChangeArray(aiRestorationRaw.changes),
    unresolvedMarkers: normalizeStringArray(
      aiRestorationRaw.unresolvedMarkers,
    ),
  };
  const sourceMatchRaw =
    row.sourceMatch && typeof row.sourceMatch === "object"
      ? (row.sourceMatch as Record<string, unknown>)
      : null;
  const sourceMatch = sourceMatchRaw
    ? {
        ...sourceMatchRaw,
        title:
          typeof sourceMatchRaw.title === "string" ? sourceMatchRaw.title : "",
        content:
          typeof sourceMatchRaw.content === "string"
            ? sourceMatchRaw.content
            : "",
        url:
          typeof sourceMatchRaw.url === "string" ? sourceMatchRaw.url : null,
        publisher:
          typeof sourceMatchRaw.publisher === "string"
            ? sourceMatchRaw.publisher
            : null,
        year:
          typeof sourceMatchRaw.year === "number" ? sourceMatchRaw.year : null,
        confidence:
          typeof sourceMatchRaw.confidence === "number"
            ? sourceMatchRaw.confidence
            : 0,
        reason:
          typeof sourceMatchRaw.reason === "string"
            ? sourceMatchRaw.reason
            : "",
      }
    : null;
  const comparisonRaw =
    row.comparison && typeof row.comparison === "object"
      ? (row.comparison as Record<string, unknown>)
      : null;
  const comparison = comparisonRaw
    ? {
        ...comparisonRaw,
        agreement:
          typeof comparisonRaw.agreement === "number"
            ? comparisonRaw.agreement
            : 0,
        differences: normalizeStringArray(comparisonRaw.differences),
        recommendation: normalizeComparisonRecommendation(
          comparisonRaw.recommendation,
        ),
      }
    : null;
  return {
    ...row,
    sourceMatch,
    aiRestoration,
    comparison,
    finalRestoredText:
      typeof row.finalRestoredText === "string" ? row.finalRestoredText : "",
    finalStatus: normalizeFinalStatus(row.finalStatus),
    finalMethod: normalizeRestorationMethod(row.finalMethod),
    warnings: normalizeStringArray(row.warnings),
  };
}

function normalizeFinalStatus(value: unknown): string {
  const status = String(value ?? "").toUpperCase();
  if (
    status === "ORIGINAL_MATCHED" ||
    status === "ORIGINAL" ||
    status === "MATCHED" ||
    status === "SUCCESS" ||
    status === "COMPLETE" ||
    status === "COMPLETED"
  ) {
    return "RESTORED";
  }
  if (status === "NEEDS_REVIEW" || status === "WARN") return "PARTIAL";
  if (status === "RESTORED" || status === "PARTIAL" || status === "FAILED") {
    return status;
  }
  return status || "PARTIAL";
}

function normalizeComparisonRecommendation(value: unknown): string {
  const rec = String(value ?? "").toUpperCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    SOURCE: "SOURCE_PRIMARY",
    USE_SOURCE: "SOURCE_PRIMARY",
    PREFER_SOURCE: "SOURCE_PRIMARY",
    AI: "AI_PRIMARY",
    USE_AI: "AI_PRIMARY",
    PREFER_AI: "AI_PRIMARY",
    AGREE: "BOTH_AGREE",
    BOTH: "BOTH_AGREE",
    REVIEW: "TEACHER_REVIEW_REQUIRED",
    MANUAL: "TEACHER_REVIEW_REQUIRED",
    UNCLEAR: "TEACHER_REVIEW_REQUIRED",
  };
  const normalized = aliases[rec] ?? rec;
  if (
    normalized === "SOURCE_PRIMARY" ||
    normalized === "AI_PRIMARY" ||
    normalized === "BOTH_AGREE" ||
    normalized === "TEACHER_REVIEW_REQUIRED"
  ) {
    return normalized;
  }
  return "TEACHER_REVIEW_REQUIRED";
}

function normalizeRestorationResponse(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const row = value as Record<string, unknown>;
  return {
    ...row,
    status: normalizeRestorationStatus(row.status),
    method: normalizeRestorationMethod(row.method),
    sentences: normalizeSentenceArray(row.sentences),
    changes: normalizeChangeArray(row.changes),
    warnings: normalizeStringArray(row.warnings),
    unresolvedMarkers: normalizeStringArray(row.unresolvedMarkers),
  };
}

function normalizeVerificationResponse(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const row = value as Record<string, unknown>;
  return {
    ...row,
    status: normalizeVerificationStatus(row.status),
    warnings: normalizeStringArray(row.warnings),
    remainingProblemMarkers: normalizeStringArray(row.remainingProblemMarkers),
    suspiciousChanges: normalizeStringArray(row.suspiciousChanges),
  };
}

function normalizeRestorationStatus(value: unknown): string {
  const status = String(value ?? "").toUpperCase();
  if (status === "SUCCESS" || status === "COMPLETE" || status === "COMPLETED") {
    return "RESTORED";
  }
  if (status === "MATCHED" || status === "ORIGINAL") return "ORIGINAL_MATCHED";
  if (status === "NEEDS_REVIEW" || status === "WARN") return "PARTIAL";
  return status || "PARTIAL";
}

function normalizeRestorationMethod(value: unknown): string {
  const method = String(value ?? "").toUpperCase();
  if (
    method === "NONE" ||
    method === "INSUFFICIENT_DATA" ||
    method === "UNSUPPORTED" ||
    method === "FAILURE"
  ) {
    return "FAILED";
  }
  if (method.includes("MIXED") || method.includes("HYBRID") || method.includes("COMBINED")) {
    return "MIXED";
  }
  if (method.includes("SOURCE") && method.includes("QUESTION")) return "MIXED";
  if (
    method.includes("SOURCE") ||
    method.includes("MATCH") ||
    method.includes("ORIGINAL") ||
    method.includes("DATABASE") ||
    method.includes("REFERENCE")
  ) {
    return "SOURCE_MATCH";
  }
  if (
    method.includes("QUESTION") ||
    method.includes("SOLV") ||
    method.includes("PROBLEM") ||
    method.includes("SHEET") ||
    method.includes("OCR") ||
    method.includes("DIRECT") ||
    method.includes("PASSAGE") ||
    method.includes("TEXT") ||
    method.includes("EVIDENCE") ||
    method.includes("INFERENCE") ||
    method.includes("RECONSTRUCT") ||
    method.includes("RESTORATION") ||
    method.includes("LOGICAL") ||
    method.includes("EXTRACT") ||
    method.includes("DIALOGUE") ||
    method.includes("CONTEXT")
  ) {
    return "QUESTION_EVIDENCE";
  }
  // Final safety net — anything else falls back to the most general option so
  // schema validation cannot reject a useful AI restoration just because the
  // model invented its own method label.
  if (
    method !== "SOURCE_MATCH" &&
    method !== "QUESTION_EVIDENCE" &&
    method !== "MIXED" &&
    method !== "FAILED"
  ) {
    return "QUESTION_EVIDENCE";
  }
  return method;
}

function normalizeVerificationStatus(value: unknown): string {
  const status = String(value ?? "").toUpperCase();
  if (
    status === "SUCCESS" ||
    status === "OK" ||
    status === "VALID" ||
    status === "VERIFIED" ||
    status === "VERIFIED_WITH_WARNINGS"
  ) {
    return "PASS";
  }
  if (status === "NEEDS_REVISION" || status === "NEEDS_REVIEW") return "WARN";
  return status || "WARN";
}

function normalizeSentenceArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (typeof item === "string") {
      return { order: index + 1, text: item, status: "RESTORED" };
    }
    if (item && typeof item === "object") {
      return { order: index + 1, ...(item as Record<string, unknown>) };
    }
    return { order: index + 1, text: String(item ?? ""), status: "CHECK" };
  });
}

function normalizeChangeArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") {
      return {
        before: "",
        after: "",
        reason: item,
        evidenceType: "OTHER",
        confidence: 0.5,
      };
    }
    return item;
  });
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return typeof value === "string" && value.trim() ? [value] : [];
  }
  return value
    .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
    .filter((item) => item.trim().length > 0);
}

function stringifyQuestions(questions: RestorationQuestionInput[]): string {
  if (questions.length === 0) return "(no linked questions)";
  return questions
    .map((q, idx) => {
      const choices = q.choices
        .map(
          (c) =>
            `${c.label}${c.isAnswer ? " [ANSWER_MARK]" : ""}: ${c.content}`,
        )
        .join("\n");
      return [
        `Question ${q.questionNumber ?? idx + 1}`,
        `Stem: ${q.stem}`,
        choices ? `Choices:\n${choices}` : "Choices: (none)",
        q.explanation ? `Explanation: ${q.explanation}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function stringifySourceMatches(matches: SourceMatchInput[]): string {
  if (matches.length === 0) return "(no source candidates)";
  return matches
    .map((m, idx) =>
      [
        `Candidate ${idx + 1}: ${m.title}`,
        `type=${m.sourceType}; confidence=${m.confidence}`,
        `reason=${m.reason}`,
        m.content ? `content=${m.content.slice(0, 4000)}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

function stringifyProblemEvidence(evidence: ProblemEvidenceResponse | null | undefined): string {
  if (!evidence) return "(no first-pass problem evidence)";
  return JSON.stringify(
    {
      status: evidence.status,
      confidence: evidence.confidence,
      sourceHints: evidence.sourceHints,
      questions: evidence.questions.map((question) => ({
        questionNumber: question.questionNumber ?? null,
        questionType: question.questionType,
        typeLabel: question.typeLabel,
        confidence: question.confidence,
        answer: question.answer ?? null,
        answerConfidence: question.answerConfidence ?? null,
        evidence: question.evidence,
        restorationActions: question.restorationActions,
        warnings: question.warnings,
      })),
      globalActions: evidence.globalActions,
      unresolved: evidence.unresolved,
      warnings: evidence.warnings,
    },
    null,
    2,
  );
}

export function buildRestorationPrompts(input: BuildRestorationPromptInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt:
      "You restore English study passages from Korean school problem sheets. " +
      "Use only evidence from source candidates and the linked questions. " +
      "Do not invent unsupported content. Return strict JSON only.",
    userPrompt: [
      "Restore the problem-mutated passage into the clean original study passage.",
      "",
      "Rules:",
      "- If a source candidate clearly matches, use that original text.",
      "- Otherwise use the first-pass problem evidence and linked questions to recover the original passage.",
      "- Preserve paragraph order.",
      "- For questions whose sentences/paragraphs are labelled with parenthesised uppercase letters — ordering questions use `(A)`~`(D)`, vocab-choice / 동의어 / multi-choice 본문 problems can go up to `(A)`~`(I)` (rarely beyond) — **YOU MUST STRIP every such `(LETTER)` label from the output for letters A through Z**. The restored text must read as a single continuous passage with NO chunk labels remaining anywhere.",
      "- For referent / 'underlined (a)~(e)' questions (e.g. \"밑줄 친 (a)~(e) 중...\"): the `(a)`, `(b)`, `(c)`, `(d)`, `(e)` parentheses are problem-sheet markers slapped onto specific words. **YOU MUST REMOVE every `(a)`, `(b)`, `(c)`, `(d)`, `(e)` inline marker from the restored text**, keeping the underlying word intact.",
      "- For insertion questions, place the given/boxed sentence at the solved marker position from problemEvidence.answer or INSERT_SENTENCE.target. If target is BEST_SUPPORTED_POSITION_MARKER, solve the marker from the local logic before restoring. Remove all position markers.",
      "- For irrelevant sentence questions, remove only the sentence identified as unrelated by evidence.",
      "- For school writing/word-order questions, use the model answer only when it is supported by the raw text or question evidence.",
      "- Remove problem-only markers such as @, underlines, bracketed base forms, and answer-choice word-order fragments.",
      "- If labeled chunks, word-order fragments, bracketed base forms, or other problem markers remain, status must be PARTIAL or FAILED, never RESTORED.",
      "- If evidence is insufficient, keep the best supported text and mark PARTIAL or FAILED.",
      "- Split the restored passage into numbered English sentences.",
      "- Return JSON matching: { status, method, restoredText, confidence, sentences, changes, unresolvedMarkers, warnings }.",
      "",
      "Problem-sheet passage:",
      input.problemText,
      "",
      "Linked questions:",
      stringifyQuestions(input.questions),
      "",
      "First-pass problem evidence:",
      stringifyProblemEvidence(input.problemEvidence),
      "",
      "Source candidates:",
      stringifySourceMatches(input.sourceMatches),
    ].join("\n"),
  };
}

function stringifyLocalSourceMatches(matches: SourceMatchInput[]): string {
  if (matches.length === 0) return "(no local DB candidates)";
  return matches
    .slice(0, 3)
    .map((m, idx) =>
      [
        `Local candidate ${idx + 1}: ${m.title}`,
        `confidence=${m.confidence}; reason=${m.reason}`,
        m.content ? `content=${m.content.slice(0, 1500)}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

export interface BuildGroundedRestorationPromptInput {
  problemText: string;
  questions: RestorationQuestionInput[];
  problemEvidence?: ProblemEvidenceResponse | null;
  localSourceMatches?: SourceMatchInput[];
}

/**
 * Single-call grounded restoration prompt.
 *
 * The model is given:
 *   - problem-mutated raw text
 *   - linked questions
 *   - first-pass problem evidence (if 1차 OCR / problem-evidence already ran)
 *   - any local DB candidate matches that didn't cross the auto-accept threshold
 *
 * The model is asked to perform THREE separate investigations in one call:
 *   (A) google_search 으로 출처 찾기 → sourceMatch.content 에 출처 원문 verbatim
 *   (B) 출처 사용 금지, raw + problem-evidence 만으로 AI 복원 → aiRestoration
 *   (C) 두 결과 비교 → comparison + finalRestoredText 결정
 *
 * Strict JSON output guards against schema drift; `method` enum is explicitly
 * listed in-prompt so the model doesn't free-write the field.
 */
export function buildGroundedRestorationPrompts(
  input: BuildGroundedRestorationPromptInput,
): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt:
      "You restore English study passages from Korean school problem sheets. " +
      "**Primary restorer = AI reading the raw problem text and the question evidence.** " +
      "google_search is a SECONDARY reference tool — use it to find the original source ONLY to verify specific problem-coupled spans (grammar/vocab answer positions, blanks) and to fix obvious OCR noise. " +
      "You must NOT replace teacher-edited passages with the source verbatim — the teacher's intentional edits (rewording, condensing, rewritten endings) are pedagogical and must be preserved. " +
      "Do not invent text that isn't supported by either the raw passage, the question evidence, or a confidently-matched source. " +
      "Return strict JSON only — no markdown, no commentary.",
    userPrompt: [
      "## Pipeline (run all three in ONE response — B is the MAIN restorer)",
      "",
      "### Investigation A — Source lookup (REFERENCE ONLY, optional)",
      "- Use google_search to look up the original source (book / article / textbook).",
      "- If found, copy the original passage verbatim into `sourceMatch.content` (no paraphrase).",
      "- If not confidently found, set `sourceMatch` to null and stop searching.",
      "- **Sanity check**: if the candidate source's overall meaning / topic diverges substantially from the raw passage (i.e. you matched a different text), treat it as NOT found and set `sourceMatch` to null. Better no source than a wrong source.",
      "- This output is REFERENCE for Investigation C — it is NOT the answer.",
      "",
      "### Investigation B — AI restoration (PRIMARY)",
      "- This is the main restoration path. Use the raw passage and the question evidence to reconstruct the passage as the teacher intends students to read it.",
      "- Apply the Restoration rules below: strip problem-only markers, place boxed/reordered sentences, drop the irrelevant sentence, fill blanks from evidence, fix grammar/vocab where the question identifies the answer position, etc.",
      "- **Do NOT consult `sourceMatch` for this investigation.** Treat raw + evidence as your only inputs.",
      "- Put the result in `aiRestoration.restoredText`. This is the starting point for `finalRestoredText`.",
      "- `aiRestoration.method` MUST be exactly one of: \"SOURCE_MATCH\" | \"QUESTION_EVIDENCE\" | \"MIXED\" | \"FAILED\". Use \"QUESTION_EVIDENCE\" for this investigation.",
      "- `aiRestoration.status` MUST be exactly one of: \"RESTORED\" | \"PARTIAL\" | \"FAILED\".",
      "",
      "### Investigation C — Source-assisted patching (build finalRestoredText)",
      "- **Start from `aiRestoration.restoredText` verbatim.**",
      "- If `sourceMatch` is null OR `sourceMatch` differs from raw in too many places to be a confident match: emit `aiRestoration.restoredText` unchanged. Set `comparison` to null, `finalMethod = \"QUESTION_EVIDENCE\"`.",
      "- If `sourceMatch` is present and largely overlaps with raw, walk the diffs between `aiRestoration.restoredText` and `sourceMatch.content`. Apply the Variant classification policy below. Patch ONLY #1 (problem-coupled) and #3 (OCR noise) spans with source text. Leave every other diff as-is (= AI's reconstruction).",
      "- After patching, set `finalMethod`:",
      "    \"MIXED\"           when at least one source patch was applied",
      "    \"QUESTION_EVIDENCE\" when no source patch was needed / applied",
      "    \"SOURCE_MATCH\"    only if raw was already nearly identical to source and AI did almost nothing (rare)",
      "    \"FAILED\"          if the passage could not be restored at all",
      "- `comparison.agreement` = 0~1 sentence-level overlap between aiRestoration and sourceMatch (when both exist).",
      "- `comparison.differences` should list meaningful diffs you DID NOT patch (= suspected author edits or ambiguous), so the teacher can review.",
      "- `comparison.recommendation` MUST be one of: \"SOURCE_PRIMARY\" | \"AI_PRIMARY\" | \"BOTH_AGREE\" | \"TEACHER_REVIEW_REQUIRED\". Under this pipeline the default is \"AI_PRIMARY\" — only use \"SOURCE_PRIMARY\" when raw and source are nearly identical and AI added no edits.",
      "- `finalStatus` MUST be exactly one of: \"RESTORED\" | \"PARTIAL\" | \"FAILED\".",
      "",
      "## Restoration rules (apply in Investigation B and to finalRestoredText)",
      "- Preserve paragraph order, capitalization, original punctuation.",
      "- For questions whose sentences/paragraphs are labelled with parenthesised uppercase letters — ordering questions use `(A)`~`(D)`, vocab-choice / 동의어 / multi-choice 본문 problems can go up to `(A)`~`(I)` (rarely beyond) — **YOU MUST STRIP every such `(LETTER)` label from the output for letters A through Z**. The restored text must read as a single continuous passage with NO chunk labels remaining anywhere.",
      "- For referent / 'underlined (a)~(e)' questions (e.g. \"밑줄 친 (a)~(e) 중...\"): the `(a)`, `(b)`, `(c)`, `(d)`, `(e)` parentheses are problem-sheet markers slapped onto specific words. **YOU MUST REMOVE every `(a)`, `(b)`, `(c)`, `(d)`, `(e)` inline marker from the restored text**, keeping the underlying word intact.",
      "- For insertion questions, place the given/boxed sentence at the solved marker position from problem evidence; remove (①) ~ (⑤) position markers.",
      "- For irrelevant-sentence questions, remove ONLY the sentence identified as unrelated; keep numbering off.",
      "- For blank inference / word / sentence questions, fill the blank only when the question evidence supports it.",
      "- For grammar / vocabulary questions, restore the original (correct) form.",
      "- Remove all problem-only markers (@, underlines, bracketed base forms, [ word, word ] word-banks, [N점] score tags).",
      "- If labels / chunk fragments / unresolved markers remain, `finalStatus` MUST be \"PARTIAL\" or \"FAILED\".",
      "",
      "## Variant policy (drives Investigation C — DEFAULT = keep AI, patch only on strong signal)",
      "Compare `aiRestoration.restoredText` vs `sourceMatch.content`. For each diff, classify and act:",
      "- #1 PROBLEM-COUPLED → PATCH from source. Triggers: diff at `(a)~(e)` / `(a)~(i)` underline AND question is GRAMMAR_* / VOCAB_CHOICE / CONTEXT_MEANING / REFERENCE; or diff inside `(A)~(D)` ordering chunk or `(A)~(I)` vocab-choice chunk; or diff at a `________` / `(A)/(B)/(C)` blank.",
      "- #2 AUTHOR-EDIT → KEEP AI. Diff at a non-marker position, grammatically well-formed, span ≥3 words (condensed wording / rewritten ending / simplified clause).",
      "- #3 OCR NOISE → PATCH from source. Short (1-2 tokens), broken grammar / repeated tokens / garbled.",
      "- #4 AMBIGUOUS → KEEP AI, set `finalStatus=\"PARTIAL\"`.",
      "",
      "## Building `finalRestoredText`",
      "- Start from `aiRestoration.restoredText`. If no `sourceMatch`, emit it unchanged.",
      "- Otherwise: patch source spans for #1 and #3, leave AI spans for #2 and #4.",
      "- Emit a `changes` entry for EVERY sentence-level edit you applied — covering BOTH source patches (#1 #3) AND Investigation B evidence-driven edits (blank fills derived from question answers, grammar/vocab corrections inferred from problem evidence, sentence insertions, sentence ordering swaps). For source patches: `before`=AI span, `after`=source span. For evidence-driven edits: `before`=raw fragment (e.g. blank placeholder `________` or wrong-form word), `after`=restored fragment. Pick `evidenceType` per class (GRAMMAR/VOCAB/BLANK/INSERTION/ORDERING/SUMMARY for substantive edits, OTHER for OCR noise patches). Set `evidenceQuestionNumber` to the source question's number when the edit was driven by a specific problem. Do NOT emit changes for pure marker removal (①~⑤, (A)~(E) chunk labels, [N~M] shared-instruction tags) — those are housekeeping.",
      "- For #2/#4 kept spans: add ONE aggregated warning like \"Preserved N suspected author edits — source differs but not patched\" (do not list each span). Place specifics in `comparison.differences` (concise — short fragments only).",
      "",
      "## Required JSON schema (return EXACTLY this shape)",
      "{",
      '  "sourceMatch": {',
      '    "title": string, "url": string|null, "publisher": string|null, "year": int|null,',
      '    "content": string, "confidence": 0.0-1.0, "reason": string',
      "  } | null,",
      '  "aiRestoration": {',
      '    "status": "RESTORED" | "PARTIAL" | "FAILED",',
      '    "method": "SOURCE_MATCH" | "QUESTION_EVIDENCE" | "MIXED" | "FAILED",',
      '    "restoredText": string,',
      '    "confidence": 0.0-1.0,',
      '    "sentences": [{ "order": int, "text": string, "status": "OK"|"RESTORED"|"CHECK"|"UNRESOLVED" }],',
      '    "changes": [{ "sentenceOrder": int|null, "before": string, "after": string, "reason": string, "evidenceType": "VOCAB"|"GRAMMAR"|"WORD_ORDER"|"BLANK"|"INSERTION"|"ORDERING"|"SUMMARY"|"SOURCE_MATCH"|"MANUAL_REQUIRED"|"OTHER", "confidence": 0.0-1.0 }],',
      '    "unresolvedMarkers": string[]',
      "  },",
      '  "comparison": {',
      '    "agreement": 0.0-1.0, "differences": string[],',
      '    "recommendation": "SOURCE_PRIMARY" | "AI_PRIMARY" | "BOTH_AGREE" | "TEACHER_REVIEW_REQUIRED"',
      "  } | null,",
      '  "finalRestoredText": string,',
      '  "finalStatus": "RESTORED" | "PARTIAL" | "FAILED",',
      '  "finalMethod": "SOURCE_MATCH" | "QUESTION_EVIDENCE" | "MIXED" | "FAILED",',
      '  "warnings": string[]',
      "}",
      "",
      "## Inputs",
      "",
      "Raw passage (problem-mutated):",
      input.problemText,
      "",
      "Linked questions:",
      stringifyQuestions(input.questions),
      "",
      "Problem evidence (from 1st-pass extraction):",
      stringifyProblemEvidence(input.problemEvidence),
      "",
      "Local DB candidates (already searched, none crossed auto-accept threshold):",
      stringifyLocalSourceMatches(input.localSourceMatches ?? []),
    ].join("\n"),
  };
}

// ─── Batched grounded restoration prompts ───────────────────────────────────
export interface BuildGroundedRestorationBatchTask {
  /** Stable per-task id (echoed back by the model). */
  id: string;
  problemText: string;
  questions: RestorationQuestionInput[];
  problemEvidence?: ProblemEvidenceResponse | null;
  localSourceMatches?: SourceMatchInput[];
}

export interface BuildGroundedRestorationBatchPromptInput {
  tasks: BuildGroundedRestorationBatchTask[];
}

/**
 * Build a prompt for processing multiple restoration tasks in a single
 * grounded call. Saves on Google Search grounding billing (which dominates
 * per-call cost) by amortising one tool-call cost across N drafts.
 *
 * The model must echo each task's `id` in its `results[*].id` so the caller
 * can map results back to inputs deterministically.
 */
export function buildGroundedRestorationBatchPrompts(
  input: BuildGroundedRestorationBatchPromptInput,
): { systemPrompt: string; userPrompt: string } {
  const taskBlocks = input.tasks.map((task, idx) => {
    return [
      `### TASK ${idx + 1}  (id="${task.id}")`,
      "",
      "Raw passage (problem-mutated):",
      task.problemText,
      "",
      "Linked questions:",
      stringifyQuestions(task.questions),
      "",
      "Problem evidence (from 1st-pass extraction):",
      stringifyProblemEvidence(task.problemEvidence ?? null),
      "",
      "Local DB candidates (already searched, none crossed auto-accept threshold):",
      stringifyLocalSourceMatches(task.localSourceMatches ?? []),
    ].join("\n");
  });

  return {
    systemPrompt:
      "You restore English study passages from Korean school problem sheets. " +
      "**Primary restorer = AI reading the raw problem text and the question evidence for each task.** " +
      "google_search is a SECONDARY reference tool — use it to find the original source ONLY to verify specific problem-coupled spans (grammar/vocab answer positions, blanks) and to fix obvious OCR noise. " +
      "You must NOT replace teacher-edited passages with the source verbatim — the teacher's intentional edits (rewording, condensing, rewritten endings) are pedagogical and must be preserved. " +
      "Do not invent text that isn't supported by either the raw passage, the question evidence, or a confidently-matched source. " +
      "Return strict JSON only — no markdown, no commentary.",
    userPrompt: [
      "## Batch restoration",
      "",
      `You will receive ${input.tasks.length} restoration tasks below. Process each task INDEPENDENTLY and return an array of results, one per task, IN INPUT ORDER, with each result echoing the input's \`id\`.`,
      "",
      "## Pipeline (run all three for EACH task — B is the MAIN restorer)",
      "",
      "### Investigation A — Source lookup (REFERENCE ONLY, optional)",
      "- Use google_search to look up the original source of this task's passage (book / article / textbook).",
      "- If found, copy the original passage verbatim into `sourceMatch.content` (no paraphrase).",
      "- If not confidently found, set `sourceMatch` to null and stop searching for that task.",
      "- **Sanity check**: if the candidate source's overall meaning / topic diverges substantially from the raw passage (you matched a different text), treat it as NOT found and set `sourceMatch` to null. Better no source than a wrong source.",
      "- This output is REFERENCE for Investigation C — it is NOT the answer.",
      "- Batch reminder: each task may have a DIFFERENT source — search for each independently.",
      "",
      "### Investigation B — AI restoration (PRIMARY)",
      "- This is the main restoration path for each task. Use the raw passage and the question evidence to reconstruct the passage as the teacher intends students to read it.",
      "- Apply the Restoration rules below: strip problem-only markers, place boxed/reordered sentences, drop the irrelevant sentence, fill blanks from evidence, fix grammar/vocab where the question identifies the answer position, etc.",
      "- **Do NOT consult `sourceMatch` for this investigation.** Treat raw + evidence as your only inputs.",
      "- Put the result in `aiRestoration.restoredText`. This is the starting point for `finalRestoredText`.",
      "- `aiRestoration.method` MUST be exactly one of: \"SOURCE_MATCH\" | \"QUESTION_EVIDENCE\" | \"MIXED\" | \"FAILED\". Use \"QUESTION_EVIDENCE\" for this investigation.",
      "- `aiRestoration.status` MUST be exactly one of: \"RESTORED\" | \"PARTIAL\" | \"FAILED\".",
      "",
      "### Investigation C — Source-assisted patching (build finalRestoredText)",
      "- **Start from `aiRestoration.restoredText` verbatim.**",
      "- If `sourceMatch` is null OR `sourceMatch` differs from raw in too many places to be a confident match: emit `aiRestoration.restoredText` unchanged. Set `comparison` to null, `finalMethod = \"QUESTION_EVIDENCE\"`.",
      "- If `sourceMatch` is present and largely overlaps with raw, walk the diffs between `aiRestoration.restoredText` and `sourceMatch.content`. Apply the Variant classification policy below. Patch ONLY #1 (problem-coupled) and #3 (OCR noise) spans with source text. Leave every other diff as-is (= AI's reconstruction).",
      "- After patching, set `finalMethod`:",
      "    \"MIXED\"           when at least one source patch was applied",
      "    \"QUESTION_EVIDENCE\" when no source patch was needed / applied",
      "    \"SOURCE_MATCH\"    only if raw was already nearly identical to source and AI did almost nothing (rare)",
      "    \"FAILED\"          if the passage could not be restored at all",
      "- `comparison.agreement` = 0~1 sentence-level overlap between aiRestoration and sourceMatch (when both exist).",
      "- `comparison.differences` should list meaningful diffs you DID NOT patch (= suspected author edits or ambiguous), so the teacher can review.",
      "- `comparison.recommendation` MUST be one of: \"SOURCE_PRIMARY\" | \"AI_PRIMARY\" | \"BOTH_AGREE\" | \"TEACHER_REVIEW_REQUIRED\". Under this pipeline the default is \"AI_PRIMARY\" — only use \"SOURCE_PRIMARY\" when raw and source are nearly identical and AI added no edits.",
      "- `finalStatus` MUST be exactly one of: \"RESTORED\" | \"PARTIAL\" | \"FAILED\".",
      "",
      "## Restoration rules (apply in Investigation B and to finalRestoredText)",
      "- Preserve paragraph order, capitalization, original punctuation.",
      "- For questions whose sentences/paragraphs are labelled with parenthesised uppercase letters — ordering questions use `(A)`~`(D)`, vocab-choice / 동의어 / multi-choice 본문 problems can go up to `(A)`~`(I)` (rarely beyond) — **YOU MUST STRIP every such `(LETTER)` label from the output for letters A through Z**. The restored text must read as a single continuous passage with NO chunk labels remaining anywhere.",
      "- For referent / 'underlined (a)~(e)' questions (e.g. \"밑줄 친 (a)~(e) 중...\"): the `(a)`, `(b)`, `(c)`, `(d)`, `(e)` parentheses are problem-sheet markers slapped onto specific words. **YOU MUST REMOVE every `(a)`, `(b)`, `(c)`, `(d)`, `(e)` inline marker from the restored text**, keeping the underlying word intact.",
      "- For insertion questions, place the given/boxed sentence at the solved marker position from problem evidence; remove (①) ~ (⑤) position markers.",
      "- For irrelevant-sentence questions, remove ONLY the sentence identified as unrelated; keep numbering off.",
      "- For blank inference / word / sentence questions, fill the blank only when the question evidence supports it.",
      "- For grammar / vocabulary questions, restore the original (correct) form.",
      "- Remove all problem-only markers (@, underlines, bracketed base forms, [ word, word ] word-banks, [N점] score tags).",
      "- If labels / chunk fragments / unresolved markers remain, `finalStatus` MUST be \"PARTIAL\" or \"FAILED\".",
      "",
      "## Variant policy (drives Investigation C — DEFAULT = keep AI, patch only on strong signal)",
      "Compare `aiRestoration.restoredText` vs `sourceMatch.content`. For each diff, classify and act:",
      "- #1 PROBLEM-COUPLED → PATCH from source. Triggers: diff at `(a)~(e)` / `(a)~(i)` underline AND question is GRAMMAR_* / VOCAB_CHOICE / CONTEXT_MEANING / REFERENCE; or diff inside `(A)~(D)` ordering chunk or `(A)~(I)` vocab-choice chunk; or diff at a `________` / `(A)/(B)/(C)` blank.",
      "- #2 AUTHOR-EDIT → KEEP AI. Diff at a non-marker position, grammatically well-formed, span ≥3 words (condensed wording / rewritten ending / simplified clause).",
      "- #3 OCR NOISE → PATCH from source. Short (1-2 tokens), broken grammar / repeated tokens / garbled.",
      "- #4 AMBIGUOUS → KEEP AI, set `finalStatus=\"PARTIAL\"`.",
      "",
      "## Building `finalRestoredText`",
      "- Start from `aiRestoration.restoredText`. If no `sourceMatch`, emit it unchanged.",
      "- Otherwise: patch source spans for #1 and #3, leave AI spans for #2 and #4.",
      "- Emit a `changes` entry for EVERY sentence-level edit you applied — covering BOTH source patches (#1 #3) AND Investigation B evidence-driven edits (blank fills derived from question answers, grammar/vocab corrections inferred from problem evidence, sentence insertions, sentence ordering swaps). For source patches: `before`=AI span, `after`=source span. For evidence-driven edits: `before`=raw fragment (e.g. blank placeholder `________` or wrong-form word), `after`=restored fragment. Pick `evidenceType` per class (GRAMMAR/VOCAB/BLANK/INSERTION/ORDERING/SUMMARY for substantive edits, OTHER for OCR noise patches). Set `evidenceQuestionNumber` to the source question's number when the edit was driven by a specific problem. Do NOT emit changes for pure marker removal (①~⑤, (A)~(E) chunk labels, [N~M] shared-instruction tags) — those are housekeeping.",
      "- For #2/#4 kept spans: add ONE aggregated warning like \"Preserved N suspected author edits — source differs but not patched\" (do not list each span). Place specifics in `comparison.differences` (concise — short fragments only).",
      "",
      "## Required JSON schema (return EXACTLY this shape)",
      "{",
      '  "results": [',
      "    {",
      '      "id": <echo the task id verbatim>,',
      '      "sourceMatch": { "title": string, "url": string|null, "publisher": string|null, "year": int|null, "content": string, "confidence": 0.0-1.0, "reason": string } | null,',
      '      "aiRestoration": {',
      '        "status": "RESTORED" | "PARTIAL" | "FAILED",',
      '        "method": "SOURCE_MATCH" | "QUESTION_EVIDENCE" | "MIXED" | "FAILED",',
      '        "restoredText": string,',
      '        "confidence": 0.0-1.0,',
      '        "sentences": [{ "order": int, "text": string, "status": "OK"|"RESTORED"|"CHECK"|"UNRESOLVED" }],',
      '        "changes": [{ "sentenceOrder": int|null, "before": string, "after": string, "reason": string, "evidenceType": "VOCAB"|"GRAMMAR"|"WORD_ORDER"|"BLANK"|"INSERTION"|"ORDERING"|"SUMMARY"|"SOURCE_MATCH"|"MANUAL_REQUIRED"|"OTHER", "confidence": 0.0-1.0 }],',
      '        "unresolvedMarkers": string[]',
      "      },",
      '      "comparison": { "agreement": 0.0-1.0, "differences": string[], "recommendation": "SOURCE_PRIMARY" | "AI_PRIMARY" | "BOTH_AGREE" | "TEACHER_REVIEW_REQUIRED" } | null,',
      '      "finalRestoredText": string,',
      '      "finalStatus": "RESTORED" | "PARTIAL" | "FAILED",',
      '      "finalMethod": "SOURCE_MATCH" | "QUESTION_EVIDENCE" | "MIXED" | "FAILED",',
      '      "warnings": string[]',
      "    }",
      "  ]",
      "}",
      "",
      `Total number of tasks: ${input.tasks.length}. The results array MUST contain exactly ${input.tasks.length} items, in input order, each with the correct id.`,
      "",
      "## Tasks",
      "",
      taskBlocks.join("\n\n---\n\n"),
    ].join("\n"),
  };
}

export function buildVerificationPrompts(input: {
  problemText: string;
  restoredText: string;
  questions: RestorationQuestionInput[];
  changes: Array<z.infer<typeof restorationChangeSchema>>;
}): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt:
      "You verify restored English passages for school worksheet extraction. " +
      "Check for unsupported restoration, leftover problem markers, and mismatches with question evidence. Return strict JSON only.",
    userPrompt: [
      "Verify this restored passage.",
      "",
      "Return JSON matching: { status, confidence, warnings, remainingProblemMarkers, suspiciousChanges, teacherReviewRequired }.",
      "",
      "Problem-sheet passage:",
      input.problemText,
      "",
      "Restored passage:",
      input.restoredText,
      "",
      "Linked questions:",
      stringifyQuestions(input.questions),
      "",
      "Restoration changes:",
      JSON.stringify(input.changes, null, 2),
    ].join("\n"),
  };
}
