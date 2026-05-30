import { z } from "zod";
import { buildQuestionGenerationPromptContract } from "@/lib/question-generation-prompt-contract";
import { getTypeQualityRubric } from "@/lib/question-quality";
import { TutorActivityDraftSchema, type TutorActivityDraft } from "@/lib/tutor/schemas";
import { normalizeForCompare } from "@/lib/tutor/activity-payload-schema";
import { PASSAGE_POLICY_BY_TYPE } from "@/lib/tutor/visibility";
import type { TutorActivityType } from "@/lib/tutor/activity-types";
import type { PassageAnalysisData } from "@/types/passage-analysis";

type Draft = z.input<typeof TutorActivityDraftSchema>;
type Dimension = TutorActivityDraft["coverageRefs"][number]["dimension"];

type QuestionPlanItem = {
  subType: string;
  count: number;
  reason: string;
  targetPoints: string[];
};

const EXAM_RUBRIC_TYPES = [
  "BLANK_INFERENCE",
  "GRAMMAR_ERROR",
  "VOCAB_CHOICE",
  "SENTENCE_ORDER",
  "SENTENCE_INSERT",
  "TOPIC",
  "MAIN_IDEA",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "IMPLIED_MEANING",
  "CONTENT_MATCH",
  "IRRELEVANT",
  "FILL_BLANK_KEY",
  "WORD_ORDER",
  "GRAMMAR_CORRECTION",
  "SENTENCE_TRANSFORM",
] as const;

export const TUTOR_TO_WORKBENCH_QUESTION_TYPE: Record<string, string[]> = {
  gist_select: ["TOPIC", "MAIN_IDEA", "TOPIC_MAIN_IDEA", "TITLE"],
  paraphrase_mc: ["IMPLIED_MEANING"],
  progressive_cloze: ["BLANK_INFERENCE", "FILL_BLANK_KEY"],
  sentence_rebuild: ["WORD_ORDER"],
  chunk_rebuild: ["WORD_ORDER"],
  sentence_order: ["SENTENCE_ORDER"],
  insertion_point: ["SENTENCE_INSERT"],
  irrelevant_sentence: ["IRRELEVANT"],
  vocab_choice: ["VOCAB_CHOICE", "CONTEXT_MEANING"],
  contextual_meaning: ["CONTEXT_MEANING", "SYNONYM"],
  vocab_collocation: ["VOCAB_CHOICE"],
  grammar_judge: ["GRAMMAR_ERROR"],
  grammar_error_span: ["GRAMMAR_ERROR"],
  grammar_correct: ["GRAMMAR_CORRECTION"],
  structure_transform: ["SENTENCE_TRANSFORM", "CONDITIONAL_WRITING"],
  mastery_test: ["BLANK_INFERENCE", "GRAMMAR_ERROR", "SENTENCE_INSERT", "CONTENT_MATCH", "IMPLIED_MEANING"],
};

