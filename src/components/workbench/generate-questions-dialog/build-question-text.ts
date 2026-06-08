// @ts-nocheck

import {
  formatSummaryCompleteMcSummaryForDisplay,
  readSummaryBlankAnswersFromQuestionLike,
} from "@/lib/summary-complete-mc";
import {
  buildGrammarCorrectionQuestionTextForDisplay,
  grammarCorrectionErrorSentenceForQuestionText,
} from "@/lib/grammar-correction-display";

export function buildQuestionText(q: any): string {
  const parts: string[] = [];
  const isSummaryCompleteMc = q?._typeId === "SUMMARY_COMPLETE_MC" || q?.subType === "SUMMARY_COMPLETE_MC";
  const isGrammarCorrection = q?._typeId === "GRAMMAR_CORRECTION" || q?.subType === "GRAMMAR_CORRECTION";
  if (isGrammarCorrection) {
    const text = buildGrammarCorrectionQuestionTextForDisplay(q);
    if (text) return text;
  }
  if (q.direction) parts.push(q.direction);
  if (q.matchType) parts.push(`[유형: ${q.matchType}]`);
  // 주어진 문장은 지문 '위'에 와야 한다(문장삽입·글의 순서). 직렬화 순서를 통일.
  if (q.givenSentence) parts.push(`[주어진 문장] ${q.givenSentence}`);
  if (q.passageWithBlank) parts.push(q.passageWithBlank);
  if (q.passageWithMarkers && !isGrammarCorrection) parts.push(q.passageWithMarkers);
  if (q.passageWithUnderline) parts.push(q.passageWithUnderline);
  if (q.passageWithNumbers) parts.push(q.passageWithNumbers);
  if (q.paragraphs) parts.push(q.paragraphs.map((p: any) => `${p.label} ${p.text}`).join("\n"));
  if (q.referenceSentence) parts.push(`[영작할 우리말] ${q.referenceSentence}`);
  if (q.originalSentence) parts.push(`[원문] ${q.originalSentence}`);
  if (q.conditions) parts.push(`[조건] ${q.conditions.join(" / ")}`);
  if (q.sentenceWithBlank) parts.push(q.sentenceWithBlank);
  if (q.summaryWithBlanks) {
    const summary = isSummaryCompleteMc
      ? formatSummaryCompleteMcSummaryForDisplay(
        String(q.summaryWithBlanks),
        readSummaryBlankAnswersFromQuestionLike(q),
      )
      : q.summaryWithBlanks;
    parts.push(isSummaryCompleteMc ? `\u2193\n${summary}` : `[요약문] ${summary}`);
  }
  if (!isSummaryCompleteMc && q.blanks?.length) parts.push(`[빈칸 정답] ${q.blanks.map((b: any) => `${b.label} ${b.answer}`).join(", ")}`);
  if (q.scrambledWords?.length) parts.push(`[배열 단어] ${q.scrambledWords.join(" / ")}`);
  if (q.contextHint) parts.push(`[힌트] ${q.contextHint}`);
  if (q.sentenceWithError && !isGrammarCorrection) parts.push(grammarCorrectionErrorSentenceForQuestionText(q));
  if (q.questionText) parts.push(q.questionText);
  return parts.join("\n\n") || "";
}
