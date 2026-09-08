// 자체 시험지 보강 system 프롬프트(src/lib/exam-scoring/boost.ts buildBoostSystemPrompt)
// 자구 게이트(docs/exam-analysis-v4-spec.md §3 U2-1 「vision E1b 와 동일 자구」).
//
// 왜 필요한가: 보강 프롬프트가 자기 난이도 앵커표(3=50~75% · 4=30~50%)를 들고 있으면서
// [품질 규칙](ANALYSIS_QUALITY_RULES, 3=60~75% · 4=30~60%)까지 붙이던 시기가 있었다 —
// 한 프롬프트에 앵커표 2벌. difficulty 는 computeDeterministicExamLevel 의 난이도
// 프로필 버킷을 그대로 먹이므로 이 드리프트는 레일 차트의 흔들림이다. 앵커·오개념형
// why 규칙은 [품질 규칙] 한 곳에만 실려야 한다 → 각 자구가 정확히 1회.
// tsx 하네스 관용구(exam-funnel 테스트와 동일).
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import * as m from "@/lib/exam-scoring/boost";
import { ANALYSIS_QUALITY_RULES } from "@/lib/exam-report/prompts";
const mod: any = (m as any).default ?? (m as any)["module.exports"] ?? m;
const prompt: string = mod.buildBoostSystemPrompt("[시험 정보]\\n제목: 테스트\\n총 문항 수: 1\\n\\n[문항 목록]\\n- 1 (2점, 빈칸 추론) 발문");
console.log(JSON.stringify({ prompt, rules: ANALYSIS_QUALITY_RULES.join("\\n") }));
`;

function runHarness() {
  const dir = path.join(repoRoot, ".tmp-unit-exam-boost-prompt");
  mkdirSync(dir, { recursive: true });
  const harnessPath = path.join(dir, "harness.ts");
  writeFileSync(harnessPath, harnessSource);
  try {
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    const line = raw.trim().split("\n").pop();
    return JSON.parse(line);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

const R = runHarness();

test("보강 프롬프트 — 난이도 앵커·오개념형 why 는 [품질 규칙] 한 곳에만(각 1회)", () => {
  assert.equal(count(R.prompt, "정답률 90%"), 1);
  assert.equal(count(R.prompt, "오개념"), 1);
  // 그 1회는 공유 상수(ANALYSIS_QUALITY_RULES)에서 온 것이어야 한다 — 보강 고유 자구가 아니라.
  assert.equal(count(R.rules, "정답률 90%"), 1);
  assert.equal(count(R.rules, "오개념"), 1);
  assert.ok(R.prompt.includes(R.rules), "[품질 규칙] 블록이 ANALYSIS_QUALITY_RULES 원문 그대로 실려야 한다");
});

test("보강 프롬프트 — 보강 고유 문장(정답 확정 전제·확장 선지 번호·정답 미포함)은 유지", () => {
  assert.ok(R.prompt.includes("[전제 — 정답은 이미 확정]"));
  assert.ok(R.prompt.includes('"1"~"12"'));
  assert.ok(R.prompt.includes("확정 정답 선지는 trapDesign 에 절대 포함하지 않습니다"));
  assert.ok(R.prompt.includes("[품질 규칙]"));
  // 앵커표 사본의 흔적(구 보강 자구)이 남아 있으면 안 된다.
  assert.equal(R.prompt.includes("3=50~75%"), false);
  assert.equal(R.prompt.includes("4=30~50%"), false);
});
