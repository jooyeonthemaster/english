// 26-07-06 유저 지시 2건 고정:
// ① keyPoints 라벨 연동 — 검수 실측 "3번째 핵심 포인트가 규칙적으로 이 문항에 없는
//    문법 주제"(tend being 문항은 2·3번째 모두 겉돎) 차단
// ② 어법 정답 포인트 CORE-10 표적 강제(가정법 j·전치사vs접속사 l·비교수량 m 은 디코이 전용)
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import shared from "@/lib/question-quality/validators/grammar/shared";
import generationConstants from "../src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts";

const {
  findGrammarKeypointChoiceMismatch,
  findGrammarKeypointNonexistentLabel,
  findGrammarAnswerPointNotCore,
} = shared;
const { RELAXED_BLOCKING_QUALITY_CODES, SALVAGE_RELAXABLE_CODES } = generationConstants;

const marked = [
  { label: "(A)", expression: "when", isError: false, pointCode: "l" },
  { label: "(B)", expression: "to be disorganized", errorExpression: "being disorganized", isError: true, pointCode: "k" },
  { label: "(C)", expression: "is", isError: false, pointCode: "d" },
  { label: "(D)", expression: "note taking", isError: false, pointCode: "a" },
  { label: "(E)", expression: "to impose", isError: false, pointCode: "k" },
];

// 실측(tend being 문항): 라벨 연동 0 + 2·3번째가 겉도는 일반론 — 발화해야 한다.
const fillerFire = findGrammarKeypointChoiceMismatch(
  [
    "tend + to부정사 고정 형태(동명사 불가)",
    "관계부사 when과 완전한 절의 결합",
    "삽입된 명사절 주어와 단수 동사의 수일치",
  ],
  marked,
  "(B)",
);

// 라벨은 달았지만 존재하지 않는 라벨 참조 — 발화.
const ghostLabelFire = findGrammarKeypointChoiceMismatch(
  ["(B) to부정사 고정 문형", "(F) 분사구문의 능수동"],
  marked,
  "(B)",
);
const ghostLabelFatal = findGrammarKeypointNonexistentLabel(
  ["(B) to부정사 고정 문형", "(F) 분사구문의 능수동"],
  marked,
);
const bulletGhostLabelFatal = findGrammarKeypointNonexistentLabel(
  ["(B) to부정사 고정 문형", "• (F) 분사구문의 능수동"],
  marked,
);
const numberedGhostLabelFatal = findGrammarKeypointNonexistentLabel(
  ["(B) to부정사 고정 문형", "1. (F) 분사구문의 능수동"],
  marked,
);
const nestedBulletNumberGhostLabelFatal = findGrammarKeypointNonexistentLabel(
  ["(B) to부정사 고정 문형", "• 1. (F) 분사구문의 능수동"],
  marked,
);
const circledListGhostLabelFatal = findGrammarKeypointNonexistentLabel(
  ["(B) to부정사 고정 문형", "① (F) 분사구문의 능수동"],
  marked,
);
const neighboringGhostPrefixFatal = [
  "①. (F) 분사구문의 능수동",
  "1: (F) 분사구문의 능수동",
  "[1] (F) 분사구문의 능수동",
  "가. (F) 분사구문의 능수동",
].map((point) => !!findGrammarKeypointNonexistentLabel([point], marked));
const structuralGhostPrefixFatal = [
  "1． (F) 분사 선택을 확인한다.",
  "1、 (F) 분사 선택을 확인한다.",
  "①） (F) 분사 선택을 확인한다.",
  "㉠ (F) 분사 선택을 확인한다.",
  "(가) (F) 분사 선택을 확인한다.",
  "A. (F) 분사 선택을 확인한다.",
  "Ⅰ. (F) 분사 선택을 확인한다.",
  "100. (F) 분사 선택을 확인한다.",
  "> (F) 분사 선택을 확인한다.",
  "# (F) 분사 선택을 확인한다.",
  "- [ ] (F) 분사 선택을 확인한다.",
  "1. > (F) 분사 선택을 확인한다.",
  "\u200B• (F) 분사 선택을 확인한다.",
  "☑️ (F) 분사 선택을 확인한다.",
].map((point) => !!findGrammarKeypointNonexistentLabel([point], marked));
const structuralGhostControls = [
  "가) 1: ②. (C) 분사 선택을 확인한다.",
  "- [ ] (A) 정동사 개수를 확인한다.",
  "(A) 정동사 개수를 확인하고 예시에서는 (F)를 언급한다.",
  "일반 설명에서 (F)를 예로 들지만 실제 keyPoint 참조는 아니다.",
].map((point) => findGrammarKeypointNonexistentLabel([point], marked) === null);
const realLabelFatalPass = findGrammarKeypointNonexistentLabel(
  ["(B) to부정사 고정 문형", "(C) 주어와 동사의 수일치"],
  marked,
);

