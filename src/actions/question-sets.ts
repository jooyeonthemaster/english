"use server";

import type { Prisma } from "@prisma/client";

import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { QUESTION_PERSISTENCE_TRANSACTION_TIMEOUT_MS } from "@/lib/concurrency-config";
import { resolvePreset } from "@/lib/question-sets/presets";
import type { Anchor, LayoutDescriptor } from "@/lib/question-sets/types";

type SetWithItems = Prisma.QuestionSetGetPayload<{
  include: {
    items: {
      include: {
        question: {
          include: {
            explanation: true;
            passage: { select: { id: true; title: true } };
          };
        };
      };
    };
  };
}>;

export interface QuestionSetMember {
  itemId: string;
  questionId: string;
  orderInSet: number;
  isStructural: boolean;
  typeId: string | null;
  difficulty: string;
  questionText: string;
  options: unknown;
  correctAnswer: string;
  structuredData: unknown;
  spans: Anchor[];
  approved: boolean;
  explanation: { id: string; content: string; keyPoints: string | null; wrongOptionExplanations: string | null } | null;
}

export interface QuestionSetForRender {
  id: string;
  status: string;
  structuralMode: string;
  setLabel: string | null;
  canonicalPassage: string;
  layout: LayoutDescriptor | null;
  createdAt: Date;
  /** 표시용 지문 제목(첫 멤버의 지문). 지문 없는 세트면 null. */
  passageTitle: string | null;
  members: QuestionSetMember[];
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/** Load a 장문 세트 with its ordered members for rendering. Academy-scoped. */
export async function getQuestionSet(
  setId: string,
): Promise<QuestionSetForRender | null> {
  const staff = await getStaffSession();
  if (!staff) return null;

  const set = await prisma.questionSet.findFirst({
    where: { id: setId, academyId: staff.academyId },
    include: {
      items: {
        orderBy: { orderInSet: "asc" },
        include: {
          question: {
            include: {
              explanation: true,
              passage: { select: { id: true, title: true } },
            },
          },
        },
      },
    },
  });
  if (!set) return null;
  return mapSet(set);
}

function mapSet(set: SetWithItems): QuestionSetForRender {
  return {
    id: set.id,
    status: set.status,
    structuralMode: set.structuralMode,
    setLabel: set.setLabel,
    canonicalPassage: set.canonicalPassage,
    layout: parseJson<LayoutDescriptor>(set.displayedPassageLayout),
    createdAt: set.createdAt,
    passageTitle: set.items[0]?.question.passage?.title ?? null,
    members: set.items.map((item) => {
      const q = item.question;
      return {
        itemId: item.id,
        questionId: q.id,
        orderInSet: item.orderInSet,
        isStructural: item.isStructural,
        typeId: q.subType,
        difficulty: q.difficulty,
        questionText: q.questionText,
        options: parseJson<unknown>(q.options),
        correctAnswer: q.correctAnswer,
        structuredData: q.structuredData,
        spans: (item.spans as unknown as Anchor[]) ?? [],
        approved: q.approved,
        explanation: q.explanation
          ? {
              id: q.explanation.id,
              content: q.explanation.content,
              keyPoints: q.explanation.keyPoints,
              wrongOptionExplanations: q.explanation.wrongOptionExplanations,
            }
          : null,
      };
    }),
  };
}

/**
 * 표시용 세트 목록 — 생성결과/문제관리에서 setId로 묶어 보여줄 때 사용.
 * passageId/jobId 로 필터. 멤버 포함. Academy-scoped.
 */
export async function listQuestionSets(opts: {
  passageId?: string;
  jobId?: string;
  limit?: number;
}): Promise<QuestionSetForRender[]> {
  const staff = await getStaffSession();
  if (!staff) return [];

  const sets = await prisma.questionSet.findMany({
    where: {
      academyId: staff.academyId,
      ...(opts.jobId ? { jobId: opts.jobId } : {}),
      ...(opts.passageId
        ? { items: { some: { question: { passageId: opts.passageId } } } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 50,
    include: {
      items: {
        orderBy: { orderInSet: "asc" },
        include: {
          question: {
            include: {
              explanation: true,
              passage: { select: { id: true, title: true } },
            },
          },
        },
      },
    },
  });
  return sets.map(mapSet);
}

/**
 * 일반 fast 플로우로 이미 생성·저장된 문항들(inSet=false 일반 문항)을 하나의 세트로
 * 묶는다. inSet 은 false 그대로 둬서 일반 문항 카드로 보이고, setId/QuestionSetItem
 * 으로만 묶음 관계를 표시한다(시험지 묶음·세트 헤더 표시용). 입력 questionIds 순서를
 * orderInSet 으로 보존(= 프리셋 멤버 출제 순서).
 */
export async function groupQuestionsIntoSet(opts: {
  presetId: string;
  passageId: string;
  questionIds: string[];
  jobId?: string;
}): Promise<{ success: boolean; setId?: string; error?: string }> {
  const staff = await getStaffSession();
  if (!staff) return { success: false, error: "Authentication required" };
  const preset = resolvePreset(opts.presetId);
  if (!preset) return { success: false, error: "알 수 없는 프리셋입니다." };

  // 내 학원·이 지문 소속 문항만 (보안 + 정합)
  const owned = await prisma.question.findMany({
    where: { id: { in: opts.questionIds }, academyId: staff.academyId, passageId: opts.passageId },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((q) => q.id));
  const orderedIds = opts.questionIds.filter((id) => ownedIds.has(id));
  if (orderedIds.length === 0) return { success: false, error: "묶을 문항이 없습니다." };

  const passage = await prisma.passage.findFirst({
    where: { id: opts.passageId, academyId: staff.academyId },
    select: { content: true },
  });
  const canonical = passage?.content ?? "";

  const setId = await prisma.$transaction(
    async (tx) => {
      const set = await tx.questionSet.create({
        data: {
          jobId: opts.jobId ?? null,
          academyId: staff.academyId,
          structuralMode: preset.structuralMode,
          canonicalPassage: canonical,
          displayedPassageLayout: JSON.stringify({ type: "NONE", fullPassage: canonical }),
          layoutFingerprint: "",
          itemCount: orderedIds.length,
          setLabel: preset.label,
          status: "OK",
        },
      });
      for (let i = 0; i < orderedIds.length; i += 1) {
        // inSet 은 건드리지 않는다(false 유지) — 일반 문항 카드로 계속 노출.
        await tx.question.update({ where: { id: orderedIds[i] }, data: { setId: set.id } });
        await tx.questionSetItem.create({
          data: {
            setId: set.id,
            questionId: orderedIds[i],
            orderInSet: i,
            isStructural: false,
            spans: [] as unknown as Prisma.InputJsonValue,
          },
        });
      }
      return set.id;
    },
    { maxWait: 10_000, timeout: QUESTION_PERSISTENCE_TRANSACTION_TIMEOUT_MS },
  );
  return { success: true, setId };
}

/**
 * 세트에서 한 멤버를 분리해 독립 문항으로 만든다(setId 제거 → 묶음에서 빠짐). 세트가
 * 비면 세트 자체를 삭제, 아니면 itemCount 갱신.
 */
export async function splitQuestionSetMember(
  questionId: string,
): Promise<{ success: boolean; error?: string }> {
  const staff = await getStaffSession();
  if (!staff) return { success: false, error: "Authentication required" };

  const q = await prisma.question.findFirst({
    where: { id: questionId, academyId: staff.academyId, setId: { not: null } },
    select: { id: true, setId: true },
  });
  if (!q || !q.setId) return { success: false, error: "세트 멤버를 찾을 수 없습니다." };
  const setId = q.setId;

  await prisma.$transaction(async (tx) => {
    await tx.questionSetItem.deleteMany({ where: { questionId } });
    await tx.question.update({
      where: { id: questionId },
      data: { inSet: false, setId: null },
    });
    const remaining = await tx.questionSetItem.count({ where: { setId } });
    if (remaining === 0) {
      await tx.questionSet.delete({ where: { id: setId } });
    } else {
      await tx.questionSet.update({
        where: { id: setId },
        data: { itemCount: remaining },
      });
    }
  });
  return { success: true };
}

/** Approve every member question in a set. */
export async function approveQuestionSet(
  setId: string,
): Promise<{ success: boolean; approved: number; error?: string }> {
  const staff = await getStaffSession();
  if (!staff) return { success: false, approved: 0, error: "Authentication required" };

  const set = await prisma.questionSet.findFirst({
    where: { id: setId, academyId: staff.academyId },
    select: { id: true },
  });
  if (!set) return { success: false, approved: 0, error: "세트를 찾을 수 없습니다." };

  const result = await prisma.question.updateMany({
    where: { setId, academyId: staff.academyId },
    data: { approved: true },
  });
  return { success: true, approved: result.count };
}

/** Delete a set and its member questions (member questions are set-only). */
export async function deleteQuestionSet(
  setId: string,
): Promise<{ success: boolean; error?: string }> {
  const staff = await getStaffSession();
  if (!staff) return { success: false, error: "Authentication required" };

  const set = await prisma.questionSet.findFirst({
    where: { id: setId, academyId: staff.academyId },
    select: { id: true },
  });
  if (!set) return { success: false, error: "세트를 찾을 수 없습니다." };

  // Deleting the member questions cascades their QuestionSetItem rows; then the set.
  await prisma.question.deleteMany({ where: { setId, academyId: staff.academyId } });
  await prisma.questionSet.delete({ where: { id: setId } });
  return { success: true };
}
