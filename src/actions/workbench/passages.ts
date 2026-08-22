"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuth, getAcademyId } from "./_helpers";
import { buildDuplicateIndex } from "@/lib/duplicate-detection";
import { DIRECT_INPUT_PASSAGE_SOURCE } from "@/lib/passage-source";
import { buildWorkbenchPassageWhere } from "./_passage-where";
import { PRIME_REPORT_MARKERS } from "./passage-constants";
import type {
  WorkbenchPassageFilters,
  ActionResult,
  CreatePassageData,
} from "./_types";

// ---------------------------------------------------------------------------
// Direct-input ("직접 붙여넣은 지문") material bucket
// ---------------------------------------------------------------------------
// Pasted passages are filed under ONE shared per-academy text material so they
// surface as 추출된 자료 (extracted material) — a text source with no image —
// in 추출된 자료 관리 / 학습지 생성 lists, exactly like OCR-extracted material.

/** Label shown on the shared bucket's material card / source material. */
const DIRECT_INPUT_MATERIAL_LABEL = "직접 붙여넣은 지문";
/** Sentinel `SourceMaterial.contentHash`. The `@@unique([academyId, contentHash])`
 *  index makes find-or-create return the single shared bucket per academy. */
const DIRECT_INPUT_MATERIAL_HASH = "__SMOAT_DIRECT_INPUT_TEXT__";
/** 국어 직접입력 버킷 — 과목별 버킷 분리. 센티널 해시가 다르므로
 *  `@@unique([academyId, contentHash])` 아래에서 영어 버킷과 독립적으로
 *  find-or-create 된다 (기존 영어 버킷·기존 지문 무접촉). */
const DIRECT_INPUT_MATERIAL_LABEL_KO = "직접 붙여넣은 지문(국어)";
const DIRECT_INPUT_MATERIAL_HASH_KO = "__SMOAT_DIRECT_INPUT_TEXT_KO__";
/** `ExtractionJob.sourceType` marker for the text bucket (vs "PDF" | "IMAGES"). */
const DIRECT_INPUT_SOURCE_TYPE = "TEXT";


// ---------------------------------------------------------------------------
// Passage CRUD (Workbench)
// ---------------------------------------------------------------------------

// buildWorkbenchPassageWhere 는 plain 모듈(_passage-where.ts)로 이동 —
// "use server" 파일은 async export 만 허용하므로, API 라우트·유닛테스트와
// where 규약(과목 스코프 포함)을 공유하려면 밖에 있어야 한다.

/**
 * Return EVERY passage id matching `filters` (no pagination), academy-scoped.
 * Mirror of getWorkbenchQuestionIds — powers "전체 페이지 선택" so a bulk
 * 폴더 이동/추가가 현재 20개 페이지로 조용히 잘리지 않는다.
 */
