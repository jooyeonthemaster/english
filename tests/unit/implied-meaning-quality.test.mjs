import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import quality from "@/lib/question-quality";

const { buildQuestionTargetCandidateBlock, validateQuestionQuality } = quality;

const passage = [
  "A serious solution must move upstream as well as downstream toward real change.",
  "Downstream actions treat visible symptoms, but upstream changes address the causes that shape those symptoms.",
  "The point is not merely to react quickly but to understand the source of the problem."
].join(" ");

const baseQuestion = {
  direction: "다음 글에서 밑줄 친 부분이 함축 의미하는 바로 가장 적절한 것은?",
  surfaceMeaning: "상류와 하류 양쪽으로 움직인다는 표면 의미이다.",
  impliedMeaning: "문제의 증상뿐 아니라 원인까지 함께 다루어야 한다는 뜻이다.",
  reasoningGap: "상류는 원인, 하류는 드러난 증상을 비유하므로 두 방향을 모두 보아야 한다.",
  evidenceChain: [
    "두 번째 문장에서 downstream actions는 visible symptoms를 다룬다.",
    "같은 문장에서 upstream changes는 causes를 다룬다.",
  ],
  options: [
    { label: "1", text: "addressing both symptoms and underlying causes" },
    { label: "2", text: "reacting quickly to every visible symptom" },
    { label: "3", text: "avoiding the causes behind the problem" },
    { label: "4", text: "moving physically along a river system" },
    { label: "5", text: "choosing speed over careful understanding" },
  ],
  correctAnswer: "1",
  wrongOptionExplanations: {
    "2": "증상 대응만 강조해 upstream의 원인 접근을 빠뜨린다.",
    "3": "원인을 다뤄야 한다는 글의 방향과 반대다.",
    "4": "비유 표현을 문자 그대로 해석한 오답이다.",
    "5": "빠른 반응보다 원인 이해가 필요하다는 결론과 어긋난다.",
  },
  explanation: "밑줄 표현은 물리적 이동이 아니라 증상과 원인을 함께 다루는 해결 방식을 비유한다.",
};

const compactTarget = {
  ...baseQuestion,
  underlinedExpression: "move upstream as well as downstream",
  passageWithUnderline: passage.replace(
    "move upstream as well as downstream",
    "__move upstream as well as downstream__",
  ),
};

const longTarget = {
  ...baseQuestion,
  underlinedExpression: "move upstream as well as downstream toward real change",
  passageWithUnderline: passage.replace(
    "move upstream as well as downstream toward real change",
    "__move upstream as well as downstream toward real change__",
  ),
};

const compactQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: compactTarget,
  passage,
  requestedDifficulty: "KILLER",
});

const longQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: longTarget,
  passage,
  requestedDifficulty: "KILLER",
});

