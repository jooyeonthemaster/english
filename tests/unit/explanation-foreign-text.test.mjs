// 해설 외국문자 오염 결정형 게이트(O188/O189) 회귀:
// ① 실측 오염 2건(중문 连接·영단어 steals다)을 정확히 잡고
// ② 정상 해설(영어 지문 인용·조사 접합·라벨 인용)에 무발화하며
// ③ 두 코드가 RELAXED_BLOCKING 에 등재돼 전 레인 차단인지 검증한다.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = String.raw`
import validatorModule from "@/lib/question-quality/validators/explanation-foreign-text";
import constants from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants";
const { validateExplanationForeignText } = validatorModule;
const {
  RELAXED_BLOCKING_QUALITY_CODES,
  SALVAGE_RELAXABLE_CODES,
  GRAMMAR_SCARCE_RELAXABLE_CODES,
} = constants;

function run(question) {
  const issues = [];
  validateExplanationForeignText(question, (severity, code, message) =>
    issues.push({ severity, code, message }),
  );
  return issues;
}

const report = {
  // 실측 1: O188 빈칸36 — 중문 혼입.
  cjkHit: run({
    explanation:
      "본문은 그 방화가 없애려던 덤불 성장을 오히려 강화했다고 하고, 탄 자리에 풀이 먼저 와도 곧 목본·관목이 뒤따른다고 连接한다.",
  }),
  // 실측 2: O189 빈칸37 — 영단어 짜깁기.
  latinJamHit: run({
    explanation:
      "따라서 빈칸에는 전달자가 아니라 직원 사이 지속적 지식 교류를 북돋는 지원자가 되어야 한다는 뜻이 들어 steals다.",
  }),
  // 오답해설 필드에서도 잡는가.
  wrongOptionHit: run({
    explanation: "정상 해설입니다.",
    wrongOptionExplanations: { "2": "이 선지는 인과를 뒤집었다고 說明한다." },
  }),
  // 정상 해설 — 영어 인용·조사 직접 접합("to에"·"and로"·"that이다")·대문자 라벨은 무발화.
  cleanKorean: run({
    explanation:
      "be able to에 묶인 think와 and로 연결된 understand는 둘 다 동사원형으로 병렬되어야 한다. 'understanding'는 현재분사여서 정답은 that이다.",
    keyPoints: [
      "(E) 정동사 vs 준동사 — be able to 뒤 병렬 판정",
      "선행사 'subject matter'를 수식하는 주격 관계대명사 that",
    ],
    wrongOptionExplanations: {
      "(B)": "주어의 핵이 복수 명사인 'Feelings'이므로 복수 동사 carry가 옳습니다.",
    },
  }),
  // 종결어미가 아닌 라틴+한글 접합("system이다")은 무발화.
  cleanIda: run({ explanation: "이 구조의 핵심은 feedback system이다." }),
  // 괄호 한자 병기 관례("공(功)")는 허용 — DB 800 스캔의 유일 FP 클래스.
  cleanHanjaAnnotation: run({
    explanation: "그 변화의 공(功)이 당신에게 있다는 내용입니다. 서학(西學) 서적과 무관합니다.",
  }),
  // 일본어 가나 혼입("논지から") — DB 잠복 실결함(TITLE) 재현 검출.
  kanaHit: run({
    explanation: "비교 분석이라는 핵심 논지から 벗어난 너무 좁은 선택지입니다.",
  }),
  lanes: {
    foreignScript: {
      inRelaxedBlocking: RELAXED_BLOCKING_QUALITY_CODES.has("explanation-foreign-script"),
      inSalvage: SALVAGE_RELAXABLE_CODES.has("explanation-foreign-script"),
      inScarce: GRAMMAR_SCARCE_RELAXABLE_CODES.has("explanation-foreign-script"),
    },
    latinJam: {
      inRelaxedBlocking: RELAXED_BLOCKING_QUALITY_CODES.has("explanation-latin-jam"),
      inSalvage: SALVAGE_RELAXABLE_CODES.has("explanation-latin-jam"),
      inScarce: GRAMMAR_SCARCE_RELAXABLE_CODES.has("explanation-latin-jam"),
    },
  },
};
process.stdout.write(JSON.stringify(report));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".explanation-foreign-text-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`node node_modules/tsx/dist/cli.mjs "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    rmSync(harnessPath, { force: true });
  }
}

const report = runHarness();

test("실측 오염: 중문 혼입(连接)을 explanation-foreign-script error 로 잡는다", () => {
  assert.equal(report.cjkHit.length, 1, JSON.stringify(report.cjkHit));
  assert.equal(report.cjkHit[0].code, "explanation-foreign-script");
  assert.equal(report.cjkHit[0].severity, "error");
});

test("실측 오염: 영단어 짜깁기(steals다)를 explanation-latin-jam error 로 잡는다", () => {
  assert.equal(report.latinJamHit.length, 1, JSON.stringify(report.latinJamHit));
  assert.equal(report.latinJamHit[0].code, "explanation-latin-jam");
  assert.equal(report.latinJamHit[0].severity, "error");
});

test("오답해설 필드의 한자 혼입(說明)도 잡는다", () => {
  assert.equal(report.wrongOptionHit.length, 1, JSON.stringify(report.wrongOptionHit));
  assert.equal(report.wrongOptionHit[0].code, "explanation-foreign-script");
  assert.ok(report.wrongOptionHit[0].message.includes("wrongOptionExplanations"));
});

test("정상 해설(영어 인용·조사 접합·'이다'·괄호 한자 병기)에는 무발화 — FP 0", () => {
  assert.deepEqual(report.cleanKorean, [], JSON.stringify(report.cleanKorean));
  assert.deepEqual(report.cleanIda, [], JSON.stringify(report.cleanIda));
  assert.deepEqual(
    report.cleanHanjaAnnotation,
    [],
    JSON.stringify(report.cleanHanjaAnnotation),
  );
});

test("일본어 가나 혼입(논지から)을 explanation-foreign-script 로 잡는다 — DB 잠복 결함 재현", () => {
  assert.equal(report.kanaHit.length, 1, JSON.stringify(report.kanaHit));
  assert.equal(report.kanaHit[0].code, "explanation-foreign-script");
});

test("두 코드 모두 RELAXED_BLOCKING 등재 + SALVAGE/SCARCE 미등재 (전 레인 F급 차단)", () => {
  for (const key of ["foreignScript", "latinJam"]) {
    assert.equal(report.lanes[key].inRelaxedBlocking, true, key);
    assert.equal(report.lanes[key].inSalvage, false, key);
    assert.equal(report.lanes[key].inScarce, false, key);
  }
});
