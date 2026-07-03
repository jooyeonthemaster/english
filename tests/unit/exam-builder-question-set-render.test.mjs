import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import paperUtils from "@/components/exams/paper-builder/paper-item-utils";

const { makePaperItem, buildGroups } = paperUtils;

const basePassage =
  "The creative spark often appears after long practice and patient revision.";

const setRender = {
  id: "set-1",
  setLabel: "독해 세트 2문항",
  canonicalPassage: basePassage,
  layout: { type: "NONE", fullPassage: basePassage, fingerprintHash: "test" },
  members: [
    {
      questionId: "q1",
      orderInSet: 0,
      isStructural: false,
      typeId: "CONTEXT_MEANING",
      spans: [
        {
          kind: "UNDERLINE",
          spanText: "creative spark",
          findStrategy: "expression",
        },
      ],
    },
    {
      questionId: "q2",
      orderInSet: 1,
      isStructural: false,
      typeId: "BLANK_INFERENCE",
      spans: [
        {
          kind: "BLANK",
          spanText: "long practice",
          findStrategy: "expression",
        },
      ],
    },
  ],
};

function question(id, subType, set = true) {
  return {
    id,
    type: "MULTIPLE_CHOICE",
    subType,
    questionText: "Choose the best answer.",
    structuredData: { _typeId: subType },
    options: JSON.stringify([{ label: "1", text: "answer" }]),
    correctAnswer: "1",
    points: 1,
    difficulty: "BASIC",
    tags: null,
    aiGenerated: true,
    approved: true,
    starred: false,
    createdAt: new Date("2026-07-02T00:00:00.000Z"),
    setId: set ? "set-1" : null,
    setRender: set ? setRender : null,
    passage: {
      id: "p1",
      title: "Passage",
      content: basePassage,
      grade: null,
      semester: null,
      publisher: null,
      school: null,
    },
    explanation: null,
    collectionItems: [],
    examLinks: [],
    _count: { examLinks: 0 },
  };
}

const item1 = makePaperItem(question("q1", "CONTEXT_MEANING"), 1, []);
const item2 = makePaperItem(question("q2", "BLANK_INFERENCE"), 2, [item1]);
const ordinary = makePaperItem(question("q3", "TITLE", false), 3, [item1, item2]);
const groups = buildGroups([item1, item2, ordinary]);

process.stdout.write(JSON.stringify({
  groupCount: groups.length,
  firstGroupId: groups[0]?.id ?? "",
  firstGroupIncludesPassage: Boolean(groups[0]?.includePassage),
  firstSetPrompt: groups[0]?.setPrompt ?? "",
  ordinaryPrompt: groups[2]?.setPrompt ?? "",
  item1SelfContained: item1.questionText.includes(basePassage),
  item2SelfContained: item2.questionText.includes(basePassage),
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".exam-builder-question-set-render.mts");
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

test("exam builder renders EN set members self-contained (no shared set prompt/passage box)", () => {
  // 영어 세트 멤버는 자기완결로 렌더한다(로컬 우선 결정): 세트 멤버 2개 + 일반 문항 1개가
  // 각자 솔로("single:") 그룹이 되어 총 3그룹. 공유 set prompt·병합 지문 1박스는 없고,
  // 각 멤버는 자기 지문을 본문에 스스로 담는다(materializeSetMember).
  assert.equal(summary.groupCount, 3);
  assert.ok(
    String(summary.firstGroupId).startsWith("single:"),
    `firstGroupId=${summary.firstGroupId}`,
  );
  assert.equal(summary.firstGroupIncludesPassage, false);
  assert.equal(summary.firstSetPrompt, "");
  assert.equal(summary.ordinaryPrompt, "");
  assert.ok(summary.item1SelfContained, "set member 1 should carry its own passage body");
  assert.ok(summary.item2SelfContained, "set member 2 should carry its own passage body");
});
