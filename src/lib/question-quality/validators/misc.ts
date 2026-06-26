// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { QuestionQualitySeverity, isRecord, normalizeText } from "../core";



export const OPTION_HEAVY_TYPES = new Set([
  "TOPIC_MAIN_IDEA",
  "TOPIC",
  "MAIN_IDEA",
  "TITLE",
  "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC",
  "IMPLIED_MEANING",
  "REFERENCE",
]);



/**
 * C5: 유형 변형 차단. AI 수정이 한 유형을 다른 유형으로 변질시키면(예: TITLE 문항에
 * BLANK 전용 필드 blanks/passageWithBlank 를 붙이거나, TITLE 발문을 빈칸/순서 발문으로
 * 바꾸면) 채점·렌더가 깨진다. 결정형으로 이질 필드/발문만 정확 타격한다.
 * 정상 옵션형 유형은 BLANK 전용 필드를 애초에 안 가지므로 무발화.
 */
export const TYPE_SIGNATURE_FOREIGN_FIELDS: Record<string, string[]> = {
  TITLE: ["blanks", "passageWithBlank", "originalExpression", "blankAnswerMode"],
  TOPIC: ["blanks", "passageWithBlank", "originalExpression", "blankAnswerMode"],
  MAIN_IDEA: ["blanks", "passageWithBlank", "originalExpression", "blankAnswerMode"],
  TOPIC_MAIN_IDEA: ["blanks", "passageWithBlank", "originalExpression", "blankAnswerMode"],
  CONTEXT_MEANING: ["blanks", "passageWithBlank", "originalExpression"],
  SYNONYM: ["blanks", "passageWithBlank", "originalExpression"],
  ANTONYM: ["blanks", "passageWithBlank", "originalExpression"],
};



export function validateTypeSignature(
  question: Record<string, unknown>,
  typeId: string,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  for (const field of TYPE_SIGNATURE_FOREIGN_FIELDS[typeId] ?? []) {
    if (question[field] != null) {
      add(
        "error",
        "type-foreign-field",
        `${typeId} 문항에 다른 유형 전용 필드(${field})가 있어 유형이 변형됐습니다.`,
      );
    }
  }

  if (typeId === "TITLE") {
    const direction = normalizeText(question.direction);
    if (/빈칸|들어갈 말|들어가기에|순서로|배열|들어갈 곳/.test(direction)) {
      add(
        "error",
        "title-direction-foreign",
        "제목 유형인데 발문이 빈칸/순서 유형으로 바뀌었습니다.",
      );
    }
  }
}



export function validateKillerBar(
  question: Record<string, unknown>,
  typeId: string,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const explanation = normalizeText(question.explanation);
  if (explanation.length < 80) {
    add("warning", "thin-killer-explanation", "KILLER explanation is too short to justify a high-difficulty item.");
  }

  const keyPoints = Array.isArray(question.keyPoints)
    ? question.keyPoints.map((point: unknown) => normalizeText(point)).filter(Boolean)
    : [];
  if (keyPoints.length < 3) {
    add("warning", "few-key-points", "KILLER item should include at least three keyPoints.");
  }

  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  if (OPTION_HEAVY_TYPES.has(typeId) && options.length === 5) {
    const optionLengths = options.map((opt) => normalizeText(opt?.text).length).filter((len) => len > 0);
    const averageLength = optionLengths.reduce((sum, len) => sum + len, 0) / optionLengths.length;
    const shortest = Math.min(...optionLengths);
    const longest = Math.max(...optionLengths);

    if (averageLength < 8) {
      add("warning", "shallow-killer-options", `${typeId} options are very short for a KILLER item.`);
    }
    if (longest >= shortest * 3 && longest - shortest > 18) {
      add("warning", "option-length-giveaway", `${typeId} option lengths are imbalanced enough to create a test-taking shortcut.`);
    }
  }
}
