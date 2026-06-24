// ============================================================================
// 지문 세트 — generation orchestrator (preset-driven, server)
// ============================================================================
// 흐름: 프리셋 해석 → 지문 로드 + 최소분량 게이트 → 구조멤버 우선 생성(있으면) →
// 비구조 멤버를 "표시 베이스"에 대해 병렬 생성(앵커가 학생이 보는 지문에 맞게
// 해소되도록) → 결정론적 누설 스캔 → 세트-인지 저장(트랜잭션 타임아웃 + 해설행).
// 멤버 생성은 기존 단일문항 엔진(runQuestionGenerationWithEmptyRetry)을 멤버당
// 1회 재사용 — LLM은 "N문항 조율"을 하지 않고, 격리는 코드로 사후 강제한다.
//
// 생성(buildQuestionSet, DB 무저장)과 저장(persistQuestionSet)을 분리해 하네스에서
// 생성 품질만 따로 검증할 수 있게 한다.
// ============================================================================

import { createHash } from "crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { buildQuestionAnnotationBlock } from "@/lib/annotation-prompt";
import { QUESTION_PERSISTENCE_TRANSACTION_TIMEOUT_MS } from "@/lib/concurrency-config";
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
  type LeakageConflict,
  type LeakageReport,
  type MemberSpanSet,
  type ResolvedSpan,
} from "./leakage-gate";
import { prepareSetMember } from "./persistence";
import {
  passageMeetsPreset,
  resolvePreset,
  type SetDifficulty,
  type SetPreset,
} from "./presets";
import {
  isStructuralType,
  type Anchor,
  type LayoutBlock,
  type LayoutDescriptor,
  type StructuralMode,
} from "./types";

type AnyRecord = Record<string, unknown>;

/**
 * 멤버별 오버라이드 — UI에서 프리셋 위에 얹는 멤버 단위 커스터마이즈(일반 생성의
 * 유형별 설정과 동일). 프리셋의 멤버 순서와 1:1 평행 배열. 유형(typeId)은 프리셋이
 * 고정(검증된 조합 보존)하고, 난이도·세부설정만 멤버별로 바꾼다.
 */
export interface SetMemberOverride {
  difficulty?: SetDifficulty;
  typeSettings?: Record<string, unknown>;
}

