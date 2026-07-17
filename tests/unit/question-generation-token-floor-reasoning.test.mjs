// 캠페인 20260716 I1 회귀 (연구노트 O150): OpenRouter Gemini 는 reasoning 토큰이
// completion 예산(max_tokens)을 공유하고 provider 정책상 reasoning 비활성화가
// 불가능하므로(O147), 기본 토큰 floor 가 4,096 이면 단일 빈칸 KILLER 에서
// reasoning ~3.5k + 본문 JSON 이 상한에 잘려 parse 실패로 전멸한다
// (finish=length, completion 4,033~4,034 실측). 기본 floor 는 8,192 를 유지해야 한다.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const workDir = path.join(repoRoot, "tests", ".tmp-token-floor");

const harnessSource = String.raw`
import {
  getQuestionTypeGenerationTokenFloor,
  resolveQuestionTypeGenerationSettings,
} from "@/lib/question-type-generation-settings/dispatchers";

const blankResolved = resolveQuestionTypeGenerationSettings(
  "BLANK_INFERENCE",
  { BLANK_INFERENCE: { difficulty: "KILLER" } },
  "KILLER",
);
const topicResolved = resolveQuestionTypeGenerationSettings("TOPIC", {}, "INTERMEDIATE");
console.log(
  JSON.stringify({
    blankFloor: getQuestionTypeGenerationTokenFloor("BLANK_INFERENCE", blankResolved),
    topicFloor: getQuestionTypeGenerationTokenFloor("TOPIC", topicResolved),
  }),
);
`;

test("reasoning 예산 공유 회귀: 기본 토큰 floor 는 8192 이상", () => {
  mkdirSync(workDir, { recursive: true });
  const harnessPath = path.join(workDir, "harness.ts");
  writeFileSync(harnessPath, harnessSource);
  try {
    const out = execSync(
      `node ${JSON.stringify(path.join("node_modules", "tsx", "dist", "cli.mjs"))} ${JSON.stringify(harnessPath)}`,
      { cwd: repoRoot, encoding: "utf8" },
    ).trim();
    const { blankFloor, topicFloor } = JSON.parse(out.split("\n").pop());
    assert.ok(blankFloor >= 8192, `BLANK_INFERENCE floor must be >= 8192, got ${blankFloor}`);
    assert.ok(topicFloor >= 8192, `TOPIC floor must be >= 8192, got ${topicFloor}`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});
