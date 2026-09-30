import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

// HWPX 가 웹 공용 정본(saved-paper-items → buildGroups · printInlinePassage · resolvePaperLayout ·
// answer-key-entries)만 소비하는지 — docs/EXAM-PAPER-MODEL.md §1~§4 (26-09-30 HWPX-CONSUMER).
// 라우트와 같은 함수(exam-document.buildExamHwpxDocument)로 가짜 시험지(DB 없음)를 만들어 section1(본문)·
// section2(정답표) 텍스트를 센다. 지문마다 고유 표식 단어를 넣어 「몇 번 찍혔는가」를 본다.
//   - settings NULL: 내장 지문 유형(빈칸)은 원문을 따로 찍지 않는다(정답 단어 노출 0) · 정답 담는 유형(조건영작)
//     원문 없음 · 주제(TOPIC)는 문항 안에 1번 · 영어 세트는 공유 지문 1번 + 안내문 1번 · [n점·유형] 배지 없음 ·
//     정답표 원문자 · 주관식 답란
//   - 빌더 v2: 저장값 false 존중(WORD_ORDER) · 요약문 완성은 항상 인라인(강제) · 명시 showQuestionMeta 존중
//   - 단일 문항 내보내기: includePassage:true 고정이 아니라 같은 규칙(정답 노출 0)

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import * as docMod from "@/app/api/exams/[examId]/export-hwpx/_lib/exam-document";
import * as builderMod from "@/app/api/exams/[examId]/export-hwpx/_lib/builder";
import * as packageMod from "@/app/api/exams/[examId]/export-hwpx/_lib/package";
import * as singleMod from "@/app/api/questions/[questionId]/_lib/load-single-question-export";
import JSZip from "jszip";
const u = (m) => m.default ?? m;
const { buildExamHwpxDocument } = u(docMod);
const { buildBuilderHwpxDocument } = u(builderMod);
const { packageHwpx } = u(packageMod);
const { buildSingleResolvedItem, SINGLE_QUESTION_BUILDER_SETTINGS } = u(singleMod);

const OPTS = JSON.stringify([1, 2, 3, 4, 5].map((n) => ({ label: String(n), text: "Option number " + n })));
function q(id, subType, questionText, passage, extra = {}) {
  return {
    orderNum: 0,
    points: 2,
    question: {
      id, type: "MULTIPLE_CHOICE", subType, questionText, structuredData: null, options: OPTS,
      correctAnswer: "3", difficulty: "INTERMEDIATE", points: 2, setId: null,
      passage: passage ? { title: "T " + id, content: passage } : null,
      explanation: { content: "Because.", keyPoints: null, wrongOptionExplanations: null },
      ...extra,
    },
  };
}
// 표식 단어는 지문마다 정확히 1번 — 본문 출현 횟수 = 지문이 찍힌 횟수.
const long = (probe) => ("Readers build meaning from context and structure in this passage. ").repeat(3) + probe + " ends here.";

const nullExam = [
  // 내장 지문(빈칸): 발문 안에 빈칸 지문, DB 원문에는 정답 단어 — 원문을 따로 찍으면 정답이 보인다.
  q("q1", "BLANK_INFERENCE",
    "Choose the best word for the blank.\\n\\nThe city grew ____ over time. ALPHAPROBE marks the embedded body.",
    "The city grew ANSWERWORD over time. ALPHAPROBE marks the embedded body."),
  // 정답 담는 유형(조건영작): 원문 기본 미동봉.
  q("q2", "CONDITIONAL_WRITING", "Translate the sentence using the conditions.\\n\\n[영작할 우리말] 도시는 자랐다.", long("SECRETSENTENCE")),
  // 출처 지문 인라인(주제): 문항 안에 1번.
  q("q3", "TOPIC", "What is the topic of the passage?", long("ZETAPROBE")),
  // 영어 세트: 공유 지문 1번 + 「[4~5] 다음 글을 읽고, 물음에 답하시오.」 1번, 멤버 안 지문 없음.
  q("q4", "TITLE", "What is the best title?", long("SETPROBE"), { setId: "S1" }),
  q("q5", "CONTENT_MATCH", "Which matches the content?", long("SETPROBE"), { setId: "S1" }),
  // 주관식(선지 없음): 답란 4줄(웹 기본).
  { ...q("q6", "SENTENCE_TRANSFORM", "Rewrite the sentence.\\n\\n[원문] The city grew fast.", long("TRANSFORMPROBE")), question: { ...q("q6", "SENTENCE_TRANSFORM", "Rewrite the sentence.\\n\\n[원문] The city grew fast.", long("TRANSFORMPROBE")).question, options: null, correctAnswer: "grown fast" } },
];

