// KILLER 과훈련(over-drilled) 정답 craft 게이트 + 비표준 용어 렉시콘 재현 테스트
// (2026-07-06 소넷5 검수 패널 30문항 + 코퍼스 250행 실측).
//   임무1: findGrammarKillerOverdrilledAnswer — (a)one-of·(b)형/부-ly·(c)that/what·
//          (d)얕은 수일치. KILLER 에서만 발화, INTERMEDIATE/BASIC 미발화, 심층 통과.
//   임무2: findNonstandardGrammarTerminology — 전사구/보문명사/계사/술어부골격/통사적으로,
//          '관계사' 안의 '계사' 오탐 방어.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import grammarShared from "../src/lib/question-quality/validators/grammar/shared.ts";

const {
  findGrammarKillerOverdrilledAnswer,
  findGrammarTerminologyError,
  findGrammarTerminologyRegister,
  findNonstandardGrammarTerminology,
  isAdjectiveAdverbLySwap,
  isNumberAgreementFlip,
} = grammarShared;

// isError 마커를 만드는 헬퍼(expression=원형/정답, errorExpression=오류형).
const me = (expression, errorExpression, surroundingText) => ({
  isError: true,
  expression,
  errorExpression,
  correction: expression,
  surroundingText,
});

const overdrilled = {
  // (a) one of ... contributions were  (정답형 was, 오류형 were)
  oneOf: findGrammarKillerOverdrilledAnswer(
    me("was", "were", "One of the study's most important contributions was widely cited by later researchers"),
    undefined,
    "KILLER",
  ),
  // (b) importantly↔important
  adjAdvImportant: findGrammarKillerOverdrilledAnswer(
    me("important", "importantly", "this is an important factor in the whole model"),
    undefined,
    "KILLER",
  ),
  // (b) individually↔individual
  adjAdvIndividual: findGrammarKillerOverdrilledAnswer(
    me("individual", "individually", "each individual member was assessed on the same scale"),
    undefined,
    "KILLER",
  ),
  // (b) frequent↔frequently, be동사 조동사 앞(진행/수동)은 제외 안 됨 → 발화
  adjAdvFrequent: findGrammarKillerOverdrilledAnswer(
    me("frequently", "frequent", "the tool is frequently used across many schools"),
    undefined,
    "KILLER",
  ),
  // (c) that↔what
  thatWhat: findGrammarKillerOverdrilledAnswer(
    me("that", "what", "the fact that this is repeated so often is clear"),
    undefined,
    "KILLER",
  ),
  // (d) objects being measured really does exist  (정답형 do, 오류형 does)
  shallowAgreement: findGrammarKillerOverdrilledAnswer(
    me("do", "does", "objects being measured really do exist independently of us"),
    undefined,
    "KILLER",
  ),
};

const passes = {
  // (b) 계사 보어(심층) — seem + 형용사, 절 구조 분석 필요 → 통과
  linkingComplement: findGrammarKillerOverdrilledAnswer(
    me("happy", "happily", "the residents seem happy with the new recycling policy"),
    undefined,
    "KILLER",
  ),
  // (b) friendly 는 -ly 형용사(명사→형용사), 형/부 맞교환 아님 → 통과
  lyAdjective: findGrammarKillerOverdrilledAnswer(
    me("friend", "friendly", "the staff were friend to every visitor"),
    undefined,
    "KILLER",
  ),
  // (d) 진짜 장거리 수일치(관계절 개입) → 통과(정당한 KILLER)
  longDistanceAgreement: findGrammarKillerOverdrilledAnswer(
    me("do", "does", "objects that the instruments in the lab carefully measured really do exist"),
    undefined,
    "KILLER",
  ),
  // 수일치가 아닌 시제/무관 변형 → 통과
  unrelated: findGrammarKillerOverdrilledAnswer(
    me("increase", "increases", "prices increase steadily over the decade"),
    undefined,
    "KILLER",
  ),
};

// KILLER 이외 난이도 = 절대 미발화(자기게이트).
const difficultyGate = {
  intermediateAdjAdv: findGrammarKillerOverdrilledAnswer(
    me("important", "importantly", "this is an important factor in the whole model"),
    undefined,
    "INTERMEDIATE",
  ),
  basicThatWhat: findGrammarKillerOverdrilledAnswer(
    me("that", "what", "the fact that this is repeated so often is clear"),
    undefined,
    "BASIC",
  ),
  undefinedDifficulty: findGrammarKillerOverdrilledAnswer(
    me("was", "were", "One of the contributions was widely cited"),
    undefined,
    undefined,
  ),
};

