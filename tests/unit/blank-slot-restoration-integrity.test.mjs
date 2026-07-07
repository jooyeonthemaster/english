// 빈칸 슬롯 복원 무결성 게이트 3종 (26-07-06 검수 패널 FATAL 실측 대응).
// ① 주어 삼킴: 스팬이 주어 포함 완전절인데 선지가 술어뿐 (실측 cmr8gb2v0 — "In
//    addition to being a great scholar, ___" + "were/transcended/shunned..." 선지)
// ② 조동사 삼킴+동명사 주어: "Orienting ... winds ___" + 원형 선지 (실측 cmr7zsont)
// ③ 코퓰러 잔존+정동사 선지: "were probably ___" + "were..." 오답 (실측 cmr0isf0t)
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import quality from "@/lib/question-quality";
import generationConstants from "../src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts";

const { validateQuestionQuality } = quality;
const { RELAXED_BLOCKING_QUALITY_CODES, SALVAGE_RELAXABLE_CODES } = generationConstants;

const SLOT_CODES = [
  "blank-slot-subject-swallowed",
  "blank-slot-aux-agreement-broken",
  "blank-slot-double-verb-option",
];

function run(question, passage) {
  return validateQuestionQuality({
    typeId: "BLANK_INFERENCE",
    question,
    passage,
    requestedDifficulty: "KILLER",
  }).filter((i) => SLOT_CODES.includes(i.code));
}

const gricePassage =
  "Paul Grice was a famous philosopher of language. In addition to being a great scholar, he was excellent at cricket and chess.";

// [A] 실측 cmr8gb2v0 재현 — 주어 포함 완전절 스팬 + 술어 전용 선지 5개.
const subjectSwallowed = run({
  direction: "다음 글의 빈칸에 들어갈 말로 가장 적절한 것은?",
  blankAnswerMode: "PARAPHRASE",
  originalExpression: "he was excellent at cricket and chess",
  passageWithBlank:
    "Paul Grice was a famous philosopher of language. In addition to being a great scholar, _____.",
  options: [
    { label: "①", text: "were strictly confined to academic linguistics" },
    { label: "②", text: "were completely abandoned after his retirement in 1979" },
    { label: "③", text: "shunned any responsibility for social communications" },
    { label: "④", text: "transcended the boundaries of a single specialized discipline" },
    { label: "⑤", text: "were solely driven by professional rivalry" },
  ],
  correctAnswer: "④",
  explanation: "다재다능함을 종합하는 추상화.",
}, gricePassage);

// [A-pass] 같은 자리, 주어를 복원하는 완전절 선지 — 통과해야 한다.
const subjectRestoredPass = run({
  direction: "다음 글의 빈칸에 들어갈 말로 가장 적절한 것은?",
  blankAnswerMode: "PARAPHRASE",
  originalExpression: "he was excellent at cricket and chess",
  passageWithBlank:
    "Paul Grice was a famous philosopher of language. In addition to being a great scholar, _____.",
  options: [
    { label: "①", text: "his interests were strictly confined to academic linguistics" },
    { label: "②", text: "he abandoned his pursuits after his retirement in 1979" },
    { label: "③", text: "he shunned any responsibility for social communications" },
    { label: "④", text: "his pursuits transcended the boundaries of a single discipline" },
    { label: "⑤", text: "his research was solely driven by professional rivalry" },
  ],
  correctAnswer: "④",
  explanation: "다재다능함을 종합하는 추상화.",
}, gricePassage);

// [A-pass-2] 칭찬 문항(cmr8gcbp1) 골격 — 스팬이 코퓰러 시작(주어 미포함)이라
// "-ed+한정사" 시작 선지("laid the groundwork...")가 정당. 미발화 확인.
const copulaSpanPass = run({
  direction: "다음 글의 빈칸에 들어갈 말로 가장 적절한 것은?",
  blankAnswerMode: "PARAPHRASE",
  originalExpression: "was to the study of language and communication",
  passageWithBlank: "One of his greatest contributions _____. His article was foundational.",
  options: [
    { label: "①", text: "reshaped the entire discipline of philosophy through his teaching" },
    { label: "②", text: "laid the groundwork for a field of study through years of work" },
    { label: "③", text: "was shaped by the years of military service he completed" },
    { label: "④", text: "achieved the highest academic distinction available" },
    { label: "⑤", text: "reached its peak once he moved to the United States" },
  ],
  correctAnswer: "②",
  explanation: "업적 평가 주제문.",
}, "One of his greatest contributions was to the study of language and communication. His article was foundational.");

