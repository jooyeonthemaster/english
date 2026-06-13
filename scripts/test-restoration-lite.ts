/* eslint-disable no-console */
// ============================================================================
// 지문 복원 모델 대체 검증 하니스 (개발용 — 배포와 무관)
//
//   npx tsx scripts/test-restoration-lite.ts flash-prod lite-prod
//   npx tsx scripts/test-restoration-lite.ts lite-tuned
//   npx tsx scripts/test-restoration-lite.ts --cases blank-answered,ordering-answered lite-prod
//
// 프로덕션과 동일한 프롬프트 빌더·zod 스키마·REST 호출 형태로
// gemini-3.5-flash(현행) vs gemini-3.1-flash-lite(후보)를 그라운드트루스
// 코퍼스에 대해 실행하고 결정론적으로 채점한다.
// ============================================================================

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// .env 수동 로드 (dotenv 미설치 — Next 외부 실행이므로 직접 파싱)
for (const file of [".env", ".env.local"]) {
  try {
    const envFile = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const line of envFile.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, key, rawValue] = m;
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  } catch {
    /* 파일 없으면 무시 */
  }
}

import { buildGroundedRestorationPrompts } from "../src/lib/extraction/restoration";
import { groundedRestorationResponseSchema } from "../src/lib/extraction/restoration/schemas";
import { hasM1ProblemArtifacts } from "../src/lib/extraction/m1-restoration";
import { stripProblemMarkers } from "../src/trigger/_lib/m1-passage-restoration/text-utils";
import {
  GROUNDED_RESTORATION_RULES,
  GROUNDED_SYSTEM_PROMPT,
} from "../src/lib/extraction/restoration/prompts/_grounded-instructions";
import { RESTORATION_CASES, type RestorationCase } from "./restoration-lite-corpus";

const API_KEY =
  process.env.GEMINI_API_KEY?.trim() ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
if (!API_KEY) {
  console.error("GEMINI_API_KEY가 .env에 없습니다.");
  process.exit(1);
}

// ─── 변형(variant) 정의 ─────────────────────────────────────────────────────

type PromptBuilder = (c: RestorationCase) => {
  systemPrompt: string;
  userPrompt: string;
};

const buildProdPrompts: PromptBuilder = (c) =>
  buildGroundedRestorationPrompts({
    problemText: c.rawText,
    questions: c.questions,
    problemEvidence: null,
    localSourceMatches: [],
  });

/**
 * lite 튜닝 프롬프트 — 프로덕션 프롬프트에 작업 순서·자가 점검 체크리스트를
 * 덧붙인다. flash-lite는 추론력이 약한 대신 지시 추종이 좋으므로, 판단을
 * 절차로 바꿔준다. (실패 패턴을 보고 라운드마다 보강)
 */
const LITE_WORK_ORDER: readonly string[] = [
  "## WORK ORDER — follow these steps IN ORDER, do not skip",
  "STEP 1. Copy the raw passage body. EXCLUDE: Korean instruction lines (발문), score tags like [3점], question numbers like `21.` or `[서답형1]`, choice list lines starting with ①~⑤, page numbers like `- 7 -`, and `<보기>` boxes.",
  "STEP 2. Scan the copied body and DELETE every problem marker IN PLACE: circled numbers ①②③④⑤ (and `( ① )` insertion slots), chunk labels `(A)`~`(Z)` at line/sentence starts, inline letter markers `(a)`~`(e)`. Delete ONLY the marker — keep the word(s) after it.",
  "STEP 3. Apply each question's answer to the body:",
  "  - blank `________` → replace with the [ANSWER_MARK] choice text (or the explanation's answer). If no answer is marked, SOLVE the question yourself from context and fill the blank with the best choice.",
  "  - grammar/vocab: the explanation tells you `X → Y`. Replace exactly X with Y at the marked spot. Never touch neighbouring words.",
  "  - ordering: output the chunks in the [ANSWER_MARK] order as ONE continuous paragraph.",
  "  - insertion: place the <보기> sentence at the [ANSWER_MARK] slot number.",
  "  - irrelevant sentence: delete the [ANSWER_MARK] sentence entirely.",
  "STEP 4. SELF-CHECK before emitting JSON — your restoredText must satisfy ALL of these:",
  "  [ ] no Korean characters EXCEPT word-gloss footnotes (`*word 한글뜻` lines, keep those verbatim)",
  "  [ ] no circled numbers ①~⑤ anywhere",
  "  [ ] no `(A)`/`(a)` style markers anywhere",
  "  [ ] no `________` blanks left",
  "  [ ] no choice texts appended at the end",
  "  [ ] every word that was in the raw body (minus markers/wrong forms) is still present — you did NOT paraphrase or drop sentences",
  "If any check fails, fix restoredText and re-check.",
];

