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
const harnessSource = `
import gradeMod from "@/lib/worksheet-study/grade";
const { normalizeEn, gradeTyped, gradeOrder, gradeCloze, diffWords, selfGradeScore, accumulateWeakness, computeMasteryPct } = gradeMod as any;

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

check("숙달도: 가중 평균", computeMasteryPct({
  a: { status: "done", firstCorrect: 8, firstTotal: 10 },
  b: { status: "done", firstCorrect: 2, firstTotal: 10 },
  c: { status: "in-progress", firstCorrect: 0, firstTotal: 10 },
}) === 50);
check("숙달도: 완료 없음 → null", computeMasteryPct({ a: { status: "in-progress" } }) === null);

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
  assert.ok(result.passed >= 20, `검증 수가 비정상적으로 적습니다: ${result.passed}`);
});
