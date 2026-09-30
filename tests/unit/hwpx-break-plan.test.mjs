import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// HWPX 빌더 + break-plan 은 TS + 경로 alias(@/...) 라 node 에서 바로 import 가 어렵다.
// tsx 하니스를 실행해 실제 .hwpx 를 생성/해제(unzip)하고 결과(JSON)를 검증한다.
const harnessSource = `
// 네임스페이스 import — .ts(@/) 모듈이 tsx 에서 CJS 로 트랜스파일되면 실제 export 가
// namespace.default(=module.exports) 아래로 들어가, named import 정적 링크가 깨진다.
// (.default ?? namespace) 로 CJS interop·네이티브 ESM 양쪽을 모두 안전하게 처리한다.
import * as builderMod from "@/app/api/exams/[examId]/export-hwpx/_lib/builder";
import * as packageMod from "@/app/api/exams/[examId]/export-hwpx/_lib/package";
import * as breakPlanMod from "@/app/api/exams/[examId]/export-hwpx/_lib/break-plan";
import JSZip from "jszip";
const { buildBuilderHwpxDocument } = builderMod.default ?? builderMod;
const { packageHwpx } = packageMod.default ?? packageMod;
const { computeBreakPlan } = breakPlanMod.default ?? breakPlanMod;

function makeQuestion(i) {
  const id = "q" + i;
  return {
    localId: id,
    questionId: id,
    orderNum: i,
    points: 2,
    groupId: "single:" + id,
    includePassage: true,
    passageTitle: "PASSAGE " + i,
    passageContent:
      ("This is a sufficiently long English passage sentence number " + i +
       " written to fill the column with enough text so that pagination spreads the questions across multiple columns and pages. ").repeat(4),
    questionText:
      "What is the main idea of the passage in question " + i +
      "? Choose the single best answer based on the passage shown above this question.",
    options: [
      { label: "1", text: "The first plausible option for question " + i },
      { label: "2", text: "The second plausible option" },
      { label: "3", text: "The third plausible option" },
      { label: "4", text: "The fourth plausible option" },
      { label: "5", text: "The fifth plausible option" },
    ],
    correctAnswer: "1",
    answerSpaceLines: 0,
    objectiveAnswerSlots: 0,
    objectiveAnswerTexts: [],
    sectionTitle: "",
    teacherNote: "",
    sourceQuestion: {
      id,
      type: "MULTIPLE_CHOICE",
      subType: "TOPIC_MAIN_IDEA",
      questionText: "",
      options: null,
      correctAnswer: "1",
      difficulty: "INTERMEDIATE",
      passage: null,
      explanation: null,
    },
  };
}

const resolvedItems = Array.from({ length: 16 }, (_, i) => makeQuestion(i + 1));
const layout = {
  paperSize: "A4",
  columns: 2,
  density: "comfortable",
  passageStyle: "boxed",
  showAnswerSpace: true,
  showPassageTitle: true,
  showQuestionMeta: true,
};
const settings = {
  source: "exam-paper-builder-v1",
  template: "clean",
  layout,
  header: {
    subtitle: "영어 내신 대비",
    schoolName: "",
    className: "",
    studentNameLabel: "이름",
    instructions: "다음 물음에 알맞은 답을 고르시오.",
  },
  items: resolvedItems,
};

const { plan, pageCount } = computeBreakPlan({
  blocks: undefined,
  resolvedItems,
  layout,
  template: settings.template,
});
const planColumns = [...plan.values()].filter((v) => v === "column").length;
const planPages = [...plan.values()].filter((v) => v === "page").length;

// E36 구역 3분할: section0 = 표지, section1 = 본문, section2 = 정답표. 본문 계약은 section1 에서 본다.
async function bodySectionOf(doc) {
  const zip = await JSZip.loadAsync(await packageHwpx(doc));
  return zip.file("Contents/section1.xml").async("string");
}
// 표 셀 안 문단을 제외한 최상위 <hp:p> 여는 태그만(나눔 플래그는 최상위 문단에만 의미가 있다).
function topLevelOpenTags(sec) {
  const tags = []; let depth = 0;
  for (const m of sec.matchAll(/<hp:p [^>]*>|<\\/hp:p>/g)) {
    if (m[0].startsWith("<hp:p ")) { if (depth === 0) tags.push(m[0]); depth++; }
    else depth--;
  }
  return tags;
}
const countFlag = (sec, flag) => topLevelOpenTags(sec).filter((t) => t.includes(flag + '="1"')).length;

const doc = buildBuilderHwpxDocument({
  title: "새 시험지 (테스트)",
  settings,
  resolvedItems,
  includeAnswers: false,
  fullExamQuestions: [],
});
const section = await bodySectionOf(doc);
const countColBreak = countFlag(section, "columnBreak");
const countPageBreak = countFlag(section, "pageBreak");

// 분할 계획을 실제로 소비하는 경로 = 흐름형 1단 구역(builder.ts: 네이티브 2단은 한컴 자동 흐름에 맡겨
// 계획을 쓰지 않고, 구형 2단 표 경로는 fragment 표로 배치한다). 같은 문항·1단 레이아웃으로 계획과 방출을 대조한다.
const layout1 = { ...layout, columns: 1 };
const plan1 = computeBreakPlan({ blocks: undefined, resolvedItems, layout: layout1, template: settings.template }).plan;
const section1col = await bodySectionOf(buildBuilderHwpxDocument({
  title: "새 시험지 (1단)",
  settings: { ...settings, layout: layout1 },
  resolvedItems,
  includeAnswers: false,
  fullExamQuestions: [],
}));

const HPU = (mmVal) => Math.round((mmVal * 7200) / 25.4);
const MM_PER_PX = 210 / 760;
const expLR = HPU(34 * MM_PER_PX);
const expTB = HPU(28 * MM_PER_PX);
const expPageW = HPU(210);
const expPageH = HPU(297);

const marginMatch = section.match(
  /<hp:margin header="\\d+" footer="\\d+" gutter="0" left="(\\d+)" right="(\\d+)" top="(\\d+)" bottom="(\\d+)"\\/>/,
);
const pagePrMatch = section.match(
  /<hp:pagePr landscape="(\\w+)" width="(\\d+)" height="(\\d+)"/,
);

// 정답포함 모드는 강제 분할을 적용하지 않아야 한다(빈 plan).
const docAns = buildBuilderHwpxDocument({
  title: "새 시험지 (정답)",
  settings,
  resolvedItems,
  includeAnswers: true,
  fullExamQuestions: [],
});
const sectionAns = await bodySectionOf(docAns);

const summary = {
  pageCount,
  planColumns,
  planPages,
  countColBreak,
  countPageBreak,
  hasTwoCol: /colCount="2"/.test(section),
  orientation: pagePrMatch ? pagePrMatch[1] : null,
  pageW: pagePrMatch ? Number(pagePrMatch[2]) : null,
  pageH: pagePrMatch ? Number(pagePrMatch[3]) : null,
  expPageW,
  expPageH,
  margins: marginMatch
    ? {
        left: Number(marginMatch[1]),
        right: Number(marginMatch[2]),
        top: Number(marginMatch[3]),
        bottom: Number(marginMatch[4]),
      }
    : null,
  expLR,
  expTB,
  answersColBreak: countFlag(sectionAns, "columnBreak"),
  answersPageBreak: countFlag(sectionAns, "pageBreak"),
  answersHasTwoCol: /colCount="2"/.test(sectionAns),
  oneColPlanPages: [...plan1.values()].filter((v) => v === "page").length,
  oneColPlanColumns: [...plan1.values()].filter((v) => v === "column").length,
  oneColPageBreak: countFlag(section1col, "pageBreak"),
  oneColColBreak: countFlag(section1col, "columnBreak"),
  oneColHasTwoCol: /colCount="2"/.test(section1col),
};
process.stdout.write(JSON.stringify(summary));
`;

