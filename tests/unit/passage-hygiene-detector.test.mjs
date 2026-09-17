import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

// 지문 위생 감지기(src/lib/passage-hygiene.ts) 계약 — 26-09-08 실구매 학원 전수조사 후속.
// 핵심 계약 2개:
//   (1) 번호만 있는 줄·(A) x / y 선택지·빈칸·하이픈 절단 = dirty (민쌤 8/27~31 반려 8건 재현)
//   (2) 문장 중간 줄바꿈만 있는 지문은 clean — 성공 지문의 52% 가 그 형태였다(오탐 금지)

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
// .mts 하네스에서 "@/" 모듈은 기본 임포트로 받는다(antonym-contract 와 동일 — 명명 임포트는 interop 에 막힌다).
import hyg from "@/lib/passage-hygiene";
const { analyzePassageHygiene, passageHygieneAdvice } = hyg;

const dirtyWorksheet = [
  "3",
  "We all understand differently this much is obvious. The reason we understand",
  "differently is that",
  "Our experiences simply are not",
  "yours. Schank and Abelson claimed that understanding required one to find the",
  "correct knowledge structure, and (A) using / to use that structure to create",
  "expectations for what events were likely to take place.",
].join("\\n");

const cleanParagraph =
  "Today the writing of code is no longer confined to the separate dimension of 'cyberspace.' We live among smart objects that decide for us, and the decisions are made in advance by programmers.";

const hardWrappedClean = [
  "Today the writing of code is no longer confined to the separate dimension",
  "of cyberspace. We live among smart objects that decide for us, and the",
  "decisions are made in advance by programmers who never meet the people",
  "affected by them. This is why the ethics of code matters so much today.",
].join("\\n");

const hyphenBroken = "People are cutting down forests much faster than the rate at which forests can re-\\ngrow, and the consequences are visible.";

const koreanMixed = cleanParagraph + " " + cleanParagraph + " 오늘날 코드 작성은 더 이상 사이버 공간이라는 별개의 차원에 국한되지 않는다.";

const out = {
  dirty: analyzePassageHygiene(dirtyWorksheet),
  clean: analyzePassageHygiene(cleanParagraph),
  hardWrapped: analyzePassageHygiene(hardWrappedClean),
  hyphen: analyzePassageHygiene(hyphenBroken),
  korean: analyzePassageHygiene(koreanMixed),
  empty: analyzePassageHygiene(""),
  adviceDirty: passageHygieneAdvice(dirtyWorksheet),
  adviceClean: passageHygieneAdvice(cleanParagraph),
};
console.log(JSON.stringify(out));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".passage-hygiene-harness.mts");
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

const r = runHarness();

test("학습지 붙여넣기(번호 줄 + (A) x / y 선택지)는 dirty 로 잡힌다", () => {
  assert.equal(r.dirty.level, "dirty");
  const codes = r.dirty.issues.map((i) => i.code);
  assert.ok(codes.includes("NUMBER_LINES"), codes.join(","));
  assert.ok(codes.includes("CHOICE_SLASH"), codes.join(","));
  assert.match(r.dirty.summary, /^지문 정리 필요 — /);
});

test("깨끗한 한 문단 지문은 clean", () => {
  assert.equal(r.clean.level, "clean");
  assert.equal(r.clean.issues.length, 0);
  assert.equal(r.clean.summary, "");
});

test("문장 중간 줄바꿈만 있는 지문은 clean (성공 지문 52% 가 이 형태 — 오탐 금지)", () => {
  assert.equal(r.hardWrapped.level, "clean", JSON.stringify(r.hardWrapped));
});

test("단어 중간 하이픈 절단(re-\\ngrow)은 dirty", () => {
  assert.equal(r.hyphen.level, "dirty");
  assert.ok(r.hyphen.issues.some((i) => i.code === "HYPHEN_BREAK"));
});

test("한글 섞임만 있으면 warn 수준(정리 필요 아님)", () => {
  assert.equal(r.korean.level, "warn");
  assert.equal(r.korean.dirty, false);
  assert.match(r.korean.summary, /^확인 필요 — 한글 섞임/);
});

test("빈 지문은 clean", () => {
  assert.equal(r.empty.level, "clean");
});

test("실패 문구용 안내는 dirty 에만 붙는다", () => {
  assert.equal(typeof r.adviceDirty, "string");
  assert.match(r.adviceDirty, /번호만 있는 줄/);
  assert.match(r.adviceDirty, /원문 대조 검사/);
  assert.equal(r.adviceClean, null);
});