export function buildTutorExamQualityPromptBlock(difficulty = "INTERMEDIATE") {
  const rubrics = EXAM_RUBRIC_TYPES.map((typeId) => getTypeQualityRubric(typeId, difficulty))
    .filter(Boolean)
    .join("\n\n");

  const mapping = Object.entries(TUTOR_TO_WORKBENCH_QUESTION_TYPE)
    .map(([activityType, questionTypes]) => `- ${activityType}: follow ${questionTypes.join(", ")} quality rules.`)
    .join("\n");

  return [
    "## 내신형 모바일 학습 활동 품질 기준",
    "이 활동들은 일반 퀴즈가 아니라 한국 영어 내신 대비용 지문 완전학습 활동입니다.",
    "기존 문제 생성기의 출제 기준을 그대로 따르되, 모바일에서는 한 화면에 한 미션으로 풀 수 있게 작게 쪼개세요.",
    "",
    "### Tutor activity to exam-question quality mapping",
    mapping,
    "",
    buildQuestionGenerationPromptContract("STANDARD"),
    "",
    rubrics,
    "",
    "### Tutor-specific conversion rules",
    "- 단어/어법/빈칸/삽입/순서/서술형 활동은 반드시 지문 원문, 저장된 분석, 또는 분석 안의 출제 포인트에 근거해야 합니다.",
    "- 객관식 오답은 랜덤 오답이 아니라 지문 개념을 빌려와 범위, 인과, 담화 역할, 품사, 문맥 의미를 미묘하게 비트는 near-miss로 만드세요.",
    "- 빈칸/문장완성은 단순 긴 단어 지우기가 아니라 지문 논리, 핵심 표현, collocation, 또는 내신 출제 가능 표현을 복원하게 해야 합니다.",
    "- 어법 활동은 단순 관사/전치사/고정표현 패딩을 금지하고, 수일치, 관계사, 분사 능수동, 병렬, 준동사, 형부 자리, 비교, 접속사/전치사 같은 실제 판단 지점을 사용하세요.",
    "- 영작/서술형은 모범답안 하나만 던지지 말고 조건, 정답 근거, 흔한 실수, 채점 포인트가 payload에 들어가야 합니다.",
    "- 학생에게 보이는 title, instructions, prompt에는 정답이 노출되면 안 됩니다.",
    "- 모든 payload는 모바일 카드에서 바로 렌더링 가능한 짧은 prompt/options/chunks/answerText 구조여야 합니다.",
  ].join("\n");
}

export function buildExamAlignedTutorQuestionPlan(analysis: PassageAnalysisData): QuestionPlanItem[] {
  const sentenceCount = analysis.sentences.length;
  const hasGrammar = analysis.grammarPoints.length > 0;
  const hasTransform = Boolean(analysis.examDesign?.structureTransformPoints?.length);

  const plan: QuestionPlanItem[] = [
    {
      subType: "TOPIC_MAIN_IDEA",
      count: 1,
      reason: "지문 전체 주제와 요지를 모바일 최종 점검으로 확인",
      targetPoints: [analysis.structure?.mainIdea, ...(analysis.structure?.keyPoints ?? [])].filter(Boolean) as string[],
    },
    {
      subType: "BLANK_INFERENCE",
      count: 1,
      reason: "핵심 논리 표현을 빈칸으로 복원하는 내신형 훈련",
      targetPoints: analysis.structure?.blankSuitablePositions ?? [],
    },
    {
      subType: "VOCAB_CHOICE",
      count: 1,
      reason: "문맥 어휘와 오답 함정 훈련",
      targetPoints: analysis.vocabulary.slice(0, 5).map((item) => `${item.word}: ${item.contextMeaning || item.meaning}`),
    },
    {
      subType: "IMPLIED_MEANING",
      count: 1,
      reason: "표면 해석과 실제 문맥 의미를 구분하는 고난도 독해 훈련",
      targetPoints: analysis.examDesign?.paraphrasableSegments?.slice(0, 3).map((item) => item.original) ?? [],
    },
    {
      subType: "FILL_BLANK_KEY",
      count: 1,
      reason: "본문 핵심 표현을 서술형으로 회수",
      targetPoints: analysis.examDesign?.summaryKeyPoints ?? analysis.structure?.keyPoints ?? [],
    },
    {
      subType: "WORD_ORDER",
      count: 1,
      reason: "핵심 문장 어순과 구문 복원",
      targetPoints: analysis.sentences.slice(0, 4).map((item) => item.english),
    },
  ];

  if (hasGrammar) {
    plan.push({
      subType: "GRAMMAR_ERROR",
      count: 1,
      reason: "지문 속 실제 어법 판단 지점 훈련",
      targetPoints: analysis.grammarPoints.slice(0, 5).map((item) => `${item.pattern}: ${item.textFragment}`),
    });
    plan.push({
      subType: "GRAMMAR_CORRECTION",
      count: 1,
      reason: "서술형 어법 오류 수정 대비",
      targetPoints: analysis.grammarPoints.slice(0, 4).map((item) => `${item.pattern}: ${item.commonMistake || item.explanation}`),
    });
  }

  if (hasTransform) {
    plan.push({
      subType: "SENTENCE_TRANSFORM",
      count: 1,
      reason: "내신 서술형 구조 변환 대비",
      targetPoints: analysis.examDesign!.structureTransformPoints.slice(0, 3).map((item) => `${item.original} -> ${item.transformType}`),
    });
  }

  if (sentenceCount >= 5) {
    plan.push({
      subType: "SENTENCE_INSERT",
      count: 1,
      reason: "문장 삽입형 담화 흐름 훈련",
      targetPoints: analysis.structure?.orderClues ?? [],
    });
    plan.push({
      subType: "SENTENCE_ORDER",
      count: 1,
      reason: "문장 순서형 담화 흐름 훈련",
      targetPoints: analysis.structure?.orderClues ?? [],
    });
  }

  if (sentenceCount >= 6) {
    plan.push({
      subType: "IRRELEVANT",
      count: 1,
      reason: "무관문장형 흐름 판단 훈련",
      targetPoints: analysis.structure?.logicFlow?.map((item) => `${item.role}: ${item.summary}`) ?? [],
    });
  }

  return plan;
}

