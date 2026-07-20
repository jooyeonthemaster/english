// E-gate (해설 사실검증 게이트) 계약 회귀 — 캠페인 20260716 O153/O156/O160 + W2-F 확장.
//  · 플랜별 기본 모드: PREMIUM=enforce(Phase C: 출하분 F 0/11), STANDARD=warn.
//  · 대상 유형(W2-F): 어법·빈칸 + 선택형(TITLE·TOPIC·MAIN_IDEA·TOPIC_MAIN_IDEA·
//    IMPLIED_MEANING·CONTENT_MATCH). env EXPLANATION_VERIFY_GATE_TYPES 오버라이드
//    (콤마 구분, "ALL"). 구조형·서술형은 기본 제외.
//  · 검증기·수리기 기본 모델 x-ai/grok-4.5 + reasoning=high(콜 단위 명시, 범용 env
//    미의존). 실측 O184: gemini-3.1-pro 적발 0/12 vs grok@high 10/12.
// 소스(TS)는 tsx 서브프로세스로 실행하고 stdout 의 JSON 결과만 파싱한다. WIRE 하네스는
// globalThis.fetch 를 목킹해 실제 와이어 본문(model·reasoning_effort·stream)을 검증한다.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const tmpDir = path.join(repoRoot, "tests", ".tmp-expl-verify-gate");
let harnessId = 0;

function runHarness(source, env = {}) {
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, `harness-${process.pid}-${harnessId++}.ts`);
  writeFileSync(harnessPath, source, "utf8");
  try {
    return JSON.parse(
      execSync(`node "${tsxCli}" "${harnessPath}"`, {
        cwd: repoRoot,
        env: {
          ...process.env,
          // 목킹 fetch 라 실제 호출은 없지만 provider 구성에는 키가 필요하다.
          OPENROUTER_API_KEY: "offline-test-key",
          // 재현성: 추론/대상/모드/모델 관련 env 를 비워 와이어 본문 비교를 안정화한다
          // (앰비언트 env 가 결과에 새지 않게). 각 시나리오는 하네스 내부에서 set/delete.
          OPENROUTER_REASONING_EFFORT: "",
          ATLASCLOUD_REASONING_EFFORT: "",
          OPENROUTER_GEMINI_REASONING_EFFORT: "",
          ATLASCLOUD_GEMINI_REASONING_EFFORT: "",
          EXPLANATION_VERIFY_GATE_TYPES: "",
          EXPLANATION_VERIFY_GATE_MODE: "",
          EXPLANATION_VERIFY_GATE_MODE_PREMIUM: "",
          EXPLANATION_VERIFY_GATE_MODE_STANDARD: "",
          EXPLANATION_VERIFY_MODEL_ID: "",
          EXPLANATION_VERIFY_REPAIR_MODEL_ID: "",
          EXPLANATION_VERIFY_REASONING_EFFORT: "",
          ...env,
        },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"],
      }),
    );
  } finally {
    rmSync(harnessPath, { force: true });
  }
}

