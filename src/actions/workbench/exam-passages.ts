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
 * 접두 비교용 정규화 — 곱슬 따옴표→직선, 대시류(em/en/horizontal bar/figure dash/minus)→'-',
 * 공백 접기. 비교 전용이며 저장 본문은 원문 그대로 둔다(타이포그래피 보존).
 */
function squashForPrefix(s: string): string {
  return s
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u2014\u2015\u2012\u2013\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

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
  /**
   * 요청한 기출 지문 id → Passage.id(기존 재사용 + 이번 신규 모두, 요청분만 — §11.4-6).
   * 문항 반입(exam-questions.ts)이 지문 행을 찾으려고 `kice:` 전량을 다시 스캔하던 왕복을
   * 없애기 위한 additive 필드. 실패 응답에서는 빈 객체.
   */
  passageIdByExamId: Record<string, string>;
  /**
   * 요청한 기출 지문 id → 그 기출로 만들어진 Passage.id **전량**(한 기출이 지문함에 두 번 이상
   * 들어가 있을 수 있어 1:N). `passageIdByExamId` 는 이 배열의 첫 원소(createdAt 오름차순 =
   * 가장 오래된 사본)로 결정론이며, 문항 반입이 기존 gichul 문항을 찾을 땐 사본 전량을 봐야
   * 다른 사본에 붙은 문항을 놓치지 않는다. 실패 응답에서는 빈 객체.
   */
  passageIdsByExamId: Record<string, string[]>;
}

/** importExamPassages 옵션(additive — 생략 시 기존 동작 그대로). */
export interface ImportExamPassagesOptions {
  /**
   * 재담기 시 기존 Passage.createdAt 을 지금으로 올리는 2026-08-11 정책(지문함 최신순 끌어올림)의
   * opt-out. 시험지 조판 픽 경로(§11.4-6)는 지문함 정렬을 흔들면 안 되므로 false 로 부른다.
   * 기본 true = 지문 담기 경로 무회귀.
   */
  touchCreatedAt?: boolean;
  /**
   * false 면 revalidatePath 2벌을 생략한다(§11.4-6c). 조판 픽은 로컬 상태로 충분하고,
   * revalidate 는 서버 액션 직렬 큐 위에서 RSC 리프레시를 유발해 랙의 한 축이었다.
   */
  revalidate?: boolean;
}

