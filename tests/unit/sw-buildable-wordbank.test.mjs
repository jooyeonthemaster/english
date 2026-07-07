// SW/TSW-cloze 정답 조립 가능성 F급 게이트 — 실측 재현 테스트 (26-07-06).
//
// FATAL(w9dsc1, cmr80jfnr004umm2g92w9dsc1): 정답 "(A) confusing the wind's flow
//   pattern along the building's surface"에 필요한 "along"이 [보기]에 없고 "the"가 2회
//   필요한데 칩엔 1개뿐 → 학생이 [보기]만으로 정답을 조립할 수 없다(채점 불능급 F).
// 신규 게이트: sw-answer-not-buildable-from-wordbank / tsw-answer-not-buildable-from-wordbank.
//   WORD_ORDER word-order-unreconstructable 미러. 어형변화·미끼 초과·대체정답은 정상.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import swMod from "@/lib/question-quality/validators/summary/writing";
import tswMod from "@/lib/question-quality/validators/topic-sentence/writing";

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed += 1;
  else failures.push(name);
}

function runSW(q: Record<string, unknown>) {
  const codes: { sev: string; code: string }[] = [];
  const msgs: Record<string, string> = {};
  swMod.validateSummaryWritingQuestion(q, (sev, code, msg) => {
    codes.push({ sev, code });
    msgs[code] = msg;
  });
  return { codes, msgs };
}
function runTSW(q: Record<string, unknown>) {
  const codes: { sev: string; code: string }[] = [];
  const msgs: Record<string, string> = {};
  tswMod.validateTopicSentenceWritingQuestion(q, (sev, code, msg) => {
    codes.push({ sev, code });
    msgs[code] = msg;
  });
  return { codes, msgs };
}
const has = (r: { codes: { code: string }[] }, code: string) =>
  r.codes.some((c) => c.code === code);
const errorCodes = (r: { codes: { sev: string; code: string }[] }) =>
  r.codes.filter((c) => c.sev === "error").map((c) => c.code);

const SW_CODE = "sw-answer-not-buildable-from-wordbank";
const TSW_CODE = "tsw-answer-not-buildable-from-wordbank";

// ── 단위: wordBankChipCoversAnswerToken ──────────────────────────────────────
const cover = swMod.wordBankChipCoversAnswerToken;
check("cover: confuses→confusing (내용어 어간 어형변화)", cover("confusing", "confuses") === true);
check("cover: make→making (묵음 e 굴절)", cover("making", "make") === true);
check("cover: building's←building (소유격 관대)", cover("building's", "building") === true);
check("cover: predict→prediction (파생 접두)", cover("prediction", "predict") === true);
check("cover: the=the (정확)", cover("the", "the") === true);
check("cover: the≠then (기능어 정확일치만)", cover("the", "then") === false);
check("cover: along≠alone (기능어 정확일치만)", cover("along", "alone") === false);
check("cover: color↔colors (내용어 어간)", cover("colors", "color") === true);

// ── 단위: findUnbuildableWordBankBlanks (w9dsc1 칩·정답) ──────────────────────
const w9Chips = ["confuses","the","wind's","separation","pattern","flow","disturb","predictable","confusion","building's","surface"];
const w9Answer = "confusing the wind's flow pattern along the building's surface";
const directDefects = swMod.findUnbuildableWordBankBlanks(w9Chips, [
  { label: "(A)", candidates: [w9Answer] },
]);
check("direct: w9dsc1 조립 불가 결함 1건", directDefects.length === 1);
check(
  "direct: 부족 토큰에 along·the 포함",
  directDefects.length === 1 &&
    directDefects[0].missing.includes("along") &&
    directDefects[0].missing.includes("the"),
);

// ── 통합: SUMMARY_WRITING ────────────────────────────────────────────────────
// (1) FATAL w9dsc1 — 게이트가 차단해야 한다.
const w9Summary =
  "Because their cost-driven flat shapes make skyscrapers prone to the dangerous wind forces created by vortex shedding, architects rely on various surface and orientation tricks that work by (A) , thereby reducing the risk of hazardous swaying.";
