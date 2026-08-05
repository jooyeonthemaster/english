import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// 채점 계약 (docs/worksheet-study-spec.md §5):
//  - normalizeEn: 대소문자·구두점·스마트따옴표·공백 무시, 하이픈·아포스트로피 유지
//  - gradeTyped: 정규화 완전 일치만 정답, typo 만 있으면 nearMiss
//  - accumulateWeakness: attempt=1 만 집계, selfGrade △/X 는 오답
//  - computeStudyMastery: 첫 시도 정답률 + 진도 (§5.1 — 2026-07-25 재정의)
const harnessSource = `
import gradeMod from "@/lib/worksheet-study/grade";
const { normalizeEn, gradeTyped, gradeOrder, gradeCloze, diffWords, selfGradeScore, accumulateWeakness, computeMasteryPct, computeStudyMastery } = gradeMod as any;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed += 1;
  else failures.push(name);
}

check("정규화: 대소문자/구두점/공백", normalizeEn("  The Brain, works!  ") === "the brain works");
check("정규화: 스마트따옴표", normalizeEn("friend’s") === normalizeEn("friend's"));
check("정규화: 아포스트로피 유지", normalizeEn("don't") === "don't");
check("정규화: 하이픈 유지", normalizeEn("well-known") === "well-known");

const t1 = gradeTyped("Recall is like an essay.", "Recall is like an essay");
check("타이핑: 구두점 차이는 정답", t1.correct);
const t2 = gradeTyped("Recall is like a essay", "Recall is like an essay");
check("타이핑: 관사 오탈 → 오답", !t2.correct);
check("타이핑: 편집거리1 → nearMiss", t2.nearMiss);
const t3 = gradeTyped("Recall like essay", "Recall is like an essay");
check("타이핑: 단어 누락 → nearMiss 아님", !t3.correct && !t3.nearMiss);
check("타이핑: 빈 입력 → 오답", !gradeTyped("", "abc").correct);
const d = diffWords("Recall like essay extra", "Recall is like an essay");
check("디프: missing 검출", d.some(x => x.state === "missing" && (x.word === "is" || x.word === "an")));
check("디프: extra 검출", d.some(x => x.state === "extra" && x.word === "extra"));

check("어순: 정규화 일치", gradeOrder(["Recall is", "like an essay."], "Recall is like an essay"));
check("어순: 순서 틀림 → 오답", !gradeOrder(["like an essay", "Recall is"], "Recall is like an essay"));

const cz = gradeCloze(["archive", "wrong"], ["Archive", "cues"]);
check("빈칸: 슬롯별 판정", cz[0] === true && cz[1] === false);

check("자기채점 점수", selfGradeScore("O") === 1 && selfGradeScore("D") === 0.5 && selfGradeScore("X") === 0);

const w = accumulateWeakness(null, [
  { itemKey: "a", skill: "vocab", wordKey: "archive", attempt: 1, correct: false, timeMs: 100, hintUsed: false },
  { itemKey: "b", skill: "vocab", wordKey: "archive", attempt: 1, correct: true, timeMs: 100, hintUsed: false },
  { itemKey: "c", skill: "grammar", grammarCode: "i", sentenceNo: 3, attempt: 1, correct: false, timeMs: 100, hintUsed: false },
  { itemKey: "c", skill: "grammar", grammarCode: "i", sentenceNo: 3, attempt: 2, correct: true, timeMs: 100, hintUsed: false },
  { itemKey: "d", skill: "production", sentenceNo: 3, attempt: 1, selfGrade: "D", timeMs: 100, hintUsed: false },
]);
check("취약점: attempt=1 만 집계", w.grammar["i"].total === 1 && w.grammar["i"].correct === 0);
check("취약점: 단어 오답 집계", w.words.length === 1 && w.words[0].word === "archive" && w.words[0].wrong === 1 && w.words[0].total === 2);
check("취약점: 자기채점 △ 는 오답", w.skills.production!.correct === 0 && w.skills.production!.total === 1);
check("취약점: 문장 누적", w.sentences["3"].total === 2);
const w2 = accumulateWeakness(w, [
  { itemKey: "e", skill: "vocab", wordKey: "archive", attempt: 1, correct: false, timeMs: 1, hintUsed: false },
]);
check("취약점: 증분 누적 불변성", w.words[0].wrong === 1 && w2.words[0].wrong === 2);

// ── 성취 지표: 첫 시도 정답률 + 진도 (docs/worksheet-study-spec.md §5.1) ──
// 구 정의는 status==="done" 스테이지만 집계해, 쉬운 단계 하나만 만점으로 끝낸 학생을
// 100%로 보고했다. 진행 중 스테이지의 오답이 분모에서 통째로 빠졌기 때문이다.
// 아래 단언들이 그 배제 로직의 부활을 막는다.

// (a) done + in-progress 혼합 — 진행 중 스테이지도 분자·분모에 들어간다.
//     구 정의에서는 c 가 배제돼 (8+2)/(10+10)=50 이었다. 이제는 10/30=33 이어야 한다.
const mixed = computeStudyMastery({
  a: { status: "done", firstCorrect: 8, firstTotal: 10 },
  b: { status: "done", firstCorrect: 2, firstTotal: 10 },
  c: { status: "in-progress", firstCorrect: 0, firstTotal: 10, answered: 10, total: 10 },
});
check("정답률: 진행 중 스테이지도 분모에 포함", mixed.firstTotal === 30 && mixed.firstCorrect === 10);
check("정답률: 구 정의(50) 부활 금지", mixed.firstTryPct === 33);
check("정답률: computeMasteryPct 는 firstTryPct 의 축약", computeMasteryPct({
  a: { status: "done", firstCorrect: 8, firstTotal: 10 },
  b: { status: "done", firstCorrect: 2, firstTotal: 10 },
  c: { status: "in-progress", firstCorrect: 0, firstTotal: 10, answered: 10, total: 10 },
}) === mixed.firstTryPct);

// (b) 무채점 done 스테이지(지문 통독 등)는 정답률·진도 양쪽에서 빠진다.
//     스테이지 수(진행 배지 판단용)에는 남아야 한다.
const ungraded = computeStudyMastery({
  reading: { status: "done" },
  "vocab-quiz": { status: "done", firstCorrect: 3, firstTotal: 4 },
});
check("무채점 done: 정답률 분모 제외", ungraded.firstTotal === 4 && ungraded.firstTryPct === 75);
check("무채점 done: 진도 분모 제외", ungraded.totalItems === 4 && ungraded.answered === 4 && ungraded.coveragePct === 100);
check("무채점 done: 스테이지 수에는 포함", ungraded.stagesTotal === 2 && ungraded.stagesDone === 2);

// (c) 진도 — done 은 total 을 저장하지 않으므로 firstTotal 을 문항 수로 보고,
//     in-progress 는 total(전체 문항)을 쓴다. 5 + 12 = 17 중 5 + 3 = 8 을 풀었다.
const coverage = computeStudyMastery({
  done: { status: "done", firstCorrect: 5, firstTotal: 5 },
  live: { status: "in-progress", firstCorrect: 1, firstTotal: 3, answered: 3, total: 12 },
});
check("진도: done=firstTotal · in-progress=total 를 분모로", coverage.totalItems === 17);
check("진도: 푼 문항 합산", coverage.answered === 8 && coverage.coveragePct === 47);

// 분자가 분모를 넘는 이상 데이터(플러시 중복 등)는 클램프된다 — 100% 초과 표시 금지.
const clamped = computeStudyMastery({
  a: { status: "in-progress", firstCorrect: 9, firstTotal: 4, answered: 9, total: 4 },
});
check("클램프: 분자는 분모를 넘지 않는다", clamped.firstCorrect === 4 && clamped.answered === 4);
check("클램프: 100% 초과 없음", clamped.firstTryPct === 100 && clamped.coveragePct === 100);

// (d) provisional — 전 스테이지 done 이면 false, 하나라도 아니면 true.
const allDone = computeStudyMastery({
  reading: { status: "done" },
  quiz: { status: "done", firstCorrect: 1, firstTotal: 2 },
});
check("provisional: 전 스테이지 done → false", allDone.provisional === false);
check("provisional: 미완료 스테이지 있으면 true", computeStudyMastery({
  a: { status: "done", firstCorrect: 1, firstTotal: 1 },
  b: { status: "todo" },
}).provisional === true);
check("빈 입력: 지표 null · provisional false", (() => {
  const empty = computeStudyMastery({});
  return empty.firstTryPct === null && empty.coveragePct === null && empty.stagesTotal === 0 && empty.provisional === false;
})());
check("채점 기록 0건 → 정답률·진도 모두 null", (() => {
  const none = computeStudyMastery({ a: { status: "in-progress" } });
  return none.firstTryPct === null && none.coveragePct === null && computeMasteryPct({ a: { status: "in-progress" } }) === null;
})());

// (e) 실데이터 회귀 — 학생 cmpavfoiq0001mm9sga30eupz / state cmrxolcg60002kz049uqgfszo.
//     DB masteryPct 스냅샷은 100 이었다. 오답 6문항이 진행 중이라는 이유로 사라졌기 때문이다.
const real = computeStudyMastery({
  reading: { status: "done" },
  "vocab-quiz": { status: "done", firstCorrect: 12, firstTotal: 12 },
  "vocab-match": { status: "in-progress", firstCorrect: 0, firstTotal: 4, answered: 4, total: 4 },
  exam: { status: "in-progress", firstCorrect: 0, firstTotal: 2, answered: 2, total: 5 },
});
check("회귀(실데이터): 첫 시도 정답률 67%", real.firstTryPct === 67);
check("회귀(실데이터): 진도 86%", real.coveragePct === 86);
check("회귀(실데이터): provisional true", real.provisional === true);
check("회귀(실데이터): 표본 12/18 · 18/21", real.firstCorrect === 12 && real.firstTotal === 18 && real.answered === 18 && real.totalItems === 21);

console.log(JSON.stringify({ passed, failures }));
`;

test("worksheet-study grade contract", () => {
  const tmpDir = path.join(repoRoot, "tests", ".tmp-worksheet-study");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".grade-harness.mts");
  let raw;
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } finally {
    rmSync(harnessPath, { force: true });
  }
  const lines = raw.trim().split(/\r?\n/);
  const result = JSON.parse(lines[lines.length - 1]);
  assert.deepEqual(result.failures, [], `실패한 검증: ${result.failures.join(", ")}`);
  // 하한을 실제 검증 수에 맞춰 올린다 — 단언이 조용히 빠지는 것을 잡기 위한 계기.
  assert.ok(result.passed >= 36, `검증 수가 비정상적으로 적습니다: ${result.passed}`);
});
