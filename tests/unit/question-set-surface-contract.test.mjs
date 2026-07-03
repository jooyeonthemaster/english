import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import whereModule from "@/actions/workbench/_question-where";
import paperUtils from "@/components/exams/paper-builder/paper-item-utils";
import paperItemHooks from "@/components/exams/exam-paper-builder-client-parts/use-paper-items";

const { buildWorkbenchQuestionWhere, buildBuilderQuestionWhere } = whereModule;
const { makePaperItem, buildGroups } = paperUtils;
const { paperItemRegroupKey } = paperItemHooks;

const activeWhere = buildWorkbenchQuestionWhere("academy-1", {}, "active");
const trashWhere = buildWorkbenchQuestionWhere("academy-1", {}, "trash");
const builderWhere = buildBuilderQuestionWhere("academy-1", {});

const baseQuestion = {
  type: "MULTIPLE_CHOICE",
  subType: "REFERENCE",
  questionText: "What does the underlined word refer to?",
  structuredData: {
    _typeId: "REFERENCE",
    direction: "What does the underlined word refer to?",
    passageWithUnderline: "The committee delayed the project because __they__ had concerns.",
    options: [
      { label: "1", text: "the committee" },
      { label: "2", text: "the project" },
    ],
    correctAnswer: "1",
  },
  options: JSON.stringify([
    { label: "1", text: "the committee" },
    { label: "2", text: "the project" },
  ]),
  correctAnswer: "1",
  points: 1,
  approved: false,
  starred: false,
  createdAt: new Date("2026-07-02T00:00:00.000Z"),
  setId: "set-1",
  passage: {
    id: "passage-1",
    title: "Shared passage",
    content: "The committee delayed the project because they had concerns.",
    grade: null,
    semester: null,
    publisher: null,
    school: null,
  },
};

const item1 = makePaperItem({ ...baseQuestion, id: "q1" }, 1, []);
const item2 = makePaperItem({ ...baseQuestion, id: "q2" }, 2, [item1]);
const groups = buildGroups([item1, item2]);

process.stdout.write(JSON.stringify({
  activeSetId: activeWhere.setId ?? null,
  trashSetId: trashWhere.setId ?? null,
  builderHasSetIdGate: Object.prototype.hasOwnProperty.call(builderWhere, "setId"),
  item1GroupId: item1.groupId,
  item2GroupId: item2.groupId,
  regroupKey: paperItemRegroupKey(item1),
  groupCount: groups.length,
  firstGroupSize: groups[0]?.items?.length ?? 0,
  firstGroupIncludesPassage: Boolean(groups[0]?.includePassage),
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".question-set-surface-contract.mts");
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

test("question-set surfaces keep list cards grouped and exam members render self-contained", () => {
  assert.equal(summary.activeSetId, null);
  assert.equal(summary.trashSetId, null);
  assert.equal(summary.builderHasSetIdGate, false);
  // 영어 세트 멤버는 자기완결로 렌더한다(로컬 우선 결정): 렌더 그룹은 솔로("single:"),
  // 별도 공유지문 박스 없음. 셔플 시 함께 이동하는 논리 묶음키(regroupKey)는 setId 기반으로
  // 유지돼 세트 멤버가 인접 배치되지만, 렌더 그룹핑과는 분리된다.
  assert.ok(
    String(summary.item1GroupId).startsWith("single:"),
    `item1GroupId=${summary.item1GroupId}`,
  );
  assert.ok(
    String(summary.item2GroupId).startsWith("single:"),
    `item2GroupId=${summary.item2GroupId}`,
  );
  assert.equal(summary.regroupKey, "set:set-1");
  assert.equal(summary.groupCount, 2);
  assert.equal(summary.firstGroupSize, 1);
  assert.equal(summary.firstGroupIncludesPassage, false);
});
