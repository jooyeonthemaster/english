// @ts-nocheck

// ─── Constants ───────────────────────────────────────────

export const EXAM_TYPE_GROUPS = [
  {
    group: "수능/모의고사 객관식",
    items: [
      { id: "BLANK_INFERENCE", label: "빈칸 추론" },
      { id: "GRAMMAR_ERROR", label: "어법 판단" },
      { id: "VOCAB_CHOICE", label: "어휘 적절성" },
      { id: "SENTENCE_ORDER", label: "글의 순서" },
      { id: "SENTENCE_INSERT", label: "문장 삽입" },
      { id: "TOPIC_MAIN_IDEA", label: "주제/요지" },
      { id: "TITLE", label: "제목 추론" },
      { id: "REFERENCE", label: "지칭 추론" },
      { id: "CONTENT_MATCH", label: "내용 일치" },
      { id: "IRRELEVANT", label: "무관한 문장" },
    ],
  },
  {
    group: "내신 서술형",
    items: [
      { id: "CONDITIONAL_WRITING", label: "조건부 영작" },
      { id: "SENTENCE_TRANSFORM", label: "문장 전환" },
      { id: "FILL_BLANK_KEY", label: "핵심 표현 빈칸" },
      { id: "SUMMARY_COMPLETE", label: "요약문 완성" },
      { id: "WORD_ORDER", label: "배열 영작" },
      { id: "GRAMMAR_CORRECTION", label: "문법 오류 수정" },
    ],
  },
  {
    group: "어휘",
    items: [
      { id: "CONTEXT_MEANING", label: "문맥 속 의미" },
      { id: "SYNONYM", label: "동의어" },
      { id: "ANTONYM", label: "반의어" },
    ],
  },
];

// ─── Types ───────────────────────────────────────────────

export interface PassageItem {
  id: string;
  title: string;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  difficulty: string | null;
  school: { id: string; name: string } | null;
  content: string;
  analysis?: { analysisData: string } | null;
  collectionItems?: { collectionId: string }[];
}

export interface FilterOptions {
  schools: { id: string; name: string }[];
  grades: number[];
  semesters: string[];
  publishers: string[];
}

export type QueueStatus = "generating" | "done" | "reviewed" | "error";

export interface QueueItem {
  id: string;
  passageId: string;
  passageTitle: string;
  passageContent: string;
  passageMeta: { school?: string; grade?: number | null; semester?: string | null; unit?: string | null };
  analysisData: any;
  status: QueueStatus;
  progress: Record<string, "pending" | "done" | "error">;
  questions: any[];
  config: { typeCounts: Record<string, number>; difficulty: string; prompt: string; mode: "auto" | "manual" };
}

// ─── Helpers ─────────────────────────────────────────────

export function typeLabel(id: string): string {
  for (const g of EXAM_TYPE_GROUPS) {
    const found = g.items.find((i) => i.id === id);
    if (found) return found.label;
  }
  return id;
}

export function buildQuestionText(q: any): string {
  const parts: string[] = [];
  // 발문 (모든 유형 공통)
  if (q.direction) parts.push(q.direction);
  // CONTENT_MATCH: 일치/불일치 유형 표시
  if (q.matchType) parts.push(`[유형: ${q.matchType}]`);

  // ── 수능/모의고사 객관식 ──
  // BLANK_INFERENCE: 빈칸이 삽입된 지문
  if (q.passageWithBlank) parts.push(q.passageWithBlank);
  // GRAMMAR_ERROR, VOCAB_CHOICE, SENTENCE_INSERT, ANTONYM: 마커가 포함된 지문
  if (q.passageWithMarkers) parts.push(q.passageWithMarkers);
  // REFERENCE, CONTEXT_MEANING: 밑줄 대명사/단어가 포함된 지문
  if (q.passageWithUnderline) parts.push(q.passageWithUnderline);
  // IRRELEVANT: ①~⑤ 번호가 매겨진 지문
  if (q.passageWithNumbers) parts.push(q.passageWithNumbers);
  // SENTENCE_ORDER: 주어진 첫 문장 + (A)(B)(C) 단락
  if (q.givenSentence) parts.push(`[주어진 문장] ${q.givenSentence}`);
  if (q.paragraphs) {
    parts.push(q.paragraphs.map((p: any) => `${p.label} ${p.text}`).join("\n"));
  }

  // ── 내신 서술형 ──
  // CONDITIONAL_WRITING: 영작할 우리말
  if (q.referenceSentence) parts.push(`[영작할 우리말] ${q.referenceSentence}`);
  // SENTENCE_TRANSFORM: 전환 대상 원래 문장
  if (q.originalSentence) parts.push(`[원문] ${q.originalSentence}`);
  // 조건 (CONDITIONAL_WRITING, SENTENCE_TRANSFORM)
  if (q.conditions?.length) parts.push(`[조건]\n${q.conditions.map((c: string, i: number) => `${i + 1}. ${c}`).join("\n")}`);
  // FILL_BLANK_KEY: 빈칸 포함 문장
  if (q.sentenceWithBlank) parts.push(q.sentenceWithBlank);
  // SUMMARY_COMPLETE: 빈칸 포함 요약문 + 빈칸 정답
  if (q.summaryWithBlanks) parts.push(`[요약문] ${q.summaryWithBlanks}`);
  if (q.blanks?.length) parts.push(`[빈칸 정답] ${q.blanks.map((b: any) => `${b.label} ${b.answer}`).join(", ")}`);
  // WORD_ORDER: 뒤섞인 단어
  if (q.scrambledWords?.length) parts.push(`[배열 단어] ${q.scrambledWords.join(" / ")}`);
  if (q.contextHint) parts.push(`[힌트] ${q.contextHint}`);
  // GRAMMAR_CORRECTION: 오류 문장
  if (q.sentenceWithError) parts.push(`[오류 문장] ${q.sentenceWithError}`);

  // ── 어휘 ──
  // SYNONYM: 대상 단어 + 문맥 문장
  if (q.targetWord) parts.push(`[대상 단어] ${q.targetWord}`);
  if (q.contextSentence) parts.push(`[문맥] ${q.contextSentence}`);

  // 일반 questionText (fallback)
  if (q.questionText && !q.direction) parts.push(q.questionText);

  return parts.join("\n\n") || "";
}

export function countWords(t: string) { return t.trim().split(/\s+/).filter((w) => w.length > 0).length; }
