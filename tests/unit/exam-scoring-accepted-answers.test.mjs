import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// 서술형 자동채점 "허용 답안 집합 대조"(T8b) 계약 검증 — TS + `@/` 앨리어스라 tsx
// 하니스(exam-scoring-engine.test.mjs 패턴 미러). 계약(T8a 합의):
//  - structuredData.acceptedAnswers: string[] — WORD_ORDER/FILL_BLANK_KEY 최상위,
//    SUMMARY_COMPLETE blanks[] 각 원소, GRAMMAR_CORRECTION underlinedSegments[] 각 원소.
//  - 있으면 전부 허용 답안으로 채점, 없으면 기존 단일 모범답안만(무회귀).
//  - EXACT 비교의 유일한 관용 폭 = normalizeText(대소문자·다중공백·문말구두점·스마트
//    따옴표·NFC합성·폭0문자). 의미(철자·어순·내부구두점)는 절대 흡수하지 않는다.
// 특수문자(스마트따옴표·프라임·NBSP·폭0·NFC 분해형)는 하니스 내부에서 코드포인트로
// 명시 구성한다 — 소스 리터럴 혼동으로 인한 false-pass 를 원천 차단.
const harnessSource = `
import answerSpecMod from "@/lib/exam-scoring/answer-spec";
import gradeMod from "@/lib/exam-scoring/grade";
import normalizeMod from "@/lib/exam-scoring/normalize";
const { buildAnswerSpec } = answerSpecMod as unknown as typeof import("@/lib/exam-scoring/answer-spec");
const { gradeAnswer } = gradeMod as unknown as typeof import("@/lib/exam-scoring/grade");
const { normalizeText } = normalizeMod as unknown as typeof import("@/lib/exam-scoring/normalize");

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: unknown) {
  if (cond) passed += 1;
  else failures.push(name);
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ════════════════════════════════════════════════════════════════════════════
// (a) acceptedAnswers 다중 답안 채점 — 허용 집합의 어느 원소든 정답 처리
// ════════════════════════════════════════════════════════════════════════════

// ── WORD_ORDER (최상위 acceptedAnswers) — 순수 additive(모범 미포함 허용집합) ──
const woMulti = buildAnswerSpec({
  id: "wo-a", type: "SHORT_ANSWER", subType: "WORD_ORDER", points: 4,
  structuredData: {
    modelAnswer: "Not until yesterday did she realize the truth.",
    acceptedAnswers: [
      "She did not realize the truth until yesterday.",
      "Only yesterday did she realize the truth.",
    ],
  },
});
check("WO(a): answers 3개(모범+허용2)", woMulti.fields?.[0]?.answers?.length === 3);
check("WO(a): 모범답안 → CORRECT", gradeAnswer(woMulti, { texts: { answer: "Not until yesterday did she realize the truth." } }).status === "CORRECT");
check("WO(a): 허용답안1 → CORRECT", gradeAnswer(woMulti, { texts: { answer: "She did not realize the truth until yesterday" } }).status === "CORRECT");
check("WO(a): 허용답안2 → CORRECT", gradeAnswer(woMulti, { texts: { answer: "only yesterday did she realize the truth" } }).status === "CORRECT");
check("WO(a): 미허용 문장 → WRONG", gradeAnswer(woMulti, { texts: { answer: "Yesterday she realized the truth" } }).status === "WRONG");

// superset(acceptedAnswers 가 모범답안을 포함) → dedupe 로 중복 원문 1개 제거
const woSuperset = buildAnswerSpec({
  id: "wo-sup", type: "SHORT_ANSWER", subType: "WORD_ORDER", points: 4,
  structuredData: {
    modelAnswer: "Not until yesterday did she realize the truth.",
    acceptedAnswers: [
      "Not until yesterday did she realize the truth.", // == modelAnswer
      "She did not realize the truth until yesterday.",
    ],
  },
});
check("WO(a): superset dedupe → answers 2개(중복 원문 제거)", woSuperset.fields?.[0]?.answers?.length === 2);
check("WO(a): dedupe 후 전 원소 고유", new Set(woSuperset.fields?.[0]?.answers).size === woSuperset.fields?.[0]?.answers?.length);

// ── FILL_BLANK_KEY (최상위 acceptedAnswers) ──
const fbkMulti = buildAnswerSpec({
  id: "fbk-a", type: "SHORT_ANSWER", subType: "FILL_BLANK_KEY", points: 2,
  structuredData: { answer: "in spite of", acceptedAnswers: ["in spite of", "despite"] },
});
check("FBK(a): answers 2개", fbkMulti.fields?.[0]?.answers?.length === 2);
check("FBK(a): 모범 'in spite of' → CORRECT", gradeAnswer(fbkMulti, { texts: { answer: "In spite of" } }).status === "CORRECT");
check("FBK(a): 허용 'despite' → CORRECT", gradeAnswer(fbkMulti, { texts: { answer: "despite" } }).status === "CORRECT");
check("FBK(a): 'although' → WRONG", gradeAnswer(fbkMulti, { texts: { answer: "although" } }).status === "WRONG");

// answer 최상위가 비어도 acceptedAnswers 만으로 채점 필드 성립
const fbkOnlyAccepted = buildAnswerSpec({
  id: "fbk-b", type: "SHORT_ANSWER", subType: "FILL_BLANK_KEY", points: 2,
  structuredData: { answer: "", acceptedAnswers: ["nevertheless", "nonetheless"] },
});
check("FBK(a): answer 공백+acceptedAnswers만 → TEXT_SINGLE 성립", fbkOnlyAccepted.inputKind === "TEXT_SINGLE" && fbkOnlyAccepted.fields?.[0]?.answers?.length === 2);
check("FBK(a): acceptedAnswers만 채점 → CORRECT", gradeAnswer(fbkOnlyAccepted, { texts: { answer: "Nonetheless" } }).status === "CORRECT");

// ── SUMMARY_COMPLETE (blanks[] 각 원소 acceptedAnswers) ──
const scMulti = buildAnswerSpec({
  id: "sc-a", type: "SHORT_ANSWER", subType: "SUMMARY_COMPLETE", points: 6,
  structuredData: {
    blanks: [
      { label: "(A)", answer: "diversity", acceptedAnswers: ["diversity", "variety"] },
      { label: "(B)", answer: "resilience", acceptedAnswers: ["resilience", "robustness"] },
    ],
  },
});
check("SC(a): 2필드 각 answers 2개", scMulti.fields?.length === 2 && scMulti.fields?.[0]?.answers?.length === 2 && scMulti.fields?.[1]?.answers?.length === 2);
check("SC(a): 허용 조합(variety/robustness) → CORRECT 6점", (() => {
  const r = gradeAnswer(scMulti, { texts: { "(A)": "variety", "(B)": "robustness" } });
  return r.status === "CORRECT" && r.earnedPoints === 6;
})());
check("SC(a): 모범/허용 혼합(문말 마침표 흡수) → CORRECT", gradeAnswer(scMulti, { texts: { "(A)": "diversity", "(B)": "robustness." } }).status === "CORRECT");
check("SC(a): 한 빈칸만 허용 밖 → PARTIAL 3점", (() => {
  const r = gradeAnswer(scMulti, { texts: { "(A)": "variety", "(B)": "stability" } });
  return r.status === "PARTIAL" && r.earnedPoints === 3;
})());

// acceptedAnswers + acceptableVariants 공존 시 둘 다 허용
const scWithVariants = buildAnswerSpec({
  id: "sc-b", type: "SHORT_ANSWER", subType: "SUMMARY_COMPLETE", points: 4,
  structuredData: {
    blanks: [
      { label: "(A)", answer: "gives up", acceptedAnswers: ["quits"], acceptableVariants: ["surrenders"] },
    ],
  },
});
check("SC(a): answer+accepted+variants 전부 주입(3)", scWithVariants.fields?.[0]?.answers?.length === 3);
check("SC(a): variants 원소도 → CORRECT", gradeAnswer(scWithVariants, { texts: { "(A)": "surrenders" } }).status === "CORRECT");
check("SC(a): accepted 원소도 → CORRECT", gradeAnswer(scWithVariants, { texts: { "(A)": "quits" } }).status === "CORRECT");

// ── GRAMMAR_CORRECTION (underlinedSegments[] 각 원소 acceptedAnswers) ──
const gcMulti = buildAnswerSpec({
  id: "gc-a", type: "SHORT_ANSWER", subType: "GRAMMAR_CORRECTION", points: 4,
  structuredData: {
    underlinedSegments: [
      { label: "(A)", isError: true, correctedPart: "have been", acceptedAnswers: ["have been", "have worked"] },
      { label: "(B)", isError: true, correctedPart: "which", acceptedAnswers: ["which", "that"] },
    ],
  },
});
check("GC(a): 2필드 각 answers 2개", gcMulti.fields?.length === 2 && gcMulti.fields?.[0]?.answers?.length === 2 && gcMulti.fields?.[1]?.answers?.length === 2);
check("GC(a): 허용 조합 → CORRECT", gradeAnswer(gcMulti, { texts: { "seg-1": "have worked", "seg-2": "that" } }).status === "CORRECT");
check("GC(a): 1/2 허용 → PARTIAL 2점", gradeAnswer(gcMulti, { texts: { "seg-1": "have been", "seg-2": "who" } }).earnedPoints === 2);

// ════════════════════════════════════════════════════════════════════════════
// (b) acceptedAnswers 미존재 시 기존 동작 완전 동일(무회귀)
// ════════════════════════════════════════════════════════════════════════════

// WORD_ORDER — 단일 모범답안만, 정확히 [model]
const woNone = buildAnswerSpec({
  id: "wo-n", type: "SHORT_ANSWER", subType: "WORD_ORDER", points: 4,
  structuredData: { modelAnswer: "Not until yesterday did she realize the truth." },
});
check("WO(b): answers === [model] (단일)", eq(woNone.fields?.[0]?.answers, ["Not until yesterday did she realize the truth."]));
check("WO(b): 모범(대소문자·문말구두점 흡수) → CORRECT", gradeAnswer(woNone, { texts: { answer: "not until yesterday did she realize the truth" } }).status === "CORRECT");
check("WO(b): 타 문장 → WRONG", gradeAnswer(woNone, { texts: { answer: "she realized the truth yesterday" } }).status === "WRONG");

// FILL_BLANK_KEY — 단일
const fbkNone = buildAnswerSpec({
  id: "fbk-n", type: "SHORT_ANSWER", subType: "FILL_BLANK_KEY", points: 2,
  structuredData: { answer: "in spite of" },
});
check("FBK(b): answers === [answer] (단일)", eq(fbkNone.fields?.[0]?.answers, ["in spite of"]));
check("FBK(b): correctAnswer 컬럼 폴백 유지", (() => {
  const spec = buildAnswerSpec({ id: "fbk-n2", type: "SHORT_ANSWER", subType: "FILL_BLANK_KEY", points: 2, correctAnswer: "however", structuredData: {} });
  return eq(spec.fields?.[0]?.answers, ["however"]);
})());

// SUMMARY_COMPLETE — answer+variants 만(기존)
const scNone = buildAnswerSpec({
  id: "sc-n", type: "SHORT_ANSWER", subType: "SUMMARY_COMPLETE", points: 6,
  structuredData: { blanks: [
    { label: "(A)", answer: "diversity" },
    { label: "(B)", answer: "resilience", acceptableVariants: ["toughness"] },
  ]},
});
check("SC(b): (A) answers === [answer]", eq(scNone.fields?.[0]?.answers, ["diversity"]));
check("SC(b): (B) answers === [answer, ...variants]", eq(scNone.fields?.[1]?.answers, ["resilience", "toughness"]));
check("SC(b): 전부 정답(대소문자·공백·마침표 흡수) → 6점", gradeAnswer(scNone, { texts: { "(A)": "Diversity", "(B)": " resilience. " } }).earnedPoints === 6);

// GRAMMAR_CORRECTION — 단일
const gcNone = buildAnswerSpec({
  id: "gc-n", type: "SHORT_ANSWER", subType: "GRAMMAR_CORRECTION", points: 4,
  structuredData: { underlinedSegments: [
    { label: "(A)", isError: true, correctedPart: "have been" },
    { label: "(B)", isError: true, correctedPart: "which" },
  ]},
});
check("GC(b): seg-1 answers === [correctedPart]", eq(gcNone.fields?.[0]?.answers, ["have been"]));
check("GC(b): 전부 정답 → CORRECT", gradeAnswer(gcNone, { texts: { "seg-1": "have been", "seg-2": "which" } }).status === "CORRECT");
check("GC(b): accepted/answer 둘 다 없는 blank → 필드 드롭(무회귀)", (() => {
  const spec = buildAnswerSpec({ id: "sc-empty", type: "SHORT_ANSWER", subType: "SUMMARY_COMPLETE", points: 4, structuredData: { blanks: [ { label: "(A)", answer: "" }, { label: "(B)", answer: "x" } ] } });
  return spec.fields?.length === 1 && spec.fields?.[0]?.label === "(B)";
})());
// 무회귀 경계: answer 공백 + variants만(acceptedAnswers 부재) → 기존처럼 드롭.
check("SC(b): answer공백+variants만(accepted부재) → 블랭크 드롭(무회귀)", (() => {
  const spec = buildAnswerSpec({ id: "sc-vonly", type: "SHORT_ANSWER", subType: "SUMMARY_WRITING", points: 4, structuredData: { scoringMode: "VARIANTS", blanks: [ { label: "(A)", answer: "", acceptableVariants: ["x"] }, { label: "(B)", answer: "y" } ] } });
  return spec.fields?.length === 1 && spec.fields?.[0]?.label === "(B)";
})());
// 대비: answer 공백이어도 acceptedAnswers 있으면 유지(신규 계약).
check("SC(b): answer공백+acceptedAnswers → 블랭크 유지(신규)", (() => {
  const spec = buildAnswerSpec({ id: "sc-aonly", type: "SHORT_ANSWER", subType: "SUMMARY_COMPLETE", points: 4, structuredData: { blanks: [ { label: "(A)", answer: "", acceptedAnswers: ["x"] }, { label: "(B)", answer: "y" } ] } });
  return spec.fields?.length === 2;
})());

// ════════════════════════════════════════════════════════════════════════════
// (c) 정규화 경계 케이스 — 표면차 흡수 O, 의미 변형 흡수 X
// ════════════════════════════════════════════════════════════════════════════
const same = (a: string, b: string) => normalizeText(a) === normalizeText(b);
// 특수 문자는 코드포인트로 명시 구성(리터럴 혼동 방지 — 실제 U+ 값 테스트 보장).
const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const RSQUO = cp(0x2019);            // ' 스마트 작은따옴표(오른쪽)
const LDQUO = cp(0x201C);            // " 스마트 큰따옴표(왼쪽)
const RDQUO = cp(0x201D);            // " 스마트 큰따옴표(오른쪽)
const PRIME = cp(0x2032);            // 프라임(′) — 피트·분 표기, 따옴표로 매핑하지 않고 보존
const DPRIME = cp(0x2033);           // 이중프라임(″) — 인치·초 표기, 따옴표로 매핑하지 않고 보존
const NBSP = cp(0x00A0);             // 비분리 공백
const ZWSP = cp(0x200B);             // 폭 0 공백
const E_ACUTE = cp(0x00E9);          // é 합성형(단일 코드)
const E_COMBINING = cp(0x65, 0x0301); // e + 결합 악센트(분해형)

// 흡수해야 하는 표면차
check("norm(c): 대소문자", same("Despite", "despite"));
check("norm(c): 다중/선행/후행 공백", normalizeText("  a   b  ") === "a b");
check("norm(c): 문말 마침표", same("the answer.", "the answer"));
check("norm(c): 문말 구두점 다중(?!)", same("really?!", "really"));
check("norm(c): 문말 구두점 연속(...)", same("wait...", "wait"));
check("norm(c): 스마트 작은따옴표(U+2019)", same("don" + RSQUO + "t", "don't"));
check("norm(c): 스마트 큰따옴표(U+201C/D)", same(LDQUO + "yes" + RDQUO, '"yes"'));
check("norm(c): NFC 합성(U+00E9 vs e+U+0301)", same("caf" + E_ACUTE, "caf" + E_COMBINING));
check("norm(c): 테스트 유효성 — NFC 전 두 표현은 실제 상이", ("caf" + E_ACUTE) !== ("caf" + E_COMBINING));
check("norm(c): 폭0 문자(U+200B) 제거", same("ab" + ZWSP + "c", "abc"));
check("norm(c): NBSP(U+00A0) 공백 축약", same("a" + NBSP + "b", "a b"));

// 절대 흡수하면 안 되는 의미 변형
check("norm(c!): 철자 차이 보존(cat≠cats)", !same("cat", "cats"));
check("norm(c!): 어순/내용 보존(the cat≠cat)", !same("the cat", "cat"));
check("norm(c!): 내부 구두점 의미 보존(a,b≠ab)", !same("a,b", "ab"));
check("norm(c!): 내부 공백 의미 보존(ab≠a b)", !same("ab", "a b"));
check("norm(c!): 선행 구두점은 문말 아님 → 보존(.a≠a)", !same(".a", "a"));
check("norm(c!): 부정 축약 차이 보존(is≠isn't)", !same("is", "isn't"));
// 프라임(′)·이중프라임(″)은 따옴표로 매핑하지 않는다(피트·인치·분/초 의미 표기 보존 — 보수 원칙).
check("norm(c!): 프라임(U+2032) 미매핑 보존(o′clock≠o'clock)", !same("o" + PRIME + "clock", "o'clock"));
check("norm(c!): 이중프라임(U+2033) 미매핑 보존(5-inch 표기 보존)", !same("5" + DPRIME, '5"'));
check("norm(c!): 프라임 미제거(o′clock≠oclock)", !same("o" + PRIME + "clock", "oclock"));

// 채점 통합 경계: 스마트따옴표가 gradeAnswer 까지 관통(정답 스마트 vs 학생 직선)
const gcSurface = buildAnswerSpec({
  id: "gc-s", type: "SHORT_ANSWER", subType: "GRAMMAR_CORRECTION", points: 2,
  structuredData: { underlinedSegments: [ { label: "(A)", isError: true, correctedPart: "don" + RSQUO + "t" } ] },
});
check("norm(c): 채점관통 — 정답 스마트따옴표 vs 학생 직선따옴표 → CORRECT", gradeAnswer(gcSurface, { texts: { "seg-1": "Don't" } }).status === "CORRECT");

console.log(JSON.stringify({ passed, failures }));
`;

test("exam-scoring 허용 답안 집합(T8b) — 다중답안 채점·무회귀·정규화 경계", () => {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".exam-scoring-accepted-answers-harness.mts");
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
  const lastLine = raw.trim().split("\n").at(-1);
  const summary = JSON.parse(lastLine);
  assert.deepEqual(summary.failures, [], `실패 케이스: ${summary.failures?.join(" | ")}`);
  assert.ok(summary.passed >= 45, `통과 수 이상(${summary.passed})`);
});
