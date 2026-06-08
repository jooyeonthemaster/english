import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { type CompiledCustomType, parseCompiledCustomType } from "./types";

// 커스텀 유형/버전 영속 — 신규 격리 테이블만 다룬다. (생성 문항 저장은 worker 가
// 공유 saveGeneratedQuestionsForJob 를 import 해서 처리.)

export interface CustomTypeListRow {
  id: string;
  name: string;
  status: string;
  nearestBuiltin: string | null;
  matchConfidence: string | null;
  usageCount: number;
  generatedCount: number;
  approvedCount: number;
  createdAt: Date;
}

export interface ActiveCustomType {
  type: {
    id: string;
    academyId: string;
    name: string;
    status: string;
    nearestBuiltin: string | null;
    matchConfidence: string | null;
  };
  spec: CompiledCustomType;
  source: unknown; // 이 버전의 토대가 된 원본 문항 분석(QuestionAnalysis)
}

export interface CreateCustomTypeArgs {
  academyId: string;
  createdById: string;
  name: string;
  spec: CompiledCustomType;
  source: unknown;
}

/**
 * 트랜잭션 클라이언트 위에서 유형 + 버전 v1 을 생성한다(저장 즉시 ACTIVE).
 * 호출부가 더 큰 트랜잭션(예: 분석 잡 완료와 원자 합성)에 끼워 넣을 수 있도록 client 를 받는다.
 */
