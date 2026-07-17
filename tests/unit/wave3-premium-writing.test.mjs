import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// Wave-3 TIMEOUT-RCA (26-07-05 실측):
// sonnet-5(OpenRouter) strict json_schema 구조화 출력이 SUMMARY_WRITING /
// TOPIC_SENTENCE_WRITING 봉투(옵션·enum 필드 20여 개)에서 스키마 기인으로 전멸 —
//  (i) 응답 없이 180s abort (A/B 프로브: 동일 미니 프롬프트 trivial 스키마 8s OK
//      vs SW/TSW 봉투 90s abort),
//  (ii) 또는 OpenRouter 가 업스트림 400 을
//      {"error":{"message":"Provider returned error","code":400}} 로 감싸 200 에
//      흘리는 masked 400 (grammar-too-large 검출기가 못 잡아 폴백 미발동).
// 수정 계약:
//  A) PREMIUM + SW/TSW 는 strict 호출을 생략하고 프롬프트 인라인 JSON 모드로
//     직행한다(forceJsonFallback 라우팅 — 원 생성 + SHIP-FIRST repair 둘 다).
//  B) masked 400 은 grammar-too-large 와 동일하게 결정론 오류로 보고 JSON 폴백을
//     발동한다(isMaskedProviderBadRequestError).

