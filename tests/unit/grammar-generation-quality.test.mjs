import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import quality from "@/lib/question-quality";
import postProcessModule from "@/lib/question-postprocess";
import questionGenerationHelperModule from "../src/app/api/ai/generate-questions-auto/_lib/run-question-generation-helpers.ts";

const { validateQuestionQuality, buildQuestionTargetCandidateBlock } = quality;
const { postProcessQuestion } = postProcessModule;
const { buildCorrectiveRetryFeedback } = questionGenerationHelperModule;

const thinPassage =
  "Rational decision-making, by contrast, requires people to slow down and compare possible outcomes before acting. " +
  "It also depends on evidence that can be tested, choices that remain open, and habits that make people careful.";

const thinGrammarError = {
  direction: "다음 글의 밑줄 친 부분 중 어법상 틀린 것은?",
  difficulty: "KILLER",
  passageWithMarkers:
    "Rational decision-making, by contrast, __(A) require__ people to slow down and compare possible outcomes before acting. " +
    "It also depends on evidence __(B) that__ can be tested, choices __(C) that__ remain open, and habits that __(D) make__ people __(E) careful__.",
  markedExpressions: [
    { label: "A", expression: "requires", errorExpression: "require", correction: "requires", isError: true, pointCode: "d", surroundingText: "Rational decision-making, by contrast, requires people to slow down" },
    { label: "B", expression: "that", isError: false, pointCode: "b", surroundingText: "evidence that can be tested" },
    { label: "C", expression: "remain open", isError: false, pointCode: "f", surroundingText: "choices that remain open" },
    { label: "D", expression: "make", isError: false, pointCode: "h", surroundingText: "habits that make people careful" },
    { label: "E", expression: "careful", isError: false, pointCode: "f", surroundingText: "make people careful" },
  ],
  options: [
    { label: "A", text: "require" },
    { label: "B", text: "that" },
    { label: "C", text: "remain open" },
    { label: "D", text: "make" },
    { label: "E", text: "careful" },
  ],
  correctAnswer: "A",
  wrongOptionExplanations: {
    B: "that은 evidence를 선행사로 하는 관계대명사로 가능하다.",
    C: "remain open은 보어 자리의 형용사 open이 와서 적절하다.",
    D: "make는 관계절 안 동사로 주어 habits와 호응한다.",
    E: "careful은 목적격보어 자리의 형용사로 적절하다.",
  },
  explanation: "동명사구 Rational decision-making이 단수 주어이므로 requires가 맞다.",
};

const richPassage =
  "The reports that the committee reviewed, which were based on interviews with residents, show how policies designed to reduce waste can change habits.";

const advancedPassage =
  "The platform made it difficult for families to compare plans before the deadline. " +
  "Never have researchers seen such rapid changes in local habits, and only after several trials did the committee accept the result.";

const focusPassage =
  "The proposal was designed to reduce waste without confusing residents. " +
  "The new rule allowed families to compare fees and made them aware of hidden costs.";

const noisyGlassPassage =
  "Clear and perfect as it might appear to our eyes, the technical term for this mess depends on who you're asking. " +
  "In theory it is both liquid and solid, though, given the way it behaves, it is the latter. " +
  "The glass is slowly sinking over time, despite it being one of the oldest substances.";

const richGrammarError = {
  ...thinGrammarError,
  passageWithMarkers:
    "The reports __(A) that__ the committee reviewed, __(B) which was__ based on interviews with residents, __(C) show__ how policies __(D) designed__ to reduce waste can __(E) change__ habits.",
  markedExpressions: [
    { label: "A", expression: "that", isError: false, pointCode: "b", surroundingText: "reports that the committee reviewed" },
    { label: "B", expression: "which were", errorExpression: "which was", correction: "which were", isError: true, pointCode: "d", surroundingText: "reports that the committee reviewed, which were based on interviews" },
    { label: "C", expression: "show", isError: false, pointCode: "a", surroundingText: "The reports ... show how policies" },
    { label: "D", expression: "designed", isError: false, pointCode: "c", surroundingText: "policies designed to reduce waste" },
    { label: "E", expression: "change", isError: false, pointCode: "a", surroundingText: "can change habits" },
  ],
  options: [
    { label: "A", text: "that" },
    { label: "B", text: "which was" },
    { label: "C", text: "show" },
    { label: "D", text: "designed" },
    { label: "E", text: "change" },
  ],
  correctAnswer: "B",
  wrongOptionExplanations: {
    A: "that은 목적격 관계대명사로 가능하다.",
    C: "주어 reports가 복수이므로 show가 맞다.",
    D: "policies를 수식하는 과거분사 designed가 맞다.",
    E: "조동사 can 뒤에는 동사원형 change가 온다.",
  },
  explanation: "which의 선행사는 reports이므로 which were가 맞고 which was는 수일치 오류다.",
};

const thinGrammarCorrection = {
  direction: "다음 글의 밑줄 친 부분에서 어법상 틀린 부분을 찾아 바르게 고쳐 쓰시오.",
  difficulty: "KILLER",
  passageWithUnderline: "__Rational decision-making require people to compare outcomes before they act.__",
  underlinedSegments: [
    {
      sourceText: "Rational decision-making requires people to compare outcomes before they act.",
      displayedText: "Rational decision-making require people to compare outcomes before they act.",
      isError: true,
      errorPart: "require",
      correctedPart: "requires",
    },
  ],
  errorPart: "require",
  correctedPart: "requires",
  correctAnswer: "(A) requires",
  explanation: "동명사구 Rational decision-making이 단수 주어이므로 requires가 필요하다.",
  keyPoints: ["수일치", "동명사 주어", "동사 형태"],
};

const richGrammarCorrection = {
  direction: thinGrammarCorrection.direction,
  difficulty: "KILLER",
  passageWithUnderline: "__The reports that the committee reviewed, which was based on interviews with residents, show how policies designed to reduce waste can change habits.__",
  underlinedSegments: [
    {
      sourceText: richPassage,
      displayedText: "The reports that the committee reviewed, which was based on interviews with residents, show how policies designed to reduce waste can change habits.",
      isError: true,
      errorPart: "which was",
      correctedPart: "which were",
    },
  ],
  errorPart: "which was",
  correctedPart: "which were",
  correctAnswer: "(A) which were",
  explanation: "which의 선행사가 복수 reports이므로 which were가 필요하다.",
  keyPoints: ["관계절", "선행사 reports", "수일치"],
};

const thinGrammarErrorQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: thinGrammarError,
  passage: thinPassage,
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const richGrammarErrorQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    explanation: "In (B), the displayed 'which was' is wrong because the antecedent is the plural noun reports; it should be 'which were'.",
  },
  passage: richPassage,
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const basicDecorativeDecoysQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: [
      {
        label: "A",
        expression: "it",
        isError: false,
        pointCode: "g",
        surroundingText: "Clear and perfect as it might appear to our eyes",
      },
      {
        label: "B",
        expression: "which were",
        errorExpression: "which was",
        correction: "which were",
        isError: true,
        pointCode: "d",
        surroundingText: "reports that the committee reviewed, which were based on interviews",
      },
      {
        label: "C",
        expression: "that",
        isError: false,
        pointCode: "g",
        surroundingText: "old windows are generally not that way because the glass changes slowly",
      },
      {
        label: "D",
        expression: "designed",
        isError: false,
        pointCode: "c",
        surroundingText: "policies designed to reduce waste",
      },
      {
        label: "E",
        expression: "As one",
        isError: false,
        pointCode: "m",
        surroundingText: "As one glassmaker put it, glass is neither simple nor still",
      },
    ],
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'which was' is wrong because the antecedent is plural reports; it should be 'which were'.",
  },
  passage:
    richPassage +
    " Clear and perfect as it might appear to our eyes, old windows are generally not that way because the glass changes slowly. As one glassmaker put it, glass is neither simple nor still.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const punctuatedFragmentDecoyQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "D"
        ? {
            ...markedExpression,
            expression: "asking: for some scientists it is",
            isError: false,
            pointCode: "b",
            surroundingText: "who you're asking: for some scientists it is an amorphous solid",
          }
        : markedExpression,
    ),
  },
  passage: richPassage + " The term depends on who you're asking: for some scientists it is an amorphous solid.",
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const nonSourceExpressionGrammarErrorQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "provides",
            correction: "provides",
            errorExpression: "providing",
            isError: true,
          }
        : markedExpression,
    ),
  },
  passage: richPassage,
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const surfaceOrderExplanationQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    explanation: "(B) 'which were' agrees with the plural antecedent reports; the displayed 'which was' is the error.",
  },
  passage: richPassage,
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const answerRangeLeakExplanationQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    explanation: "(B) 'which was' is wrong because the antecedent reports is plural; it should be 'which were'. The remaining (A)~(C) are grammatically correct.",
  },
  passage: richPassage,
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const answerInWrongExplanationQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    explanation: "In (B), the displayed 'which was' is wrong because the antecedent is plural; it should be 'which were'.",
    wrongOptionExplanations: {
      ...richGrammarError.wrongOptionExplanations,
      B: "This answer label should never be placed in wrongOptionExplanations.",
    },
  },
  passage: richPassage,
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const obviousPronounAgreementQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "is",
            errorExpression: "are",
            correction: "is",
            isError: true,
            pointCode: "d",
            surroundingText: "for some scientists it is an amorphous solid",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'are' is wrong because it refers to a singular term; it should be 'is'.",
  },
  passage: richPassage + " For some scientists it is an amorphous solid.",
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const obviousObjectPronounSubjectQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "it",
            errorExpression: "them",
            correction: "it",
            isError: true,
            pointCode: "g",
            surroundingText: "As wind meets a rectangular skyscraper it pushes on the flat face of the building",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'them' is wrong because the subject pronoun should be 'it'.",
  },
  passage:
    richPassage +
    " As wind meets a rectangular skyscraper it pushes on the flat face of the building before flowing around its sides.",
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const obviousNounWhatRelativeQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) => {
      if (markedExpression.label === "A") {
        return {
          ...markedExpression,
          expression: "that",
          errorExpression: "what",
          correction: "that",
          isError: true,
          pointCode: "b",
          surroundingText: "reports that the committee reviewed",
        };
      }
      if (markedExpression.label === "B") {
        return {
          ...markedExpression,
          expression: "which were",
          errorExpression: "which were",
          correction: "which were",
          isError: false,
        };
      }
      return markedExpression;
    }),
    correctAnswer: "A",
    correctAnswers: ["A"],
    explanation: "In (A), the displayed 'what' is wrong because the noun reports is already present; it should be 'that'.",
  },
  passage: richPassage,
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const obviousSeemGerundQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "to obey",
            errorExpression: "obeying",
            correction: "to obey",
            isError: true,
            pointCode: "k",
            surroundingText: "Glass seems to obey most molecular laws.",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'obeying' is wrong because seem takes a to-infinitive complement; it should be 'to obey'.",
  },
  passage: richPassage + " Glass seems to obey most molecular laws.",
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const obviousToGerundAfterVerbQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "pay",
            errorExpression: "paying",
            correction: "pay",
            isError: true,
            pointCode: "k",
            surroundingText: "a population that cannot afford to pay for it",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'paying' is wrong because afford takes a to-infinitive complement; it should be 'pay'.",
  },
  passage: richPassage + " A population cannot afford to pay for it.",
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const obviousBeforeAfterToInfinitiveQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "flowing",
            errorExpression: "to flow",
            correction: "flowing",
            isError: true,
            pointCode: "k",
            surroundingText: "it pushes on the flat face of the building before flowing around its sides",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'to flow' is wrong because before should be followed by flowing here.",
  },
  passage:
    richPassage +
    " It pushes on the flat face of the building before flowing around its sides.",
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const affordModalMislabelQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    explanation: "In (B), 'paying' is wrong because afford to has a 준조동사적 성격 and should be followed by pay.",
  },
  passage: richPassage,
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const misplacedMarkerQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    passageWithMarkers: "The reports that the committee reviewed, which were based on interviews with residents, __(A) show__ how policies designed to reduce waste can change habits.",
    markedExpressions: [
      {
        label: "A",
        expression: "show",
        errorExpression: "shows",
        correction: "show",
        isError: true,
        pointCode: "d",
        surroundingText: "Glass seems to obey most molecular laws.",
      },
      { label: "B", expression: "that", isError: false, pointCode: "b", surroundingText: "reports that the committee reviewed" },
      { label: "C", expression: "designed", isError: false, pointCode: "c", surroundingText: "policies designed to reduce waste" },
      { label: "D", expression: "can", isError: false, pointCode: "a", surroundingText: "can change habits" },
      { label: "E", expression: "change", isError: false, pointCode: "a", surroundingText: "change habits" },
    ],
    options: [
      { label: "A", text: "shows" },
      { label: "B", text: "that" },
      { label: "C", text: "designed" },
      { label: "D", text: "can" },
      { label: "E", text: "change" },
    ],
    correctAnswer: "A",
    correctAnswers: ["A"],
    explanation: "In (A), the displayed 'shows' is wrong because reports is plural; it should be 'show'.",
  },
  passage: richPassage,
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const obviousModalGerundQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "pay",
            errorExpression: "paying",
            correction: "pay",
            isError: true,
            pointCode: "k",
            surroundingText: "families can pay the fee without delay",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'paying' is wrong because the modal can requires the base verb pay.",
  },
  passage: richPassage + " Families can pay the fee without delay.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const obviousDoubleIngQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "being employed",
            errorExpression: "being employing",
            correction: "being employed",
            isError: true,
            pointCode: "c",
            surroundingText: "workers being employed by the firm",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'being employing' is wrong because workers receive the action; it should be 'being employed'.",
  },
  passage: richPassage + " Workers being employed by the firm were trained carefully.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const obviousLocalAgreementQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "is",
            errorExpression: "are",
            correction: "is",
            isError: true,
            pointCode: "d",
            surroundingText: "the glass is an amorphous solid",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'are' is wrong because the subject glass is singular; it should be 'is'.",
  },
  passage: richPassage + " The glass is an amorphous solid.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const unsupportedKeyPointQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    keyPoints: ["whether", "relative clause"],
    explanation: "In (B), whether should be checked even though the passage does not contain it.",
  },
  passage: richPassage,
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const denseMarkerQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    passageWithMarkers:
      "The __(A) reports__ __(B) that__ the committee reviewed, which were based on interviews with residents, __(C) show__ how policies __(D) designed__ to reduce waste can __(E) change__ habits.",
    markedExpressions: [
      { label: "A", expression: "reports", isError: false, pointCode: "d", surroundingText: "The reports that the committee reviewed" },
      { label: "B", expression: "that", isError: false, pointCode: "b", surroundingText: "reports that the committee reviewed" },
      { label: "C", expression: "show", errorExpression: "shows", correction: "show", isError: true, pointCode: "d", surroundingText: "The reports that the committee reviewed show how policies" },
      { label: "D", expression: "designed", isError: false, pointCode: "c", surroundingText: "policies designed to reduce waste" },
      { label: "E", expression: "change", isError: false, pointCode: "a", surroundingText: "can change habits" },
    ],
    correctAnswer: "C",
    correctAnswers: ["C"],
    explanation: "In (C), the displayed 'shows' is wrong because the subject reports is plural; it should be 'show'.",
  },
  passage: richPassage,
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const basicToGerundAfterVerbQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "pay",
            errorExpression: "paying",
            correction: "pay",
            isError: true,
            pointCode: "k",
            surroundingText: "a population that cannot afford to pay for it",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'paying' is wrong because afford takes a to-infinitive complement; it should be 'pay'.",
  },
  passage: richPassage + " A population cannot afford to pay for it.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const toInfinitivePhraseToGerundQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "to pay",
            errorExpression: "paying",
            correction: "to pay",
            isError: true,
            pointCode: "k",
            surroundingText: "a population that cannot afford to pay for it",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), paying is wrong after afford; it should be to pay.",
  },
  passage: richPassage + " A population cannot afford to pay for it.",
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const modalToInfinitiveQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "pay",
            errorExpression: "to pay",
            correction: "pay",
            isError: true,
            pointCode: "a",
            surroundingText: "demographics that can pay more",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'to pay' is wrong because a modal must be followed by a bare verb; it should be 'pay'.",
  },
  passage: richPassage + " The demographics can pay more.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const attentionToGerundQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "find",
            errorExpression: "finding",
            correction: "find",
            isError: true,
            pointCode: "k",
            surroundingText: "and research communities to find cures",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), finding is wrong after to; it should be find.",
  },
  passage: richPassage + " AI can broaden the attention of research communities to find cures.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const connectorToWhatQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "even if",
            errorExpression: "what",
            correction: "even if",
            isError: true,
            pointCode: "b",
            surroundingText: "even if a disease is quite prevalent",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), what is wrong before a complete clause; it should be even if.",
  },
  passage: richPassage + " Even if a disease is quite prevalent, it may be neglected.",
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const despiteBeingToBeQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "being",
            errorExpression: "to be",
            correction: "being",
            isError: true,
            pointCode: "k",
            surroundingText: "despite it being one of the oldest substances",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), to be is wrong after despite it; it should be being.",
  },
  passage: richPassage + " Despite it being old, glass is difficult to classify.",
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const moreMostLikeQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "more",
            errorExpression: "most",
            correction: "more",
            isError: true,
            pointCode: "m",
            surroundingText: "glass looks more like a random ball-pit of atoms",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), most is wrong; it should be more.",
  },
  passage: richPassage + " Glass looks more like a random ball-pit of atoms.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const lookLikeLexicalAnswerQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "looks more like",
            errorExpression: "looks like more",
            correction: "looks more like",
            isError: true,
            pointCode: "m",
            surroundingText: "glass looks more like a random ball-pit of atoms",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'looks like more' is wrong; it should be 'looks more like'.",
  },
  passage: richPassage + " Glass looks more like a random ball-pit of atoms.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const becauseDespiteClauseQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "because",
            errorExpression: "despite",
            correction: "because",
            isError: true,
            pointCode: "l",
            surroundingText: "because the glass is slowly sinking over time",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), despite is wrong before a finite clause; it should be because.",
  },
  passage: richPassage + " It changed because the glass is slowly sinking over time.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const sinkPassiveQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "is slowly sinking",
            errorExpression: "was slowly sunk",
            correction: "is slowly sinking",
            isError: true,
            pointCode: "e",
            surroundingText: "the glass is slowly sinking over time",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), was slowly sunk is wrong; it should be is slowly sinking.",
  },
  passage: richPassage + " The glass is slowly sinking over time.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const seemToGerundQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "to obey",
            errorExpression: "obeying",
            correction: "to obey",
            isError: true,
            pointCode: "k",
            surroundingText: "Glass seems to obey most molecular laws.",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), obeying is wrong after seems; it should be to obey.",
  },
  passage: richPassage + " Glass seems to obey most molecular laws.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const seemToBareGerundQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "obey",
            errorExpression: "obeying",
            correction: "obey",
            isError: true,
            pointCode: "a",
            surroundingText: "Glass seems to obey most molecular laws.",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), obeying is wrong after seems to; it should be obey.",
  },
  passage: richPassage + " Glass seems to obey most molecular laws.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const fullSeemPhraseGerundQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "seems to obey",
            errorExpression: "seems obeying",
            correction: "seems to obey",
            isError: true,
            pointCode: "k",
            surroundingText: "Glass seems to obey most molecular laws.",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), seems obeying is wrong; it should be seems to obey.",
  },
  passage: richPassage + " Glass seems to obey most molecular laws.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const localParticipleParallelQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "solidified",
            errorExpression: "solidifying",
            correction: "solidified",
            isError: true,
            pointCode: "c",
            surroundingText: "they were blown and solidified in the first place",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), solidifying is wrong in the parallel structure; it should be solidified.",
  },
  passage: richPassage + " They were blown and solidified in the first place.",
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const adjacentSvAgreementQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "seems",
            errorExpression: "seem",
            correction: "seems",
            isError: true,
            pointCode: "d",
            surroundingText: "Glass seems to obey most molecular laws.",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'seem' is wrong because Glass is singular; it should be 'seems'.",
  },
  passage: richPassage + " Glass seems to obey most molecular laws.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const intransitivePassiveQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "appear",
            errorExpression: "be appeared",
            correction: "appear",
            isError: true,
            pointCode: "e",
            surroundingText: "Clear as it might appear to our eyes",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'be appeared' is wrong because appear is intransitive; it should be 'appear'.",
  },
  passage: richPassage + " Clear as it might appear to our eyes, it is complex.",
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const shallowParticipleAdjectiveQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "neglected",
            errorExpression: "neglecting",
            correction: "neglected",
            isError: true,
            pointCode: "c",
            surroundingText: "among traditionally neglected populations",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'neglecting' is wrong because populations are neglected; it should be 'neglected'.",
  },
  passage: richPassage + " The issue affected traditionally neglected populations.",
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const appearAdverbMislabelQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "A"
        ? {
            ...markedExpression,
            expression: "appear",
            isError: false,
            pointCode: "e",
            surroundingText: "Clear and perfect as it might appear to our eyes",
          }
        : markedExpression,
    ),
    keyPoints: [
      "\uD615\uC6A9\uC0AC \uB3C4\uCE58 \uAD6C\uBB38\uC5D0\uC11C \uBD80\uC0AC appear\uC758 \uC5ED\uD560\uC744 \uD655\uC778\uD55C\uB2E4.",
    ],
  },
  passage: richPassage + " Clear and perfect as it might appear to our eyes, glass is complex.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const nonstandardTerminologyQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    keyPoints: ["\uC804\uC0AC\uAD6C \uC131\uACA9\uC758 \uBD84\uC0AC \uD45C\uD604\uC744 \uD655\uC778\uD55C\uB2E4."],
  },
  passage: richPassage,
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const explanationTypoQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    wrongOptionExplanations: {
      ...richGrammarError.wrongOptionExplanations,
      D: "The preposition dsepite must be followed by a noun phrase or gerund phrase.",
    },
  },
  passage: richPassage,
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const nounClausePronounMislabelQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    keyPoints: [
      "\uBA85\uC0AC\uC808 \uB0B4\uC5D0\uC11C \uB2E8\uC218 \uBA85\uC0AC\uB97C \uAC00\uB9AC\uD0A4\uB294 \uB300\uBA85\uC0AC 'it'\uC758 \uC218\uC77C\uCE58 \uD655\uC778\uD558\uAE30",
    ],
  },
  passage: richPassage + " This mess is difficult to explain because it is old.",
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const phrasalVerbMislabelQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    keyPoints: [
      "\uC218\uB3D9\uD0DC \uAD6C\uB3D9\uC0AC \uAD6C\uC870(were blown and solidified)\uC5D0\uC11C \uC8FC\uC5B4\uC640\uC758 \uC218\uB3D9 \uAD00\uACC4 \uD30C\uC545",
    ],
  },
  passage: richPassage + " They were blown and solidified in the first place.",
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const basicOverloadedDesignQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    keyPoints: [
      "\uC591\uBCF4 \uB3C4\uCE58 \uAD6C\uBB38\uC758 \uD615\uC6A9\uC0AC \uBCF4\uC5B4 \uAD00\uACC4 \uD30C\uC545",
      "\uC804\uCE58\uC0AC \uB4A4 \uC758\uBBF8\uC0C1 \uC8FC\uC5B4\uB97C \uB3D9\uBC18\uD55C \uB3D9\uBA85\uC0AC\uAD6C it being \uD310\uBCC4",
      "\uC218\uB3D9\uD0DC \uBCD1\uB82C \uAD6C\uC870 were blown and solidified \uD655\uC778",
    ],
  },
  passage: richPassage + " Clear and perfect as it might appear, it was shaped despite it being old.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const endurePassiveObjectQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "has endured",
            errorExpression: "has been endured",
            correction: "has endured",
            isError: true,
            pointCode: "e",
            surroundingText: "Unless the church has endured temperatures of more than 400 degrees",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), has been endured is wrong before temperatures; it should be has endured.",
  },
  passage: richPassage + " Unless the church has endured temperatures of more than 400 degrees, the glass remains uneven.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const gibberishInversionFragmentQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "has endured",
            errorExpression: "had some church endured",
            correction: "has endured",
            isError: true,
            pointCode: "d",
            surroundingText: "Unless the church has endured temperatures of more than 400 degrees",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), had some church endured is not a valid inversion; it should be has endured.",
  },
  passage: richPassage + " Unless the church has endured temperatures of more than 400 degrees, the glass remains uneven.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const finiteToIngColonQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "depends",
            errorExpression: "depending",
            correction: "depends",
            isError: true,
            pointCode: "a",
            surroundingText: "The technical term for this mess depends on who you're asking: for some scientists",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), depending is wrong because the sentence needs the finite verb depends.",
  },
  passage: richPassage + " The technical term for this mess depends on who you're asking: for some scientists it is an amorphous solid.",
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const tooBasicHigherTierDecoyQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "D"
        ? {
            ...markedExpression,
            expression: "does",
            isError: false,
            pointCode: "d",
            surroundingText: "why glass behaves the way it does",
          }
        : markedExpression,
    ),
  },
  passage: richPassage + " Scientists ask why glass behaves the way it does.",
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const longGrammarExplanationQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    explanation: "In (B), which was is wrong because reports is plural. ".repeat(14),
  },
  passage: richPassage,
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const mixedAsItSpanQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "A"
        ? {
            ...markedExpression,
            expression: "as it",
            isError: false,
            pointCode: "m",
            surroundingText: "Clear and perfect as it might appear to our eyes",
          }
        : markedExpression,
    ),
  },
  passage: richPassage + " Clear and perfect as it might appear to our eyes, the surface looked stable.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const untestedKeyPointTokenQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    keyPoints: ["Check whether unless introduces a complete clause."],
  },
  passage: richPassage,
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const lookLikeComplementMislabelQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    keyPoints: [
      "\uAC10\uAC01\uB3D9\uC0AC look more like \uB4A4\uC758 \uD615\uC6A9\uC0AC \uBCF4\uC5B4 \uC790\uB9AC \uD30C\uC545",
      "looks more like\uB294 \uBE44\uAD50\uAE09 \uC804\uCE58\uC0AC\uAD6C \uD615\uD0DC\uC774\uBBC0\uB85C \uC801\uC808",
    ],
  },
  passage: richPassage + " Glass looks more like a random ball-pit of atoms.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const seemToComplementMislabelQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    keyPoints: ["seems to obey\uB294 \uC5F0\uACB0\uB3D9\uC0AC \uB4A4\uC758 to\uBD80\uC815\uC0AC \uBCF4\uC5B4 \uAD6C\uC870"],
  },
  passage: richPassage + " Glass seems to obey most molecular laws.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const seemToObjectMislabelQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    wrongOptionExplanations: {
      ...richGrammarError.wrongOptionExplanations,
      E: "seems to obey\uC5D0\uC11C to obey\uB294 seem\uC758 \uBAA9\uC801\uC5B4\uB85C \uC4F0\uC778 to\uBD80\uC815\uC0AC\uC774\uBBC0\uB85C \uC801\uC808\uD569\uB2C8\uB2E4.",
    },
  },
  passage: richPassage + " Glass seems to obey most molecular laws.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const thatWayAdverbMislabelQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    wrongOptionExplanations: {
      ...richGrammarError.wrongOptionExplanations,
      D: "that way\uC758 that\uC740 \uC9C0\uC2DC\uBD80\uC0AC\uB85C \uB4A4\uC758 way\uB97C \uC124\uBA85\uD558\uBBC0\uB85C \uC801\uC808\uD569\uB2C8\uB2E4.",
    },
  },
  passage: richPassage + " They were not that way because of age.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const humanMadePostmodifierMislabelQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    keyPoints: ["human-made substances\uC758 made\uB294 \uBA85\uC0AC \uB4A4\uC5D0\uC11C \uD6C4\uCE58 \uC218\uC2DD\uD558\uB294 \uACFC\uAC70\uBD84\uC0AC\uC774\uB2E4."],
  },
  passage: richPassage + " Glass is one of the oldest human-made substances.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const shallowChecklistDecoysQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) => {
      if (markedExpression.label === "A") {
        return {
          ...markedExpression,
          expression: "looks more like",
          isError: false,
          pointCode: "f",
          surroundingText: "glass looks more like a random ball-pit",
        };
      }
      if (markedExpression.label === "C") {
        return {
          ...markedExpression,
          expression: "as a",
          isError: false,
          pointCode: "m",
          surroundingText: "never behaves as a liquid",
        };
      }
      if (markedExpression.label === "D") {
        return {
          ...markedExpression,
          expression: "to obey",
          isError: false,
          pointCode: "a",
          surroundingText: "Glass seems to obey most molecular laws",
        };
      }
      return markedExpression;
    }),
  },
  passage: richPassage + " Glass looks more like a ball, behaves as a liquid, and seems to obey rules.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const shallowNearbyPassiveDecoyQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "E"
        ? {
            ...markedExpression,
            expression: "were blown",
            isError: false,
            pointCode: "e",
            surroundingText: "the chances are they are uneven because that's the way they were blown and solidified",
          }
        : markedExpression,
    ),
  },
  passage: richPassage + " The chances are they are uneven because that's the way they were blown and solidified.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const localPronounAuxMismatchQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "D"
        ? {
            ...markedExpression,
            expression: "they",
            errorExpression: "it",
            correction: "they",
            isError: true,
            pointCode: "g",
            surroundingText: "the chances are they are uneven because that's the way they were blown",
          }
        : markedExpression,
    ),
    correctAnswer: "D",
    correctAnswers: ["D"],
    explanation: "In (D), the displayed 'it' is wrong because it should refer back to plural chances; it should be 'they'.",
  },
  passage: richPassage + " The chances are they are uneven because that's the way they were blown.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const shallowThanDecoyQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "A"
        ? {
            ...markedExpression,
            expression: "than",
            isError: false,
            pointCode: "m",
            surroundingText: "old stained-glass windows, thicker at the bottom than the top, are generally not that way",
          }
        : markedExpression,
    ),
  },
  passage: richPassage + " The windows were thicker at the bottom than the top.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const shallowDependsDecoyQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "A"
        ? {
            ...markedExpression,
            expression: "depends",
            isError: false,
            pointCode: "d",
            surroundingText: "The technical term for this mess depends on who you're asking",
          }
        : markedExpression,
    ),
  },
  passage: richPassage + " The technical term for this mess depends on who you're asking.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const shallowDespiteAlthoughGerundQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "despite",
            errorExpression: "although",
            correction: "despite",
            isError: true,
            pointCode: "l",
            surroundingText: "The paradox is that, despite it being one of the oldest substances",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), although it being is wrong; it should be despite it being.",
  },
  passage: richPassage + " The paradox is that, despite it being old, scientists still study it.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const vagueMetadataTagQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    tags: ["\uBA85\uC0AC \uD750\uB984 \uBD84\uC11D"],
  },
  passage: richPassage,
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const thinAgreementExplanationQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "are",
            errorExpression: "is",
            correction: "are",
            isError: true,
            pointCode: "d",
            surroundingText: "Those misshapen sheets of glass you sometimes see in old stained-glass windows, thicker at the bottom than the top, are generally not that way",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "The subject is plural, so is should be are.",
  },
  passage: richPassage + " Those misshapen sheets of glass you sometimes see in old stained-glass windows, thicker at the bottom than the top, are unusual.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const passiveToGapIngQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "are being employed",
            errorExpression: "are employing",
            correction: "are being employed",
            isError: true,
            pointCode: "e",
            surroundingText: "algorithms are being employed to find treatments",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'are employing' is wrong because algorithms receive the action; it should be 'are being employed'.",
  },
  passage: richPassage + " Algorithms are being employed to find treatments.",
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const debatableWhoDecoyQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "who",
            isError: false,
            pointCode: "b",
            surroundingText: "depends on who you're asking",
          }
        : markedExpression,
    ),
  },
  passage: richPassage + " The term depends on who you're asking.",
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const discourseThoughDecoyQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "C"
        ? {
            ...markedExpression,
            expression: "though",
            isError: false,
            pointCode: "l",
            surroundingText: "it is both liquid and solid, though, given the way it behaves",
          }
        : markedExpression,
    ),
  },
  passage: richPassage + " It is both liquid and solid, though, given the way it behaves.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const killerThinRelativeAnimacyQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "who",
            errorExpression: "which",
            correction: "who",
            isError: true,
            pointCode: "b",
            surroundingText: "depends on who you're asking",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'which' is wrong because the referent is a person; it should be 'who'.",
  },
  passage: richPassage + " The term depends on who you're asking.",
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const weakFillerDecoysQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) => {
      if (markedExpression.label === "C") return { ...markedExpression, expression: "quite", isError: false, pointCode: "f", surroundingText: "is quite prevalent" };
      if (markedExpression.label === "D") return { ...markedExpression, expression: "both liquid and", isError: false, pointCode: "i", surroundingText: "it's both liquid and solid" };
      if (markedExpression.label === "E") return { ...markedExpression, expression: "more", isError: false, pointCode: "m", surroundingText: "can pay more" };
      return markedExpression;
    }),
  },
  passage: richPassage + " The disease is quite prevalent among groups that can pay more.",
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const shortSurfaceOrderExplanationQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "are",
            errorExpression: "is",
            correction: "are",
            isError: true,
            pointCode: "d",
            surroundingText: "the reports are difficult to verify",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "(B)의 are는 주어 reports와 일치해야 하므로 단수형 is가 아니라 are가 맞습니다.",
  },
  passage: richPassage + " The reports are difficult to verify.",
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const selfContradictoryExplanationQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    explanation: "This explanation reads like scratchpad with wrong hypotheses before the final answer.",
  },
  passage: richPassage,
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const koreanScratchpadExplanationQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    explanation:
      "\uC544, \uC9C8\uBB38\uC744 \uB2E4\uC2DC \uC810\uAC80\uD574 \uBCF4\uACA0\uC2B5\uB2C8\uB2E4. \uC6D0\uBB38 \uAD6C\uC870\uB97C \uD655\uC778\uD558\uACA0\uC2B5\uB2C8\uB2E4.",
  },
  passage: richPassage,
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const demonstrativeThatWayDecoyQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "C"
        ? {
            ...markedExpression,
            expression: "that",
            isError: false,
            pointCode: "b",
            surroundingText: "that's the way they were blown",
          }
        : markedExpression,
    ),
  },
  passage: richPassage + " That's the way they were blown.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const semanticWhoWhatAnswerQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "who",
            errorExpression: "what",
            correction: "who",
            isError: true,
            pointCode: "b",
            surroundingText: "depends on who you're asking",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'what' is wrong because the referent is a person; it should be 'who'.",
  },
  passage: richPassage + " The term depends on who you're asking.",
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const semanticHowWhyAnswerQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "why",
            errorExpression: "how",
            correction: "why",
            isError: true,
            pointCode: "b",
            surroundingText: "scientists still struggle to comprehend why glass behaves the way it does",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'how' is wrong; it should be 'why'.",
  },
  passage: richPassage + " Scientists still struggle to comprehend why glass behaves the way it does.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const obviousAdverbAdjectiveQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "imperceptibly",
            errorExpression: "imperceptible",
            correction: "imperceptibly",
            isError: true,
            pointCode: "f",
            surroundingText: "an imperceptibly viscous one",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'imperceptible' is wrong before viscous; it should be 'imperceptibly'.",
  },
  passage: richPassage + " It is an imperceptibly viscous one.",
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const fixedThatIsIdiomQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "is",
            errorExpression: "being",
            correction: "is",
            isError: true,
            pointCode: "a",
            surroundingText: "that is, even if a disease is prevalent",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'being' is wrong in the idiom that is; it should be 'is'.",
  },
  passage: richPassage + " That is, even if a disease is prevalent, it matters.",
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const obviousLivingLivedQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "living",
            errorExpression: "lived",
            correction: "living",
            isError: true,
            pointCode: "c",
            surroundingText: "people living in the developing world",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'lived' is wrong after people; it should be 'living'.",
  },
  passage: richPassage + " People living in the developing world need access.",
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const whatNounPrefixQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "the disease",
            errorExpression: "what the disease",
            correction: "the disease",
            isError: true,
            pointCode: "b",
            surroundingText: "the disease has been neglected compared to others",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'what the disease' is wrong because the clause already has the subject the disease.",
  },
  passage: richPassage + " The disease has been neglected compared to others.",
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const killerRepeatedAnswerPointQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) => {
      if (markedExpression.label === "B") {
        return {
          ...markedExpression,
          expression: "are",
          errorExpression: "is",
          correction: "are",
          isError: true,
          pointCode: "d",
          surroundingText: "the reports are difficult to verify",
        };
      }
      if (markedExpression.label === "C") {
        return {
          ...markedExpression,
          expression: "does",
          isError: false,
          pointCode: "d",
          surroundingText: "the policy does change habits",
        };
      }
      return markedExpression;
    }),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'is' is wrong because reports is plural; it should be 'are'.",
  },
  passage: richPassage + " The reports are difficult to verify, and the policy does change habits.",
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const killerMissingAuxQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "has been neglected",
            errorExpression: "neglected",
            correction: "has been neglected",
            isError: true,
            pointCode: "e",
            surroundingText: "the disease has been neglected compared to others",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'neglected' is wrong because the verb phrase needs has been.",
  },
  passage: richPassage + " The disease has been neglected compared to others.",
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const killerGenericAnswerPointQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "are",
            errorExpression: "being",
            correction: "are",
            isError: true,
            pointCode: "a",
            surroundingText: "Those misshapen sheets of glass you sometimes see in old stained-glass windows, thicker at the bottom than the top, are generally uneven",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'being' is wrong; the plural subject head sheets requires the finite verb are after the long modifier.",
  },
  passage:
    richPassage +
    " Those misshapen sheets of glass you sometimes see in old stained-glass windows, thicker at the bottom than the top, are generally uneven.",
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const killerThinConcessiveAsQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "as",
            errorExpression: "how",
            correction: "as",
            isError: true,
            pointCode: "b",
            surroundingText: "Clear and perfect as it might appear to our eyes",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'how' is wrong in the concessive inversion; it should be 'as'.",
  },
  passage: richPassage + " Clear and perfect as it might appear to our eyes, the theory remained incomplete.",
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const killerThinConnectorQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "B"
        ? {
            ...markedExpression,
            expression: "because",
            errorExpression: "because of",
            correction: "because",
            isError: true,
            pointCode: "l",
            surroundingText: "are generally not that way because the glass is slowly sinking over time",
          }
        : markedExpression,
    ),
    correctAnswer: "B",
    correctAnswers: ["B"],
    explanation: "In (B), the displayed 'because of' is wrong before a finite clause; it should be 'because'.",
  },
  passage: richPassage + " They are generally not that way because the glass is slowly sinking over time.",
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const debatableItBeingDecoyQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: {
    ...richGrammarError,
    markedExpressions: richGrammarError.markedExpressions.map((markedExpression) =>
      markedExpression.label === "D"
        ? {
            ...markedExpression,
            expression: "despite",
            isError: false,
            pointCode: "l",
            surroundingText: "despite it being one of the oldest substances",
          }
        : markedExpression,
    ),
  },
  passage: richPassage + " Despite it being one of the oldest substances, glass is hard to classify.",
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const thinGrammarCorrectionQuality = validateQuestionQuality({
  typeId: "GRAMMAR_CORRECTION",
  question: thinGrammarCorrection,
  passage: "Rational decision-making requires people to compare outcomes before they act.",
  requestedDifficulty: "KILLER",
  grammarCorrectionErrorCount: 1,
});

