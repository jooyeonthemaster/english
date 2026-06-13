import { type FormatSpec, parseFormatSpec } from "./format-spec";
import type { CompiledCustomType } from "./types";

// v1 유형(format=null)을 스튜디오에서 열었을 때, 기존 구조 필드로부터
// 합리적인 기본 FormatSpec 을 시드한다(저장 전까지는 클라이언트 상태일 뿐).

export function seedFormatSpecFromSpec(spec: CompiledCustomType): FormatSpec {
  const isObjective = spec.answerShape !== "SHORT_ANSWER";
  return parseFormatSpec({
    stem: {
      pattern: "",
      language: "ko",
      pointsVisible: false,
      points: null,
      negativeForm: false,
      emphasis: [],
    },
    stimulus: {
      present: spec.passageBased,
      form: spec.passageBased ? "PASSAGE" : "NONE",
    },
    boxes: [],
    choices: {
      present: isObjective && spec.optionCount > 0,
      count: Math.max(spec.optionCount, isObjective ? 5 : 0),
      markerStyle: "CIRCLED_NUM",
      layout: "VERTICAL",
      itemPattern: "TEXT",
    },
    answer: {
      shape: spec.answerShape === "OTHER" ? "MIXED" : spec.answerShape,
      correctCount: Math.max(1, spec.correctAnswerCount),
      multipleAnswers: spec.multipleAnswers,
      subjective: {
        answerLineCount: spec.answerShape === "SHORT_ANSWER" ? 4 : 0,
        answerBlankCount: 0,
        blankLabelStyle: "NONE",
        answerFormat: "",
        conditionsCount: 0,
      },
    },
    layoutNotes: [],
  });
}