function runHarness() {
  // tmp/ 는 gitignore 대상이라 중단된 실행이 repo 루트를 오염시키지 않는다.
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".hwpx-break-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    // shell:true → Windows 에서 npx(.cmd) PATHEXT 해석(ENOENT 방지). --tsconfig → @/ 경로 alias 해석.
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

const summary = runHarness();

test("HWPX: A4 portrait page with correct margins (preview px → mm)", () => {
  // OWPML 공식: WIDELY=세로(portrait), NARROWLY=가로(landscape). 시험지는 세로.
  assert.equal(summary.orientation, "WIDELY", "A4 세로는 landscape=WIDELY 여야 한다");
  assert.equal(summary.pageW, summary.expPageW, "페이지 폭 = A4 210mm (HWPUNIT)");
  assert.equal(summary.pageH, summary.expPageH, "페이지 높이 = A4 297mm (HWPUNIT)");
  assert.ok(summary.margins, "secPr margin 을 찾아야 한다");
  assert.equal(summary.margins.left, summary.expLR, "좌여백 = px-[34] 환산값");
  assert.equal(summary.margins.right, summary.expLR, "우여백 = px-[34] 환산값");
  assert.equal(summary.margins.top, summary.expTB, "상여백 = py-[28] 환산값");
  assert.equal(summary.margins.bottom, summary.expTB, "하여백 = py-[28] 환산값");
});

test("HWPX: two-column layout is enabled", () => {
  assert.equal(summary.hasTwoCol, true, "본문 구역(section1)은 2단(colCount=2)이어야 한다");
  assert.equal(summary.answersHasTwoCol, true, "정답포함도 설정한 2단을 따른다");
  assert.equal(summary.oneColHasTwoCol, false, "layout.columns=1 이면 본문은 1단");
});

test("HWPX: preview pagination produces multi-page break plan", () => {
  assert.ok(summary.pageCount >= 2, "테스트 데이터는 여러 페이지로 분할되어야 한다");
  assert.ok(
    summary.planColumns + summary.planPages > 0,
    "분할 계획에 단/페이지 나눔이 하나 이상 있어야 한다",
  );
});

// 예전 판본은 section0.xml(E36 이후 표지)을 읽어 todo 로 보류돼 있었다. 계획(plan)은 흐름형 1단 구역만
// 소비하므로 거기서 「계획된 나눔 = 방출된 나눔」을 대조하고, 네이티브 2단은 계획을 쓰지 않는다(한컴 자동 흐름 —
// 강제 나눔은 쪽당 N문제·breakBefore 뿐)는 것을 따로 고정한다.
test("HWPX: every planned break is emitted exactly once in the body section (1-column flow)", () => {
  assert.ok(summary.oneColPlanPages > 0, "1단 계획에도 쪽 나눔이 있어야 대조가 의미 있다");
  assert.equal(summary.oneColPlanColumns, 0, "1단 계획에는 단 나눔이 없다");
  assert.equal(summary.oneColPageBreak, summary.oneColPlanPages, "pageBreak 개수 = 계획된 페이지 나눔 개수");
  assert.equal(summary.oneColColBreak, 0, "1단 본문에 columnBreak 가 없다");
});

test("HWPX: native two-column body leaves page/column flow to Hancom (no planned breaks emitted)", () => {
  assert.ok(summary.planColumns + summary.planPages > 0, "2단 계획은 존재하지만");
  assert.equal(summary.countColBreak, 0, "네이티브 2단 본문은 계획된 columnBreak 를 넣지 않는다");
  assert.equal(summary.countPageBreak, 0, "네이티브 2단 본문은 계획된 pageBreak 를 넣지 않는다");
});

test("HWPX: answer-included export does not force preview breaks", () => {
  assert.equal(summary.answersColBreak, 0, "정답포함 모드는 columnBreak 를 강제하지 않는다");
  assert.equal(summary.answersPageBreak, 0, "정답포함 모드는 pageBreak 를 강제하지 않는다");
});
