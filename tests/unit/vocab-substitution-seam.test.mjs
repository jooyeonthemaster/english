// 26-07-18 블라인드 감사 O-VOCAB-seam 재현 회귀: 어휘 적절성 치환 이음매 무결성.
// 원문 구동사 "leaving out" 의 head 만 "including" 으로 치환하고 particle "out" 이
// 잔류해 "including out"(비존재 결합)이 되어 문법 파손만으로 정답이 노출되는 결함을
// 차단하고(class 1), 정상 치환(관용 구동사 교체·평범한 형용사 교체)은 통과시킨다.
// 아울러 치환 자리 문장부호 무단 변형(class 2)도 차단·통과를 확인한다.
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

// ── Base A: 실측 sw-f-vocab (구동사 leaving out) ──────────────────────────────
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
    explanation: "문맥상 고양이를 leaving out(제외)해야 하므로 including은 부적절하다.",
    keyPoints: ["leave out 구동사의 문맥 파악"],
    tags: ["어휘 적절성"],
    passageWithMarkers: pwm,
  };
}

// (1) 재현: head 만 including 으로 치환, particle out 잔류 → "including out".
const reproIncludingOut = issuesFor(baseAQuestion("including"), passageA);
// (2) 정상 치환: leave out → throw out 은 유효 구동사(문맥상 오답이지만 문법 정문).
const validThrowingOut = issuesFor(baseAQuestion("throwing"), passageA);

// ── Base B: 평범한 형용사 치환(particle 없음) — 정상 통과 ─────────────────────
const passageB = [
  "To understand memory, imagine your brain as a vast digital archive.",
  "Recall is like being asked to write an essay on a blank page.",
  "This requires significant cognitive effort when no hints are given.",
  "Recognition is like scrolling through a photo gallery to find an image.",
  "The main distinction is based on the presence of cues.",
  "While recognition provides plenty of context, recall works in a vacuum.",
].join(" ");
const cleanAdjectiveSwap = issuesFor(
  {
    direction: "다음 글의 밑줄 친 부분 중, 문맥상 낱말의 쓰임이 적절하지 않은 것은?",
    difficulty: "INTERMEDIATE",
    vocabDisplayMode: "SOURCE_EXACT",
    markedWords: [
      { label: "(a)", word: "archive", originalWord: "archive", substituteWord: "archive", isInappropriate: false },
      { label: "(b)", word: "significant", originalWord: "significant", substituteWord: "significant", isInappropriate: false },
      { label: "(c)", word: "gallery", originalWord: "gallery", substituteWord: "gallery", isInappropriate: false },
      { label: "(d)", word: "absence", originalWord: "presence", substituteWord: "absence", isInappropriate: true, betterWord: "presence" },
      { label: "(e)", word: "context", originalWord: "context", substituteWord: "context", isInappropriate: false },
    ],
    options: [
      { label: "1", text: "archive" },
      { label: "2", text: "significant" },
      { label: "3", text: "gallery" },
      { label: "4", text: "absence" },
      { label: "5", text: "context" },
    ],
    correctAnswer: "4",
    explanation: "단서가 있음을 말해야 하므로 absence가 아니라 presence가 적절하다.",
    keyPoints: ["presence vs absence"],
    tags: ["어휘 적절성"],
    passageWithMarkers:
      "To understand memory, imagine your brain as a vast digital __(a) archive__. Recall is like being asked to write an essay on a blank page. This requires __(b) significant__ cognitive effort when no hints are given. Recognition is like scrolling through a photo __(c) gallery__ to find an image. The main distinction is based on the __(d) absence__ of cues. While recognition provides plenty of __(e) context__, recall works in a vacuum.",
  },
  passageB,
);

// ── Class 2: 치환 자리 문장부호 무단 변형(삽입구 콤마 소실) ───────────────────
const passageC =
  "The council debated the new policy for hours. The proposal, however, faced fierce resistance from several members. Supporters remained hopeful about its passage. The final vote was postponed until the following week.";
