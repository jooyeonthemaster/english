import { QUESTION_TYPE_GROUPS } from "@/lib/question-type-ui";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import type { QuestionTypeGenerationSettings } from "@/lib/question-type-generation-settings";
import {
  formatSummaryCompleteMcSummaryForDisplay,
  readSummaryBlankAnswersFromQuestionLike,
} from "@/lib/summary-complete-mc";
import {
  buildGrammarCorrectionQuestionTextForDisplay,
  grammarCorrectionErrorSentenceForQuestionText,
} from "@/lib/grammar-correction-display";
import { isSummaryWriting, summaryWritingStudentParts } from "@/lib/summary-writing";
import { isTopicSentenceWriting, topicSentenceWritingStudentParts } from "@/lib/topic-sentence-writing";
import { getKoTypeModule } from "@/lib/korean/registry";
import { serializeKoQuestion } from "@/lib/korean/core/render-model";

// ─── Constants ───────────────────────────────────────────

export const EXAM_TYPE_GROUPS = QUESTION_TYPE_GROUPS;

// ─── Types ───────────────────────────────────────────────

export interface PassageItem {
  id: string;
  title: string;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  difficulty: string | null;
  source?: string | null;
  /** 지문 과목 — null/미지정=영어(기존 지문 전부), "KOREAN"=국어. */
  subject?: string | null;
  /** Passage.tags JSON 문자열 — 국어 갈래 태그(KO_KIND:*) 판독용. */
  tags?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  school: { id: string; name: string } | null;
  content: string;
  analysis?: { id?: string; analysisData: string; updatedAt?: string | Date } | null;
  // 이 지문으로 생성된 학습자료(A4 보고서) 목록 — 지문 카드 하단 토글에 사용.
  reports?: {
    id: string;
    title: string;
    status: string;
    templateId: string | null;
    updatedAt?: string | Date;
  }[];
  extractionReviewDraft?: {
    id: string;
    savedPassageId: string | null;
    reviewStatus: string;
    confirmedAt?: string | Date | null;
    updatedAt?: string | Date | null;
  } | null;
  collectionItems?: { collectionId: string }[];
  // 이 지문으로 이미 생성된 문제 수(서버 집계).
  _count?: { questions: number };
}

export interface PassageCollectionItem {
  id: string;
  parentId?: string | null;
  name: string;
  _count: { items: number };
}

export interface FilterOptions {
  schools: { id: string; name: string }[];
  grades: number[];
  semesters: string[];
  publishers: string[];
}

export type PassageAnalysisStatusFilter = "all" | "analyzed" | "unanalyzed";

export type PassageSortOrder =
  | "newest"
  | "oldest"
  | "name_asc"
  | "name_desc";

export type QueueStatus = "generating" | "done" | "reviewed" | "error";

export interface QueueItem {
  id: string;
  /**
   * 이 잡을 만든 낙관적 temp 의 id(클라이언트 nonce). fast 경로에서만 채워지며,
   * 서버 job.config 에 왕복 저장됐다 DB 폴링 시 되읽힌다. 큐 병합 때 temp↔DB 행을
   * 설정 시그니처가 아니라 이 값으로 1:1 매칭해, 같은 지문+유형을 연속/동시 생성해도
   * 카드(지문·빈칸연습)가 서로 섞이지 않게 한다.
   */
  clientTempId?: string;
  passageId: string;
  passageTitle: string;
  passageContent: string;
  createdAt?: string;
  passageMeta: {
    school?: string;
    grade?: number | null;
    semester?: string | null;
    unit?: string | null;
  };
  analysisData: any;
  status: QueueStatus;
  progress: Record<string, "pending" | "done" | "error">;
  questions: any[];
  questionIds?: string[];
  error?: string;
  /**
   * md-stream 실시간 미리보기 — 빈칸·어법 스트리밍 생성 중 fast temp 카드에서만
   * 채워지고, 완료(done 교체)와 함께 자연 소멸한다. 렌더는 고정 높이 패널이라
   * 값이 아무리 자라도 카드 레이아웃을 밀지 않는다(CLS 0).
   */
  streamPreview?: {
    phase: "thinking" | "generating";
    startedAt: number;
    outputStartedAt?: number;
    tail: string;
  };
  config: {
    typeCounts: Record<string, number>;
    difficulty: string;
    prompt: string;
    mode: "manual" | "set";
    generationPlan?: QuestionGenerationPlan;
    questionTypeSettings?: QuestionTypeGenerationSettings;
  };
}

// ─── Helpers ─────────────────────────────────────────────

export function typeLabel(id: string): string {
  for (const g of EXAM_TYPE_GROUPS) {
    const found = g.items.find((i) => i.id === id);
    if (found) return found.label;
  }
  return id;
}

/** Stable identity for a question, shared by the session queue (job-derived
 *  cards) and the saved list. Used both to match a job card to its persisted
 *  row and to tombstone deletions so the 5s job poll can't resurrect them. */
