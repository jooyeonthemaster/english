import type { PassageAnnotationInput, PassageAnnotationType } from "@/actions/workbench";

interface PassageWithNotes {
  notes?: Array<{
    annotationId?: string | null;
    id: string;
    noteType?: string | null;
    content: string;
    memo?: string | null;
    highlightStart?: number | null;
    highlightEnd?: number | null;
  }>;
  analysis?: { analysisData: string } | null;
}

/**
 * Extract teacher annotations from a passage row into the
 * `PassageAnnotationInput` shape that the prompt builders consume.
 */
export function extractTeacherAnnotations(
  passage: PassageWithNotes,
): PassageAnnotationInput[] {
  return (passage.notes ?? []).map((n) => ({
    id: n.annotationId ?? n.id,
    type: (n.noteType ?? "vocab") as PassageAnnotationType,
    text: n.content,
    memo: n.memo ?? "",
    from: n.highlightStart ?? 0,
    to: n.highlightEnd ?? 0,
  }));
}

/**
 * Build the analysis-context markdown block injected into both planning and
 * generation prompts. Pulls vocabulary, grammar points, structure, and exam
 * design pointers out of the persisted analysis JSON.
 *
 * Returns an empty string when no analysis data is available — the caller
 * still benefits because the prompt simply omits that section.
 */
export function buildAnalysisContext(passage: PassageWithNotes): string {
  if (!passage.analysis?.analysisData) return "";

  let analysisContext = "";
  try {
    const a = JSON.parse(passage.analysis.analysisData);

    if (a.vocabulary?.length) {
      analysisContext += "\n\n## 핵심 어휘 분석\n";
      for (const v of a.vocabulary) {
        let line = `- **${v.word}** (${v.partOfSpeech || ""}): ${v.meaning}`;
        if (v.difficulty) line += ` [${v.difficulty}]`;
        if (v.synonyms?.length) line += ` | 동의어: ${v.synonyms.join(", ")}`;
        if (v.contextMeaning) line += ` | 문맥 의미: ${v.contextMeaning}`;
        if (v.examType) line += ` | ★추천 출제유형: ${v.examType}`;
        analysisContext += line + "\n";
      }
    }

    if (a.grammarPoints?.length) {
      analysisContext += "\n## 문법 포인트\n";
      for (const gp of a.grammarPoints) {
        let line = `- **${gp.pattern}**: ${gp.explanation}`;
        if (gp.textFragment) line += ` | "${gp.textFragment}"`;
        if (gp.commonMistake) line += ` | 흔한 실수: ${gp.commonMistake}`;
        if (gp.transformations?.length)
          line += ` | 변환: ${gp.transformations.join("; ")}`;
        if (gp.examType) line += ` | ★추천 출제유형: ${gp.examType}`;
        analysisContext += line + "\n";
      }
    }

    if (a.structure) {
      analysisContext += "\n## 지문 구조\n";
      analysisContext += `- 주제: ${a.structure.mainIdea}\n`;
      if (a.structure.blankSuitablePositions?.length)
        analysisContext += `- ★빈칸 적합 위치: ${a.structure.blankSuitablePositions.join("; ")}\n`;
      if (a.structure.orderClues?.length)
        analysisContext += `- ★순서/삽입 단서: ${a.structure.orderClues.join("; ")}\n`;
      if (a.structure.connectorAnalysis?.length) {
        analysisContext += "- 담화 연결어:\n";
        for (const c of a.structure.connectorAnalysis)
          analysisContext += `  - "${c.word}" (${c.role})\n`;
      }
    }

    if (a.examDesign) {
      analysisContext += "\n## ★출제 설계 포인트 (반드시 활용)\n";
      if (a.examDesign.paraphrasableSegments?.length) {
        for (const ps of a.examDesign.paraphrasableSegments) {
          analysisContext += `- 패러프레이징: "${ps.original}" → ${ps.alternatives?.join(" / ") || ""}`;
          if (ps.reason) analysisContext += ` (${ps.reason})`;
          if (ps.questionExample)
            analysisContext += ` | 예시문항: ${ps.questionExample}`;
          analysisContext += "\n";
        }
      }
      if (a.examDesign.structureTransformPoints?.length) {
        for (const tp of a.examDesign.structureTransformPoints) {
          analysisContext += `- 구조변환: "${tp.original}" → ${tp.transformType}: "${tp.example}"`;
          if (tp.reason) analysisContext += ` (${tp.reason})`;
          if (tp.questionExample)
            analysisContext += ` | 예시문항: ${tp.questionExample}`;
          analysisContext += "\n";
        }
      }
    }
  } catch {
    /* ignore — return whatever was accumulated */
  }

  return analysisContext;
}