const circledNumberMarked = ["①", "②", "③", "④", "⑤"].map((label) => ({ label }));
const circledLetterMarked = ["ⓐ", "ⓑ", "ⓒ", "ⓓ", "ⓔ", "㉠", "㉡"].map((label) => ({ label }));
const bracketNumberMarked = ["[1]", "[2]", "[3]", "[4]", "[5]"].map((label) => ({ label }));
const romanOrdinalMarked = ["i", "ii", "iii", "iv", "v", "첫째 밑줄", "둘째 밑줄", "셋째 밑줄"].map((label) => ({ label }));

const alternateGrammarGhosts = [
  ["⑥의 형태가 핵심 오류다.", circledNumberMarked],
  ["⑩의 형태가 핵심 오류다.", circledNumberMarked],
  ["ⓕ의 형태가 핵심 오류다.", circledLetterMarked],
  ["㉥의 형태가 핵심 오류다.", circledLetterMarked],
  ["[6]의 형태가 핵심 오류다.", bracketNumberMarked],
  ["vi의 형태가 핵심 오류다.", romanOrdinalMarked],
  ["여섯째 밑줄의 형태가 핵심 오류다.", romanOrdinalMarked],
].map(([point, labels]) => !!findGrammarKeypointNonexistentLabel([point], labels));

const alternateGrammarControls = [
  ["③에서 수 일치를 확인한다.", circledNumberMarked],
  ["ⓑ에서 수 일치를 확인한다.", circledLetterMarked],
  ["㉡에서 수 일치를 확인한다.", circledLetterMarked],
  ["[2]에서 수 일치를 확인한다.", bracketNumberMarked],
  ["iv에서 수 일치를 확인한다.", romanOrdinalMarked],
  ["셋째 밑줄에서 수 일치를 확인한다.", romanOrdinalMarked],
].map(([point, labels]) => findGrammarKeypointNonexistentLabel([point], labels) === null);

const unicodeRenderedGhosts = [
  "（ｆ）는 야간 보관의 핵심 오류다.",
  "⒡는 야간 보관의 핵심 오류다.",
  "ⓕ는 야간 보관의 핵심 오류다.",
  "𝒇는 야간 보관의 핵심 오류다.",
  "𝔣는 야간 보관의 핵심 오류다.",
  "𝖋는 야간 보관의 핵심 오류다.",
  "ｆ는 야간 보관의 핵심 오류다.",
  "f̲는 야간 보관의 핵심 오류다.",
  "〈f〉는 야간 보관의 핵심 오류다.",
  "［f］는 야간 보관의 핵심 오류다.",
  "❨f❩는 야간 보관의 핵심 오류다.",
  "⁽ᶠ⁾는 야간 보관의 핵심 오류다.",
  "<u>f</u>는 야간 보관의 핵심 오류다.",
  "&#102;는 야간 보관의 핵심 오류다.",
  "⑥는 야간 보관의 핵심 오류다.",
  "Ⓕ는 야간 보관의 핵심 오류다.",
].map((point) => !!findGrammarKeypointNonexistentLabel([point], marked));

const markedWithF = [...marked, { label: "(F)" }];
// v9 independent adjudication fixed the contract at exact student-visible
// glyph identity. Compatibility forms, alternate brackets, entities, and raw
// markup no longer satisfy a different rendered label such as "(F)".
const unicodeRenderedCrossGlyphGhosts = [
  "（ｆ）는 실제 표시된 항목이다.",
  "⒡는 실제 표시된 항목이다.",
  "𝒇는 실제 표시된 항목이다.",
  "𝔣는 실제 표시된 항목이다.",
  "𝖋는 실제 표시된 항목이다.",
  "ｆ는 실제 표시된 항목이다.",
  "f̲는 실제 표시된 항목이다.",
  "〈f〉는 실제 표시된 항목이다.",
  "［f］는 실제 표시된 항목이다.",
  "❨f❩는 실제 표시된 항목이다.",
  "⁽ᶠ⁾는 실제 표시된 항목이다.",
  "<u>f</u>는 실제 표시된 항목이다.",
  "&#x66;는 실제 표시된 항목이다.",
].map((point) => !!findGrammarKeypointNonexistentLabel([point], markedWithF));

