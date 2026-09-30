// 시험지 출력 경로 정리 계약 (26-09-30 LEGACY-CLEANUP — COH-2·COH-7·COH-8·COH-12·COH-15·CC-12·HW-4)
//
//   L1 인쇄 횟수(printCount) 증가는 exams.updatedAt 을 올리지 않는다 — 단일 경로 lib/exams/exam-print-count 의 원시 UPDATE
//      (학원 범위 WHERE)만 쓰고, prisma.exam.update 의 `printCount: { increment }` 는 어디에도 없다. 세 호출부(인쇄 집계 액션 ·
//      HWPX · DOCX 내보내기)는 학원 id 를 넘긴다.
//   L2 단일 문항 내보내기 두 라우트는 로더에 학원 id 를 넘긴다(읽기 전 범위 제한 — 뒤 비교는 이중 방어).
//   L3 관리자 시험지 DOCX·보기 화면·랜딩 데모는 공용 정본(buildExamDocxDocument · buildAdminPrintModel ·
//      buildExamHwpxDocument)을 쓰고, 레거시 buildExamDocument(export-docx/_lib/build-document)를 import 하는 곳이 없다.
//   L4 웹 상세·첫 장 미리보기의 레이아웃 기본값은 resolvePaperLayout 하나에서 온다(인라인 `?? true` 류 복제 금지).
//   L5 상세 머리 「시험지 다운로드」 DOCX 링크는 툴바처럼 「원문 지문 없음」 경고(warnExport)를 띄운다.
//   L6 HWPX [n점·유형] 배지는 라벨이 없는 유형에 원시 코드를 찍지 않는다(웹과 같이 「[n점]」).
//   L7 HWPX KO 렌더모델의 지문 억제는 includePassage 가 아니라 문항 안 지문(printInlinePassageOf)으로 정한다.
//
// 주석은 떼고 코드만 본다. 계기 음성테스트: LEGACY_CLEANUP_CONTRACT_ROOT 로 저장소 사본을 가리키면 같은 단언을
// 그 사본에 건다(사본에 결함을 심어 RED 를 확인하는 용도 — 저장소 파일은 건드리지 않는다).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.LEGACY_CLEANUP_CONTRACT_ROOT
  ? path.resolve(process.env.LEGACY_CLEANUP_CONTRACT_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

function code(rel) {
  return stripComments(readFileSync(path.join(ROOT, rel), "utf8"));
}

function walk(dir, out = []) {
  const abs = path.join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const name of readdirSync(abs)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const rel = path.join(dir, name);
    const st = statSync(path.join(ROOT, rel));
    if (st.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx|mts|mjs)$/.test(name)) out.push(rel);
  }
  return out;
}

const PRINT_COUNT = "src/lib/exams/exam-print-count.ts";
const CRUD = "src/actions/exams/crud.ts";
const HWPX_ROUTE = "src/app/api/exams/[examId]/export-hwpx/route.ts";
const DOCX_ROUTE = "src/app/api/exams/[examId]/export-docx/route.ts";
const Q_HWPX = "src/app/api/questions/[questionId]/export-hwpx/route.ts";
const Q_DOCX = "src/app/api/questions/[questionId]/export-docx/route.ts";
const ADMIN_EXPORT = "src/app/api/admin/exam-export/route.ts";
const ADMIN_PRINT_PAGE = "src/app/(admin-bare)/admin/exam-print/page.tsx";
const ADMIN_PRINT_MODEL = "src/components/admin/exam-print-model.ts";
const LANDING_DEMO = "scripts/landing/build-demo-exports.mts";
const DETAIL_PREVIEW = "src/components/exams/exam-detail-paper-preview.tsx";
const DETAIL_HEADER = "src/components/exams/exam-detail-client-parts/header-section.tsx";
const HWPX_QUESTION = "src/app/api/exams/[examId]/export-hwpx/_lib/render/question.ts";
const HWPX_FRAGMENT = "src/app/api/exams/[examId]/export-hwpx/_lib/render/fragment.ts";