// ── v2 변환 헬퍼 ─────────────────────────────────────────────────────────────
function optionText(option: unknown): string {
  if (option && typeof option === "object") {
    const record = option as Record<string, unknown>;
    return String(record.text ?? record.label ?? record.value ?? "");
  }
  return String(option ?? "");
}

function normalizeLabel(value: unknown): string {
  const text = String(value ?? "").trim();
  const circled: Record<string, string> = { "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5" };
  return (circled[text] ?? text).replace(/^[([]?([A-Ja-j]|\d{1,2})[\]).]?\s*$/, "$1").toLowerCase();
}

function correctIndexFromOptions(question: Record<string, unknown>, options: unknown[]): number {
  const correct = normalizeLabel(question.correctAnswer);
  const index = options.findIndex((option, fallbackIndex) => {
    if (option && typeof option === "object") {
      const record = option as Record<string, unknown>;
      return normalizeLabel(record.label ?? fallbackIndex + 1) === correct;
    }
    return normalizeLabel(fallbackIndex + 1) === correct;
  });
  return Math.max(0, index);
}

function questionType(question: Record<string, unknown>): string {
  return String(question._typeId ?? question.subType ?? question.type ?? "MASTER");
}

function findSentenceIndex(analysis: PassageAnalysisData, question: Record<string, unknown>): number {
  const candidates = [
    question.originalExpression,
    question.underlinedExpression,
    question.underlinedWord,
    question.referenceSentence,
    question.originalSentence,
    question.contextSentence,
    question.surroundingText,
  ]
    .map((value) => String(value ?? "").replace(/\s+/g, " ").trim())
    .filter((value) => value.length >= 3);
  const matched = analysis.sentences.find((sentence) =>
    candidates.some((candidate) => sentence.english.includes(candidate) || candidate.includes(sentence.english)),
  );
  return matched?.index ?? 0;
}

function coverage(analysis: PassageAnalysisData, question: Record<string, unknown>, dimension: Dimension) {
  return [{ sentenceIndex: findSentenceIndex(analysis, question), dimension, weight: 0.9 }];
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  return [];
}

function toParagraphs(value: unknown): { label: string; text: string }[] {
  if (Array.isArray(value)) {
    return value
      .map((para, index) => {
        const record = para && typeof para === "object" ? (para as Record<string, unknown>) : {};
        return {
          label: String(record.label ?? record.tag ?? String.fromCharCode(65 + index)),
          text: String(record.text ?? record.content ?? (typeof para === "string" ? para : "")),
        };
      })
      .filter((para) => para.text.trim());
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([label, text]) => ({ label, text: String(text ?? "") }))
      .filter((para) => para.text.trim());
  }
  return [];
}

