import { resolveQuestionTypeGenerationSettings } from "@/lib/question-type-generation-settings";
import type { QuestionQualityIssue } from "@/lib/question-quality";
import type { QuestionGenerationRejectionIssue, QuestionGenerationRejectionSummary, RejectionPhase, RejectionRecorder, RunGenerationInput } from "./run-question-generation-types";
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function mergeCustomPromptWithTypeSettings(
  customPrompt: string | undefined,
  typeSettingsPrompt: string,
): string | undefined {
  const parts = [customPrompt?.trim(), typeSettingsPrompt.trim()].filter(Boolean);
  return parts.length ? parts.join("\n\n") : undefined;
}

export function formatIssuesForLog(issues: unknown): string {
  try {
    return JSON.stringify(issues);
  } catch {
    return String(issues);
  }
}

export function recordRejection(
  recorder: RejectionRecorder | undefined,
  issue: QuestionGenerationRejectionIssue,
) {
  if (!recorder) return;
  recorder.issues.push({
    ...issue,
    message: issue.message.slice(0, 800),
  });
}

export function summarizeQualityIssues(issues: QuestionQualityIssue[]): string {
  return issues
    .map((issue) => `${issue.code}: ${issue.message}`)
    .join(" | ")
    .slice(0, 800);
}

export function buildRejectionSample(
  subType: string,
  question: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (subType === "GRAMMAR_ERROR") {
    const markedExpressions = Array.isArray(question.markedExpressions)
      ? question.markedExpressions
          .filter(isRecord)
          .map((item) => ({
            label: item.label,
            expression: item.expression,
            isError: item.isError,
            errorExpression: item.errorExpression,
          }))
      : [];
    const passageWithMarkers =
      typeof question.passageWithMarkers === "string"
        ? question.passageWithMarkers
        : "";

    return {
      markedCount: markedExpressions.length,
      renderedMarkerCount: (passageWithMarkers.match(/__[^_]+__/g) ?? []).length,
      markedExpressions,
      passageWithMarkersPreview: passageWithMarkers.slice(0, 300),
    };
  }

  if (subType === "GRAMMAR_CHOICE_COMBO") {
    const slots = Array.isArray(question.slots)
      ? question.slots
          .filter(isRecord)
          .map((item) => ({
            label: item.label,
            correctExpression: item.correctExpression,
            wrongExpression: item.wrongExpression,
            pointCode: item.pointCode,
          }))
      : [];
    const passageWithMarkers =
      typeof question.passageWithMarkers === "string"
        ? question.passageWithMarkers
        : "";

    return {
      slotCount: slots.length,
      renderedSlotCount: (passageWithMarkers.match(/\([A-C]\)\s*\[[^\[\]]*\/[^\[\]]*\]/g) ?? []).length,
      slots,
      correctAnswer: question.correctAnswer,
      passageWithMarkersPreview: passageWithMarkers.slice(0, 300),
    };
  }

  if (subType !== "IRRELEVANT") return undefined;
  const sentences = Array.isArray(question.sentences)
    ? question.sentences.filter((sentence): sentence is string => typeof sentence === "string")
    : [];
  const irrelevantIndex = Number(question.irrelevantIndex);
  const insertedSentence =
    Number.isInteger(irrelevantIndex) && irrelevantIndex >= 0
      ? sentences[irrelevantIndex]
      : undefined;

  return {
    sentenceCount: sentences.length,
    irrelevantIndex: Number.isInteger(irrelevantIndex) ? irrelevantIndex : null,
    correctAnswer: question.correctAnswer,
    insertedSentence: insertedSentence?.slice(0, 180),
    firstSentence: sentences[0]?.slice(0, 180),
    lastSentence: sentences[sentences.length - 1]?.slice(0, 180),
  };
}

export function buildRejectionSummary(
  recorder: RejectionRecorder,
): QuestionGenerationRejectionSummary {
  const phaseCounts: Record<RejectionPhase, number> = {
    model: 0,
    postprocess: 0,
    quality: 0,
  };
  const codeCounts = new Map<string, number>();

  for (const issue of recorder.issues) {
    phaseCounts[issue.phase] += 1;
    for (const code of issue.codes ?? []) {
      codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
    }
  }

  const topCodes = [...codeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, count]) => ({ code, count }));
  const lastIssue = recorder.issues.at(-1);
  const topCodeText = topCodes
    .map(({ code, count }) => `${code} x${count}`)
    .join(", ");
  const message = [
    `Rejected candidates: ${recorder.issues.length}`,
    topCodeText ? `Top codes: ${topCodeText}` : "",
    lastIssue ? `Last: ${lastIssue.phase}/${lastIssue.subType} - ${lastIssue.message}` : "",
  ].filter(Boolean).join(" | ");

  return {
    total: recorder.issues.length,
    phaseCounts,
    topCodes,
    lastIssue,
    message,
  };
}

