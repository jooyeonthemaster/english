"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAuth } from "./_helpers";
import { DIRECT_INPUT_PASSAGE_SOURCE } from "@/lib/passage-source";
import { getExamPassagesByIds } from "@/lib/exam-passages/corpus";
import { formatExamTitle, examShortLabel } from "@/lib/exam-passages/format";
import { EXAM_MAX_IDS } from "@/lib/exam-passages/types";

// ---------------------------------------------------------------------------
// 수능·모평 기출 지문 → "내 지문함" 일괄 등록
// ---------------------------------------------------------------------------
// 크롤링한 기출 코퍼스(src/data/exam-passages)에서 id 목록을 받아, 본문은 서버가
// 코퍼스에서 직접 해석(클라이언트는 id 만 전송 — 변조·대용량 페이로드 방지)하고,
// 직접-입력("직접 붙여넣은 지문")과 동일한 SourceMaterial/ExtractionJob 계보로
// Passage + M1 draft 를 만든다(검증된 경로 재사용 → 무회귀). 한 트랜잭션에서
// passageOrder 를 순차 할당하므로 @@unique([jobId,passageOrder]) 충돌이 없다.
//
// 멱등: 같은 기출 지문(tags 의 kice:<id> 마커)이 이미 이 학원에 등록돼 있으면 건너뛴다.

const DIRECT_INPUT_MATERIAL_LABEL = "직접 붙여넣은 지문";
const DIRECT_INPUT_MATERIAL_HASH = "__SMOAT_DIRECT_INPUT_TEXT__";
const DIRECT_INPUT_SOURCE_TYPE = "TEXT";

/** tags 마커 — 이 학원이 이미 등록한 기출 지문 식별/멱등용. */
const KICE_TAG_PREFIX = "kice:";

/**
 * 공유 텍스트 잡에 passageOrder 를 순차 채번하는데, 같은 학원의 동시 등록(이 액션 또는
 * 직접입력)이 같은 max 를 읽어 @@unique([jobId,passageOrder]) P2002 로 충돌할 수 있다.
 * 충돌 시 전체 트랜잭션을 짧은 backoff 후 재시도하면 다음 시도가 새 max 를 다시 읽는다.
 */
async function runWithUniqueRetry<T>(
  fn: () => Promise<T>,
  attempts = 4,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if ((e as { code?: string })?.code !== "P2002") throw e;
      await new Promise((r) => setTimeout(r, 50 * (i + 1)));
    }
  }
  throw lastErr;
}

export interface ImportExamPassagesResult {
  success: boolean;
  error?: string;
  /** 이번에 새로 만들어진 Passage id(선택·뷰전환에 사용). */
  createdIds: string[];
  /** 이미 등록돼 건너뛴 기출 지문 id. */
  skippedExamIds: string[];
  /**
   * 이번 요청분 중 이미 지문함에 있던 것들의 기존 Passage id — 클래스 자동
   * 담기(§3.8.3)가 신규·기존을 함께 담기 위한 additive 필드(구 소비처는 무시).
   */
  existingIds?: string[];
}

