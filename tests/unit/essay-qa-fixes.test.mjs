import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";

// 이 세션의 서술형 QA 수정(wave 1~3)이 "실제로 동작"하는지 결정론적으로 증명한다.
// 실 모듈을 tsx 로 import 해 새 게이트/헬퍼/프롬프트 분기를 직접 호출하고, 나쁜 입력에
// 발화하고 정상 입력을 안 막는지 확인한다. (LLM 생성 품질은 별도 — 이건 로직 검증.)

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import quality from "@/lib/question-quality";
import core from "@/lib/question-quality/core";
import settings from "@/lib/question-type-generation-settings";
import tsw from "@/lib/topic-sentence-writing";
import persistence from "@/lib/question-generation-persistence";
import answerKey from "@/components/exams/paper-builder/answer-key-layout";
import paperUtils from "@/components/exams/paper-builder/paper-item-utils";

const { validateQuestionQuality } = quality;
const { answerRunInPassage } = core;
const { reorderChipsAwayFromAnswer, chipsAreInAnswerOrder } = tsw;
const { buildQuestionTypeSettingsPrompt, resolveSummaryWritingSettings, getDefaultQuestionTypeGenerationSettings } = settings;
const { buildGeneratedQuestionText } = persistence;
const { buildAnswerKeyLayout } = answerKey;
const { joinRenderedLinesForDisplay } = paperUtils;

const codes = (issues) => issues.map((i) => i.code);
const out = {};

// ── 1. 정답표 클립(30~36 소실) 수정: 긴 정답 53개가 페이지에 다 담기는가 ──
{
  const longSentence = "Although statistics seem to represent objective realities, their classification frameworks are artificially constructed to serve state purposes.";
  const items = Array.from({ length: 53 }, (_, i) => ({
    blockType: "question",
    orderNum: i + 1,
    correctAnswer: i % 2 === 0 ? longSentence : "profit",
    sourceQuestion: { subType: "SENTENCE_TRANSFORM", type: "ESSAY", correctAnswer: "", structuredData: null },
  }));
  const layout = buildAnswerKeyLayout(items, { paperSize: "A4", density: "comfortable" });
  const flat = layout.pages.flat();
  const nums = flat.map((e) => e.orderNum).sort((a, b) => a - b);
  const missing = [];
  for (let n = 1; n <= 53; n++) if (!nums.includes(n)) missing.push(n);
  out.answerKey = { mode: layout.mode, pages: layout.pages.length, total: flat.length, missing };
}

// ── 2. answerRunInPassage(영작형 verbatim 누수 헬퍼) ──
{
  const passage = "Researchers can neutralize the impact by aggregating data from many diverse places across the basin.";
  out.verbatimHelper = {
    leak: answerRunInPassage("aggregating data from various localized sources", passage, 3),
    clean: answerRunInPassage("combine numerous regional readings together", passage, 3),
  };
}

// ── 3. SUMMARY_WRITING 정답↔지문 verbatim 게이트(warning) ──
{
  const passage = "By aggregating data from diverse localized sources, researchers can neutralize erratic volatility.";
  const leakQ = { difficulty: "INTERMEDIATE", modelAnswer: "aggregating data from various localized sources", summaryWithBlanks: "By (A), researchers neutralize noise.", blanks: [{ label: "(A)", answer: "aggregating data from various localized sources" }] };
  const cleanQ = { difficulty: "INTERMEDIATE", modelAnswer: "combining many regional readings", summaryWithBlanks: "By (A), researchers neutralize noise.", blanks: [{ label: "(A)", answer: "combining many regional readings" }] };
  out.swVerbatim = {
    leak: codes(validateQuestionQuality({ typeId: "SUMMARY_WRITING", question: leakQ, passage })).filter((c) => c === "writing-answer-verbatim-in-passage"),
    clean: codes(validateQuestionQuality({ typeId: "SUMMARY_WRITING", question: cleanQ, passage })).filter((c) => c === "writing-answer-verbatim-in-passage"),
  };
}

// ── 4. SUMMARY_COMPLETE 신규 검증기(정답이 요약문에 노출) ──
{
  const leakQ = { summaryWithBlanks: "The result matters for (A) matters here.", blanks: [{ label: "(A)", answer: "matters" }] };
  const cleanQ = { summaryWithBlanks: "The (A) is the key indicator.", blanks: [{ label: "(A)", answer: "consciousness" }] };
  out.summaryComplete = {
    leak: codes(validateQuestionQuality({ typeId: "SUMMARY_COMPLETE", question: leakQ })).filter((c) => c.startsWith("summary-complete")),
    clean: codes(validateQuestionQuality({ typeId: "SUMMARY_COMPLETE", question: cleanQ })).filter((c) => c.startsWith("summary-complete")),
  };
}