function makeQuestion({ passage, target, correctText }) {
  return {
    ...baseQuestion,
    underlinedExpression: target,
    passageWithUnderline: passage.replace(target, \`__\${target}__\`),
    surfaceMeaning: "The expression has a local surface meaning in the sentence.",
    impliedMeaning: correctText,
    reasoningGap: "The answer must connect the target to the surrounding claim instead of translating only the target words.",
    evidenceChain: [
      "The surrounding sentence supplies the local role of the expression.",
      "The full passage supplies the broader claim needed to interpret it.",
    ],
    options: [
      { label: "1", text: correctText },
      { label: "2", text: "following a simple physical instruction from the passage" },
      { label: "3", text: "rejecting all careful interpretation of the evidence" },
      { label: "4", text: "choosing a minor classroom detail as the main claim" },
      { label: "5", text: "treating a visible example as the whole argument" },
    ],
    correctAnswer: "1",
  };
}

function hasError(issues, code) {
  return issues.some((issue) => issue.severity === "error" && issue.code === code);
}

const peripheralPassage = [
  "Digital reading is not just a matter of putting old pages on bright screens.",
  "Its real challenge is to design attention so that students can pause, compare, and return to evidence.",
  "For that reason, a useful platform should slow the reader down at the right moments.",
  "In a pilot lesson, students used three yellow sticky notes.",
].join(" ");

const peripheralDetailQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: makeQuestion({
    passage: peripheralPassage,
    target: "three yellow sticky notes",
    correctText: "using a small classroom tool during the pilot lesson",
  }),
  passage: peripheralPassage,
  requestedDifficulty: "KILLER",
});

const sameSentenceLeakPassage = [
  "A revision tool can serve as a mirror for attention, that is, it shows students where their focus drifted while they were writing.",
  "The value of the tool is not the software itself but the reflective pause it creates.",
].join(" ");

const sameSentenceLeakQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: makeQuestion({
    passage: sameSentenceLeakPassage,
    target: "a mirror for attention",
    correctText: "helping students notice where their focus moved",
  }),
  passage: sameSentenceLeakPassage,
  requestedDifficulty: "KILLER",
});

const contrastPassage = [
  "The best response is not merely to react quickly but to understand the source of the problem.",
  "Quick reactions may hide symptoms, while source-focused work changes the conditions that produced them.",
].join(" ");

const contrastCandidateBlock = buildQuestionTargetCandidateBlock(
  "IMPLIED_MEANING",
  contrastPassage,
  { requestedDifficulty: "KILLER" },
);

const underlineMismatchQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: {
    ...makeQuestion({
      passage: sameSentenceLeakPassage,
      target: "a mirror for attention",
      correctText: "helping students notice where their focus moved",
    }),
    passageWithUnderline: sameSentenceLeakPassage.replace("revision tool", "__revision tool__"),
  },
  passage: sameSentenceLeakPassage,
  requestedDifficulty: "KILLER",
});

const packedPassage = [
  "A policy debate can turn into costs/risks/benefits/tradeoffs/limits/consequences/choices instead of a clear argument about responsibility.",
  "The passage argues that good public reasoning must name the value conflict rather than compress every concern into a label.",
].join(" ");

const packedTargetQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: makeQuestion({
    passage: packedPassage,
    target: "costs/risks/benefits/tradeoffs/limits/consequences/choices",
    correctText: "compressing many public concerns into one vague label",
  }),
  passage: packedPassage,
  requestedDifficulty: "KILLER",
});

const rhetoricalFragmentPassage = [
  "Delivery got faster, but returns rose and drivers quit.",
  "So, was speed the whole story?",
  "The passage suggests that speed alone cannot define a healthy service.",
].join(" ");

const rhetoricalFragmentQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: makeQuestion({
    passage: rhetoricalFragmentPassage,
    target: "the whole story",
    correctText: "whether speed alone explains the service problem",
  }),
  passage: rhetoricalFragmentPassage,
  requestedDifficulty: "KILLER",
});

const nextSentenceMetaphorLeakPassage = [
  "Public health officials learned to move upstream.",
  "In other words, they inspected apartments, bus routes, and food access before treating illness.",
  "The lesson is that prevention requires changing the conditions that create harm.",
].join(" ");

const nextSentenceMetaphorLeakQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: makeQuestion({
    passage: nextSentenceMetaphorLeakPassage,
    target: "move upstream",
    correctText: "addressing conditions before they produce visible harm",
  }),
  passage: nextSentenceMetaphorLeakPassage,
  requestedDifficulty: "KILLER",
});

const peripheralFigurativePassage = [
  "Remote work succeeds when managers replace surveillance with trust and clear goals.",
  "The central question is not where employees sit but whether responsibility is visible without constant checking.",
  "In a cafeteria pilot, the dashboard became a polished mirror for uneaten food.",
].join(" ");

const peripheralFigurativeQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: makeQuestion({
    passage: peripheralFigurativePassage,
    target: "a polished mirror",
    correctText: "showing leftover food through a cafeteria dashboard",
  }),
  passage: peripheralFigurativePassage,
  requestedDifficulty: "KILLER",
});

const openingContrastPassage = [
  "Automation is often described as a simple replacement of human labor by machines, but that picture is too narrow.",
  "New tools usually remove some tasks while creating new kinds of coordination, judgment, and oversight.",
  "The central issue is not whether machines can perform tasks, but how human responsibility is reorganized around them.",
].join(" ");

const openingContrastQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: makeQuestion({
    passage: openingContrastPassage,
    target: "but that picture is too narrow.",
    correctText: "rejecting the idea that automation simply replaces human work",
  }),
  passage: openingContrastPassage,
  requestedDifficulty: "KILLER",
});

const conclusionContrastPassage = [
  "Cities can lower heat risk only when green design is paired with housing quality, cooling centers, and emergency communication.",
  "Otherwise, a city may look greener while remaining unsafe for the residents most exposed to heat.",
].join(" ");

const conclusionContrastQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: makeQuestion({
    passage: conclusionContrastPassage,
    target: "look greener while remaining unsafe",
    correctText: "appearing environmentally improved while still failing vulnerable residents",
  }),
  passage: conclusionContrastPassage,
  requestedDifficulty: "KILLER",
});

const embeddedWhThemePassage = [
  "A museum renovation may be described as a project of adding larger halls and cleaner lighting.",
  "But the deeper question is who gets to decide what the objects mean.",
  "When labels include community voices and contested histories, the museum becomes a forum for shared authority.",
  "In this sense, renovation is not merely a bigger entrance hall; it is a change in who is allowed to speak.",
].join(" ");

const embeddedWhThemeQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: makeQuestion({
    passage: embeddedWhThemePassage,
    target: "who is allowed to speak",
    correctText: "changing whose voices can define the museum's meaning",
  }),
  passage: embeddedWhThemePassage,
  requestedDifficulty: "KILLER",
});

const compactFigurativeNucleusPassage = [
  "Farmers often see soil only as the place where crops stand, but soil is more like a living archive of past choices.",
  "Heavy tilling, chemical use, and water practices leave traces that affect future harvests.",
  "The future crop is partly written underfoot.",
].join(" ");

const compactFigurativeNucleusQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: makeQuestion({
    passage: compactFigurativeNucleusPassage,
    target: "living archive of past choices",
    correctText: "seeing soil as a record of earlier farming decisions",
  }),
  passage: compactFigurativeNucleusPassage,
  requestedDifficulty: "KILLER",
});

const absenceInstrumentPassage = [
  "Listeners sometimes treat silence in music as an empty space between the real notes.",
  "A pause may carry more tension than a loud chord because it asks the listener to complete the moment.",
  "In music, absence is not always a lack; it can be one of the instruments.",
].join(" ");

const absenceInstrumentQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: makeQuestion({
    passage: absenceInstrumentPassage,
    target: "absence is not always a lack",
    correctText: "treating silence as an active musical resource",
  }),
  passage: absenceInstrumentPassage,
  requestedDifficulty: "KILLER",
});

const figurativeCandidateBlock = buildQuestionTargetCandidateBlock(
  "IMPLIED_MEANING",
  compactFigurativeNucleusPassage + " " + absenceInstrumentPassage,
  { requestedDifficulty: "KILLER" },
);

const privacyHousePassage = [
  "Digital services often present privacy as the small price users pay for convenience.",
  "Over time, separate permissions combine into a detailed map of habits, relationships, and desires.",
  "The issue is not a single unlocked door, but a house gradually losing its walls.",
].join(" ");

const privacyHouseQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: makeQuestion({
    passage: privacyHousePassage,
    target: "a house gradually losing its walls",
    correctText: "the gradual collapse of privacy through accumulated permissions",
  }),
  passage: privacyHousePassage,
  requestedDifficulty: "KILLER",
});

const ecologyHingePassage = [
  "An ecosystem may look like a collection of separate species.",
  "Yet removing one species can change the behavior of many others, because relationships hold the system together.",
  "A small predator, plant, or insect may function like a quiet hinge on which the larger community turns.",
].join(" ");

const ecologyHingeQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: makeQuestion({
    passage: ecologyHingePassage,
    target: "a quiet hinge",
    correctText: "a small species that silently supports the larger ecosystem",
  }),
  passage: ecologyHingePassage,
  requestedDifficulty: "KILLER",
});

const missingSurfaceQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: {
    ...makeQuestion({
      passage: privacyHousePassage,
      target: "a house gradually losing its walls",
      correctText: "the gradual collapse of privacy through accumulated permissions",
    }),
    surfaceMeaning: "",
  },
  passage: privacyHousePassage,
  requestedDifficulty: "KILLER",
});

const embeddedWhichObstaclePassage = [
  "Students sometimes think a difficult text is valuable only after it becomes easy.",
  "But difficulty can be the very place where attention slows down and new distinctions become visible.",
  "Good teaching does not remove every obstacle; it chooses which obstacles are worth keeping.",
].join(" ");

const embeddedWhichObstacleQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: makeQuestion({
    passage: embeddedWhichObstaclePassage,
    target: "which obstacles are worth keeping",
    correctText: "selecting productive difficulties that help students learn",
  }),
  passage: embeddedWhichObstaclePassage,
  requestedDifficulty: "KILLER",
});

const embeddedWhichCandidateBlock = buildQuestionTargetCandidateBlock(
  "IMPLIED_MEANING",
  embeddedWhichObstaclePassage,
  { requestedDifficulty: "KILLER" },
);

const trailingFunctionQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: makeQuestion({
    passage: openingContrastPassage,
    target: "how human responsibility is reorganized around",
    correctText: "how automation changes the way responsibility is assigned",
  }),
  passage: openingContrastPassage,
  requestedDifficulty: "KILLER",
});

const translationNegotiationPassage = [
  "Translation is sometimes imagined as replacing each word in one language with its partner in another.",
  "But words carry habits, histories, and expectations that rarely line up perfectly.",
  "A good translator must hear not only what a sentence says but what it is doing in its situation.",
  "Translation is therefore less a mirror than a negotiation between meanings.",
].join(" ");

const translationNegotiationQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: makeQuestion({
    passage: translationNegotiationPassage,
    target: "a negotiation between meanings",
    correctText: "adjusting meaning across contexts rather than mechanically matching words",
  }),
  passage: translationNegotiationPassage,
  requestedDifficulty: "KILLER",
});

const translationNegotiationCandidateBlock = buildQuestionTargetCandidateBlock(
  "IMPLIED_MEANING",
  translationNegotiationPassage,
  { requestedDifficulty: "KILLER" },
);

const liveCentralTargets = [
  {
    passage: [
      "As information moves online, some people ask whether libraries are still necessary.",
      "That question treats a library as a warehouse for books, but libraries have always been more than storage.",
      "A library is not simply a shelf; it is a civic promise about knowledge.",
    ].join(" "),
    target: "a civic promise about knowledge",
    correctText: "guaranteeing public access to guidance and shared knowledge",
  },
  {
    passage: [
      "A faster train can make a city seem better connected, but speed alone does not guarantee access.",
      "Transportation justice asks not only how quickly a system moves, but whom it actually carries.",
    ].join(" "),
    target: "whom it actually carries",
    correctText: "whether transportation actually serves the people who need access",
  },
  {
    passage: [
      "A park may be praised for adding green space to a crowded neighborhood.",
      "But if the new park raises rents and pushes long-term residents away, the benefit has changed hands.",
      "The question is whether the people who needed the improvement are still there to enjoy it.",
    ].join(" "),
    target: "the benefit has changed hands",
    correctText: "the supposed improvement now helps different people than intended",
  },
  {
    passage: [
      "Food labels can help consumers make healthier choices, but only if the information is understandable.",
      "Good labeling is not the same as putting every fact on the package.",
      "It means designing information so that people can actually use it at the moment of choice.",
    ].join(" "),
    target: "putting every fact on the package",
    correctText: "dumping complete information without making it usable for consumers",
  },
  {
    passage: [
      "Restoring an old painting is not simply a matter of making it look new again.",
      "Removing every trace of age can erase part of the object's history.",
      "Restoration is a conversation with the past, not a command to return to perfection.",
    ].join(" "),
    target: "a conversation with the past",
    correctText: "respecting historical traces while carefully repairing the artwork",
  },
].map(({ passage, target, correctText }) => validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: makeQuestion({ passage, target, correctText }),
  passage,
  requestedDifficulty: "KILLER",
}));

const foodLabelCandidateBlock = buildQuestionTargetCandidateBlock(
  "IMPLIED_MEANING",
  liveCentralTargets[3] ? [
    "Food labels can help consumers make healthier choices, but only if the information is understandable.",
    "Good labeling is not the same as putting every fact on the package.",
    "It means designing information so that people can actually use it at the moment of choice.",
  ].join(" ") : "",
  { requestedDifficulty: "KILLER" },
);

const variedSettingsPassage = [
  "Citizen science does not simply give researchers more hands.",
  "It gives them eyes placed in many neighborhoods and seasons that a single laboratory could never occupy.",
  "Citizen science turns observation into a shared instrument.",
].join(" ");

const variedSettingsQuestion = {
  ...makeQuestion({
    passage: variedSettingsPassage,
    target: "turns observation into a shared instrument",
    correctText: "시민의 관찰을 공동 연구를 가능하게 하는 도구로 바꾸는 것",
  }),
  direction: "다음 글에서 밑줄 친 부분이 함축하는 바로 적절한 것을 모두 고르시오.",
  options: [
    { label: "1", text: "시민의 관찰을 공동 연구를 가능하게 하는 도구로 바꾸는 것" },
    { label: "2", text: "과학 연구를 전문가의 실험실 안으로만 제한하는 것" },
    { label: "3", text: "지역과 계절에 흩어진 관찰 자료를 연구에 연결하는 것" },
    { label: "4", text: "자원봉사자를 단순 노동력으로만 사용하는 것" },
    { label: "5", text: "실험 결과를 기록하지 않고 개인 경험으로 남기는 것" },
    { label: "6", text: "연구 주제를 지역사회와 무관하게 좁히는 것" },
  ],
  correctAnswer: "1, 3",
  correctAnswers: ["1", "3"],
  wrongOptionExplanations: {
    "2": "본문은 실험실 하나가 차지할 수 없는 여러 장소와 계절의 관찰을 강조하므로 반대입니다.",
    "4": "more hands가 아니라 여러 곳에 놓인 eyes라는 점이 핵심입니다.",
    "5": "관찰을 공유 도구로 만든다는 의미와 어긋납니다.",
    "6": "지역사회 관찰을 연구에 연결한다는 글의 방향과 반대입니다.",
  },
};

variedSettingsQuestion.direction = "Choose all appropriate meanings of the underlined expression.";

const variedSettingsQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: variedSettingsQuestion,
  passage: variedSettingsPassage,
  requestedDifficulty: "KILLER",
  genericOptionCount: 6,
  genericAnswerCount: 2,
  optionLanguage: "ko",
});

const sleepDarknessPassage = [
  "Modern bedrooms are often designed to keep the day from ending.",
  "Phones glow beside the pillow, emails arrive after midnight, and small notifications make the mind keep checking for unfinished business.",
  "Sleep researchers note that darkness is not just the absence of light; it is a signal that lets the body stop negotiating with the day.",
].join(" ");

const sleepDarknessQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: makeQuestion({
    passage: sleepDarknessPassage,
    target: "stop negotiating with the day",
    correctText: "allowing the body to stop responding to daytime demands",
  }),
  passage: sleepDarknessPassage,
  requestedDifficulty: "KILLER",
});

const coralTourismPassage = [
  "Tourists often admire coral reefs through glass-bottom boats and underwater cameras.",
  "The visits can bring income to coastal towns, but too much traffic, sunscreen, and careless anchoring can injure the very reefs people came to see.",
  "A reef can become famous and fragile at the same time.",
].join(" ");

const coralTourismQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: makeQuestion({
    passage: coralTourismPassage,
    target: "famous and fragile",
    correctText: "becoming attractive to visitors while also more vulnerable to damage",
  }),
  passage: coralTourismPassage,
  requestedDifficulty: "KILLER",
});

const englishStemMismatchQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: {
    ...makeQuestion({
      passage: sleepDarknessPassage,
      target: "stop negotiating with the day",
      correctText: "allowing the body to stop responding to daytime demands",
    }),
    direction: "\\uB2E4\\uC74C \\uAE00\\uC5D0\\uC11C \\uBC11\\uC904 \\uBD80\\uBD84\\uC758 \\uC758\\uBBF8\\uB85C \\uAC00\\uC7A5 \\uC801\\uC808\\uD55C \\uAC83\\uC740?",
  },
  passage: sleepDarknessPassage,
  requestedDifficulty: "KILLER",
  stemLanguage: "en",
});

const multiAnswerMissingDirectionQuality = validateQuestionQuality({
  typeId: "IMPLIED_MEANING",
  question: {
    ...makeQuestion({
      passage: variedSettingsPassage,
      target: "turns observation into a shared instrument",
      correctText: "making scattered observations usable as a collective research tool",
    }),
    direction: "Choose the best meaning of the underlined expression.",
    correctAnswer: "1, 3",
    correctAnswers: ["1", "3"],
  },
  passage: variedSettingsPassage,
  requestedDifficulty: "KILLER",
  genericAnswerCount: 2,
});

process.stdout.write(JSON.stringify({
  compactQuality,
  longQuality,
  peripheralDetailQuality,
  sameSentenceLeakQuality,
  contrastCandidateBlock,
  underlineMismatchQuality,
  packedTargetQuality,
  rhetoricalFragmentQuality,
  nextSentenceMetaphorLeakQuality,
  peripheralFigurativeQuality,
  openingContrastQuality,
  conclusionContrastQuality,
  embeddedWhThemeQuality,
  compactFigurativeNucleusQuality,
  absenceInstrumentQuality,
  figurativeCandidateBlock,
  privacyHouseQuality,
  ecologyHingeQuality,
  missingSurfaceQuality,
  embeddedWhichObstacleQuality,
  embeddedWhichCandidateBlock,
  trailingFunctionQuality,
  translationNegotiationQuality,
  translationNegotiationCandidateBlock,
  liveCentralTargets,
  foodLabelCandidateBlock,
  variedSettingsQuality,
  sleepDarknessQuality,
  coralTourismQuality,
  englishStemMismatchQuality,
  multiAnswerMissingDirectionQuality,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".implied-meaning-quality-harness.mts");
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

function hasError(issues, code) {
  return issues.some((issue) => issue.severity === "error" && issue.code === code);
}

test("IMPLIED_MEANING allows a compact six-word figurative target", () => {
  assert.equal(
    result.compactQuality.some((issue) => issue.code === "implied-meaning-target-too-long"),
    false,
    JSON.stringify(result.compactQuality),
  );
});

test("IMPLIED_MEANING blocks targets longer than the teacher's six-word rule", () => {
  assert.ok(
    hasError(result.longQuality, "implied-meaning-target-too-long"),
    JSON.stringify(result.longQuality),
  );
});

test("IMPLIED_MEANING blocks short but peripheral final-sentence details", () => {
  assert.ok(
    hasError(result.peripheralDetailQuality, "implied-meaning-noncentral-target"),
    JSON.stringify(result.peripheralDetailQuality),
  );
});

test("IMPLIED_MEANING blocks same-sentence direct answer leakage", () => {
  assert.ok(
    hasError(result.sameSentenceLeakQuality, "implied-meaning-direct-answer-leak"),
    JSON.stringify(result.sameSentenceLeakQuality),
  );
});

test("IMPLIED_MEANING suggests a compact nucleus for long contrast clauses", () => {
  assert.match(
    result.contrastCandidateBlock,
    /Suggested underlinedExpression="to understand the source"/,
    result.contrastCandidateBlock,
  );
  assert.doesNotMatch(
    result.contrastCandidateBlock,
    /Suggested underlinedExpression="not merely to react quickly but to understand the source/,
    result.contrastCandidateBlock,
  );
});

test("IMPLIED_MEANING visible underline must match underlinedExpression", () => {
  assert.ok(
    hasError(result.underlineMismatchQuality, "implied-meaning-underline-target-mismatch"),
    JSON.stringify(result.underlineMismatchQuality),
  );
});

test("IMPLIED_MEANING blocks hyphen/slash-packed long targets", () => {
  assert.ok(
    hasError(result.packedTargetQuality, "implied-meaning-target-too-long"),
    JSON.stringify(result.packedTargetQuality),
  );
});

test("IMPLIED_MEANING blocks fragments carved from rhetorical questions", () => {
  assert.ok(
    hasError(result.rhetoricalFragmentQuality, "implied-meaning-rhetorical-question-target"),
    JSON.stringify(result.rhetoricalFragmentQuality),
  );
});

test("IMPLIED_MEANING blocks next-sentence explanations of short metaphors", () => {
  assert.ok(
    hasError(result.nextSentenceMetaphorLeakQuality, "implied-meaning-direct-answer-leak"),
    JSON.stringify(result.nextSentenceMetaphorLeakQuality),
  );
});

test("IMPLIED_MEANING blocks peripheral anecdotal figurative details", () => {
  assert.ok(
    hasError(result.peripheralFigurativeQuality, "implied-meaning-noncentral-target"),
    JSON.stringify(result.peripheralFigurativeQuality),
  );
});

test("IMPLIED_MEANING allows compact opening contrast that frames the central claim", () => {
  assert.equal(
    hasError(result.openingContrastQuality, "implied-meaning-noncentral-target"),
    false,
    JSON.stringify(result.openingContrastQuality),
  );
});

test("IMPLIED_MEANING allows compact conclusion contrast that expresses the central warning", () => {
  assert.equal(
    hasError(result.conclusionContrastQuality, "implied-meaning-noncentral-target"),
    false,
    JSON.stringify(result.conclusionContrastQuality),
  );
});

test("IMPLIED_MEANING allows embedded wh-phrases that are not rhetorical questions", () => {
  assert.equal(
    hasError(result.embeddedWhThemeQuality, "implied-meaning-rhetorical-question-target"),
    false,
    JSON.stringify(result.embeddedWhThemeQuality),
  );
});

test("IMPLIED_MEANING allows compact figurative nuclei from central claims", () => {
  assert.equal(
    hasError(result.compactFigurativeNucleusQuality, "implied-meaning-noncentral-target"),
    false,
    JSON.stringify(result.compactFigurativeNucleusQuality),
  );
  assert.equal(
    hasError(result.absenceInstrumentQuality, "implied-meaning-noncentral-target"),
    false,
    JSON.stringify(result.absenceInstrumentQuality),
  );
});

test("IMPLIED_MEANING suggests compact figurative nuclei instead of long figurative sentences", () => {
  assert.match(
    result.figurativeCandidateBlock,
    /Suggested underlinedExpression="living archive of past choices"/,
    result.figurativeCandidateBlock,
  );
  assert.match(
    result.figurativeCandidateBlock,
    /Suggested underlinedExpression="absence is not always a lack"/,
    result.figurativeCandidateBlock,
  );
});

test("IMPLIED_MEANING allows broader central figurative targets found in live generation", () => {
  assert.equal(
    hasError(result.privacyHouseQuality, "implied-meaning-noncentral-target"),
    false,
    JSON.stringify(result.privacyHouseQuality),
  );
  assert.equal(
    hasError(result.ecologyHingeQuality, "implied-meaning-noncentral-target"),
    false,
    JSON.stringify(result.ecologyHingeQuality),
  );
});

test("KILLER IMPLIED_MEANING blocks missing surfaceMeaning metadata", () => {
  assert.ok(
    hasError(result.missingSurfaceQuality, "implied-meaning-missing-surface-meaning"),
    JSON.stringify(result.missingSurfaceQuality),
  );
});

test("IMPLIED_MEANING allows embedded which-phrases that express the central conclusion", () => {
  assert.equal(
    hasError(result.embeddedWhichObstacleQuality, "implied-meaning-rhetorical-question-target"),
    false,
    JSON.stringify(result.embeddedWhichObstacleQuality),
  );
  assert.equal(
    hasError(result.embeddedWhichObstacleQuality, "implied-meaning-noncentral-target"),
    false,
    JSON.stringify(result.embeddedWhichObstacleQuality),
  );
  assert.match(
    result.embeddedWhichCandidateBlock,
    /Suggested underlinedExpression="which obstacles are worth keeping"/,
    result.embeddedWhichCandidateBlock,
  );
});

test("IMPLIED_MEANING blocks targets cut off at a trailing function word", () => {
  assert.ok(
    hasError(result.trailingFunctionQuality, "implied-meaning-target-trailing-function"),
    JSON.stringify(result.trailingFunctionQuality),
  );
});

test("IMPLIED_MEANING allows live-discovered central conclusion targets", () => {
  for (const issues of result.liveCentralTargets) {
    assert.equal(
      hasError(issues, "implied-meaning-noncentral-target"),
      false,
      JSON.stringify(issues),
    );
    assert.equal(
      hasError(issues, "implied-meaning-target-too-long"),
      false,
      JSON.stringify(issues),
    );
  }
});

test("IMPLIED_MEANING suggests compact nuclei for translation and labeling failures", () => {
  assert.equal(
    hasError(result.translationNegotiationQuality, "implied-meaning-noncentral-target"),
    false,
    JSON.stringify(result.translationNegotiationQuality),
  );
  assert.match(
    result.translationNegotiationCandidateBlock,
    /Suggested underlinedExpression="a negotiation between meanings"/,
    result.translationNegotiationCandidateBlock,
  );
  assert.match(
    result.foodLabelCandidateBlock,
    /Suggested underlinedExpression="putting every fact on the package"/,
    result.foodLabelCandidateBlock,
  );
  assert.doesNotMatch(
    result.foodLabelCandidateBlock,
    /Suggested underlinedExpression="not the same as putting every fact on the package"/,
    result.foodLabelCandidateBlock,
  );
});

test("IMPLIED_MEANING honors varied option, answer, and option-language settings", () => {
  assert.equal(
    hasError(result.variedSettingsQuality, "option-count"),
    false,
    JSON.stringify(result.variedSettingsQuality),
  );
  assert.equal(
    hasError(result.variedSettingsQuality, "generic-answer-count"),
    false,
    JSON.stringify(result.variedSettingsQuality),
  );
  assert.equal(
    hasError(result.variedSettingsQuality, "implied-meaning-option-language"),
    false,
    JSON.stringify(result.variedSettingsQuality),
  );
  assert.equal(
    hasError(result.variedSettingsQuality, "implied-meaning-noncentral-target"),
    false,
    JSON.stringify(result.variedSettingsQuality),
  );
});

test("IMPLIED_MEANING allows live setting-matrix central targets", () => {
  assert.equal(
    hasError(result.sleepDarknessQuality, "implied-meaning-noncentral-target"),
    false,
    JSON.stringify(result.sleepDarknessQuality),
  );
  assert.equal(
    hasError(result.coralTourismQuality, "implied-meaning-noncentral-target"),
    false,
    JSON.stringify(result.coralTourismQuality),
  );
});

test("IMPLIED_MEANING enforces explicit stem-language settings", () => {
  assert.ok(
    hasError(result.englishStemMismatchQuality, "implied-meaning-stem-language"),
    JSON.stringify(result.englishStemMismatchQuality),
  );
});

test("IMPLIED_MEANING multi-answer settings require an all-answers direction", () => {
  assert.ok(
    hasError(result.multiAnswerMissingDirectionQuality, "generic-multi-answer-direction"),
    JSON.stringify(result.multiAnswerMissingDirectionQuality),
  );
});
