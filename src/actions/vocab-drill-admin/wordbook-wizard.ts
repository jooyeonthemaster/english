"use server";

// ============================================================================
// 단어장 만들기 위저드 — 서버 액션 3종
//
// planWordbookAction   플랜 미리보기(스텝3·5) + 라이브 카운트(countOnly, 스텝2)
// createWordbookSeriesAction  플랜 확정 → 단계 덱 N개를 한 트랜잭션으로 생성
// sendWordbookSeriesAction    교재 전체를 학생에게 일괄 발송(1단계 즉시, 이후 자동)
//
// 확정 스펙: docs/wordbook-wizard-spec.md(§11 이 발송 정본). 반환 봉투는 decks.ts 동형.
// ============================================================================

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import {
  expandTargets,
  STUDY_ASSIGNMENT_PATHS,
} from "@/actions/study-assignments/_shared";
import { GRADED_ITEM_TYPES } from "@/lib/vocab-drill/constants";
import type { VocabDeckActionResult } from "./decks";
import { sanitizePlanInput, strs } from "./wordbook-wizard-sanitize";
import {
  sanitizeVocabDeckSeries,
  SERIES_TOTAL_WORDS_MAX,
  SERIES_UNITS_MAX,
  type VocabDeckSeriesMeta,
  type VocabDeckSpec,
} from "@/lib/vocab-drill/payload";
import {
  buildWordbookPlan,
  countWordbookMatches,
} from "@/lib/vocab-drill/wordbook-plan";
import {
  clampWordsPerDay,
  normalizeStudyDays,
  nthStudyDate,
  PLAN_UNITS_MAX,
  todayKstDate,
  type WordbookPlan,
  type WordbookPlanInput,
} from "@/lib/vocab-drill/wordbook-plan-types";

// ── 플랜 ─────────────────────────────────────────────────────────────────────

export async function planWordbookAction(
  input: WordbookPlanInput & { countOnly?: boolean },
): Promise<VocabDeckActionResult<WordbookPlan | { totalMatched: number }>> {
  try {
    await requireStaffAuth();
    const clean = sanitizePlanInput(input);
    if (input.countOnly) {
      const totalMatched = clean.sourceSenseIds?.length
        ? clean.sourceSenseIds.length
        : await countWordbookMatches(clean.base);
      return { success: true, data: { totalMatched } };
    }
    // 클라 숫자를 믿지 않는다(§8-7) — 단계 수 상한도 서버에서 다시 건다.
    // (액션 직접 호출로 units 500개짜리 플랜을 계산시키는 길을 막는다.)
    if (
      Math.ceil(clean.size / clean.wordsPerDay) > PLAN_UNITS_MAX &&
      !clean.sourceSenseIds?.length
    ) {
      clean.wordsPerDay = clampWordsPerDay(Math.ceil(clean.size / PLAN_UNITS_MAX));
    }
    const plan = await buildWordbookPlan(clean);
    return { success: true, data: plan };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error && error.message
          ? error.message
          : "단어장 구성을 계산하지 못했습니다.",
    };
  }
}

// ── 생성 ─────────────────────────────────────────────────────────────────────

export async function createWordbookSeriesAction(input: {
  title: string;
  subtitle?: string;
  curriculum?: string;
  units: { title: string; senseIds: string[] }[];
  schedule: { wordsPerDay: number; studyDays: number[]; totalDays: number };
}): Promise<
  VocabDeckActionResult<{ seriesKey: string; deckIds: string[]; totalWords: number }>
