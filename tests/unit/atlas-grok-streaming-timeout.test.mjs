import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

// T5: grok(비스트리밍 기대) 호출에서 응답이 SSE/빈 본문으로 와 파서가 상위
// 데드라인(최대 282s)까지 매달리는 결함의 수리 검증.
//  1) 비-gemini 요청에 stream:false 명시(gemini 는 바이트 불변),
//  2) status 200 + 빈 본문/SSE 를 transient 로 분류해 빠르게 재시도,
//  3) 콜 단위 하드 타임아웃(기본 120s, env 오버라이드)이 상위 deadline 과 별개로 발동.
// 소스(TS)는 tsx 로 서브프로세스 실행하고 stdout 의 JSON 결과만 파싱한다.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const tmpDir = path.join(repoRoot, ".tmp-atlas-grok-tests");
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
          // 재현성: 추론 관련 env 를 비워 와이어 본문 비교를 안정화한다.
          OPENROUTER_GEMINI_REASONING_EFFORT: "",
          ATLASCLOUD_GEMINI_REASONING_EFFORT: "",
          OPENROUTER_REASONING_EFFORT: "",
          ATLASCLOUD_REASONING_EFFORT: "",
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

// ── 0. (T5 리뷰 §1) 콜 단위 하드 타임아웃 기본값 240s + env 오버라이드 ───────────
// 하드 타임아웃은 상위 시간예산(PREMIUM 180s·JSON 폴백 240s)보다 짧으면 안 된다.
// 짧으면 정상적으로 긴 호출을 하드 타임아웃이 먼저 죽인다. 기본값이 240s(>=240s)
// 인지, env 오버라이드가 살아있는지, 0/비정상 값이 기본값으로 떨어지는지 증명한다.
test("ATLAS_MODEL_CALL_TIMEOUT_MS defaults to 240s (>= upper budget) and honors env override", () => {
  const readTimeout = `
    import { ATLAS_MODEL_CALL_TIMEOUT_MS } from "@/lib/atlas-ai";
    process.stdout.write(JSON.stringify({ v: ATLAS_MODEL_CALL_TIMEOUT_MS }));
  `;

  // 기본값(env 미설정) = 240_000, 상위 예산 240s 이상.
  const def = runHarness(readTimeout, { ATLAS_MODEL_CALL_TIMEOUT_MS: "" });
  assert.equal(def.v, 240_000, `default not 240s: ${JSON.stringify(def)}`);
  assert.ok(def.v >= 240_000, "hard timeout shorter than the 240s upper budget");

  // 유효한 env 오버라이드는 그대로 반영.
  assert.equal(runHarness(readTimeout, { ATLAS_MODEL_CALL_TIMEOUT_MS: "300000" }).v, 300_000);

  // 0·비정상 값은 기본값(240s) 유지.
  assert.equal(runHarness(readTimeout, { ATLAS_MODEL_CALL_TIMEOUT_MS: "0" }).v, 240_000);
  assert.equal(runHarness(readTimeout, { ATLAS_MODEL_CALL_TIMEOUT_MS: "not-a-number" }).v, 240_000);
});

// ── 1. 비스트리밍 와이어 플래그: gemini 불변, 비-gemini 는 stream:false ──────────
test("atlasNonStreamingWireFlag omits stream for gemini and forces false for grok", () => {
  const result = runHarness(`
    import { atlasNonStreamingWireFlag } from "@/lib/atlas-ai";
    process.stdout.write(JSON.stringify({
      geminiUndefined: atlasNonStreamingWireFlag("google/gemini-3.5-flash", undefined) === undefined,
      geminiLite: atlasNonStreamingWireFlag("google/gemini-3.1-flash-lite", undefined) === undefined,
      grokFalse: atlasNonStreamingWireFlag("x-ai/grok-4.5", undefined) === false,
      claudeFalse: atlasNonStreamingWireFlag("anthropic/claude-sonnet-5", undefined) === false,
      streamingPreservedGrok: atlasNonStreamingWireFlag("x-ai/grok-4.5", true) === true,
      streamingPreservedGemini: atlasNonStreamingWireFlag("google/gemini-3.5-flash", true) === true,
    }));
  `);

  assert.deepEqual(result, {
    geminiUndefined: true,
    geminiLite: true,
    grokFalse: true,
    claudeFalse: true,
    streamingPreservedGrok: true,
    streamingPreservedGemini: true,
  });
});

