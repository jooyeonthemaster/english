import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

// ============================================================================
// 시험지 출력 경로 정리 — 동작 검증 (26-09-30 LEGACY-CLEANUP). 실제 함수를 돌린다(DB·네트워크 없음).
//   B1 관리자 보기·인쇄 모델(buildAdminPrintModel)은 공용 정본의 판정을 그대로 쓴다:
//      정답 노출형(조건 영작)은 원문 지문 미동봉 · 내장 지문 유형은 지문 박스를 따로 찍지 않는다(발문 속 지문과 이중 출력 금지) ·
//      DB 지문이 없으면 떼어 낸 원문 보관본(_sourcePassage)을 찍는다 · 저장 설정의 지문 끄기·순서·편집 발문 존중 ·
//      번호는 시험지 순서 · 정답은 정답표 표기(①~).
//   B2 HWPX [n점·유형] 배지: 라벨 없는 유형은 「[n점]」만(웹 a4-paper-page 와 같다 — HW-4), 라벨 있는 유형은 「[n점 · 라벨]」.
//      그리고 그룹 지문 박스를 켠 내장 지문 유형은 본문 위 지문 제목을 한 번 더 찍지 않는다(웹·DOCX 와 같다).
// ============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import adminModelMod from "../src/components/admin/exam-print-model";
import examDocument from "../src/app/api/exams/[examId]/export-hwpx/_lib/exam-document";
import shapesMod from "../src/app/api/exams/[examId]/export-hwpx/_lib/shapes";
import sectionXmlMod from "../src/app/api/exams/[examId]/export-hwpx/_lib/section-xml";
import savedItemsMod from "../src/components/exams/paper-builder/saved-paper-items";

const unwrap = (m: any) => m.default ?? m["module.exports"] ?? m;
const { buildAdminPrintModel } = unwrap(adminModelMod);
const { buildExamHwpxDocument } = unwrap(examDocument);
const { ShapeRegistry } = unwrap(shapesMod);
const { buildSectionXml } = unwrap(sectionXmlMod);
const { parseSavedPaperSettings } = unwrap(savedItemsMod);

const mc = JSON.stringify(["alpha", "beta", "gamma", "delta", "epsilon"].map((text, i) => ({ label: String(i + 1), text })));
const SOURCE = "The committee finally approved the new library plan after months of debate.";
const EMBEDDED = "Many people believe that ( ) is the key to a happy life, but research suggests otherwise.";
const ARCHIVE = "Archived passage kept after the linked passage record was deleted from the library.";

function eq(id: string, subType: string, questionText: string, extra: Record<string, unknown> = {}) {
  return {
    orderNum: 0,
    points: 2,
    question: {
      id,
      type: subType === "CONDITIONAL_WRITING" ? "SHORT_ANSWER" : "MULTIPLE_CHOICE",
      subType,
      questionText,
      structuredData: null,
      options: subType === "CONDITIONAL_WRITING" ? null : mc,
      correctAnswer: subType === "CONDITIONAL_WRITING" ? "The committee approved the plan." : "3",
      difficulty: "INTERMEDIATE",
      setId: null,
      passage: { title: "Library", content: SOURCE },
      explanation: null,
      questionNumber: 99,
      ...extra,
    },
  };
}

const questions = [
  // 정답 노출형 — 원문 지문을 실으면 답이 보인다(기본 미동봉).
  eq("cw", "CONDITIONAL_WRITING", "다음 우리말을 조건에 맞게 영작하시오.\\n\\n위원회는 마침내 그 계획을 승인했다."),
  // 내장 지문 유형 — 발문에 지문이 들어 있다(지문 박스를 또 찍으면 이중 출력).
  eq("bi", "BLANK_INFERENCE", "다음 빈칸에 들어갈 말로 가장 적절한 것은?\\n\\n" + EMBEDDED, {
    passage: { title: "Happy", content: EMBEDDED },
  }),
  // DB 지문 없음 + 떼어 낸 원문 보관본.
  eq("tp", "TOPIC", "다음 글의 주제로 가장 적절한 것은?", {
    passage: null,
    structuredData: { _sourcePassage: { title: "Archived", content: ARCHIVE, passageId: "p-old", detachedAt: "2026-09-29T00:00:00.000Z" } },
  }),
];

// 1) settings 없음(문항 목록 경로)
const plain = buildAdminPrintModel(questions, null);
const flatten = (model: any) => model.groups.flatMap((g: any) => (g.kind === "questions" ? g.questions.map((q: any) => ({ ...q, groupPassage: g.passage })) : []));
const p = flatten(plain);
const byId = (list: any[], id: string) => list.find((q) => q.id === id);

// 2) 저장 settings(v1): 순서 뒤집기 · 편집 발문 · 편집 정답 · 지문 토글
//    조건 영작 지문 켬(선생님 선택 = 저장 boolean 우선) · 주제 문항 지문 끔(원문 필수 유형 = 강제 우선)
const settings = parseSavedPaperSettings(JSON.stringify({
  source: "exam-paper-builder-v1",
  layout: { columns: 2 },
  items: [
    { questionId: "tp", orderNum: 1, groupId: "single:tp", includePassage: false },
    { questionId: "bi", orderNum: 2, groupId: "single:bi", questionText: "편집한 발문입니다.\\n\\n" + EMBEDDED },
    { questionId: "cw", orderNum: 3, groupId: "single:cw", includePassage: true, correctAnswer: "The committee finally approved it." },
  ],
}));
const saved = flatten(buildAdminPrintModel(questions, settings));

