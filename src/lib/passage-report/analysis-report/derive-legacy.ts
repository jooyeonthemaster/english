import type { PassageAnalysisData } from "@/types/passage-analysis";

import type { AnalysisReport } from "./schema";

/**
 * PRIME 보고서(AnalysisReport) → 구버전 PassageAnalysisData 로 투영.
 *
 * 목적: 분석 생성을 PRIME 단일 소스로 통일하되, PassageAnalysis 를 읽는
 *       기존 소비자(지문 카드 칩/배지, 문제 생성 컨텍스트)가 깨지지 않게
 *       PRIME 에서 같은 데이터를 결정론적으로 파생 (별도 LLM 호출 없음).
 */
export function derivePassageAnalysisFromReport(report: AnalysisReport): PassageAnalysisData {
  const sections = report.sections;
  const passageSec = sections.find((s) => s.kind === "passage");
  const vocabSec = sections.find((s) => s.kind === "vocabulary");
  const grammarSec = sections.find((s) => s.kind === "grammar");
  const parsingSec = sections.find((s) => s.kind === "parsing");
  const summarySec = sections.find((s) => s.kind === "summary");
  const examSec = sections.find((s) => s.kind === "exam-focus");
  const smapSec = sections.find((s) => s.kind === "structure-map");

  const sentences =
    passageSec?.kind === "passage"
      ? passageSec.sentences.map((s) => ({ index: s.n - 1, english: s.en, korean: s.ko }))
      : [];

  const vocabulary =
    vocabSec?.kind === "vocabulary"
      ? vocabSec.rows.map((r) => ({
          word: r.headword,
          meaning: r.meaning,
          partOfSpeech: "",
          pronunciation: r.pronunciation ?? "",
          sentenceIndex: 0,
          difficulty: "intermediate" as const,
        }))
      : [];

  const grammarPoints =
    grammarSec?.kind === "grammar"
      ? grammarSec.rows.map((r, i) => ({
          id: `g${i}`,
          pattern: r.point,
          explanation: r.explanation,
          textFragment: r.excerpt ?? "",
          sentenceIndex: Math.max(0, (r.sentenceNo ?? 1) - 1),
          examples: [] as string[],
          level: "intermediate",
        }))
      : [];

  const syntaxAnalysis =
    parsingSec?.kind === "parsing"
      ? parsingSec.items.map((it) => ({
          sentenceIndex: Math.max(0, (it.sentenceNo ?? 1) - 1),
          structure: it.parts.map((p) => `${p.label} ${p.text}`).join("  "),
          chunkReading: "",
          complexity: "complex" as const,
        }))
      : [];

  const structure = {
    mainIdea:
      (summarySec?.kind === "summary" && summarySec.thesisEn) ||
      (smapSec?.kind === "structure-map" && smapSec.conclusion.text) ||
      "",
    purpose: smapSec?.kind === "structure-map" ? smapSec.intro.label : "",
    textType: report.meta.category,
    paragraphSummaries: [],
    keyPoints: summarySec?.kind === "summary" ? summarySec.sentences : [],
  };

  const examDesign = {
    paraphrasableSegments:
      examSec?.kind === "exam-focus"
        ? examSec.rows.map((r) => ({
            original: r.type,
            alternatives: [r.asks].filter((x): x is string => Boolean(x)),
            sentenceIndex: 0,
            reason: r.strategy,
          }))
        : [],
    structureTransformPoints: [],
    summaryKeyPoints: summarySec?.kind === "summary" ? summarySec.sentences : [],
    descriptiveConditions: [],
  };

  return {
    sentences,
    vocabulary,
    grammarPoints,
    structure,
    syntaxAnalysis,
    examDesign,
  } as unknown as PassageAnalysisData;
}
