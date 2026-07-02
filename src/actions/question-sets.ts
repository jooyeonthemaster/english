"use server";

import type { Prisma } from "@prisma/client";

import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { QUESTION_PERSISTENCE_TRANSACTION_TIMEOUT_MS } from "@/lib/concurrency-config";
import { resolvePreset } from "@/lib/question-sets/presets";
import {
  buildQuestionSetSubjectScopeWhere,
  isMissingColumnError,
} from "@/actions/exams/_exam-subject-where";
import type { Anchor, LayoutDescriptor } from "@/lib/question-sets/types";

type SetWithItems = Prisma.QuestionSetGetPayload<{
  include: {
    basePassage: { select: { id: true; title: true } };
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
  /** 공유 지문 id(첫 멤버의 지문). 지문 없는 세트면 null. */
  passageId: string | null;
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
        // 휴지통 가드 — 삭제(휴지통)된 세트 멤버는 세트 렌더에서 제외.
        where: { question: { deletedAt: null } },
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
      basePassage: { select: { id: true, title: true } },
    },
  });
  if (!set) return null;
  return mapSet(set);
}

function mapSet(set: SetWithItems): QuestionSetForRender {
  const sharedPassage =
    set.basePassage ??
    set.items.find((item) => item.question.passage)?.question.passage ??
    null;

  return {
    id: set.id,
    status: set.status,
    structuralMode: set.structuralMode,
    setLabel: set.setLabel,
    canonicalPassage: set.canonicalPassage,
    layout: parseJson<LayoutDescriptor>(set.displayedPassageLayout),
    createdAt: set.createdAt,
    passageTitle: sharedPassage?.title ?? null,
    passageId: sharedPassage?.id ?? null,
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
 *
 * 과목 스코프(워크스페이스 상호 격리): subject="KOREAN" 이면 KO_* 멤버 세트만,
 * 미지정(기본=영어 표면)이면 KO_* 멤버 세트를 완전히 제외한다 — 영어
 * 워크스페이스에 국어 세트 0 / 국어 워크스페이스에 영어 세트 0.
 */
export async function listQuestionSets(opts: {
  passageId?: string;
  jobId?: string;
  limit?: number;
  subject?: "KOREAN";
}): Promise<QuestionSetForRender[]> {
  const staff = await getStaffSession();
  if (!staff) return [];

  // passageId 스코프가 OR 를 쓰므로, 과목 스코프의 OR(영어=null|≠KOREAN)와 최상위
  // OR 키가 충돌하지 않도록 둘을 AND 배열의 별개 원소로 합류시킨다.
  const passageScope = opts.passageId
    ? {
        OR: [
          { basePassageId: opts.passageId },
          { items: { some: { question: { passageId: opts.passageId } } } },
        ],
      }
    : null;

  const baseWhere: Record<string, unknown> = {
    academyId: staff.academyId,
    ...(opts.jobId ? { jobId: opts.jobId } : {}),
  };

  const include = {
    items: {
      // 휴지통 가드 — 삭제(휴지통)된 세트 멤버는 세트 렌더에서 제외.
      where: { question: { deletedAt: null } },
      orderBy: { orderInSet: "asc" as const },
      include: {
        question: {
          include: {
            explanation: true,
            passage: { select: { id: true, title: true } },
          },
        },
      },
    },
    basePassage: { select: { id: true, title: true } },
  } as const;
  const orderBy = { createdAt: "desc" as const };
  const take = opts.limit ?? 50;

  // 과목 스코프(워크스페이스 상호 격리) — 판별자 일급화(P0): question_sets.subject
  // 컬럼으로 판정. 미지정=영어(KO 세트 제외), "KOREAN"=국어 세트만. 백필이 "KO_ 멤버
  // 1개 이상" 세트에 'KOREAN' 을 스탬프(items.some KO_ 규약과 대칭).
  try {
    const sets = await prisma.questionSet.findMany({
      where: {
        ...baseWhere,
        AND: [
          buildQuestionSetSubjectScopeWhere(opts.subject),
          ...(passageScope ? [passageScope] : []),
        ],
      },
      orderBy,
      take,
      include,
    });
    return sets.map(mapSet);
  } catch (error) {
    // 우아한 강등 — subject 컬럼 미ALTER(P2022) 시 레거시 items→subType 'KO_' 조인추론.
    if (!isMissingColumnError(error)) throw error;
    const legacyScope =
      opts.subject === "KOREAN"
        ? { items: { some: { question: { subType: { startsWith: "KO_" } } } } }
        : { items: { none: { question: { subType: { startsWith: "KO_" } } } } };
    const legacySets = await prisma.questionSet.findMany({
      where: {
        ...baseWhere,
        AND: [legacyScope, ...(passageScope ? [passageScope] : [])],
      },
      orderBy,
      take,
      include,
      omit: { subject: true },
    });
    // subject 를 SELECT 하지 않았으므로 null 로 복원해 mapSet 형태(SetWithItems)를 맞춘다.
    return legacySets.map((s) => mapSet({ ...s, subject: null }));
  }
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
    where: { id: { in: opts.questionIds }, academyId: staff.academyId, passageId: opts.passageId, deletedAt: null },
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
          basePassageId: opts.passageId,
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
 * 세트 멤버를 "분리"한다 — 세트는 그대로 두고(원본 멤버 유지), 그 문항의 복제본을
 * 단독 문항(inSet=false·setId=null)으로 하나 새로 만든다. 즉 세트에서 빼내는 게 아니라
 * 일반 단독 문항을 하나 추가하는 동작. 해설도 함께 복제. 새 문항 id 를 반환.
 */
export async function splitQuestionSetMember(
  questionId: string,
): Promise<{ success: boolean; error?: string; newQuestionId?: string }> {
  const staff = await getStaffSession();
  if (!staff) return { success: false, error: "Authentication required" };

  const original = await prisma.question.findFirst({
    // 휴지통 가드(deletedAt:null) 유지 + jay의 setItem/basePassage include 확장 동시 채택
    where: { id: questionId, academyId: staff.academyId, setId: { not: null }, deletedAt: null },
    include: {
      explanation: true,
      setItem: {
        include: {
          set: {
            include: {
              basePassage: { select: { id: true } },
              items: {
                orderBy: { orderInSet: "asc" },
                include: { question: { select: { passageId: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!original) return { success: false, error: "세트 멤버를 찾을 수 없습니다." };

  const sharedPassageId =
    original.passageId ??
    original.setItem?.set.basePassage?.id ??
    original.setItem?.set.items.find((item) => item.question.passageId)?.question.passageId ??
    null;

  if (!original.passageId && sharedPassageId) {
    await prisma.question.update({
      where: { id: original.id },
      data: { passageId: sharedPassageId },
    });
  }

  const copy = await prisma.question.create({
    data: {
      academyId: original.academyId,
      passageId: sharedPassageId,
      type: original.type,
      subType: original.subType,
      questionText: original.questionText,
      structuredData: original.structuredData ?? undefined,
      questionImage: original.questionImage,
      options: original.options,
      correctAnswer: original.correctAnswer,
      points: original.points,
      difficulty: original.difficulty,
      tags: original.tags,
      learningCategory: original.learningCategory,
      aiGenerated: original.aiGenerated,
      approved: original.approved,
      starred: false,
      sourceMaterialId: original.sourceMaterialId,
      bundleId: original.bundleId,
      questionNumber: original.questionNumber,
      similarQuestionGenJobId: original.similarQuestionGenJobId,
      customTypeId: original.customTypeId,
      // 단독 문항으로 — 세트와 무관.
      inSet: false,
      setId: null,
      explanation: original.explanation
        ? {
            create: {
              content: original.explanation.content,
              keyPoints: original.explanation.keyPoints,
              wrongOptionExplanations: original.explanation.wrongOptionExplanations,
              relatedGrammar: original.explanation.relatedGrammar,
              difficulty: original.explanation.difficulty,
              aiGenerated: original.explanation.aiGenerated,
              approved: original.explanation.approved,
            },
          }
        : undefined,
    },
    select: { id: true },
  });

  return { success: true, newQuestionId: copy.id };
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
