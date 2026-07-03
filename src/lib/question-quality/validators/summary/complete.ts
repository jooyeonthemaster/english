// SUMMARY_COMPLETE (요약문 완성, 단답) 품질 게이트.
// 그동안 SUMMARY_COMPLETE_MC 만 전용 검증기가 있었고 단답형(SUMMARY_COMPLETE)은
// 마커/정답 언어/정답-요약문 누수 검사가 없어(비대칭), 마커 누락·정답 인라인 노출이
// 무가드로 통과했다. MC 검증기(mc.ts)의 핵심 3게이트를 단답형에 맞춰 재사용한다.
import { QuestionQualitySeverity, containsHangul, containsLatinLetter, countLiteral, isRecord, normalizeComparableText, normalizeText } from "../../core";

export function validateSummaryCompleteQuestion(
  question: Record<string, unknown>,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const summary = normalizeText(question.summaryWithBlanks);
  const blanks = Array.isArray(question.blanks)
    ? question.blanks.filter(isRecord)
    : [];

  const labelsFromBlanks = blanks
    .map((blank) => normalizeText(blank.label))
    .filter((label) => /^\([A-Z]\)$/.test(label));
  const labelsFromSummary = Array.from(summary.matchAll(/\(([A-Z])\)/g)).map(
    (match) => `(${match[1]})`,
  );
  const blankLabels = [
    ...new Set(
      (labelsFromBlanks.length > 0
        ? labelsFromBlanks
        : labelsFromSummary.length > 0
          ? labelsFromSummary
          : ["(A)"]
      ).slice(0, 5),
    ),
  ].sort();

  if (!summary) {
    add(
      "error",
      "summary-complete-missing-summary",
      "SUMMARY_COMPLETE is missing summaryWithBlanks.",
    );
  }

  // 마커 무결성: 각 라벨이 요약문에 정확히 1회. 누락/중복이면 마스킹·렌더가 깨진다.
  if (summary && blankLabels.some((label) => countLiteral(summary, label) !== 1)) {
    add(
      "error",
      "summary-complete-blank-marker-count",
      `summaryWithBlanks must contain ${blankLabels.join(", ")} exactly once each.`,
    );
  }

  const answers = new Map(
    blanks.map((blank) => [normalizeText(blank.label), normalizeText(blank.answer)]),
  );
  if (blankLabels.some((label) => !answers.get(label))) {
    add(
      "error",
      "summary-complete-missing-blank-answer",
      `SUMMARY_COMPLETE blanks must include answers for ${blankLabels.join(", ")}.`,
    );
  }

  const summaryComparable = normalizeComparableText(summary);
  for (const label of blankLabels) {
    const answer = answers.get(label) || "";
    if (!answer) continue;
    if (containsHangul(answer) || !containsLatinLetter(answer)) {
      add(
        "error",
        "summary-complete-answer-language",
        `${label} answer must be an English word or phrase.`,
      );
      break;
    }
    // 정답이 학생 노출 요약문에 그대로 박혀 있으면 누수(빈칸 뒤에 정답을 써 둔 실수).
    const normalizedAnswer = normalizeComparableText(answer);
    if (normalizedAnswer.length >= 4 && summaryComparable.includes(normalizedAnswer)) {
      add(
        "error",
        "summary-complete-answer-leaks-in-summary",
        `${label} answer appears in summaryWithBlanks; the student-facing summary must hide the answer behind the blank marker.`,
      );
      break;
    }
  }
}
