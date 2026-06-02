// ============================================================================
// 장문 세트 — generation orchestrator (server)
// ============================================================================
// Ties together: composition gate → structural-first generation → non-structural
// members generated against the DISPLAYED base (so anchors resolve against what the
// student sees) → deterministic leakage scan → set-aware persistence. Reuses the
// proven single-question generation pipeline (runQuestionGenerationWithEmptyRetry)
// per member, so the LLM never has to "coordinate N questions" — Gemini does what
// it does today, once per member, and isolation is enforced in code afterward.
// ============================================================================

import { createHash } from "crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { buildQuestionAnnotationBlock } from "@/lib/annotation-prompt";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import { findExpressionInPassageStrict } from "@/lib/question-postprocess/text-utils";
import {
  buildAnalysisContext,
  extractTeacherAnnotations,
} from "@/app/api/ai/generate-questions-auto/_lib/build-analysis-context";
import { DIFF_DESCRIPTION } from "@/app/api/ai/generate-questions-auto/_lib/constants";
import { runQuestionGenerationWithEmptyRetry } from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation";

import { extractAnchors } from "./anchor-extraction";
import {
  scanSetForLeakage,
  validateSetComposition,
  type LeakageConflict,
  type MemberSpanSet,
  type ResolvedSpan,
} from "./leakage-gate";
import { prepareSetMember } from "./persistence";
import {
  isStructuralType,
  type Anchor,
  type LayoutBlock,
  type LayoutDescriptor,
  type StructuralMode,
} from "./types";

export interface SetMemberInput {
  typeId: string;
  difficulty: "BASIC" | "INTERMEDIATE" | "KILLER";
  typeSettings?: unknown;
}

export interface GenerateSetParams {
  academyId: string;
  staffId: string;
  jobId?: string;
  passageId: string;
  structuralMode: StructuralMode;
  setLabel?: string;
  generationPlan: QuestionGenerationPlan;
  customPrompt?: string;
  members: SetMemberInput[];
}

export interface GenerateSetResult {
  setId: string;
  status: "OK" | "DEGRADED";
  conflicts: LeakageConflict[];
  degradedCount: number;
  questionIds: string[];
}

interface GenContext {
  schoolType: string;
  gradeInfo: string;
  teacherIntentBlock: string;
  analysisContext: string;
  generationPlan: QuestionGenerationPlan;
  customPrompt?: string;
}

type AnyRecord = Record<string, unknown>;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Generate ONE member against `passageContent`, returning its post-processed data. */
async function generateOne(
  passageContent: string,
  subType: string,
  difficulty: string,
  typeSettings: unknown,
  ctx: GenContext,
): Promise<AnyRecord | null> {
  const diffLabel = difficulty || "INTERMEDIATE";
  const result = await runQuestionGenerationWithEmptyRetry(
    {
      plan: [{ subType, count: 1, reason: "장문 세트 member", targetPoints: [] }],
      schoolType: ctx.schoolType,
      gradeInfo: ctx.gradeInfo,
      passageContent,
      teacherIntentBlock: ctx.teacherIntentBlock,
      analysisContext: ctx.analysisContext,
      diffLabel,
      diffInstruction: DIFF_DESCRIPTION[diffLabel] || DIFF_DESCRIPTION.INTERMEDIATE,
      generationPlan: ctx.generationPlan,
      customPrompt: ctx.customPrompt,
      typeSettings: typeSettings
        ? ({ [subType]: typeSettings } as Record<string, unknown>)
        : undefined,
    },
    { logPrefix: "SET-GEN" },
  );
  return (result.questions[0] as AnyRecord | undefined) ?? null;
}