const unicodeRenderedCrossStyleGhosts = [
  ["(f)는 실제 표시된 항목이다.", "（ｆ）"],
  ["(f)는 실제 표시된 항목이다.", "𝒇"],
  ["(f)는 실제 표시된 항목이다.", "f̲"],
  ["(f)는 실제 표시된 항목이다.", "〈f〉"],
  ["(f)는 실제 표시된 항목이다.", "<u>f</u>"],
  ["(f)는 실제 표시된 항목이다.", "&#102;"],
].map(([point, label]) =>
  !!findGrammarKeypointNonexistentLabel([point], [{ label }]),
);

const unicodeRenderedExactGlyphControls = [
  ["（ｆ）는 실제 표시된 항목이다.", "（ｆ）"],
  ["⒡는 실제 표시된 항목이다.", "⒡"],
  ["𝒇는 실제 표시된 항목이다.", "𝒇"],
  ["𝔣는 실제 표시된 항목이다.", "𝔣"],
  ["𝖋는 실제 표시된 항목이다.", "𝖋"],
  ["ｆ는 실제 표시된 항목이다.", "ｆ"],
  ["f̲는 실제 표시된 항목이다.", "f̲"],
  ["〈f〉는 실제 표시된 항목이다.", "〈f〉"],
  ["［f］는 실제 표시된 항목이다.", "［f］"],
  ["❨f❩는 실제 표시된 항목이다.", "❨f❩"],
  ["⁽ᶠ⁾는 실제 표시된 항목이다.", "⁽ᶠ⁾"],
  ["<u>f</u>는 실제 표시된 항목이다.", "<u>f</u>"],
  ["&#x66;는 실제 표시된 항목이다.", "&#x66;"],
].map(([point, label]) =>
  findGrammarKeypointNonexistentLabel([point], [{ label }]) === null,
);

const unicodeRenderedFalsePositiveControls = [
  "<u>focus</u> is merely an emphasized grammar word.",
  "&#1024;는 유효한 라벨 entity가 아니다.",
  "f is a variable used later in the example.",
  "focal agreement is discussed without a label.",
  "본문에서 <u>f</u>를 예시 문자로만 언급한다.",
  "본문의 〈figure〉 표기를 설명한다.",
  "not f should be read as a label here.",
].map((point) => findGrammarKeypointNonexistentLabel([point], marked) === null);

const crossStyleAbsentLabelFatal = !!findGrammarKeypointNonexistentLabel(
  ["㉡에서 수 일치를 확인한다."],
  bracketNumberMarked,
);
const proseRomanControl = findGrammarKeypointNonexistentLabel(
  ["I think this point explains the agreement.", "본문에서 vi의 의미를 예로 언급한다."],
  romanOrdinalMarked,
) === null;

// 1번째가 정답 라벨이 아님 — 발화.
const firstNotAnswerFire = findGrammarKeypointChoiceMismatch(
  ["(A) 전치사 vs 접속사 판별", "(B) tend 는 to부정사만 취하는 동사"],
  marked,
  "(B)",
);

// 라벨-주제 불일치: (C)의 pointCode 는 d(수일치)인데 분사 얘기 — 발화.
const topicMismatchFire = findGrammarKeypointChoiceMismatch(
  ["(B) tend 는 to부정사를 목적어로 취함", "(C) 분사구문의 능동·수동 판단"],
  marked,
  "(B)",
);

// 정상: 라벨 연동 + 1번째 정답 + 주제 일치 — 통과.
const groundedPass = findGrammarKeypointChoiceMismatch(
  [
    "(B) to-v vs v-ing — tend 는 to부정사만 목적어로 취한다",
    "(C) 수일치 — 삽입 명사절 주어는 단수 취급",
    "(E) to부정사 — allow + 목적어 + to-v 문형",
  ],
  marked,
  "(B)",
);

// CORE-10: 정답 pointCode j(가정법) — 발화 / d(수일치) — 통과.
const nonCoreFire = findGrammarAnswerPointNotCore([
  { label: "(C)", isError: true, pointCode: "j" },
  { label: "(A)", isError: false, pointCode: "b" },
]);
const corePass = findGrammarAnswerPointNotCore([
  { label: "(C)", isError: true, pointCode: "d" },
  { label: "(A)", isError: false, pointCode: "j" },
]);

