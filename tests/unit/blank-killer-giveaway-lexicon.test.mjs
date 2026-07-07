// 26-07-06 blank iter2 재현 테스트 — KILLER 빈칸 giveaway 오답 lexicon 확장.
// iter1 실측(loop-blank-iter1-20260706/default.jsonl ST KILLER llm=78): 오답
// "instantly establish a universal symbolic bond ..." 가 기존 lexicon 에 없어
// blank-paraphrase-killer-giveaway-distractors 게이트가 미발화했고 심사 fatal
// ("crude polarity traps")로 이어졌다. 이 테스트는 확장 lexicon 의 검출과
// 기존 동작 무회귀(정상 근접 오답 비검출)를 고정한다.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import paraphraseModule from "@/lib/question-quality/validators/blank/paraphrase";
import quality from "@/lib/question-quality";

const { hasKillerBlankGiveawayCue, findBlankParaphraseKillerIssue } =
  paraphraseModule;
const { validateQuestionQuality } = quality;

// iter1 실측 KILLER 문항의 실제 오답 표면들.
const measuredGiveaways = [
  "immediately take the lead in forming social codes and systems of thought", // 기존 lexicon (immediate)
  "instantly establish a universal symbolic bond within human cognition", // 신규 (instantly/universal)
  "remain the dominant color forever in every ritual practice", // 신규 (forever)
  "transform artistic practice overnight and permanently reorder its symbolism", // 신규 (overnight/permanently)
  "be adopted at once as the standard system of color classification", // 신규 (at once)
];

// 정상적인 passage-grounded 근접 오답 — 절대어 없음, 계속 통과해야 함(무회귀).
const legitimateNearMisses = [
  "endure a prolonged delay before gaining official recognition as true hues",
  "acquire ritual meaning through gradual shifts in material culture",
  "depend on regional dye technology before entering symbolic systems",
];

const options = [
  { label: "1", text: "endure a prolonged delay before gaining official recognition as true hues" },
  { label: "2", text: "instantly establish a universal symbolic bond within human cognition" },
  { label: "3", text: "remain the dominant color forever in every ritual practice" },
  { label: "4", text: "acquire ritual meaning through gradual shifts in material culture" },
  { label: "5", text: "depend on regional dye technology before entering symbolic systems" },
];

const killerIssue = findBlankParaphraseKillerIssue(
  options,
  "1",
  "wait a long time before they were considered colors",
  "endure a prolonged delay before gaining official recognition as true hues",
  "KILLER",
);

// iter3 재현: KILLER 27단어 list-like 스팬 — 전체 파이프라인에서 신규 코드
// blank-killer-span-too-wide 가 error 로 살아남아야(비 SHIP-FIRST) strict 차단이 성립.
const widePassage = [
  "For a long time red remained the reference color in Western material culture.",
  "Other colors had to wait a long time before they were considered colors and then played a comparable role in material culture, social codes, and systems of thought.",
  "Ultimately, this delay shows that color categories are historical constructions rather than natural givens.",
].join(" ");
const wideSpan =
  "had to wait a long time before they were considered colors and then played a comparable role in material culture";
const wideKillerQuality = validateQuestionQuality({
  typeId: "BLANK_INFERENCE",
  question: {
    direction: "다음 글의 빈칸에 들어갈 말로 가장 적절한 것은?",
    originalExpression: wideSpan,
    passageWithBlank: widePassage.replace(wideSpan, "_____"),
    blankAnswerMode: "PARAPHRASE",
    answerLogic:
      "원문 스팬은 다른 색들이 색으로 인정받기까지의 오랜 지체를 말하며, 정답은 이를 역사적 구성이라는 결론과 종합해 재진술한다.",
    correctAnswer: "1",
    options: [
      { label: "1", text: "needed a prolonged period before earning recognition as independent colors in culture" },
      { label: "2", text: "acquired ritual meaning through gradual shifts in material culture" },
      { label: "3", text: "depended on regional dye technology before entering symbolic systems" },
      { label: "4", text: "were reinterpreted as historical constructions by later color theorists" },
      { label: "5", text: "shaped social codes by remaining outside the dominant color system" },
    ],
    explanation: "빈칸 문장은 색 범주의 역사성을 보여 주는 근거 문장이다.",
    difficulty: "KILLER",
  },
  passage: widePassage,
  requestedDifficulty: "KILLER",
});
const wideKillerIssue = wideKillerQuality.find(
  (issue) => issue.code === "blank-killer-span-too-wide",
);

console.log(
  JSON.stringify({
    measuredGiveaways: measuredGiveaways.map(hasKillerBlankGiveawayCue),
    legitimateNearMisses: legitimateNearMisses.map(hasKillerBlankGiveawayCue),
    killerIssueCode: killerIssue ? killerIssue.code : null,
    wideKillerSeverity: wideKillerIssue ? wideKillerIssue.severity : null,
  }),
);
`;

function runHarness() {
  const harnessPath = path.join(__dirname, ".blank-killer-giveaway-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const lastLine = raw.trim().split(/\r?\n/).at(-1);
    return JSON.parse(lastLine);
  } finally {
    rmSync(harnessPath, { force: true });
  }
}

const result = runHarness();

test("expanded lexicon detects measured absolute-mirror giveaway distractors", () => {
  assert.deepEqual(
    result.measuredGiveaways,
    [true, true, true, true, true],
    "every measured giveaway surface (immediately/instantly/forever/overnight/at once) must be detected",
  );
});

test("legitimate passage-grounded near misses stay undetected (no regression)", () => {
  assert.deepEqual(result.legitimateNearMisses, [false, false, false]);
});

test("killer gate fires with two expanded-lexicon giveaway wrong options", () => {
  // iter3: KILLER 전용 신규 코드(비 SHIP-FIRST) — strict 차단 복원.
  assert.equal(result.killerIssueCode, "blank-killer-giveaway-distractors");
});

test("KILLER wide span emits blank-killer-span-too-wide as a blocking error through the full pipeline", () => {
  // SHIP-FIRST 강등 목록에 없는 신규 코드는 dispatcher 를 지나도 error 로 남아야
  // strict 모드에서 재시도를 유발한다 (relaxed 폴백에서는 자동 warning 강등 출하).
  assert.equal(result.wideKillerSeverity, "error");
});