const richGrammarCorrectionQuality = validateQuestionQuality({
  typeId: "GRAMMAR_CORRECTION",
  question: richGrammarCorrection,
  passage: richPassage,
  requestedDifficulty: "KILLER",
  grammarCorrectionErrorCount: 1,
});

const circledWrongExplanationPostProcess = postProcessQuestion("GRAMMAR_ERROR", richPassage, {
  ...richGrammarError,
  wrongOptionExplanations: {
    "①": "A is grammatically correct.",
    "③": "C is grammatically correct.",
    "④": "D is grammatically correct.",
    "⑤": "E is grammatically correct.",
  },
});

const mismatchedPointCodePostProcess = postProcessQuestion("GRAMMAR_ERROR", "People often misunderstand what matters most in a crisis.", {
  direction: thinGrammarError.direction,
  difficulty: "INTERMEDIATE",
  passageWithMarkers: "People often misunderstand __(A) what__ matters most in a crisis.",
  markedExpressions: [
    { label: "A", expression: "what", isError: false, pointCode: "g", surroundingText: "misunderstand what matters most" },
  ],
  options: [{ label: "A", text: "what" }],
  correctAnswer: "",
  wrongOptionExplanations: { "(A)": "what is grammatically correct." },
  explanation: "what introduces a nominal clause.",
});