export async function importExamPassages(
  examPassageIds: string[],
  /**
   * 본문 대체(additive, 기출 문항 은행 전용): 코퍼스 본문이 절단된 지문은 원형(PDF)
   * 복원본으로 만든다. 키 = 코퍼스 지문 id. 이미 등록된 지문에는 적용하지 않는다(멱등 보호).
   */
  contentOverrides?: Record<string, string>,
  options?: ImportExamPassagesOptions,
): Promise<ImportExamPassagesResult> {
  const touchCreatedAt = options?.touchCreatedAt ?? true;
  const shouldRevalidate = options?.revalidate ?? true;
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
        passageIdByExamId: {},
        passageIdsByExamId: {},
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
        passageIdByExamId: {},
        passageIdsByExamId: {},
      };
    }

    // 2) 멱등 — 이미 등록된 기출(tags 에 kice:<id>) 조회 후 제외.
    //    examId → 기존 Passage id 맵도 함께 만든다(클래스 자동 담기 §3.8.3).
    //    orderBy 없는 findMany 는 순서가 계획기 마음이라, 한 기출이 지문함에 여러 번 있을 때
    //    「대표 1개」가 호출마다 달라져 클래스 링크·본문 보강이 다른 사본을 집었다 → createdAt
    //    오름차순으로 못 박아 대표 = 가장 오래된 사본으로 결정론화한다.
    const existing = await prisma.passage.findMany({
      where: { academyId, tags: { contains: KICE_TAG_PREFIX } },
      select: { id: true, tags: true },
      orderBy: { createdAt: "asc" },
    });
    const alreadyImported = new Set<string>();
    const passageIdByExamId = new Map<string, string>();
    const passageIdsByExamId = new Map<string, string[]>();
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
              const copies = passageIdsByExamId.get(examId);
              if (copies) {
                if (!copies.includes(row.id)) copies.push(row.id);
              } else {
                passageIdsByExamId.set(examId, [row.id]);
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

    // 반환용 요청분 맵(기존 행) — 신규 행은 트랜잭션 뒤에 합친다. 학원 전량 맵을
    // 그대로 돌려주지 않는 이유: 요청하지 않은 지문의 id 까지 클라이언트로 흘릴 필요가 없다.
    const resultPassageIdByExamId: Record<string, string> = {};
    const resultPassageIdsByExamId: Record<string, string[]> = {};
    for (const examId of skippedExamIds) {
      const pid = passageIdByExamId.get(examId);
      if (pid) resultPassageIdByExamId[examId] = pid;
      const copies = passageIdsByExamId.get(examId);
      if (copies?.length) resultPassageIdsByExamId[examId] = [...copies];
    }

    // 재담기 정책(2026-08-11 사용자 지시): 이미 담긴 기출을 다시 담으면 중복
    // 생성 없이 「담은 날짜」만 최신화한다 — 지문함의 표시 날짜·최신순 정렬
    // 정본이 createdAt 이므로(use-passage-library 정렬 계약) createdAt 을 지금
    // 시각으로 올려 목록 맨 앞으로 끌어올린다. 연결(클래스·생성물·분석)은
    // 전부 그대로 유지된다.
    // 이 정책은 「지문 담기」 전용 — 조판 픽 경로(touchCreatedAt:false)는 건너뛴다(§11.4-6).
    if (touchCreatedAt && existingIds.length > 0) {
      await prisma.passage.updateMany({
        where: { id: { in: existingIds }, academyId },
        data: { createdAt: new Date() },
      });
    }

    // 기존 행 본문 보강(기출 문항 은행 전용): 이미 등록된 지문의 content 가 대체본(원형 복원)의
    // **접두**이면 — 즉 코퍼스 절단본으로 등록돼 있으면 — 대체본으로 늘린다. 내용이 다르면(사용자
    // 편집 등) 건드리지 않는다. 문항·클래스 연결은 그대로.
    // 접두 비교는 정규화(squashForPrefix) 위에서 한다 — 코퍼스는 곱슬 따옴표(“ ” ‘ ’)·em dash,
    // PDF 복원본은 직선 따옴표·hyphen 이라 공백만 접어서는 실데이터 7건 전부 startsWith 가
    // 거짓이었다(26-09-08 실측: raw 0/7 → 정규화 7/7). 갱신 시 연결된 M1 draft(raw/restored/
    // teacherText)도 같은 본문으로 맞춘다 — draft 가 절단본으로 남으면 재추출·복원 경로가
    // 옛 본문을 되살린다.
    if (contentOverrides && skippedExamIds.length > 0) {
      const targets = skippedExamIds
        .map((examId) => ({ examId, passageId: passageIdByExamId.get(examId), override: contentOverrides[examId] }))
        .filter((t): t is { examId: string; passageId: string; override: string } =>
          Boolean(t.passageId) && typeof t.override === "string" && t.override.trim().length > 0,
        );
      if (targets.length > 0) {
        const rows = await prisma.passage.findMany({
          where: { id: { in: targets.map((t) => t.passageId) }, academyId },
          select: { id: true, content: true },
        });
        for (const t of targets) {
          const row = rows.find((r) => r.id === t.passageId);
          if (!row) continue;
          const cur = squashForPrefix(row.content ?? "");
          const next = squashForPrefix(t.override);
          if (cur.length > 0 && next.length > cur.length && next.startsWith(cur)) {
            const content = t.override.trim();
            await prisma.$transaction([
              prisma.passage.update({ where: { id: row.id }, data: { content } }),
              prisma.extractionM1PassageDraft.updateMany({
                where: { savedPassageId: row.id, deletedAt: null },
                data: { rawText: content, restoredText: content, teacherText: content },
              }),
            ]);
          }
        }
      }
    }

    if (toCreate.length === 0) {
      return {
        success: true,
        createdIds: [],
        skippedExamIds,
        existingIds,
        passageIdByExamId: resultPassageIdByExamId,
        passageIdsByExamId: resultPassageIdsByExamId,
      };
    }

    // 3) 한 트랜잭션에서 공유 버킷 find-or-create + 순차 등록(P2002 경합 시 재시도).
    // 트랜잭션은 재시도될 수 있으므로 examId → 신규 Passage.id 대응은 반환값으로 받는다
    // (클로저에 누적하면 P2002 재시도 때 롤백된 id 가 섞인다).
    const createdEntries = await runWithUniqueRetry(() =>
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

        const made: { examId: string; passageId: string }[] = [];
        for (const r of toCreate) {
          const title = formatExamTitle(r);
          const override = contentOverrides?.[r.id];
          const content = (typeof override === "string" && override.trim().length > 0 ? override : r.text).trim();
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

          made.push({ examId: r.id, passageId: passage.id });
          nextOrder += 1;
        }
        return made;
      },
        // 문항 트랜잭션(exam-questions.ts)과 동일 — 직렬 액션 큐 뒤에서 커넥션을 기다리다
        // 기본 maxWait 2s 에 걸리면 지문 쪽만 먼저 죽어 문항 반입 전체가 실패 응답이 된다.
        { maxWait: 10_000, timeout: 60_000 },
      ),
    );

    const createdIds = createdEntries.map((e) => e.passageId);
    for (const e of createdEntries) {
      resultPassageIdByExamId[e.examId] = e.passageId;
      resultPassageIdsByExamId[e.examId] = [e.passageId];
    }

    if (shouldRevalidate) {
      revalidatePath("/director/workbench/passages");
      revalidatePath("/director/workbench/questions/generate");
    }

    return {
      success: true,
      createdIds,
      skippedExamIds,
      existingIds,
      passageIdByExamId: resultPassageIdByExamId,
      passageIdsByExamId: resultPassageIdsByExamId,
    };
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
      passageIdByExamId: {},
      passageIdsByExamId: {},
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
