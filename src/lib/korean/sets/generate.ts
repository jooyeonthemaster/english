// ============================================================================
// 국어 지문 세트 — 생성 오케스트레이터 (프리셋 기반, 서버 전용)
// ============================================================================
// 흐름: 프리셋 해석(갈래→슬롯, 패밀리 독점) → 분량 게이트 → 멤버 "순차" 생성
// (각 멤버는 기존 단일문항 KO 엔진 runQuestionGenerationWithEmptyRetry = OpenRouter
// 경로를 멤버당 1회 재사용, 이전 멤버들의 마커·근거를 '예약 금지 목록'으로 프롬프트
// 주입) → 결정론 KO 누수스캔 → blocking 이면 해당 멤버만 재생성(멤버당 최대 2회)
// → 소진 시 그 멤버를 버려 세트 DEGRADED(멤버 수 축소)로 우아하게 강등 → 저장.
//
// 저장 모델: QuestionSet/QuestionSetItem 재사용(inSet=true, canonicalPassage=국어
// 지문 원문). 멤버는 표준 KO 문항(자기 structuredData 에 자기 markers 보유) —
// 영어 세트의 앵커-strip(persistence.prepareSetMember)은 쓰지 않는다(KO 봉투에는
// 지문 사본 필드가 애초에 없다).
//
// 생성(buildKoQuestionSet, DB 무저장)과 저장(persistKoQuestionSet)을 분리해
// 하네스에서 생성 품질만 따로 검증할 수 있게 한다(영어 세트 관행 미러).
// ============================================================================

import { createHash } from "crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { buildQuestionAnnotationBlock } from "@/lib/annotation-prompt";
import { QUESTION_PERSISTENCE_TRANSACTION_TIMEOUT_MS } from "@/lib/concurrency-config";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import { buildGeneratedQuestionText } from "@/lib/question-generation-persistence";
import {
  buildAnalysisContext,
  extractTeacherAnnotations,
} from "@/app/api/ai/generate-questions-auto/_lib/build-analysis-context";
import { DIFF_DESCRIPTION } from "@/app/api/ai/generate-questions-auto/_lib/constants";
import { runQuestionGenerationWithEmptyRetry } from "@/app/api/ai/generate-questions-auto/_lib/run-question-generation";

import {
  KO_VERSE_KINDS,
  isKoreanSubject,
  readKoKindFromTags,
  type KoPassageKind,
} from "../core/passage-meta";
import type { KoMarker } from "../core/markers";
import type { KoDifficulty } from "../registry/type-module";
import {
  readKoEnvelopeAnswerTexts,
  readKoEnvelopeExposedTexts,
  readKoEnvelopeMarkers,
  scanKoSetForLeakage,
  type KoSetLeakageConflict,
  type KoSetLeakageReport,
  type KoSetScanMember,
} from "./leakage";
import {
  KO_SET_MEMBER_REGEN_MAX,
  passageMeetsKoSetPreset,
  resolveKoSetPreset,
  resolveKoSetSlots,
  type KoResolvedSetMember,
  type KoSetPreset,
} from "./presets";
import {
  appendKoSetPrompt,
  buildKoSetMemberPromptBlock,
  buildKoSetRetryPromptBlock,
  type KoReservedMemberInfo,
} from "./prompts";

type AnyRecord = Record<string, unknown>;

export interface KoSetMemberOverride {
  difficulty?: KoDifficulty;
  generationPlan?: QuestionGenerationPlan;
  typeSettings?: Record<string, unknown>;
}

export interface GenerateKoSetParams {
  academyId: string;
  staffId: string;
  jobId?: string;
  passageId: string;
  presetId: string;
  generationPlan: QuestionGenerationPlan;
  customPrompt?: string;
  difficulty?: KoDifficulty;
  /** 프리셋 슬롯 순서와 평행한 멤버별 오버라이드. */
  memberOverrides?: KoSetMemberOverride[];
}

export interface GenerateKoSetResult {
  setId: string;
  status: "OK" | "DEGRADED";
  conflicts: KoSetLeakageConflict[];
  degradedCount: number;
  /** 실제 엔진 호출 횟수(초기 멤버 수 + 재생성) — 크레딧 미사용분 환불 근거. */
  generationCallCount: number;
  questionIds: string[];
}

interface KoGenContext {
  schoolType: string;
  gradeInfo: string;
  teacherIntentBlock: string;
  analysisContext: string;
  generationPlan: QuestionGenerationPlan;
  customPrompt?: string;
}