const v2Exam = [
  q("w1", "WORD_ORDER", "Arrange the words.\\n\\n[배열 단어] grew / the / city", long("WORDORDERPROBE")),
  q("w2", "SUMMARY_COMPLETE", "Complete the summary.\\n\\n[요약문] The city (A) ____ over time.", long("SUMMARYPROBE")),
  q("w3", "BLANK_INFERENCE", "Choose the word.\\n\\nThe town ____ slowly. BETAPROBE body.", "The town EXPOSEDWORD slowly. BETAPROBE body."),
];
const v2Settings = JSON.stringify({
  source: "exam-paper-builder-v2",
  template: "clean",
  layout: { columns: 2, paperSize: "A4", density: "comfortable", showQuestionMeta: true, showAnswerSpace: true, showPassageTitle: false },
  header: {},
  items: [],
  blocks: [
    { blockType: "question", localId: "b1", questionId: "w1", includePassage: false },
    { blockType: "text", localId: "t1", blockText: "CUSTOMTEXTPROBE" },
    { blockType: "question", localId: "b2", questionId: "w2", includePassage: false },
    { blockType: "question", localId: "b3", questionId: "w3", includePassage: true },
  ],
});

async function sectionTexts(doc) {
  const zip = await JSZip.loadAsync(await packageHwpx(doc));
  const read = async (n) => {
    const f = zip.file("Contents/section" + n + ".xml");
    if (!f) return "";
    const xml = await f.async("string");
    return [...xml.matchAll(/<hp:t>([^<]*)<\\/hp:t>/g)].map((m) => m[1]).join(" ");
  };
  return { body: await read(1), key: await read(2) };
}
const count = (text, word) => text.split(word).length - 1;

const nullDoc = (await buildExamHwpxDocument({ title: "NULL", settings: null, questions: nullExam, includeAnswers: false, examDateLabel: "" })).doc;
const nullText = await sectionTexts(nullDoc);
const v2Doc = (await buildExamHwpxDocument({ title: "V2", settings: v2Settings, questions: v2Exam, includeAnswers: false, examDateLabel: "" })).doc;
const v2Text = await sectionTexts(v2Doc);

const single = buildSingleResolvedItem(nullExam[0]);
const singleDoc = buildBuilderHwpxDocument({
  title: "single", settings: SINGLE_QUESTION_BUILDER_SETTINGS, resolvedItems: [single],
  includeAnswers: false, fullExamQuestions: [], includeCover: false,
});
const singleZip = await JSZip.loadAsync(await packageHwpx(singleDoc));
const singleXml = await singleZip.file("Contents/section0.xml").async("string");
const singleText = [...singleXml.matchAll(/<hp:t>([^<]*)<\\/hp:t>/g)].map((m) => m[1]).join(" ");