/** Build the displayed base passage + layout descriptor from a structural member. */
function buildStructuralLayout(
  mode: StructuralMode,
  structural: AnyRecord | null,
  canonicalPassage: string,
): { displayedBase: string; layout: LayoutDescriptor } {
  if (mode === "SENTENCE_ORDER" && structural) {
    const givenSentence =
      typeof structural.givenSentence === "string" ? structural.givenSentence : "";
    const paragraphs = Array.isArray(structural.paragraphs)
      ? (structural.paragraphs as AnyRecord[])
      : [];
    const blocks: LayoutBlock[] = paragraphs.map((p, i) => ({
      label: typeof p.label === "string" ? p.label : `(${String.fromCharCode(65 + i)})`,
      text: typeof p.text === "string" ? p.text : "",
      canonicalIndex: i,
      displayOrder: i,
    }));
    const lines: string[] = [];
    if (givenSentence) lines.push(givenSentence);
    for (const b of blocks) lines.push(`${b.label} ${b.text}`.trim());
    const displayedBase = lines.join("\n\n");
    const correctOrder = Array.isArray(structural.correctOrder)
      ? (structural.correctOrder as number[])
      : undefined;
    const layoutNoHash = {
      type: mode,
      givenSentence: givenSentence || undefined,
      blocks,
      correctOrder,
      fullPassage: displayedBase,
    };
    return {
      displayedBase,
      layout: { ...layoutNoHash, fingerprintHash: sha256(JSON.stringify(layoutNoHash)) },
    };
  }

  if (mode === "SENTENCE_INSERT" && structural) {
    const displayedBase =
      (typeof structural.passageWithMarkers === "string" && structural.passageWithMarkers) ||
      (typeof structural.passageWithNumbers === "string" && structural.passageWithNumbers) ||
      canonicalPassage;
    const givenSentence =
      typeof structural.givenSentence === "string" ? structural.givenSentence : undefined;
    const layoutNoHash = { type: mode, givenSentence, fullPassage: displayedBase };
    return {
      displayedBase,
      layout: { ...layoutNoHash, fingerprintHash: sha256(JSON.stringify(layoutNoHash)) },
    };
  }

  // NONE — plain shared passage.
  const layoutNoHash = { type: "NONE" as const, fullPassage: canonicalPassage };
  return {
    displayedBase: canonicalPassage,
    layout: { ...layoutNoHash, fingerprintHash: sha256(JSON.stringify(layoutNoHash)) },
  };
}

/** Resolve anchors to char ranges in the displayed base; flag ambiguous/missing. */
function resolveSpans(
  base: string,
  anchors: Anchor[],
): { spans: ResolvedSpan[]; degraded: Anchor[] } {
  const spans: ResolvedSpan[] = [];
  const degraded: Anchor[] = [];
  for (const a of anchors) {
    const r = findExpressionInPassageStrict(base, a.spanText, a.surroundingText);
    if (r.pos && !r.ambiguous) {
      spans.push({
        start: r.pos.index,
        end: r.pos.index + r.pos.length,
        kind: a.kind,
        label: a.label,
      });
    } else {
      degraded.push(a);
      if (r.pos) {
        // Still record the (uncertain) range so the leakage scan stays conservative.
        spans.push({
          start: r.pos.index,
          end: r.pos.index + r.pos.length,
          kind: a.kind,
          label: a.label,
        });
      }
    }
  }
  return { spans, degraded };
}

/**
 * Orchestrate generation + isolation + persistence of one 장문 세트.
 * Throws on composition error (caller surfaces the Korean message). Returns a
 * DEGRADED status (not an error) when anchors are ambiguous or a leak conflict
 * survives — the set is saved for manual review rather than silently shipped.
 */
