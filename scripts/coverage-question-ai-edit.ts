/**
 * AI 문제 수정 — 전 유형 커버리지 실측 (기본 모델 gemini-3.5-flash)
 * 지원되는 모든 구조화 유형에 대해 실제 DB 문제 1건씩 골라 "그 유형의 첫 빠른 프리셋"
 * 지시로 수정해 본다. 유형별 성공/유형고정/렌더/누설/구조유지/지연을 표로 출력.
 *   npx tsx scripts/coverage-question-ai-edit.ts
 */
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.join(process.cwd(), ".env") });

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { prisma } from "../src/lib/prisma";
import { runQuestionEdit } from "../src/lib/question-ai-edit/run-edit";
import { StructuredQuestionRenderer } from "../src/components/workbench/question-renderers";
import { AI_QUESTION_SCHEMAS } from "../src/lib/question-ai-schemas-mc";
import { QUESTION_SCHEMAS } from "../src/lib/question-schemas";
import { getEditFocusPresets } from "../src/lib/question-ai-edit/focus-presets";
import {
  getQuestionGenerationPlanFromTags,
  normalizeQuestionGenerationPlan,
} from "../src/lib/question-generation-plans";

type Rec = Record<string, unknown>;

const SUPPORTED = Array.from(
  new Set([...Object.keys(AI_QUESTION_SCHEMAS), ...Object.keys(QUESTION_SCHEMAS)]),
).filter((t) => t !== "CUSTOM_LAYOUT");

function structCount(subType: string, q: Rec): number | null {
  const len = (v: unknown) => (Array.isArray(v) ? v.length : null);
  switch (subType) {
    case "GRAMMAR_ERROR": case "VOCAB_CHOICE": case "ANTONYM":
      return len(q.markedExpressions) ?? len(q.markedWords);
    case "GRAMMAR_CHOICE_COMBO": return len(q.slots);
    case "GRAMMAR_CORRECTION": return len(q.underlinedSegments);
    case "SUMMARY_WRITING": case "SUMMARY_COMPLETE": case "SUMMARY_COMPLETE_MC":
      return len(q.blanks);
    case "SENTENCE_INSERT": case "IRRELEVANT": case "CONTENT_MATCH":
      return len(q.options);
    default: return null;
  }
}

function collectSecrets(q: Rec): string[] {
  const out: string[] = [];
  const push = (v: unknown) => { if (typeof v === "string" && v.trim().length >= 4) out.push(v.trim()); };
  if (Array.isArray(q.blanks)) for (const b of q.blanks) {
    if (b && typeof b === "object") {
      push((b as Rec).answer);
      if (Array.isArray((b as Rec).acceptableVariants)) for (const v of (b as Rec).acceptableVariants as unknown[]) push(v);
    }
  }
  push(q.modelAnswer);
  return out;
}

async function main() {
  console.log(`Supported structured types: ${SUPPORTED.length}`);
  const rows: string[] = [];
  let okCount = 0, present = 0;

  for (const subType of SUPPORTED.sort()) {
    const q = await prisma.question.findFirst({
      where: { subType, structuredData: { not: null }, passageId: { not: null } },
      include: { passage: { select: { content: true, grade: true, school: { select: { type: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    if (!q || !q.structuredData) {
      rows.push(`${subType.padEnd(22)} (DB 표본 없음 — 미평가)`);
      continue;
    }
    present++;
    const before = { ...(q.structuredData as Rec) };
    if (!before._typeId) before._typeId = subType;
    const tags = (() => { try { return q.tags ? (JSON.parse(q.tags) as string[]) : []; } catch { return []; } })();
    const plan = normalizeQuestionGenerationPlan((before as Rec)._generationPlan) || getQuestionGenerationPlanFromTags(tags) || "STANDARD";
    const instruction = getEditFocusPresets(subType)[0]?.instruction || "오답을 더 매력적으로 다시 만들고 해설을 보강해줘.";
    const beforeCount = structCount(subType, before);

    try {
      const res = await runQuestionEdit({
        subType,
        passageContent: q.passage?.content ?? "",
        baseline: before,
        instruction,
        schoolType: q.passage?.school?.type === "MIDDLE" ? "중학교" : "고등학교",
        gradeInfo: q.passage?.grade ? String(q.passage.grade) : "",
        generationPlan: plan as "STANDARD" | "PREMIUM",
        modelId: "gemini-3.5-flash",
        maxAttempts: 2,
      });
      const after = res.after as Rec | undefined;
      let render = false;
      if (after) {
        try {
          render = renderToStaticMarkup(React.createElement(StructuredQuestionRenderer, { question: after, index: 0, sourcePassageContent: q.passage?.content ?? "" })).length > 50;
        } catch { render = false; }
      }
      const typeLock = after?._typeId === subType;
      const afterCount = after ? structCount(subType, after) : null;
      const countOk = beforeCount == null || afterCount == null || beforeCount === afterCount;
      let leak = true;
      if (after && res.questionText) { const s = collectSecrets(after); leak = !s.some((x) => res.questionText!.includes(x)); }
      if (res.ok) okCount++;
      const flag = res.ok && typeLock && render && leak && countOk ? "✓" : "✗";
      rows.push(
        `${flag} ${subType.padEnd(20)} ok=${res.ok ? "Y" : "N"} lock=${typeLock ? "Y" : "N"} render=${render ? "Y" : "N"} leak=${leak ? "safe" : "LEAK"} count=${countOk ? "keep" : `${beforeCount}->${afterCount}`} ${String(res.meta.durationMs).padStart(6)}ms w=${res.qualityWarnings.length}${res.ok ? "" : " ERR:" + (res.error || "").slice(0, 50)}`,
      );
      console.log(rows[rows.length - 1]);
    } catch (e) {
      rows.push(`✗ ${subType.padEnd(20)} THREW: ${e instanceof Error ? e.message.slice(0, 60) : e}`);
      console.log(rows[rows.length - 1]);
    }
  }

  console.log(`\n========== COVERAGE: ${okCount}/${present} types succeeded (of ${SUPPORTED.length} supported, ${present} had DB samples) ==========`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
