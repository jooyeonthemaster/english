import type { RecentPassage } from "./types";

export function mapRecentPassagesToQueueItems(
  recentPassages: RecentPassage[] | undefined
): Array<import("@/hooks/use-passage-queue").QueuedPassage> | undefined {
  if (!recentPassages?.length) return undefined;
  return recentPassages.map((p): import("@/hooks/use-passage-queue").QueuedPassage => {
    const words = p.content.trim().split(/\s+/).filter((w) => w.length > 0).length;
    let analysisData = null;
    try {
      if (p.analysis?.analysisData) analysisData = JSON.parse(p.analysis.analysisData);
    } catch { /* ignore */ }
    return {
      id: p.id,
      title: p.title,
      contentPreview: p.content.length > 120 ? p.content.slice(0, 120) + "..." : p.content,
      wordCount: words,
      status: "done" as const, // Server-loaded items are always shown as completed (no auto-analysis)
      analysisData,
      error: null,
      promptConfig: { customPrompt: "", focusAreas: [], targetLevel: "" },
      createdAt: new Date(p.createdAt),
      schoolName: p.school?.name,
      grade: p.grade ?? undefined,
      semester: p.semester ?? undefined,
      unit: p.unit ?? undefined,
      publisher: p.publisher ?? undefined,
      tags: p.tags ? (() => { try { return JSON.parse(p.tags!); } catch { return undefined; } })() : undefined,
      passageData: {
        id: p.id,
        title: p.title,
        content: p.content,
        grade: p.grade,
        semester: p.semester,
        unit: p.unit,
        publisher: p.publisher,
        difficulty: p.difficulty,
        tags: p.tags,
        source: p.source,
        createdAt: new Date(p.createdAt),
        school: p.school,
        analysis: p.analysis ? {
          id: p.analysis.id,
          analysisData: p.analysis.analysisData,
          contentHash: "",
          updatedAt: new Date(p.analysis.updatedAt),
        } : null,
        notes: [],
        questions: [],
      },
    };
  });
}
