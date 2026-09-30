/**
 * 랜딩 Step4 데모용 Word(DOCX)·한글(HWPX) 예시 파일 생성 — 1회 실행 후 커밋.
 *
 *   npx tsx scripts/landing/build-demo-exports.mts [--out <dir>]   (기본 public/landing/demo)
 *
 * 실제 시험지 내보내기 라우트의 진입점(buildExamDocxDocument / buildExamHwpxDocument)을 그대로 사용해,
 * 데모 fixture(DEMO_BUILDER_QUESTIONS)와 동일한 시험지를 떨어뜨린다. settings 없는 시험지(NULL)와 같은
 * 경로다 — 「무엇을 찍을지」는 웹 상세·인쇄와 같은 공용 정본(buildPaperItemsFromExam)이 정한다(26-09-30 COH-2 c;
 * 예전에는 레거시 buildExamDocument 와 손으로 만든 HWPX 입력을 썼다). 서버·DB·인증 불필요 — 순수 함수.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Packer } from "docx";
import * as assembleModule from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document/assemble";
import * as hwpxDocumentModule from "@/app/api/exams/[examId]/export-hwpx/_lib/exam-document";
import * as hwpxPackageModule from "@/app/api/exams/[examId]/export-hwpx/_lib/package";
import * as fixtureModule from "@/components/landing/demo/fixtures/builder-questions";
import type { SavedPaperExamQuestion } from "@/components/exams/paper-builder/saved-paper-items";

// tsx 가 TS 모듈을 CJS 로 내보내는 경우(named export 가 default 아래로 들어감)를 함께 받는다.
const unwrap = <T,>(m: T): T => ((m as { default?: T }).default ?? m) as T;
const { buildExamDocxDocument } = unwrap(assembleModule);
const { buildExamHwpxDocument } = unwrap(hwpxDocumentModule);
const { packageHwpx } = unwrap(hwpxPackageModule);
const { DEMO_BUILDER_QUESTIONS } = unwrap(fixtureModule);

const TITLE = "실전 대비 모의고사 (SMOAT 데모)";
const outArg = process.argv.indexOf("--out");
const OUT_DIR = path.resolve(outArg >= 0 ? process.argv[outArg + 1] : "public/landing/demo");

const examQuestions: SavedPaperExamQuestion[] = DEMO_BUILDER_QUESTIONS.map((q, i) => ({
  orderNum: i + 1,
  points: q.points,
  question: q,
}));

mkdirSync(OUT_DIR, { recursive: true });

// ── DOCX ── (export-docx 라우트와 같은 진입점 · settings 없음 = 레이아웃 기본값 2단·보통·clean)
const doc = buildExamDocxDocument({ title: TITLE, examQuestions, settings: null, includeAnswers: false });
const docxBuffer = await Packer.toBuffer(doc);
writeFileSync(path.join(OUT_DIR, "smoat-demo-exam.docx"), docxBuffer);
console.log("docx →", docxBuffer.length, "bytes");

// ── HWPX ── (export-hwpx 라우트와 같은 진입점)
const { doc: hwpxDoc } = await buildExamHwpxDocument({
  title: TITLE,
  settings: null,
  questions: examQuestions,
  includeAnswers: false,
  examDateLabel: "",
});
const hwpxBuffer = await packageHwpx(hwpxDoc);
writeFileSync(path.join(OUT_DIR, "smoat-demo-exam.hwpx"), hwpxBuffer);
console.log("hwpx →", hwpxBuffer.length, "bytes");

console.log("완료:", OUT_DIR);
