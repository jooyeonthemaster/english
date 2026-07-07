// 게이트 정밀화 3종 재현 테스트 (2026-07-06 1회호출 캠페인 RCA — 게이트가 심사
// 95·96점 문항을 반려하던 오탐 실측 + KILLER 가르침-처벌 상충).
//   임무1: 수일치 장거리 판정기가 분사 후치수식(명사+V-ing/p.p.+전치사)을 개입
//          수식어로 인식 — "the words meaning 'red' ... share"(심사 95) 구제.
//          단 조동사/be 진행·수동은 계속 비인식(얕은 플립 오구제 방지).
//   임무2: grammar-obvious-noun-what-relative 가 계사/전치사 선행 that(명사절·
//          강조구문 자리 = 게이트 자신이 권장하는 출제 방향)에는 미발화.
//          명사 선행사 뒤 that→what 은 계속 발화(회귀 가드).
//   임무3: grammar-shallow-participle-adjective-answer 가 등위 동사열의 병렬
//          깨기(", played …")에는 미발화. 관형 분사 플립은 계속 발화.
//   임무4: KILLER 프롬프트의 기출 변형 가르침에서 that↔what 제외(과훈련 게이트와
//          상충 제거). INTERMEDIATE 는 유지.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import grammarShared from "../src/lib/question-quality/validators/grammar/shared.ts";
import questionQuality from "../src/lib/question-quality/index.ts";
import grammarPointCatalog from "../src/lib/grammar-point-catalog.ts";

const { hasLongDistanceAgreementBeforeTarget, isThinKillerGrammarErrorTarget } = grammarShared;
const { validateQuestionQuality } = questionQuality;
const { buildGrammarPointGuidance } = grammarPointCatalog;

// ── 임무1: 분사 후치수식 인식 ──────────────────────────────────────────────
const participialSentence = "the words meaning 'red' and 'beautiful' share a common origin";
const pastPartSentence = "the data presented by the committee are unreliable in several ways";
const adjacentSentence = "the structure is a mess";
const auxProgressiveSentence = "researchers are developing new methods and tools succeed";

const longDistance = {
  participialIng: hasLongDistanceAgreementBeforeTarget(
    participialSentence,
    participialSentence.indexOf("share a"),
  ),
  participialEdBy: hasLongDistanceAgreementBeforeTarget(
    pastPartSentence,
    pastPartSentence.indexOf("are unreliable"),
  ),
  adjacentShort: hasLongDistanceAgreementBeforeTarget(
    adjacentSentence,
    adjacentSentence.indexOf("is a"),
  ),
  auxProgressiveNotModifier: hasLongDistanceAgreementBeforeTarget(
    auxProgressiveSentence,
    auxProgressiveSentence.indexOf("succeed"),
  ),
  thinRescued: isThinKillerGrammarErrorTarget(
    {
      isError: true,
      expression: "share",
      errorExpression: "shares",
      correction: "share",
      pointCode: "d",
      surroundingText: participialSentence,
    },
    undefined,
  ),
};

// ── 임무2·3: dispatcher 게이트 (최소 문항 — 대상 코드 유무만 판정) ─────────
const basePassage =
  "The reports that the committee reviewed, which were based on interviews with residents, show how policies designed to reduce waste can change habits. The paradox is that the oldest substance is least understood. In the afternoon the children watched films, played games, and wrote stories together. The newly designed frameworks guide policy today.";

const baseMarked = [
  { label: "A", expression: "that", isError: false, pointCode: "b", surroundingText: "reports that the committee reviewed" },
  { label: "B", expression: "which were", isError: false, pointCode: "d", surroundingText: "reviewed, which were based on interviews" },
  { label: "C", expression: "show", isError: false, pointCode: "a", surroundingText: "The reports show how policies" },
  { label: "D", expression: "designed", isError: false, pointCode: "c", surroundingText: "policies designed to reduce waste" },
  { label: "E", expression: "change", isError: false, pointCode: "a", surroundingText: "can change habits" },
];

const baseQuestion = {
  direction: "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?",
  difficulty: "KILLER",
  passageWithMarkers:
    "The reports __(A) that__ the committee reviewed, __(B) which were__ based on interviews with residents, __(C) show__ how policies __(D) designed__ to reduce waste can __(E) change__ habits.",
  markedExpressions: baseMarked,
  options: [
    { label: "A", text: "that" },
    { label: "B", text: "which were" },
    { label: "C", text: "show" },
    { label: "D", text: "designed" },
    { label: "E", text: "change" },
  ],
  correctAnswer: "A",
  correctAnswers: ["A"],
  wrongOptionExplanations: {
    B: "선행사 reports가 복수이므로 which were가 맞다.",
    C: "주어 reports가 복수이므로 show가 맞다.",
    D: "policies를 수식하는 과거분사 designed가 맞다.",
    E: "조동사 can 뒤에는 동사원형 change가 온다.",
  },
  explanation: "정답 자리의 표현이 어법상 틀렸다.",
};

function withAnswerMarker(overrides) {
  return {
    ...baseQuestion,
    markedExpressions: baseMarked.map((markedExpression) =>
      markedExpression.label === "A"
        ? { ...markedExpression, isError: true, ...overrides }
        : markedExpression,
    ),
  };
}

function codesOf(input) {
  return validateQuestionQuality(input).map((issue) => issue.code);
}