// 3) HWPX 배지(메타 켬)
async function hwpxBody(settingsJson: string, qs: any[]) {
  const { doc } = await buildExamHwpxDocument({ title: "meta", settings: settingsJson, questions: qs, includeAnswers: false, examDateLabel: "" });
  const registry = new ShapeRegistry(doc.defaultFontKr, doc.defaultFontLatin);
  const sections = doc.sections.map((s: any) => buildSectionXml(s, registry));
  return String(sections[1] ?? "").replace(/<[^>]+>/g, "");
}
const metaQs = [eq("unk", "UNKNOWN", "다음 물음에 답하시오."), eq("bi2", "BLANK_INFERENCE", "다음 빈칸에 들어갈 말로 가장 적절한 것은?")];
const metaBody = await hwpxBody(JSON.stringify({
  source: "exam-paper-builder-v1",
  layout: { columns: 2, showQuestionMeta: true },
  items: [
    { questionId: "unk", orderNum: 1, groupId: "single:unk", includePassage: false },
    { questionId: "bi2", orderNum: 2, groupId: "single:bi2", includePassage: false },
  ],
}), metaQs);

// 4) HWPX 지문 제목 — 내장 지문 유형(발문 속 지문)은 제목을 한 번만: 그룹 박스를 켜면 박스에, 끄면 본문 위에.
const titleBody = (includePassage: boolean) => hwpxBody(JSON.stringify({
  source: "exam-paper-builder-v1",
  layout: { columns: 2, showPassageTitle: true },
  items: [{ questionId: "bi", orderNum: 1, groupId: "single:bi", includePassage, passageTitle: "제목하나" }],
}), [questions[1]]);
const titleOn = await titleBody(true);
const titleOff = await titleBody(false);

process.stdout.write(JSON.stringify({
  plain: {
    count: plain.questionCount,
    numbers: p.map((q: any) => q.number),
    cwGroupPassage: byId(p, "cw").groupPassage,
    cwInline: byId(p, "cw").inlinePassage,
    biGroupPassage: byId(p, "bi").groupPassage,
    biInline: byId(p, "bi").inlinePassage,
    tpInlineOrGroup: (byId(p, "tp").inlinePassage || byId(p, "tp").groupPassage?.content || ""),
    answers: p.map((q: any) => q.answer),
  },
  saved: {
    order: saved.map((q: any) => q.id),
    numbers: saved.map((q: any) => q.number),
    tpPassage: (byId(saved, "tp").inlinePassage || byId(saved, "tp").groupPassage?.content || ""),
    cwPassage: (byId(saved, "cw").inlinePassage || byId(saved, "cw").groupPassage?.content || ""),
    biText: byId(saved, "bi").questionText,
    cwAnswer: byId(saved, "cw").answer,
  },
  meta: {
    unknownPlain: metaBody.includes("[2점]"),
    unknownRaw: metaBody.includes("UNKNOWN"),
    labelled: metaBody.includes("[2점 · 빈칸 추론]"),
  },
  title: { groupOn: titleOn.split("제목하나").length - 1, groupOff: titleOff.split("제목하나").length - 1 },
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".exam-paper-legacy-cleanup-harness.mts");
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

const r = runHarness();

test("B1 관리자 인쇄 모델: 정답 노출형(조건 영작)은 원문 지문을 싣지 않는다", () => {
  assert.equal(r.plain.cwGroupPassage, null, "그룹 지문 박스 없음");
  assert.equal(r.plain.cwInline, "", "문항 안 지문 없음");
});

test("B1 관리자 인쇄 모델: 내장 지문 유형은 지문 박스를 따로 찍지 않는다(발문 속 지문과 이중 출력 금지)", () => {
  assert.equal(r.plain.biGroupPassage, null);
  assert.equal(r.plain.biInline, "");
});

test("B1 관리자 인쇄 모델: DB 지문이 없으면 떼어 낸 원문 보관본을 찍는다", () => {
  assert.match(r.plain.tpInlineOrGroup, /Archived passage kept/);
});

test("B1 관리자 인쇄 모델: 번호는 시험지 순서, 정답은 정답표 표기(①~)", () => {
  assert.equal(r.plain.count, 3);
  assert.deepEqual(r.plain.numbers, [1, 2, 3], "question.questionNumber(99) 가 아니라 시험지 순서");
  assert.equal(r.plain.answers[1], "③", "객관식 숫자 정답 → 원문자");
});

test("B1 관리자 인쇄 모델: 저장 settings 의 순서·지문 토글(강제 → 저장값 → 기본값)·편집 발문·편집 정답을 따른다", () => {
  assert.deepEqual(r.saved.order, ["tp", "bi", "cw"]);
  assert.deepEqual(r.saved.numbers, [1, 2, 3]);
  assert.match(r.saved.tpPassage, /Archived passage kept/, "원문 필수 유형은 저장 false 여도 찍는다(강제)");
  assert.match(r.saved.cwPassage, /committee finally approved/, "선생님이 켠 조건 영작 지문은 찍는다(저장 boolean)");
  assert.match(r.saved.biText, /^편집한 발문입니다\./);
  assert.equal(r.saved.cwAnswer, "The committee finally approved it.");
});

test("B2 HWPX 배지: 라벨 없는 유형은 [n점]만, 라벨 있는 유형은 [n점 · 라벨]", () => {
  assert.equal(r.meta.unknownRaw, false, "원시 유형 코드(UNKNOWN)를 찍지 않는다");
  assert.equal(r.meta.unknownPlain, true, "[2점] 만 찍는다");
  assert.equal(r.meta.labelled, true);
});

test("B2 HWPX: 내장 지문 유형의 지문 제목은 한 번만 찍는다(그룹 박스 켬·끔 모두 — 웹·DOCX 와 같다)", () => {
  assert.equal(r.title.groupOn, 1, "그룹 지문 박스 제목만");
  assert.equal(r.title.groupOff, 1, "본문 위 제목만(발문 속 지문 섹션에는 제목 없음)");
});
