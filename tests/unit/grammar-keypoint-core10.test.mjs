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

const { findGrammarKeypointChoiceMismatch, findGrammarAnswerPointNotCore } = shared;
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
  ghostLabelFire: !!ghostLabelFire,
  firstNotAnswerFire: !!firstNotAnswerFire,
  topicMismatchFire: !!topicMismatchFire,
  groundedPass: groundedPass === null,
  nonCoreFire: !!nonCoreFire,
  corePass: corePass === null,
  registered: ["grammar-keypoint-choice-mismatch","grammar-answer-point-not-core"].every(
    (c) => RELAXED_BLOCKING_QUALITY_CODES.has(c) && SALVAGE_RELAXABLE_CODES.has(c),
  ),
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

test("유령 라벨·정답 미선두·주제 불일치 — 전부 차단", () => {
  assert.equal(result.ghostLabelFire, true);
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