// [A-pass-3] 등위접속사 예외 — 빈칸 직전이 and 면 VP 등위로 무주어 선지 정당.
const coordinatorPass = run({
  direction: "다음 글의 빈칸에 들어갈 말로 가장 적절한 것은?",
  blankAnswerMode: "PARAPHRASE",
  originalExpression: "he was excellent at cricket and chess",
  passageWithBlank: "He was a great scholar and _____.",
  options: [
    { label: "①", text: "transcended the boundaries of a single discipline" },
    { label: "②", text: "shunned any responsibility for communications" },
    { label: "③", text: "abandoned the pursuit of games entirely" },
    { label: "④", text: "excelled at cricket and chess in his spare time" },
    { label: "⑤", text: "devoted himself to a single narrow field" },
  ],
  correctAnswer: "④",
  explanation: "등위 술어.",
}, "He was a great scholar and he was excellent at cricket and chess.");

// [B] 실측 cmr7zsont 재현 — 조동사 삼킴 + 동명사 주어 + 원형 선지 전원.
const auxAgreementBroken = run({
  direction: "다음 글의 빈칸에 들어갈 말로 가장 적절한 것은?",
  blankAnswerMode: "PARAPHRASE",
  originalExpression: "can help reduce the pressure imbalance behind the structure",
  passageWithBlank:
    "Orienting the building so that the longer face of the structure is parallel with prevailing winds _____ the pressure imbalance that forms behind it.",
  options: [
    { label: "①", text: "redirect the strongest gusts toward open plazas" },
    { label: "②", text: "amplify the turbulence around the corners" },
    { label: "③", text: "lower the visual profile of the tower" },
    { label: "④", text: "reduce the difference in wind pressure that develops" },
    { label: "⑤", text: "roughen the exterior surfaces of the building" },
  ],
  correctAnswer: "④",
  explanation: "압력 불균형 감소.",
}, "Orienting the building so that the longer face of the structure is parallel with prevailing winds can help reduce the pressure imbalance that forms behind it.");

// [B-pass] 3단수(-s) 시작 선지가 하나라도 있으면 집합이 성립 — 미발화.
const auxAgreementPass = run({
  direction: "다음 글의 빈칸에 들어갈 말로 가장 적절한 것은?",
  blankAnswerMode: "PARAPHRASE",
  originalExpression: "can help reduce the pressure imbalance behind the structure",
  passageWithBlank:
    "Orienting the building so that the longer face of the structure is parallel with prevailing winds _____ the pressure imbalance that forms behind it.",
  options: [
    { label: "①", text: "redirects the strongest gusts toward open plazas" },
    { label: "②", text: "amplifies the turbulence around the corners" },
    { label: "③", text: "lowers the visual profile of the tower" },
    { label: "④", text: "reduces the difference in wind pressure that develops" },
    { label: "⑤", text: "roughens the exterior surfaces of the building" },
  ],
  correctAnswer: "④",
  explanation: "압력 불균형 감소.",
}, "Orienting the building so that the longer face of the structure is parallel with prevailing winds can help reduce the pressure imbalance that forms behind it.");

// [B-pass-2] 분사 전치수식(쉼표 개입) — "Living in cities, people ___" 미발화.
const frontedParticiplePass = run({
  direction: "다음 글의 빈칸에 들어갈 말로 가장 적절한 것은?",
  blankAnswerMode: "PARAPHRASE",
  originalExpression: "can build stronger social networks",
  passageWithBlank: "Living in dense cities, people _____ through daily encounters.",
  options: [
    { label: "①", text: "build stronger social networks over time" },
    { label: "②", text: "lose touch with their extended families" },
    { label: "③", text: "avoid forming lasting relationships" },
    { label: "④", text: "develop tolerance for constant noise" },
    { label: "⑤", text: "spend more time commuting to work" },
  ],
  correctAnswer: "①",
  explanation: "도시 생활과 사회망.",
}, "Living in dense cities, people can build stronger social networks through daily encounters.");

