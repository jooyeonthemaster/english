// 문제 카드 "문제 복사 / 문제＋해설 복사" 클립보드 직렬화의 지문(passage) 부착 검증.
// 버그: 일부 유형에서 복사 시 지문이 딸려오지 않았다(출처지문형·국어·세트멤버).
// 규약:
//   - embedded 유형(어법·빈칸·삽입 등): 마스킹 지문이 이미 questionText 에 있으므로
//     아무것도 안 붙인다(원본 raw 붙이면 정답 누출·중복). 지문 유무와 무관하게 출력 동일.
//   - source 유형(주제·요지·제목·요약영작 등): q.passage.content 를 붙인다.
//   - answer-bearing(조건부영작·문장전환): 문제만 모드 생략, 문제＋해설 포함.
//   - KO(국어): model.passage.parts(마스킹/병합본)만 붙이고 자체자료(【자료】)는 재부착 금지.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import * as clipboardModule from "@/components/workbench/question-bank-card/build-clipboard-text";
const clip = clipboardModule.default ?? clipboardModule["module.exports"] ?? clipboardModule;
const { buildQuestionClipboardText, buildQuestionClipboardHtml } = clip;

// 원본 지문에만 등장하는 표식 토큰(부착 여부 판정용).
const TOKEN = "Zephyrqual";

function q(overrides) {
  return {
    id: (overrides.subType || "x").toLowerCase(),
    type: "MULTIPLE_CHOICE",
    subType: null,
    questionText: "",
    options: JSON.stringify([
      { label: "①", text: "one" },
      { label: "②", text: "two" },
    ]),
    correctAnswer: "①",
    difficulty: "BASIC",
    tags: null,
    aiGenerated: true,
    approved: true,
    starred: false,
    createdAt: new Date(0).toISOString(),
    passage: null,
    explanation: { id: "e", content: "해설 본문", keyPoints: null },
    _count: { examLinks: 0 },
    structuredData: undefined,
    ...overrides,
  };
}
function withPassage(base, content) {
  return { ...base, passage: { id: "p", title: "", content, grade: null, semester: null, publisher: null, school: null } };
}

// ── embedded: BLANK_INFERENCE ── 마스킹 지문은 questionText 안, 정답 단어는 photosynthesis
const blankQt =
  "다음 빈칸에 들어갈 말로 가장 적절한 것은?\\n\\n" +
  TOKEN + " archives store _____ for later retrieval.";
const blankRaw = TOKEN + " archives store photosynthesis for later retrieval.";
const blankBase = q({ subType: "BLANK_INFERENCE", questionText: blankQt, correctAnswer: "photosynthesis" });
const blankNoPassage = buildQuestionClipboardText(blankBase, { includeAnswer: false });
const blankWithPassage = buildQuestionClipboardText(withPassage(blankBase, blankRaw), { includeAnswer: false });

// ── embedded: GRAMMAR_ERROR ── 마커 지문은 questionText 안
const grammarQt =
  "다음 밑줄 친 부분 중 어법상 틀린 것은?\\n\\n" +
  TOKEN + " archives __(A) stores__ data and __(B) retrieve__ it.";
const grammarRaw = TOKEN + " archives store data and retrieves it.";
const grammarBase = q({ subType: "GRAMMAR_ERROR", questionText: grammarQt, options: JSON.stringify([]) });
const grammarNoPassage = buildQuestionClipboardText(grammarBase, { includeAnswer: false });
const grammarWithPassage = buildQuestionClipboardText(withPassage(grammarBase, grammarRaw), { includeAnswer: false });

// ── source: TOPIC ── 발문만 questionText, 지문은 q.passage.content
const topicRaw = TOKEN + " archives store information for later retrieval. Recall and recognition differ.";
const topicBase = q({ subType: "TOPIC", questionText: "다음 글의 주제로 가장 적절한 것은?" });
const topicNoPassage = buildQuestionClipboardText(topicBase, { includeAnswer: false });
const topicWithPassage = buildQuestionClipboardText(withPassage(topicBase, topicRaw), { includeAnswer: false });
const topicHtml = buildQuestionClipboardHtml(withPassage(topicBase, topicRaw), { includeAnswer: false });

// ── answer-bearing: CONDITIONAL_WRITING ── 문제만 생략, 문제＋해설 포함
const condQt =
  "다음 우리말을 영작하시오.\\n\\n[영작할 우리말] 기록보관소는 정보를 저장한다.\\n\\n[조건]\\n1. archive 사용.";