const buildLiteTunedPrompts: PromptBuilder = (c) => {
  const prod = buildProdPrompts(c);
  return {
    systemPrompt: GROUNDED_SYSTEM_PROMPT,
    userPrompt: [
      LITE_WORK_ORDER.join("\n"),
      "",
      prod.userPrompt,
    ].join("\n"),
  };
};

interface Variant {
  model: string;
  build: PromptBuilder;
  thinkingBudget: number;
}

const VARIANTS: Record<string, Variant> = {
  "flash-prod": {
    model: "gemini-3.5-flash",
    build: buildProdPrompts,
    thinkingBudget: 0,
  },
  "lite-prod": {
    model: "gemini-3.1-flash-lite",
    build: buildProdPrompts,
    thinkingBudget: 0,
  },
  "lite-tuned": {
    model: "gemini-3.1-flash-lite",
    build: buildLiteTunedPrompts,
    thinkingBudget: 0,
  },
  "lite-think": {
    model: "gemini-3.1-flash-lite",
    build: buildProdPrompts,
    thinkingBudget: 1024,
  },
  "lite-tuned-think": {
    model: "gemini-3.1-flash-lite",
    build: buildLiteTunedPrompts,
    thinkingBudget: 1024,
  },
};

// ─── Gemini REST 호출 (프로덕션 postGeminiText와 동일 형태) ─────────────────

interface GeminiUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
}