const w9Model =
  "Because their cost-driven flat shapes make skyscrapers prone to the dangerous wind forces created by vortex shedding, architects rely on various surface and orientation tricks that work by confusing the wind's flow pattern along the building's surface, thereby reducing the risk of hazardous swaying.";
const swFatal = runSW({
  subType: "SUMMARY_WRITING",
  direction: "다음 글의 요약문 빈칸 (A)에 들어갈 말을 [보기]에서 필요한 단어만 골라 (필요시 어형을 바꿔) 영작하시오.",
  summaryWithBlanks: w9Summary,
  blanks: [{ label: "(A)", answer: w9Answer }],
  modelAnswer: w9Model,
  wordBank: w9Chips,
  wordBankPolicy: "usePartial",
  wordBankDistractors: ["separation", "disturb", "predictable", "confusion"],
});
check("SW FATAL: 조립불가 코드 발화", has(swFatal, SW_CODE));
check(
  "SW FATAL: 메시지에 along·the 부족 명시",
  (swFatal.msgs[SW_CODE] ?? "").includes('"along"') &&
    (swFatal.msgs[SW_CODE] ?? "").includes('"the"'),
);

// (2) 정상(조립 가능 + 미끼 초과 + 어형변화) — 무발화, 에러 0(무회귀·거짓양성 없음).
const swClean = runSW({
  subType: "SUMMARY_WRITING",
  direction: "다음 글의 요약문 빈칸 (A)에 들어갈 말을 [보기]에서 골라 영작하시오.",
  summaryWithBlanks: "The study shows that risk grows by (A), thereby reducing accuracy.",
  blanks: [{ label: "(A)", answer: "increasing the sample bias" }],
  modelAnswer: "The study shows that risk grows by increasing the sample bias, thereby reducing accuracy.",
  wordBank: ["increase", "the", "sample", "bias", "noise", "reducing"],
  wordBankPolicy: "usePartial",
  wordBankDistractors: ["noise", "reducing"],
});
check("SW 정상: 조립불가 코드 무발화", !has(swClean, SW_CODE));
check("SW 정상: 에러 코드 0(거짓양성·무회귀)", errorCodes(swClean).length === 0);

// (3) "the"×2 필요 — 칩 2개면 통과.
const swDupOk = runSW({
  subType: "SUMMARY_WRITING",
  direction: "[보기]에서 골라 영작하시오.",
  summaryWithBlanks: "It notes that (A) matters most here.",
  blanks: [{ label: "(A)", answer: "the risk of the bias" }],
  modelAnswer: "It notes that the risk of the bias matters most here.",
  wordBank: ["the", "the", "risk", "of", "bias", "noise"],
});
check("SW the×2 충족(칩 2개): 무발화", !has(swDupOk, SW_CODE));

// (4) "the"×2 필요 — 칩 1개면 부족(발화, 메시지 the).
const swDupShort = runSW({
  subType: "SUMMARY_WRITING",
  direction: "[보기]에서 골라 영작하시오.",
  summaryWithBlanks: "It notes that (A) matters most here.",
  blanks: [{ label: "(A)", answer: "the risk of the bias" }],
  modelAnswer: "It notes that the risk of the bias matters most here.",
  wordBank: ["the", "risk", "of", "bias", "noise"],
});
check("SW the×2 부족(칩 1개): 발화", has(swDupShort, SW_CODE));
check("SW the×2 부족: 메시지에 the", (swDupShort.msgs[SW_CODE] ?? "").includes('"the"'));