export async function generateQuestionSet(
  params: GenerateSetParams,
): Promise<GenerateSetResult> {
  const composition = validateSetComposition(
    params.members.map((m) => ({ typeId: m.typeId })),
    params.structuralMode,
  );
  if (!composition.ok) {
    throw new Error(composition.errors.join(" "));
  }

  const passage = await prisma.passage.findFirst({
    where: { id: params.passageId, academyId: params.academyId },
    include: {
      school: { select: { type: true, name: true } },
      analysis: { select: { analysisData: true } },
      notes: { orderBy: { order: "asc" } },
    },
  });
  if (!passage) throw new Error("지문을 찾을 수 없습니다.");

  const ctx: GenContext = {
    schoolType: passage.school?.type === "MIDDLE" ? "중학교" : "고등학교",
    gradeInfo: passage.grade ? `${passage.grade}학년` : "",
    teacherIntentBlock: buildQuestionAnnotationBlock(extractTeacherAnnotations(passage)),
    analysisContext: buildAnalysisContext(passage),
    generationPlan: params.generationPlan,
    customPrompt: params.customPrompt,
  };

  const canonicalPassage = passage.content;
  const structuralIndex = params.members.findIndex((m) => isStructuralType(m.typeId));

  // 1) Structural member FIRST — it defines the displayed base.
  const generated: (AnyRecord | null)[] = new Array(params.members.length).fill(null);
  let displayedBase = canonicalPassage;
  let layout: LayoutDescriptor;

  if (structuralIndex >= 0) {
    const sm = params.members[structuralIndex];
    const structuralQ = await generateOne(
      canonicalPassage,
      sm.typeId,
      sm.difficulty,
      sm.typeSettings,
      ctx,
    );
    generated[structuralIndex] = structuralQ;
    const built = buildStructuralLayout(params.structuralMode, structuralQ, canonicalPassage);
    displayedBase = built.displayedBase;
    layout = built.layout;
  } else {
    layout = buildStructuralLayout("NONE", null, canonicalPassage).layout;
  }

  // 2) Non-structural members IN PARALLEL against the DISPLAYED base.
  await Promise.all(
    params.members.map(async (m, i) => {
      if (i === structuralIndex) return;
      generated[i] = await generateOne(
        displayedBase,
        m.typeId,
        m.difficulty,
        m.typeSettings,
        ctx,
      );
    }),
  );

  // 3) Per-member: extract anchors, resolve against displayed base, prepare persistence.
  const memberSpanSets: MemberSpanSet[] = [];
  const prepared: Array<{
    input: SetMemberInput;
    data: AnyRecord;
    isStructural: boolean;
    questionText: string;
    structuredData: AnyRecord;
    spans: Anchor[];
    correctAnswer: string;
    options: unknown;
  }> = [];
  let degradedCount = 0;

  for (let i = 0; i < params.members.length; i++) {
    const m = params.members[i];
    const data = generated[i];
    if (!data) {
      degradedCount += 1;
      continue;
    }
    const structural = i === structuralIndex;
    const member = prepareSetMember(m.typeId, data, structural);

    const anchors = structural ? [] : extractAnchors(m.typeId, data);
    const { spans, degraded } = structural
      ? { spans: [{ start: 0, end: displayedBase.length, kind: "BLOCK" } as ResolvedSpan], degraded: [] as Anchor[] }
      : resolveSpans(displayedBase, anchors);
    degradedCount += degraded.length;

    memberSpanSets.push({ index: i, typeId: m.typeId, isStructural: structural, spans });
    prepared.push({
      input: m,
      data,
      isStructural: structural,
      questionText: member.questionText,
      structuredData: member.structuredData,
      spans: member.spans,
      correctAnswer:
        typeof data.correctAnswer === "string"
          ? data.correctAnswer
          : typeof data.modelAnswer === "string"
            ? data.modelAnswer
            : "",
      options: Array.isArray(data.options) ? data.options : undefined,
    });
  }

  if (prepared.length === 0) {
    throw new Error("세트 문항을 한 개도 생성하지 못했습니다.");
  }

  // 4) Deterministic leakage scan over the displayed base.
  const leak = scanSetForLeakage(memberSpanSets, displayedBase);
  const status: "OK" | "DEGRADED" =
    leak.status === "CONFLICT" || degradedCount > 0 ? "DEGRADED" : "OK";

  // 5) Persist set + members + items in ONE transaction.
  const questionIds: string[] = [];
  const created = await prisma.$transaction(async (tx) => {
    const set = await tx.questionSet.create({
      data: {
        jobId: params.jobId ?? null,
        academyId: params.academyId,
        structuralMode: params.structuralMode,
        canonicalPassage,
        displayedPassageLayout: JSON.stringify(layout),
        layoutFingerprint: layout.fingerprintHash,
        itemCount: prepared.length,
        setLabel: params.setLabel ?? null,
        status,
      },
    });

    for (let order = 0; order < prepared.length; order++) {
      const p = prepared[order];
      const question = await tx.question.create({
        data: {
          academyId: params.academyId,
          passageId: params.passageId,
          type: Array.isArray(p.options) ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
          subType: p.input.typeId,
          questionText: p.questionText,
          structuredData: p.structuredData as unknown as Prisma.InputJsonValue,
          options: Array.isArray(p.options) ? JSON.stringify(p.options) : null,
          correctAnswer: p.correctAnswer,
          difficulty: p.input.difficulty,
          aiGenerated: true,
          inSet: true,
          setId: set.id,
        },
      });
      questionIds.push(question.id);
      await tx.questionSetItem.create({
        data: {
          setId: set.id,
          questionId: question.id,
          orderInSet: order,
          isStructural: p.isStructural,
          spans: p.spans as unknown as Prisma.InputJsonValue,
        },
      });
    }

    return set;
  });

  return {
    setId: created.id,
    status,
    conflicts: leak.conflicts,
    degradedCount,
    questionIds,
  };
}