const nonSourceCorrectionPostProcess = postProcessQuestion(
  "GRAMMAR_ERROR",
  "The curated, idealized versions of life presented on these platforms can create unrealistic expectations.",
  {
    direction: thinGrammarError.direction,
    difficulty: "INTERMEDIATE",
    passageWithMarkers: "The curated, idealized versions of life __(A) presented on these platforms was__ can create unrealistic expectations.",
    markedExpressions: [
      {
        label: "A",
        expression: "presented on these platforms",
        isError: true,
        pointCode: "d",
        correction: "presented on these platforms were",
        errorExpression: "presented on these platforms was",
        surroundingText: "versions of life presented on these platforms can create",
      },
    ],
    options: [{ label: "A", text: "presented on these platforms was" }],
    correctAnswer: "(A)",
    wrongOptionExplanations: {},
    explanation: "The source correction must be copied from the original passage.",
  },
);

const topLevelCorrectionPartsPostProcess = postProcessQuestion("GRAMMAR_CORRECTION", richPassage, {
  ...richGrammarCorrection,
  underlinedSegments: [
    {
      sourceText: richPassage,
      displayedText: "The reports that the committee reviewed, which was based on interviews with residents, show how policies designed to reduce waste can change habits.",
      isError: true,
      errorPart: "which was",
    },
  ],
  correctedPart: "which were",
  correctedParts: ["which were"],
  correctAnswer: "which were",
});

const surfaceOrderPostProcess = postProcessQuestion("GRAMMAR_ERROR", richPassage, {
  ...richGrammarError,
  explanation: "(B) which were agrees with the plural antecedent reports, so which was is the error.",
});

const surfaceOrderPostProcessQuality = surfaceOrderPostProcess.success
  ? validateQuestionQuality({
      typeId: "GRAMMAR_ERROR",
      question: surfaceOrderPostProcess.data,
      passage: richPassage,
      requestedDifficulty: "KILLER",
      grammarMarkerCount: 5,
      grammarAnswerCount: 1,
    })
  : [{ severity: "error", code: "postprocess-failed", message: surfaceOrderPostProcess.error ?? "failed" }];

const nounClausePronounPostProcess = postProcessQuestion("GRAMMAR_ERROR", richPassage, {
  ...richGrammarError,
  explanation: "(B) The noun clause checks that as a pronoun reference; which was is wrong because reports is plural and should be which were.",
  keyPoints: ["noun clause that pronoun reference"],
});

const nounClausePronounPostProcessQuality = nounClausePronounPostProcess.success
  ? validateQuestionQuality({
      typeId: "GRAMMAR_ERROR",
      question: nounClausePronounPostProcess.data,
      passage: richPassage,
      requestedDifficulty: "KILLER",
      grammarMarkerCount: 5,
      grammarAnswerCount: 1,
    })
  : [{ severity: "error", code: "postprocess-failed", message: nounClausePronounPostProcess.error ?? "failed" }];

