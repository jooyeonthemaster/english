// @ts-nocheck

export function buildQuestionText(q: any): string {
  const parts: string[] = [];
  const isSummaryCompleteMc = q?._typeId === "SUMMARY_COMPLETE_MC" || q?.subType === "SUMMARY_COMPLETE_MC";
  if (q.direction) parts.push(q.direction);
  if (q.passageWithBlank) parts.push(q.passageWithBlank);
  if (q.passageWithMarkers) parts.push(q.passageWithMarkers);
  if (q.passageWithUnderline) parts.push(q.passageWithUnderline);
  if (q.passageWithNumbers) parts.push(q.passageWithNumbers);
  if (q.matchType) parts.push(`[유형: ${q.matchType}]`);
  if (q.givenSentence) parts.push(`[주어진 문장] ${q.givenSentence}`);
  if (q.paragraphs) parts.push(q.paragraphs.map((p: any) => `${p.label} ${p.text}`).join("\n"));
  if (q.referenceSentence) parts.push(`[영작할 우리말] ${q.referenceSentence}`);
  if (q.originalSentence) parts.push(`[원문] ${q.originalSentence}`);
  if (q.conditions) parts.push(`[조건] ${q.conditions.join(" / ")}`);
  if (q.sentenceWithBlank) parts.push(q.sentenceWithBlank);
  if (q.summaryWithBlanks) parts.push(`[요약문] ${q.summaryWithBlanks}`);
  if (!isSummaryCompleteMc && q.blanks?.length) parts.push(`[빈칸 정답] ${q.blanks.map((b: any) => `${b.label} ${b.answer}`).join(", ")}`);
  if (q.scrambledWords?.length) parts.push(`[배열 단어] ${q.scrambledWords.join(" / ")}`);
  if (q.contextHint) parts.push(`[힌트] ${q.contextHint}`);
  if (q.sentenceWithError) parts.push(`[오류 문장] ${q.sentenceWithError}`);
  if (q.targetWord) parts.push(`[대상 단어] ${q.targetWord}`);
  if (q.contextSentence) parts.push(`[문맥] ${q.contextSentence}`);
  if (q.questionText) parts.push(q.questionText);
  return parts.join("\n\n") || "";
}
