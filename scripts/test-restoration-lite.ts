/* eslint-disable no-console */
// ============================================================================
// 吏臾?蹂듭썝 紐⑤뜽 ?泥?寃利??섎땲??(媛쒕컻????諛고룷? 臾닿?)
//
//   npx tsx scripts/test-restoration-lite.ts flash-prod lite-prod
//   npx tsx scripts/test-restoration-lite.ts lite-tuned
//   npx tsx scripts/test-restoration-lite.ts --cases blank-answered,ordering-answered lite-prod
//
// ?꾨줈?뺤뀡怨??숈씪???꾨＼?꾪듃 鍮뚮뜑쨌zod ?ㅽ궎留댟톀EST ?몄텧 ?뺥깭濡?// gemini-3.5-flash(?꾪뻾) vs gemini-3.1-flash-lite(?꾨낫)瑜?洹몃씪?대뱶?몃（??// 肄뷀띁?ㅼ뿉 ????ㅽ뻾?섍퀬 寃곗젙濡좎쟻?쇰줈 梨꾩젏?쒕떎.
// ============================================================================

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// .env ?섎룞 濡쒕뱶 (dotenv 誘몄꽕移???Next ?몃? ?ㅽ뻾?대?濡?吏곸젒 ?뚯떛)
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
    /* ?뚯씪 ?놁쑝硫?臾댁떆 */
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
  process.env.ATLASCLOUD_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim();
if (!API_KEY) {
  console.error("ATLASCLOUD_API_KEY or OPENROUTER_API_KEY is missing");
  process.exit(1);
}

// ??? 蹂??variant) ?뺤쓽 ?????????????????????????????????????????????????????

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
 * lite ?쒕떇 ?꾨＼?꾪듃 ???꾨줈?뺤뀡 ?꾨＼?꾪듃???묒뾽 ?쒖꽌쨌?먭? ?먭? 泥댄겕由ъ뒪?몃?
 * ?㏓텤?몃떎. flash-lite??異붾줎?μ씠 ?쏀븳 ???吏??異붿쥌??醫뗭쑝誘濡? ?먮떒?? * ?덉감濡?諛붽퓭以?? (?ㅽ뙣 ?⑦꽩??蹂닿퀬 ?쇱슫?쒕쭏??蹂닿컯)
 */
const LITE_WORK_ORDER: readonly string[] = [
  "## WORK ORDER ??follow these steps IN ORDER, do not skip",
  "STEP 1. Copy the raw passage body. EXCLUDE: Korean instruction lines (諛쒕Ц), score tags like [3??, question numbers like `21.` or `[?쒕떟??]`, choice list lines starting with ???? page numbers like `- 7 -`, and `<蹂닿린>` boxes.",
  "STEP 2. Scan the copied body and DELETE every problem marker IN PLACE: circled numbers ?졻몼?™몿??(and `( ??)` insertion slots), chunk labels `(A)`~`(Z)` at line/sentence starts, inline letter markers `(a)`~`(e)`. Delete ONLY the marker ??keep the word(s) after it.",
  "STEP 3. Apply each question's answer to the body:",
  "  - blank `________` ??replace with the [ANSWER_MARK] choice text (or the explanation's answer). If no answer is marked, SOLVE the question yourself from context and fill the blank with the best choice.",
  "  - grammar/vocab: the explanation tells you `X ??Y`. Replace exactly X with Y at the marked spot. Never touch neighbouring words.",
  "  - ordering: output the chunks in the [ANSWER_MARK] order as ONE continuous paragraph.",
  "  - insertion: place the <蹂닿린> sentence at the [ANSWER_MARK] slot number.",
  "  - irrelevant sentence: delete the [ANSWER_MARK] sentence entirely.",
  "STEP 4. SELF-CHECK before emitting JSON ??your restoredText must satisfy ALL of these:",
  "  [ ] no Korean characters EXCEPT word-gloss footnotes (`*word ?쒓??? lines, keep those verbatim)",
  "  [ ] no circled numbers ????anywhere",
  "  [ ] no `(A)`/`(a)` style markers anywhere",
  "  [ ] no `________` blanks left",
  "  [ ] no choice texts appended at the end",
  "  [ ] every word that was in the raw body (minus markers/wrong forms) is still present ??you did NOT paraphrase or drop sentences",
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
    model: "google/gemini-3.5-flash",
    build: buildProdPrompts,
    thinkingBudget: 0,
  },
  "lite-prod": {
    model: "google/gemini-3.1-flash-lite",
    build: buildProdPrompts,
    thinkingBudget: 0,
  },
  "lite-tuned": {
    model: "google/gemini-3.1-flash-lite",
    build: buildLiteTunedPrompts,
    thinkingBudget: 0,
  },
  "lite-think": {
    model: "google/gemini-3.1-flash-lite",
    build: buildProdPrompts,
    thinkingBudget: 1024,
  },
  "lite-tuned-think": {
    model: "google/gemini-3.1-flash-lite",
    build: buildLiteTunedPrompts,
    thinkingBudget: 1024,
  },
};