export async function importExamPassages(
  examPassageIds: string[],
): Promise<ImportExamPassagesResult> {
  try {
    const staff = await requireAuth();
    const academyId = staff.academyId;
    const createdById = staff.id;

    const ids = Array.from(
      new Set((examPassageIds ?? []).map((s) => s.trim()).filter(Boolean)),
    ).slice(0, EXAM_MAX_IDS);
    if (ids.length === 0) {
      return {
        success: false,
        error: "불러올 기출 지문을 선택해주세요.",
        createdIds: [],
        skippedExamIds: [],
      };
    }

    // 1) 코퍼스에서 본문·메타 해석(서버 신뢰 소스).
    const records = getExamPassagesByIds(ids);
    if (records.length === 0) {
      return {
        success: false,
        error: "선택한 기출 지문을 찾을 수 없습니다.",
        createdIds: [],
        skippedExamIds: [],
      };
    }

    // 2) 멱등 — 이미 등록된 기출(tags 에 kice:<id>) 조회 후 제외.
    //    examId → 기존 Passage id 맵도 함께 만든다(클래스 자동 담기 §3.8.3).
    const existing = await prisma.passage.findMany({
      where: { academyId, tags: { contains: KICE_TAG_PREFIX } },
      select: { id: true, tags: true },
    });
    const alreadyImported = new Set<string>();
    const passageIdByExamId = new Map<string, string>();
    for (const row of existing) {
      if (!row.tags) continue;
      try {
        const parsed = JSON.parse(row.tags);
        if (Array.isArray(parsed)) {
          for (const t of parsed) {
            if (typeof t === "string" && t.startsWith(KICE_TAG_PREFIX)) {
              const examId = t.slice(KICE_TAG_PREFIX.length);
              alreadyImported.add(examId);
              if (!passageIdByExamId.has(examId)) {
                passageIdByExamId.set(examId, row.id);
              }
            }
          }
        }
      } catch {
        /* 비정상 tags 는 무시 */
      }
    }

    const toCreate = records.filter(
      (r) =>
        !alreadyImported.has(r.id) &&
        typeof r.text === "string" &&
        r.text.trim().length > 0,
    );
    const skippedExamIds = records
      .filter((r) => alreadyImported.has(r.id))
      .map((r) => r.id);
    const existingIds = Array.from(
      new Set(
        skippedExamIds
          .map((examId) => passageIdByExamId.get(examId))
          .filter((v): v is string => Boolean(v)),
      ),
    );

    // 재담기 정책(2026-08-11 사용자 지시): 이미 담긴 기출을 다시 담으면 중복
    // 생성 없이 「담은 날짜」만 최신화한다 — 지문함의 표시 날짜·최신순 정렬
    // 정본이 createdAt 이므로(use-passage-library 정렬 계약) createdAt 을 지금
    // 시각으로 올려 목록 맨 앞으로 끌어올린다. 연결(클래스·생성물·분석)은
    // 전부 그대로 유지된다.
    if (existingIds.length > 0) {
      await prisma.passage.updateMany({
        where: { id: { in: existingIds }, academyId },
        data: { createdAt: new Date() },
      });
    }

    if (toCreate.length === 0) {
      return {
        success: true,
        createdIds: [],
        skippedExamIds,
        existingIds,
      };
    }

    // 3) 한 트랜잭션에서 공유 버킷 find-or-create + 순차 등록(P2002 경합 시 재시도).
    const createdIds = await runWithUniqueRetry(() =>
      prisma.$transaction(
      async (tx) => {
        // 공유 "직접 붙여넣은 지문" SourceMaterial(학원당 1개) — sentinel 로 find-or-create.
        let material = await tx.sourceMaterial.findFirst({
          where: { academyId, contentHash: DIRECT_INPUT_MATERIAL_HASH },
          select: { id: true },
        });
        if (!material) {
          material = await tx.sourceMaterial.create({
            data: {
              academyId,
              type: "HANDOUT",
              title: DIRECT_INPUT_MATERIAL_LABEL,
              customLabel: DIRECT_INPUT_MATERIAL_LABEL,
              subject: "ENGLISH",
              contentHash: DIRECT_INPUT_MATERIAL_HASH,
              createdById,
            },
            select: { id: true },
          });
        }

        // 공유 텍스트 ExtractionJob(학원당 1개).
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
              displayName: DIRECT_INPUT_MATERIAL_LABEL,
              originalFileName: DIRECT_INPUT_MATERIAL_LABEL,
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

        // 공유 job 의 다음 passageOrder 기준점(트랜잭션 내 순차 +1).
        const last = await tx.extractionM1PassageDraft.findFirst({
          where: { jobId: job.id },
          orderBy: { passageOrder: "desc" },
          select: { passageOrder: true },
        });
        let nextOrder = (last?.passageOrder ?? -1) + 1;

        const made: string[] = [];
        for (const r of toCreate) {
          const title = formatExamTitle(r);
          const content = r.text.trim();
          // 식별·필터·멱등 태그(JSON 배열 문자열).
          const tags = JSON.stringify([
            "수능기출",
            String(r.year),
            examShortLabel(r.exam),
            r.typeGroup,
            `${KICE_TAG_PREFIX}${r.id}`,
          ]);

          const passage = await tx.passage.create({
            data: {
              academyId,
              title,
              content,
              source: DIRECT_INPUT_PASSAGE_SOURCE,
              sourceMaterialId: material.id,
              extractionOutput: "verbatim",
              tags,
            },
            select: { id: true },
          });

          await tx.extractionM1PassageDraft.create({
            data: {
              jobId: job.id,
              sourceMaterialId: material.id,
              passageOrder: nextOrder,
              sourcePageIndex: [],
              title,
              rawText: content,
              restoredText: content,
              teacherText: content,
              restorationStatus: "RESTORED",
              reviewStatus: "COMMITTED",
              savedPassageId: passage.id,
              confirmedAt: new Date(),
              metadata: {
                directInput: true,
                source: "EXAM_PASSAGE",
                examPassageId: r.id,
                examId: r.examId,
                year: r.year,
                exam: r.exam,
                type: r.type,
                reconstructionKind: r.reconstructionKind,
              },
            },
          });

          made.push(passage.id);
          nextOrder += 1;
        }
        return made;
      },
        { timeout: 30_000 },
      ),
    );

    revalidatePath("/director/workbench/passages");
    revalidatePath("/director/workbench/questions/generate");

    return { success: true, createdIds, skippedExamIds, existingIds };
  } catch (err) {
    console.error("[importExamPassages] failed", err);
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "기출 지문 등록 중 오류가 발생했습니다.",
      createdIds: [],
      skippedExamIds: [],
    };
  }
}

