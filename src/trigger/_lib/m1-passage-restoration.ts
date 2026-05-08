import type { Prisma } from "@prisma/client";
import {
  buildRestorationPrompts,
  passageRestorationResponseSchema,
  type RestorationQuestionInput,
  type PassageRestorationResponse,
  type SourceMatchInput,
} from "@/lib/extraction/m2-restoration";
import {
  buildFallbackM1Restoration,
  hasUnresolvedM1ProblemArtifacts,
  type M1RestorationChangeInput,
  type M1RestorationStatus,
} from "@/lib/extraction/m1-restoration";
import { getExtractionAiModelName } from "@/lib/extraction/model-config";
import { generateStructuredTextWithTriggerFetch } from "./gemini-ocr";
import { findPassageSourceMatches } from "./m2-source-match";
import {
  findWebPassageSourceMatches,
  type WebSearchDiagnostics,
} from "./passage-web-search";

const TEXT_CALL_TIMEOUT_MS = 120_000;
const LOCAL_DB_EXACT_THRESHOLD = 0.9;

export interface M1PassageRestorationResult {
  restoredText: string;
  status: M1RestorationStatus;
  confidence: number | null;
  changes: M1RestorationChangeInput[];
  warnings: string[];
  metadata: Prisma.InputJsonValue;
  sourceMatches: SourceMatchInput[];
}

function normalizeComparableText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPollutedExactSourceMatch(input: {
  rawText: string;
  sourceText: string;
}): boolean {
  if (!hasUnresolvedM1ProblemArtifacts(input.sourceText)) return false;
  return (
    normalizeComparableText(input.rawText) ===
    normalizeComparableText(input.sourceText)
  );
}

function createWholePassageChange(input: {
  rawText: string;
  restoredText: string;
  changeType: string;
  reason: string;
  confidence: number | null;
}): M1RestorationChangeInput[] {
  if (
    normalizeComparableText(input.rawText) ===
    normalizeComparableText(input.restoredText)
  ) {
    return [];
  }
  return [
    {
      sentenceOrder: null,
      before: input.rawText,
      after: input.restoredText,
      changeType: input.changeType,
      reason: input.reason,
      confidence: input.confidence,
    },
  ];
}

function mapM2Status(status: PassageRestorationResponse["status"]): M1RestorationStatus {
  if (status === "ORIGINAL_MATCHED" || status === "RESTORED") return "RESTORED";
  if (status === "PARTIAL") return "PARTIAL";
  return "FAILED";
}

function readSelectedSourceMatch(matches: SourceMatchInput[]): SourceMatchInput | null {
  const top = matches[0];
  if (!top?.content || top.confidence < LOCAL_DB_EXACT_THRESHOLD) return null;
  return top;
}

function readSelectedWebMatch(matches: SourceMatchInput[]): SourceMatchInput | null {
  const top = matches.find((match) => match.sourceType === "WEB_PAGE");
  if (!top?.content || top.confidence < LOCAL_DB_EXACT_THRESHOLD) return null;
  return top;
}

function baseMetadata(input: {
  method: string;
  stages: Record<string, string>;
  model?: string | null;
  sourceMatch?: SourceMatchInput | null;
  webSearch?: WebSearchDiagnostics | null;
  aiRestoration?: PassageRestorationResponse | null;
}): Prisma.InputJsonValue {
  return {
    restoration: {
      pipeline: "m1-source-restoration-v1",
      method: input.method,
      stages: input.stages,
      model: input.model ?? null,
      sourceMatch: input.sourceMatch
        ? {
            sourceId: input.sourceMatch.sourceId ?? null,
            sourceType: input.sourceMatch.sourceType,
            sourceRef: input.sourceMatch.sourceRef ?? null,
            title: input.sourceMatch.title,
            confidence: input.sourceMatch.confidence,
            reason: input.sourceMatch.reason,
          }
        : null,
      webSearch: input.webSearch ?? null,
      aiRestoration: input.aiRestoration
        ? {
            status: input.aiRestoration.status,
            method: input.aiRestoration.method,
            confidence: input.aiRestoration.confidence,
            unresolvedMarkers: input.aiRestoration.unresolvedMarkers,
          }
        : null,
    },
  } as Prisma.InputJsonValue;
}