const condRaw = TOKEN + " archives store information.";
const condBase = q({ subType: "CONDITIONAL_WRITING", questionText: condQt, options: JSON.stringify([]) });
const condQuestionOnly = buildQuestionClipboardText(withPassage(condBase, condRaw), { includeAnswer: false });
const condFull = buildQuestionClipboardText(withPassage(condBase, condRaw), { includeAnswer: true });

// ── source underline: WORD_ORDER ──
const wordOrderRaw = TOKEN + " archives store information for retrieval.";
const wordOrderBase = q({
  subType: "WORD_ORDER",
  questionText: "다음 단어를 배열하시오.\\n\\n[배열 단어] information / store / archives",
  structuredData: JSON.stringify({ originalSentence: "archives store information" }),
  options: JSON.stringify([]),
});
const wordOrderWithPassage = buildQuestionClipboardText(withPassage(wordOrderBase, wordOrderRaw), { includeAnswer: false });

// ── KO: KO_RD_FACT ── 지문은 model.passage.parts, questionText 는 발문만
const koPassage = TOKEN + " 기록보관소는 정보를 저장한다. 회상과 재인은 서로 다르다.";
const koBase = q({
  subType: "KO_RD_FACT",
  questionText: "윗글의 내용과 일치하지 않는 것은?",
  structuredData: JSON.stringify({
    _typeId: "KO_RD_FACT",
    direction: "윗글의 내용과 일치하지 않는 것은?",
    stemPolarity: "NEGATIVE",
    distortionPrinciple: "AGENT_SWAP",
    options: [
      { label: "①", text: "가" }, { label: "②", text: "나" }, { label: "③", text: "다" },
      { label: "④", text: "라" }, { label: "⑤", text: "마" },
    ],
  }),
  options: JSON.stringify([
    { label: "①", text: "가" }, { label: "②", text: "나" }, { label: "③", text: "다" },
    { label: "④", text: "라" }, { label: "⑤", text: "마" },
  ]),
});
const koNoPassage = buildQuestionClipboardText(koBase, { includeAnswer: false });
const koWithPassage = buildQuestionClipboardText(withPassage(koBase, koPassage), { includeAnswer: false });

// ── de-dup: SENTENCE_TRANSFORM 문제＋해설 — [원문] 문장이 지문에 밑줄로 들어가므로 중복 제거 ──
const stOriginal = "recall forces the brain to work in a vacuum";
const stRaw = TOKEN + " archives store data. " + stOriginal + ". End of text.";
const stBase = q({
  subType: "SENTENCE_TRANSFORM",
  questionText:
    "다음 밑줄 친 문장을 조건에 맞게 바꿔 쓰시오.\\n\\n[원문] " + stOriginal + ".\\n\\n[조건]\\n1. Without 으로 시작.",
  structuredData: JSON.stringify({ originalSentence: stOriginal }),
  options: JSON.stringify([]),
});
const stFull = buildQuestionClipboardText(withPassage(stBase, stRaw), { includeAnswer: true });

// ── grouped view 시나리오: passage.content="" 여도 크래시 없이 지문 없이 폴백 ──
const emptyContentTopic = buildQuestionClipboardText(withPassage(topicBase, ""), { includeAnswer: false });

function count(hay, needle) {
  let n = 0, i = 0;
  for (;;) { const j = hay.indexOf(needle, i); if (j < 0) break; n++; i = j + needle.length; }
  return n;
}

process.stdout.write(JSON.stringify({
  TOKEN,
  blankNoPassage, blankWithPassage,
  blankTokenCount: count(blankWithPassage, TOKEN),
  blankHasAnswerWord: blankWithPassage.includes("photosynthesis"),
  grammarNoPassage, grammarWithPassage,
  grammarTokenCount: count(grammarWithPassage, TOKEN),
  grammarHasRawClean: grammarWithPassage.includes("archives store data and retrieves it"),
  topicNoPassage, topicWithPassage, topicHtml,
  topicTokenCount: count(topicWithPassage, TOKEN),
  condQuestionOnly, condFull,
  wordOrderWithPassage,
  koNoPassage, koWithPassage,
  koTokenCount: count(koWithPassage, TOKEN),
  stFull,
  stOriginal,
  stOriginalCount: count(stFull, stOriginal),
  emptyContentTopic,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".clipboard-passage-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    try { rmSync(harnessPath); } catch {
      /* ignore */
    }
  }
}

const r = runHarness();