export interface GenerateSetParams {
  academyId: string;
  staffId: string;
  jobId?: string;
  passageId: string;
  presetId: string;
  generationPlan: QuestionGenerationPlan;
  customPrompt?: string;
  /** 세트 전체 기본 난이도(멤버에 difficulty가 없을 때 사용). */
  difficulty?: SetDifficulty;
  /** 멤버별 오버라이드(프리셋 멤버 순서와 평행). */
  memberOverrides?: SetMemberOverride[];
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

/** 생성·후처리까지 끝낸 한 멤버(저장 직전 형태). */
export interface PreparedSetMember {
  typeId: string;
  difficulty: SetDifficulty;
  isStructural: boolean;
  /** 후처리 완료된 원 질문 데이터(해설 추출 등에 사용). */
  data: AnyRecord;
  questionText: string;
  structuredData: AnyRecord;
  /** 렌더타임 재구성용 앵커(저장 시 QuestionSetItem.spans). */
  spans: Anchor[];
  correctAnswer: string;
  options: unknown;
}

export interface BuildSetResult {
  preset: SetPreset;
  canonicalPassage: string;
  displayedBase: string;
  layout: LayoutDescriptor;
  members: PreparedSetMember[];
  leakage: LeakageReport;
  degradedCount: number;
  status: "OK" | "DEGRADED";
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** 한 멤버를 `passageContent` 에 대해 생성 — 기본 엔진을 멤버당 1회 재사용. */
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
      plan: [{ subType, count: 1, reason: "지문 세트 member", targetPoints: [] }],
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

/** 구조 멤버로부터 표시 베이스 지문 + 레이아웃 디스크립터를 만든다. */
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

/** 앵커를 표시 베이스의 문자 범위로 해소; 모호/누락은 degraded 로 분리. */
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
 * 생성 + 격리만 수행하고 DB 에는 쓰지 않는다(하네스 검증용). 지문 내용·컨텍스트를
 * 직접 받으므로 DB 없이 호출 가능. 저장은 persistQuestionSet 이 담당.
 */
export async function buildQuestionSet(opts: {
  preset: SetPreset;
  passageContent: string;
  ctx: GenContext;
  baseDifficulty: SetDifficulty;
  memberOverrides?: SetMemberOverride[];
}): Promise<BuildSetResult> {
  const { preset, passageContent, ctx, baseDifficulty, memberOverrides } = opts;
  const canonicalPassage = passageContent;
  // 유효 멤버 = 프리셋(유형·순서 고정) + 멤버별 오버라이드(난이도·세부설정). 일반 생성의
  // 유형별 설정과 동일한 커스터마이즈를 멤버 단위로 받는다.
  const members = preset.members.map((m, i) => {
    const ov = memberOverrides?.[i];
    return {
      typeId: m.typeId,
      difficulty: ov?.difficulty ?? m.difficulty,
      typeSettings:
        m.typeSettings || ov?.typeSettings
          ? { ...(m.typeSettings ?? {}), ...(ov?.typeSettings ?? {}) }
          : undefined,
    };
  });
  const structuralIndex = members.findIndex((m) => isStructuralType(m.typeId));

  // 1) 구조 멤버 우선 — 표시 베이스를 정의한다.
  const generated: (AnyRecord | null)[] = new Array(members.length).fill(null);
  let displayedBase = canonicalPassage;
  let layout: LayoutDescriptor;

  if (structuralIndex >= 0) {
    const sm = members[structuralIndex];
    const structuralQ = await generateOne(
      canonicalPassage,
      sm.typeId,
      sm.difficulty ?? baseDifficulty,
      sm.typeSettings,
      ctx,
    );
    generated[structuralIndex] = structuralQ;
    const built = buildStructuralLayout(preset.structuralMode, structuralQ, canonicalPassage);
    displayedBase = built.displayedBase;
    layout = built.layout;
  } else {
    layout = buildStructuralLayout("NONE", null, canonicalPassage).layout;
  }

  // 2) 비구조 멤버를 표시 베이스에 대해 병렬 생성.
  await Promise.all(
    members.map(async (m, i) => {
      if (i === structuralIndex) return;
      generated[i] = await generateOne(
        displayedBase,
        m.typeId,
        m.difficulty ?? baseDifficulty,
        m.typeSettings,
        ctx,
      );
    }),
  );

  // 3) 멤버별: 앵커 추출 → 표시 베이스에 해소 → 저장 준비.
  const memberSpanSets: MemberSpanSet[] = [];
  const prepared: PreparedSetMember[] = [];
  let degradedCount = 0;

  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const data = generated[i];
    if (!data) {
      degradedCount += 1;
      continue;
    }
    const structural = i === structuralIndex;
    const member = prepareSetMember(m.typeId, data, structural);

    const anchors = structural ? [] : extractAnchors(m.typeId, data);
    const { spans, degraded } = structural
      ? {
          spans: [
            { start: 0, end: displayedBase.length, kind: "BLOCK" } as ResolvedSpan,
          ],
          degraded: [] as Anchor[],
        }
      : resolveSpans(displayedBase, anchors);
    degradedCount += degraded.length;

    memberSpanSets.push({ index: i, typeId: m.typeId, isStructural: structural, spans });
    prepared.push({
      typeId: m.typeId,
      difficulty: m.difficulty ?? baseDifficulty,
      isStructural: structural,
      data,
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

  // 4) 결정론적 누설 스캔(검증된 정밀부품 재사용).
  const leakage = scanSetForLeakage(memberSpanSets, displayedBase);
  const status: "OK" | "DEGRADED" =
    leakage.status === "CONFLICT" || degradedCount > 0 ? "DEGRADED" : "OK";

  return {
    preset,
    canonicalPassage,
    displayedBase,
    layout,
    members: prepared,
    leakage,
    degradedCount,
    status,
  };
}

/** 멤버 데이터에서 표준 저장 경로와 동일한 해설 nested-create 입력을 만든다. */
function buildExplanationCreate(
  data: AnyRecord,
): Prisma.QuestionExplanationCreateWithoutQuestionInput | undefined {
  const explanation = data.explanation;
  if (typeof explanation !== "string" || !explanation.trim()) return undefined;
  const keyPoints = data.keyPoints;
  const wrongOptionExplanations = data.wrongOptionExplanations;
  return {
    content: explanation,
    keyPoints:
      keyPoints === undefined || keyPoints === null
        ? null
        : typeof keyPoints === "string"
          ? keyPoints
          : JSON.stringify(keyPoints),
    wrongOptionExplanations:
      wrongOptionExplanations === undefined || wrongOptionExplanations === null
        ? null
        : typeof wrongOptionExplanations === "string"
          ? wrongOptionExplanations
          : JSON.stringify(wrongOptionExplanations),
    aiGenerated: true,
  };
}

/**
 * 세트 + 멤버 Question + QuestionSetItem 을 한 트랜잭션에 저장. 표준 저장 경로와
 * 동일하게 (1) 해설행을 nested create, (2) 트랜잭션 타임아웃을 명시(기본 5초 롤백
 * 버그 회피). 비구조 멤버의 baked 지문은 prepareSetMember 가 이미 strip 했다.
 */
async function persistQuestionSet(opts: {
  academyId: string;
  passageId: string;
  jobId?: string;
  built: BuildSetResult;
}): Promise<{ setId: string; questionIds: string[] }> {
  const { academyId, passageId, jobId, built } = opts;
  const questionIds: string[] = [];

  const set = await prisma.$transaction(
    async (tx) => {
      const createdSet = await tx.questionSet.create({
        data: {
          jobId: jobId ?? null,
          academyId,
          structuralMode: built.preset.structuralMode,
          canonicalPassage: built.canonicalPassage,
          displayedPassageLayout: JSON.stringify(built.layout),
          layoutFingerprint: built.layout.fingerprintHash,
          itemCount: built.members.length,
          setLabel: built.preset.label,
          status: built.status,
        },
      });

      for (let order = 0; order < built.members.length; order++) {
        const m = built.members[order];
        const explanationCreate = buildExplanationCreate(m.data);
        const question = await tx.question.create({
          data: {
            academyId,
            passageId,
            type: Array.isArray(m.options) ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
            subType: m.typeId,
            questionText: m.questionText,
            structuredData: m.structuredData as unknown as Prisma.InputJsonValue,
            options: Array.isArray(m.options) ? JSON.stringify(m.options) : null,
            correctAnswer: m.correctAnswer,
            points: 1,
            difficulty: m.difficulty,
            aiGenerated: true,
            approved: false,
            // inSet=true: 일반 목록에서는 숨기고, 전용 '지문 세트' 섹션에서만 묶어 보여준다.
            inSet: true,
            setId: createdSet.id,
            ...(explanationCreate ? { explanation: { create: explanationCreate } } : {}),
          },
        });
        questionIds.push(question.id);
        await tx.questionSetItem.create({
          data: {
            setId: createdSet.id,
            questionId: question.id,
            orderInSet: order,
            isStructural: m.isStructural,
            spans: m.spans as unknown as Prisma.InputJsonValue,
          },
        });
      }

      return createdSet;
    },
    { maxWait: 10_000, timeout: QUESTION_PERSISTENCE_TRANSACTION_TIMEOUT_MS },
  );

  return { setId: set.id, questionIds };
}

/**
 * 프리셋 기반 지문 세트 생성 오케스트레이터. 합성 에러(프리셋 불명/지문 미달)에는
 * throw(호출자가 한국어 메시지 노출), 앵커 모호/누설 잔존은 DEGRADED 상태로 저장
 * (조용히 출하하지 않고 수동 검수 대상).
 */
export async function generateQuestionSet(
  params: GenerateSetParams,
): Promise<GenerateSetResult> {
  const preset = resolvePreset(params.presetId);
  if (!preset) {
    throw new Error("알 수 없는 세트 프리셋입니다.");
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

  // 최소 분량 게이트(버그② 수정): 세트 경로에 길이 사전검증이 없던 결함을 메운다.
  const feasibility = passageMeetsPreset(passage.content, preset);
  if (!feasibility.ok) {
    throw new Error(feasibility.reason ?? "지문 분량이 이 세트에 부족합니다.");
  }

  const ctx: GenContext = {
    schoolType: passage.school?.type === "MIDDLE" ? "중학교" : "고등학교",
    gradeInfo: passage.grade ? `${passage.grade}학년` : "",
    teacherIntentBlock: buildQuestionAnnotationBlock(extractTeacherAnnotations(passage)),
    analysisContext: buildAnalysisContext(passage),
    generationPlan: params.generationPlan,
    customPrompt: params.customPrompt,
  };

  const built = await buildQuestionSet({
    preset,
    passageContent: passage.content,
    ctx,
    baseDifficulty: params.difficulty ?? "INTERMEDIATE",
    memberOverrides: params.memberOverrides,
  });

  if (built.members.length === 0) {
    throw new Error("세트 문항을 한 개도 생성하지 못했습니다.");
  }

  const { setId, questionIds } = await persistQuestionSet({
    academyId: params.academyId,
    passageId: params.passageId,
    jobId: params.jobId,
    built,
  });

  return {
    setId,
    status: built.status,
    conflicts: built.leakage.conflicts,
    degradedCount: built.degradedCount,
    questionIds,
  };
}
