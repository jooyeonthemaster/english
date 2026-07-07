// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { QuestionQualitySeverity, containsComparableSentence, containsLoose, countWordsForQuality, normalizeComparableText, normalizeGrammarCorrectionErrorCount, normalizeText } from "../../core";
import { isDisputableTenseToggle } from "./combo";
import { collectQuantityAnswerIssues, findGrammarPerceptionComplementToggle, hasKillerGrammarStructure, isSimpleAgreementFlip } from "./shared";



export function isThinKillerGrammarCorrectionTarget(args: {
  sourceText: string;
  displayedText: string;
  displayedError: string;
  sourceCorrection: string;
}): boolean {
  const combined = `${args.sourceText} ${args.displayedText} ${args.displayedError} ${args.sourceCorrection}`;
  if (hasKillerGrammarStructure(combined)) return false;
  if (countWordsForQuality(args.sourceText) < 10) return true;
  return (
    isSimpleAgreementFlip(args.sourceCorrection, args.displayedError, args.sourceCorrection) &&
    !/\b(?:of|which|that|who|with|including|along with|as well as|not only|both|between|from)\b/i.test(args.sourceText)
  );
}



export function validateGrammarCorrectionQuestion(
  question: Record<string, unknown>,
  passage: string | undefined,
  requestedErrorCount: number | undefined,
  requestedDifficulty: string | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const expectedErrorCount = normalizeGrammarCorrectionErrorCount(requestedErrorCount);
  const underlinedSegments = Array.isArray(question.underlinedSegments)
    ? (question.underlinedSegments as Record<string, unknown>[])
    : [];
  const passageWithUnderline = normalizeText(question.passageWithUnderline);
  const primaryErrorPart = normalizeText(question.errorPart);
  const primaryCorrectedPart = normalizeText(question.correctedPart);
  const errorParts = Array.isArray(question.errorParts)
    ? question.errorParts.map((item) => normalizeText(item))
    : [];
  const correctedParts = Array.isArray(question.correctedParts)
    ? question.correctedParts.map((item) => normalizeText(item))
    : [];
  const correctedSentence = normalizeText(question.correctedSentence);
  const correctAnswer = normalizeText(question.correctAnswer);

  if (underlinedSegments.length < 1) {
    add("error", "grammar-correction-missing-underlined-segments", "GRAMMAR_CORRECTION must underline at least one sentence/clause segment.");
    return;
  }
  if (underlinedSegments.length !== expectedErrorCount) {
    add("error", "grammar-correction-underline-count", `Expected exactly ${expectedErrorCount} wrong underlined segment(s), got ${underlinedSegments.length}.`);
  }
  if (!passageWithUnderline) {
    add("error", "grammar-correction-missing-passage-underline", "GRAMMAR_CORRECTION must render the source passage with wider underlined segment(s).");
    return;
  }

  const markerCount = (passageWithUnderline.match(/__[^_]+__/g) ?? []).length;
  if (markerCount !== expectedErrorCount) {
    add("error", "grammar-correction-underline-count-mismatch", `passageWithUnderline must render exactly ${expectedErrorCount} underlined segment(s).`);
  }

  const errorItems = underlinedSegments.filter((item) => item.isError === true);
  if (errorItems.length !== expectedErrorCount || errorItems.length !== underlinedSegments.length) {
    add("error", "grammar-correction-error-count", `GRAMMAR_CORRECTION must have exactly ${expectedErrorCount} wrong underline(s), and every underlined segment must have isError=true.`);
    return;
  }

  const collectedCorrectedParts: string[] = [];
  for (const [index, errorItem] of errorItems.entries()) {
    const sourceText = normalizeText(errorItem.sourceText);
    const displayedText = normalizeText(errorItem.displayedText);
    const displayedError =
      normalizeText(errorItem.errorPart) ||
      errorParts[index] ||
      (index === 0 ? primaryErrorPart : "");
    const sourceCorrection =
      normalizeText(errorItem.correctedPart) ||
      correctedParts[index] ||
      (index === 0 ? primaryCorrectedPart : "");

    if (sourceCorrection) collectedCorrectedParts.push(sourceCorrection);

    if (!sourceCorrection) {
      add("error", "grammar-correction-missing-corrected-part", `Error underlined segment ${index + 1} is missing correctedPart.`);
      continue;
    }
    if (!sourceText) {
      add("error", "grammar-correction-missing-source-text", `Error underlined segment ${index + 1} is missing sourceText.`);
      continue;
    }
    if (!displayedText) {
      add("error", "grammar-correction-missing-displayed-text", `Error underlined segment ${index + 1} is missing displayedText.`);
      continue;
    }
    if (!displayedError) {
      add("error", "grammar-correction-missing-error-part", `Error underlined segment ${index + 1} must include the wrong expression hidden inside the underline.`);
      continue;
    }

    if (normalizeComparableText(displayedError) === normalizeComparableText(sourceCorrection)) {
      add("error", "grammar-correction-not-mutated", `Error underlined segment ${index + 1} has the same errorPart and correctedPart.`);
    }
    if (correctedParts[index] && normalizeComparableText(correctedParts[index]) !== normalizeComparableText(sourceCorrection)) {
      add("error", "grammar-correction-correction-mismatch", `correctedParts[${index}] must match the segment correctedPart.`);
    }
    if (!containsLoose(sourceText, sourceCorrection)) {
      add("error", "grammar-correction-corrected-part-not-in-source-text", `correctedPart for error segment ${index + 1} must appear inside the original underlined sourceText.`);
    }
    if (!containsLoose(displayedText, displayedError)) {
      add("error", "grammar-correction-error-part-not-in-displayed-text", `errorPart for error segment ${index + 1} must appear inside the displayed underlined segment.`);
    }
    if (normalizeComparableText(sourceText) === normalizeComparableText(displayedText)) {
      add("error", "grammar-correction-displayed-not-mutated", `displayedText for error segment ${index + 1} must differ from sourceText.`);
    }
    if (normalizeComparableText(sourceText) === normalizeComparableText(sourceCorrection)) {
      add("error", "grammar-correction-underline-too-narrow", `Do not underline only the exact corrected expression for error segment ${index + 1}; underline a wider sentence or clause.`);
    }
    if (countWordsForQuality(displayedText) < Math.max(5, countWordsForQuality(displayedError) + 3)) {
      add("error", "grammar-correction-underlined-segment-short", `Error underlined segment ${index + 1} is too short; underline a wider sentence/clause so the exact error is hidden.`);
    }
    if (!containsLoose(passageWithUnderline, displayedText)) {
      add("error", "grammar-correction-displayed-text-not-rendered", `Displayed underlined segment ${index + 1} must appear in passageWithUnderline.`);
    }
    if (passage && sourceText && !containsLoose(passage, sourceText)) {
      add("error", "grammar-correction-source-text-not-source-backed", `sourceText for error segment ${index + 1} must exist in the original passage.`);
    }

    const combined = `${displayedError} ${sourceCorrection}`.toLowerCase();
    if (/\bto\s+(?:be\s+)?(?:gain|gained|lose|lost)\b/.test(combined)) {
      add("error", "grammar-correction-debatable-infinitive", "Do not use active/passive infinitive preference as the grammar-correction target.");
    }
    // 수량(m) 정답 시비 게이트 — 서술형 교정에도 동일 적용(의미토글·양용명사·규범논쟁).
    for (const qIssue of collectQuantityAnswerIssues(sourceCorrection, displayedError, sourceText)) {
      add("error", qIssue.code, qIssue.message);
    }
    // 시제 단독변경 시비 게이트 (wave1) — GRAMMAR_ERROR 와 동일: 같은 어간의
    // 현재↔과거 토글은 문맥상 두 시제가 모두 가능해 정답 시비가 된다.
    // 교정형은 학생이 직접 고쳐 쓰므로 시비가 그대로 복수정답이 된다.
    if (isDisputableTenseToggle(sourceCorrection, displayedError)) {
      add(
        "error",
        "grammar-correction-tense-only-error",
        `GRAMMAR_CORRECTION segment ${index + 1} hides a tense-only change ("${sourceCorrection}" ↔ "${displayedError}"), which is contextually disputable; use a proven mutation type instead.`,
      );
    }
    // 지각동사 보어 토글 게이트 (wave1) — 오류형이 지각동사 구문/명사+to-V 파스로
    // 정문이 되면 "틀린 부분"이 존재하지 않는 무정답 문항이 된다.
    const perceptionToggle = findGrammarPerceptionComplementToggle(
      sourceCorrection,
      displayedError,
      sourceText,
      passage,
    );
    if (perceptionToggle) {
      add("error", "grammar-correction-perception-toggle", perceptionToggle);
    }
    if (
      requestedDifficulty === "KILLER" &&
      isThinKillerGrammarCorrectionTarget({
        sourceText,
        displayedText,
        displayedError,
        sourceCorrection,
      })
    ) {
      add(
        "error",
        "grammar-correction-killer-thin-segment",
        `KILLER GRAMMAR_CORRECTION segment ${index + 1} hides a local short-form change without enough structural load; prefer a relation, participle, parallel, long subject-verb, or complement pattern.`,
      );
    }
  }

  if (collectedCorrectedParts.length === expectedErrorCount) {
    const expectedAnswer = collectedCorrectedParts
      .map((part, index) => `(${String.fromCharCode(65 + index)}) ${part}`)
      .join(", ");
    if (correctAnswer && normalizeComparableText(correctAnswer) !== normalizeComparableText(expectedAnswer)) {
      add("error", "grammar-correction-answer-mismatch", "correctAnswer must equal every label and correctedPart joined by comma + space.");
    }
  }

  if (passage && correctedSentence && !containsComparableSentence(passage, correctedSentence)) {
    add("error", "grammar-correction-sentence-not-source-backed", "correctedSentence must be an original source-passage sentence when provided.");
  }
}