// ── PURE 하네스: 네트워크 없이 모드 결정 + 대상 유형 판정만 검증 ────────────────────
const PURE_HARNESS = String.raw`
import {
  getExplanationVerifyGateMode,
  isExplanationVerifyGateTargetType,
  runExplanationVerifyGate,
} from "@/app/api/ai/generate-questions-auto/_lib/explanation-verify-gate";

async function main() {
  const r = {};

  // ── 플랜별 기본 모드 + env 오버라이드 (기존 계약 무회귀) ──
  r.noPlanDefault = getExplanationVerifyGateMode();
  r.premiumDefault = getExplanationVerifyGateMode("PREMIUM");
  r.standardDefault = getExplanationVerifyGateMode("STANDARD");
  process.env.EXPLANATION_VERIFY_GATE_MODE_PREMIUM = "warn";
  r.premiumEnvOverride = getExplanationVerifyGateMode("PREMIUM");
  process.env.EXPLANATION_VERIFY_GATE_MODE = "off";
  r.globalOffWins = getExplanationVerifyGateMode("PREMIUM");
  process.env.EXPLANATION_VERIFY_GATE_MODE = "banana";
  r.invalidGlobalFallsThrough = getExplanationVerifyGateMode("PREMIUM");
  delete process.env.EXPLANATION_VERIFY_GATE_MODE;
  delete process.env.EXPLANATION_VERIFY_GATE_MODE_PREMIUM;

  // ── 대상 유형 판정 테이블 (기본 집합) ──
  const table = (t) => isExplanationVerifyGateTargetType(t);
  r.defaultTargets = {
    GRAMMAR_ERROR: table("GRAMMAR_ERROR"),
    BLANK_INFERENCE: table("BLANK_INFERENCE"),
    TITLE: table("TITLE"),
    TOPIC: table("TOPIC"),
    MAIN_IDEA: table("MAIN_IDEA"),
    TOPIC_MAIN_IDEA: table("TOPIC_MAIN_IDEA"),
    IMPLIED_MEANING: table("IMPLIED_MEANING"),
    CONTENT_MATCH: table("CONTENT_MATCH"),
    SENTENCE_INSERT: table("SENTENCE_INSERT"),
    SENTENCE_ORDER: table("SENTENCE_ORDER"),
    IRRELEVANT_SENTENCE: table("IRRELEVANT_SENTENCE"),
    SUMMARY_WRITING: table("SUMMARY_WRITING"),
    nullish: table(null),
    undef: table(undefined),
    empty: table(""),
  };

  // ── env 오버라이드 ──
  process.env.EXPLANATION_VERIFY_GATE_TYPES = "GRAMMAR_ERROR";
  r.envOnlyGrammar = { grammar: table("GRAMMAR_ERROR"), blank: table("BLANK_INFERENCE"), title: table("TITLE") };
  process.env.EXPLANATION_VERIFY_GATE_TYPES = "title, topic";
  r.envCaseInsensitive = { title: table("TITLE"), topic: table("TOPIC"), grammar: table("GRAMMAR_ERROR") };
  process.env.EXPLANATION_VERIFY_GATE_TYPES = "all";
  r.envAllLowercase = { grammar: table("GRAMMAR_ERROR"), sentenceInsert: table("SENTENCE_INSERT"), random: table("ANYTHING_XYZ") };
  process.env.EXPLANATION_VERIFY_GATE_TYPES = "   ";
  r.envWhitespaceFallsBack = { grammar: table("GRAMMAR_ERROR"), title: table("TITLE"), sentenceInsert: table("SENTENCE_INSERT") };
  process.env.EXPLANATION_VERIFY_GATE_TYPES = " , , ";
  r.envEmptyItemsFallBack = { grammar: table("GRAMMAR_ERROR"), sentenceInsert: table("SENTENCE_INSERT") };
  delete process.env.EXPLANATION_VERIFY_GATE_TYPES;

  // ── off/비대상 무판정 통과: 네트워크 호출 금지 유지 ──
  globalThis.fetch = (() => { throw new Error("network must not be called (off/non-target)"); });

  // 플랜 미상(off) → 즉시 무판정 통과.
  const off = await runExplanationVerifyGate({
    subType: "GRAMMAR_ERROR",
    question: { explanation: "테스트", correctAnswer: "(A)" },
    passage: "Test passage.",
  });
  r.offIssue = off.issue;

  // 비대상 유형(SENTENCE_INSERT)은 enforce(PREMIUM)여도 네트워크 없이 통과.
  process.env.EXPLANATION_VERIFY_GATE_MODE = "enforce";
  const nonTarget = await runExplanationVerifyGate({
    subType: "SENTENCE_INSERT",
    generationPlan: "PREMIUM",
    question: { explanation: "테스트", correctAnswer: "①" },
    passage: "Test passage.",
  });
  r.nonTargetIssue = nonTarget.issue;
  delete process.env.EXPLANATION_VERIFY_GATE_MODE;

  process.stdout.write(JSON.stringify(r));
}
main().catch((e) => { console.error(e); process.exit(1); });
`;

