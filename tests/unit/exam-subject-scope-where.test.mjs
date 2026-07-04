import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// 판별자 일급화(P0) — exams / exam_collections / question_sets 의 subject 스코프 조각이
// 지문/폴더 규약(_passage-where·_collection-where)과 1:1 대칭인지 검증한다. TS + `@/...`
// 앨리어스라 tsx 하니스로 실행(subject-scope-where.test.mjs 패턴 미러).
//
// 계약: subject === "KOREAN" → { subject: 'KOREAN' } /
//       미지정(기본=영어) → { OR: [{ subject: null }, { subject: { not: 'KOREAN' } }] }
//       (null 행 잔류 필수 — 기존 subject 미기록 시험지/폴더/세트는 전부 영어로 간주).
const harnessSource = `
import examWhereMod from "@/actions/exams/_exam-subject-where";
const {
  buildExamSubjectScopeWhere,
  buildExamCollectionSubjectScopeWhere,
  buildQuestionSetSubjectScopeWhere,
  isMissingColumnError,
} = examWhereMod;

const failures = [];
let passed = 0;
function check(name, cond) {
  if (cond) passed += 1;
  else failures.push(name);
}
const json = (v) => JSON.stringify(v);
const KO = json({ subject: "KOREAN" });
const EN = json({ OR: [{ subject: null }, { subject: { not: "KOREAN" } }] });

// ── 세 계층 스코프 조각이 규약과 동일한지 ──
for (const [label, fn] of [
  ["exam", buildExamSubjectScopeWhere],
  ["exam_collection", buildExamCollectionSubjectScopeWhere],
  ["question_set", buildQuestionSetSubjectScopeWhere],
]) {
  check(label + ": KOREAN → subject='KOREAN'", json(fn("KOREAN")) === KO);
  check(
    label + ": default → OR[null, not KOREAN] (null 행 잔류 필수)",
    json(fn(undefined)) === EN,
  );
  // 영어 스코프는 subject 를 KOREAN 으로 강제하지 않아야 한다(무회귀).
  check(
    label + ": default 는 subject='KOREAN' 을 직접 고정하지 않음",
    !json(fn(undefined)).includes('"subject":"KOREAN"'),
  );
}

// ── isMissingColumnError 재export 동작 ──
check("isMissingColumnError: P2022 → true", isMissingColumnError({ code: "P2022" }) === true);
check("isMissingColumnError: 다른 코드 → false", isMissingColumnError({ code: "P2002" }) === false);
check("isMissingColumnError: null → false", isMissingColumnError(null) === false);
check("isMissingColumnError: 문자열 → false", isMissingColumnError("P2022") === false);

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".exam-subject-scope-where-harness.mts");
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

test("exam/collection/set subject scope where: KOREAN/기본 population 분리 규약", () => {
  assert.equal(
    summary.failed,
    0,
    `exam-subject-scope-where failures: ${JSON.stringify(summary.failures)}`,
  );
  assert.ok(summary.passed >= 13, `expected ≥13 checks, got ${summary.passed}`);
});