/**
 * 직전 시도에서 새로 기록된 거절 사유를 다음 프롬프트에 주입할 짧은 한국어
 * 교정 지시 블록으로 만든다. 같은 실수를 반복하는 "맹목 재시도"를 구체적 사유를
 * 본 "교정 재생성"으로 바꿔 수율을 올리고 재시도 횟수를 줄인다.
 */
export function buildCorrectiveRetryFeedback(
  issues: QuestionGenerationRejectionIssue[],
): string | undefined {
  if (issues.length === 0) return undefined;
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const issue of issues) {
    const key =
      issue.codes && issue.codes.length > 0
        ? issue.codes.join(",")
        : issue.message;
    if (seen.has(key)) continue;
    seen.add(key);
    // 따옴표 안 내용(정답·표현 파생 텍스트)은 다음 프롬프트로의 누설 경로가 될 수
    // 있어 …로 가린다. 게이트 이름·구조적 사유는 보존돼 교정 신호로는 충분하다.
    const detail = issue.message
      .replace(/[“”"][^“”"]*[“”"]|'[^']*'/g, "…")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
    if (detail) lines.push(`- ${detail}`);
    if (lines.length >= 4) break;
  }
  if (lines.length === 0) return undefined;
  return [
    "## 직전 생성 실패 — 아래 사유를 반드시 교정해서 다시 출제",
    ...lines,
    "위와 동일한 실수를 반복하지 마세요. 형식·정답 개수·밑줄/표현의 원문 일치·오답 선지의 매력도(지문 어휘에 기반한 그럴듯한 near-miss, 정답과 길이·문체가 비슷할 것)를 모두 충족하는 새 문항을 생성하세요.",
  ].join("\n");
}

export function hasDoubleNegativeBlankSetting(input: RunGenerationInput): boolean {
  if (!input.plan.some((item) => item.subType === "BLANK_INFERENCE" && item.count > 0)) {
    return false;
  }

  const blankSettings = input.typeSettings?.BLANK_INFERENCE;
  return (
    typeof blankSettings === "object" &&
    blankSettings !== null &&
    "doubleNegative" in blankSettings &&
    (blankSettings as { doubleNegative?: unknown }).doubleNegative === true
  );
}

export function hasBlankParaphraseAnswerSetting(input: RunGenerationInput): boolean {
  if (!input.plan.some((item) => item.subType === "BLANK_INFERENCE" && item.count > 0)) {
    return false;
  }

  const resolved = resolveQuestionTypeGenerationSettings(
    "BLANK_INFERENCE",
    input.typeSettings?.BLANK_INFERENCE,
  );
  return (
    resolved.blankInferenceParaphraseAnswer === true &&
    resolved.blankInferenceDoubleNegative !== true &&
    (resolved.blankInferenceBlankCount ?? 1) === 1
  );
}

export function hasSingleBlankInferenceSetting(input: RunGenerationInput): boolean {
  if (!input.plan.some((item) => item.subType === "BLANK_INFERENCE" && item.count > 0)) {
    return false;
  }

  const resolved = resolveQuestionTypeGenerationSettings(
    "BLANK_INFERENCE",
    input.typeSettings?.BLANK_INFERENCE,
  );
  return (resolved.blankInferenceBlankCount ?? 1) === 1;
}

export function getLargestIrrelevantSlotCount(input: RunGenerationInput): number {
  let maxSlotCount = 0;
  for (const item of input.plan) {
    if (item.subType !== "IRRELEVANT" || item.count <= 0) continue;
    const resolved = resolveQuestionTypeGenerationSettings(
      item.subType,
      input.typeSettings?.[item.subType],
    );
    maxSlotCount = Math.max(
      maxSlotCount,
      resolved.irrelevantSlotCount ?? 0,
    );
  }
  return maxSlotCount;
}

export function getLargestGrammarMarkerCount(input: RunGenerationInput): number {
  let maxMarkerCount = 0;
  for (const item of input.plan) {
    if (item.subType !== "GRAMMAR_ERROR" || item.count <= 0) continue;
    const resolved = resolveQuestionTypeGenerationSettings(
      item.subType,
      input.typeSettings?.[item.subType],
    );
    maxMarkerCount = Math.max(
      maxMarkerCount,
      resolved.grammarMarkerCount ?? 0,
    );
  }
  return maxMarkerCount;
}

export function getLargestGrammarAnswerCount(input: RunGenerationInput): number {
  let maxAnswerCount = 0;
  for (const item of input.plan) {
    if (item.subType !== "GRAMMAR_ERROR" || item.count <= 0) continue;
    const resolved = resolveQuestionTypeGenerationSettings(
      item.subType,
      input.typeSettings?.[item.subType],
    );
    maxAnswerCount = Math.max(
      maxAnswerCount,
      resolved.grammarAnswerCount ?? 0,
    );
  }
  return maxAnswerCount;
}