// ── 2. transient 분류기: 빈 본문/SSE 200 → true, 결정론 오류/정상 → false ────────
test("isTransientEmptyOrStreamedResponseError classifies empty/SSE 200 but excludes deterministic errors", () => {
  const result = runHarness(`
    import { AtlasTransientResponseError } from "@/lib/atlas-ai";
    import { isTransientEmptyOrStreamedResponseError as f } from "@/lib/question-generation-llm";
    process.stdout.write(JSON.stringify({
      streamedGuard: f(new AtlasTransientResponseError("streamed", "x-ai/grok-4.5", "sse")),
      timeoutGuard: f(new AtlasTransientResponseError("timeout", "x-ai/grok-4.5", "hard timeout")),
      empty200: f({ statusCode: 200, responseBody: "" }),
      sse200: f({ statusCode: 200, responseBody: "data: {\\"choices\\":[]}\\n\\ndata: [DONE]\\n\\n" }),
      invalidJsonWrapCause: f({ statusCode: 200, message: "Failed to process successful response", cause: new AtlasTransientResponseError("timeout", "x-ai/grok-4.5", "t") }),
      masked400: f({ statusCode: 200, responseBody: '{"error":{"message":"Provider returned error","code":400}}' }),
      grammarTooLarge: f({ statusCode: 200, responseBody: "compiled grammar is too large" }),
      normal500: f({ statusCode: 500, responseBody: "upstream unavailable" }),
      normalObjectError: f(new Error("some unrelated failure")),
      billing: f({ statusCode: 200, responseBody: "insufficient credits" }),
    }));
  `);

  assert.deepEqual(result, {
    streamedGuard: true,
    timeoutGuard: true,
    empty200: true,
    sse200: true,
    invalidJsonWrapCause: true,
    masked400: false,
    grammarTooLarge: false,
    normal500: false,
    normalObjectError: false,
    // 200 + 비어있지 않고 SSE 아님 → transient 아님(빈/스트림 결함이 아니므로).
    billing: false,
  });
});