/**
 * 학원에 이미 담긴 기출 examId 전량 — 기출 브라우저 「담음/담김」 배지용(§3.8.3 개정).
 * importExamPassages 의 멱등 판정과 동일한 tags(kice:<examId>) 스캔을 공유한다.
 * 실패는 빈 목록으로 조용히 강등(배지는 보조 신호 — 브라우저 동작을 막지 않는다).
 *
 * `entries`(2026-08-15 개정)는 examId ↔ 그 기출로 만들어진 지문함 지문 id 의 대응이다.
 * 「담음」이 학원 전역 판정이라 **클래스를 고른 상태에서도 그 클래스에 없는 기출까지
 * 담긴 것처럼 보이던 결함**(사용자 보고)을 고치려면 호스트가 클래스 등록 집합
 * (passageId)과 교집합을 내야 하는데, examId 만으로는 그 교집합을 낼 수 없다.
 * 한 기출이 지문함에 두 번 이상 들어가 있을 수 있으므로 대응은 1:N 이다.
 */
export async function listImportedExamIds(): Promise<{
  success: boolean;
  examIds: string[];
  entries: { examId: string; passageId: string }[];
}> {
  try {
    const staff = await requireAuth();
    const rows = await prisma.passage.findMany({
      where: {
        academyId: staff.academyId,
        tags: { contains: KICE_TAG_PREFIX },
      },
      select: { id: true, tags: true },
    });
    const examIds = new Set<string>();
    const entries: { examId: string; passageId: string }[] = [];
    for (const row of rows) {
      if (!row.tags) continue;
      try {
        const parsed = JSON.parse(row.tags);
        if (Array.isArray(parsed)) {
          for (const t of parsed) {
            if (typeof t === "string" && t.startsWith(KICE_TAG_PREFIX)) {
              const examId = t.slice(KICE_TAG_PREFIX.length);
              examIds.add(examId);
              entries.push({ examId, passageId: row.id });
            }
          }
        }
      } catch {
        /* 비정상 tags 는 무시 */
      }
    }
    return { success: true, examIds: Array.from(examIds), entries };
  } catch (err) {
    console.error("[listImportedExamIds] failed", err);
    return { success: false, examIds: [], entries: [] };
  }
}