// ── 5. FILL_BLANK_KEY 게이트(빈칸 2개 / 정답 잔존 / 정상) ──
{
  const twoBlanks = { passageWithBlank: "for-_____ companies take a cut, driven by _____ every day.", sentenceWithBlank: "for-_____ companies take a cut, driven by _____ every day.", answer: "profit" };
  const residual = { passageWithBlank: "the _____ motive drives profit in every transaction here.", sentenceWithBlank: "the _____ motive drives profit in every transaction here.", answer: "profit" };
  const clean = { sentenceWithBlank: "the _____ motive drives every transaction here.", answer: "profit" };
  out.fillBlank = {
    twoBlanks: codes(validateQuestionQuality({ typeId: "FILL_BLANK_KEY", question: twoBlanks })).filter((c) => c.startsWith("fbk")),
    residual: codes(validateQuestionQuality({ typeId: "FILL_BLANK_KEY", question: residual })).filter((c) => c.startsWith("fbk")),
    clean: codes(validateQuestionQuality({ typeId: "FILL_BLANK_KEY", question: clean })).filter((c) => c.startsWith("fbk")),
  };
}

// ── 6. WORD_ORDER 어순 누수 게이트 + 2청크 재배열 ──
{
  const inOrder = { scrambledWords: ["The state", "utilizes", "quantitative statistics", "to construct"], modelAnswer: "The state utilizes quantitative statistics to construct" };
  out.wordOrder = {
    inOrder: codes(validateQuestionQuality({ typeId: "WORD_ORDER", question: inOrder })).filter((c) => c.startsWith("scrambled")),
    twoChunkReorderStillOrdered: chipsAreInAnswerOrder(
      reorderChipsAwayFromAnswer(["alpha beta", "gamma delta"], "alpha beta gamma delta"),
      "alpha beta gamma delta",
    ),
  };
}

// ── 7. SW 난이도 실차별화 + getDefault 핀 제거 + KILLER+literal F-rule ──
{
  const basic = resolveSummaryWritingSettings({}, "BASIC");
  const killer = resolveSummaryWritingSettings({}, "KILLER");
  const def = getDefaultQuestionTypeGenerationSettings().SUMMARY_WRITING || {};
  const contentKeys = ["glossLooseness", "wordBankUsage", "clueMode", "summarySourceMode", "wordBankFidelity", "blankAssignment", "connectorFrame"];
  out.swDifficulty = {
    basicVsKillerDiffer:
      basic.summarySourceMode !== killer.summarySourceMode ||
      basic.glossEnabled !== killer.glossEnabled ||
      basic.wordBankUsage !== killer.wordBankUsage,
    basicSourceMode: basic.summarySourceMode,
    killerSourceMode: killer.summarySourceMode,
    defaultPinnedContentKeys: contentKeys.filter((k) => k in def),
    // F-rule 은 해석이 실제로 켜져 있을 때만 의미(꺼져 있으면 gloss 미표시라 무의미).
    killerLiteralForced: resolveSummaryWritingSettings({ glossEnabled: true, glossLooseness: "literal" }, "KILLER").glossLooseness,
    basicLiteralKept: resolveSummaryWritingSettings({ glossEnabled: true, glossLooseness: "literal" }, "BASIC").glossLooseness,
  };
}

// ── 8. 죽은 옵션이 이제 프롬프트를 실제로 바꾸는가 ──
{
  const p = (raw) => buildQuestionTypeSettingsPrompt("SUMMARY_WRITING", raw, "INTERMEDIATE");
  const t = (raw) => buildQuestionTypeSettingsPrompt("TOPIC_SENTENCE_WRITING", raw, "INTERMEDIATE");
  out.deadKnobs = {
    glossLooseness: p({ glossLooseness: "literal" }) !== p({ glossLooseness: "gist" }),
    wordBankOrder: p({ wordBankUsage: "usePartial", wordBankOrder: "alphabetical" }) !== p({ wordBankUsage: "usePartial", wordBankOrder: "scrambleStrong" }),
    connectorFrame: p({ connectorFrame: "full" }) !== p({ connectorFrame: "partial" }),
    scoringGranularity: p({ scoringGranularity: "exact" }) !== p({ scoringGranularity: "rubric" }),
    freeCount: p({ wordBankUsage: "freeCount" }).includes("freeCount"),
    tswScrambleOrder: t({ mode: "scrambled", scrambleOrder: "scrambleStrong" }) !== t({ mode: "scrambled", scrambleOrder: "random" }),
    tswChunkingMixed: t({ mode: "scrambled", chunking: "mixed" }).toLowerCase().includes("mixed"),
  };
}

// ── 9. FILL_BLANK_KEY 직렬화 상호배타(빈칸 문장 지문끝 중복 제거) ──
{
  const q = { _typeId: "FILL_BLANK_KEY", direction: "다음 빈칸에 알맞은 말을 쓰시오.", passageWithBlank: "The gig economy takes advantage of _____ to utilize assets.", sentenceWithBlank: "The gig economy takes advantage of _____ to utilize assets.", answer: "idle capacity" };
  const text = buildGeneratedQuestionText(q);
  const occurrences = text.split("takes advantage of").length - 1;
  out.fillBlankSerialize = { occurrences };
}