const candidateBlock = buildQuestionTargetCandidateBlock("GRAMMAR_ERROR", richPassage, {
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const advancedCandidateBlock = buildQuestionTargetCandidateBlock("GRAMMAR_ERROR", advancedPassage, {
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const focusCandidateBlock = buildQuestionTargetCandidateBlock("GRAMMAR_ERROR", focusPassage, {
  requestedDifficulty: "INTERMEDIATE",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
  pointFocus: true,
});

const basicNoisyCandidateBlock = buildQuestionTargetCandidateBlock("GRAMMAR_ERROR", noisyGlassPassage, {
  requestedDifficulty: "BASIC",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const forbiddenSurfaceCandidateBlock = buildQuestionTargetCandidateBlock(
  "GRAMMAR_ERROR",
  noisyGlassPassage + " It is an imperceptibly viscous one. Those misshapen sheets were uneven because they were blown by hand. The chances are they are uneven. Those sheets were thicker at the bottom than the top. Glass looks more like a random ball and seems to obey simple rules. Scientists wonder why glass behaves the way it does.",
  {
    requestedDifficulty: "BASIC",
    grammarMarkerCount: 5,
    grammarAnswerCount: 1,
  },
);

const correctiveRetryFeedback = buildCorrectiveRetryFeedback([
  {
    phase: "quality",
    qualityMode: "strict",
    subType: "GRAMMAR_ERROR",
    message: "grammar-weak-filler-decoys: first failed sample",
    codes: ["grammar-weak-filler-decoys"],
    sample: {
      markedExpressions: [
        { label: "A", expression: "it", isError: false, pointCode: "g" },
        {
          label: "B",
          expression: "looks more like",
          errorExpression: "looks like more",
          correction: "looks more like",
          isError: true,
          pointCode: "m",
        },
      ],
    },
  },
  {
    phase: "quality",
    qualityMode: "strict",
    subType: "GRAMMAR_ERROR",
    message: "grammar-weak-filler-decoys: second failed sample",
    codes: ["grammar-weak-filler-decoys"],
    sample: {
      markedExpressions: [
        { label: "A", expression: "latter", isError: false, pointCode: "g" },
        {
          label: "B",
          expression: "because",
          errorExpression: "because of",
          correction: "because",
          isError: true,
          pointCode: "l",
        },
      ],
    },
  },
]) ?? "";

const correctiveRetryFeedbackWithCumulativeSurfaces = buildCorrectiveRetryFeedback(
  [
    {
      phase: "model",
      qualityMode: "strict",
      subType: "GRAMMAR_ERROR",
      message: "Not Found",
    },
  ],
  {
    cumulativeIssues: [
      {
        phase: "quality",
        qualityMode: "strict",
        subType: "GRAMMAR_ERROR",
        message: "previous quality failure",
        codes: ["grammar-lexical-look-like-answer"],
        sample: {
          markedExpressions: [
            {
              label: "B",
              expression: "looks more like",
              errorExpression: "looks like more",
              correction: "looks more like",
              isError: true,
              pointCode: "m",
            },
          ],
        },
      },
      {
        phase: "model",
        qualityMode: "strict",
        subType: "GRAMMAR_ERROR",
        message: "Not Found",
      },
    ],
  },
) ?? "";

process.stdout.write(JSON.stringify({
  thinGrammarErrorQuality,
  richGrammarErrorQuality,
  basicDecorativeDecoysQuality,
  punctuatedFragmentDecoyQuality,
  nonSourceExpressionGrammarErrorQuality,
  surfaceOrderExplanationQuality,
  answerRangeLeakExplanationQuality,
  answerInWrongExplanationQuality,
  obviousPronounAgreementQuality,
  obviousObjectPronounSubjectQuality,
  obviousNounWhatRelativeQuality,
  obviousSeemGerundQuality,
  obviousToGerundAfterVerbQuality,
  obviousBeforeAfterToInfinitiveQuality,
  affordModalMislabelQuality,
  misplacedMarkerQuality,
  obviousModalGerundQuality,
  obviousDoubleIngQuality,
  obviousLocalAgreementQuality,
  unsupportedKeyPointQuality,
  denseMarkerQuality,
  basicToGerundAfterVerbQuality,
  toInfinitivePhraseToGerundQuality,
  modalToInfinitiveQuality,
  attentionToGerundQuality,
  connectorToWhatQuality,
  despiteBeingToBeQuality,
  moreMostLikeQuality,
  lookLikeLexicalAnswerQuality,
  becauseDespiteClauseQuality,
  sinkPassiveQuality,
  seemToGerundQuality,
  seemToBareGerundQuality,
  fullSeemPhraseGerundQuality,
  localParticipleParallelQuality,
  adjacentSvAgreementQuality,
  intransitivePassiveQuality,
  shallowParticipleAdjectiveQuality,
  appearAdverbMislabelQuality,
  nonstandardTerminologyQuality,
  explanationTypoQuality,
  nounClausePronounMislabelQuality,
  phrasalVerbMislabelQuality,
  basicOverloadedDesignQuality,
  endurePassiveObjectQuality,
  gibberishInversionFragmentQuality,
  finiteToIngColonQuality,
  tooBasicHigherTierDecoyQuality,
  longGrammarExplanationQuality,
  mixedAsItSpanQuality,
  untestedKeyPointTokenQuality,
  lookLikeComplementMislabelQuality,
  seemToComplementMislabelQuality,
  seemToObjectMislabelQuality,
  thatWayAdverbMislabelQuality,
  humanMadePostmodifierMislabelQuality,
  shallowChecklistDecoysQuality,
  shallowNearbyPassiveDecoyQuality,
  localPronounAuxMismatchQuality,
  shallowThanDecoyQuality,
  shallowDependsDecoyQuality,
  shallowDespiteAlthoughGerundQuality,
  vagueMetadataTagQuality,
  thinAgreementExplanationQuality,
  passiveToGapIngQuality,
  debatableWhoDecoyQuality,
  discourseThoughDecoyQuality,
  killerThinRelativeAnimacyQuality,
  weakFillerDecoysQuality,
  shortSurfaceOrderExplanationQuality,
  selfContradictoryExplanationQuality,
  koreanScratchpadExplanationQuality,
  demonstrativeThatWayDecoyQuality,
  semanticWhoWhatAnswerQuality,
  semanticHowWhyAnswerQuality,
  obviousAdverbAdjectiveQuality,
  fixedThatIsIdiomQuality,
  obviousLivingLivedQuality,
  whatNounPrefixQuality,
  killerRepeatedAnswerPointQuality,
  killerMissingAuxQuality,
  killerGenericAnswerPointQuality,
  killerThinConcessiveAsQuality,
  killerThinConnectorQuality,
  debatableItBeingDecoyQuality,
  thinGrammarCorrectionQuality,
  richGrammarCorrectionQuality,
  candidateBlock,
  advancedCandidateBlock,
  focusCandidateBlock,
  basicNoisyCandidateBlock,
  forbiddenSurfaceCandidateBlock,
  correctiveRetryFeedback,
  correctiveRetryFeedbackWithCumulativeSurfaces,
  circledWrongExplanationKeys: Object.keys(circledWrongExplanationPostProcess.data?.wrongOptionExplanations ?? {}),
  remappedPointCodeA: mismatchedPointCodePostProcess.data?.markedExpressions?.[0]?.pointCode,
  normalizedNonSourceCorrection: nonSourceCorrectionPostProcess.data?.markedExpressions?.[0]?.correction,
  topLevelCorrectionPostProcess: topLevelCorrectionPartsPostProcess,
  surfaceOrderPostProcessExplanation: surfaceOrderPostProcess.data?.explanation,
  surfaceOrderPostProcessQuality,
  nounClausePronounPostProcessExplanation: nounClausePronounPostProcess.data?.explanation,
  nounClausePronounPostProcessKeyPoints: nounClausePronounPostProcess.data?.keyPoints,
  nounClausePronounPostProcessQuality,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".grammar-generation-quality-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    try {
      rmSync(harnessPath);
    } catch {
      // ignore
    }
  }
}

const result = runHarness();

test("GRAMMAR_ERROR blocks when a KILLER answer is only a thin local agreement flip", () => {
  assert.ok(
    result.thinGrammarErrorQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-killer-thin-answer",
    ),
    JSON.stringify(result.thinGrammarErrorQuality),
  );
});

test("GRAMMAR_ERROR does not warn for structurally loaded KILLER agreement", () => {
  assert.equal(
    result.richGrammarErrorQuality.some((issue) => issue.code === "grammar-killer-thin-answer"),
    false,
    JSON.stringify(result.richGrammarErrorQuality),
  );
  assert.deepEqual(
    result.richGrammarErrorQuality.filter((issue) => issue.severity === "error"),
    [],
  );
});

test("GRAMMAR_ERROR rejects decorative decoys even for BASIC", () => {
  assert.ok(
    result.basicDecorativeDecoysQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-weak-filler-decoys",
    ),
    JSON.stringify(result.basicDecorativeDecoysQuality),
  );
});

test("GRAMMAR_ERROR rejects punctuation-bearing sentence fragment underlines", () => {
  assert.ok(
    result.punctuatedFragmentDecoyQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-underline-punctuated-fragment",
    ),
    JSON.stringify(result.punctuatedFragmentDecoyQuality),
  );
});

test("GRAMMAR_ERROR rejects source/correction expressions that are not source-backed", () => {
  assert.ok(
    result.nonSourceExpressionGrammarErrorQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-source-expression-not-backed",
    ),
    JSON.stringify(result.nonSourceExpressionGrammarErrorQuality),
  );
  assert.ok(
    result.nonSourceExpressionGrammarErrorQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-correction-not-source-backed",
    ),
    JSON.stringify(result.nonSourceExpressionGrammarErrorQuality),
  );
});

test("GRAMMAR_ERROR rejects explanations that cite the correction before the displayed error", () => {
  assert.ok(
    result.surfaceOrderExplanationQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-error-explanation-surface-order",
    ),
    JSON.stringify(result.surfaceOrderExplanationQuality),
  );
});

test("GRAMMAR_ERROR rejects remaining-option ranges that include an answer label", () => {
  assert.ok(
    result.answerRangeLeakExplanationQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-explanation-answer-range-leak",
    ),
    JSON.stringify(result.answerRangeLeakExplanationQuality),
  );
});

test("GRAMMAR_ERROR rejects shorthand remaining-option ranges even when labels are later reordered", () => {
  assert.ok(
    result.answerRangeLeakExplanationQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-explanation-range-shorthand",
    ),
    JSON.stringify(result.answerRangeLeakExplanationQuality),
  );
});

test("GRAMMAR_ERROR rejects answer labels inside wrongOptionExplanations", () => {
  assert.ok(
    result.answerInWrongExplanationQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-answer-in-wrong-explanations",
    ),
    JSON.stringify(result.answerInWrongExplanationQuality),
  );
});

