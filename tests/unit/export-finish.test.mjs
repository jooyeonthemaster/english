import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";

// EXPORT-FINISH(26-09-30) — 내보내기 해설 마크다운 · 단일 문항 로더 학원 범위 · 관리자 분석 분류 · 학생 결과 ·
// 시험지 폴더 대량 할당 · 검수 취소(unpromote) 외래키. 하네스는 실제 코드를 돌린다(운영 DB 무접촉):
//   tests/unit/export-finish/explanation-markdown.harness.mts — DOCX · HWPX 문서를 만들어 XML · IR 을 웹 정본과 대조
//   tests/unit/idor/export-finish-scope.harness.mts — 가짜 Prisma · 세션(tests/unit/idor/kit.cjs) 위의 액션 · 라우트
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function runHarness(rel, env = {}) {
  const raw = execSync(`npx tsx "${path.join(repoRoot, rel)}"`, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "", DATABASE_URL: "postgresql://invalid:5432/none", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const line = raw.trim().split(/\r?\n/).filter(Boolean).pop() ?? "";
  return JSON.parse(line);
}

for (const [rel, env, min] of [
  ["tests/unit/export-finish/explanation-markdown.harness.mts", {}, 42],
  ["tests/unit/idor/export-finish-scope.harness.mts", { EF_FLAG_RUN: "on" }, 29],
  ["tests/unit/idor/export-finish-scope.harness.mts", { EF_FLAG_RUN: "off" }, 1],
]) {
  test(`하네스 ${path.basename(rel)} ${JSON.stringify(env)}`, () => {
    const summary = runHarness(rel, env);
    assert.deepEqual(summary.failures, [], `failed: ${summary.failures.join(" | ")}`);
    assert.ok(summary.passed >= min, `expected >= ${min} checks, got ${summary.passed}`);
  });
}

const src = (rel) => readFileSync(path.join(repoRoot, rel), "utf8");

test("DOCX · HWPX 해설은 웹과 같은 마크다운 모듈을 쓴다(날것 parseFormattedText 직행 금지)", () => {
  for (const rel of [
    "src/app/api/exams/[examId]/export-docx/_lib/build-builder-document/answer.ts",
    "src/app/api/exams/[examId]/export-hwpx/_lib/render/answer.ts",
  ]) {
    const s = src(rel);
    assert.match(s, /from "@\/components\/exams\/paper-builder\/explanation-markdown"/, rel);
    assert.match(s, /explanationContentLines\(/, rel);
    // 해설 본문 줄을 서식 파서에 바로 넘기던 옛 모양(마크다운 미처리)이 돌아오지 않는다.
    assert.doesNotMatch(s, /parseFormatted(?:Text|ToRuns)\(prose\(/, rel);
  }
  const web = src("src/components/exams/paper-builder/explanation-layout.ts");
  assert.match(web, /from "\.\/explanation-markdown"/);
  assert.doesNotMatch(web, /export function parseExplanationInline/, "웹 규칙은 explanation-markdown.ts 한 곳");
});

test("검수 취소는 지문 잠금 뒤 RESTRICT 자식(내신 문항 포함)을 세고, 외래키 위반을 409 로 돌려준다", () => {
  const route = src("src/app/api/extraction/m1-passages/[draftId]/unpromote/route.ts");
  const lock = route.indexOf("FOR UPDATE");
  const naeshin = route.indexOf("tx.naeshinQuestion.count(");
  assert.ok(lock > 0 && naeshin > lock, "내신 문항 집계는 잠금 뒤 트랜잭션 안");
  assert.match(route, /isForeignKeyViolation\(error\)/);
  assert.doesNotMatch(route, /NaeshinQuestion, collection\/bundle/, "내신 문항을 CASCADE 로 적은 옛 주석");
});

test("관리자 분석 app_events 분류에 옛 「그 밖 → EXPORT」 가 없다", () => {
  for (const rel of ["src/actions/admin-activity/analytics/_query.ts", "src/actions/admin-activity/analytics/_query-extra.ts"]) {
    assert.doesNotMatch(src(rel), /ELSE 'EXPORT' END/, rel);
  }
});
