// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { QuestionQualitySeverity, VisibleQuestionLanguage, containsHangul, containsLatinLetter, isRecord, normalizeText } from "../core";



/**
 * 대의파악 계열(제목/주제/요지) 부정 극성("적절하지 않은 것") 검증 —
 * answerPolarity=NEGATIVE일 때만 호출(POSITIVE/미설정=미호출, 기존 동작 불변).
 * 발문이 부정형이 아니면 정답 극성이 어긋난 것이므로 error.
 * (오답 4개의 "적절성"은 의미 판단이라 결정형 검증 불가 → 프롬프트+품질루프로 보강.)
 */
export function validateGistNegativePolarity(
  question: Record<string, unknown>,
  typeId: string,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const direction = normalizeText(question.direction);
  const asksNegative =
    /적절하지\s*않|알맞지\s*않|옳지\s*않|않은\s*것|아닌\s*것|\bNOT\b/i.test(direction);
  if (!asksNegative) {
    add(
      "error",
      "gist-polarity-direction-mismatch",
      `${typeId} 부정 극성 설정이지만 발문이 '적절하지 않은 것'을 묻지 않습니다.`,
    );
  }
  const storedPolarity = normalizeText(question.answerPolarity).toUpperCase();
  if (storedPolarity && storedPolarity !== "NEGATIVE") {
    add(
      "error",
      "gist-polarity-field-mismatch",
      `answerPolarity(${storedPolarity})가 강제 설정(NEGATIVE)과 다릅니다.`,
    );
  }
}



export function validateTopicMainIdeaQuestion(
  question: Record<string, unknown>,
  typeId: string,
  stemLanguage: VisibleQuestionLanguage | undefined,
  optionLanguage: VisibleQuestionLanguage | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const direction = normalizeText(question.direction);
  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  const optionTexts = options.map((option) => normalizeText(option.text)).filter(Boolean);
  const expectedStem = stemLanguage ?? "ko";
  const expectedOption = optionLanguage ?? (typeId === "TOPIC" ? "en" : "ko");

  if (typeId === "TOPIC") {
    if (expectedStem === "ko" && !/주제/.test(direction)) {
      add("error", "topic-direction-mismatch", "TOPIC direction must ask for the passage topic.");
    }
    // English stems vary in wording, so misses are advisory rather than blocking.
    if (expectedStem === "en" && !/topic|main\s+(subject|theme)/i.test(direction)) {
      add("warning", "topic-direction-mismatch", "English TOPIC direction should ask for the passage topic.");
    }
  }
  if (typeId === "MAIN_IDEA") {
    if (expectedStem === "ko" && !/(요지|주장)/.test(direction)) {
      add("error", "main-idea-direction-mismatch", "MAIN_IDEA direction must ask for the passage gist or author's claim.");
    }
    if (
      expectedStem === "en" &&
      !/main\s+(idea|point)|gist|claim|argu|assert|writer|author/i.test(direction)
    ) {
      add("warning", "main-idea-direction-mismatch", "English MAIN_IDEA direction should ask for the passage gist or author's claim.");
    }
  }

  if (expectedOption === "en") {
    for (const optionText of optionTexts) {
      if (containsHangul(optionText) || !containsLatinLetter(optionText)) {
        add(
          "error",
          "topic-option-language",
          `${typeId} options should be English phrases for this language setting.`,
        );
        break;
      }
    }
  } else {
    for (const optionText of optionTexts) {
      if (!containsHangul(optionText)) {
        add(
          "warning",
          "topic-main-idea-option-language",
          `${typeId} options should be Korean statements for this language setting.`,
        );
        break;
      }
    }
  }

  if (typeId === "MAIN_IDEA" && expectedOption === "ko") {
    const nounPhraseLikeCount = optionTexts.filter((text) =>
      text.length > 0 && !/(다|음|함|됨|해야|필요|중요|가능|있다|없다|된다|준다)[.!?。]?$/.test(text),
    ).length;
    if (nounPhraseLikeCount >= Math.max(3, optionTexts.length - 1)) {
      add(
        "warning",
        "main-idea-title-like-options",
        "MAIN_IDEA options look like topic/title noun phrases; use complete Korean claim statements.",
      );
    }
  }
}
