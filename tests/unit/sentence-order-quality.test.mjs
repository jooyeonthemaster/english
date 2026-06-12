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

const { validateQuestionQuality } = quality;

const badSentenceOrder = {
  direction: "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?",
  givenSentence:
    "We are taught from an early age that sharing is caring. We tell our children to share their toys. A trouble shared is a trouble halved, the saying goes. The sharing economy certainly sounds like a good thing. Advocates claim that the sharing economy is driven by the desire to benefit society. Thanks to popular websites and apps, users can share their cars, their spare bedrooms, their power tools, and even their own time and talents.",
  paragraphs: [
    { label: "(A)", text: "This should be good for the owner, the community, and the environment." },
    { label: "(B)", text: "And because both parties review each other, these digital platforms create a trusting environment among complete strangers." },
    { label: "(C)", text: "While some sites continue to offer true sharing, most are in fact selling a product, much like a traditional business." },
  ],
  options: [
    { label: "1", text: "(A)-(C)-(B)" },
    { label: "2", text: "(B)-(A)-(C)" },
    { label: "3", text: "(B)-(C)-(A)" },
    { label: "4", text: "(C)-(A)-(B)" },
    { label: "5", text: "(C)-(B)-(A)" },
  ],
  correctAnswer: "2",
  wrongOptionExplanations: {
    "1": "(A) 뒤에 바로 (C)가 오면 긍정적 설명에서 반전으로 넘어가는 연결이 급격하다.",
    "3": "(B) 다음 (C)는 플랫폼 신뢰 설명 뒤 사업화 비판으로 바로 넘어가므로 중간 연결이 부족하다.",
    "4": "(C)를 먼저 두면 true sharing과 business의 대조가 너무 이르게 제시된다.",
    "5": "(C)-(B)는 비판 뒤 신뢰 설명으로 되돌아가 흐름이 역행한다.",
  },
  explanation: "불량 예시",
  keyPoints: ["글의 순서", "분량 균형", "주어진 글"],
  tags: ["순서"],
  difficulty: "INTERMEDIATE",
};

const goodSentenceOrder = {
  ...badSentenceOrder,
  givenSentence:
    "We are taught from an early age that sharing is caring. We tell our children to share their toys.",
  paragraphs: [
    {
      label: "(A)",
      text: "While some sites continue to offer true sharing, most are in fact selling a product, much like a traditional business. This shift matters because the moral appeal of sharing can hide the fact that a company is simply charging fees for access.",
    },
    {
      label: "(B)",
      text: "Thanks to popular websites and apps, users can share their cars, their spare bedrooms, their power tools, and even their own time and talents. This should be good for the owner, the community, and the environment.",
    },
    {
      label: "(C)",
      text: "And because both parties review each other, these digital platforms create a trusting environment among complete strangers. According to one of its earliest supporters, author Rachel Botsman, the gig economy takes advantage of idle capacity to better utilize assets.",
    },
  ],
  options: [
    { label: "1", text: "(A)-(C)-(B)" },
    { label: "2", text: "(B)-(C)-(A)" },
    { label: "3", text: "(B)-(A)-(C)" },
    { label: "4", text: "(C)-(A)-(B)" },
    { label: "5", text: "(C)-(B)-(A)" },
  ],
  correctAnswer: "2",
};

const badQuality = validateQuestionQuality({
  typeId: "SENTENCE_ORDER",
  question: badSentenceOrder,
  passage: "",
  requestedDifficulty: "INTERMEDIATE",
});

const goodQuality = validateQuestionQuality({
  typeId: "SENTENCE_ORDER",
  question: goodSentenceOrder,
  passage: "",
  requestedDifficulty: "INTERMEDIATE",
});

process.stdout.write(JSON.stringify({ badQuality, goodQuality }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".sentence-order-quality-harness.mts");
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

test("SENTENCE_ORDER rejects overlong given text and one-sentence A/B/C chunks", () => {
  const codes = new Set(result.badQuality.map((issue) => issue.code));
  assert.equal(codes.has("sentence-order-given-too-long"), true);
  assert.equal(codes.has("sentence-order-given-too-long-relative"), true);
  assert.equal(codes.has("sentence-order-paragraph-too-short"), true);
});

test("SENTENCE_ORDER accepts a balanced CSAT-style split", () => {
  assert.deepEqual(
    result.goodQuality.filter((issue) => issue.severity === "error"),
    [],
    JSON.stringify(result.goodQuality),
  );
});