export async function createCustomTypeWithClient(
  client: Prisma.TransactionClient,
  args: CreateCustomTypeArgs,
): Promise<{ id: string }> {
  const created = await client.customQuestionType.create({
    data: {
      academyId: args.academyId,
      createdById: args.createdById,
      name: args.name.trim() || "커스텀 유형",
      status: "ACTIVE",
      nearestBuiltin: args.spec.nearestBuiltin ?? null,
      matchConfidence: args.spec.matchConfidence,
    },
    select: { id: true },
  });
  const version = await client.customQuestionTypeVersion.create({
    data: {
      typeId: created.id,
      version: 1,
      spec: args.spec as unknown as Prisma.InputJsonValue,
      examples: Prisma.JsonNull,
      source: (args.source ?? {}) as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  await client.customQuestionType.update({
    where: { id: created.id },
    data: { activeVersionId: version.id },
  });
  return { id: created.id };
}

/** 컴파일된 정의 + 원본 분석을 새 커스텀 유형(+버전 v1)으로 저장. 저장 즉시 ACTIVE. */
export async function createCustomType(args: CreateCustomTypeArgs): Promise<{ id: string }> {
  return prisma.$transaction((tx) => createCustomTypeWithClient(tx, args));
}

/** 학원의 커스텀 유형 목록(아카이브 제외). */
export async function listCustomTypes(academyId: string): Promise<CustomTypeListRow[]> {
  return prisma.customQuestionType.findMany({
    where: { academyId, deletedAt: null, status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      status: true,
      nearestBuiltin: true,
      matchConfidence: true,
      usageCount: true,
      generatedCount: true,
      approvedCount: true,
      createdAt: true,
    },
  });
}

/** 활성 버전의 정의(spec)를 로드. 없거나 학원 불일치/삭제면 null. */
export async function getActiveCustomTypeSpec(
  academyId: string,
  typeId: string,
): Promise<ActiveCustomType | null> {
  const type = await prisma.customQuestionType.findFirst({
    where: { id: typeId, academyId, deletedAt: null },
    select: {
      id: true,
      academyId: true,
      name: true,
      status: true,
      activeVersionId: true,
      nearestBuiltin: true,
      matchConfidence: true,
    },
  });
  if (!type?.activeVersionId) return null;

  const version = await prisma.customQuestionTypeVersion.findUnique({
    where: { id: type.activeVersionId },
    select: { spec: true, source: true },
  });
  if (!version) return null;

  return {
    type: {
      id: type.id,
      academyId: type.academyId,
      name: type.name,
      status: type.status,
      nearestBuiltin: type.nearestBuiltin,
      matchConfidence: type.matchConfidence,
    },
    spec: parseCompiledCustomType(version.spec),
    source: version.source,
  };
}

/** 유형 이름 변경. 성공 시 true. */
export async function renameCustomType(
  academyId: string,
  typeId: string,
  name: string,
): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const res = await prisma.customQuestionType.updateMany({
    where: { id: typeId, academyId, deletedAt: null },
    data: { name: trimmed },
  });
  return res.count === 1;
}

/** 유형 소프트 삭제(아카이브). */
export async function archiveCustomType(academyId: string, typeId: string): Promise<boolean> {
  const res = await prisma.customQuestionType.updateMany({
    where: { id: typeId, academyId, deletedAt: null },
    data: { deletedAt: new Date(), status: "ARCHIVED" },
  });
  return res.count === 1;
}

/** 생성 잡 종료 후 유형 카운터 갱신(텔레메트리). */
export async function bumpCustomTypeCounters(
  typeId: string,
  data: { usage?: number; generated?: number },
): Promise<void> {
  await prisma.customQuestionType
    .update({
      where: { id: typeId },
      data: {
        ...(data.usage ? { usageCount: { increment: data.usage } } : {}),
        ...(data.generated ? { generatedCount: { increment: data.generated } } : {}),
      },
    })
    .catch(() => undefined);
}

export interface AnalysisJobListRow {
  id: string;
  status: string;
  suggestedName: string | null;
  createdTypeId: string | null;
  errorMessage: string | null;
  gradeInfo: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

/** '유형 만들기' 분석 잡 등록(PENDING). 워커가 분석→컴파일→유형 자동생성. */
export async function createAnalysisJob(args: {
  academyId: string;
  createdById: string;
  referenceImage: string; // base64
  referenceMediaType: string;
  gradeInfo?: string | null;
  manualCrop?: boolean;
}): Promise<{ id: string }> {
  const job = await prisma.customTypeAnalysisJob.create({
    data: {
      academyId: args.academyId,
      createdById: args.createdById,
      status: "PENDING",
      referenceImage: args.referenceImage,
      referenceMediaType: args.referenceMediaType,
      gradeInfo: args.gradeInfo ?? null,
      manualCrop: args.manualCrop ?? true,
    },
    select: { id: true },
  });
  return { id: job.id };
}

/** 학원의 분석 잡 목록(폴링용). */
export async function listAnalysisJobs(
  academyId: string,
  limit: number,
): Promise<AnalysisJobListRow[]> {
  return prisma.customTypeAnalysisJob.findMany({
    where: { academyId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      suggestedName: true,
      createdTypeId: true,
      errorMessage: true,
      gradeInfo: true,
      createdAt: true,
      completedAt: true,
    },
  });
}

export interface CustomTypeVersionRow {
  id: string;
  version: number;
  note: string | null;
  createdAt: Date;
  isActive: boolean;
}

/**
 * 자연어 편집 결과를 새 버전으로 저장하고 활성화(원자). 현재 활성 버전의 source 를 이어받는다.
 * 버전은 단조 증가(max+1). 되돌리기는 이전 버전을 다시 활성화하면 됨(추후).
 */
export async function reviseCustomTypeVersion(args: {
  academyId: string;
  typeId: string;
  spec: CompiledCustomType;
  instruction: string;
}): Promise<{ versionId: string; version: number }> {
  // 동시 편집으로 version(@@unique[typeId,version])이 충돌하면 max+1 재계산 후 재시도(P2002).
  // LLM 호출은 라우트(트랜잭션 밖)라 재실행되지 않는다.
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const type = await tx.customQuestionType.findFirst({
          where: { id: args.typeId, academyId: args.academyId, deletedAt: null },
          select: { id: true, activeVersionId: true },
        });
        if (!type) throw new Error("유형을 찾을 수 없습니다.");

        const last = await tx.customQuestionTypeVersion.findFirst({
          where: { typeId: args.typeId },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        const activeSource = type.activeVersionId
          ? await tx.customQuestionTypeVersion.findUnique({
              where: { id: type.activeVersionId },
              select: { source: true },
            })
          : null;

        const version = await tx.customQuestionTypeVersion.create({
          data: {
            typeId: args.typeId,
            version: (last?.version ?? 0) + 1,
            spec: args.spec as unknown as Prisma.InputJsonValue,
            examples: Prisma.JsonNull,
            source: (activeSource?.source ?? {}) as unknown as Prisma.InputJsonValue,
            note: args.instruction.slice(0, 2000),
          },
          select: { id: true, version: true },
        });
        await tx.customQuestionType.update({
          where: { id: args.typeId },
          data: { activeVersionId: version.id },
        });
        return { versionId: version.id, version: version.version };
      });
    } catch (err) {
      if (
        attempt < MAX_ATTEMPTS &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        continue;
      }
      throw err;
    }
  }
}

export interface DirectDefinitionEdit {
  answerShape?: "MULTIPLE_CHOICE" | "SHORT_ANSWER" | "OTHER";
  optionCount?: number;
  correctAnswerCount?: number;
  multipleAnswers?: boolean;
  passageBased?: boolean;
  difficulty?: "BASIC" | "INTERMEDIATE" | "KILLER";
}

const DIFFICULTY_KO: Record<string, string> = {
  BASIC: "기본",
  INTERMEDIATE: "중급",
  KILLER: "킬러",
};
const ANSWER_SHAPE_KO: Record<string, string> = {
  MULTIPLE_CHOICE: "객관식",
  SHORT_ANSWER: "단답",
  OTHER: "기타",
};

/**
 * 프롬프트 변경 없이 구조 필드(답형·보기 수·정답 수·복수정답·지문기반·난이도)만 직접 수정 → 새 버전.
 * 결정형(LLM 없음). 실제 변경이 없으면 null. MC 정답 수는 보기 수로 클램프(생성기 게이트와 일관).
 */
export async function editCustomTypeDefinition(
  academyId: string,
  typeId: string,
  edit: DirectDefinitionEdit,
): Promise<{ version: number } | null> {
  const active = await getActiveCustomTypeSpec(academyId, typeId);
  if (!active) throw new Error("유형을 찾을 수 없습니다.");
  const spec = active.spec;
  const next: Record<string, unknown> = { ...spec };
  const changes: string[] = [];

  if (edit.answerShape && edit.answerShape !== spec.answerShape) {
    next.answerShape = edit.answerShape;
    changes.push(
      `답형 ${ANSWER_SHAPE_KO[spec.answerShape] ?? spec.answerShape}→${ANSWER_SHAPE_KO[edit.answerShape] ?? edit.answerShape}`,
    );
  }
  if (edit.optionCount != null && edit.optionCount !== spec.optionCount) {
    next.optionCount = edit.optionCount;
    changes.push(`보기 ${spec.optionCount}→${edit.optionCount}개`);
  }
  if (edit.correctAnswerCount != null && edit.correctAnswerCount !== spec.correctAnswerCount) {
    next.correctAnswerCount = edit.correctAnswerCount;
    changes.push(`정답 ${spec.correctAnswerCount}→${edit.correctAnswerCount}개`);
  }
  if (edit.multipleAnswers != null && edit.multipleAnswers !== spec.multipleAnswers) {
    next.multipleAnswers = edit.multipleAnswers;
    changes.push(`복수정답 ${edit.multipleAnswers ? "ON" : "OFF"}`);
  }
  if (edit.passageBased != null && edit.passageBased !== spec.passageBased) {
    next.passageBased = edit.passageBased;
    changes.push(`지문기반 ${edit.passageBased ? "ON" : "OFF"}`);
  }
  if (edit.difficulty && edit.difficulty !== spec.difficulty) {
    next.difficulty = edit.difficulty;
    changes.push(
      `난이도 ${DIFFICULTY_KO[spec.difficulty] ?? spec.difficulty}→${DIFFICULTY_KO[edit.difficulty] ?? edit.difficulty}`,
    );
  }

  if (changes.length === 0) return null;

  // MC 정답 수는 보기 수를 넘을 수 없게 클램프(생성기 게이트와 일관).
  if (next.answerShape === "MULTIPLE_CHOICE" && (next.optionCount as number) > 0) {
    const clamped = Math.min(
      Math.max(next.correctAnswerCount as number, 1),
      next.optionCount as number,
    );
    if (clamped !== next.correctAnswerCount) {
      next.correctAnswerCount = clamped;
      // 클램프로 정답 수가 바뀌었는데 명시적 정답 편집이 없었다면 노트에 자동조정 반영.
      if (clamped !== spec.correctAnswerCount && !changes.some((c) => c.startsWith("정답 "))) {
        changes.push(`정답 ${spec.correctAnswerCount}→${clamped}개(자동조정)`);
      }
    }
  }

  const newSpec = parseCompiledCustomType(next);
  const { version } = await reviseCustomTypeVersion({
    academyId,
    typeId,
    spec: newSpec,
    instruction: `직접 편집: ${changes.join(", ")}`,
  });
  return { version };
}

/** 유형의 버전 이력(최신순). 활성 버전 표시 포함. */
export async function listCustomTypeVersions(
  academyId: string,
  typeId: string,
): Promise<CustomTypeVersionRow[]> {
  const type = await prisma.customQuestionType.findFirst({
    where: { id: typeId, academyId, deletedAt: null },
    select: { activeVersionId: true },
  });
  if (!type) return [];
  const versions = await prisma.customQuestionTypeVersion.findMany({
    where: { typeId },
    orderBy: { version: "desc" },
    select: { id: true, version: true, note: true, createdAt: true },
  });
  return versions.map((v) => ({
    id: v.id,
    version: v.version,
    note: v.note,
    createdAt: v.createdAt,
    isActive: v.id === type.activeVersionId,
  }));
}