test("L1 printCount 증가는 updatedAt 을 건드리지 않는 단일 원시 UPDATE(학원 범위)다", () => {
  const helper = code(PRINT_COUNT);
  assert.match(helper, /\$executeRaw`/, "원시 UPDATE($executeRaw 태그드 템플릿)여야 한다");
  assert.match(helper, /UPDATE\s+"exams"\s+SET\s+"printCount"\s*=\s*"printCount"\s*\+\s*1/, "printCount 만 1 올린다");
  assert.match(helper, /WHERE\s+"id"\s*=\s*\$\{examId\}\s+AND\s+"academyId"\s*=\s*\$\{academyId\}/, "학원 범위 WHERE");
  assert.doesNotMatch(helper, /updatedAt/, "updatedAt 을 쓰지 않는다");

  const offenders = walk("src").filter((rel) => /printCount\s*:\s*\{\s*increment/.test(code(rel)));
  assert.deepEqual(offenders, [], "prisma update 의 printCount increment 는 updatedAt 을 올린다 — 금지");

  for (const rel of [CRUD, HWPX_ROUTE, DOCX_ROUTE]) {
    const src = code(rel);
    assert.match(src, /from\s+"@\/lib\/exams\/exam-print-count"/, `${rel}: 단일 경로 import`);
    assert.match(src, /incrementExamPrintCountRow\(\s*exam\.id\s*,\s*staff\.academyId\s*\)/, `${rel}: 학원 id 로 호출`);
  }
});

test("L2 단일 문항 내보내기 라우트는 로더에 학원 id 를 넘긴다", () => {
  for (const rel of [Q_HWPX, Q_DOCX]) {
    const src = code(rel);
    assert.match(src, /loadSingleQuestionExport\(\s*questionId\s*,\s*staff\.academyId\s*\)/, `${rel}: academyId 전달`);
    assert.doesNotMatch(src, /loadSingleQuestionExport\(\s*questionId\s*\)/, `${rel}: 인자 없는 호출 금지`);
    assert.match(src, /data\.academyId\s*!==\s*staff\.academyId/, `${rel}: 이중 방어 비교 유지`);
  }
});

test("L3 관리자 DOCX·보기 화면·랜딩 데모는 공용 정본을 쓰고 레거시 buildExamDocument 는 import 되지 않는다", () => {
  const admin = code(ADMIN_EXPORT);
  assert.match(admin, /buildExamDocxDocument\(\s*\{\s*title\s*,\s*examQuestions\s*,\s*settings\s*,\s*includeAnswers\s*\}\s*\)/);
  assert.match(admin, /settings\s*=\s*parseSavedPaperSettings\(\s*exam\.settings\s*\)/, "examId 경로는 저장 settings 를 쓴다");
  assert.match(admin, /where:\s*\{\s*question:\s*\{\s*deletedAt:\s*null\s*\}\s*\}/, "휴지통 문항 제외");

  const page = code(ADMIN_PRINT_PAGE);
  assert.match(page, /buildAdminPrintModel\(\s*examQuestions\s*,\s*settings\s*\)/);
  assert.match(page, /settings\s*=\s*parseSavedPaperSettings\(\s*exam\.settings\s*\)/);
  const model = code(ADMIN_PRINT_MODEL);
  for (const fn of ["buildPaperItemsFromExam", "buildGroups", "toPaperExportItem", "answerKeyEntryForItem", "resolvePaperLayout"]) {
    assert.match(model, new RegExp(`${fn}\\(`), `관리자 인쇄 모델은 ${fn} 를 쓴다`);
  }

  const landing = code(LANDING_DEMO);
  assert.match(landing, /buildExamDocxDocument\(/);
  assert.match(landing, /buildExamHwpxDocument\(/);

  const importers = [...walk("src"), ...walk("scripts")].filter((rel) =>
    /from\s+["'][^"']*export-docx\/_lib\/build-document["']/.test(code(rel)),
  );
  assert.deepEqual(importers, [], "레거시 DOCX 렌더러(buildExamDocument) 소비처가 없어야 한다");
});

test("L4 웹 상세·첫 장 미리보기의 레이아웃 기본값은 resolvePaperLayout 하나에서 온다", () => {
  const src = code(DETAIL_PREVIEW);
  const calls = src.match(/resolvePaperLayout\(\s*settings\s*\)/g) ?? [];
  assert.equal(calls.length, 2, "상세 + 첫 장 두 컴포넌트가 모두 resolvePaperLayout(settings)");
  for (const dup of [
    /showAnswerSpace\s*\?\?\s*true/,
    /\?\?\s*DEFAULT_SHOW_PASSAGE_TITLE/,
    /showQuestionMeta\s*\?\?\s*false/,
    /\|\|\s*DEFAULT_INSTRUCTIONS/,
    /settings\?\.layout\?\.columns\s*===\s*1/,
    /settings\?\.header\?\./,
  ]) {
    assert.doesNotMatch(src, dup, `인라인 기본값 복제 금지: ${dup}`);
  }
});

test("L5 상세 머리 「시험지 다운로드」 DOCX 링크마다 원문 지문 없음 경고를 띄운다", () => {
  const src = code(DETAIL_HEADER);
  assert.match(src, /useMissingSourcePassage\(\s*paperItems\s*\)/);
  assert.match(src, /buildPaperItemsFromExam\(\s*exam\.questions\s*,\s*parseSavedPaperSettings\(\s*exam\.settings\s*\)\s*\)/);
  const links = src.match(/export-docx/g) ?? [];
  const warnings = src.match(/warnExport\(\s*"DOCX"\s*\)/g) ?? [];
  assert.ok(links.length > 0, "DOCX 링크가 있다");
  // 링크 하나당 href 속성 + onClick 캐시 버스터 두 번 등장한다.
  assert.equal(warnings.length, links.length / 2, "DOCX 링크마다 warnExport 1회");
});

test("L6 HWPX 배지는 라벨 없는 유형에 원시 코드를 찍지 않는다", () => {
  for (const rel of [HWPX_QUESTION, HWPX_FRAGMENT]) {
    const src = code(rel);
    assert.doesNotMatch(src, /SUBTYPE_LABELS\[subType\]\s*\|\|\s*subType/, `${rel}: 원시 유형 코드 폴백 금지`);
    assert.match(src, /SUBTYPE_LABELS\[subType\]\s*\|\|\s*""/, `${rel}: 라벨 없으면 빈 문자열`);
  }
});

test("L7 HWPX KO 지문 억제는 문항 안 지문(printInlinePassageOf)으로 정한다", () => {
  const src = code(HWPX_QUESTION);
  assert.doesNotMatch(src, /koPaperRenderModel\(\s*item\s*\)/, "includePassage 재해석(koPaperRenderModel(item)) 금지");
  assert.match(
    src,
    /koPaperRenderModel\(\s*\{\s*\.\.\.item\s*,\s*includePassage:\s*printInlinePassageOf\(\s*item\s*\)\.length\s*>\s*0\s*\}\s*\)/,
  );
});