test("GRAMMAR_ERROR rejects visibly broken pronoun agreement for intermediate or harder", () => {
  assert.ok(
    result.obviousPronounAgreementQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-pronoun-agreement",
    ),
    JSON.stringify(result.obviousPronounAgreementQuality),
  );
});

test("GRAMMAR_ERROR rejects object pronouns in finite subject position", () => {
  assert.ok(
    result.obviousObjectPronounSubjectQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-object-pronoun-subject",
    ),
    JSON.stringify(result.obviousObjectPronounSubjectQuality),
  );
});

test("GRAMMAR_ERROR rejects visibly broken noun + what relative errors for intermediate or harder", () => {
  assert.ok(
    result.obviousNounWhatRelativeQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-noun-what-relative",
    ),
    JSON.stringify(result.obviousNounWhatRelativeQuality),
  );
});

test("GRAMMAR_ERROR rejects visibly broken seem + gerund errors for intermediate or harder", () => {
  assert.ok(
    result.obviousSeemGerundQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-seem-gerund",
    ),
    JSON.stringify(result.obviousSeemGerundQuality),
  );
});

test("GRAMMAR_ERROR rejects visibly broken to + gerund complement errors for intermediate or harder", () => {
  assert.ok(
    result.obviousToGerundAfterVerbQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-to-gerund-after-verb",
    ),
    JSON.stringify(result.obviousToGerundAfterVerbQuality),
  );
});

test("GRAMMAR_ERROR rejects before/after plus to-infinitive mutations", () => {
  assert.ok(
    result.obviousBeforeAfterToInfinitiveQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-before-after-to-infinitive",
    ),
    JSON.stringify(result.obviousBeforeAfterToInfinitiveQuality),
  );
});

test("GRAMMAR_ERROR rejects modal/quasi-modal mislabeling of afford", () => {
  assert.ok(
    result.affordModalMislabelQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-afford-modal-mislabel",
    ),
    JSON.stringify(result.affordModalMislabelQuality),
  );
});

test("GRAMMAR_ERROR rejects marker metadata that points to a different rendered location", () => {
  assert.ok(
    result.misplacedMarkerQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-marker-context-mismatch",
    ),
    JSON.stringify(result.misplacedMarkerQuality),
  );
});

test("GRAMMAR_ERROR rejects visibly broken modal + gerund surfaces even for basic", () => {
  assert.ok(
    result.obviousModalGerundQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-modal-gerund",
    ),
    JSON.stringify(result.obviousModalGerundQuality),
  );
});

test("GRAMMAR_ERROR rejects visibly broken double -ing surfaces even for basic", () => {
  assert.ok(
    result.obviousDoubleIngQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-double-ing",
    ),
    JSON.stringify(result.obviousDoubleIngQuality),
  );
});

test("GRAMMAR_ERROR rejects adjacent local agreement flips even for basic", () => {
  assert.ok(
    result.obviousLocalAgreementQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-local-agreement",
    ),
    JSON.stringify(result.obviousLocalAgreementQuality),
  );
});

test("GRAMMAR_ERROR rejects hallucinated grammar key-point tokens", () => {
  assert.ok(
    result.unsupportedKeyPointQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-keypoint-token-not-source-backed",
    ),
    JSON.stringify(result.unsupportedKeyPointQuality),
  );
});

test("GRAMMAR_ERROR rejects densely packed grammar markers", () => {
  assert.ok(
    result.denseMarkerQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-marker-too-dense",
    ),
    JSON.stringify(result.denseMarkerQuality),
  );
});

test("GRAMMAR_ERROR rejects visibly broken to + gerund complements even for basic", () => {
  assert.ok(
    result.basicToGerundAfterVerbQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-to-gerund-after-verb",
    ),
    JSON.stringify(result.basicToGerundAfterVerbQuality),
  );
});

test("GRAMMAR_ERROR rejects to-infinitive phrases mutated to bare gerunds", () => {
  assert.ok(
    result.toInfinitivePhraseToGerundQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-to-gerund-after-verb",
    ),
    JSON.stringify(result.toInfinitivePhraseToGerundQuality),
  );
});

test("GRAMMAR_ERROR rejects visibly broken modal + to-infinitive surfaces", () => {
  assert.ok(
    result.modalToInfinitiveQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-modal-to-infinitive",
    ),
    JSON.stringify(result.modalToInfinitiveQuality),
  );
});

test("GRAMMAR_ERROR rejects connector to what mutations", () => {
  assert.ok(
    result.connectorToWhatQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-connector-to-what",
    ),
    JSON.stringify(result.connectorToWhatQuality),
  );
});

test("GRAMMAR_ERROR rejects despite it being to despite it to be mutations", () => {
  assert.ok(
    result.despiteBeingToBeQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-despite-being-to-be",
    ),
    JSON.stringify(result.despiteBeingToBeQuality),
  );
});

test("GRAMMAR_ERROR rejects debatable more/most like mutations", () => {
  assert.ok(
    result.moreMostLikeQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-debatable-more-most-like",
    ),
    JSON.stringify(result.moreMostLikeQuality),
  );
});

test("GRAMMAR_ERROR rejects lexical look-more-like answer mutations", () => {
  assert.ok(
    result.lookLikeLexicalAnswerQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-lexical-look-like-answer",
    ),
    JSON.stringify(result.lookLikeLexicalAnswerQuality),
  );
});

test("GRAMMAR_ERROR rejects overdrilled because to despite clause mutations", () => {
  assert.ok(
    result.becauseDespiteClauseQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-shallow-because-despite-clause",
    ),
    JSON.stringify(result.becauseDespiteClauseQuality),
  );
});

test("GRAMMAR_ERROR rejects debatable sink passive mutations", () => {
  assert.ok(
    result.sinkPassiveQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-debatable-sink-passive",
    ),
    JSON.stringify(result.sinkPassiveQuality),
  );
});

test("GRAMMAR_ERROR rejects seem to V mutated to seem V-ing", () => {
  assert.ok(
    result.seemToGerundQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-seem-to-gerund",
    ),
    JSON.stringify(result.seemToGerundQuality),
  );
});

test("GRAMMAR_ERROR rejects seem to V mutated to seem to V-ing", () => {
  assert.ok(
    result.seemToBareGerundQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-seem-to-gerund",
    ),
    JSON.stringify(result.seemToBareGerundQuality),
  );
});

test("GRAMMAR_ERROR rejects full seem to V phrases mutated to seem V-ing", () => {
  assert.ok(
    result.fullSeemPhraseGerundQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-seem-to-gerund",
    ),
    JSON.stringify(result.fullSeemPhraseGerundQuality),
  );
});

test("GRAMMAR_ERROR rejects shallow local participle parallel swaps", () => {
  assert.ok(
    result.localParticipleParallelQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-shallow-local-participle-parallel",
    ),
    JSON.stringify(result.localParticipleParallelQuality),
  );
});

test("GRAMMAR_ERROR rejects debatable attention-to gerund mutations", () => {
  assert.ok(
    result.attentionToGerundQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-debatable-attention-to-gerund",
    ),
    JSON.stringify(result.attentionToGerundQuality),
  );
});

test("GRAMMAR_ERROR rejects adjacent subject-verb -s flips", () => {
  assert.ok(
    result.adjacentSvAgreementQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-adjacent-sv-agreement",
    ),
    JSON.stringify(result.adjacentSvAgreementQuality),
  );
});

test("GRAMMAR_ERROR rejects passive forms of intransitive verbs", () => {
  assert.ok(
    result.intransitivePassiveQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-intransitive-passive",
    ),
    JSON.stringify(result.intransitivePassiveQuality),
  );
});

test("GRAMMAR_ERROR rejects shallow participle adjective swaps for intermediate or harder", () => {
  assert.ok(
    result.shallowParticipleAdjectiveQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-shallow-participle-adjective-answer",
    ),
    JSON.stringify(result.shallowParticipleAdjectiveQuality),
  );
});

test("GRAMMAR_ERROR rejects appear mislabeling in keyPoints", () => {
  assert.ok(
    result.appearAdverbMislabelQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-appear-adverb-mislabel",
    ),
    JSON.stringify(result.appearAdverbMislabelQuality),
  );
});

test("GRAMMAR_ERROR rejects appear tagged as passive voice pointCode", () => {
  assert.ok(
    result.appearAdverbMislabelQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-appear-pointcode-voice-mismatch",
    ),
    JSON.stringify(result.appearAdverbMislabelQuality),
  );
});

test("GRAMMAR_ERROR rejects nonstandard grammar terminology", () => {
  assert.ok(
    result.nonstandardTerminologyQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-nonstandard-terminology",
    ),
    JSON.stringify(result.nonstandardTerminologyQuality),
  );
});

test("GRAMMAR_ERROR rejects explanation typos", () => {
  assert.ok(
    result.explanationTypoQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-explanation-typo",
    ),
    JSON.stringify(result.explanationTypoQuality),
  );
});

test("GRAMMAR_ERROR rejects noun-clause labels for plain pronoun-reference checks", () => {
  assert.ok(
    result.nounClausePronounMislabelQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-noun-clause-pronoun-mislabel",
    ),
    JSON.stringify(result.nounClausePronounMislabelQuality),
  );
});

test("GRAMMAR_ERROR rejects phrasal-verb labels for passive participles", () => {
  assert.ok(
    result.phrasalVerbMislabelQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-phrasal-verb-mislabel",
    ),
    JSON.stringify(result.phrasalVerbMislabelQuality),
  );
});

test("GRAMMAR_ERROR rejects overloaded BASIC grammar designs", () => {
  assert.ok(
    result.basicOverloadedDesignQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-basic-overloaded-design",
    ),
    JSON.stringify(result.basicOverloadedDesignQuality),
  );
});

test("GRAMMAR_ERROR rejects transparent endure passive-with-object errors", () => {
  assert.ok(
    result.endurePassiveObjectQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-endure-passive-object",
    ),
    JSON.stringify(result.endurePassiveObjectQuality),
  );
});

test("GRAMMAR_ERROR rejects gibberish inversion fragments", () => {
  assert.ok(
    result.gibberishInversionFragmentQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-gibberish-inversion-fragment",
    ),
    JSON.stringify(result.gibberishInversionFragmentQuality),
  );
});

test("GRAMMAR_ERROR rejects finite verbs changed to -ing before a colon", () => {
  assert.ok(
    result.finiteToIngColonQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-finite-to-ing-colon",
    ),
    JSON.stringify(result.finiteToIngColonQuality),
  );
});

test("GRAMMAR_ERROR rejects too-basic decoys above BASIC", () => {
  assert.ok(
    result.tooBasicHigherTierDecoyQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-too-basic-decoys",
    ),
    JSON.stringify(result.tooBasicHigherTierDecoyQuality),
  );
});

test("GRAMMAR_ERROR rejects overly long main explanations", () => {
  assert.ok(
    result.longGrammarExplanationQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-explanation-too-long-hard",
    ),
    JSON.stringify(result.longGrammarExplanationQuality),
  );
});