async function restoreWithAi(input: {
  rawText: string;
  sourceMatches: SourceMatchInput[];
  questions: RestorationQuestionInput[];
}): Promise<PassageRestorationResponse> {
  const prompts = buildRestorationPrompts({
    problemText: input.rawText,
    questions: input.questions,
    sourceMatches: input.sourceMatches,
  });
  const result = await generateStructuredTextWithTriggerFetch({
    stage: "passage-restoration",
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
    timeoutInMs: TEXT_CALL_TIMEOUT_MS,
    schema: passageRestorationResponseSchema,
  });
  return result.object;
}

export async function restoreM1Passage(input: {
  academyId: string;
  rawText: string;
  questions?: RestorationQuestionInput[];
}): Promise<M1PassageRestorationResult> {
  const sourceMatches = await findPassageSourceMatches({
    academyId: input.academyId,
    problemText: input.rawText,
  });
  const selectedSource = readSelectedSourceMatch(sourceMatches);

  const pollutedExactLocalMatch =
    selectedSource?.content &&
    isPollutedExactSourceMatch({
      rawText: input.rawText,
      sourceText: selectedSource.content,
    });

  if (
    selectedSource?.content &&
    !pollutedExactLocalMatch &&
    !hasUnresolvedM1ProblemArtifacts(selectedSource.content)
  ) {
    const restoredText = selectedSource.content.trim();
    return {
      restoredText,
      status: "RESTORED",
      confidence: selectedSource.confidence,
      changes: createWholePassageChange({
        rawText: input.rawText,
        restoredText,
        changeType: "source-match",
        reason: "Restored from a near-exact same-academy Passage database match.",
        confidence: selectedSource.confidence,
      }),
      warnings: [],
      metadata: baseMetadata({
        method: "LOCAL_DB",
        stages: {
          localDb: "MATCHED",
          webSearch: "SKIPPED_SOURCE_MATCHED",
          questionEvidence: "SKIPPED_SOURCE_MATCHED",
        },
        sourceMatch: selectedSource,
      }),
      sourceMatches,
    };
  }

  const webSearch = await findWebPassageSourceMatches({
    rawText: input.rawText,
  });
  const usableSourceMatches = sourceMatches.filter((match) => {
    if (!match.content) return true;
    if (hasUnresolvedM1ProblemArtifacts(match.content)) return false;
    return !isPollutedExactSourceMatch({
      rawText: input.rawText,
      sourceText: match.content,
    });
  });
  const allSourceMatches = [...usableSourceMatches, ...webSearch.matches].sort(
    (a, b) => b.confidence - a.confidence,
  );
  const selectedWebSource = readSelectedWebMatch(allSourceMatches);

  if (
    selectedWebSource?.content &&
    !hasUnresolvedM1ProblemArtifacts(selectedWebSource.content)
  ) {
    const restoredText = selectedWebSource.content.trim();
    return {
      restoredText,
      status: "RESTORED",
      confidence: selectedWebSource.confidence,
      changes: createWholePassageChange({
        rawText: input.rawText,
        restoredText,
        changeType: "web-source-match",
        reason: "Restored from a near-exact web search source match.",
        confidence: selectedWebSource.confidence,
      }),
      warnings: [],
      metadata: baseMetadata({
        method: "WEB_SEARCH",
        stages: {
          localDb: sourceMatches.length > 0 ? "CANDIDATES_ONLY" : "NO_MATCH",
          webSearch: webSearch.diagnostics.status,
          questionEvidence: "SKIPPED_SOURCE_MATCHED",
        },
        sourceMatch: selectedWebSource,
        webSearch: webSearch.diagnostics,
      }),
      sourceMatches: allSourceMatches,
    };
  }

  try {
    const restoration = await restoreWithAi({
      rawText: input.rawText,
      sourceMatches: allSourceMatches,
      questions: input.questions ?? [],
    });
    const restoredText = restoration.restoredText.trim() || input.rawText;
    const unchanged =
      normalizeComparableText(input.rawText) ===
      normalizeComparableText(restoredText);
    const unresolvedArtifacts = hasUnresolvedM1ProblemArtifacts(restoredText);
    const status =
      unchanged && hasUnresolvedM1ProblemArtifacts(input.rawText)
        ? "FAILED"
        : unresolvedArtifacts
          ? "PARTIAL"
        : mapM2Status(restoration.status);

    return {
      restoredText,
      status,
      confidence: restoration.confidence,
      changes: restoration.changes.map((change) => ({
        sentenceOrder: change.sentenceOrder ?? null,
        before: change.before,
        after: change.after,
        changeType: change.evidenceType,
        reason: change.reason,
        confidence: change.confidence,
      })),
      warnings: [
        ...restoration.warnings,
        ...(webSearch.diagnostics.status === "FAILED" &&
        webSearch.diagnostics.error
          ? [`Web search failed: ${webSearch.diagnostics.error}`]
          : []),
        ...(unresolvedArtifacts
          ? [
              "Restored text still contains problem-sheet markers; teacher review is required.",
            ]
          : []),
        ...(status === "FAILED" && unchanged && hasUnresolvedM1ProblemArtifacts(input.rawText)
          ? [
              "Restoration evidence was insufficient; manual teacher restoration is required.",
            ]
          : []),
      ],
      metadata: baseMetadata({
        method:
          webSearch.matches.length > 0
            ? "WEB_CANDIDATE_AI_RESTORE"
            : sourceMatches.length > 0
              ? "LOCAL_DB_CANDIDATE_AI_RESTORE"
            : "AI_RESTORE",
        stages: {
          localDb: pollutedExactLocalMatch
            ? "POLLUTED_EXACT_MATCH_REJECTED"
            : sourceMatches.length > 0
              ? "CANDIDATES_ONLY"
              : "NO_MATCH",
          webSearch: webSearch.diagnostics.status,
          questionEvidence: "AI_ATTEMPTED_WITH_AVAILABLE_EVIDENCE",
        },
        model: getExtractionAiModelName("passage-restoration"),
        sourceMatch: allSourceMatches[0] ?? null,
        webSearch: webSearch.diagnostics,
        aiRestoration: restoration,
      }),
      sourceMatches: allSourceMatches,
    };
  } catch (err) {
    const fallback = buildFallbackM1Restoration(input.rawText);
    const status =
      fallback.status === "NO_RESTORATION_NEEDED" && hasUnresolvedM1ProblemArtifacts(input.rawText)
        ? "FAILED"
        : fallback.status;
    return {
      restoredText: fallback.restoredText,
      status,
      confidence: status === "FAILED" ? 0 : 0.5,
      changes: fallback.changes,
      warnings: [
        `AI restoration failed: ${err instanceof Error ? err.message : String(err)}`,
        ...(webSearch.diagnostics.status === "FAILED" &&
        webSearch.diagnostics.error
          ? [`Web search failed: ${webSearch.diagnostics.error}`]
          : []),
        ...(status === "FAILED"
          ? ["Restoration evidence was insufficient; manual teacher restoration is required."]
          : []),
      ],
      metadata: baseMetadata({
        method: status === "FAILED" ? "FAILED" : "CODE_FALLBACK",
        stages: {
          localDb: pollutedExactLocalMatch
            ? "POLLUTED_EXACT_MATCH_REJECTED"
            : sourceMatches.length > 0
              ? "CANDIDATES_ONLY"
              : "NO_MATCH",
          webSearch: webSearch.diagnostics.status,
          questionEvidence: "FAILED",
        },
        model: getExtractionAiModelName("passage-restoration"),
        sourceMatch: allSourceMatches[0] ?? null,
        webSearch: webSearch.diagnostics,
      }),
      sourceMatches: allSourceMatches,
    };
  }
}