// ── 3. 통합: fetch 를 목킹해 (빈 본문 200)/(SSE 200)/(정상)/(본문 hang) 검증 ──────
// 하드 타임아웃을 1000ms 로 낮춰 hang 시나리오가 상위 SDK 타임아웃(30s)이 아닌
// 콜 단위 하드 타임아웃으로 끊기는지 시간으로 증명한다.
const INTEGRATION_HARNESS = String.raw`
  const errWrite = process.stderr.write.bind(process.stderr);
  for (const m of ["log", "warn", "error", "info", "debug"]) {
    console[m] = (...a) => errWrite(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") + "\n");
  }
  // 목킹된 hang 응답은 실제 소켓 IO 가 없어 이벤트 루프를 붙잡지 못한다 — 하드
  // 타임아웃 타이머는 (프로덕션 계약대로) unref 라 이것만으로는 루프가 종료돼
  // 하네스가 조기 exit 한다. 실 fetch 의 소켓 ref 를 대신할 keep-alive 를 둔다.
  const keepAlive = setInterval(() => {}, 60000);
  import { z } from "zod";
  import { generateQuestionObject } from "@/lib/question-generation-llm";

  const schema = z.object({ answer: z.string() });

  function normalResponse() {
    const payload = {
      id: "gen-normal",
      object: "chat.completion",
      model: "x-ai/grok-4.5",
      choices: [
        { index: 0, message: { role: "assistant", content: JSON.stringify({ answer: "42" }) }, finish_reason: "stop" },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  }
  function emptyResponse() {
    // status 200 인데 본문이 비어 파서가 즉시 실패하는 유형.
    return new Response("", { status: 200, headers: { "content-type": "application/json" } });
  }
  function sseResponse() {
    // 비스트리밍 요청인데 text/event-stream 로 온 유형(grok 대형응답 실측).
    const sse = 'data: {"choices":[]}\n\ndata: [DONE]\n\n';
    return new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } });
  }
  function hangingResponse(signal) {
    // 본문 스트림이 응답 시그널이 끊길 때까지 매달린다(실 fetch 의 abort 바인딩 재현).
    const stream = new ReadableStream({
      start(controller) {
        const fail = () => controller.error(signal && signal.reason ? signal.reason : new Error("aborted"));
        if (signal && signal.aborted) { fail(); return; }
        if (signal) signal.addEventListener("abort", fail, { once: true });
      },
    });
    return new Response(stream, { status: 200, headers: { "content-type": "application/json" } });
  }

  let queue = [];
  let bodies = [];
  globalThis.fetch = (async (input, init) => {
    bodies.push(typeof (init && init.body) === "string" ? init.body : "");
    const next = queue.shift();
    if (!next) throw new Error("mock fetch queue exhausted");
    return next(init && init.signal);
  });

  async function runScenario(name, factories, opts) {
    opts = opts || {};
    queue = factories.slice();
    bodies = [];
    const started = Date.now();
    try {
      const result = await generateQuestionObject({
        schema,
        prompt: "test prompt",
        generationPlan: opts.plan || "PREMIUM",
        modelId: opts.modelId || "x-ai/grok-4.5",
        logPrefix: "T5-TEST",
        maxTokens: 256,
        timeoutMs: 30000,
      });
      return { name, ok: true, attempts: result.attempts, answer: result.object && result.object.answer, fetches: bodies.length, rawWire: bodies.slice(), ms: Date.now() - started };
    } catch (e) {
      return { name, ok: false, error: (e && e.name) + ": " + (e && e.message ? e.message : String(e)), fetches: bodies.length, rawWire: bodies.slice(), ms: Date.now() - started };
    }
  }

  // 최상위 await 는 tsx 의 CJS 변환에서 막히므로 async main 으로 감싼다.
  async function main() {
    const results = [];
    results.push(await runScenario("normal", [normalResponse]));
    results.push(await runScenario("empty-then-normal", [emptyResponse, normalResponse]));
    results.push(await runScenario("sse-then-normal", [sseResponse, normalResponse]));
    results.push(await runScenario("hang-then-normal", [hangingResponse, normalResponse]));
    // §2 이중 과금 상한: 빈 200 이 연달아 오면 빠른 재시도는 최대 1회(총 2콜)로 캡되고
    // 그 뒤 기존 오류 경로로 던진다 — 3번째(정상) 응답까지 절대 가지 않는다.
    results.push(await runScenario("empty-empty-normal", [emptyResponse, emptyResponse, normalResponse]));
    results.push(await runScenario("gemini-wire", [normalResponse], { plan: "STANDARD", modelId: "google/gemini-3.5-flash" }));
    results.push(await runScenario("grok-wire", [normalResponse]));
    return results;
  }
  main().then((results) => {
    clearInterval(keepAlive);
    process.stdout.write(JSON.stringify(results), () => process.exit(0));
  }).catch((e) => {
    clearInterval(keepAlive);
    errWrite("HARNESS_THREW " + (e && e.stack ? e.stack : String(e)) + "\n");
    process.exit(1);
  });
`;

