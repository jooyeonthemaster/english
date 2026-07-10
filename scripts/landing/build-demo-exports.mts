/**
 * 랜딩 Step4 데모용 Word(DOCX)·한글(HWPX) 예시 파일 생성 — 1회 실행 후 커밋.
 *
 *   npx tsx scripts/landing/build-demo-exports.mts
 *
 * 실제 워크벤치 내보내기 빌더(buildExamDocument / buildBuilderHwpxDocument)를
 * 그대로 사용해, 데모 fixture(DEMO_BUILDER_QUESTIONS)와 동일한 시험지를
 * public/landing/demo/ 에 떨어뜨린다. (서버·DB·인증 불필요 — 빌더는 순수 함수)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Packer } from "docx";
import { buildExamDocument } from "@/app/api/exams/[examId]/export-docx/_lib/build-document";
import type { ExamQuestionData } from "@/app/api/exams/[examId]/export-docx/_lib/types";
import { buildBuilderHwpxDocument } from "@/app/api/exams/[examId]/export-hwpx/_lib/builder";
import { packageHwpx } from "@/app/api/exams/[examId]/export-hwpx/_lib/package";
import type { BuilderItemResolved } from "@/app/api/exams/[examId]/export-hwpx/_lib/render/question";
import { DEMO_BUILDER_QUESTIONS } from "@/components/landing/demo/fixtures/builder-questions";

const TITLE = "실전 대비 모의고사 (SMOAT 데모)";
const OUT_DIR = path.resolve("public/landing/demo");

const examQuestions: ExamQuestionData[] = DEMO_BUILDER_QUESTIONS.map((q, i) => ({
  orderNum: i + 1,
  points: q.points,
  question: {
    id: q.id,
    type: q.type,
    subType: q.subType,
    questionText: q.questionText,
    structuredData: q.structuredData,
    options: q.options,
    correctAnswer: q.correctAnswer,
    difficulty: q.difficulty,
    passage: q.passage
      ? { title: q.passage.title, content: q.passage.content }
      : null,
    explanation: q.explanation?.content
      ? {
          content: q.explanation.content,
          keyPoints: null,
          wrongOptionExplanations: null,
        }
      : null,
  },
}));

mkdirSync(OUT_DIR, { recursive: true });

// ── DOCX ──
const doc = buildExamDocument(TITLE, examQuestions, false, {
  columns: 2,
  density: "comfortable",
  template: "clean",
});
const docxBuffer = await Packer.toBuffer(doc);
writeFileSync(path.join(OUT_DIR, "smoat-demo-exam.docx"), docxBuffer);
console.log("docx →", docxBuffer.length, "bytes");

// ── HWPX ── (settings 없는 시험과 동일한 경로: 문항 나열 → 기본 조판)
const resolvedItems: BuilderItemResolved[] = examQuestions.map((eq) => ({
  questionId: eq.question.id,
  orderNum: eq.orderNum,
  points: eq.points,
  sourceQuestion: eq.question,
}));
const hwpxDoc = buildBuilderHwpxDocument({
  title: TITLE,
  settings: null,
  resolvedItems,
  includeAnswers: false,
  fullExamQuestions: examQuestions,
});
const hwpxBuffer = await packageHwpx(hwpxDoc);
writeFileSync(path.join(OUT_DIR, "smoat-demo-exam.hwpx"), hwpxBuffer);
console.log("hwpx →", hwpxBuffer.length, "bytes");

console.log("완료:", OUT_DIR);