test("E-gate: 플랜별 모드 + 대상 유형 판정 테이블 + env 오버라이드 + off/비대상 무판정 통과", () => {
  const r = runHarness(PURE_HARNESS);

  // 플랜별 모드 (기존 무회귀)
  assert.equal(r.noPlanDefault, "off");
  assert.equal(r.premiumDefault, "enforce");
  assert.equal(r.standardDefault, "warn");
  assert.equal(r.premiumEnvOverride, "warn");
  assert.equal(r.globalOffWins, "off");
  assert.equal(r.invalidGlobalFallsThrough, "warn");

  // 대상 유형 기본 집합: 어법·빈칸 + 선택형 6종 → true; 구조형·서술형·nullish → false
  assert.deepEqual(r.defaultTargets, {
    GRAMMAR_ERROR: true,
    BLANK_INFERENCE: true,
    TITLE: true,
    TOPIC: true,
    MAIN_IDEA: true,
    TOPIC_MAIN_IDEA: true,
    IMPLIED_MEANING: true,
    CONTENT_MATCH: true,
    SENTENCE_INSERT: false,
    SENTENCE_ORDER: false,
    IRRELEVANT_SENTENCE: false,
    SUMMARY_WRITING: false,
    nullish: false,
    undef: false,
    empty: false,
  });

  // env 오버라이드
  assert.deepEqual(r.envOnlyGrammar, { grammar: true, blank: false, title: false });
  assert.deepEqual(r.envCaseInsensitive, { title: true, topic: true, grammar: false });
  assert.deepEqual(r.envAllLowercase, { grammar: true, sentenceInsert: true, random: true });
  assert.deepEqual(r.envWhitespaceFallsBack, { grammar: true, title: true, sentenceInsert: false });
  assert.deepEqual(r.envEmptyItemsFallBack, { grammar: true, sentenceInsert: false });

  // off/비대상 → 네트워크 없이 무판정 통과
  assert.equal(r.offIssue, null);
  assert.equal(r.nonTargetIssue, null);
});