test("generateQuestionObject retries transient empty/SSE 200 and enforces a per-call hard timeout", () => {
  const results = runHarness(INTEGRATION_HARNESS, {
    ATLAS_MODEL_CALL_TIMEOUT_MS: "1000",
  });
  const byName = Object.fromEntries(results.map((r) => [r.name, r]));

  // 정상 JSON: 첫 시도 성공.
  assert.equal(byName["normal"].ok, true, JSON.stringify(byName["normal"]));
  assert.equal(byName["normal"].attempts, 1);
  assert.equal(byName["normal"].answer, "42");
  assert.equal(byName["normal"].fetches, 1);

  // 빈 본문 200 → 즉시 transient 재시도 → 2번째 정상 응답으로 성공.
  assert.equal(byName["empty-then-normal"].ok, true, JSON.stringify(byName["empty-then-normal"]));
  assert.equal(byName["empty-then-normal"].attempts, 2);
  assert.equal(byName["empty-then-normal"].answer, "42");
  assert.equal(byName["empty-then-normal"].fetches, 2);

  // SSE 텍스트 200 → 헤더 단계 즉시 실패 → 재시도 → 성공.
  assert.equal(byName["sse-then-normal"].ok, true, JSON.stringify(byName["sse-then-normal"]));
  assert.equal(byName["sse-then-normal"].attempts, 2);
  assert.equal(byName["sse-then-normal"].answer, "42");
  assert.equal(byName["sse-then-normal"].fetches, 2);
  // SSE 본문을 버퍼링하지 않고 <1s 내 실패했는지(첫 시도가 하드 타임아웃 1s 미만).
  assert.ok(byName["sse-then-normal"].ms < 900, `SSE fast-fail too slow: ${byName["sse-then-normal"].ms}ms`);

  // 본문 hang 200 → 콜 단위 하드 타임아웃(1s)으로 끊고 재시도 → 성공.
  const hang = byName["hang-then-normal"];
  assert.equal(hang.ok, true, JSON.stringify(hang));
  assert.equal(hang.attempts, 2);
  assert.equal(hang.answer, "42");
  assert.equal(hang.fetches, 2);
  // 상위 SDK 타임아웃(30s)이 아니라 하드 타임아웃(1s)으로 끊겼음을 시간으로 증명.
  assert.ok(hang.ms >= 800, `hard timeout fired too early: ${hang.ms}ms`);
  assert.ok(hang.ms < 15000, `hard timeout did not bound the hang: ${hang.ms}ms`);

  // §2 이중 과금 상한: 빈 200 이 연달아 오면 빠른 재시도는 1회로 캡 → 총 2콜 후
  // 던진다(정상인 3번째 응답까지 가지 않음). 상한 없으면 3콜에 성공했을 시나리오다.
  const cap = byName["empty-empty-normal"];
  assert.equal(cap.ok, false, `fast-retry cap did not stop (unexpected success): ${JSON.stringify(cap)}`);
  assert.equal(cap.fetches, 2, `fast-retry not capped at 1 (expected 2 fetches): ${JSON.stringify(cap)}`);
});

test("gemini request body stays byte-clean (no stream field) while grok carries stream:false", () => {
  const results = runHarness(INTEGRATION_HARNESS, {
    ATLAS_MODEL_CALL_TIMEOUT_MS: "1000",
  });
  const byName = Object.fromEntries(results.map((r) => [r.name, r]));

  // gemini: 요청 본문에 stream 키가 전혀 없어야 한다(바이트 불변 계약).
  const geminiBody = byName["gemini-wire"].rawWire[0];
  assert.equal(byName["gemini-wire"].ok, true, JSON.stringify(byName["gemini-wire"]));
  assert.ok(geminiBody && !geminiBody.includes('"stream"'), `gemini wire leaked a stream field: ${geminiBody}`);
  const geminiParsed = JSON.parse(geminiBody);
  assert.equal("stream" in geminiParsed, false);
  assert.equal(geminiParsed.model, "google/gemini-3.5-flash");

  // grok(비-gemini): stream:false 가 명시되어야 한다.
  const grokBody = byName["grok-wire"].rawWire[0];
  assert.equal(byName["grok-wire"].ok, true, JSON.stringify(byName["grok-wire"]));
  const grokParsed = JSON.parse(grokBody);
  assert.equal(grokParsed.stream, false);
  assert.equal(grokParsed.model, "x-ai/grok-4.5");
});

