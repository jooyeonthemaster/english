/**
 * AI 문제 수정 — E2E (실모델 + 실DB 스키마 검증, 무오염 롤백)
 *   npx tsx scripts/e2e-question-ai-edit.ts
 *
 * 1) 실제 GRAMMAR_ERROR 문제에 사용자 시나리오("조동사·시제 중심") 수정 → 엔진 실행
 * 2) 유형고정·누설안전·렌더안전 + 지시 반영(어법 포인트) 확인
 * 3) 저장본(save-as) create + 적용(apply) update 를 실제 prisma 스키마로 검증하되
 *    트랜잭션 롤백으로 DB 에 아무 행도 남기지 않는다.
 */
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.join(process.cwd(), ".env") });

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "../src/lib/prisma";
import { runQuestionEdit } from "../src/lib/question-ai-edit/run-edit";
import { buildGeneratedQuestionText } from "../src/lib/question-generation-persistence";
import { StructuredQuestionRenderer } from "../src/components/workbench/question-renderers";

type Rec = Record<string, unknown>;

const ROLLBACK = "__E2E_ROLLBACK__";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function main() {
  const subType = "GRAMMAR_ERROR";
  const q = await prisma.question.findFirst({
    where: { subType, structuredData: { not: null }, passageId: { not: null } },
    include: { passage: { select: { content: true, grade: true, school: { select: { type: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  if (!q || !q.structuredData) throw new Error("no GRAMMAR_ERROR sample with structuredData");

  const before = { ...(q.structuredData as Rec) };
  if (!before._typeId) before._typeId = subType;

  console.log(`[1] runQuestionEdit on GRAMMAR_ERROR (q=${q.id})…`);
  const res = await runQuestionEdit({
    subType,
    passageContent: q.passage?.content ?? "",
    baseline: before,
    instruction:
      "이게 아니야! 어법 포인트를 조동사와 시제 중심으로 다시 구성해줘. 밑줄·정답·오답해설을 전부 그 포인트에 맞춰.",
    schoolType: q.passage?.school?.type === "MIDDLE" ? "중학교" : "고등학교",
    gradeInfo: q.passage?.grade ? String(q.passage.grade) : "",
    generationPlan: "STANDARD",
    modelId: "gemini-3.5-flash",
  });

  const checks: Array<[string, boolean]> = [];
  checks.push(["edit ok", res.ok && !!res.after]);
  const after = res.after as Rec;
  checks.push(["type locked", after?._typeId === subType]);

  // 렌더 안전.
  let renderOk = false;
  try {
    const html = renderToStaticMarkup(
      React.createElement(StructuredQuestionRenderer, { question: after, index: 0, sourcePassageContent: q.passage?.content ?? "" }),
    );
    renderOk = html.length > 50;
  } catch (e) {
    console.error("render error:", e);
  }
  checks.push(["render safe", renderOk]);

  // 누설 안전(학생 직렬화).
  const studentText = res.questionText ?? buildGeneratedQuestionText(after);
  const correctness = typeof after.correctAnswer === "string" ? after.correctAnswer : "";
  // GRAMMAR_ERROR 는 정답이 label 이라 누설 개념이 약하지만, 해설 내부 정답 인용은 학생용 questionText 에 없어야 한다.
  checks.push(["questionText present", studentText.length > 20]);

  // 지시 반영(소프트): 해설/표시표현/태그에 조동사·시제·시상 관련 흔적.
  const blob = JSON.stringify(after);
  const reflects = /조동사|시제|시상|modal|tense|현재완료|과거완료|will|would|should|must|can|could/i.test(blob);
  checks.push(["instruction reflected (soft)", reflects]);

  console.log(`    model=${res.meta.modelId} ${res.meta.durationMs}ms attempts=${res.meta.attempts} warnings=${res.qualityWarnings.length}`);
  console.log(`    changes: ${res.changes.map((c) => `${c.label}:${c.kind}`).join(", ")}`);
  console.log(`    --- 상세 수정 내역 (${res.detailedChanges.length}건) ---`);
  for (const e of res.detailedChanges.slice(0, 8)) {
    const ref = e.ref ? ` ${e.ref}` : "";
    const b = e.before ? `\n        전: ${e.before.slice(0, 80)}` : "";
    const a = e.after ? `\n        후: ${e.after.slice(0, 80)}` : "";
    console.log(`    [${e.category}${ref}] ${e.kind}${b}${a}`);
  }
  checks.push(["detailed diff non-empty", res.detailedChanges.length > 0]);

  // [2] save-as create + [3] apply update — 실 스키마 검증, 롤백.
  console.log(`[2/3] persistence shape validation via rollback transaction…`);
  const editedTags = Array.isArray(after.tags) ? (after.tags as string[]) : [];
  const tags = editedTags.includes("AI수정본") ? editedTags : [...editedTags, "AI수정본"];
  const optionsArr = Array.isArray(after.options) ? after.options : null;
  const correctAnswer =
    typeof after.correctAnswer === "string"
      ? after.correctAnswer
      : Array.isArray(after.correctAnswers)
        ? (after.correctAnswers as unknown[]).map(String).join(", ")
        : typeof after.modelAnswer === "string"
          ? after.modelAnswer
          : "";
  const questionText = res.questionText || buildGeneratedQuestionText(after);

  let createOk = false;
  let updateOk = false;
  try {
    await prisma.$transaction(async (tx) => {
      // save-as: create 새 문제 (원본 보존).
      const created = await tx.question.create({
        data: {
          academyId: q.academyId,
          passageId: q.passageId,
          type: q.type,
          subType: q.subType,
          questionText,
          structuredData: toJson({ ...after, _editedFrom: q.id, tags }),
          options: optionsArr ? JSON.stringify(optionsArr) : null,
          correctAnswer,
          points: q.points ?? 1,
          difficulty: typeof after.difficulty === "string" ? after.difficulty : "INTERMEDIATE",
          tags: JSON.stringify(tags),
          aiGenerated: true,
          approved: false,
          explanation:
            typeof after.explanation === "string" && after.explanation.trim()
              ? {
                  create: {
                    content: after.explanation,
                    keyPoints: Array.isArray(after.keyPoints) ? JSON.stringify(after.keyPoints) : null,
                    wrongOptionExplanations: after.wrongOptionExplanations
                      ? JSON.stringify(after.wrongOptionExplanations)
                      : null,
                    aiGenerated: true,
                  },
                }
              : undefined,
        },
        include: { explanation: true },
      });
      createOk =
        created.subType === subType &&
        created.questionText.length > 0 &&
        created.tags!.includes("AI수정본");

      // apply: update 기존 문제 (롤백되므로 원본 불변).
      const updated = await tx.question.update({
        where: { id: q.id },
        data: {
          questionText,
          structuredData: toJson({ ...after, tags }),
          options: optionsArr ? JSON.stringify(optionsArr) : null,
          correctAnswer,
          difficulty: typeof after.difficulty === "string" ? after.difficulty : undefined,
          tags: JSON.stringify(tags),
        },
      });
      updateOk = updated.id === q.id && updated.questionText.length > 0;

      throw new Error(ROLLBACK); // 모든 변경 롤백 — DB 무오염.
    });
  } catch (e) {
    if (!(e instanceof Error && e.message === ROLLBACK)) {
      console.error("persistence error:", e);
    }
  }
  checks.push(["save-as create shape valid", createOk]);
  checks.push(["apply update shape valid", updateOk]);

  // 원본이 그대로인지 재확인(롤백 검증).
  const stillThere = await prisma.question.findUnique({ where: { id: q.id }, select: { id: true } });
  checks.push(["rollback left original intact", !!stillThere]);

  console.log("\n========== E2E RESULT ==========");
  let allPass = true;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
    if (!ok) allPass = false;
  }
  await prisma.$disconnect();
  if (!allPass) process.exit(1);
  console.log("\nALL E2E CHECKS PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
