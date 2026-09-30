import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

// ============================================================================
// 지문 제목·본문 원천 우선순위(docs 의 공용 모델 계약 — 스냅숏 → DB → structuredData._sourcePassage 보관본)를
// HWPX·DOCX 의 **라우트 진입점**(buildExamHwpxDocument · buildExamDocxDocument)에서 잰다(26-09-30 COH-14).
// 예전 passage-title-export 는 HWPX 표지 구역(section0)을 읽어 영구 실패했고, 보관본 경로는 아무 테스트도 없었다.
// 세 경우 모두 settings(빌더 v1 저장본, 지문 제목 표시 켬)를 거친다. HWPX 는 본문 구역(section1)만 읽는다.
// ============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import JSZip from "jszip";
import { Packer } from "docx";
import examDocument from "../src/app/api/exams/[examId]/export-hwpx/_lib/exam-document";
import shapesMod from "../src/app/api/exams/[examId]/export-hwpx/_lib/shapes";
import sectionXmlMod from "../src/app/api/exams/[examId]/export-hwpx/_lib/section-xml";
import assembleMod from "../src/app/api/exams/[examId]/export-docx/_lib/build-builder-document/assemble";
import savedItemsMod from "../src/components/exams/paper-builder/saved-paper-items";

const unwrap = (m: any) => m.default ?? m["module.exports"] ?? m;
const { buildExamHwpxDocument } = unwrap(examDocument);
const { ShapeRegistry } = unwrap(shapesMod);
const { buildSectionXml } = unwrap(sectionXmlMod);
const { buildExamDocxDocument } = unwrap(assembleMod);
const { parseSavedPaperSettings } = unwrap(savedItemsMod);

const options = JSON.stringify(
  ["alpha", "beta", "gamma", "delta", "epsilon"].map((text, i) => ({ label: String(i + 1), text })),
);
const SNAP_BODY = "Snapshot body text that the teacher edited in the builder.";
const DB_BODY = "Database body text of the linked passage record.";
const ARCHIVE_BODY = "Archived body text kept after the passage was deleted.";

function question(passage: { title: string; content: string } | null, structuredData: unknown = null) {
  return {
    orderNum: 1,
    points: 2,
    question: {
      id: "q1",
      type: "MULTIPLE_CHOICE",
      subType: "BLANK_INFERENCE",
      questionText: "Choose the best word for the blank.",
      structuredData,
      options,
      correctAnswer: "1",
      difficulty: "INTERMEDIATE",
      setId: null,
      passage,
      explanation: null,
    },
  };
}

function settingsJson(item: Record<string, unknown>, showPassageTitle = true) {
  return JSON.stringify({
    source: "exam-paper-builder-v1",
    layout: { columns: 2, showPassageTitle },
    items: [{ questionId: "q1", orderNum: 1, groupId: "single:q1", includePassage: true, ...item }],
  });
}

async function render(settings: string, eq: ReturnType<typeof question>) {
  const { doc } = await buildExamHwpxDocument({
    title: "title priority",
    settings,
    questions: [eq],
    includeAnswers: false,
    examDateLabel: "",
  });
  const registry = new ShapeRegistry(doc.defaultFontKr, doc.defaultFontLatin);
  const sections = doc.sections.map((sec: unknown) => buildSectionXml(sec, registry));
  const hwpx = String(sections[1] ?? "").replace(/<[^>]+>/g, "");
  const docxDoc = buildExamDocxDocument({
    title: "title priority",
    examQuestions: [eq],
    settings: parseSavedPaperSettings(settings),
    includeAnswers: false,
  });
  const zip = await JSZip.loadAsync(await Packer.toBuffer(docxDoc));
  const docx = (await zip.file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, "");
  return { hwpx, docx };
}

const count = (text: string, needle: string) => text.split(needle).length - 1;

const snapshot = await render(
  settingsJson({ passageTitle: "스냅숏제목", passageContent: SNAP_BODY }),
  question({ title: "원본제목", content: DB_BODY }),
);
const db = await render(settingsJson({ passageTitle: "" }), question({ title: "원본제목", content: DB_BODY }));
const archive = await render(
  settingsJson({ passageTitle: "" }),
  question(null, {
    _sourcePassage: { title: "보관본제목", content: ARCHIVE_BODY, passageId: "p-deleted", detachedAt: "2026-09-29T00:00:00.000Z" },
  }),
);
const hidden = await render(settingsJson({ passageTitle: "" }, false), question({ title: "원본제목", content: DB_BODY }));

const out: Record<string, unknown> = {};
for (const [fmt, pick] of [["hwpx", (r: any) => r.hwpx], ["docx", (r: any) => r.docx]] as const) {
  out[fmt] = {
    snapshotTitle: count(pick(snapshot), "스냅숏제목"),
    snapshotDbTitle: count(pick(snapshot), "원본제목"),
    snapshotBody: count(pick(snapshot), SNAP_BODY),
    snapshotDbBody: count(pick(snapshot), DB_BODY),
    dbTitle: count(pick(db), "원본제목"),
    dbBody: count(pick(db), DB_BODY),
    archiveTitle: count(pick(archive), "보관본제목"),
    archiveBody: count(pick(archive), ARCHIVE_BODY),
    hiddenTitle: count(pick(hidden), "원본제목"),
    hiddenBody: count(pick(hidden), DB_BODY),
  };
}
process.stdout.write(JSON.stringify(out));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".export-passage-title-priority-harness.mts");
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

const result = runHarness();

for (const fmt of ["hwpx", "docx"]) {
  test(`${fmt.toUpperCase()}: 스냅숏 제목·본문이 DB 보다 먼저다`, () => {
    const r = result[fmt];
    assert.equal(r.snapshotTitle, 1, "snapshot title printed once");
    assert.equal(r.snapshotDbTitle, 0, "DB title must not override the snapshot title");
    assert.equal(r.snapshotBody, 1, "snapshot body printed once");
    assert.equal(r.snapshotDbBody, 0, "DB body must not be printed when a snapshot exists");
  });

  test(`${fmt.toUpperCase()}: 스냅숏 제목이 비면 DB 제목·본문`, () => {
    const r = result[fmt];
    assert.equal(r.dbTitle, 1, "DB title printed once");
    assert.equal(r.dbBody, 1, "DB body printed once");
  });

  test(`${fmt.toUpperCase()}: DB 지문이 없으면 structuredData._sourcePassage 보관본 제목·본문`, () => {
    const r = result[fmt];
    assert.equal(r.archiveTitle, 1, "archived title printed once");
    assert.equal(r.archiveBody, 1, "archived body printed once");
  });

  test(`${fmt.toUpperCase()}: 지문 제목 표시를 끄면 제목만 빠진다`, () => {
    const r = result[fmt];
    assert.equal(r.hiddenTitle, 0, "title hidden");
    assert.equal(r.hiddenBody, 1, "body still printed once");
  });
}