// ── 가드 단독 검증(§3 분류 플래그 · §4 타이머 정리) ──────────────────────────────
// createAtlasModelCallGuardFetch 를 커스텀 delegate 로 직접 구동한다. delegate 가
// controller.abort(reason) 의 reason 을 "일부러 버리고" generic AbortError/Error 로
// 거부하는 상황(런타임이 reason 을 전파하지 않는 케이스)에서도 분류가 안정적인지,
// 그리고 성공 후 하드 타임아웃 타이머가 회수되어 spurious abort 가 없는지 증명한다.
const GUARD_HARNESS = String.raw`
  const errWrite = process.stderr.write.bind(process.stderr);
  for (const m of ["log", "warn", "error", "info", "debug"]) {
    console[m] = (...a) => errWrite(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") + "\n");
  }
  const keepAlive = setInterval(() => {}, 60000);
  import { createAtlasModelCallGuardFetch, ATLAS_MODEL_CALL_TIMEOUT_MS } from "@/lib/atlas-ai";

  const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
  function guardedInit() {
    return { method: "POST", body: JSON.stringify({ model: "x-ai/grok-4.5", stream: false }) };
  }
  function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // §3 헤더 단계: delegate 가 매달리다 abort 시 signal.reason 을 버리고 generic
  // AbortError(DOMException)로 거부 — 런타임이 reason 을 전파하지 않는 상황 재현.
  function headerHangGenericAbort(input, init) {
    return new Promise((_resolve, reject) => {
      const signal = init.signal;
      const onAbort = () => reject(new DOMException("The operation was aborted", "AbortError"));
      if (signal.aborted) { onAbort(); return; }
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  // §3 본문 단계: 헤더는 즉시 오지만 본문 스트림이 매달리다 abort 시 reason 을
  // 버리고 generic Error 로 깨진다(래퍼가 플래그 근거로 재분류해야 함).
  function bodyHangGenericAbort(input, init) {
    const signal = init.signal;
    const stream = new ReadableStream({
      start(controller) {
        const fail = () => controller.error(new Error("generic body socket failure"));
        if (signal.aborted) { fail(); return; }
        signal.addEventListener("abort", fail, { once: true });
      },
    });
    return Promise.resolve(new Response(stream, { status: 200, headers: { "content-type": "application/json" } }));
  }

  // 대조군: 하드 타임아웃과 무관한 즉시 네트워크 오류 — 플래그가 안 켜졌으니 가드는
  // 원본 오류를 그대로 전파해야 한다(무분별한 timeout 재분류가 아님을 증명).
  function immediateNetworkError() {
    return Promise.reject(new TypeError("simulated network failure"));
  }

  async function classifyGuardThrow(delegate) {
    const guardFetch = createAtlasModelCallGuardFetch(delegate);
    try {
      const res = await guardFetch(ENDPOINT, guardedInit());
      const text = await res.text(); // 헤더가 왔으면 본문까지 읽어 §3 본문 경로를 태운다.
      return { threw: false, text: text };
    } catch (e) {
      return { threw: true, name: e && e.name, code: e && e.code, message: e && e.message ? String(e.message).slice(0, 160) : "" };
    }
  }

  async function main() {
    const out = {};

    // §3-A 헤더 단계 generic abort → 플래그 근거로 timeout transient.
    out.headerPhase = await classifyGuardThrow(headerHangGenericAbort);
    // §3-B 본문 단계 generic abort → 플래그 근거로 timeout transient.
    out.bodyPhase = await classifyGuardThrow(bodyHangGenericAbort);
    // 대조군: 플래그 미발동 → 원본(TypeError) 그대로 전파.
    out.networkError = await classifyGuardThrow(immediateNetworkError);

    // §4 정상 소비: 바이트 보존 + 하드 타임아웃 창을 지나도 spurious abort 없음.
    let capturedSignal = null;
    const guardFetch = createAtlasModelCallGuardFetch((input, init) => {
      capturedSignal = init.signal;
      return Promise.resolve(new Response('{"answer":"42"}', { status: 200, headers: { "content-type": "application/json" } }));
    });
    const res = await guardFetch(ENDPOINT, guardedInit());
    const text = await res.text();
    const abortedRightAfter = capturedSignal ? capturedSignal.aborted : null;
    await delay(ATLAS_MODEL_CALL_TIMEOUT_MS + 250); // 하드 타임아웃 창 통과.
    out.success = {
      text: text,
      bytePreserved: text === '{"answer":"42"}',
      abortedRightAfter: abortedRightAfter,
      abortedAfterWindow: capturedSignal ? capturedSignal.aborted : null,
      hardTimeoutMs: ATLAS_MODEL_CALL_TIMEOUT_MS,
    };
    return out;
  }
  main().then((out) => {
    clearInterval(keepAlive);
    process.stdout.write(JSON.stringify(out), () => process.exit(0));
  }).catch((e) => {
    clearInterval(keepAlive);
    errWrite("GUARD_HARNESS_THREW " + (e && e.stack ? e.stack : String(e)) + "\n");
    process.exit(1);
  });
`;

