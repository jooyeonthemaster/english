"use server";

import type { Prisma } from "@prisma/client";

import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { QUESTION_PERSISTENCE_TRANSACTION_TIMEOUT_MS } from "@/lib/concurrency-config";
import { buildGeneratedQuestionText } from "@/lib/question-generation-persistence";
import { resolvePreset } from "@/lib/question-sets/presets";
import { reconstructPassageView } from "@/lib/question-sets/reconstruct";
import type { Anchor, LayoutDescriptor } from "@/lib/question-sets/types";
import type { WorkbenchQuestionFilters } from "@/actions/workbench/_types";

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

function setMemberQuestionWhere(
  academyId: string,
  filters?: WorkbenchQuestionFilters,
  collectionId?: string,
): Prisma.QuestionWhereInput {
  const where: Prisma.QuestionWhereInput = {
    academyId,
    deletedAt: null,
    setId: { not: null },
  };

  if (filters?.type) {
    const types = filters.type.split(",").filter(Boolean);
    where.type = types.length > 1 ? { in: types } : types[0];
  }
  if (filters?.subType) {
    const subs = filters.subType.split(",").filter(Boolean);
    where.subType = subs.length > 1 ? { in: subs } : subs[0];
  }
  if (filters?.difficulty) where.difficulty = filters.difficulty;
  if (filters?.passageId) where.passageId = filters.passageId;
  if (filters?.tags) where.tags = { contains: filters.tags };
  if (filters?.aiGenerated !== undefined) where.aiGenerated = filters.aiGenerated;
  if (filters?.approved !== undefined) where.approved = filters.approved;
  if (filters?.starred !== undefined) where.starred = filters.starred;
  if (filters?.search) {
    where.questionText = { contains: filters.search, mode: "insensitive" };
  }
  const effectiveCollectionId = collectionId ?? filters?.collectionId;
  if (effectiveCollectionId) {
    where.collectionItems = { some: { collectionId: effectiveCollectionId } };
  }

  return where;
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
 */
export async function listQuestionSets(opts: {
  passageId?: string;
  jobId?: string;
  limit?: number | null;
  setIds?: string[];
  filters?: WorkbenchQuestionFilters;
  /** 활성 폴더 id — 있으면 그 폴더에 멤버가 속한 세트만 반환(일반 문제와 동일한 컬렉션 조인).
   *  미지정 시 전체 세트(기존 동작). 세트는 원자적이라 폴더에 멤버 1개만 있어도 세트 전체를 표시. */
  collectionId?: string;
}): Promise<QuestionSetForRender[]> {
  const staff = await getStaffSession();
  if (!staff) return [];
  const setMatchFilters =
    opts.filters?.approved === undefined
      ? opts.filters
      : { ...opts.filters, approved: undefined };
  const memberWhere = setMemberQuestionWhere(
    staff.academyId,
    setMatchFilters,
    opts.collectionId,
  );
  const orderedSetIds = opts.setIds
    ? Array.from(new Set(opts.setIds.filter(Boolean)))
    : [];

  const sets = await prisma.questionSet.findMany({
    where: {
      academyId: staff.academyId,
      ...(orderedSetIds.length > 0 ? { id: { in: orderedSetIds } } : {}),
      ...(opts.jobId ? { jobId: opts.jobId } : {}),
      ...(opts.passageId
        ? {
            OR: [
              { basePassageId: opts.passageId },
              { items: { some: { question: { passageId: opts.passageId } } } },
            ],
          }
        : {}),
      items: { some: { question: memberWhere } },
    },
    orderBy: { createdAt: "desc" },
    take:
      orderedSetIds.length > 0
        ? undefined
        : opts.limit === null
          ? undefined
          : (opts.limit ?? 50),
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
  const mapped = sets.map(mapSet).filter((set) => {
    if (opts.filters?.approved === undefined) return true;
    const setApproved =
      set.members.length > 0 && set.members.every((member) => member.approved);
    return setApproved === opts.filters.approved;
  });
  if (orderedSetIds.length === 0) return mapped;
  const byId = new Map(mapped.map((set) => [set.id, set]));
  return orderedSetIds
    .map((id) => byId.get(id))
    .filter((set): set is QuestionSetForRender => Boolean(set));
}

/**
 * 세트 멤버 questionId → setId 맵(academy 전체). 폴더 카운트에서 세트를 "1개"로 세기 위해,
 * 멤버 문항 id 로 소속 세트를 역참조한다(휴지통 문항 제외). Academy-scoped.
 */
export async function getAcademyQuestionSetMemberMap(): Promise<
  Record<string, string>
> {
  const staff = await getStaffSession();
  if (!staff) return {};
  const items = await prisma.questionSetItem.findMany({
    where: { set: { academyId: staff.academyId }, question: { deletedAt: null } },
    select: { questionId: true, setId: true },
  });
  const map: Record<string, string> = {};
  for (const it of items) map[it.questionId] = it.setId;
  return map;
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

// 분리 시 유형별로 되살릴 지문 필드. reconstructPassageView 가 뱉는 형식(밑줄 __x__·
// 마커 __(A) x__·빈칸 _____)을 그대로 buildGeneratedQuestionText 가 소비하는 필드에 담는다.
// (anchor-extraction 불변식: reconstruct(base, spans) === 단독 문항 processor.passageWith*.)
const SPLIT_PASSAGE_FIELD: Record<string, string> = {
  BLANK_INFERENCE: "passageWithBlank",
  FILL_BLANK_KEY: "passageWithBlank",
  GRAMMAR_ERROR: "passageWithMarkers",
  VOCAB_CHOICE: "passageWithMarkers",
  ANTONYM: "passageWithMarkers",
  GRAMMAR_CORRECTION: "passageWithUnderline",
  REFERENCE: "passageWithUnderline",
  CONTEXT_MEANING: "passageWithUnderline",
  SYNONYM: "passageWithUnderline",
  IMPLIED_MEANING: "passageWithUnderline",
};

function readStructuredObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * 분리(단독화) 시 멤버 지문을 되살린다 — 세트는 지문 사본을 저장하지 않고 anchor(spans)만
 * 들고 있으므로, 그 멤버 **자기 spans 만** base 에 얹어(다른 멤버 변형은 빠짐) 단독 문항과
 * 동일한 지문을 굽는다. 구조형(글의 순서/문장 삽입)·무변형(제목/내용일치 등)은 questionText
 * 가 이미 완결이라 그대로 두고, 세트 표식(_setMember/_isStructural/_spans)만 벗긴다.
 */
function bakeSplitMemberView(
  typeId: string | null,
  isStructural: boolean,
  rawSpans: unknown,
  base: string,
  structuredData: unknown,
): { questionText: string | null; structuredData: Record<string, unknown> | null } {
  const sd = readStructuredObject(structuredData);
  const cleaned: Record<string, unknown> = { ...sd };
  delete cleaned._setMember;
  delete cleaned._isStructural;
  delete cleaned._spans;

  const spans = Array.isArray(rawSpans) ? (rawSpans as Anchor[]) : [];
  const field = typeId ? SPLIT_PASSAGE_FIELD[typeId] : undefined;

  // 구조형·무변형·미지원 유형·base 없음 → 지문 재생성 없이 표식만 제거.
  if (isStructural || spans.length === 0 || !field || !base) {
    return { questionText: null, structuredData: cleaned };
  }

  const marked = reconstructPassageView(base, spans).text;
  const withPassage: Record<string, unknown> = { ...cleaned, [field]: marked };
  return {
    questionText: buildGeneratedQuestionText(withPassage),
    structuredData: withPassage,
  };
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

  // 분리 문항은 그 멤버 자기 변형만 되살린다(다른 멤버 변형은 빠짐 — 원본 지문이 데이터에
  // 다 있으니 재구성 가능). 구조형·무변형은 questionText 그대로 + 세트 표식만 제거.
  const bakeBase =
    parseJson<LayoutDescriptor>(
      original.setItem?.set.displayedPassageLayout ?? null,
    )?.fullPassage ??
    original.setItem?.set.canonicalPassage ??
    "";
  const baked = bakeSplitMemberView(
    original.subType,
    original.setItem?.isStructural ?? false,
    original.setItem?.spans,
    bakeBase,
    original.structuredData,
  );

  const copy = await prisma.question.create({
    data: {
      academyId: original.academyId,
      passageId: sharedPassageId,
      type: original.type,
      subType: original.subType,
      questionText: baked.questionText ?? original.questionText,
      structuredData: baked.structuredData
        ? (JSON.parse(
            JSON.stringify(baked.structuredData),
          ) as Prisma.InputJsonValue)
        : (original.structuredData ?? undefined),
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