/** 생성·검증까지 끝난 멤버(저장 직전 형태). */
export interface KoPreparedSetMember {
  typeId: string;
  label: string;
  difficulty: KoDifficulty;
  points: number;
  data: AnyRecord;
  questionText: string;
  structuredData: AnyRecord;
  markers: KoMarker[];
  correctAnswer: string;
  options: unknown;
}

export interface BuildKoSetResult {
  preset: KoSetPreset;
  passageKind: KoPassageKind | null;
  canonicalPassage: string;
  resolvedMembers: KoResolvedSetMember[];
  members: KoPreparedSetMember[];
  leakage: KoSetLeakageReport;
  degradedCount: number;
  status: "OK" | "DEGRADED";
  generationCallCount: number;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function compactAnswerSummary(data: AnyRecord): string {
  const answers = readKoEnvelopeAnswerTexts(data);
  return answers.join(" / ").replace(/\s+/g, " ").trim().slice(0, 120);
}

function readEvidenceSpans(data: AnyRecord): string[] {
  if (!Array.isArray(data.evidence)) return [];
  const out: string[] = [];
  for (const raw of data.evidence) {
    if (raw && typeof raw === "object" && typeof (raw as AnyRecord).spanText === "string") {
      out.push(String((raw as AnyRecord).spanText));
    }
  }
  return out;
}

function toReservedInfo(
  index: number,
  member: KoResolvedSetMember,
  data: AnyRecord,
): KoReservedMemberInfo {
  return {
    index,
    typeId: member.typeId,
    label: member.label,
    markers: readKoEnvelopeMarkers(data),
    evidenceSpans: readEvidenceSpans(data),
    answerSummary: compactAnswerSummary(data),
  };
}

/** 한 멤버를 기존 단일문항 KO 엔진으로 생성 — 멤버당 1회 재사용(OpenRouter 경로). */
async function generateOneKoMember(args: {
  passageContent: string;
  passageKind: KoPassageKind | null;
  member: KoResolvedSetMember;
  difficulty: KoDifficulty;
  generationPlan: QuestionGenerationPlan;
  typeSettings: Record<string, unknown> | undefined;
  examMode: KoSetPreset["examMode"];
  ctx: KoGenContext;
  memberPromptBlock: string;
}): Promise<AnyRecord | null> {
  const {
    passageContent,
    passageKind,
    member,
    difficulty,
    generationPlan,
    typeSettings,
    examMode,
    ctx,
    memberPromptBlock,
  } = args;
  const diffLabel = difficulty || "INTERMEDIATE";
  const result = await runQuestionGenerationWithEmptyRetry(
    {
      plan: [
        { subType: member.typeId, count: 1, reason: "국어 지문 세트 member", targetPoints: [] },
      ],
      schoolType: ctx.schoolType,
      gradeInfo: ctx.gradeInfo,
      passageContent,
      teacherIntentBlock: ctx.teacherIntentBlock,
      analysisContext: ctx.analysisContext,
      diffLabel,
      diffInstruction: DIFF_DESCRIPTION[diffLabel] || DIFF_DESCRIPTION.INTERMEDIATE,
      generationPlan,
      customPrompt: appendKoSetPrompt(ctx.customPrompt, memberPromptBlock),
      typeSettings: {
        [member.typeId]: { ...(typeSettings ?? {}), examMode },
      } as Record<string, unknown>,
      koPassageKind: passageKind ?? undefined,
    },
    { logPrefix: "KO-SET-GEN" },
  );
  return (result.questions[0] as AnyRecord | undefined) ?? null;
}

function buildScanMembers(
  resolved: KoResolvedSetMember[],
  generated: (AnyRecord | null)[],
): KoSetScanMember[] {
  const out: KoSetScanMember[] = [];
  for (let i = 0; i < resolved.length; i += 1) {
    const data = generated[i];
    if (!data) continue;
    out.push({
      index: i,
      typeId: resolved[i].typeId,
      markers: readKoEnvelopeMarkers(data),
      answerTexts: readKoEnvelopeAnswerTexts(data),
      exposedTexts: readKoEnvelopeExposedTexts(data),
      allowedFamilies: resolved[i].allowedFamilies,
    });
  }
  return out;
}

/**
 * 생성 + 격리만 수행하고 DB 에는 쓰지 않는다(하네스 검증용). 저장은
 * persistKoQuestionSet 이 담당.
 */
export async function buildKoQuestionSet(opts: {
  preset: KoSetPreset;
  passageContent: string;
  passageKind: KoPassageKind | null;
  ctx: KoGenContext;
  baseDifficulty: KoDifficulty;
  memberOverrides?: KoSetMemberOverride[];
}): Promise<BuildKoSetResult> {
  const { preset, passageContent, passageKind, ctx, baseDifficulty, memberOverrides } = opts;

  const resolution = resolveKoSetSlots(preset, passageKind);
  if (!resolution.ok) {
    throw new Error(resolution.reason);
  }
  const resolved = resolution.members;
  const verse = passageKind ? KO_VERSE_KINDS.has(passageKind) : false;

  const generated: (AnyRecord | null)[] = new Array(resolved.length).fill(null);
  const reserved: KoReservedMemberInfo[] = [];
  let generationCallCount = 0;
  let degradedCount = 0;

  const memberDifficulty = (i: number): KoDifficulty =>
    memberOverrides?.[i]?.difficulty ?? resolved[i].difficulty ?? baseDifficulty;
  const memberPlan = (i: number): QuestionGenerationPlan =>
    memberOverrides?.[i]?.generationPlan ?? ctx.generationPlan;

  const generateMember = async (
    i: number,
    retryConflicts?: KoSetLeakageConflict[],
  ): Promise<AnyRecord | null> => {
    const blocks = [
      buildKoSetMemberPromptBlock({
        presetLabel: preset.label,
        slotIndex: i,
        slotCount: resolved.length,
        allowedFamilies: resolved[i].allowedFamilies,
        forbiddenFamilies: resolved[i].forbiddenFamilies,
        reserved: reserved.filter((r) => r.index !== i),
      }),
    ];
    if (retryConflicts && retryConflicts.length > 0) {
      blocks.push(buildKoSetRetryPromptBlock({ conflicts: retryConflicts }));
    }
    generationCallCount += 1;
    return generateOneKoMember({
      passageContent,
      passageKind,
      member: resolved[i],
      difficulty: memberDifficulty(i),
      generationPlan: memberPlan(i),
      typeSettings: memberOverrides?.[i]?.typeSettings,
      examMode: preset.examMode,
      ctx,
      memberPromptBlock: blocks.join("\n\n"),
    });
  };

  // 1) 순차 초기 생성 — 이전 멤버 예약을 다음 멤버 프롬프트에 주입.
  for (let i = 0; i < resolved.length; i += 1) {
    const data = await generateMember(i);
    generated[i] = data;
    if (data) {
      reserved.push(toReservedInfo(i, resolved[i], data));
    } else {
      degradedCount += 1;
    }
  }

  // 2) 누수스캔 → blocking 이면 해당 멤버만 재생성(멤버당 최대 2회) → 소진 시 강등.
  const regenCounts = new Array(resolved.length).fill(0);
  let leakage = scanKoSetForLeakage(
    buildScanMembers(resolved, generated),
    passageContent,
    { verse },
  );
  let guard = 0;
  while (guard < resolved.length * (KO_SET_MEMBER_REGEN_MAX + 1) + 2) {
    guard += 1;
    const blocking = leakage.conflicts.filter((c) => c.severity === "ERROR");
    if (blocking.length === 0) break;
    const target = blocking[0].regenerateIndex;
    const targetConflicts = blocking.filter((c) => c.regenerateIndex === target);

    if (regenCounts[target] < KO_SET_MEMBER_REGEN_MAX && generated[target]) {
      regenCounts[target] += 1;
      // 예약 목록에서 자기 항목 제거 후 재생성.
      const selfIdx = reserved.findIndex((r) => r.index === target);
      if (selfIdx >= 0) reserved.splice(selfIdx, 1);
      const data = await generateMember(target, targetConflicts);
      generated[target] = data;
      if (data) {
        reserved.push(toReservedInfo(target, resolved[target], data));
      } else {
        degradedCount += 1;
      }
    } else {
      // 재생성 소진 → 해당 멤버를 버려 멤버 수 축소(우아한 강등).
      if (generated[target]) degradedCount += 1;
      generated[target] = null;
      const selfIdx = reserved.findIndex((r) => r.index === target);
      if (selfIdx >= 0) reserved.splice(selfIdx, 1);
    }

    leakage = scanKoSetForLeakage(
      buildScanMembers(resolved, generated),
      passageContent,
      { verse },
    );
  }

  // 3) 저장 준비 — KO 봉투는 지문 사본 필드가 없어 strip 불필요(표준 직렬화 재사용).
  const members: KoPreparedSetMember[] = [];
  for (let i = 0; i < resolved.length; i += 1) {
    const data = generated[i];
    if (!data) continue;
    members.push({
      typeId: resolved[i].typeId,
      label: resolved[i].label,
      difficulty: memberDifficulty(i),
      points: resolved[i].points,
      data,
      questionText: buildGeneratedQuestionText(data),
      structuredData: data,
      markers: readKoEnvelopeMarkers(data),
      correctAnswer:
        typeof data.correctAnswer === "string" ? data.correctAnswer : "",
      options: Array.isArray(data.options) ? data.options : undefined,
    });
  }

  const status: "OK" | "DEGRADED" =
    degradedCount > 0 ||
    members.length < resolved.length ||
    leakage.status === "CONFLICT"
      ? "DEGRADED"
      : "OK";

  return {
    preset,
    passageKind,
    canonicalPassage: passageContent,
    resolvedMembers: resolved,
    members,
    leakage,
    degradedCount,
    status,
    generationCallCount,
  };
}

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
 * 세트 + 멤버 Question + QuestionSetItem 을 한 트랜잭션에 저장(영어 세트 미러 —
 * 해설 nested create + 트랜잭션 타임아웃 명시). QuestionSetItem.spans 에는 KO
 * 마커 배열을 그대로 싣는다(시험지 공유지문 병합의 1차 소스는 멤버 structuredData).
 */
export async function persistKoQuestionSet(opts: {
  academyId: string;
  passageId: string;
  jobId?: string;
  built: BuildKoSetResult;
}): Promise<{ setId: string; questionIds: string[] }> {
  const { academyId, passageId, jobId, built } = opts;
  const questionIds: string[] = [];

  const layoutNoHash = {
    type: "NONE" as const,
    fullPassage: built.canonicalPassage,
  };
  const layout = {
    ...layoutNoHash,
    fingerprintHash: sha256(JSON.stringify(layoutNoHash)),
  };

  const set = await prisma.$transaction(
    async (tx) => {
      const createdSet = await tx.questionSet.create({
        data: {
          jobId: jobId ?? null,
          academyId,
          structuralMode: "NONE",
          canonicalPassage: built.canonicalPassage,
          displayedPassageLayout: JSON.stringify(layout),
          layoutFingerprint: layout.fingerprintHash,
          itemCount: built.members.length,
          setLabel: built.preset.label,
          basePassageId: passageId,
          status: built.status,
        },
      });

      for (let order = 0; order < built.members.length; order += 1) {
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
            points: m.points,
            difficulty: m.difficulty,
            aiGenerated: true,
            approved: false,
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
            isStructural: false,
            spans: m.markers as unknown as Prisma.InputJsonValue,
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
 * 프리셋 기반 국어 지문 세트 생성 오케스트레이터. 합성 에러(프리셋 불명/갈래
 * 비호환/분량 미달/비국어 지문)에는 throw(호출자가 한국어 메시지 노출), 누수
 * 잔존은 DEGRADED 로 저장(조용히 출하하지 않고 수동 검수 대상).
 */
export async function generateKoQuestionSet(
  params: GenerateKoSetParams,
): Promise<GenerateKoSetResult> {
  const preset = resolveKoSetPreset(params.presetId);
  if (!preset) {
    throw new Error("알 수 없는 국어 세트 프리셋입니다.");
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
  if (!isKoreanSubject((passage as { subject?: unknown }).subject)) {
    throw new Error("국어 지문이 아닙니다 — 국어 세트는 국어 지문에서만 생성할 수 있습니다.");
  }

  const feasibility = passageMeetsKoSetPreset(passage.content, preset);
  if (!feasibility.ok) {
    throw new Error(feasibility.reason ?? "지문 분량이 이 세트에 부족합니다.");
  }

  const passageKind = readKoKindFromTags((passage as { tags?: unknown }).tags);

  const ctx: KoGenContext = {
    schoolType: passage.school?.type === "MIDDLE" ? "중학교" : "고등학교",
    gradeInfo: passage.grade ? `${passage.grade}학년` : "",
    teacherIntentBlock: buildQuestionAnnotationBlock(extractTeacherAnnotations(passage)),
    analysisContext: buildAnalysisContext(passage),
    generationPlan: params.generationPlan,
    customPrompt: params.customPrompt,
  };

  const built = await buildKoQuestionSet({
    preset,
    passageContent: passage.content,
    passageKind,
    ctx,
    baseDifficulty: params.difficulty ?? "INTERMEDIATE",
    memberOverrides: params.memberOverrides,
  });

  if (built.members.length === 0) {
    throw new Error("세트 문항을 한 개도 생성하지 못했습니다.");
  }

  const { setId, questionIds } = await persistKoQuestionSet({
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
    generationCallCount: built.generationCallCount,
    questionIds,
  };
}