// ??? Gemini REST ?몄텧 (?꾨줈?뺤뀡 postGeminiText? ?숈씪 ?뺥깭) ?????????????????

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
  const { postAtlasChatCompletionAsGeminiLike } = await import("../src/lib/atlas-chat-rest");
  void input.thinkingBudget;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const started = Date.now();
    try {
      const json = await postAtlasChatCompletionAsGeminiLike({
        model: input.model,
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
        temperature: 0,
        topP: 0,
        maxOutputTokens: 32768,
        responseMimeType: "application/json",
        timeoutInMs: 180_000,
      });
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

/** ?꾨줈?뺤뀡 sanitize? ?숈씪 痍⑥???留덊겕?ㅼ슫 肄붾뱶?쒖뒪 ?쒓굅. */
function sanitizeJson(raw: string): string {
  return raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

// ??? 梨꾩젏 ???????????????????????????????????????????????????????????????????

const normWords = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const normText = (s: string): string => normWords(s).join(" ");

/** ?⑥뼱 諛곗뿴 LCS ?좎궗??(0~1). */
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

/** ?뱀닔臾몄옄(愿꾪샇쨌諛묒쨪쨌?쒓?쨌?먮Ц??媛 ???덈뱾? 由ы꽣?? 洹??몃뒗 ?뺢퇋??鍮꾧탳. */
function textHas(haystack: string, needle: string): boolean {
  const literal = /[^a-zA-Z0-9\s'.,;:??]/.test(needle);
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

/** ?⑥뼱 寃쎄퀎 ?몄? contains ??"was" 媛 "wasteland" ??留ㅼ묶?섎뒗 ?ш퀬 諛⑹?. */
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
  /** 寃??UI 洹쇨굅(changes) 寃뚯씠??寃곌낵. */
  changesOk: boolean;
  failedChanges: string[];
  changeCount: number;
  /** 洹쇨굅 reason ??罹먮끂?덉뺄 ?щ㎎(Q???묐몢)???곕Ⅴ??鍮꾩쑉 (李멸퀬 吏??. */
  reasonCanonicalRate: number;
  /** 蹂듭썝 遺덇? 耳?댁뒪???뺤쭅??(PARTIAL/FAILED 蹂닿퀬 ?щ?). */
  honestyOk: boolean;
  modelStatus: string;
  latencyMs: number;
  promptTokens: number;
  outputTokens: number;
  restoredPreview: string;
  /** ?≪븞 寃?섏슜 ?꾨Ц (JSON ??μ뿉留??ы븿). */
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
    // 蹂듭썝 遺덇? 耳?댁뒪??鍮덉뭏??'蹂댁〈?쇱빞' ?뺤긽?대?濡?諛묒쨪 寃?щ? ?쒖쇅.
    (c.expectUnresolved ? true : !/_{3,}/.test(restored)) &&
    !/[????/.test(restored);
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

  // ?? 寃??UI 洹쇨굅(changes) 寃뚯씠????
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
        `${exp.evidenceType ?? "*"}: ${exp.beforeIncludes ?? ""}??{exp.afterIncludes ?? ""}`,
      );
    }
  }
  const changesOk = failedChanges.length === 0;
  // 罹먮끂?덉뺄 reason ?щ㎎ 以?섏쑉 (Q???묐몢) ??寃뚯씠?멸? ?꾨땶 李멸퀬 吏??
  const reasonCanonicalRate =
    changes.length === 0
      ? 1
      : Math.round(
          (changes.filter((ch) => /^Q\S{0,12}(:|\sanswer)/.test(ch.reason.trim()))
            .length /
            changes.length) *
            100,
        ) / 100;
  // 蹂듭썝 遺덇? 耳?댁뒪 ??RESTORED 濡?怨쇱옣 蹂닿퀬?섎㈃ ?ㅽ뙣.
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

// ??? ?ㅽ뻾 ???????????????????????????????????????????????????????????????????

async function runVariant(
  name: string,
  variant: Variant,
  cases: RestorationCase[],
): Promise<CaseScore[]> {
  console.log(
    `\n${"??.repeat(72)}\n??variant: ${name} (model=${variant.model}, thinking=${variant.thinkingBudget})\n${"??.repeat(72)}`,
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
  // ?④?(26-06 湲곗?): 3.5-flash $1.50/$9.00, 3.1-flash-lite $0.25/$1.50 (per 1M)
  const [inP, outP] = model.includes("lite") ? [0.25, 1.5] : [1.5, 9.0];
  const costPerRestore = (avgIn * inP + avgOut * outP) / 1_000_000;
  const changesPassed = scores.filter((s) => s.changesOk).length;
  const avgCanonical =
    scores
      .filter((s) => s.changeCount > 0)
      .reduce((a, s) => a + s.reasonCanonicalRate, 0) /
    Math.max(1, scores.filter((s) => s.changeCount > 0).length);
  console.log(
    `\n  ??${name}: ${passed}/${scores.length} PASS 쨌 avg sim ${avgSim.toFixed(3)} 쨌 parse fail ${parseFails} 쨌 ` +
      `洹쇨굅 ${changesPassed}/${scores.length} (罹먮끂?덉뺄 reason ${Math.round(avgCanonical * 100)}%) 쨌 ` +
      `${Math.round(avgMs)}ms 쨌 ${Math.round(avgIn)}in/${Math.round(avgOut)}out tok 쨌 $${costPerRestore.toFixed(5)}/嫄?,
  );
  for (const s of scores.filter((x) => !x.pass)) {
    console.log(
      `    ??${s.caseId}: ` +
        [
          !s.parseOk ? "JSON?뚯떛?ㅽ뙣" : null,
          !s.markersClean ? "留덉빱?붿〈" : null,
          s.failedMust.length ? `?꾨씫[${s.failedMust.join(" | ")}]` : null,
          s.failedMustNot.length
            ? `?붿〈[${s.failedMustNot.join(" | ")}]`
            : null,
          !s.anchorsOk ? "?쒖꽌遺덉씪移? : null,
          !s.changesOk ? `洹쇨굅?꾨씫[${s.failedChanges.join(" | ")}]` : null,
          !s.honestyOk ? `怨쇱옣蹂닿퀬(${s.modelStatus})` : null,
          s.wordSim < 0.93 ? `sim=${s.wordSim}` : null,
          s.error ? `?몄텧?ㅽ뙣:${s.error.slice(0, 60)}` : null,
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
    `蹂듭썝 ?섎땲?? ${cases.length}耳?댁뒪 횞 [${selected.join(", ")}]`,
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

  console.log(`\n${"??.repeat(72)}\n???붿빟\n${"??.repeat(72)}`);
  for (const name of Object.keys(all)) {
    summarize(name, VARIANTS[name].model, all[name]);
  }
}

void main();