const dispatcherCodes = {
  // (임무2-부정) 계사 뒤 that→what: 명사절 자리 — 미발화해야 함
  copulaNounWhat: codesOf({
    typeId: "GRAMMAR_ERROR",
    question: withAnswerMarker({
      expression: "that",
      errorExpression: "what",
      correction: "that",
      pointCode: "b",
      surroundingText: "The paradox is that the oldest substance is least understood",
    }),
    passage: basePassage,
    requestedDifficulty: "INTERMEDIATE",
    grammarMarkerCount: 5,
    grammarAnswerCount: 1,
  }),
  // (임무2-회귀) 명사 선행사 뒤 that→what: 계속 발화해야 함
  nounAntecedentWhat: codesOf({
    typeId: "GRAMMAR_ERROR",
    question: withAnswerMarker({
      expression: "that",
      errorExpression: "what",
      correction: "that",
      pointCode: "b",
      surroundingText: "reports that the committee reviewed",
    }),
    passage: basePassage,
    requestedDifficulty: "INTERMEDIATE",
    grammarMarkerCount: 5,
    grammarAnswerCount: 1,
  }),
  // (임무3-부정) 등위 동사열 병렬 깨기(-ed→-ing): 미발화해야 함
  parallelParticiple: codesOf({
    typeId: "GRAMMAR_ERROR",
    question: withAnswerMarker({
      expression: "played",
      errorExpression: "playing",
      correction: "played",
      pointCode: "i",
      surroundingText: "the children watched films, played games, and wrote stories together",
    }),
    passage: basePassage,
    requestedDifficulty: "KILLER",
    grammarMarkerCount: 5,
    grammarAnswerCount: 1,
  }),
  // (임무3-회귀) 관형 분사 플립(designed frameworks): 계속 발화해야 함
  attributiveParticiple: codesOf({
    typeId: "GRAMMAR_ERROR",
    question: withAnswerMarker({
      expression: "designed",
      errorExpression: "designing",
      correction: "designed",
      pointCode: "c",
      surroundingText: "The newly designed frameworks guide policy today",
    }),
    passage: basePassage,
    requestedDifficulty: "KILLER",
    grammarMarkerCount: 5,
    grammarAnswerCount: 1,
  }),
};

// ── 임무4: KILLER 기출 변형 가르침에서 that↔what 제외 ──────────────────────
const allCodesExceptB = ["a", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m"];
const killerGuidance = buildGrammarPointGuidance({
  diversityEnabled: true,
  variantIndex: 0,
  usedPointCodes: allCodesExceptB,
  answerCount: 1,
  requestedDifficulty: "KILLER",
  mode: "judgment",
  pointFocus: true,
});
const intermediateGuidance = buildGrammarPointGuidance({
  diversityEnabled: true,
  variantIndex: 0,
  usedPointCodes: allCodesExceptB,
  answerCount: 1,
  requestedDifficulty: "INTERMEDIATE",
  mode: "judgment",
  pointFocus: true,
});

console.log(
  JSON.stringify({ longDistance, dispatcherCodes, killerGuidance, intermediateGuidance }),
);
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".grammar-gate-precision-harness.mts");
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

test("임무1 분사 후치수식(V-ing)이 장거리 수일치 개입 수식어로 인식된다", () => {
  assert.equal(result.longDistance.participialIng, true, "words meaning 'red' ...");
});

test("임무1 과거분사+전치사 후치수식(presented by)이 개입 수식어로 인식된다", () => {
  assert.equal(result.longDistance.participialEdBy, true, "data presented by the committee");
});

test("임무1 인접 주어(5단어 미만)는 계속 비장거리", () => {
  assert.equal(result.longDistance.adjacentShort, false);
});

test("임무1 조동사 진행형(are developing)은 후치수식으로 오인되지 않는다", () => {
  assert.equal(result.longDistance.auxProgressiveNotModifier, false);
});

test("임무1 thin 게이트가 분사 후치수식 장거리 수일치(심사 95 실측)를 구제한다", () => {
  assert.equal(result.longDistance.thinRescued, false, "not thin = rescued");
});

test("임무2 계사 뒤 that→what(명사절 자리)에는 noun-what 게이트가 미발화", () => {
  assert.ok(
    !result.dispatcherCodes.copulaNounWhat.includes("grammar-obvious-noun-what-relative"),
    JSON.stringify(result.dispatcherCodes.copulaNounWhat),
  );
});

test("임무2 명사 선행사 뒤 that→what 에는 계속 발화 (회귀 가드)", () => {
  assert.ok(
    result.dispatcherCodes.nounAntecedentWhat.includes("grammar-obvious-noun-what-relative"),
    JSON.stringify(result.dispatcherCodes.nounAntecedentWhat),
  );
});

test("임무3 등위 동사열 병렬 깨기(-ed→-ing)에는 shallow-participle 게이트가 미발화", () => {
  assert.ok(
    !result.dispatcherCodes.parallelParticiple.includes(
      "grammar-shallow-participle-adjective-answer",
    ),
    JSON.stringify(result.dispatcherCodes.parallelParticiple),
  );
});

test("임무3 관형 분사 플립(designed frameworks)에는 계속 발화 (회귀 가드)", () => {
  assert.ok(
    result.dispatcherCodes.attributiveParticiple.includes(
      "grammar-shallow-participle-adjective-answer",
    ),
    JSON.stringify(result.dispatcherCodes.attributiveParticiple),
  );
});

test("임무4 KILLER 기출 변형 가르침에서 that↔what 이 제외되고 차순위가 노출된다", () => {
  assert.ok(!result.killerGuidance.includes("that→what"), "KILLER 에 that→what 없음");
  assert.ok(!result.killerGuidance.includes("what→that"), "KILLER 에 what→that 없음");
  assert.ok(result.killerGuidance.includes("where→which"), "차순위 where→which 노출");
});

test("임무4 INTERMEDIATE 는 that→what 가르침 유지 (무회귀)", () => {
  assert.ok(result.intermediateGuidance.includes("that→what"));
});