// ── (1) 행동 검증: isMaskedProviderBadRequestError (순수 함수, tsx 하니스) ──
const harnessSource = `
import llmMod from "@/lib/question-generation-llm";
const { isMaskedProviderBadRequestError } = llmMod;
import tswMod from "@/lib/topic-sentence-writing";
const { chipsAreInAnswerOrder, reorderChipsAwayFromAnswer, topicBlankAnswerSequence } = tswMod;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed += 1;
  else failures.push(name);
}

// 26-07-05 실측 형태: AI_APICallError(status=200) + responseBody 에 masked 400.
const observed = Object.assign(new Error("Invalid JSON response"), {
  name: "AI_APICallError",
  statusCode: 200,
  responseBody: ' {"error":{"message":"Provider returned error","code":400}}',
});
check("masked 400 (observed shape) → true", isMaskedProviderBadRequestError(observed) === true);

// cause 체인 깊숙이 묻혀도 검출(summarizeProviderError 가 cause 를 걷는다).
const nested = Object.assign(new Error("wrapper"), {
  cause: Object.assign(new Error("inner"), {
    responseBody: '{"error":{"message":"Provider returned error","code":400}}',
  }),
});
check("masked 400 (nested cause) → true", isMaskedProviderBadRequestError(nested) === true);

// 비-400 provider 오류는 재시도 가치가 있다 — 폴백 발동 금지.
const transient = Object.assign(new Error("Provider returned error"), {
  responseBody: '{"error":{"message":"Provider returned error","code":502}}',
});
check("provider error 502 → false", isMaskedProviderBadRequestError(transient) === false);

// 일반 timeout/abort 는 해당 없음.
check("plain abort → false", isMaskedProviderBadRequestError(new Error("The operation was aborted due to timeout")) === false);

// 400 이라도 masked provider 문구가 없으면(다른 검출기 소관) 해당 없음.
const plain400 = Object.assign(new Error("Bad Request"), {
  responseBody: '{"error":{"message":"compiled grammar is too large","code":400}}',
});
check("grammar-too-large 400 → false (별도 검출기 소관)", isMaskedProviderBadRequestError(plain400) === false);

// ── 칩 어순 판정 무진행-매치 수정 (TSW KILLER 전멸의 2차 진범) ──
// 26-07-05 실측 탈락 후보: KILLER 보기(fidelity=inflected)는 설계상 같은 어간의
// 근사중복 칩을 여럿 담는다. 종전 >= 탐욕은 같은 정답 위치의 재매치를 진행으로
// 세어 어떤 순열이든 coverage 1.0 → reorder 탈출 불가 → 게이트 결정론 전멸.
const capturedBank = ["absolute","practical","practice","dominant","practices","dominates","historic","hierarchy","artistic","dominance"];
const capturedRef = topicBlankAnswerSequence({
  blanks: [
    { label: "(A)", answer: "an absolute dominance" },
    { label: "(B)", answer: "artistic practices" },
  ],
});
check(
  "inflected 근사중복 칩 뱅크가 무순열 자동-누수 판정되지 않는다",
  chipsAreInAnswerOrder(capturedBank, capturedRef) === false,
);
const reshuffled = reorderChipsAwayFromAnswer(capturedBank, capturedRef);
check(
  "reorder 결과는 게이트 판정으로 어순 누수가 아니다(탈출 보장 계약)",
  chipsAreInAnswerOrder(reshuffled, capturedRef) === false,
);
check(
  "reorder 는 칩 불변(내용 동일, 순서만 변경)",
  [...reshuffled].sort().join("|") === [...capturedBank].sort().join("|"),
);
// 진짜 어순 누수(서로 다른 정답 위치의 증가 사슬)는 여전히 잡힌다.
check(
  "genuine 어순 누수는 여전히 flagged",
  chipsAreInAnswerOrder(["absolute", "dominance", "artistic", "practices"], capturedRef) === true,
);

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".wave3-premium-writing-harness.mts");
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

test("W3-TIMEOUT-1 행동: masked provider 400 판정기 + TSW 칩 어순 무진행-매치 수정", () => {
  assert.equal(
    summary.failed,
    0,
    `wave3-premium-writing failures: ${JSON.stringify(summary.failures)}`,
  );
  assert.ok(summary.passed >= 9, `expected ≥9 checks, got ${summary.passed}`);
});

// ── (2) 배선(소스 계약) 검증 ──
const src = (rel) => readFileSync(path.join(repoRoot, rel), "utf8");

test("W3-TIMEOUT-2: SW/TSW PREMIUM 은 강제 JSON 모드로 라우팅(원 생성 + repair)", () => {
  const run = src(
    "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
  );
  // 라우팅 술어: PREMIUM 이면서 SW 또는 TSW.
  assert.match(
    run,
    /premiumForceJsonFallback\s*=\s*\n?\s*effectiveGenerationPlan === "PREMIUM" &&\s*\n?\s*(?:isAtlasClaudeModel\(ATLAS_PREMIUM_QGEN_MODEL_ID\) &&\s*\n?\s*)?\(subType === "SUMMARY_WRITING" \|\|\s*\n?\s*subType === "TOPIC_SENTENCE_WRITING"\)/,
  );
  // 원 생성 호출과 SHIP-FIRST repair 호출 양쪽에 플래그가 배선된다.
  const wired = run.match(/forceJsonFallback: premiumForceJsonFallback/g) ?? [];
  assert.ok(
    wired.length >= 2,
    `expected forceJsonFallback wiring in generate + repair, got ${wired.length}`,
  );
});

test("W3-TIMEOUT-3: generateWithRetry/repair 가 forceJsonFallback 을 관통 전달", () => {
  const gwr = src(
    "src/app/api/ai/generate-questions-auto/_lib/generate-with-retry.ts",
  );
  assert.match(gwr, /forceJsonFallback\?: boolean/);
  assert.match(gwr, /forceJsonFallback: opts\?\.forceJsonFallback/);

  const repair = src(
    "src/app/api/ai/generate-questions-auto/_lib/question-repair.ts",
  );
  assert.match(repair, /forceJsonFallback\?: boolean/);
  assert.match(
    repair,
    /\{\s*system,\s*deadlineAt,\s*forceJsonFallback,\s*researchStage:/,
  );
});

test("W3-TIMEOUT-4: LLM 레이어 — 강제 JSON 경로가 strict 호출을 생략하고, masked 400 이 폴백을 발동", () => {
  const llm = src("src/lib/question-generation-llm.ts");
  // 강제 JSON 모드는 generateObject(strict) 진입 전에 폴백 함수로 직행한다.
  const forcedIdx = llm.indexOf("if (forceJsonFallback) {");
  const strictIdx = llm.indexOf("const result = await generateObject({");
  assert.ok(forcedIdx > 0, "forced JSON branch exists");
  assert.ok(strictIdx > 0, "strict generateObject call exists");
  assert.ok(forcedIdx < strictIdx, "forced branch precedes strict call");
  // 강제 경로도 grammar-too-large 폴백과 동일 함수(클라이언트 zod 검증 계약)를 쓴다.
  assert.match(
    llm,
    /if \(forceJsonFallback\) \{[\s\S]*?generateObjectViaJsonFallback\(/,
  );
  // masked 400 은 grammar-too-large 와 OR 로 폴백 트리거.
  assert.match(
    llm,
    /isCompiledGrammarTooLargeError\(error\) \|\|\s*\n?\s*isMaskedProviderBadRequestError\(error\)/,
  );
});