export async function getWorkbenchPassageIds(
  academyId: string,
  filters?: WorkbenchPassageFilters,
): Promise<{ success: boolean; ids: string[]; count: number; error?: string }> {
  try {
    const staff = await requireAuth();
    if (staff.academyId !== academyId) {
      return {
        success: false,
        ids: [],
        count: 0,
        error: "학원 정보가 일치하지 않습니다.",
      };
    }
    const where = buildWorkbenchPassageWhere(staff.academyId, filters);
    const passages = await prisma.passage.findMany({
      where,
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    const ids = passages.map((p) => p.id);
    return { success: true, ids, count: ids.length };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "지문 목록을 불러오는 중 오류가 발생했습니다.";
    return { success: false, ids: [], count: 0, error: message };
  }
}

export async function getWorkbenchPassages(
  academyId: string,
  filters?: WorkbenchPassageFilters
) {
  await requireAuth();

  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const skip = (page - 1) * limit;

  const where = buildWorkbenchPassageWhere(academyId, filters);

  const [passages, total] = await Promise.all([
    prisma.passage.findMany({
      where,
      include: {
        school: { select: { id: true, name: true, type: true } },
        analysis: { select: { id: true, updatedAt: true, analysisData: true } },
        // 카드에 "학습지 생성/수정 시각"(연월일시분)을 띄우기 위한 최신 PRIME 보고서.
        reports: {
          where: { generationPlan: { in: PRIME_REPORT_MARKERS }, deletedAt: null },
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { createdAt: true, updatedAt: true, lastEditedAt: true },
        },
        _count: { select: { questions: true, notes: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.passage.count({ where }),
  ]);

  return { passages, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Scan the entire academy's passages and group exact-text duplicates.
 *
 * Used by `/director/workbench/passages` to provide a "중복 그룹 보기"
 * dedicated view. Unlike the paginated list, this returns *all* passages
 * that participate in a duplicate group (size ≥ 2) so the user can see every
 * cluster in one screen.
 *
 * The normalization is intentionally the same as the client-side helper
 * (`buildDuplicateIndex` from `@/lib/duplicate-detection`) — punctuation/case
 * insensitive, robust to OCR/whitespace noise.
 *
 * Heavy queries are mitigated by only selecting the minimal fields needed
 * for rendering the cluster cards. We do NOT return analysisData here; the
 * detail modal still fetches it separately on demand.
 */
export async function findWorkbenchPassageDuplicates(
  academyId: string,
  filters?: { analyzedOnly?: boolean },
) {
  await requireAuth();

  const where: Record<string, unknown> = { academyId };
  if (filters?.analyzedOnly) where.analysis = { isNot: null };

  // Pull the minimum fields needed for grouping + cluster card render.
  // `content` is required for normalization; everything else is presentational.
  const passages = await prisma.passage.findMany({
    where,
    select: {
      id: true,
      title: true,
      content: true,
      grade: true,
      semester: true,
      unit: true,
      publisher: true,
      difficulty: true,
      tags: true,
      createdAt: true,
      school: { select: { id: true, name: true, type: true } },
      analysis: { select: { id: true, updatedAt: true } },
      _count: { select: { questions: true, notes: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const index = buildDuplicateIndex(
    passages,
    (p) => p.content,
    (p) => p.id,
  );

  // Drop `content` from groups before returning (network-friendly): the
  // cluster view doesn't need full content text, only the preview that the
  // card derives. Keep a short preview slice so the client can show context
  // without re-fetching.
  const groups = index.groups.map((g) => ({
    key: g.key,
    items: g.items.map((p) => ({
      id: p.id,
      title: p.title,
      contentPreview: p.content.length > 240 ? p.content.slice(0, 240) + "…" : p.content,
      wordCount: p.content.trim().split(/\s+/).filter(Boolean).length,
      grade: p.grade,
      semester: p.semester,
      unit: p.unit,
      publisher: p.publisher,
      difficulty: p.difficulty,
      tags: p.tags,
      createdAt: p.createdAt,
      school: p.school,
      analysis: p.analysis,
      _count: p._count,
    })),
  }));

  return {
    groups,
    groupCount: index.groupCount,
    totalDuplicateCount: index.totalDuplicateCount,
    totalScanned: passages.length,
  };
}

export async function getWorkbenchPassage(passageId: string) {
  await requireAuth();

  const passage = await prisma.passage.findUnique({
    where: { id: passageId },
    include: {
      school: { select: { id: true, name: true, type: true } },
      notes: { orderBy: { order: "asc" } },
      analysis: true,
      questions: {
        where: { deletedAt: null },
        include: { explanation: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return passage;
}

export async function createWorkbenchPassage(
  data: CreatePassageData
): Promise<ActionResult> {
  try {
    const session = await requireAuth();
    const academyId = getAcademyId(session);
    const schoolId = data.schoolId && data.schoolId !== "NONE" ? data.schoolId : null;
    // 생성의 부수효과로 지문을 만들 땐(동형 시험지 from-drafts·직접입력·웹툰·등록 등)
    // 원본 draft 를 검수완료로 올리지 않는다 — 생성/저장은 사람 검수가 아니므로
    // 검수필요를 유지한다. 기본값 false, 사람이 명시적으로 검수완료할 때만 true.
    const markDraftReviewed = data.markReviewed ?? false;

    if (schoolId) {
      const school = await prisma.school.findFirst({
        where: { id: schoolId, academyId },
        select: { id: true },
      });

      if (!school) {
        return {
          success: false,
          error: "선택한 학교를 찾을 수 없습니다. 학교 선택을 다시 확인해주세요.",
        };
      }
    }

    const annotationRows = (data.annotations ?? []).map((a, index) => ({
      annotationId: a.id,
      noteType: a.type,
      content: a.text,
      memo: a.memo ?? "",
      highlightStart: a.from,
      highlightEnd: a.to,
      order: index,
    }));

    const passage = await prisma.$transaction(async (tx) => {
      // ── Idempotent reuse for direct-input (pasted) passages ──
      // A pasted passage already exists as a real Passage AND carries an M1
      // draft (savedPassageId). Re-saving / analyzing that draft from 추출된
      // 자료 관리 must update the SAME passage, never spawn a duplicate. This is
      // gated on `source === 직접 입력`, so every existing extraction flow keeps
      // its exact create-new behavior untouched.
      if (data.sourceDraftId) {
        const linkedDraft = await tx.extractionM1PassageDraft.findFirst({
          where: {
            id: data.sourceDraftId,
            deletedAt: null,
            job: { academyId, deletedAt: null },
          },
          select: { id: true, savedPassageId: true },
        });
        if (linkedDraft?.savedPassageId) {
          const existing = await tx.passage.findFirst({
            where: {
              id: linkedDraft.savedPassageId,
              academyId,
              source: DIRECT_INPUT_PASSAGE_SOURCE,
            },
            select: { id: true },
          });
          if (existing) {
            await tx.passage.update({
              where: { id: existing.id },
              data: {
                title: data.title,
                content: data.content,
                // Preserve the 직접 입력 source marker — never overwrite it with
                // the analyze form's `source` (job name) or it stops being a
                // direct-input material. Only fill provided meta fields.
                ...(schoolId ? { schoolId } : {}),
                ...(data.grade !== undefined ? { grade: data.grade || null } : {}),
                ...(data.semester !== undefined
                  ? { semester: data.semester || null }
                  : {}),
                ...(data.unit !== undefined ? { unit: data.unit || null } : {}),
                ...(data.publisher !== undefined
                  ? { publisher: data.publisher || null }
                  : {}),
                ...(data.difficulty !== undefined
                  ? { difficulty: data.difficulty || null }
                  : {}),
                ...(data.tags ? { tags: JSON.stringify(data.tags) } : {}),
              },
            });
            if (markDraftReviewed) {
              await tx.extractionM1PassageDraft.update({
                where: { id: linkedDraft.id },
                data: { reviewStatus: "COMMITTED", confirmedAt: new Date() },
              });
            }
            return existing;
          }
        }
      }

      const created = await tx.passage.create({
        data: {
          academyId,
          schoolId,
          title: data.title,
          content: data.content,
          source: data.source || null,
          grade: data.grade || null,
          semester: data.semester || null,
          unit: data.unit || null,
          publisher: data.publisher || null,
          difficulty: data.difficulty || null,
          tags: data.tags ? JSON.stringify(data.tags) : null,
          // 과목 태깅 — 국어 라우트 등록만 'KOREAN'. 미지정이면 subject 미포함(조건부
          // spread)이라 영어 등록은 종전과 동일(무회귀). passages.subject 규약.
          ...(data.subject ? { subject: data.subject } : {}),
          ...(annotationRows.length > 0
            ? { notes: { create: annotationRows } }
            : {}),
        },
      });

      if (data.sourceDraftId) {
        const sourceDraft = await tx.extractionM1PassageDraft.findFirst({
          where: {
            id: data.sourceDraftId,
            deletedAt: null,
            job: { academyId, deletedAt: null },
          },
          select: { id: true },
        });

        if (sourceDraft) {
          await tx.extractionM1PassageDraft.update({
            where: { id: sourceDraft.id },
            data: markDraftReviewed
              ? {
                  savedPassageId: created.id,
                  reviewStatus: "COMMITTED",
                  confirmedAt: new Date(),
                }
              : { savedPassageId: created.id },
          });
        }
      }

      return created;
    });

    revalidatePath("/director/workbench/passages");
    return { success: true, id: passage.id };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "지문 등록 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

/**
 * Create a directly-pasted passage AND register it as 추출된 자료 (extracted
 * material) so it appears in 추출된 자료 관리 / 학습지 생성 lists like OCR material —
 * just a TEXT source with no image assigned.
 *
 * Everything is filed under ONE shared per-academy bucket:
 *   • SourceMaterial  — "직접 붙여넣은 지문" (type TEXT-ish handout, no originalFileUrl)
 *   • ExtractionJob   — PASSAGE_ONLY, sourceType "TEXT", no pages/image
 *   • ExtractionM1PassageDraft — one per pasted passage, COMMITTED + savedPassageId,
 *     restorationStatus "RESTORED" so it's always visible (`isM1DraftVisible`).
 *
 * The Passage keeps `source = 직접 입력` (so the existing includeDirectInput /
 * direct-input UI paths still work) and gains `sourceMaterialId` lineage.
 */
// 정규 Passage 난이도 6단계(CEFR). 추출 zod 스키마·import 정규화와 동일 집합.
// (값 출처: src/lib/extraction/zod-schemas.ts, src/app/api/passages/import/route.ts)
const CEFR_DIFFICULTY_LADDER = [
  "BEGINNER",
  "ELEMENTARY",
  "INTERMEDIATE",
  "UPPER_INTERMEDIATE",
  "ADVANCED",
  "EXPERT",
] as const;

/**
 * 난이도 변형(EASIER/HARDER)용 — 원본 난이도를 정규 6단계에서 한 칸 이동.
 * 원본이 비었거나 정규 값이 아니거나 이동 결과가 같으면 undefined(=원본 승계).
 * 두 변형 표면(인라인·전용탭)이 같은 서버 로직을 쓰게 해 데이터 일관성을 보장한다.
 */
function shiftCefrDifficulty(
  current: string | null | undefined,
  direction: "EASIER" | "HARDER",
): string | undefined {
  if (!current) return undefined;
  const idx = CEFR_DIFFICULTY_LADDER.indexOf(
    current as (typeof CEFR_DIFFICULTY_LADDER)[number],
  );
  if (idx < 0) return undefined;
  const nextIdx =
    direction === "EASIER"
      ? Math.max(0, idx - 1)
      : Math.min(CEFR_DIFFICULTY_LADDER.length - 1, idx + 1);
  if (nextIdx === idx) return undefined;
  return CEFR_DIFFICULTY_LADDER[nextIdx];
}

export async function createDirectInputPassageMaterial(data: {
  title: string;
  content: string;
  /**
   * 변형본 저장용 — 원본 Passage id. 지정하면 학교/학년/학기/단원/출판사/난이도
   * 메타를 원본에서 승계한다 (analysis 는 본문이 달라 stale 이므로 승계하지 않음).
   */
  sourcePassageId?: string;
  /**
   * 전체 변형본(관련/상반 주제·난이도·길이)용 — UI 라벨/태그/메타에 쓸 한국어
   * 변형 종류 라벨 (예: "관련 주제"). 지정되면 metadata.source 가 "VARIANT" 가 된다.
   */
  variantKind?: string;
  /** 난이도/길이 변형의 방향 (EASIER/HARDER/SHORTER/LONGER) — 메타 기록용. */
  variantDirection?: string;
  /** 난이도 변형 시 원본 승계 대신 적용할 난이도(없으면 원본 승계/미설정). */
  difficultyOverride?: string | null;
  /** Passage.tags(JSON 배열 문자열)에 저장할 태그들 — 변형본 식별·필터용. */
  tags?: string[];
  /**
   * 지문 과목 — 미지정/"ENGLISH" = 기존 영어 경로 그대로(무회귀),
   * "KOREAN" = 국어 전용 직접입력 버킷에 적재 + Passage.subject="KOREAN" 저장.
   * 갈래 태그(KO_KIND:*)는 호출부가 `tags` 로 함께 넘긴다.
   */
  subject?: "ENGLISH" | "KOREAN";
}): Promise<ActionResult> {
  try {
    const staff = await requireAuth();
    const academyId = staff.academyId;
    const createdById = staff.id;
    const title = data.title.trim();
    const content = data.content.trim();

    if (content.length < 20) {
      return {
        success: false,
        error: "지문이 너무 짧습니다. 최소 20자 이상 입력해주세요.",
      };
    }

    // 국어 지문이면 과목별 직접입력 버킷(라벨·센티널 해시)을 쓴다. 그 외에는
    // 기존 영어 버킷 그대로 — 분기 밖 로직은 과목 무관 공통.
    const isKorean = data.subject === "KOREAN";
    const materialLabel = isKorean
      ? DIRECT_INPUT_MATERIAL_LABEL_KO
      : DIRECT_INPUT_MATERIAL_LABEL;
    const materialHash = isKorean
      ? DIRECT_INPUT_MATERIAL_HASH_KO
      : DIRECT_INPUT_MATERIAL_HASH;

    // 변형본이면 원본 메타를 academy 스코프로 조회해 승계한다.
    const sourcePassage = data.sourcePassageId
      ? await prisma.passage.findFirst({
          where: { id: data.sourcePassageId, academyId },
          select: {
            schoolId: true,
            grade: true,
            semester: true,
            unit: true,
            publisher: true,
            difficulty: true,
            tags: true,
            subject: true,
          },
        })
      : null;

    // Passage.subject — 명시 "KOREAN" 이거나 원본(변형본 저장)이 국어면 국어로
    // 저장. 그 외에는 미기록(null=영어 간주 관례, 기존 행과 동일).
    const passageSubject =
      isKorean || sourcePassage?.subject === "KOREAN" ? "KOREAN" : undefined;

    // 난이도 변형(EASIER/HARDER)이면 서버에서 정규 CEFR 래더로 한 칸 이동한다 —
    // 명시 difficultyOverride 가 우선, 없으면 방향 기반 시프트. 두 변형 표면이
    // 같은 서버 로직을 타 일관된 난이도가 저장된다.
    const directionShift =
      data.variantDirection === "EASIER" || data.variantDirection === "HARDER"
        ? shiftCefrDifficulty(sourcePassage?.difficulty, data.variantDirection)
        : undefined;
    const difficultyToSet =
      data.difficultyOverride !== undefined
        ? data.difficultyOverride
        : directionShift;

    // 변형본 태그 — 원본의 분류 태그(JSON 배열)를 승계하고 변형 식별 태그를 더한다.
    let mergedTags: string[] | undefined;
    if (data.tags && data.tags.length > 0) {
      const inherited: string[] = [];
      if (sourcePassage?.tags) {
        try {
          const parsed = JSON.parse(sourcePassage.tags);
          if (Array.isArray(parsed)) {
            for (const t of parsed) if (typeof t === "string") inherited.push(t);
          }
        } catch {
          /* 원본 tags 가 비정상 JSON 이면 무시하고 변형 태그만 단다. */
        }
      }
      mergedTags = Array.from(new Set([...inherited, ...data.tags]));
    }

    const passageId = await prisma.$transaction(
      async (tx) => {
        // 1) Shared "직접 붙여넣은 지문" SourceMaterial — one per academy.
        //    The sentinel contentHash + unique index makes this find-or-create.
        let material = await tx.sourceMaterial.findFirst({
          where: { academyId, contentHash: materialHash },
          select: { id: true },
        });
        if (!material) {
          material = await tx.sourceMaterial.create({
            data: {
              academyId,
              type: "HANDOUT",
              title: materialLabel,
              customLabel: materialLabel,
              subject: isKorean ? "KOREAN" : "ENGLISH",
              contentHash: materialHash,
              createdById,
            },
            select: { id: true },
          });
        }

        // 2) Shared text-source ExtractionJob (no file/image) — one per academy.
        let job = await tx.extractionJob.findFirst({
          where: {
            academyId,
            sourceMaterialId: material.id,
            sourceType: DIRECT_INPUT_SOURCE_TYPE,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!job) {
          job = await tx.extractionJob.create({
            data: {
              academyId,
              createdById,
              sourceType: DIRECT_INPUT_SOURCE_TYPE,
              mode: "PASSAGE_ONLY",
              displayName: materialLabel,
              originalFileName: materialLabel,
              sourceMaterialId: material.id,
              status: "COMPLETED",
              totalPages: 0,
              pendingPages: 0,
              successPages: 0,
              completedAt: new Date(),
            },
            select: { id: true },
          });
        }

        // 3) The Passage — direct-input + linked to the material for lineage.
        //    변형본이면 원본의 정적 메타(학교/학년/학기/단원/출판사/난이도)를
        //    승계해 생성 프롬프트 캘리브레이션·라이브러리 필터가 유지되게 한다.
        const passage = await tx.passage.create({
          data: {
            academyId,
            title,
            content,
            source: DIRECT_INPUT_PASSAGE_SOURCE,
            sourceMaterialId: material.id,
            // 과목 — 국어일 때만 기록 (undefined = 기존 영어 지문과 동일하게 null).
            ...(passageSubject ? { subject: passageSubject } : {}),
            ...(sourcePassage
              ? {
                  schoolId: sourcePassage.schoolId,
                  grade: sourcePassage.grade,
                  semester: sourcePassage.semester,
                  unit: sourcePassage.unit,
                  publisher: sourcePassage.publisher,
                  difficulty: sourcePassage.difficulty,
                }
              : {}),
            // 난이도 변형 — 원본 승계 difficulty 를 덮어쓴다 (명시 지정 또는 방향 시프트).
            ...(difficultyToSet !== undefined
              ? { difficulty: difficultyToSet }
              : {}),
            // 변형본 태그 (원본 분류 태그 + 변형 식별 태그, JSON 배열 문자열).
            ...(mergedTags && mergedTags.length > 0
              ? { tags: JSON.stringify(mergedTags) }
              : {}),
          },
          select: { id: true },
        });

        // 4) Next passageOrder for the shared job (unique [jobId, passageOrder]).
        const last = await tx.extractionM1PassageDraft.findFirst({
          where: { jobId: job.id },
          orderBy: { passageOrder: "desc" },
          select: { passageOrder: true },
        });
        const nextOrder = (last?.passageOrder ?? -1) + 1;

        // 5) The M1 draft — mirrors a saved/committed extraction draft so the
        //    text passage shows in 추출된 자료 관리 (no restoration, no image).
        await tx.extractionM1PassageDraft.create({
          data: {
            jobId: job.id,
            sourceMaterialId: material.id,
            passageOrder: nextOrder,
            sourcePageIndex: [],
            title: title || null,
            rawText: content,
            restoredText: content,
            teacherText: content,
            // != "NO_RESTORATION_NEEDED" → always visible via isM1DraftVisible,
            // regardless of length. No real restoration happened.
            restorationStatus: "RESTORED",
            reviewStatus: "COMMITTED",
            savedPassageId: passage.id,
            confirmedAt: new Date(),
            metadata: data.sourcePassageId
              ? {
                  directInput: true,
                  source: data.variantKind ? "VARIANT" : "PASTE",
                  variantOf: data.sourcePassageId,
                  ...(data.variantKind ? { variantKind: data.variantKind } : {}),
                  ...(data.variantDirection
                    ? { variantDirection: data.variantDirection }
                    : {}),
                }
              : { directInput: true, source: "PASTE" },
          },
        });

        return passage.id;
      },
      { timeout: 15_000 },
    );

    revalidatePath("/director/workbench/passages");
    revalidatePath("/director/workbench/passages/create");
    revalidatePath("/director/workbench/passages/import/jobs");
    revalidatePath("/director/workbench/extraction/jobs");
    return { success: true, id: passageId };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "지문 등록 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function updateWorkbenchPassage(
  passageId: string,
  data: Partial<CreatePassageData>
): Promise<ActionResult> {
  try {
    const session = await requireAuth();
    const academyId = getAcademyId(session);
    const schoolId = data.schoolId && data.schoolId !== "NONE" ? data.schoolId : null;

    if (schoolId) {
      const school = await prisma.school.findFirst({
        where: { id: schoolId, academyId },
        select: { id: true },
      });

      if (!school) {
        return {
          success: false,
          error: "선택한 학교를 찾을 수 없습니다. 학교 선택을 다시 확인해주세요.",
        };
      }
    }

    await prisma.passage.update({
      where: { id: passageId },
      data: {
        title: data.title,
        content: data.content,
        schoolId,
        source: data.source,
        grade: data.grade,
        semester: data.semester,
        unit: data.unit,
        publisher: data.publisher,
        difficulty: data.difficulty,
        tags: data.tags ? JSON.stringify(data.tags) : undefined,
      },
    });

    revalidatePath("/director/workbench/passages");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "지문 수정 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function deleteWorkbenchPassage(
  passageId: string
): Promise<ActionResult> {
  try {
    await requireAuth();

    await prisma.passage.delete({ where: { id: passageId } });

    revalidatePath("/director/workbench/passages");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "지문 삭제 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

// Bulk delete: scoped to caller's academy so cross-tenant ids silently no-op
// instead of erroring out the whole batch.
export async function bulkDeleteWorkbenchPassages(
  passageIds: string[],
): Promise<{
  success: boolean;
  requested: number;
  deleted: number;
  error?: string;
}> {
  try {
    const staff = await requireAuth();
    if (passageIds.length === 0) {
      return { success: true, requested: 0, deleted: 0 };
    }
    const result = await prisma.passage.deleteMany({
      where: { id: { in: passageIds }, academyId: staff.academyId },
    });
    revalidatePath("/director/workbench/passages");
    return {
      success: true,
      requested: passageIds.length,
      deleted: result.count,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "지문 삭제 중 오류가 발생했습니다.";
    return {
      success: false,
      requested: passageIds.length,
      deleted: 0,
      error: message,
    };
  }
}

export async function bulkUpdatePassageTags(
  passageIds: string[],
  tags: string[]
) {
  await requireAuth();
  try {
    const tagsJson = JSON.stringify(tags);
    await prisma.passage.updateMany({
      where: { id: { in: passageIds } },
      data: { tags: tagsJson },
    });
    revalidatePath("/director/workbench/passages");
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "태그 업데이트 실패";
    return { success: false as const, error: message };
  }
}

// ---------------------------------------------------------------------------
// 학습지 검수완료 토글 — 학습지 카드의 "검수완료/검수취소" 버튼.
//   reviewed=true  → reviewedAt = now(), reviewedById = 현재 staff
//   reviewed=false → reviewedAt = null,  reviewedById = null (검수취소)
// ---------------------------------------------------------------------------
export async function setPassageReviewed(
  passageId: string,
  reviewed: boolean,
): Promise<
  | { success: true; reviewedAt: Date | null }
  | { success: false; error: string }
> {
  const staff = await requireAuth();
  try {
    // 테넌트 경계: 본인 학원 지문만 갱신한다.
    const result = await prisma.passage.updateMany({
      where: { id: passageId, academyId: staff.academyId },
      data: reviewed
        ? { reviewedAt: new Date(), reviewedById: staff.id }
        : { reviewedAt: null, reviewedById: null },
    });
    if (result.count === 0) {
      return { success: false as const, error: "지문을 찾을 수 없습니다." };
    }
    revalidatePath("/director/workbench/passages");
    revalidatePath("/director/workbench/passages/create");
    return {
      success: true as const,
      reviewedAt: reviewed ? new Date() : null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "검수 상태 변경 실패";
    return { success: false as const, error: message };
  }
}

/**
 * 학습지 제목만 변경 — 상세 모달 헤더의 연필(제목 인라인 편집) 버튼.
 * (updateWorkbenchPassage 는 schoolId 등 다른 필드를 함께 덮어쓰므로 제목 전용으로 분리)
 */
export async function renamePassage(
  passageId: string,
  title: string,
): Promise<ActionResult> {
  const staff = await requireAuth();
  const trimmed = title.trim();
  if (!trimmed) return { success: false as const, error: "제목을 입력하세요." };
  try {
    const result = await prisma.passage.updateMany({
      where: { id: passageId, academyId: staff.academyId },
      data: { title: trimmed },
    });
    if (result.count === 0) {
      return { success: false as const, error: "지문을 찾을 수 없습니다." };
    }
    revalidatePath("/director/workbench/passages");
    revalidatePath("/director/workbench/passages/create");
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "제목 수정 실패";
    return { success: false as const, error: message };
  }
}

/**
 * 지문 제목+본문만 변경 — 지문관리 행 인라인 지문 수정기의 「저장」
 * (docs/class-studio-spec.md §3.10.18 E18-d).
 *
 * ⚠ updateWorkbenchPassage 를 쓰면 안 된다: 그쪽은 `schoolId` 를
 *   `data.schoolId && data.schoolId !== "NONE" ? data.schoolId : null` 로 계산해
 *   **미전달 시 null 을 실제로 기록**한다(undefined 가 아니라 null 이라 Prisma 가
 *   무시하지 않는다) — 본문만 고치려다 학교 연결이 지워진다. renamePassage 가
 *   같은 이유로 분리돼 있고, 이 함수는 그 관용구의 본문 판이다.
 *
 * academyId 스코프 updateMany 라 타 학원 지문은 count 0 으로 떨어진다.
 */
export async function updatePassageBody(
  passageId: string,
  data: { content: string; title?: string },
): Promise<ActionResult> {
  const staff = await requireAuth();
  const content = data.content.trim();
  // title 은 **선택**이다. 인라인 지문 수정기는 본문만 고치고 제목은 행의
  // 연필(renamePassage)이 소유한다 — 여기서 제목을 함께 보내면, 편집기를 열어
  // 둔 채 행에서 제목을 바꿨을 때 저장이 그 개명을 되돌려버린다(스테일 덮어쓰기).
  const title = data.title?.trim();
  if (data.title !== undefined && !title) {
    return { success: false as const, error: "제목을 입력하세요." };
  }
  if (content.length < 20) {
    return { success: false as const, error: "본문이 너무 짧습니다. (최소 20자)" };
  }
  try {
    const result = await prisma.passage.updateMany({
      where: { id: passageId, academyId: staff.academyId },
      data: title ? { title, content } : { content },
    });
    if (result.count === 0) {
      return { success: false as const, error: "지문을 찾을 수 없습니다." };
    }
    revalidatePath("/director/workbench/passages");
    revalidatePath("/director/workbench/passages/create");
    return { success: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "지문 수정 실패";
    return { success: false as const, error: message };
  }
}

/**
 * 선택한 학습지 일괄 검수완료/검수취소 — 목록 툴바의 "검수완료" 버튼.
 */
export async function bulkSetPassageReviewed(
  passageIds: string[],
  reviewed: boolean,
): Promise<{ success: true; count: number } | { success: false; error: string }> {
  const staff = await requireAuth();
  if (passageIds.length === 0) {
    return { success: false as const, error: "선택한 학습지가 없습니다." };
  }
  try {
    const result = await prisma.passage.updateMany({
      where: { id: { in: passageIds }, academyId: staff.academyId },
      data: reviewed
        ? { reviewedAt: new Date(), reviewedById: staff.id }
        : { reviewedAt: null, reviewedById: null },
    });
    revalidatePath("/director/workbench/passages");
    revalidatePath("/director/workbench/passages/create");
    return { success: true as const, count: result.count };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "검수 상태 변경 실패";
    return { success: false as const, error: message };
  }
}