// [C] 실측 cmr0isf0t 재현 — 코퓰러 잔존 + 정동사 시작 오답.
const doubleVerbOption = run({
  direction: "다음 글의 빈칸에 들어갈 말로 가장 적절한 것은?",
  blankAnswerMode: "PARAPHRASE",
  originalExpression: "somewhat unstable",
  passageWithBlank: "Archaeologists suspect that these groups were probably _____.",
  options: [
    { label: "①", text: "somewhat unstable" },
    { label: "②", text: "were unable to sustain permanent settlements" },
    { label: "③", text: "highly mobile across seasonal territories" },
    { label: "④", text: "had abandoned their coastal camps" },
    { label: "⑤", text: "dependent on maritime resources" },
  ],
  correctAnswer: "①",
  explanation: "집단의 불안정성.",
}, "Archaeologists suspect that these groups were probably somewhat unstable.");

// [C-pass] 전부 보어구 선지 — 미발화. (수동 보어 "misunderstood by many"도 정당)
const complementPass = run({
  direction: "다음 글의 빈칸에 들어갈 말로 가장 적절한 것은?",
  blankAnswerMode: "PARAPHRASE",
  originalExpression: "somewhat unstable",
  passageWithBlank: "Archaeologists suspect that these groups were probably _____.",
  options: [
    { label: "①", text: "somewhat unstable" },
    { label: "②", text: "unable to sustain permanent settlements" },
    { label: "③", text: "highly mobile across seasonal territories" },
    { label: "④", text: "misunderstood by many later scholars" },
    { label: "⑤", text: "dependent on maritime resources" },
  ],
  correctAnswer: "①",
  explanation: "집단의 불안정성.",
}, "Archaeologists suspect that these groups were probably somewhat unstable.");

console.log(JSON.stringify({
  subjectSwallowed: subjectSwallowed.map(i => i.code),
  subjectRestoredPass: subjectRestoredPass.map(i => i.code),
  copulaSpanPass: copulaSpanPass.map(i => i.code),
  coordinatorPass: coordinatorPass.map(i => i.code),
  auxAgreementBroken: auxAgreementBroken.map(i => i.code),
  auxAgreementPass: auxAgreementPass.map(i => i.code),
  frontedParticiplePass: frontedParticiplePass.map(i => i.code),
  doubleVerbOption: doubleVerbOption.map(i => i.code),
  complementPass: complementPass.map(i => i.code),
  relaxedRegistered: SLOT_CODES.every(c => RELAXED_BLOCKING_QUALITY_CODES.has(c)),
  notSalvageable: SLOT_CODES.every(c => !SALVAGE_RELAXABLE_CODES.has(c)),
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".blank-slot-restoration-harness.mts");
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

const result = runHarness();

test("[A] 주어 삼킴 + 술어 전용 선지 → 차단 (실측 cmr8gb2v0)", () => {
  assert.ok(result.subjectSwallowed.includes("blank-slot-subject-swallowed"), JSON.stringify(result.subjectSwallowed));
});

test("[A] 주어 복원 선지·코퓰러 스팬·등위접속사 예외 → 통과", () => {
  assert.deepEqual(result.subjectRestoredPass, []);
  assert.deepEqual(result.copulaSpanPass, []);
  assert.deepEqual(result.coordinatorPass, []);
});

test("[B] 조동사 삼킴 + 동명사 주어 + 원형 선지 전원 → 차단 (실측 cmr7zsont)", () => {
  assert.ok(result.auxAgreementBroken.includes("blank-slot-aux-agreement-broken"), JSON.stringify(result.auxAgreementBroken));
});

test("[B] -s 선지 존재·분사 전치수식(쉼표) → 통과", () => {
  assert.deepEqual(result.auxAgreementPass, []);
  assert.deepEqual(result.frontedParticiplePass, []);
});

test("[C] 코퓰러 잔존 + 정동사 시작 오답 → 차단 (실측 cmr0isf0t)", () => {
  assert.ok(result.doubleVerbOption.includes("blank-slot-double-verb-option"), JSON.stringify(result.doubleVerbOption));
});

test("[C] 보어구 선지(수동 보어 포함) → 통과", () => {
  assert.deepEqual(result.complementPass, []);
});

test("3종 코드는 RELAXED_BLOCKING(F급) 등재 + SALVAGE 비등재", () => {
  assert.equal(result.relaxedRegistered, true);
  assert.equal(result.notSalvageable, true);
});
