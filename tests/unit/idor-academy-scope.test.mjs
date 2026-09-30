import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";

// 학원 범위(IDOR) 수리 26-09-30 — 지문·분석·폴더·문제·시험 액션과 API 라우트가 세션 학원만 읽고 바꾸는지,
// 문항 편집이 structuredData._sourcePassage 를 잃지 않는지, 관리자 활동 피드가 지문 삭제·막힌 인쇄를
// 사실대로 보이고 지문 원문을 클라이언트로 보내지 않는지를 본다.
// 하네스(tests/unit/idor/*.harness.mts)는 실제 액션·라우트 코드를 가짜 Prisma·세션 위에서 돌린다(운영 DB 무접촉).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function runHarness(name) {
  const raw = execSync(`npx tsx "${path.join(repoRoot, "tests", "unit", "idor", name)}"`, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const line = raw.trim().split(/\r?\n/).filter(Boolean).pop() ?? "";
  return JSON.parse(line);
}

for (const [name, min] of [
  ["workbench-scope.harness.mts", 33],
  ["routes-scope.harness.mts", 22],
  ["activity-feed.harness.mts", 29],
]) {
  test(`학원 범위 하네스 ${name}`, () => {
    const summary = runHarness(name);
    assert.deepEqual(summary.failures, [], `failed: ${summary.failures.join(" | ")}`);
    assert.ok(summary.passed >= min, `expected >= ${min} checks, got ${summary.passed}`);
  });
}

const src = (rel) => readFileSync(path.join(repoRoot, rel), "utf8");

test("세션을 버리는 `await requireAuth();` 가 지문·폴더·분석 액션에 다시 생기지 않는다", () => {
  // 세션을 받지 않으면 where 에 세션 academyId 를 걸 수 없다 — 이 파일들에서는 전부 const staff = … 로 받는다.
  for (const rel of [
    "src/actions/workbench/annotations.ts",
    "src/actions/workbench/collections-passage.ts",
    "src/actions/workbench/collections-question.ts",
    "src/actions/workbench/collections-draft.ts",
    "src/actions/workbench/stats.ts",
  ]) {
    assert.doesNotMatch(src(rel), /^\s*await requireAuth\(\);/m, `${rel}: bare requireAuth()`);
  }
  const questions = src("src/actions/workbench/questions.ts");
  for (const name of ["getWorkbenchQuestion", "updateWorkbenchQuestion", "toggleQuestionStar"]) {
    const start = questions.indexOf(`export async function ${name}(`);
    const next = questions.indexOf("\nexport ", start + 10);
    assert.ok(start >= 0, `${name} not found`);
    assert.doesNotMatch(questions.slice(start, next), /^\s*await requireAuth\(\);/m, `questions.ts ${name}: bare requireAuth()`);
  }
});

test("지문 분석 API 는 학원 범위 없이 지문을 찾지 않는다", () => {
  const route = src("src/app/api/ai/passage-analysis/[passageId]/route.ts");
  assert.doesNotMatch(route, /passage\.findUnique\(\{\s*where: \{ id: passageId \}/);
  const matches = route.match(/passage\.findFirst\(\{\s*where: \{ id: passageId, academyId: staff\.academyId \}/g) ?? [];
  assert.equal(matches.length, 2, "GET·POST 둘 다 학원 범위로 찾는다");
});

test("검수 취소(unpromote)는 지문을 잠근 뒤 학원 범위로만 지운다", () => {
  const route = src("src/app/api/extraction/m1-passages/[draftId]/unpromote/route.ts");
  assert.doesNotMatch(route, /passage\.delete\(\{\s*where: \{ id: passageId \}/);
  assert.match(route, /FOR UPDATE/);
  assert.match(route, /passage\.deleteMany\(\{\s*where: \{ id: passageId, academyId: staff\.academyId \}/);
});

test("학생 AI 채팅은 클라이언트 conversationId 로 대화를 찾지 않는다", () => {
  // 대화는 (studentId, questionId) 유니크 — 저장(upsert)과 같은 키로만 읽는다. id 로 읽으면 남의 학생 대화가
  // AI 문맥에 실리고 본인 행으로 복사된다(IDOR-R1).
  const route = src("src/app/api/ai/chat/route.ts");
  assert.doesNotMatch(route, /aIConversation\.find(?:Unique|First)\(\{\s*where: \{ id\b/);
  assert.doesNotMatch(route, /const \{[^}]*\bconversationId\b[^}]*\} = body/);
  assert.match(route, /aIConversation\.findUnique\(\{\s*where: \{\s*studentId_questionId: \{\s*studentId: session\.studentId,/);
});