async function callGemini(input: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  thinkingBudget: number;
}): Promise<{ rawText: string; usage: GeminiUsage; ms: number }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent?key=${encodeURIComponent(API_KEY!)}`;
  const body = {
    systemInstruction: { parts: [{ text: input.systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: input.userPrompt }] }],
    generationConfig: {
      temperature: 0,
      topK: 1,
      topP: 0,
      maxOutputTokens: 32768,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: input.thinkingBudget },
    },
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const started = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 180_000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const json = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
          finishReason?: string;
        }>;
        usageMetadata?: GeminiUsage;
        error?: { message?: string; status?: string };
      };
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        lastErr = new Error(
          `HTTP ${res.status}: ${json.error?.message ?? "?"}`,
        );
        if (!retryable) throw lastErr;
        await new Promise((r) => setTimeout(r, 4000));
        continue;
      }
      const text = (json.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("");
      if (!text) {
        lastErr = new Error(
          `EMPTY_OUTPUT (finishReason=${json.candidates?.[0]?.finishReason ?? "?"})`,
        );
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      return {
        rawText: text,
        usage: json.usageMetadata ?? {},
        ms: Date.now() - started,
      };
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** 프로덕션 sanitize와 동일 취지의 마크다운 코드펜스 제거. */
function sanitizeJson(raw: string): string {
  return raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

// ─── 채점 ───────────────────────────────────────────────────────────────────

const normWords = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const normText = (s: string): string => normWords(s).join(" ");

/** 단어 배열 LCS 유사도 (0~1). */
function wordSimilarity(a: string, b: string): number {
  const wa = normWords(a);
  const wb = normWords(b);
  if (wa.length === 0 || wb.length === 0) return 0;
  const dp: number[] = new Array(wb.length + 1).fill(0);
  for (let i = 1; i <= wa.length; i += 1) {
    let prev = 0;
    for (let j = 1; j <= wb.length; j += 1) {
      const tmp = dp[j];
      dp[j] = wa[i - 1] === wb[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[wb.length] / Math.max(wa.length, wb.length);
}

/** 특수문자(괄호·밑줄·한글·원문자)가 든 니들은 리터럴, 그 외는 정규화 비교. */
function textHas(haystack: string, needle: string): boolean {
  const literal = /[^a-zA-Z0-9\s'.,;:—-]/.test(needle);
  if (literal) {
    return haystack.replace(/\s+/g, " ").includes(needle.replace(/\s+/g, " "));
  }
  return normText(haystack).includes(normText(needle));
}

interface ModelChange {
  before: string;
  after: string;
  reason: string;
  evidenceType: string;
}

/** 단어 경계 인지 contains — "was" 가 "wasteland" 에 매칭되는 사고 방지. */
const wordHas = (haystack: string, needle: string): boolean =>
  ` ${normText(haystack)} `.includes(` ${normText(needle)} `);

interface CaseScore {
  caseId: string;
  category: string;
  pass: boolean;
  parseOk: boolean;
  markersClean: boolean;
  wordSim: number;
  failedMust: string[];
  failedMustNot: string[];
  anchorsOk: boolean;
  /** 검수 UI 근거(changes) 게이트 결과. */
  changesOk: boolean;
  failedChanges: string[];
  changeCount: number;
  /** 근거 reason 이 캐노니컬 포맷(Q… 접두)을 따르는 비율 (참고 지표). */
  reasonCanonicalRate: number;
  /** 복원 불가 케이스의 정직성 (PARTIAL/FAILED 보고 여부). */
  honestyOk: boolean;
  modelStatus: string;
  latencyMs: number;
  promptTokens: number;
  outputTokens: number;
  restoredPreview: string;
  /** 육안 검수용 전문 (JSON 저장에만 포함). */
  restoredFull: string;
  modelChanges: ModelChange[];
  error?: string;
}

function scoreCase(
  c: RestorationCase,
  restored: string,
  parseOk: boolean,
  modelStatus: string,
  changes: ModelChange[],
  latencyMs: number,
  usage: GeminiUsage,
  error?: string,
): CaseScore {
  const markersClean =
    !hasM1ProblemArtifacts(restored) &&
    // 복원 불가 케이스는 빈칸이 '보존돼야' 정상이므로 밑줄 검사를 제외.
    (c.expectUnresolved ? true : !/_{3,}/.test(restored)) &&
    !/[①-⑩]/.test(restored);
  const failedMust = c.mustContain.filter((m) => !textHas(restored, m));
  const failedMustNot = c.mustNotContain.filter((m) => textHas(restored, m));
  let anchorsOk = true;
  if (c.orderedAnchors) {
    const hay = normText(restored);
    let pos = 0;
    for (const anchor of c.orderedAnchors) {
      const idx = hay.indexOf(normText(anchor), pos);
      if (idx < 0) {
        anchorsOk = false;
        break;
      }
      pos = idx + 1;
    }
  }
  const wordSim = wordSimilarity(c.original, restored);
  const minSim = c.minWordSim ?? 0.93;

  // ── 검수 UI 근거(changes) 게이트 ──
  const failedChanges: string[] = [];
  for (const exp of c.expectedChanges ?? []) {
    const found = changes.some(
      (ch) =>
        (!exp.evidenceType || ch.evidenceType === exp.evidenceType) &&
        (!exp.afterIncludes || wordHas(ch.after, exp.afterIncludes)) &&
        (!exp.beforeIncludes || wordHas(ch.before, exp.beforeIncludes)),
    );
    if (!found) {
      failedChanges.push(
        `${exp.evidenceType ?? "*"}: ${exp.beforeIncludes ?? ""}→${exp.afterIncludes ?? ""}`,
      );
    }
  }
  const changesOk = failedChanges.length === 0;
  // 캐노니컬 reason 포맷 준수율 (Q… 접두) — 게이트가 아닌 참고 지표.
  const reasonCanonicalRate =
    changes.length === 0
      ? 1
      : Math.round(
          (changes.filter((ch) => /^Q\S{0,12}(:|\sanswer)/.test(ch.reason.trim()))
            .length /
            changes.length) *
            100,
        ) / 100;
  // 복원 불가 케이스 — RESTORED 로 과장 보고하면 실패.
  const honestyOk = c.expectUnresolved ? modelStatus !== "RESTORED" : true;

  const pass =
    parseOk &&
    markersClean &&
    failedMust.length === 0 &&
    failedMustNot.length === 0 &&
    anchorsOk &&
    changesOk &&
    honestyOk &&
    wordSim >= minSim;
  return {
    caseId: c.id,
    category: c.category,
    pass,
    parseOk,
    markersClean,
    wordSim: Math.round(wordSim * 1000) / 1000,
    failedMust,
    failedMustNot,
    anchorsOk,
    changesOk,
    failedChanges,
    changeCount: changes.length,
    reasonCanonicalRate,
    honestyOk,
    modelStatus,
    latencyMs,
    promptTokens: usage.promptTokenCount ?? 0,
    outputTokens:
      (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
    restoredPreview: restored.slice(0, 160),
    restoredFull: restored,
    modelChanges: changes,
    error,
  };
}

// ─── 실행 ───────────────────────────────────────────────────────────────────

async function runVariant(
  name: string,
  variant: Variant,
  cases: RestorationCase[],
): Promise<CaseScore[]> {
  console.log(
    `\n${"═".repeat(72)}\n■ variant: ${name} (model=${variant.model}, thinking=${variant.thinkingBudget})\n${"═".repeat(72)}`,
  );
  const scores: CaseScore[] = new Array(cases.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < cases.length) {
      const idx = cursor;
      cursor += 1;
      const c = cases[idx];
      const prompts = variant.build(c);
      try {
        const r = await callGemini({
          model: variant.model,
          systemPrompt: prompts.systemPrompt,
          userPrompt: prompts.userPrompt,
          thinkingBudget: variant.thinkingBudget,
        });
        let restored = "";
        let parseOk = false;
        let modelStatus = "PARSE_FAIL";
        let changes: ModelChange[] = [];
        try {
          const parsed = groundedRestorationResponseSchema.parse(
            JSON.parse(sanitizeJson(r.rawText)),
          );
          parseOk = true;
          modelStatus = parsed.finalStatus;
          changes = (parsed.aiRestoration.changes ?? []).map((ch) => ({
            before: ch.before,
            after: ch.after,
            reason: ch.reason,
            evidenceType: ch.evidenceType,
          }));
          restored = stripProblemMarkers(
            (
              parsed.finalRestoredText.trim() ||
              parsed.aiRestoration.restoredText.trim() ||
              ""
            ).trim(),
          );
        } catch {
          restored = "";
        }
        scores[idx] = scoreCase(
          c,
          restored,
          parseOk,
          modelStatus,
          changes,
          r.ms,
          r.usage,
        );
      } catch (err) {
        scores[idx] = scoreCase(
          c,
          "",
          false,
          "CALL_FAIL",
          [],
          0,
          {},
          err instanceof Error ? err.message : String(err),
        );
      }
      const s = scores[idx];
      console.log(
        `  [${s.pass ? "PASS" : "FAIL"}] ${c.id.padEnd(22)} sim=${s.wordSim.toFixed(3)} markers=${s.markersClean ? "ok" : "DIRTY"} ` +
          `must-=${s.failedMust.length} not+=${s.failedMustNot.length} anchors=${s.anchorsOk ? "ok" : "BAD"} ` +
          `chg=${s.changesOk ? "ok" : "BAD"}(${s.changeCount},Q${Math.round(s.reasonCanonicalRate * 100)}%) honest=${s.honestyOk ? "ok" : "LIE"} ` +
          `status=${s.modelStatus} ${s.latencyMs}ms ${s.promptTokens}/${s.outputTokens}tok` +
          (s.error ? ` ERROR=${s.error.slice(0, 80)}` : ""),
      );
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return scores;
}

function summarize(name: string, model: string, scores: CaseScore[]): void {
  const passed = scores.filter((s) => s.pass).length;
  const avgSim =
    scores.reduce((a, s) => a + s.wordSim, 0) / Math.max(1, scores.length);
  const parseFails = scores.filter((s) => !s.parseOk).length;
  const avgIn =
    scores.reduce((a, s) => a + s.promptTokens, 0) / Math.max(1, scores.length);
  const avgOut =
    scores.reduce((a, s) => a + s.outputTokens, 0) / Math.max(1, scores.length);
  const avgMs =
    scores.filter((s) => s.latencyMs > 0).reduce((a, s) => a + s.latencyMs, 0) /
    Math.max(1, scores.filter((s) => s.latencyMs > 0).length);
  // 단가(26-06 기준): 3.5-flash $1.50/$9.00, 3.1-flash-lite $0.25/$1.50 (per 1M)
  const [inP, outP] = model.includes("lite") ? [0.25, 1.5] : [1.5, 9.0];
  const costPerRestore = (avgIn * inP + avgOut * outP) / 1_000_000;
  const changesPassed = scores.filter((s) => s.changesOk).length;
  const avgCanonical =
    scores
      .filter((s) => s.changeCount > 0)
      .reduce((a, s) => a + s.reasonCanonicalRate, 0) /
    Math.max(1, scores.filter((s) => s.changeCount > 0).length);
  console.log(
    `\n  ◆ ${name}: ${passed}/${scores.length} PASS · avg sim ${avgSim.toFixed(3)} · parse fail ${parseFails} · ` +
      `근거 ${changesPassed}/${scores.length} (캐노니컬 reason ${Math.round(avgCanonical * 100)}%) · ` +
      `${Math.round(avgMs)}ms · ${Math.round(avgIn)}in/${Math.round(avgOut)}out tok · $${costPerRestore.toFixed(5)}/건`,
  );
  for (const s of scores.filter((x) => !x.pass)) {
    console.log(
      `    ✗ ${s.caseId}: ` +
        [
          !s.parseOk ? "JSON파싱실패" : null,
          !s.markersClean ? "마커잔존" : null,
          s.failedMust.length ? `누락[${s.failedMust.join(" | ")}]` : null,
          s.failedMustNot.length
            ? `잔존[${s.failedMustNot.join(" | ")}]`
            : null,
          !s.anchorsOk ? "순서불일치" : null,
          !s.changesOk ? `근거누락[${s.failedChanges.join(" | ")}]` : null,
          !s.honestyOk ? `과장보고(${s.modelStatus})` : null,
          s.wordSim < 0.93 ? `sim=${s.wordSim}` : null,
          s.error ? `호출실패:${s.error.slice(0, 60)}` : null,
        ]
          .filter(Boolean)
          .join(", "),
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  let caseFilter: string[] | null = null;
  const variantNames: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--cases") {
      caseFilter = (args[i + 1] ?? "").split(",").filter(Boolean);
      i += 1;
    } else {
      variantNames.push(args[i]);
    }
  }
  const selected =
    variantNames.length > 0 ? variantNames : ["flash-prod", "lite-prod"];
  const cases = caseFilter
    ? RESTORATION_CASES.filter((c) => caseFilter!.includes(c.id))
    : RESTORATION_CASES;
  console.log(
    `복원 하니스: ${cases.length}케이스 × [${selected.join(", ")}]`,
  );

  mkdirSync(resolve("c:/tmp/restoration-lite"), { recursive: true });
  const all: Record<string, CaseScore[]> = {};
  for (const name of selected) {
    const variant = VARIANTS[name];
    if (!variant) {
      console.error(`unknown variant: ${name} (${Object.keys(VARIANTS).join(", ")})`);
      continue;
    }
    const scores = await runVariant(name, variant, cases);
    all[name] = scores;
    writeFileSync(
      resolve(`c:/tmp/restoration-lite/${name}.json`),
      JSON.stringify(scores, null, 2),
      "utf8",
    );
  }

  console.log(`\n${"═".repeat(72)}\n■ 요약\n${"═".repeat(72)}`);
  for (const name of Object.keys(all)) {
    summarize(name, VARIANTS[name].model, all[name]);
  }
}

void main();