// ── 10. [조건] 번호 목록이 한 줄로 뭉개지지 않는가 (렌더 join) ──
{
  const condLines = [
    "[영작할 우리말] 측정되고 있는 대상들은 실제로 존재한다는 것을 생각하기는 어렵다.",
    "",
    "[조건]",
    "1. 가주어 it 을 사용할 것",
    "2. that 명사절 두 개를 and 로 연결할 것",
    "3. 제시어를 모두 사용할 것",
  ];
  const body = joinRenderedLinesForDisplay(condLines, { keepListBreaks: true });
  const prose = joinRenderedLinesForDisplay([
    "This is one sentence.",
    "This is another that continues.",
    "And a third.",
  ]);
  out.conditionRender = {
    bodyLineCount: body.split("\\n").filter((l) => l.trim()).length,
    cond1OnOwnLine: /(^|\\n)1\\. /.test(body),
    cond2OnOwnLine: /(^|\\n)2\\. /.test(body),
    label조건OnOwnLine: /(^|\\n)\\[조건\\]/.test(body),
    proseStaysSingleLine: !prose.includes("\\n"),
  };
}

console.log(JSON.stringify(out));
`;

function runHarness() {
  const harnessPath = path.join(repoRoot, "tests", "unit", ".essay-qa-fixes-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
    return JSON.parse(raw);
  } finally {
    try {
      rmSync(harnessPath);
    } catch {
      /* ignore */
    }
  }
}

const result = runHarness();

test("answer key: all 53 long-answer entries survive pagination (no 30~36-style clip)", () => {
  assert.equal(result.answerKey.mode, "list");
  assert.equal(result.answerKey.total, 53);
  assert.deepEqual(result.answerKey.missing, []);
});

test("answerRunInPassage flags a verbatim answer run and clears a paraphrase", () => {
  assert.match(result.verbatimHelper.leak, /aggregating data from/);
  assert.equal(result.verbatimHelper.clean, "");
});

test("SUMMARY_WRITING warns when the answer is verbatim in the passage, not on a paraphrase", () => {
  assert.deepEqual(result.swVerbatim.leak, ["writing-answer-verbatim-in-passage"]);
  assert.deepEqual(result.swVerbatim.clean, []);
});

test("SUMMARY_COMPLETE validator catches an answer leaked into the summary", () => {
  assert.ok(result.summaryComplete.leak.includes("summary-complete-answer-leaks-in-summary"));
  assert.deepEqual(result.summaryComplete.clean, []);
});

test("FILL_BLANK_KEY gates: multiple blanks and residual answer are rejected, clean passes", () => {
  assert.ok(result.fillBlank.twoBlanks.includes("fbk-multiple-blanks"));
  assert.ok(result.fillBlank.residual.includes("fbk-answer-residual-leak"));
  assert.deepEqual(result.fillBlank.clean, []);
});

test("WORD_ORDER: near/exact answer-order chips are rejected; 2-chunk reorder breaks the order", () => {
  assert.ok(result.wordOrder.inOrder.length > 0);
  assert.equal(result.wordOrder.twoChunkReorderStillOrdered, false);
});

test("SUMMARY_WRITING difficulty now differentiates and getDefault no longer pins content knobs", () => {
  assert.equal(result.swDifficulty.basicVsKillerDiffer, true);
  assert.notEqual(result.swDifficulty.basicSourceMode, result.swDifficulty.killerSourceMode);
  assert.deepEqual(result.swDifficulty.defaultPinnedContentKeys, []);
  assert.equal(result.swDifficulty.killerLiteralForced, "natural"); // KILLER+literal → natural (F-rule)
  assert.equal(result.swDifficulty.basicLiteralKept, "literal"); // BASIC keeps literal
});

test("dead knobs now actually change the generation prompt", () => {
  assert.equal(result.deadKnobs.glossLooseness, true);
  assert.equal(result.deadKnobs.wordBankOrder, true);
  assert.equal(result.deadKnobs.connectorFrame, true);
  assert.equal(result.deadKnobs.scoringGranularity, true);
  assert.equal(result.deadKnobs.freeCount, true);
  assert.equal(result.deadKnobs.tswScrambleOrder, true);
  assert.equal(result.deadKnobs.tswChunkingMixed, true);
});

test("FILL_BLANK_KEY serialization no longer duplicates the blank sentence", () => {
  assert.equal(result.fillBlankSerialize.occurrences, 1);
});

test("[조건] numbered list renders as separate lines (not one collapsed blob)", () => {
  assert.ok(result.conditionRender.bodyLineCount >= 5); // 라벨문단 + [조건] + 3항목
  assert.equal(result.conditionRender.cond1OnOwnLine, true);
  assert.equal(result.conditionRender.cond2OnOwnLine, true);
  assert.equal(result.conditionRender["label조건OnOwnLine"], true);
  assert.equal(result.conditionRender.proseStaysSingleLine, true); // 지문 프로즈 무회귀
});