function baseCQuestion(dChunk) {
  return {
    direction: "다음 글의 밑줄 친 부분 중, 문맥상 낱말의 쓰임이 적절하지 않은 것은?",
    difficulty: "INTERMEDIATE",
    vocabDisplayMode: "SOURCE_EXACT",
    markedWords: [
      { label: "(a)", word: "debated", originalWord: "debated", substituteWord: "debated", isInappropriate: false },
      { label: "(b)", word: "fierce", originalWord: "fierce", substituteWord: "fierce", isInappropriate: false },
      { label: "(c)", word: "hopeful", originalWord: "hopeful", substituteWord: "hopeful", isInappropriate: false },
      { label: "(d)", word: "nonetheless", originalWord: "however", substituteWord: "nonetheless", isInappropriate: true, betterWord: "however" },
      { label: "(e)", word: "postponed", originalWord: "postponed", substituteWord: "postponed", isInappropriate: false },
    ],
    options: [
      { label: "1", text: "debated" },
      { label: "2", text: "fierce" },
      { label: "3", text: "hopeful" },
      { label: "4", text: "nonetheless" },
      { label: "5", text: "postponed" },
    ],
    correctAnswer: "4",
    explanation: "역접이 아니라 부연이 필요한 자리이므로 however 계열은 부적절하다.",
    keyPoints: ["담화 표지"],
    tags: ["어휘 적절성"],
    passageWithMarkers:
      "The council __(a) debated__ the new policy for hours. The proposal, " +
      dChunk +
      " faced __(b) fierce__ resistance from several members. Supporters remained __(c) hopeful__ about its passage. The final vote was __(e) postponed__ until the following week.",
  };
}
// 콤마 소실: "..., __(d) nonetheless__ faced ..." (원문은 "however," 뒤에 콤마).
const class2DroppedComma = issuesFor(baseCQuestion("__(d) nonetheless__"), passageC);
// 정상: "..., __(d) nonetheless__, faced ..." (콤마 보존).
const class2CleanComma = issuesFor(baseCQuestion("__(d) nonetheless__,"), passageC);

process.stdout.write(JSON.stringify({
  reproIncludingOut,
  validThrowingOut,
  cleanAdjectiveSwap,
  class2DroppedComma,
  class2CleanComma,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".vocab-substitution-seam-harness.mts");
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
const find = (issues, code) => issues.find((issue) => issue.code === code);
const has = (issues, code) => issues.some((issue) => issue.code === code);

test("O-VOCAB-seam class 1: 'including out' reproduction is blocked as an error", () => {
  const finding = find(result.reproIncludingOut, "vocab-substitution-seam-particle");
  assert.equal(
    finding?.severity,
    "error",
    JSON.stringify(result.reproIncludingOut),
  );
  assert.match(finding.message, /including out/);
});

test("valid phrasal swap 'throwing out' passes the seam gate", () => {
  assert.equal(
    has(result.validThrowingOut, "vocab-substitution-seam-particle"),
    false,
    JSON.stringify(result.validThrowingOut),
  );
});

test("plain adjective substitution (presence -> absence) passes the seam gate", () => {
  assert.equal(
    has(result.cleanAdjectiveSwap, "vocab-substitution-seam-particle"),
    false,
    JSON.stringify(result.cleanAdjectiveSwap),
  );
  assert.equal(
    has(result.cleanAdjectiveSwap, "vocab-substitution-unauthorized-mutation"),
    false,
    JSON.stringify(result.cleanAdjectiveSwap),
  );
});

test("O-VOCAB-seam class 2: punctuation breakage at the substitution site is blocked", () => {
  const finding = find(result.class2DroppedComma, "vocab-substitution-unauthorized-mutation");
  assert.equal(
    finding?.severity,
    "error",
    JSON.stringify(result.class2DroppedComma),
  );
});

test("clean single-word swap that preserves surrounding punctuation passes", () => {
  assert.equal(
    has(result.class2CleanComma, "vocab-substitution-unauthorized-mutation"),
    false,
    JSON.stringify(result.class2CleanComma),
  );
});