function markersFromOptions(optionTexts: string[]) {
  return optionTexts.map((text, index) => ({ no: index + 1, text }));
}

function buildWordOrderChips(scrambled: string[], modelAnswer: string) {
  if (scrambled.length < 2) return null;
  const normModel = normalizeForCompare(modelAnswer);
  const positions = scrambled.map((chunk) => normModel.indexOf(normalizeForCompare(chunk)));
  if (positions.some((pos) => pos < 0)) return null;
  const order = scrambled.map((_, index) => index).sort((a, b) => positions[a] - positions[b]);
  return { chips: scrambled.map((text, id) => ({ id, text })), correctOrder: order };
}

// 입력 draft를 파싱해 v2 스키마 통과분만 반환(+정책 주입). 통과 못하면 null.
function finalize(draft: Draft | null): TutorActivityDraft | null {
  if (!draft) return null;
  const policy = PASSAGE_POLICY_BY_TYPE[draft.type as TutorActivityType] ?? "visible";
  (draft.payload as { passagePolicy?: string }).passagePolicy = policy;
  const parsed = TutorActivityDraftSchema.safeParse(draft);
  return parsed.success ? parsed.data : null;
}

export function examQuestionToTutorActivityDraft(
  question: Record<string, unknown>,
  analysis: PassageAnalysisData,
): TutorActivityDraft | null {
  const type = questionType(question);
  const options = Array.isArray(question.options) ? question.options : [];
  const optionTexts = options.map(optionText).filter(Boolean);
  const correctIndex = correctIndexFromOptions(question, options);
  const explanation = String(question.explanation ?? "");
  const wrongOptionExplanations = toStringArray(question.wrongOptionExplanations);

  // 주제/제목/일치/함축/빈칸추론 — 객관식 종합 점검
  if (["TOPIC", "MAIN_IDEA", "TOPIC_MAIN_IDEA", "TITLE", "CONTENT_MATCH", "IMPLIED_MEANING", "BLANK_INFERENCE"].includes(type)) {
    if (optionTexts.length < 2) return null;
    const isImplied = type === "IMPLIED_MEANING";
    const prompt =
      String(question.passageWithBlank ?? question.passageWithUnderline ?? question.questionText ?? question.direction ?? "").trim() ||
      "지문 근거로 가장 적절한 답을 고르세요.";
    return finalize({
      mode: isImplied ? "interpret" : "mastery",
      type: isImplied ? "paraphrase_mc" : "mastery_test",
      title: isImplied ? "함축 의미 추론" : "내신 독해 종합",
      instructions: "지문 근거를 확인하며 가장 적절한 답을 고르세요.",
      payload: {
        form: "CHOICE",
        variant: "plain",
        prompt,
        options: optionTexts,
        correctIndex,
        wrongOptionExplanations,
        explanation,
      },
      itemCount: 1,
      maxScore: type === "BLANK_INFERENCE" || isImplied ? 16 : 12,
      estimatedSec: 90,
      coverageRefs: coverage(analysis, question, "interpret"),
    });
  }

  // 어휘 적절성 — 본문 마커
  if (type === "VOCAB_CHOICE") {
    if (optionTexts.length < 2) return null;
    return finalize({
      mode: "vocab",
      type: "mastery_test",
      title: "문맥 어휘 적절성",
      instructions: "밑줄 친 어휘 중 문맥상 적절하지 않은 것을 고르세요.",
      payload: {
        form: "CHOICE",
        variant: "marked_passage",
        prompt: "문맥상 어휘의 쓰임이 적절하지 않은 것은?",
        markedPassage: String(question.passageWithMarkers ?? question.direction ?? ""),
        markers: markersFromOptions(optionTexts),
        options: optionTexts,
        correctIndex,
        wrongOptionExplanations,
        explanation,
      },
      itemCount: 1,
      maxScore: 12,
      estimatedSec: 80,
      coverageRefs: coverage(analysis, question, "vocab"),
    });
  }

  // 어법 오류 찾기 — 본문 마커
  if (type === "GRAMMAR_ERROR") {
    if (optionTexts.length < 2) return null;
    return finalize({
      mode: "grammar",
      type: "mastery_test",
      title: "내신 어법 판단",
      instructions: "밑줄 친 표현 중 어법상 틀린 것을 고르세요.",
      payload: {
        form: "CHOICE",
        variant: "marked_passage",
        prompt: "어법상 틀린 것은?",
        markedPassage: String(question.passageWithMarkers ?? question.direction ?? ""),
        markers: markersFromOptions(optionTexts),
        options: optionTexts,
        correctIndex,
        wrongOptionExplanations,
        explanation,
      },
      itemCount: 1,
      maxScore: 16,
      estimatedSec: 100,
      coverageRefs: coverage(analysis, question, "grammar"),
    });
  }

  // 문장 삽입
  if (type === "SENTENCE_INSERT") {
    if (optionTexts.length < 2) return null;
    return finalize({
      mode: "order",
      type: "insertion_point",
      title: "문장 삽입 위치",
      instructions: "제시문이 들어갈 위치를 고르세요.",
      payload: {
        form: "CHOICE",
        variant: "insertion",
        prompt: String(question.passageWithMarkers ?? question.passageWithNumbers ?? question.direction ?? ""),
        targetSentence: String(question.givenSentence ?? ""),
        options: optionTexts,
        correctIndex,
        explanation,
      },
      itemCount: 1,
      maxScore: 16,
      estimatedSec: 100,
      coverageRefs: coverage(analysis, question, "order"),
    });
  }

  // 무관 문장
  if (type === "IRRELEVANT") {
    if (optionTexts.length < 2) return null;
    return finalize({
      mode: "order",
      type: "irrelevant_sentence",
      title: "무관한 문장 찾기",
      instructions: "글의 흐름에서 어색한 문장을 고르세요.",
      payload: {
        form: "CHOICE",
        variant: "marked_passage",
        prompt: "전체 흐름과 관계 없는 문장은?",
        markedPassage: String(question.passageWithNumbers ?? question.passageWithMarkers ?? question.direction ?? ""),
        markers: markersFromOptions(optionTexts),
        options: optionTexts,
        correctIndex,
        explanation,
      },
      itemCount: 1,
      maxScore: 14,
      estimatedSec: 100,
      coverageRefs: coverage(analysis, question, "order"),
    });
  }

  // 글의 순서 — (A)(B)(C) 단락 카드 (핵심 버그 해결)
  if (type === "SENTENCE_ORDER") {
    const paragraphs = toParagraphs(question.paragraphs);
    if (optionTexts.length < 2 || paragraphs.length < 2) return null;
    return finalize({
      mode: "mastery",
      type: "mastery_test",
      title: "글의 순서",
      instructions: "주어진 글 다음에 이어질 순서로 가장 적절한 것을 고르세요.",
      payload: {
        form: "CHOICE",
        variant: "order_paragraphs",
        prompt: String(question.questionText ?? question.givenSentence ?? question.direction ?? "글의 순서로 가장 적절한 것은?"),
        paragraphs,
        options: optionTexts,
        correctIndex,
        explanation,
      },
      itemCount: 1,
      maxScore: 16,
      estimatedSec: 110,
      coverageRefs: coverage(analysis, question, "order"),
    });
  }

  // 핵심 표현 빈칸(서술형)
  if (type === "FILL_BLANK_KEY") {
    const answer = String(question.answer ?? question.correctAnswer ?? "").trim();
    if (!answer) return null;
    return finalize({
      mode: "memorize",
      type: "progressive_cloze",
      title: "핵심 표현 빈칸",
      instructions: "본문 핵심 표현을 정확히 입력하세요.",
      payload: {
        form: "TEXT",
        variant: "cloze",
        prompt: String(question.sentenceWithBlank ?? question.questionText ?? "빈칸에 들어갈 표현을 쓰세요."),
        inputMode: "short",
        gradeMode: "hybrid",
        acceptedAnswers: [answer],
        modelAnswer: answer,
        explanation,
      },
      itemCount: 1,
      maxScore: 12,
      estimatedSec: 70,
      coverageRefs: coverage(analysis, question, "memorize"),
    });
  }

  // 배열 영작
  if (type === "WORD_ORDER") {
    const scrambled = toStringArray(question.scrambledWords);
    const modelAnswer = String(question.modelAnswer ?? question.correctAnswer ?? "").trim();
    const chipData = buildWordOrderChips(scrambled, modelAnswer);
    if (!chipData) return null;
    return finalize({
      mode: "memorize",
      type: "chunk_rebuild",
      title: "배열 영작",
      instructions: "주어진 단어와 구를 올바른 순서로 배열하세요.",
      payload: {
        form: "CHIP",
        variant: "rebuild",
        prompt: String(question.contextHint ?? question.direction ?? "올바른 순서로 배열하세요."),
        chips: chipData.chips,
        correctOrder: chipData.correctOrder,
        explanation,
      },
      itemCount: chipData.chips.length,
      maxScore: 14,
      estimatedSec: 90,
      coverageRefs: coverage(analysis, question, "memorize"),
    });
  }

  // 어법 고치기(서술형)
  if (type === "GRAMMAR_CORRECTION") {
    const corrected = String(question.correctedPart ?? question.correctAnswer ?? "").trim();
    const errorSentence = String(question.sentenceWithError ?? question.questionText ?? "").trim();
    if (!corrected || !errorSentence) return null;
    return finalize({
      mode: "grammar",
      type: "grammar_correct",
      title: "어법 오류 고치기",
      instructions: "어법상 틀린 부분을 원문 의미에 맞게 고쳐 쓰세요.",
      payload: {
        form: "TEXT",
        variant: "correct",
        prompt: errorSentence,
        sentenceWithError: errorSentence,
        inputMode: "short",
        gradeMode: "hybrid",
        acceptedAnswers: [corrected],
        modelAnswer: String(question.correctedSentence ?? corrected),
        explanation,
      },
      itemCount: 1,
      maxScore: 14,
      estimatedSec: 85,
      coverageRefs: coverage(analysis, question, "grammar"),
    });
  }

  // 문장 전환 / 조건 영작(서술형)
  if (type === "SENTENCE_TRANSFORM" || type === "CONDITIONAL_WRITING") {
    const modelAnswer = String(question.modelAnswer ?? question.correctAnswer ?? "").trim();
    const prompt = String(question.originalSentence ?? question.referenceSentence ?? question.questionText ?? "").trim();
    if (!modelAnswer || !prompt) return null;
    const isTransform = type === "SENTENCE_TRANSFORM";
    return finalize({
      mode: "transfer",
      type: isTransform ? "structure_transform" : "conditional_writing",
      title: isTransform ? "문장 전환 서술형" : "조건 영작 서술형",
      instructions: "조건을 만족하도록 영어 문장을 작성하세요.",
      payload: {
        form: "TEXT",
        variant: isTransform ? "transform" : "conditional",
        prompt,
        inputMode: "long",
        conditions: toStringArray(question.conditions),
        transformType: question.transformType ? String(question.transformType) : undefined,
        gradeMode: isTransform ? "ai" : "hybrid",
        modelAnswer,
        rubric: toStringArray(question.gradingPoints),
        explanation,
      },
      itemCount: 1,
      maxScore: 16,
      estimatedSec: 120,
      coverageRefs: coverage(analysis, question, "transfer"),
    });
  }

  return null;
}