test("embedded types attach nothing: output identical with/without q.passage (no regression)", () => {
  assert.equal(r.blankWithPassage, r.blankNoPassage, "BLANK_INFERENCE copy must not change when q.passage is present");
  assert.equal(r.grammarWithPassage, r.grammarNoPassage, "GRAMMAR_ERROR copy must not change when q.passage is present");
});

test("embedded types do not leak the raw (unmasked) passage / answer", () => {
  // 마스킹된 빈칸은 남고, 원본 정답 단어(photosynthesis)는 절대 노출되지 않는다.
  assert.ok(r.blankWithPassage.includes("_____"), "masked blank must remain");
  assert.equal(r.blankHasAnswerWord, false, "raw answer word must not leak");
  assert.equal(r.blankTokenCount, 1, "passage token must appear once (no double passage)");
  // 어법: 마커본(questionText)만 남고 원본 정답(틀린 곳 없는 clean 문장)은 노출 안 됨.
  assert.equal(r.grammarHasRawClean, false, "raw clean grammar sentence must not leak");
  assert.equal(r.grammarTokenCount, 1, "grammar passage token must appear once");
});

test("source type TOPIC now attaches the passage (bug fix)", () => {
  assert.equal(r.topicNoPassage.includes(r.TOKEN), false, "no passage row → no token");
  assert.ok(r.topicWithPassage.includes(r.TOKEN), "TOPIC copy must include the source passage");
  assert.ok(r.topicWithPassage.includes("Recall and recognition differ"), "full passage text attached");
  assert.equal(r.topicTokenCount, 1, "passage attached exactly once");
  // 순서: 발문 → 지문
  const dirIdx = r.topicWithPassage.indexOf("주제로 가장 적절한");
  const psgIdx = r.topicWithPassage.indexOf(r.TOKEN);
  assert.ok(dirIdx >= 0 && psgIdx > dirIdx, "발문 must come before 지문");
  // HTML 직렬화도 지문을 포함한다(서식 유지 복사).
  assert.ok(r.topicHtml.includes(r.TOKEN), "HTML copy must include the passage");
});

test("answer-bearing CONDITIONAL_WRITING omits passage in 문제만, includes it in 문제＋해설", () => {
  assert.equal(r.condQuestionOnly.includes(r.TOKEN), false, "question-only must NOT leak the answer-bearing source passage");
  assert.ok(r.condFull.includes(r.TOKEN), "문제＋해설 may include the source passage (answer already shown)");
  // 발문/조건 블록은 두 모드 모두 유지.
  assert.ok(r.condQuestionOnly.includes("[영작할 우리말]"), "reference block retained");
});

test("WORD_ORDER attaches the source passage", () => {
  assert.ok(r.wordOrderWithPassage.includes(r.TOKEN), "WORD_ORDER copy must include the source passage");
});

test("SENTENCE_TRANSFORM does not duplicate the [원문] sentence (de-dup vs attached passage)", () => {
  assert.ok(r.stFull.includes(r.TOKEN), "source passage attached in 문제＋해설");
  assert.equal(r.stOriginalCount, 1, "the original sentence must appear once (inside the passage), not also as a [원문] block");
  assert.equal(r.stFull.includes("[원문]"), false, "the redundant [원문] block must be de-duplicated away");
});

test("empty passage content (지문별 view before loader fix) degrades gracefully, no crash", () => {
  // 로더가 content 를 채우기 전이라도 클립보드는 크래시 없이 지문 없이 폴백해야 한다.
  assert.equal(typeof r.emptyContentTopic, "string");
  assert.ok(r.emptyContentTopic.includes("주제로 가장 적절한"), "발문 retained");
  assert.equal(r.emptyContentTopic.includes(r.TOKEN), false, "no passage when content is empty");
});

test("KO reading type attaches the passage from the render model (not raw), once", () => {
  assert.equal(r.koNoPassage.includes(r.TOKEN), false, "no passage row → no token");
  assert.ok(r.koWithPassage.includes(r.TOKEN), "KO_RD_FACT copy must include the reading passage");
  assert.ok(r.koWithPassage.includes("회상과 재인은 서로 다르다"), "full KO passage attached");
  assert.equal(r.koTokenCount, 1, "KO passage attached exactly once (no stimulus double-emit)");
  // 순서: 발문 → 지문
  const dirIdx = r.koWithPassage.indexOf("일치하지 않는 것은");
  const psgIdx = r.koWithPassage.indexOf(r.TOKEN);
  assert.ok(dirIdx >= 0 && psgIdx > dirIdx, "KO 발문 must come before 지문");
});