> {
  try {
    const staff = await requireStaffAuth();
    // 80자 = 입력 UI(maxLength)·스펙·sanitizeVocabDeckSeries 공통 계약.
    // 60으로 잘랐더니 성공 화면 제목과 실제 덱 제목이 갈렸다(적대검수 2026-08-10).
    const title = (input.title ?? "").trim().slice(0, 80);
    if (!title) return { success: false, error: "단어장 이름을 입력해 주세요." };
    const subtitle = (input.subtitle ?? "").trim().slice(0, 120) || null;

    const units = Array.isArray(input.units) ? input.units : [];
    if (!units.length || units.length > SERIES_UNITS_MAX) {
      return { success: false, error: `단계 수는 1~${SERIES_UNITS_MAX}개여야 합니다.` };
    }
    const unitIdLists = units.map((u) => strs(u?.senseIds, null, 500));
    if (unitIdLists.some((ids) => ids.length === 0)) {
      return { success: false, error: "비어 있는 단계가 있습니다. 구성을 다시 확인해 주세요." };
    }
    const allIds = unitIdLists.flat();
    const uniqueIds = [...new Set(allIds)];
    if (uniqueIds.length !== allIds.length) {
      return { success: false, error: "단계 사이에 겹치는 단어가 있습니다. 구성을 다시 만들어 주세요." };
    }
    if (allIds.length > SERIES_TOTAL_WORDS_MAX) {
      return { success: false, error: `단어장은 최대 ${SERIES_TOTAL_WORDS_MAX.toLocaleString()}단어까지 만들 수 있습니다.` };
    }
    // 실존·활성 검증 — 유령 senseId 가 덱에 실리면 학생 큐가 조용히 빈다.
    const liveCount = await prisma.vocabDrillSense.count({
      where: { id: { in: uniqueIds }, retiredAt: null },
    });
    if (liveCount !== uniqueIds.length) {
      return {
        success: false,
        error: "구성에 더 이상 제공되지 않는 단어가 섞여 있습니다. 구성을 새로 계산해 주세요.",
      };
    }

    const seriesKey = `wb_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const wordsPerDay = clampWordsPerDay(Number(input.schedule?.wordsPerDay));
    const studyDays = normalizeStudyDays({ studyDays: input.schedule?.studyDays });
    // 학습일 수 = 단계 수(스펙 정의). 클라가 보낸 값은 참고만 하고 실제 단계 수로
    // 굳힌다 — 어긋난 값이 저장되면 교재 카드·발송 리듬이 서로 다른 기간을 말한다.
    const schedule = {
      wordsPerDay,
      daysPerWeek: studyDays.length,
      studyDays,
      totalDays: units.length,
    } as const;
    const curriculum =
      typeof input.curriculum === "string" && input.curriculum.trim()
        ? input.curriculum.trim().slice(0, 40)
        : undefined;

    // 단계 덱은 서로 참조가 없다 — 60회 순차 INSERT 대신 한 번에 넣는다.
    // (인터랙티브 트랜잭션 기본 5초 상한에서 60왕복은 P2028 로 전량 롤백된다 —
    //  형제 경로 study-assignments/mutations.ts 가 같은 이유로 20초를 명시해 둔 곳이다.)
    const rows = units.map((_, i) => {
      const senseIds = unitIdLists[i];
      const seriesMeta: VocabDeckSeriesMeta = {
        key: seriesKey,
        title,
        index: i + 1,
        total: units.length,
        ...(curriculum ? { curriculum } : {}),
        schedule: { ...schedule },
      };
      // sanitize 왕복으로 형상 보증 — 여기서 떨어지면 코드 결함이므로 즉시 중단.
      if (!sanitizeVocabDeckSeries(seriesMeta)) {
        throw new Error("교재 정보 구성에 실패했습니다.");
      }
      const spec: VocabDeckSpec = {
        senseIds,
        limit: senseIds.length, // 명시 목록 덱의 limit = 목록 길이(스펙 §8-2)
        series: seriesMeta,
      };
      return {
        academyId: staff.academyId,
        scope: "ACADEMY",
        title: `${title} · ${i + 1}단계`,
        subtitle,
        spec: spec as object,
        senseCountCache: senseIds.length,
        orderIndex: 1000 + i,
        status: "ACTIVE",
        createdById: staff.id,
      };
    });
    const created = await prisma.vocabDrillDeck.createManyAndReturn({
      data: rows,
      select: { id: true, spec: true },
    });
    // createManyAndReturn 의 반환 순서를 믿지 않고 series.index 로 정렬해 1단계를
    // 확정한다(성공 화면의 「1단계만 먼저 보내기」가 이 순서에 의존한다).
    const deckIds = created
      .map((d) => ({
        id: d.id,
        index: sanitizeVocabDeckSeries((d.spec as { series?: unknown } | null)?.series)?.index ?? 0,
      }))
      .sort((a, b) => a.index - b.index)
      .map((d) => d.id);

    return {
      success: true,
      data: { seriesKey, deckIds, totalWords: allIds.length },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error && error.message
          ? error.message
          : "단어장을 만들지 못했습니다.",
    };
  }
}

// ── 학생에게 보내기 (교재 전체 일괄 발송) ────────────────────────────────────
//
// 예전 "예약 배포"(단계마다 createStudyAssignment 를 호출 — 50단계면 50회 왕복,
// 유닛당 인증·대상 전개·풀 집계·트랜잭션·revalidate 가 반복돼 수십 초)가 느리고
// 개념도 낯설다는 실사용 피드백으로 전면 교체(스펙 §11).
//
// 지금 구조: 검증은 **한 번만**, 쓰기는 **한 트랜잭션**(과제 N + 태스크 N×M +
// 브리지 N×M 을 createMany 로). 1단계는 즉시 열리고 다음 단계부터 학습일마다
// 자동으로 열린다(availableFrom 시차 — 큐가 실제로 강제하는 유일한 시간 축).
// 마감은 붙이지 않는다(밀린 단계를 따라잡는 것이 교재의 정상 사용 — §10-5).
//
// 3층 쓰기 형상은 createStudyAssignment 의 VOCAB 분기(mutations.ts:400-455)와
// 동일해야 한다 — 태스크 없는 껍데기 과제·브리지 없는 태스크가 생기면 학생
// 큐가 조용히 빈다. 형상을 바꿀 땐 반드시 그쪽과 나란히 고칠 것.

export interface SendWordbookSeriesResult {
  /** 만들어진 과제 수(= 단계 수) */
  created: number;
  /** 학생 수 × 단계 수 (태스크 수) */
  taskCount: number;
  totalUnits: number;
  /** 1단계가 열리는 날 — startDate 가 오늘이면 "today" */
  firstOpen: "today" | string;
  /** 마지막 단계가 열리는 날("YYYY-MM-DD") */
  lastOpen: string;
}

/** 한 번에 쓰는 행 상한 — 과제 + 태스크 + 브리지 합산. 60단계 × 30명 ≈ 3,660행. */
const SERIES_SEND_MAX_ROWS = 8_000;

export async function sendWordbookSeriesAction(input: {
  seriesKey: string;
  targets: { type: "STUDENT" | "CLASS"; id: string }[];
  /** "YYYY-MM-DD" (KST). 미지정 = 오늘(1단계 즉시 시작) */
  startDate?: string;
  itemTypes?: string[];
  /** 단계당 문항 수 — 미지정 = 단계 단어 수만큼(5..100 클램프) */
  countPerUnit?: number;
}): Promise<VocabDeckActionResult<SendWordbookSeriesResult>> {
  try {
    const staff = await requireStaffAuth();
    const seriesKey = (input.seriesKey ?? "").trim();
    if (!seriesKey) return { success: false, error: "교재를 찾을 수 없습니다." };

    // 대상 전개 — 기존 배포와 같은 가드(반 전개·타학원·휴원 거부)를 한 번만 탄다.
    const rawTargets = Array.isArray(input.targets)
      ? input.targets.filter(
          (t): t is { type: "STUDENT" | "CLASS"; id: string } =>
            !!t &&
            (t.type === "STUDENT" || t.type === "CLASS") &&
            typeof t.id === "string" &&
            !!t.id,
        )
      : [];
    if (!rawTargets.length) {
      return { success: false, error: "받을 학생을 한 명 이상 골라 주세요." };
    }
    const expanded = await expandTargets(staff.academyId, rawTargets);
    if ("error" in expanded) return { success: false, error: expanded.error };
    if (!expanded.studentIds.length) {
      return { success: false, error: "선택한 반에 재원 중인 학생이 없습니다." };
    }

    const today = todayKstDate();
    const startDate = input.startDate ?? today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return { success: false, error: "시작일이 올바르지 않습니다." };
    }
    if (startDate < today) {
      return { success: false, error: "시작일은 오늘부터 고를 수 있습니다." };
    }

    // 교재 단계 로드 — seriesKey 로 좁혀 읽는다.
    const decksRaw = await prisma.vocabDrillDeck.findMany({
      where: {
        academyId: staff.academyId,
        status: "ACTIVE",
        spec: { path: ["series", "key"], equals: seriesKey },
      },
      select: { id: true, title: true, senseCountCache: true, spec: true },
    });
    const units = decksRaw
      .map((d) => ({
        ...d,
        series: sanitizeVocabDeckSeries(
          (d.spec as { series?: unknown } | null)?.series,
        ),
      }))
      .filter(
        (d): d is typeof d & { series: VocabDeckSeriesMeta } =>
          !!d.series && d.series.key === seriesKey,
      )
      .sort((a, b) => a.series.index - b.series.index);
    if (!units.length) {
      return { success: false, error: "교재를 찾을 수 없습니다(보관됐거나 삭제됨)." };
    }

    const students = expanded.studentIds;
    const totalRows = units.length * (1 + 2 * students.length);
    if (totalRows > SERIES_SEND_MAX_ROWS) {
      return {
        success: false,
        error: `학생 ${students.length}명 × ${units.length}단계는 한 번에 보낼 수 없습니다. 반을 나누어 보내 주세요.`,
      };
    }

    const studyDays = normalizeStudyDays(units[0].series.schedule ?? {});
    const itemTypes = [
      ...new Set(
        strs(input.itemTypes, null, 8).filter((t) =>
          (GRADED_ITEM_TYPES as readonly string[]).includes(t),
        ),
      ),
    ];
    const manualCount =
      Number.isFinite(Number(input.countPerUnit)) && Number(input.countPerUnit) > 0
        ? Math.max(5, Math.min(100, Math.trunc(Number(input.countPerUnit))))
        : null;

    // 풀 정합 — 단계 덱은 명시 senseIds 라 은퇴만 걸러내면 실서빙 풀과 같다.
    // (mutations 의 assignmentPoolSize 를 단계마다 부르면 그게 곧 예전 느림의
    //  원인이다 — 전 단계 id 를 모아 은퇴분 1질의로 동등 판정.)
    const specOf = (u: (typeof units)[number]) =>
      (u.spec as VocabDeckSpec | null) ?? {};
    const allSenseIds = [
      ...new Set(units.flatMap((u) => specOf(u).senseIds ?? [])),
    ];
    const retired = allSenseIds.length
      ? await prisma.vocabDrillSense.findMany({
          where: { id: { in: allSenseIds }, retiredAt: { not: null } },
          select: { id: true },
        })
      : [];
    const retiredSet = new Set(retired.map((r) => r.id));

    // 단계별 과제 행 구성 — 열리는 날은 **활성 단계 순번** 기준(보관 구멍 무시).
    const now = new Date();
    const perUnit = units.map((u, i) => {
      const openDate = nthStudyDate(startDate, i + 1, studyDays);
      const live =
        (specOf(u).senseIds ?? []).filter((id) => !retiredSet.has(id)).length ||
        u.senseCountCache ||
        20;
      const count = Math.min(manualCount ?? Math.min(live, 100), Math.max(5, live));
      const payload = {
        deckIds: [u.id],
        count: Math.max(1, count),
        ...(itemTypes.length ? { itemTypes } : {}),
      };
      return {
        deckId: u.id,
        title: u.title,
        openDate,
        availableFrom:
          openDate === today ? now : new Date(`${openDate}T00:00:00+09:00`),
        payload,
      };
    });

    // 3층 일괄 쓰기 — 한 트랜잭션. 실패하면 전부 롤백(부분 배포 없음).
    await prisma.$transaction(
      async (tx) => {
        const createdAssignments = await tx.studyAssignment.createManyAndReturn({
          data: perUnit.map((u) => ({
            academyId: staff.academyId,
            createdById: staff.id,
            kind: "VOCAB",
            payload: u.payload as unknown as Prisma.InputJsonValue,
            title: u.title,
            availableFrom: u.availableFrom,
            dueAt: null,
            targets: expanded.snapshots as unknown as Prisma.InputJsonValue,
            targetSummary: expanded.summary,
          })),
          select: { id: true, payload: true },
        });
        // 반환 순서를 믿지 않는다 — payload.deckIds[0] 가 단계당 유일키다.
        const assignmentByDeck = new Map<string, string>();
        for (const a of createdAssignments) {
          const deckId = (a.payload as { deckIds?: string[] })?.deckIds?.[0];
          if (deckId) assignmentByDeck.set(deckId, a.id);
        }
        if (assignmentByDeck.size !== perUnit.length) {
          throw new Error("과제 생성 결과가 단계 수와 다릅니다.");
        }
        const taskRows = perUnit.flatMap((u) =>
          students.map((studentId) => ({
            academyId: staff.academyId,
            assignmentId: assignmentByDeck.get(u.deckId) as string,
            studentId,
          })),
        );
        const createdTasks = await tx.studyAssignmentTask.createManyAndReturn({
          data: taskRows,
          select: { id: true, assignmentId: true, studentId: true },
        });
        const payloadByAssignment = new Map(
          perUnit.map((u) => [
            assignmentByDeck.get(u.deckId) as string,
            { title: u.title, payload: u.payload },
          ]),
        );
        await tx.vocabDrillAssignment.createMany({
          data: createdTasks.map((task) => {
            const meta = payloadByAssignment.get(task.assignmentId ?? "");
            if (!meta) throw new Error("태스크-과제 매핑이 어긋났습니다.");
            return {
              academyId: staff.academyId,
              studentId: task.studentId,
              staffId: staff.id,
              taskId: task.id,
              assignmentId: task.assignmentId,
              title: meta.title,
              note: null,
              spec: meta.payload as unknown as Prisma.InputJsonValue,
              status: "ASSIGNED",
            };
          }),
        });
      },
      { timeout: 20_000 },
    );

    for (const p of STUDY_ASSIGNMENT_PATHS) revalidatePath(p, "layout");

    return {
      success: true,
      data: {
        created: perUnit.length,
        taskCount: perUnit.length * students.length,
        totalUnits: units.length,
        firstOpen: perUnit[0].openDate === today ? "today" : perUnit[0].openDate,
        lastOpen: perUnit[perUnit.length - 1].openDate,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error && error.message
          ? error.message
          : "학생에게 보내지 못했습니다.",
    };
  }
}