process.stdout.write(JSON.stringify({
  null: {
    alpha: count(nullText.body, "ALPHAPROBE"),
    answerWord: count(nullText.body, "ANSWERWORD"),
    secret: count(nullText.body, "SECRETSENTENCE"),
    zeta: count(nullText.body, "ZETAPROBE"),
    set: count(nullText.body, "SETPROBE"),
    setPrompt: count(nullText.body, "[4~5] 다음 글을 읽고, 물음에 답하시오."),
    badge: (nullText.body.match(/\\[\\d+점/g) || []).length,
    transform: count(nullText.body, "TRANSFORMPROBE"),
    originalBlock: count(nullText.body, "The city grew fast."),
    answerLineTables: nullDoc.sections[1].blocks.filter((b) => b.kind === "tbl" && b.rows.length === 1 && b.rows[0].heightHpu === 720).length,
    keyCircled: (nullText.key.match(/③/g) || []).length,
    keyPlainThree: (nullText.key.split("정답").pop() || "").split(" ").filter((t) => t === "3").length,
  },
  v2: {
    wordOrder: count(v2Text.body, "WORDORDERPROBE"),
    summary: count(v2Text.body, "SUMMARYPROBE"),
    beta: count(v2Text.body, "BETAPROBE"),
    exposed: count(v2Text.body, "EXPOSEDWORD"),
    custom: count(v2Text.body, "CUSTOMTEXTPROBE"),
    badge: (v2Text.body.match(/\\[\\d+점/g) || []).length,
    customBeforeSummary: v2Text.body.indexOf("CUSTOMTEXTPROBE") < v2Text.body.indexOf("SUMMARYPROBE"),
  },
  single: {
    alpha: count(singleText, "ALPHAPROBE"),
    answerWord: count(singleText, "ANSWERWORD"),
    includePassage: single.includePassage,
    hasPaperItem: Boolean(single.paperItem),
    badge: (singleText.match(/\\[\\d+점/g) || []).length,
  },
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".hwpx-shared-model-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execFileSync("npx", ["tsx", "--tsconfig", "./tsconfig.json", harnessPath], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
      shell: true,
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

const r = runHarness();

test("settings NULL: 내장 지문 유형은 원문을 따로 찍지 않는다(정답 단어 노출 0, 본문 1번)", () => {
  assert.equal(r.null.answerWord, 0, "빈칸 정답 단어가 든 원문이 찍히면 안 된다");
  assert.equal(r.null.alpha, 1, "빈칸 지문은 문항 본문에 1번만");
});

test("settings NULL: 정답 담는 유형(조건영작) 원문은 싣지 않는다", () => {
  assert.equal(r.null.secret, 0);
});

test("settings NULL: 출처 지문 인라인 유형(주제)은 문항 안에 정확히 1번", () => {
  assert.equal(r.null.zeta, 1);
});

test("settings NULL: 영어 세트는 공유 지문 1번 + 세트 안내문 1번(멤버 안 지문 없음)", () => {
  assert.equal(r.null.set, 1, "세트 공유 지문 1번");
  assert.equal(r.null.setPrompt, 1, "「[4~5] 다음 글을 읽고, 물음에 답하시오.」 1번");
});

test("settings NULL: [n점·유형] 배지 없음(웹 기본 showQuestionMeta=false), 주관식 답란 4줄", () => {
  assert.equal(r.null.badge, 0);
  assert.equal(r.null.answerLineTables, 4, "문장전환(선지 없음) 답란 4줄");
  assert.equal(r.null.transform, 0, "문장전환 전체 원문은 기본 미동봉");
  assert.equal(r.null.originalBlock, 1, "지문을 감추면 [원문] 문장은 남는다");
});

test("settings NULL: 정답표는 웹과 같은 원문자 표기", () => {
  assert.ok(r.null.keyCircled >= 5, `객관식 정답 3 → ③ (${r.null.keyCircled})`);
  assert.equal(r.null.keyPlainThree, 0, "숫자 3 그대로 남은 객관식 정답이 없다");
});

test("빌더 v2: 저장값 false 존중(WORD_ORDER 지문 없음) · 요약문 완성은 항상 인라인 1번 · 저장 true 는 존중", () => {
  assert.equal(r.v2.wordOrder, 0, "선생님이 끈 배열 영작 지문은 찍지 않는다");
  assert.equal(r.v2.summary, 1, "요약문 완성은 웹처럼 토글과 무관하게 지문 1번");
  // 저장 true 인 내장 유형은 선생님이 켠 원문 박스를 문항 앞에 따로 찍는다(웹과 같은 판정) → 본문 + 원문 = 2번.
  assert.equal(r.v2.beta, 2, "빈칸 본문 1번 + 켠 원문 박스 1번");
  assert.equal(r.v2.exposed, 1, "켠 원문 박스 1번");
});

test("빌더 v2: 커스텀 블록 순서 유지 · 명시 showQuestionMeta=true 는 배지를 그린다", () => {
  assert.equal(r.v2.custom, 1);
  assert.equal(r.v2.customBeforeSummary, true);
  assert.equal(r.v2.badge, 3);
});

test("단일 문항 내보내기: includePassage:true 고정이 아니라 공용 규칙(정답 노출 0)", () => {
  assert.equal(r.single.includePassage, false);
  assert.equal(r.single.hasPaperItem, true);
  assert.equal(r.single.answerWord, 0);
  assert.equal(r.single.alpha, 1);
  // 설정에 showQuestionMeta 가 없는 호출(단일 문항)은 렌더 기본값을 탄다 — 웹 기본(끔)과 같아야 한다.
  assert.equal(r.single.badge, 0, "레이아웃 기본값(resolvePaperLayout): [n점·유형] 배지 끔");
});