export function questionSignature(parts: {
  passageId?: string | null;
  subType?: string | null;
  questionText: string;
  correctAnswer: string;
  options: string | null;
}): string {
  return [
    parts.passageId || "",
    parts.subType || "",
    parts.questionText,
    parts.correctAnswer,
    parts.options || "",
  ].join("\u001f");
}

export function buildQuestionText(q: any): string {
  // KO(국어) 유형 게이트: 레지스트리 렌더모델 → serializeKoQuestion 재사용.
  // 발문+보기+조건만 직렬화(선지·지문·정답 미포함 — 정답 누수/지문 중복 방지 규약).
  const koTypeId =
    typeof q?._typeId === "string" && q._typeId.startsWith("KO_")
      ? q._typeId
      : typeof q?.subType === "string" && q.subType.startsWith("KO_")
        ? q.subType
        : "";
  if (koTypeId) {
    const koMod = getKoTypeModule(koTypeId);
    if (koMod) {
      try {
        const text = serializeKoQuestion(koMod.toRenderModel(q, {}));
        if (text) return text;
      } catch {
        // 렌더모델 조립 실패 → 아래 공통(발문+questionText) 경로로 폴백
      }
    }
  }
  const parts: string[] = [];
  const isSummaryCompleteMc = q?._typeId === "SUMMARY_COMPLETE_MC" || q?.subType === "SUMMARY_COMPLETE_MC";
  const isGrammarCorrection = q?._typeId === "GRAMMAR_CORRECTION" || q?.subType === "GRAMMAR_CORRECTION";
  if (isGrammarCorrection) {
    const text = buildGrammarCorrectionQuestionTextForDisplay(q);
    if (text) return text;
  }
  // 발문 (모든 유형 공통)
  if (q.direction) parts.push(q.direction);
  // SW-LEAK-1: SUMMARY_WRITING 은 학생 안전 블록만 직렬화([빈칸 정답]·modelAnswer 미포함)
  if (isSummaryWriting(q?._typeId) || isSummaryWriting(q?.subType)) {
    parts.push(...summaryWritingStudentParts(q));
    if (q.questionText && !q.direction) parts.push(q.questionText);
    return parts.join("\n\n");
  }
  // SW-LEAK-1: TOPIC_SENTENCE_WRITING 도 학생 안전 블록만 직렬화(정답·modelAnswer 미포함)
  if (isTopicSentenceWriting(q?._typeId) || isTopicSentenceWriting(q?.subType)) {
    parts.push(...topicSentenceWritingStudentParts(q));
    if (q.questionText && !q.direction) parts.push(q.questionText);
    return parts.join("\n\n");
  }
  // CONTENT_MATCH: 일치/불일치 유형 표시
  if (q.matchType) parts.push(`[유형: ${q.matchType}]`);

  // ── 수능/모의고사 객관식 ──
  // BLANK_INFERENCE: 빈칸이 삽입된 지문
  if (q.passageWithBlank) parts.push(q.passageWithBlank);
  // GRAMMAR_ERROR, VOCAB_CHOICE, SENTENCE_INSERT, ANTONYM: 마커가 포함된 지문
  if (q.passageWithMarkers && !isGrammarCorrection) parts.push(q.passageWithMarkers);
  // IMPLIED_MEANING, REFERENCE, CONTEXT_MEANING: 밑줄 표현/대명사/단어가 포함된 지문
  if (q.passageWithUnderline) parts.push(q.passageWithUnderline);
  // IRRELEVANT: 번호가 매겨진 지문
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
  if (q.conditions?.length)
    parts.push(
      `[조건]\n${q.conditions.map((c: string, i: number) => `${i + 1}. ${c}`).join("\n")}`,
    );
  // FILL_BLANK_KEY: 빈칸 포함 문장
  if (q.sentenceWithBlank) parts.push(q.sentenceWithBlank);
  // SUMMARY_COMPLETE: 빈칸 포함 요약문 + 빈칸 정답
  if (q.summaryWithBlanks) {
    const summary = isSummaryCompleteMc
      ? formatSummaryCompleteMcSummaryForDisplay(
        String(q.summaryWithBlanks),
        readSummaryBlankAnswersFromQuestionLike(q),
      )
      : q.summaryWithBlanks;
    parts.push(isSummaryCompleteMc ? `\u2193\n${summary}` : `[요약문] ${summary}`);
  }
  if (!isSummaryCompleteMc && q.blanks?.length)
    parts.push(
      `[빈칸 정답] ${q.blanks.map((b: any) => `${b.label} ${b.answer}`).join(", ")}`,
    );
  // WORD_ORDER: 뒤섞인 단어
  if (q.scrambledWords?.length)
    parts.push(`[배열 단어] ${q.scrambledWords.join(" / ")}`);
  if (q.contextHint) parts.push(`[힌트] ${q.contextHint}`);
  // GRAMMAR_CORRECTION: passageWithUnderline already contains the underlined passage.
  if (q.sentenceWithError && !isGrammarCorrection) parts.push(grammarCorrectionErrorSentenceForQuestionText(q));

  // 일반 questionText (fallback)
  if (q.questionText && !q.direction) parts.push(q.questionText);

  return parts.join("\n\n") || "";
}

export function countWords(t: string) {
  return t
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}