console.log(JSON.stringify({
  fillerFire: !!fillerFire,
  ghostLabelCraftPass: ghostLabelFire === null,
  ghostLabelFatal: !!ghostLabelFatal,
  bulletGhostLabelFatal: !!bulletGhostLabelFatal,
  numberedGhostLabelFatal: !!numberedGhostLabelFatal,
  nestedBulletNumberGhostLabelFatal: !!nestedBulletNumberGhostLabelFatal,
  circledListGhostLabelFatal: !!circledListGhostLabelFatal,
  neighboringGhostPrefixFatal,
  structuralGhostPrefixFatal,
  structuralGhostControls,
  realLabelFatalPass: realLabelFatalPass === null,
  alternateGrammarGhosts,
  alternateGrammarControls,
  unicodeRenderedGhosts,
  unicodeRenderedCrossGlyphGhosts,
  unicodeRenderedCrossStyleGhosts,
  unicodeRenderedExactGlyphControls,
  unicodeRenderedFalsePositiveControls,
  crossStyleAbsentLabelFatal,
  proseRomanControl,
  firstNotAnswerFire: !!firstNotAnswerFire,
  topicMismatchFire: !!topicMismatchFire,
  groundedPass: groundedPass === null,
  nonCoreFire: !!nonCoreFire,
  corePass: corePass === null,
  registered: ["grammar-keypoint-choice-mismatch","grammar-answer-point-not-core"].every(
    (c) => RELAXED_BLOCKING_QUALITY_CODES.has(c) && SALVAGE_RELAXABLE_CODES.has(c),
  ),
  fatalPolicy:
    RELAXED_BLOCKING_QUALITY_CODES.has("grammar-keypoint-nonexistent-label") &&
    !SALVAGE_RELAXABLE_CODES.has("grammar-keypoint-nonexistent-label"),
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".grammar-keypoint-core10-harness.mts");
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

test("실측 필러 keyPoints(tend being 문항) — 라벨 무연동 차단", () => {
  assert.equal(result.fillerFire, true);
});

test("유령 라벨은 metadata/craft mismatch와 분리된 fatal code로만 차단", () => {
  assert.equal(result.ghostLabelCraftPass, true);
  assert.equal(result.ghostLabelFatal, true);
  assert.equal(result.bulletGhostLabelFatal, true);
  assert.equal(result.numberedGhostLabelFatal, true);
  assert.equal(result.nestedBulletNumberGhostLabelFatal, true);
  assert.equal(result.circledListGhostLabelFatal, true);
  assert.deepEqual(result.neighboringGhostPrefixFatal, [true, true, true, true]);
  assert.equal(
    result.structuralGhostPrefixFatal.every(Boolean),
    true,
    JSON.stringify(result.structuralGhostPrefixFatal),
  );
  assert.equal(result.structuralGhostControls.every(Boolean), true);
  assert.equal(result.realLabelFatalPass, true);
});

test("원숫자·원문자·괄호숫자·로마자·한글 서수 라벨 grammar를 실제 렌더 라벨과 대조", () => {
  assert.equal(result.alternateGrammarGhosts.every(Boolean), true);
  assert.equal(result.alternateGrammarControls.every(Boolean), true);
  assert.equal(result.crossStyleAbsentLabelFatal, true);
  assert.equal(result.proseRomanControl, true);
});

test("Unicode 선두 라벨은 호환 정규화 없이 정확한 rendered glyph와 대조", () => {
  assert.equal(result.unicodeRenderedGhosts.every(Boolean), true);
  assert.equal(result.unicodeRenderedCrossGlyphGhosts.every(Boolean), true);
  assert.equal(result.unicodeRenderedCrossStyleGhosts.every(Boolean), true);
  assert.equal(result.unicodeRenderedExactGlyphControls.every(Boolean), true);
});

test("HTML 산문·긴 entity·영문 변수·문장 중간 예시는 선두 라벨로 오인하지 않음", () => {
  assert.equal(result.unicodeRenderedFalsePositiveControls.every(Boolean), true);
});

test("정답 미선두·주제 불일치 — craft mismatch 유지", () => {
  assert.equal(result.firstNotAnswerFire, true);
  assert.equal(result.topicMismatchFire, true);
});

test("라벨 연동 + 정답 선두 + 주제 일치 — 통과", () => {
  assert.equal(result.groundedPass, true);
});

test("CORE-10: 희귀 코드 정답 차단, 핵심 코드 정답 통과 (디코이 j 허용)", () => {
  assert.equal(result.nonCoreFire, true);
  assert.equal(result.corePass, true);
});

test("두 코드 모두 craft 등재(RELAXED 차단 + SALVAGE 강등 가능)", () => {
  assert.equal(result.registered, true);
});

test("존재하지 않는 keyPoint 라벨은 relaxed에서도 차단되고 salvage 불가", () => {
  assert.equal(result.fatalPolicy, true);
});
