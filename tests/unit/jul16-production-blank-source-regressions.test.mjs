import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = String.raw`
import quality from "@/lib/question-quality";

const { validateQuestionQuality } = quality;

function blankQuestion(overrides: Record<string, unknown> = {}) {
  return {
    direction: "Choose the best expression for the blank.",
    difficulty: "INTERMEDIATE",
    blankAnswerMode: "SOURCE_EXACT",
    originalExpression: "creates a rhythmic pattern or “flow”",
    passageWithBlank:
      "Reading poetry aloud helps listeners notice sound. It _____ and makes the language memorable.",
    options: [
      { label: "1", text: "creates a rhythmic pattern or “flow”" },
      { label: "2", text: "removes every trace of rhythm" },
      { label: "3", text: "prevents readers from hearing sound" },
      { label: "4", text: "turns all language into prose" },
      { label: "5", text: "makes meaning completely irrelevant" },
    ],
    correctAnswer: "1",
    explanation: "The source explicitly describes the rhythmic effect of oral reading.",
    ...overrides,
  };
}

function blankIssues(question: Record<string, unknown>, passage: string) {
  return validateQuestionQuality({
    typeId: "BLANK_INFERENCE",
    question,
    passage,
    requestedDifficulty: "INTERMEDIATE",
  });
}

const sourcePassage =
  "Reading poetry aloud helps listeners notice sound. It creates a rhythmic pattern or “flow” and makes the language memorable.";

const exactReconstruction = blankIssues(blankQuestion(), sourcePassage);

const orphanQuote = blankIssues(
  blankQuestion({
    passageWithBlank:
      "Reading poetry aloud helps listeners notice sound. It _____.” and makes the language memorable.",
  }),
  sourcePassage,
);

const infinitivePast = blankIssues(
  blankQuestion({
    originalExpression: "asked the host to spend more time playing records",
    passageWithBlank:
      "The guests _____ so that the dancers could continue.",
    options: [
      { label: "1", text: "asked the host to spend more time playing records" },
      { label: "2", text: "did not force the host to spent more time playing records" },
      { label: "3", text: "asked the host to end the event immediately" },
      { label: "4", text: "prevented the host from changing any records" },
      { label: "5", text: "required every guest to leave before midnight" },
    ],
  }),
  "The guests asked the host to spend more time playing records so that the dancers could continue.",
);

const otherIrregularPast = blankIssues(
  blankQuestion({
    originalExpression: "tried to go home before the storm",
    passageWithBlank: "The hikers _____ but the road was already closed.",
    options: [
      { label: "1", text: "tried to go home before the storm" },
      { label: "2", text: "tried to went home before the storm" },
      { label: "3", text: "waited for the weather to improve" },
      { label: "4", text: "continued toward the mountain shelter" },
      { label: "5", text: "asked the guide for another route" },
    ],
  }),
  "The hikers tried to go home before the storm but the road was already closed.",
);

const spentFuelPreposition = blankIssues(
  blankQuestion({
    originalExpression: "applies strict safeguards",
    passageWithBlank:
      "The regulation _____ when facilities transport waste.",
    options: [
      { label: "1", text: "applies strict safeguards" },
      { label: "2", text: "limits access to spent fuel storage areas" },
      { label: "3", text: "requires independent monitoring" },
      { label: "4", text: "removes all reporting duties" },
      { label: "5", text: "delays inspections indefinitely" },
    ],
  }),
  "The regulation applies strict safeguards when facilities transport waste.",
);

const baseFormHomograph = blankIssues(
  blankQuestion({
    originalExpression: "plans to establish a nonprofit",
    passageWithBlank: "The committee _____ for neighborhood artists.",
    options: [
      { label: "1", text: "plans to establish a nonprofit" },
      { label: "2", text: "plans to found a nonprofit" },
      { label: "3", text: "expects to fund a temporary program" },
      { label: "4", text: "refuses to support local performers" },
      { label: "5", text: "intends to close the public venue" },
    ],
  }),
  "The committee plans to establish a nonprofit for neighborhood artists.",
);

const tripleLetterTypo = validateQuestionQuality({
  typeId: "TOPIC",
  question: {
    difficulty: "INTERMEDIATE",
    direction: "Choose the best topic.",
    options: [
      { label: "1", text: "The origins of the hip-hop Commmunity" },
      { label: "2", text: "Bookkeeping practices in local businesses" },
      { label: "3", text: "Cooperation among neighborhood artists" },
      { label: "4", text: "The reign of Henry III in England" },
      { label: "5", text: "The growth of online reference sites such as www.example.com" },
    ],
    correctAnswer: "1",
    explanation: "The passage focuses on the origins of a musical community.",
  },
  passage: "Local artists created a new musical community through shared performances.",
  requestedDifficulty: "INTERMEDIATE",
});

const cleanTripleLetterControls = validateQuestionQuality({
  typeId: "TOPIC",
  question: {
    difficulty: "INTERMEDIATE",
    direction: "Choose the best topic.",
    options: [
      { label: "1", text: "The origins of a local music community" },
      { label: "2", text: "Bookkeeping practices in local businesses" },
      { label: "3", text: "Cooperation among neighborhood artists" },
      { label: "4", text: "The reign of Henry III in England" },
      { label: "5", text: "The growth of online reference sites such as www.example.com" },
    ],
    correctAnswer: "1",
    explanation: "The passage focuses on the origins of a musical community.",
  },
  passage: "Local artists created a new musical community through shared performances.",
  requestedDifficulty: "INTERMEDIATE",
});

process.stdout.write(JSON.stringify({
  exactReconstruction,
  orphanQuote,
  infinitivePast,
  otherIrregularPast,
  spentFuelPreposition,
  baseFormHomograph,
  tripleLetterTypo,
  cleanTripleLetterControls,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(
    tmpDir,
    ".jul16-production-blank-source-regressions-harness.mts",
  );
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    rmSync(harnessPath, { force: true });
  }
}

const result = runHarness();
const find = (issues, code) => issues.find((issue) => issue.code === code);

test("single-blank restoration must reproduce the exact source passage", () => {
  assert.equal(
    find(result.exactReconstruction, "blank-source-reconstruction-mismatch"),
    undefined,
    JSON.stringify(result.exactReconstruction),
  );
  assert.equal(
    find(result.orphanQuote, "blank-source-reconstruction-mismatch")?.severity,
    "error",
    JSON.stringify(result.orphanQuote),
  );
});

test("all blank options reject infinitive to + past-only irregular forms", () => {
  assert.equal(
    find(result.infinitivePast, "blank-option-infinitive-past-form")?.severity,
    "error",
    JSON.stringify(result.infinitivePast),
  );
  assert.equal(
    find(result.otherIrregularPast, "blank-option-infinitive-past-form")
      ?.severity,
    "error",
    JSON.stringify(result.otherIrregularPast),
  );
});

test("prepositional and valid base-homograph uses are not infinitive false positives", () => {
  assert.equal(
    find(result.spentFuelPreposition, "blank-option-infinitive-past-form"),
    undefined,
    JSON.stringify(result.spentFuelPreposition),
  );
  assert.equal(
    find(result.baseFormHomograph, "blank-option-infinitive-past-form"),
    undefined,
    JSON.stringify(result.baseFormHomograph),
  );
});

test("MC options reject impossible triple-letter typos without flagging controls", () => {
  assert.equal(
    find(result.tripleLetterTypo, "option-spelling-triple-letter")?.severity,
    "error",
    JSON.stringify(result.tripleLetterTypo),
  );
  assert.equal(
    find(result.cleanTripleLetterControls, "option-spelling-triple-letter"),
    undefined,
    JSON.stringify(result.cleanTripleLetterControls),
  );
});
