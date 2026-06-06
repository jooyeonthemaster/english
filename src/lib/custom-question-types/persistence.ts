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
}

/** 컴파일된 정의 + 원본 분석을 새 커스텀 유형(+버전 v1)으로 저장. 저장 즉시 ACTIVE. */
export async function createCustomType(args: {
  academyId: string;
  createdById: string;
  name: string;
  spec: CompiledCustomType;
  source: unknown;
}): Promise<{ id: string }> {
  const type = await prisma.$transaction(async (tx) => {
    const created = await tx.customQuestionType.create({
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
    const version = await tx.customQuestionTypeVersion.create({
      data: {
        typeId: created.id,
        version: 1,
        spec: args.spec as unknown as Prisma.InputJsonValue,
        examples: Prisma.JsonNull,
        source: (args.source ?? {}) as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    await tx.customQuestionType.update({
      where: { id: created.id },
      data: { activeVersionId: version.id },
    });
    return created;
  });

  return { id: type.id };
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
    select: { spec: true },
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
