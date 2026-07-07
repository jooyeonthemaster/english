// 26-07-06 mc-reading 루프: antonym-surface-form-mismatch 게이트 정밀화 회귀 테스트.
// 실측 오탐(postspine-baseline-20260706, ANTONYM PREM-I): "varied ↔ uniform" 이
// past/participle 불일치로 strict 2회 거부 → relaxed 강등. varied 는 분사형용사이므로
// 일반 형용사와의 짝은 통과해야 하고, 진짜 동사 시제 불일치는 계속 차단되어야 한다.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import antonymValidator from "@/lib/question-quality/validators/antonym";

const { findAntonymSurfaceFormIssue } = antonymValidator;

const cases = {
  variedUniform: findAntonymSurfaceFormIssue("varied", "uniform"),
  uniformVaried: findAntonymSurfaceFormIssue("uniform", "varied"),
  limitedBoundless: findAntonymSurfaceFormIssue("limited", "boundless"),
  exceededLag: findAntonymSurfaceFormIssue("exceeded", "lag"),
  arrivedDepart: findAntonymSurfaceFormIssue("arrived", "depart"),
  increasedDecreased: findAntonymSurfaceFormIssue("increased", "decreased"),
  forcesRestrain: findAntonymSurfaceFormIssue("forces", "restrain"),
  growingShrink: findAntonymSurfaceFormIssue("growing", "shrink"),
};
process.stdout.write(JSON.stringify(cases));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".antonym-surface-form-harness.mts");
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

const summary = runHarness();

test("participial adjectives pair freely with plain adjectives (false-positive fix)", () => {
  assert.equal(summary.variedUniform, null);
  assert.equal(summary.uniformVaried, null);
  assert.equal(summary.limitedBoundless, null);
});

test("genuine verb-form mismatches still fire", () => {
  assert.match(String(summary.exceededLag), /past\/participle/);
  assert.match(String(summary.arrivedDepart), /past\/participle/);
  assert.match(String(summary.forcesRestrain), /-s form|third-person/);
  assert.match(String(summary.growingShrink), /-ing form/);
});

test("matching forms remain clean", () => {
  assert.equal(summary.increasedDecreased, null);
});