test("GRAMMAR_ERROR rejects mixed as-it underline spans", () => {
  assert.ok(
    result.mixedAsItSpanQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-mixed-as-it-span",
    ),
    JSON.stringify(result.mixedAsItSpanQuality),
  );
});

test("GRAMMAR_ERROR rejects keyPoints for untested connector tokens", () => {
  assert.ok(
    result.untestedKeyPointTokenQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-keypoint-untested-token",
    ),
    JSON.stringify(result.untestedKeyPointTokenQuality),
  );
});

test("GRAMMAR_ERROR rejects look-more-like adjective-complement mislabels", () => {
  assert.ok(
    result.lookLikeComplementMislabelQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-look-like-complement-mislabel",
    ),
    JSON.stringify(result.lookLikeComplementMislabelQuality),
  );
});

test("GRAMMAR_ERROR rejects seem-to-V complement mislabels", () => {
  assert.ok(
    result.seemToComplementMislabelQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-seem-to-complement-mislabel",
    ),
    JSON.stringify(result.seemToComplementMislabelQuality),
  );
});

test("GRAMMAR_ERROR rejects seem-to-V object mislabels", () => {
  assert.ok(
    result.seemToObjectMislabelQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-seem-to-object-mislabel",
    ),
    JSON.stringify(result.seemToObjectMislabelQuality),
  );
});

test("GRAMMAR_ERROR rejects that-way demonstrative adverb mislabels", () => {
  assert.ok(
    result.thatWayAdverbMislabelQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-that-way-adverb-mislabel",
    ),
    JSON.stringify(result.thatWayAdverbMislabelQuality),
  );
});

test("GRAMMAR_ERROR rejects human-made postmodifier mislabels", () => {
  assert.ok(
    result.humanMadePostmodifierMislabelQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-human-made-postmodifier-mislabel",
    ),
    JSON.stringify(result.humanMadePostmodifierMislabelQuality),
  );
});

test("GRAMMAR_ERROR rejects shallow checklist decoy sets", () => {
  assert.ok(
    result.shallowChecklistDecoysQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-shallow-checklist-decoys",
    ),
    JSON.stringify(result.shallowChecklistDecoysQuality),
  );
});

test("GRAMMAR_ERROR rejects shallow nearby passive decoys", () => {
  assert.ok(
    result.shallowNearbyPassiveDecoyQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-shallow-nearby-passive-decoy",
    ),
    JSON.stringify(result.shallowNearbyPassiveDecoyQuality),
  );
});

test("GRAMMAR_ERROR rejects local pronoun-auxiliary clashes even for basic", () => {
  assert.ok(
    result.localPronounAuxMismatchQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-local-pronoun-agreement",
    ),
    JSON.stringify(result.localPronounAuxMismatchQuality),
  );
});

test("GRAMMAR_ERROR rejects standalone than as a shallow comparative decoy", () => {
  assert.ok(
    result.shallowThanDecoyQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-shallow-than-decoy",
    ),
    JSON.stringify(result.shallowThanDecoyQuality),
  );
});

test("GRAMMAR_ERROR rejects shallow depends-on decoys", () => {
  assert.ok(
    result.shallowDependsDecoyQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-shallow-depends-decoy",
    ),
    JSON.stringify(result.shallowDependsDecoyQuality),
  );
});

test("GRAMMAR_ERROR rejects despite-to-although before it being", () => {
  assert.ok(
    result.shallowDespiteAlthoughGerundQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-shallow-despite-although-gerund",
    ),
    JSON.stringify(result.shallowDespiteAlthoughGerundQuality),
  );
});

test("GRAMMAR_ERROR rejects vague grammar metadata tags", () => {
  assert.ok(
    result.vagueMetadataTagQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-vague-metadata-tag",
    ),
    JSON.stringify(result.vagueMetadataTagQuality),
  );
});

test("GRAMMAR_ERROR rejects thin long-distance agreement explanations", () => {
  assert.ok(
    result.thinAgreementExplanationQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-agreement-explanation-too-thin",
    ),
    JSON.stringify(result.thinAgreementExplanationQuality),
  );
});

test("GRAMMAR_ERROR rejects passive participles changed into incomplete active -ing forms", () => {
  assert.ok(
    result.passiveToGapIngQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-passive-to-gap-ing",
    ),
    JSON.stringify(result.passiveToGapIngQuality),
  );
});

test("GRAMMAR_ERROR rejects debatable object-who decoys", () => {
  assert.ok(
    result.debatableWhoDecoyQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-debatable-who-object-decoy",
    ),
    JSON.stringify(result.debatableWhoDecoyQuality),
  );
});

test("GRAMMAR_ERROR rejects discourse-though connector decoys", () => {
  assert.ok(
    result.discourseThoughDecoyQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-debatable-discourse-though-decoy",
    ),
    JSON.stringify(result.discourseThoughDecoyQuality),
  );
});

test("GRAMMAR_ERROR rejects simple relative-pronoun animacy swaps as killer answers", () => {
  assert.ok(
    result.killerThinRelativeAnimacyQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-killer-thin-relative-animacy",
    ),
    JSON.stringify(result.killerThinRelativeAnimacyQuality),
  );
});

test("GRAMMAR_ERROR rejects multiple weak filler decoys for intermediate or harder", () => {
  assert.ok(
    result.weakFillerDecoysQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-weak-filler-decoys",
    ),
    JSON.stringify(result.weakFillerDecoysQuality),
  );
});

test("GRAMMAR_ERROR rejects explanation surface order for short is/are mutations", () => {
  assert.ok(
    result.shortSurfaceOrderExplanationQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-error-explanation-surface-order",
    ),
    JSON.stringify(result.shortSurfaceOrderExplanationQuality),
  );
});

test("GRAMMAR_ERROR rejects scratchpad-like self-contradictory explanations", () => {
  assert.ok(
    result.selfContradictoryExplanationQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-explanation-self-contradictory",
    ),
    JSON.stringify(result.selfContradictoryExplanationQuality),
  );
});

test("GRAMMAR_ERROR rejects Korean self-review phrases in explanations", () => {
  assert.ok(
    result.koreanScratchpadExplanationQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-explanation-self-contradictory",
    ),
    JSON.stringify(result.koreanScratchpadExplanationQuality),
  );
});

test("GRAMMAR_ERROR rejects demonstrative that in that's the way as a decoy", () => {
  assert.ok(
    result.demonstrativeThatWayDecoyQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-demonstrative-that-way-decoy",
    ),
    JSON.stringify(result.demonstrativeThatWayDecoyQuality),
  );
});

test("GRAMMAR_ERROR rejects who/what asking as an intermediate answer", () => {
  assert.ok(
    result.semanticWhoWhatAnswerQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-semantic-who-what-answer",
    ),
    JSON.stringify(result.semanticWhoWhatAnswerQuality),
  );
});

test("GRAMMAR_ERROR rejects how/why near the-way as a grammar answer", () => {
  assert.ok(
    result.semanticHowWhyAnswerQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-semantic-how-why-answer",
    ),
    JSON.stringify(result.semanticHowWhyAnswerQuality),
  );
});

test("GRAMMAR_ERROR rejects shallow adverb-to-adjective modifier swaps", () => {
  assert.ok(
    result.obviousAdverbAdjectiveQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-adverb-adjective",
    ),
    JSON.stringify(result.obviousAdverbAdjectiveQuality),
  );
});

test("GRAMMAR_ERROR rejects fixed that is idiom mutations", () => {
  assert.ok(
    result.fixedThatIsIdiomQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-fixed-that-is-idiom",
    ),
    JSON.stringify(result.fixedThatIsIdiomQuality),
  );
});

test("GRAMMAR_ERROR rejects people living to people lived mutations", () => {
  assert.ok(
    result.obviousLivingLivedQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-living-finite",
    ),
    JSON.stringify(result.obviousLivingLivedQuality),
  );
});

test("GRAMMAR_ERROR rejects random what + noun phrase insertions", () => {
  assert.ok(
    result.whatNounPrefixQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-obvious-what-noun-prefix",
    ),
    JSON.stringify(result.whatNounPrefixQuality),
  );
});

test("GRAMMAR_ERROR rejects KILLER decoys repeating the answer pointCode", () => {
  assert.ok(
    result.killerRepeatedAnswerPointQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-killer-answer-point-repeated",
    ),
    JSON.stringify(result.killerRepeatedAnswerPointQuality),
  );
});

test("GRAMMAR_ERROR rejects missing-aux participle fragments as killer answers", () => {
  assert.ok(
    result.killerMissingAuxQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-killer-thin-missing-aux",
    ),
    JSON.stringify(result.killerMissingAuxQuality),
  );
});

test("GRAMMAR_ERROR rejects generic pointCode answers for killer", () => {
  assert.ok(
    result.killerGenericAnswerPointQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-killer-generic-answer-point",
    ),
    JSON.stringify(result.killerGenericAnswerPointQuality),
  );
});

test("GRAMMAR_ERROR rejects single concessive as/how idiom checks as killer answers", () => {
  assert.ok(
    result.killerThinConcessiveAsQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-killer-thin-concessive-as",
    ),
    JSON.stringify(result.killerThinConcessiveAsQuality),
  );
});

test("GRAMMAR_ERROR rejects single connector/preposition swaps as killer answers", () => {
  assert.ok(
    result.killerThinConnectorQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-killer-thin-connector",
    ),
    JSON.stringify(result.killerThinConnectorQuality),
  );
});

test("GRAMMAR_ERROR rejects it being after a preposition as a decoy", () => {
  assert.ok(
    result.debatableItBeingDecoyQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-debatable-it-being-decoy",
    ),
    JSON.stringify(result.debatableItBeingDecoyQuality),
  );
});

test("GRAMMAR_CORRECTION applies the same KILLER depth check to hidden errors", () => {
  assert.ok(
    result.thinGrammarCorrectionQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-correction-killer-thin-segment",
    ),
    JSON.stringify(result.thinGrammarCorrectionQuality),
  );
  assert.equal(
    result.richGrammarCorrectionQuality.some((issue) => issue.code === "grammar-correction-killer-thin-segment"),
    false,
    JSON.stringify(result.richGrammarCorrectionQuality),
  );
});

test("grammar candidate blocks include PDF-derived difficulty policy and source-backed targets", () => {
  assert.match(result.candidateBlock, /어법 1000제 PDF 분석 기반 난이도 보정/);
  assert.match(result.candidateBlock, /Source-backed grammar target candidates/);
  assert.match(result.candidateBlock, /tier=killer/);
  assert.match(result.candidateBlock, /code=\(b\)|code=\(c\)|code=\(d\)|code=\(i\)/);
});