// (5) 소유격/구두점 에지 — 칩 "building"(무 's)이 정답 "building's" 공급 → 통과.
const swPoss = runSW({
  subType: "SUMMARY_WRITING",
  direction: "[보기]에서 골라 영작하시오.",
  summaryWithBlanks: "Engineers focus on (A) to cut sway.",
  blanks: [{ label: "(A)", answer: "the building's surface" }],
  modelAnswer: "Engineers focus on the building's surface to cut sway.",
  wordBank: ["the", "building", "surface", "roof"],
});
check("SW 소유격 관대(building→building's): 무발화", !has(swPoss, SW_CODE));

// (6) 대체정답(acceptableVariants) 구제 — 하나라도 조립 가능하면 통과.
const swVariant = runSW({
  subType: "SUMMARY_WRITING",
  direction: "[보기]에서 골라 영작하시오.",
  summaryWithBlanks: "They work by (A) around the tower.",
  blanks: [
    {
      label: "(A)",
      answer: "confusing the wind",
      acceptableVariants: ["disrupting the wind"],
    },
  ],
  modelAnswer: "They work by disrupting the wind around the tower.",
  wordBank: ["disrupting", "the", "wind", "flow"],
});
check("SW 대체정답 구제(disrupting 조립가능): 무발화", !has(swVariant, SW_CODE));

// (7) wordBank 없는(자유 영작) SW — 게이트 스킵(무회귀).
const swNoBank = runSW({
  subType: "SUMMARY_WRITING",
  direction: "요약문 빈칸을 영작하시오.",
  summaryWithBlanks: "They work by (A) around the tower.",
  blanks: [{ label: "(A)", answer: "confusing the wind along the tower" }],
  modelAnswer: "They work by confusing the wind along the tower.",
});
check("SW wordBank 없음: 게이트 스킵", !has(swNoBank, SW_CODE));

// ── 통합: TOPIC_SENTENCE_WRITING cloze (미러) ─────────────────────────────────
const tswFatal = runTSW({
  subType: "TOPIC_SENTENCE_WRITING",
  mode: "cloze",
  direction: "주제문 빈칸 (A)를 [보기]에서 골라 영작하시오.",
  summaryWithBlanks: w9Summary,
  blanks: [{ label: "(A)", answer: w9Answer }],
  modelAnswer: w9Model,
  wordBank: w9Chips,
});
check("TSW cloze FATAL: 조립불가 코드 발화", has(tswFatal, TSW_CODE));
check(
  "TSW cloze FATAL: 메시지에 along·the",
  (tswFatal.msgs[TSW_CODE] ?? "").includes('"along"') &&
    (tswFatal.msgs[TSW_CODE] ?? "").includes('"the"'),
);

const tswClean = runTSW({
  subType: "TOPIC_SENTENCE_WRITING",
  mode: "cloze",
  direction: "주제문 빈칸 (A)를 [보기]에서 골라 영작하시오.",
  summaryWithBlanks: "The paper argues that progress depends on (A) over time.",
  blanks: [{ label: "(A)", answer: "increasing the sample size" }],
  modelAnswer: "The paper argues that progress depends on increasing the sample size over time.",
  wordBank: ["increase", "the", "sample", "size", "noise", "reducing"],
});
check("TSW cloze 정상: 무발화", !has(tswClean, TSW_CODE));

// TSW scrambled 모드는 wordBank cloze 게이트 대상 아님(무발화).
const tswScrambled = runTSW({
  subType: "TOPIC_SENTENCE_WRITING",
  mode: "scrambled",
  direction: "제시어를 배열하시오.",
  scrambledWords: ["progress", "depends", "on", "the", "sample"],
  modelAnswer: "Progress depends on the sample.",
});
check("TSW scrambled: cloze 게이트 무발화", !has(tswScrambled, TSW_CODE));

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".sw-buildable-wordbank-harness.mts");
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

test("SW/TSW 정답 조립 가능성 게이트: w9dsc1 차단 + 정상통과 + 에지", () => {
  assert.equal(
    summary.failed,
    0,
    `sw-buildable-wordbank failures: ${JSON.stringify(summary.failures)}`,
  );
  assert.ok(summary.passed >= 20, `expected >=20 checks, got ${summary.passed}`);
});