// ── 4. (T5 리뷰 §3) abort 분류는 가드 컨텍스트 플래그가 1차 근거 — reason 전파 무의존.
test("guard classifies hard-timeout aborts via a context flag, independent of abort-reason propagation (§3)", () => {
  const out = runHarness(GUARD_HARNESS, { ATLAS_MODEL_CALL_TIMEOUT_MS: "300" });

  // 헤더 단계: delegate 가 reason 을 버리고 generic AbortError 를 던져도, 가드는
  // hardTimedOut 플래그를 근거로 timeout AtlasTransientResponseError 로 표면화한다.
  assert.equal(out.headerPhase.threw, true, JSON.stringify(out.headerPhase));
  assert.equal(out.headerPhase.name, "AtlasTransientResponseError", JSON.stringify(out.headerPhase));
  assert.equal(out.headerPhase.code, "timeout", JSON.stringify(out.headerPhase));

  // 본문 단계: 본문 스트림이 reason 을 버리고 generic Error 로 깨져도 동일하게
  // timeout transient 로 표면화된다(§4 본문 래퍼가 플래그를 근거로 재분류).
  assert.equal(out.bodyPhase.threw, true, JSON.stringify(out.bodyPhase));
  assert.equal(out.bodyPhase.name, "AtlasTransientResponseError", JSON.stringify(out.bodyPhase));
  assert.equal(out.bodyPhase.code, "timeout", JSON.stringify(out.bodyPhase));

  // 대조군: 하드 타임아웃 미발동(플래그 off) → 원본 오류를 그대로 전파(과잉 재분류 아님).
  assert.equal(out.networkError.threw, true, JSON.stringify(out.networkError));
  assert.equal(out.networkError.name, "TypeError", JSON.stringify(out.networkError));
});

// ── 5. (T5 리뷰 §4) 성공 경로: 본문 소비 완료 시 타이머 정리 + 바이트 보존 ─────────
test("guard clears the hard-timeout timer on body consumption — no spurious abort after completion (§4)", () => {
  const out = runHarness(GUARD_HARNESS, { ATLAS_MODEL_CALL_TIMEOUT_MS: "300" });

  // 래퍼는 본문 바이트를 무변경으로 흘려보낸다.
  assert.equal(out.success.bytePreserved, true, JSON.stringify(out.success));
  // 본문 소비 직후에는 당연히 abort 안 됨.
  assert.equal(out.success.abortedRightAfter, false, JSON.stringify(out.success));
  // 하드 타임아웃(300ms)+여유를 지나도 완료된 콜의 signal 은 abort 되지 않아야 한다
  // (타이머 미정리 시 매 호출 완료 후 spurious abort 가 발생하던 결함의 회귀 차단).
  assert.equal(
    out.success.abortedAfterWindow,
    false,
    `spurious abort after completion (timer not cleared): ${JSON.stringify(out.success)}`,
  );
});