test("grammar candidate blocks encode the requested nine-frame policy and detect advanced frames", () => {
  // 9프레임 가이드는 grammar-frames.ts 정본(한국어)으로 교체됨 — 새 헤더/프레임 명칭 기준.
  assert.match(result.advancedCandidateBlock, /어법 9프레임 — 구조 문법 출제의 정본/);
  assert.match(result.advancedCandidateBlock, /가목적어 it 구문/);
  assert.match(result.advancedCandidateBlock, /부정어구 도치와 수일치/);
  assert.match(result.advancedCandidateBlock, /Marker spacing is mandatory/);
  assert.match(result.advancedCandidateBlock, /Decoy quality/);
  assert.match(result.advancedCandidateBlock, /code=\(g\)/);
  assert.match(result.advancedCandidateBlock, /code=\(d\)/);
});

test("grammar focus mode surfaces active-passive and object-complement frames", () => {
  assert.match(result.focusCandidateBlock, /code=\(e\)/);
  assert.match(result.focusCandidateBlock, /code=\(h\)/);
});

test("grammar source candidates filter noisy BASIC decoy surfaces", () => {
  const blocked = ["appear", "as it", "Clear", "perfect", "who", "though", "sinking", "despite", "being", "depends", "one", "Those", "this", "as a", "looks", "looks more like", "seems", "seems to obey", "to obey", "were blown"];
  for (const expression of blocked) {
    assert.equal(
      result.basicNoisyCandidateBlock.includes('expression="' + expression + '"'),
      false,
      result.basicNoisyCandidateBlock,
    );
  }
  assert.match(result.basicNoisyCandidateBlock, /Forbidden grammar target surfaces detected in this passage/);
  assert.match(result.basicNoisyCandidateBlock, /"though"/);
  assert.match(result.forbiddenSurfaceCandidateBlock, /Forbidden grammar target surfaces detected in this passage/);
  assert.match(result.forbiddenSurfaceCandidateBlock, /"one"/);
  assert.match(result.forbiddenSurfaceCandidateBlock, /"Those"/);
  assert.match(result.forbiddenSurfaceCandidateBlock, /"were blown"/);
  assert.match(result.forbiddenSurfaceCandidateBlock, /"they"/);
  assert.match(result.forbiddenSurfaceCandidateBlock, /"than"/);
  assert.match(result.forbiddenSurfaceCandidateBlock, /"Clear"/);
  assert.match(result.forbiddenSurfaceCandidateBlock, /"perfect"/);
  assert.match(result.forbiddenSurfaceCandidateBlock, /"looks more like"/);
  assert.match(result.forbiddenSurfaceCandidateBlock, /"seems to obey"/);
  assert.match(result.forbiddenSurfaceCandidateBlock, /"to obey"/);
  assert.match(result.forbiddenSurfaceCandidateBlock, /"why"/);
});

test("GRAMMAR_ERROR generation uses a 20000 token floor by default", () => {
  const source = readFileSync(
    path.join(repoRoot, "src", "lib", "question-type-generation-settings", "dispatchers.ts"),
    "utf8",
  );
  assert.match(
    source,
    /if\s*\(\s*typeId\s*===\s*"GRAMMAR_ERROR"\s*\)\s*{\s*return\s+20_000\s*;/,
  );
});

test("STANDARD GRAMMAR_ERROR generation caps effective max tokens below the 20000 premium budget", () => {
  const source = readFileSync(
    path.join(repoRoot, "src", "app", "api", "ai", "generate-questions-auto", "_lib", "run-question-generation.ts"),
    "utf8",
  );
  assert.match(source, /const\s+standardGrammarTokenCap\s*=/);
  assert.match(source, /subType\s*===\s*"GRAMMAR_ERROR"\s*&&\s*effectiveGenerationPlan\s*!==\s*"PREMIUM"/);
  assert.match(source, /effectiveDiffLabel\s*===\s*"KILLER"\s*\?\s*12_000\s*:\s*8_192/);
  assert.match(source, /effectiveGenerationMaxTokens/);
  assert.match(source, /generateWithRetry\([\s\S]*?effectiveGenerationMaxTokens/);
});

test("STANDARD KILLER GRAMMAR_ERROR can downgrade to INTERMEDIATE rescue instead of hard failing", () => {
  const source = readFileSync(
    path.join(repoRoot, "src", "app", "api", "ai", "generate-questions-auto", "_lib", "run-question-generation.ts"),
    "utf8",
  );
  assert.match(source, /STANDARD_GRAMMAR_KILLER_RESCUE_CODES/);
  assert.match(source, /GRAMMAR_DESIGN_ISSUES_NOT_WORTH_REPAIR/);
  assert.match(source, /shouldAttemptCandidateRepair/);
  assert.match(source, /shouldRunStandardGrammarKillerRescue/);
  assert.match(source, /input\.generationPlan\s*===\s*"PREMIUM"\)\s*return\s+false/);
  // 26-07-06 2차: 3→4 (지정 설계와 병행해 STANDARD KILLER 구제 의존율 완화).
  assert.match(source, /STANDARD_GRAMMAR_KILLER_STRICT_ATTEMPT_CAP\s*=\s*4/);
  assert.match(source, /shouldAttemptCandidateRepair\(subType,\s*fin\.blockingErrors\)/);
  assert.match(source, /difficulty:\s*"INTERMEDIATE"/);
  assert.match(source, /_requestedDifficulty\s*=\s*"KILLER"/);
  assert.match(source, /_difficultyDowngraded\s*=\s*true/);
  assert.match(source, /_reviewRecommended\s*=\s*true/);
  assert.match(source, /rescue also failed; skipping relaxed KILLER fallback/);
});

// 정책 반전(26-07-06 never-fail): reasoning-off 이후 PREMIUM 호출이 ~13-30s 라
// 후보당 1회 repair 가 데드라인 안에 들어온다 — PREMIUM 제외 가드는 의도적으로
// 제거됐고, 실패 종결 대신 구제 사다리(salvage ladder)로 진입한다.
test("PREMIUM grammar generation participates in repair and the never-fail salvage ladder", () => {
  const source = readFileSync(
    path.join(repoRoot, "src", "app", "api", "ai", "generate-questions-auto", "_lib", "run-question-generation.ts"),
    "utf8",
  );
  const premiumRepairGuard = source.match(
    /if\s*\(\s*[\s\S]{0,500}?effectiveGenerationPlan\s*!==\s*"PREMIUM"[\s\S]{0,500}?repairQuestionCandidate/,
  );
  assert.equal(
    premiumRepairGuard,
    null,
    "PREMIUM must no longer be excluded from candidate repair",
  );
  assert.match(source, /shouldAttemptCandidateRepair\(subType,\s*fin\.blockingErrors\)/);
  assert.match(
    source,
    /inputWithUsage\.generationPlan\s*===\s*"PREMIUM"[\s\S]{0,180}?Math\.min\([^)]*requestedMaxAttempts/,
  );
  assert.match(
    source,
    /generationPlan\s*===\s*"PREMIUM"[\s\S]{0,400}?entering never-fail salvage ladder/,
  );
  assert.match(source, /runUniversalSalvage/);
  assert.match(source, /admitSalvageCandidatesFromPool/);
});

test("GRAMMAR_ERROR retry feedback accumulates failed surfaces across repeated issue codes", () => {
  assert.match(result.correctiveRetryFeedback, /Hard-ban failed GRAMMAR_ERROR surfaces/);
  assert.match(result.correctiveRetryFeedback, /looks more like->looks like more/);
  assert.match(result.correctiveRetryFeedback, /latter/);
  assert.match(result.correctiveRetryFeedback, /because->because of/);
});

test("GRAMMAR_ERROR retry feedback preserves prior failed surfaces after model-only failures", () => {
  assert.match(result.correctiveRetryFeedbackWithCumulativeSurfaces, /Hard-ban failed GRAMMAR_ERROR surfaces/);
  assert.match(result.correctiveRetryFeedbackWithCumulativeSurfaces, /looks more like->looks like more/);
  assert.match(result.correctiveRetryFeedbackWithCumulativeSurfaces, /Not Found/);

  const source = readFileSync(
    path.join(repoRoot, "src", "app", "api", "ai", "generate-questions-auto", "_lib", "run-question-generation.ts"),
    "utf8",
  );
  assert.match(source, /buildCorrectiveRetryFeedback\([\s\S]{0,140}cumulativeIssues:\s*rejectionRecorder\.issues/);
});

test("GRAMMAR_ERROR generation requires the full requested count before succeeding", () => {
  const source = readFileSync(
    path.join(repoRoot, "src", "app", "api", "ai", "generate-questions-auto", "_lib", "run-question-generation.ts"),
    "utf8",
  );
  assert.match(source, /const\s+hasGrammarError\s*=\s*inputWithUsage\.plan\.some/);
  assert.match(
    source,
    /const\s+shouldRequireFullRequestedCount\s*=\s*[\s\S]{0,120}hasGrammarError;/,
  );
});

test("PREMIUM grammar prompt does not ask the model to output passageWithMarkers", () => {
  const source = readFileSync(
    path.join(repoRoot, "src", "app", "api", "ai", "generate-questions-auto", "_lib", "prompts.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /passageWithMarkers should contain/);
  assert.match(source, /Do not output passageWithMarkers; the server reconstructs it/);
});

test("GRAMMAR_ERROR postprocess remaps circled explanation keys to marker labels", () => {
  assert.deepEqual(
    result.circledWrongExplanationKeys.sort(),
    ["(A)", "(C)", "(D)", "(E)"],
  );
});

test("GRAMMAR_ERROR postprocess remaps mismatched point codes from the marked surface", () => {
  assert.equal(result.remappedPointCodeA, "b");
});

test("GRAMMAR_ERROR postprocess normalizes non-source corrections back to source expression", () => {
  assert.equal(result.normalizedNonSourceCorrection, "presented on these platforms");
});

test("GRAMMAR_ERROR postprocess prefixes displayed error before correction in explanations", () => {
  assert.match(result.surfaceOrderPostProcessExplanation, /which was[^.]+which were/);
  assert.equal(
    result.surfaceOrderPostProcessQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-error-explanation-surface-order",
    ),
    false,
    JSON.stringify(result.surfaceOrderPostProcessQuality),
  );
});

test("GRAMMAR_ERROR postprocess normalizes noun-clause pronoun terminology leaks", () => {
  assert.doesNotMatch(result.nounClausePronounPostProcessExplanation, /noun\s+clause/i);
  assert.equal(
    JSON.stringify(result.nounClausePronounPostProcessKeyPoints).includes("noun clause"),
    false,
  );
  assert.equal(
    result.nounClausePronounPostProcessQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-noun-clause-pronoun-mislabel",
    ),
    false,
    JSON.stringify(result.nounClausePronounPostProcessQuality),
  );
});

test("GRAMMAR_CORRECTION postprocess mirrors top-level correctedParts into segments", () => {
  assert.equal(
    result.topLevelCorrectionPostProcess.success,
    true,
    JSON.stringify(result.topLevelCorrectionPostProcess),
  );
  assert.equal(
    result.topLevelCorrectionPostProcess.data?.underlinedSegments?.[0]?.correctedPart,
    "which were",
  );
  assert.equal(result.topLevelCorrectionPostProcess.data?.correctAnswer, "(A) which were");
});