// 헬퍼 단위 검증.
const helpers = {
  lySwapImportant: isAdjectiveAdverbLySwap("important", "importantly"),
  lySwapEasy: isAdjectiveAdverbLySwap("easy", "easily"),
  lySwapSimple: isAdjectiveAdverbLySwap("simple", "simply"),
  lySwapBasic: isAdjectiveAdverbLySwap("basic", "basically"),
  lySwapFriendly: isAdjectiveAdverbLySwap("friend", "friendly"),
  lySwapBothLy: isAdjectiveAdverbLySwap("quickly", "slowly"),
  agreeWasWere: isNumberAgreementFlip("was", "were"),
  agreeDoDoes: isNumberAgreementFlip("do", "does"),
  agreeRequires: isNumberAgreementFlip("require", "requires"),
  agreeTenseNo: isNumberAgreementFlip("is", "was"),
};

// 임무2 — 비표준 용어 렉시콘.
const terminology = {
  copula: findNonstandardGrammarTerminology("주어는 계사 be동사와 호응해야 한다."),
  prepPhrase: findNonstandardGrammarTerminology("이 표현은 전사구로 기능한다."),
  complementNoun: findNonstandardGrammarTerminology("보문 명사 the fact 뒤에 동격 that절이 온다."),
  predicateSkeleton: findNonstandardGrammarTerminology("이 문장의 술어부 골격이 무너졌다."),
  syntactically: findNonstandardGrammarTerminology("통사적으로 불가능한 배열이다."),
  multiple: findNonstandardGrammarTerminology("계사와 전사구가 함께 쓰였다."),
  // 오탐 방어: '관계사' 안의 '계사'는 걸리면 안 됨.
  relativePronoun: findNonstandardGrammarTerminology("관계사 that이 선행사 the report를 받는다."),
  accountant: findNonstandardGrammarTerminology("회계사는 재무제표의 일관성을 검토한다."),
  worldHistory: findNonstandardGrammarTerminology("세계사는 여러 지역의 교류를 함께 다룬다."),
  sexagenaryYear: findNonstandardGrammarTerminology("계사년은 2013년에 해당한다."),
  sexagenaryDay: findNonstandardGrammarTerminology("기록에는 계사일이라고 적혀 있다."),
  sexagenaryMonth: findNonstandardGrammarTerminology("문서에는 계사월로 기록됐다."),
  sexagenaryHour: findNonstandardGrammarTerminology("그 시각은 계사시로 적었다."),
  specialistNoncopular: findNonstandardGrammarTerminology("비계사 구문이라는 전문 용어를 피한다."),
  specialistSemicopula: findNonstandardGrammarTerminology("유사계사라는 전문 용어를 피한다."),
  specialistZeroCopula: findNonstandardGrammarTerminology("무계사절이라는 전문 용어를 피한다."),
  specialistQuasiCopula: findNonstandardGrammarTerminology("준계사라는 전문 용어를 피한다."),
  specialistYoungCopula: findNonstandardGrammarTerminology("영계사 같은 전문 용어는 학생용 해설에서 피한다."),
  specialistPseudoCopula: findNonstandardGrammarTerminology("의사계사 같은 전문 용어는 학생용 해설에서 피한다."),
  designer: findNonstandardGrammarTerminology("보험 설계사는 고객의 요구를 확인한다."),
  machineryHistory: findNonstandardGrammarTerminology("기계사는 산업 기술의 변화를 다룬다."),
  sexagenaryBorn: findNonstandardGrammarTerminology("그는 계사년생으로 기록되어 있다."),
  sexagenaryPillar: findNonstandardGrammarTerminology("명리학에서는 계사일주라고 부른다."),
  clean: findNonstandardGrammarTerminology("주격 관계대명사 that이 뒤 절의 주어 역할을 한다."),
  errorTerm: findGrammarTerminologyError("이 표현은 전사구로 기능한다."),
  errorIgnoresRegister: findGrammarTerminologyError("통사적으로 계사 뒤에 보어가 온다."),
  registerTerm: findGrammarTerminologyRegister("통사적으로 계사 뒤에 보어가 온다."),
  registerIgnoresError: findGrammarTerminologyRegister("이 표현은 전사구로 기능한다."),
};

