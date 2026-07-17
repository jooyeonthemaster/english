// E-gate (해설 사실검증 게이트) 계약 회귀 — 캠페인 20260716 O153/O156/O160.
// 플랜별 기본 모드: PREMIUM=enforce(Phase C: 출하분 F 0/11), STANDARD=warn.
// 플랜 미상(off)에서는 네트워크 없이 무판정 통과 = 비대상 경로 바이트 안전.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const workDir = path.join(repoRoot, "tests", ".tmp-expl-verify-gate");

const harnessSource = String.raw`
import {
  getExplanationVerifyGateMode,
  runExplanationVerifyGate,
} from "@/app/api/ai/generate-questions-auto/_lib/explanation-verify-gate";

async function main() {
  const results: Record<string, unknown> = {};

  delete process.env.EXPLANATION_VERIFY_GATE_MODE;
  delete process.env.EXPLANATION_VERIFY_GATE_MODE_PREMIUM;
  delete process.env.EXPLANATION_VERIFY_GATE_MODE_STANDARD;

  results.noPlanDefault = getExplanationVerifyGateMode();
  results.premiumDefault = getExplanationVerifyGateMode("PREMIUM");
  results.standardDefault = getExplanationVerifyGateMode("STANDARD");

  process.env.EXPLANATION_VERIFY_GATE_MODE_PREMIUM = "warn";
  results.premiumEnvOverride = getExplanationVerifyGateMode("PREMIUM");
  process.env.EXPLANATION_VERIFY_GATE_MODE = "off";
  results.globalOffWins = getExplanationVerifyGateMode("PREMIUM");
  process.env.EXPLANATION_VERIFY_GATE_MODE = "banana";
  results.invalidGlobalFallsThrough = getExplanationVerifyGateMode("PREMIUM");
  delete process.env.EXPLANATION_VERIFY_GATE_MODE;
  delete process.env.EXPLANATION_VERIFY_GATE_MODE_PREMIUM;

  // 플랜 미상(off): 네트워크/모델 호출 없이 즉시 무판정 통과해야 한다.
  globalThis.fetch = (() => {
    throw new Error("network must not be called in off mode");
  }) as unknown as typeof fetch;
  const offResult = await runExplanationVerifyGate({
    subType: "GRAMMAR_ERROR",
    question: { explanation: "테스트", correctAnswer: "(A)" },
    passage: "Test passage.",
  });
  results.offIssue = offResult.issue;

  // 적용 대상 외 유형은 enforce 여도 무판정 통과 (네트워크 금지 유지).
  process.env.EXPLANATION_VERIFY_GATE_MODE = "enforce";
  const otherType = await runExplanationVerifyGate({
    subType: "TITLE",
    generationPlan: "PREMIUM",
    question: { explanation: "테스트", correctAnswer: "①" },
    passage: "Test passage.",
  });
  results.otherTypeIssue = otherType.issue;

  console.log(JSON.stringify(results));
}
main().catch((e) => { console.error(e); process.exit(1); });
`;

test("E-gate 플랜별 모드와 off/비대상 무판정 통과 계약", () => {
  mkdirSync(workDir, { recursive: true });
  const harnessPath = path.join(workDir, "harness.ts");
  writeFileSync(harnessPath, harnessSource);
  try {
    const out = execSync(
      `node ${JSON.stringify(path.join("node_modules", "tsx", "dist", "cli.mjs"))} ${JSON.stringify(harnessPath)}`,
      { cwd: repoRoot, encoding: "utf8" },
    ).trim();
    const r = JSON.parse(out.split("\n").pop());
    assert.equal(r.noPlanDefault, "off");
    assert.equal(r.premiumDefault, "enforce");
    assert.equal(r.standardDefault, "warn");
    assert.equal(r.premiumEnvOverride, "warn");
    assert.equal(r.globalOffWins, "off");
    assert.equal(r.invalidGlobalFallsThrough, "warn"); // 무효 전역값은 플랜 env(_PREMIUM=warn)로 폴스루
    assert.equal(r.offIssue, null);
    assert.equal(r.otherTypeIssue, null);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});
