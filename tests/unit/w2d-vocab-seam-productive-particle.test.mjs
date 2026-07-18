// W2-D (26-07-18) 오탐 완화 회귀: vocab-substitution-seam 의 생산적 방향부사 결합 벡터.
// 이동·지각·자세 동사류(walk/run/look/climb/step/move/turn/glance 등)는 방향·공간
// 부사(particle)와 자유 결합해 정문을 만든다("glancing out", "peering out", "climbing
// out"). 관용 구동사 사전에 특정 결합이 없더라도 이들이 substituteWord 일 때는 seam-
// particle 을 발화하면 안 된다(오탐). 반면 비-이동 동사가 particle 을 비존재 결합으로
// 남기면(예: "informing out") 여전히 차단돼야 한다(진탐 보존).
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

function issuesFor(question, passage) {
  return validateQuestionQuality({
    typeId: "VOCAB_CHOICE",
    question: { _typeId: "VOCAB_CHOICE", ...question },
    passage,
  });
}

// 원문에 구동사 "leaving out the cat"(leave+out). 정답(d)의 head 를 substituteWord 로
// 바꾸면 particle "out" 이 잔류한다. substituteWord 가 이동·지각 동사면 "X out" 은
// 정문 자유 결합이므로 발화 억제 대상.
const passageA =
  'An ombudsman noticed a pattern in the newspaper\'s reporting on shipwrecks: Each such story featured a cat that had survived. When she asked the reporter about this curious coincidence, she was told: "One of those wrecked ships had a cat, and the crew went back to save it. I made the cat a feature of my story, while the other reporters failed to mention the cat, and were called down by their editors for being beaten. The next time there was a shipwreck, there was no cat but the other ship news reporters did not wish to take a chance, and put the cat in. I wrote the report, leaving out the cat, and then I was severely scolded for being beaten. Now when there is a shipwreck all of us always put in the cat."';

function baseAQuestion(answerWord) {
  const pwm =
    'An ombudsman noticed a pattern in the newspaper\'s reporting on shipwrecks: Each such story featured a cat that had survived. When she asked the reporter about this __(a) curious__ coincidence, she was told: "One of those wrecked ships had a cat, and the crew went back to save it. I made the cat a feature of my story, while the other reporters __(b) failed__ to mention the cat, and were called down by their editors for being __(c) beaten__. The next time there was a shipwreck, there was no cat but the other ship news reporters did not wish to take a chance, and put the cat in. I wrote the report, __(d) ' +
    answerWord +
    '__ out the cat, and then I was severely __(e) scolded__ for being beaten. Now when there is a shipwreck all of us always put in the cat."';
  return {
    direction: "다음 글의 밑줄 친 부분 중, 문맥상 낱말의 쓰임이 적절하지 않은 것은?",
    difficulty: "INTERMEDIATE",
    vocabDisplayMode: "SOURCE_EXACT",
    markedWords: [
      { label: "(a)", word: "curious", originalWord: "curious", substituteWord: "curious", isInappropriate: false },
      { label: "(b)", word: "failed", originalWord: "failed", substituteWord: "failed", isInappropriate: false },
      { label: "(c)", word: "beaten", originalWord: "beaten", substituteWord: "beaten", isInappropriate: false },
      { label: "(d)", word: answerWord, originalWord: "leaving", substituteWord: answerWord, isInappropriate: true, betterWord: "leaving" },
      { label: "(e)", word: "scolded", originalWord: "scolded", substituteWord: "scolded", isInappropriate: false },
    ],
    options: [
      { label: "1", text: "curious" },
      { label: "2", text: "failed" },
      { label: "3", text: "beaten" },
      { label: "4", text: answerWord },
      { label: "5", text: "scolded" },
    ],
    correctAnswer: "4",
    explanation: "문맥상 낱말의 쓰임 파악.",
    keyPoints: ["문맥 파악"],
    tags: ["어휘 적절성"],
    passageWithMarkers: pwm,
  };
}

// 이동·지각·자세 동사 substituteWord — "X out" 은 정문 자유 결합, 발화 억제 대상.
// (전부 PHRASAL_VERBS["out"] 사전에는 없어 보강 전이면 오발화하던 벡터.)
const glancingOut = issuesFor(baseAQuestion("glancing"), passageA);
const peeringOut = issuesFor(baseAQuestion("peering"), passageA);
const climbingOut = issuesFor(baseAQuestion("climbing"), passageA);
const gazingOut = issuesFor(baseAQuestion("gazing"), passageA);
const leaningOut = issuesFor(baseAQuestion("leaning"), passageA);

// 진탐 보존 대조군: 비-이동 동사가 particle 을 비존재 결합으로 남김("informing out").
const informingOut = issuesFor(baseAQuestion("informing"), passageA);
// 기존 재현(회귀 유지): "including out" 은 여전히 차단.
const includingOut = issuesFor(baseAQuestion("including"), passageA);

process.stdout.write(JSON.stringify({
  glancingOut, peeringOut, climbingOut, gazingOut, leaningOut,
  informingOut, includingOut,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".w2d-vocab-seam-productive-particle-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`node node_modules/tsx/dist/cli.mjs "${harnessPath}"`, {
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
const has = (issues, code) => issues.some((issue) => issue.code === code);

test("motion/perception/posture verb substitutes stranding a particle are NOT flagged (FP suppressed)", () => {
  for (const [name, issues] of [
    ["glancingOut", result.glancingOut],
    ["peeringOut", result.peeringOut],
    ["climbingOut", result.climbingOut],
    ["gazingOut", result.gazingOut],
    ["leaningOut", result.leaningOut],
  ]) {
    assert.equal(
      has(issues, "vocab-substitution-seam-particle"),
      false,
      `${name} should be suppressed: ${JSON.stringify(issues)}`,
    );
  }
});

test("non-motion verb stranding a non-existent particle combination still fires (true positive preserved)", () => {
  assert.equal(
    has(result.informingOut, "vocab-substitution-seam-particle"),
    true,
    JSON.stringify(result.informingOut),
  );
  assert.equal(
    has(result.includingOut, "vocab-substitution-seam-particle"),
    true,
    JSON.stringify(result.includingOut),
  );
});