console.log(JSON.stringify({ overdrilled, passes, difficultyGate, helpers, terminology }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".grammar-killer-overdrilled-harness.mts");
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

test("임무1 (a) one-of + plural subject verb-number flip is blocked at KILLER", () => {
  assert.ok(result.overdrilled.oneOf, JSON.stringify(result.overdrilled));
  assert.match(result.overdrilled.oneOf, /one\/each\/either\/neither of/);
});

test("임무1 (b) adjective↔adverb (-ly) swap is blocked at KILLER (importantly/individually/frequent)", () => {
  assert.ok(result.overdrilled.adjAdvImportant, "importantly↔important");
  assert.ok(result.overdrilled.adjAdvIndividual, "individually↔individual");
  assert.ok(result.overdrilled.adjAdvFrequent, "frequent↔frequently (after be-aux 'is ... used')");
  assert.match(result.overdrilled.adjAdvImportant, /adjective.adverb/i);
});

test("임무1 (c) that↔what swap is blocked at KILLER", () => {
  assert.ok(result.overdrilled.thatWhat, JSON.stringify(result.overdrilled));
  assert.match(result.overdrilled.thatWhat, /that .. what|that ↔ what/);
});

test("임무1 (d) shallow subject-verb agreement flip is blocked at KILLER", () => {
  assert.ok(result.overdrilled.shallowAgreement, JSON.stringify(result.overdrilled));
  assert.match(result.overdrilled.shallowAgreement, /shallow subject-verb/i);
});

test("임무1 false-positive defense: linking-verb complement (seem + adj) passes", () => {
  assert.equal(result.passes.linkingComplement, null);
});

test("임무1 false-positive defense: -ly adjective (friendly) is not an adj/adv swap", () => {
  assert.equal(result.passes.lyAdjective, null);
});

test("임무1 genuine long-distance agreement (relative clause) passes", () => {
  assert.equal(result.passes.longDistanceAgreement, null);
});

test("임무1 unrelated/tense mutation passes", () => {
  assert.equal(result.passes.unrelated, null);
});

test("임무1 KILLER-only: INTERMEDIATE/BASIC/undefined never fire", () => {
  assert.equal(result.difficultyGate.intermediateAdjAdv, null);
  assert.equal(result.difficultyGate.basicThatWhat, null);
  assert.equal(result.difficultyGate.undefinedDifficulty, null);
});

test("임무1 helpers: isAdjectiveAdverbLySwap exact X↔X+ly only", () => {
  assert.equal(result.helpers.lySwapImportant, true);
  assert.equal(result.helpers.lySwapEasy, true);
  assert.equal(result.helpers.lySwapSimple, true);
  assert.equal(result.helpers.lySwapBasic, true);
  assert.equal(result.helpers.lySwapFriendly, false, "friend↔friendly is noun→adjective, not adj/adv");
  assert.equal(result.helpers.lySwapBothLy, false, "quickly↔slowly are both -ly, not a pair");
});

test("임무1 helpers: isNumberAgreementFlip is number-only (not tense)", () => {
  assert.equal(result.helpers.agreeWasWere, true);
  assert.equal(result.helpers.agreeDoDoes, true);
  assert.equal(result.helpers.agreeRequires, true);
  assert.equal(result.helpers.agreeTenseNo, false, "is↔was is tense, not number");
});

test("임무2 nonstandard terminology (계사/전사구/보문명사/술어부골격/통사적으로) blocked with replacement", () => {
  assert.ok(result.terminology.copula);
  assert.match(result.terminology.copula, /be동사\/연결동사/);
  assert.ok(result.terminology.prepPhrase);
  assert.ok(result.terminology.complementNoun);
  assert.ok(result.terminology.predicateSkeleton);
  assert.ok(result.terminology.syntactically);
  assert.match(result.terminology.multiple, /계사/);
  assert.match(result.terminology.multiple, /전사구/);
});

test("임무2 false-positive defense: ordinary Korean words containing '계사' do not match the term", () => {
  assert.equal(result.terminology.relativePronoun, null);
  assert.equal(result.terminology.accountant, null);
  assert.equal(result.terminology.worldHistory, null);
  assert.equal(result.terminology.sexagenaryYear, null);
  assert.equal(result.terminology.sexagenaryDay, null);
  assert.equal(result.terminology.sexagenaryMonth, null);
  assert.equal(result.terminology.sexagenaryHour, null);
  assert.ok(result.terminology.specialistNoncopular);
  assert.ok(result.terminology.specialistSemicopula);
  assert.ok(result.terminology.specialistZeroCopula);
  assert.ok(result.terminology.specialistQuasiCopula);
  assert.ok(result.terminology.specialistYoungCopula);
  assert.ok(result.terminology.specialistPseudoCopula);
  assert.equal(result.terminology.designer, null);
  assert.equal(result.terminology.machineryHistory, null);
  assert.equal(result.terminology.sexagenaryBorn, null);
  assert.equal(result.terminology.sexagenaryPillar, null);
  assert.equal(result.terminology.clean, null);
});

test("임무2 actual terminology errors are split from accurate-but-specialist register", () => {
  assert.ok(result.terminology.errorTerm);
  assert.equal(result.terminology.errorIgnoresRegister, null);
  assert.ok(result.terminology.registerTerm);
  assert.equal(result.terminology.registerIgnoresError, null);
});
