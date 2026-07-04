import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { QUESTION_PERSISTENCE_TRANSACTION_TIMEOUT_MS } from "@/lib/concurrency-config";
import {
  buildGrammarCorrectionQuestionTextForDisplay,
  grammarCorrectionErrorSentenceForQuestionText,
} from "@/lib/grammar-correction-display";
import {
  mergeQuestionGenerationPlanTag,
  normalizeQuestionGenerationPlan,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import {
  formatSummaryCompleteMcSummaryForDisplay,
  readSummaryBlankAnswersFromQuestionLike,
} from "@/lib/summary-complete-mc";
import { serializeKoQuestion } from "@/lib/korean/core/render-model";
import { getKoTypeModule, isKoQuestionType } from "@/lib/korean/registry";
import { isSummaryWriting, summaryWritingStudentParts } from "@/lib/summary-writing";
import { isTopicSentenceWriting, topicSentenceWritingStudentParts } from "@/lib/topic-sentence-writing";

function toPrismaJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readQuestionTags(rawTags: unknown): string[] {
  if (Array.isArray(rawTags)) {
    return rawTags.filter((tag): tag is string => typeof tag === "string");
  }
  if (typeof rawTags !== "string") return [];
  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return rawTags
      .split(/[,;|]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
}

export function buildGeneratedQuestionText(q: Record<string, unknown>): string {
  const parts: string[] = [];
  const typeId =
    typeof q._typeId === "string"
      ? q._typeId
      : typeof q.subType === "string"
        ? q.subType
        : "";
  const isSummaryCompleteMc = typeId === "SUMMARY_COMPLETE_MC";
  const push = (value: unknown) => {
    if (typeof value === "string" && value.trim()) parts.push(value);
  };

  if (typeId === "GRAMMAR_CORRECTION") {
    const text = buildGrammarCorrectionQuestionTextForDisplay(q);
    if (text) return text;
  }

  // 커스텀 레이아웃(v2): 생성기가 LayoutDoc 에서 결정적으로 조립한 questionText(마커 미니 DSL)를
  // 그대로 저장한다 — 시험지/DOCX/HWPX 파서가 이 문자열을 소비한다. 필드 조합 직렬화를 타면
  // direction 만 남는 문제가 있어 명시 분기(GRAMMAR_CORRECTION 과 같은 전례).
  if (typeId === "CUSTOM_LAYOUT" && typeof q.questionText === "string" && q.questionText.trim()) {
    return q.questionText;
  }

  // KO(국어) 조기반환(CUSTOM_LAYOUT/GRAMMAR_CORRECTION 전례): 발문+<보기>+<조건>만
  // 직렬화한다 — 선지(options 컬럼 전용)·정답계열(essay.modelAnswer 등) 절대 미포함
  // (정답 누수 0, KO-DESIGN-SPEC §4.3). 지문은 미동봉(렌더 표면이 KoRenderModel 로
  // 재구성). 미등록 KO 유형은 validator 가 저장 전에 차단하므로 여기 도달하지 않지만,
  // 방어적으로 아래 일반 직렬화로 폴백한다.
  if (isKoQuestionType(typeId)) {
    const koModule = getKoTypeModule(typeId);
    if (koModule) {
      return serializeKoQuestion(koModule.toRenderModel(q, { passage: undefined }));
    }
  }

  push(q.direction);
  // SW-LEAK-1: SUMMARY_WRITING 은 학생 안전 블록만 직렬화([빈칸 정답]·modelAnswer 미포함)
  if (isSummaryWriting(typeId)) {
    for (const part of summaryWritingStudentParts(q)) push(part);
    if (q.questionText && !q.direction) push(q.questionText);
    return parts.filter(Boolean).join("\n\n");
  }
  // SW-LEAK-1: TOPIC_SENTENCE_WRITING 도 학생 안전 블록만 직렬화(정답·modelAnswer 미포함).
  // 일반 경로(아래 [빈칸 정답])는 blanks[].answer 를 노출하므로 반드시 여기서 분기한다.
  if (isTopicSentenceWriting(typeId)) {
    for (const part of topicSentenceWritingStudentParts(q)) push(part);
    if (q.questionText && !q.direction) push(q.questionText);
    return parts.filter(Boolean).join("\n\n");
  }
  // 주어진 문장(문장삽입·글의 순서)은 지문/단락 '위'에 박스로 와야 한다.
  // 한글 라벨 '[주어진 문장]'으로 통일해 DOCX/HWPX 파서(parseQuestionSections)·
  // 시험지 렌더(splitSentenceInsertGivenBlock)와 일치시킨다. (이전: '[given]'을
  // passageWithMarkers '뒤'에 직렬화해 시험지에서 주어진 문장이 지문 아래로 가고
  // 영문 '[given]' 라벨이 노출되던 버그를 바로잡음.)
  if (q.givenSentence) parts.push(`[주어진 문장] ${String(q.givenSentence)}`);
  push(q.passageWithBlank);
  if (typeId !== "GRAMMAR_CORRECTION") push(q.passageWithMarkers);
  push(q.passageWithUnderline);
  push(q.passageWithNumbers);
  if (Array.isArray(q.paragraphs)) {
    parts.push(
      q.paragraphs
        .map((p) => {
          const row = p as Record<string, unknown>;
          return `${String(row.label ?? "")} ${String(row.text ?? "")}`.trim();
        })
        .filter(Boolean)
        .join("\n"),
    );
  }

  if (q.referenceSentence) parts.push(`[영작할 우리말] ${String(q.referenceSentence)}`);
  if (q.originalSentence) parts.push(`[원문] ${String(q.originalSentence)}`);
  if (Array.isArray(q.conditions) && q.conditions.length > 0) {
    parts.push(
      `[조건]\n${q.conditions
        .map((c, i) => `${i + 1}. ${String(c)}`)
        .join("\n")}`,
    );
  }
  // FILL_BLANK_KEY 는 passageWithBlank(빈칸 포함 전체 지문)와 sentenceWithBlank(그 문장 하나)를
  // 둘 다 보유한다. 둘 다 직렬화하면 빈칸 문장이 지문 끝에 한 번 더 붙어 중복 렌더된다.
  // 전체 지문이 있으면 그 안에 문장이 이미 포함되므로 단문은 생략한다(카드 렌더 q.passageWithBlank
  // || q.sentenceWithBlank 와 동일 의미론). 둘 다 보유하는 유형은 FILL_BLANK_KEY 뿐이라 무회귀.
  if (!q.passageWithBlank) push(q.sentenceWithBlank);
  if (q.summaryWithBlanks) {
    const summary = isSummaryCompleteMc
      ? formatSummaryCompleteMcSummaryForDisplay(
        String(q.summaryWithBlanks),
        readSummaryBlankAnswersFromQuestionLike(q),
      )
      : String(q.summaryWithBlanks);
    parts.push(isSummaryCompleteMc ? `\u2193\n${summary}` : `[요약문] ${summary}`);
  }
  if (!isSummaryCompleteMc && Array.isArray(q.blanks) && q.blanks.length > 0) {
    parts.push(
      `[빈칸 정답] ${q.blanks
        .map((b) => {
          const row = b as Record<string, unknown>;
          return `${String(row.label ?? "")} ${String(row.answer ?? "")}`.trim();
        })
        .join(", ")}`,
    );
  }
  if (Array.isArray(q.scrambledWords) && q.scrambledWords.length > 0) {
    parts.push(`[배열 단어] ${q.scrambledWords.map(String).join(" / ")}`);
  }
  if (q.contextHint) parts.push(`[힌트] ${String(q.contextHint)}`);
  if (q.sentenceWithError && typeId !== "GRAMMAR_CORRECTION") {
    push(grammarCorrectionErrorSentenceForQuestionText(q));
  }
  if (q.questionText && !q.direction) push(q.questionText);

  return parts.filter(Boolean).join("\n\n");
}

/**
 * 생성 문항의 DB points 컬럼 값(KO-RC-3).
 * KO(국어): 렌더모델의 유효배점(render-model.ts — structuredData.points ??
 * meta.defaultPoints)과 동일 규칙으로 계산해, 문항 메타줄([n점 · 유형])·시험지
 * 배점 합계·채점(eq.points)이 발문 끝 [n점] 표기와 정합되게 한다. KO 봉투는
 * "유형 기본값과 다를 때만" points 를 내는 계약이라 structuredData.points 부재
 * 시 모듈 defaultPoints 로 채워야 한다.
 * 영어: 기존 1 고정 유지(발문에 배점 미표기 — 무회귀).
 */
export function resolveGeneratedQuestionPoints(
  q: Record<string, unknown>,
  subType: string | null,
): number {
  const koModule = subType && isKoQuestionType(subType) ? getKoTypeModule(subType) : null;
  if (!koModule) return 1;
  return typeof q.points === "number" ? q.points : koModule.meta.defaultPoints;
}

export async function saveGeneratedQuestionsForJob({
  academyId,
  passageId,
  questions,
  generationPlan,
  skipPassageEligibilityCheck = false,
}: {
  academyId: string;
  passageId: string;
  questions: Record<string, unknown>[];
  generationPlan: QuestionGenerationPlan;
  skipPassageEligibilityCheck?: boolean;
}): Promise<string[]> {
  if (questions.length === 0) return [];

  if (!skipPassageEligibilityCheck) {
    const eligiblePassage = await prisma.passage.findFirst({
      where: { id: passageId, academyId },
      select: { id: true },
    });
    if (!eligiblePassage) {
      throw new Error("Passage not found before saving questions.");
    }
  }

  const createdIds: string[] = [];
  const createInputs = questions.map((q) => {
    const plan = normalizeQuestionGenerationPlan(
      q._generationPlan ?? generationPlan,
    );
    const tags = mergeQuestionGenerationPlanTag(readQuestionTags(q.tags), plan);
    const enriched = { ...q, _generationPlan: plan, tags };
    const options = q.options;
    const explanation = q.explanation;
    const keyPoints = q.keyPoints;
    const wrongOptionExplanations = q.wrongOptionExplanations;

    const explanationCreate =
      typeof explanation === "string" && explanation.trim()
        ? {
            create: {
              content: explanation,
              keyPoints:
                keyPoints === undefined || keyPoints === null
                  ? null
                  : typeof keyPoints === "string"
                    ? keyPoints
                    : JSON.stringify(keyPoints),
              wrongOptionExplanations:
                wrongOptionExplanations === undefined ||
                wrongOptionExplanations === null
                  ? null
                  : typeof wrongOptionExplanations === "string"
                    ? wrongOptionExplanations
                    : JSON.stringify(wrongOptionExplanations),
              aiGenerated: true,
            },
          }
        : undefined;

    const subType =
      typeof q._typeId === "string"
        ? q._typeId
        : typeof q.subType === "string"
          ? q.subType
          : null;

    return {
      data: {
        academyId,
        passageId,
        type: Array.isArray(options) ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
        subType,
        questionText: buildGeneratedQuestionText(q),
        structuredData: toPrismaJson(enriched),
        options: Array.isArray(options) ? JSON.stringify(options) : null,
        correctAnswer:
          typeof q.correctAnswer === "string"
            ? q.correctAnswer
            : typeof q.modelAnswer === "string"
              ? q.modelAnswer
              : "",
        points: resolveGeneratedQuestionPoints(q, subType),
        difficulty:
          typeof q.difficulty === "string" ? q.difficulty : "INTERMEDIATE",
        tags: JSON.stringify(tags),
        aiGenerated: true,
        approved: false,
        explanation: explanationCreate,
      },
    };
  });

  await prisma.$transaction(
    async (tx) => {
      for (const input of createInputs) {
        const question = await tx.question.create(input);
        createdIds.push(question.id);
      }
    },
    { maxWait: 10_000, timeout: QUESTION_PERSISTENCE_TRANSACTION_TIMEOUT_MS },
  );

  return createdIds;
}