// ── WIRE 하네스: fetch 목킹으로 실제 요청 본문(model·reasoning_effort·stream) 검증 ──
const WIRE_HARNESS = String.raw`
const errWrite = process.stderr.write.bind(process.stderr);
for (const m of ["log", "warn", "error", "info", "debug"]) {
  console[m] = (...a) => errWrite(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") + "\n");
}
const keepAlive = setInterval(() => {}, 60000);

import { runExplanationVerifyGate } from "@/app/api/ai/generate-questions-auto/_lib/explanation-verify-gate";

function chat(content) {
  return new Response(JSON.stringify({
    id: "gen", object: "chat.completion", model: "wire",
    choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(content) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}
const verifyPass = { claims: [{ quote: "q", kind: "TERMINOLOGY", verdict: "OK", evidence: "e" }], koreanTextIssues: [], overallVerdict: "PASS" };
const verifyFail = { claims: [{ quote: "명사 while", kind: "GRAMMAR_ANALYSIS", verdict: "WRONG", evidence: "실제로는 접속사" }], koreanTextIssues: [], overallVerdict: "FAIL" };
const repairObj = { explanation: "교정된 해설입니다. 근거가 실제 구조와 일치합니다.", wrongOptionExplanations: [{ label: "①", explanation: "오답 해설입니다." }], keyPoints: ["(A) 주제 — 근거", "(B) 주제 — 근거", "(C) 주제 — 근거"] };

let queue = [];
let bodies = [];
globalThis.fetch = (async (input, init) => {
  bodies.push(typeof (init && init.body) === "string" ? init.body : "");
  const next = queue.shift();
  if (!next) throw new Error("mock fetch queue exhausted");
  return next;
});

const baseQuestion = {
  explanation: "이 문항의 해설입니다. 근거는 명확합니다.",
  correctAnswer: "(A)",
  direction: "다음 글의 밑줄 친 부분 중 어법상 틀린 것은?",
  options: [{ label: "①", text: "alpha" }, { label: "②", text: "beta" }],
};

async function runScenario(name, opts) {
  opts = opts || {};
  queue = (opts.responses || [chat(verifyPass)]).slice();
  bodies = [];
  const res = await runExplanationVerifyGate({
    subType: opts.subType || "GRAMMAR_ERROR",
    generationPlan: opts.plan || "PREMIUM",
    question: baseQuestion,
    passage: "This is the source passage for verification.",
  });
  const wire = bodies.map((b) => { try { return JSON.parse(b); } catch { return { raw: b }; } });
  return {
    name,
    issue: res.issue ? { code: res.issue.code, severity: res.issue.severity } : null,
    warning: res.warning || null,
    updatedExplanation: res.updatedQuestion ? res.updatedQuestion.explanation : null,
    repairedFlag: res.updatedQuestion ? res.updatedQuestion._explanationRepaired === true : null,
    updatedWrongOptions: res.updatedQuestion ? res.updatedQuestion.wrongOptionExplanations : null,
    fetches: wire.length,
    wire: wire.map((w) => ({ model: w.model, reasoning_effort: w.reasoning_effort, hasReasoning: "reasoning" in (w || {}), hasStreamKey: "stream" in (w || {}), stream: w.stream, isRepairCall: JSON.stringify(w).includes("해설 교정 전문가") })),
  };
}

async function main() {
  const out = {};

  // 1) grok 기본 모델 해석 + reasoning=high + stream:false (어법, PREMIUM=enforce, PASS)
  out.grokGrammar = await runScenario("grokGrammar");

  // 2) 선택형(TITLE) 확장 — 게이트가 실제로 발동해 grok 검증 콜을 낸다(E2E 확장 증명)
  out.grokTitle = await runScenario("grokTitle", { subType: "TITLE" });

  // 3) 검증기 모델 env 오버라이드
  process.env.EXPLANATION_VERIFY_MODEL_ID = "x-ai/grok-4.5-fast";
  out.modelOverride = await runScenario("modelOverride");
  delete process.env.EXPLANATION_VERIFY_MODEL_ID;

  // 4) gemini 오버라이드 — 바이트 보존(reasoning_effort:high 누출 금지, stream 키 없음)
  process.env.EXPLANATION_VERIFY_MODEL_ID = "google/gemini-3.5-flash";
  out.geminiOverride = await runScenario("geminiOverride");
  delete process.env.EXPLANATION_VERIFY_MODEL_ID;

  // 5) reasoning 강도 env 오버라이드
  process.env.EXPLANATION_VERIFY_REASONING_EFFORT = "medium";
  out.reasoningOverride = await runScenario("reasoningOverride");
  delete process.env.EXPLANATION_VERIFY_REASONING_EFFORT;

  // 6) 수리 경로: verify FAIL → grok 수리 → 재검증 PASS → 해설 교체(updatedQuestion)
  out.repairAdopt = await runScenario("repairAdopt", { responses: [chat(verifyFail), chat(repairObj), chat(verifyPass)] });

  // 7) fail-closed(enforce): 재검증까지 FAIL → blocking 반려
  out.repairEnforceFail = await runScenario("repairEnforceFail", { responses: [chat(verifyFail), chat(repairObj), chat(verifyFail)] });

  // 8) warn(STANDARD): 재검증 FAIL → 경고만, issue 없음
  out.repairWarnFail = await runScenario("repairWarnFail", { plan: "STANDARD", responses: [chat(verifyFail), chat(repairObj), chat(verifyFail)] });

  return out;
}
main().then((out) => {
  clearInterval(keepAlive);
  process.stdout.write(JSON.stringify(out), () => process.exit(0));
}).catch((e) => {
  clearInterval(keepAlive);
  errWrite("WIRE_HARNESS_THREW " + (e && e.stack ? e.stack : String(e)) + "\n");
  process.exit(1);
});
`;

test("E-gate WIRE: grok 기본 모델 + reasoning=high 콜 단위 전달, 선택형 확장, env 오버라이드, gemini 바이트 보존", () => {
  const out = runHarness(WIRE_HARNESS);

  // 1) grok 기본: 검증 콜이 x-ai/grok-4.5 로, reasoning_effort=high, stream:false 로 나간다.
  const g = out.grokGrammar;
  assert.equal(g.issue, null, JSON.stringify(g));
  assert.equal(g.fetches, 1);
  assert.equal(g.wire[0].model, "x-ai/grok-4.5");
  assert.equal(g.wire[0].reasoning_effort, "high");
  assert.equal(g.wire[0].hasReasoning, false, "grok should carry reasoning_effort, not a reasoning object");
  assert.equal(g.wire[0].stream, false);

  // 2) 선택형(TITLE) 확장이 실제 콜을 낸다 — grok 검증 1콜.
  const t = out.grokTitle;
  assert.equal(t.fetches, 1, `TITLE must trigger the gate end-to-end: ${JSON.stringify(t)}`);
  assert.equal(t.wire[0].model, "x-ai/grok-4.5");
  assert.equal(t.wire[0].reasoning_effort, "high");

  // 3) 검증기 모델 env 오버라이드가 와이어 model 을 바꾼다(reasoning 은 grok 계열이라 유지).
  assert.equal(out.modelOverride.wire[0].model, "x-ai/grok-4.5-fast");
  assert.equal(out.modelOverride.wire[0].reasoning_effort, "high");

  // 4) gemini 오버라이드 — 바이트 보존: reasoning_effort:high 를 싣지 않고(gemini 자체
  //    reasoning 제어), stream 키도 없어야 한다(gemini 요청 본문 불변 계약).
  const gem = out.geminiOverride;
  assert.equal(gem.wire[0].model, "google/gemini-3.5-flash");
  assert.notEqual(gem.wire[0].reasoning_effort, "high");
  assert.equal(gem.wire[0].reasoning_effort ?? null, null, `gemini must not carry reasoning_effort: ${JSON.stringify(gem.wire[0])}`);
  assert.equal(gem.wire[0].hasStreamKey, false, `gemini wire must stay stream-key-clean: ${JSON.stringify(gem.wire[0])}`);

  // 5) reasoning 강도 env 오버라이드.
  assert.equal(out.reasoningOverride.wire[0].reasoning_effort, "medium");

  // 6) 수리 경로: verify FAIL → 수리(grok) → 재검증 PASS → 해설 교체.
  const rep = out.repairAdopt;
  assert.equal(rep.issue, null, JSON.stringify(rep));
  assert.equal(rep.fetches, 3, "expected verify→repair→re-verify (3 calls)");
  assert.equal(rep.updatedExplanation, "교정된 해설입니다. 근거가 실제 구조와 일치합니다.");
  assert.equal(rep.repairedFlag, true);
  // 수리본 오답해설은 저장·렌더 계약(Record<라벨, 문장>)으로 정규화되어야 한다 —
  // 수리 스키마의 배열형이 그대로 저장되면 오답 분석 렌더가 깨진다(O190 결함①).
  assert.deepEqual(
    rep.updatedWrongOptions,
    { "①": "오답 해설입니다." },
    `repaired wrongOptionExplanations must be normalized to Record form: ${JSON.stringify(rep.updatedWrongOptions)}`,
  );
  // 수리 콜(2번째)도 grok + reasoning=high 로 나간다.
  assert.equal(rep.wire[1].model, "x-ai/grok-4.5");
  assert.equal(rep.wire[1].reasoning_effort, "high");
  assert.equal(rep.wire[1].isRepairCall, true, "second call must be the repair call");

  // 7) fail-closed(enforce): 재검증까지 FAIL → blocking 반려.
  const enf = out.repairEnforceFail;
  assert.equal(enf.fetches, 3);
  assert.ok(enf.issue, `enforce must block on residual failure: ${JSON.stringify(enf)}`);
  assert.equal(enf.issue.code, "explanation-verify-failed");
  assert.equal(enf.updatedExplanation, null, "blocked candidate must not adopt the repair");

  // 8) warn(STANDARD): 재검증 FAIL → 경고만, issue 없음.
  const wn = out.repairWarnFail;
  assert.equal(wn.fetches, 3);
  assert.equal(wn.issue, null, `warn must not block: ${JSON.stringify(wn)}`);
  assert.ok(typeof wn.warning === "string" && wn.warning.length > 0, `warn must attach a warning: ${JSON.stringify(wn)}`);
});
