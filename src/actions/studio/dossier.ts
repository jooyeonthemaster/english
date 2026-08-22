"use server";

// ============================================================================
// 클래스 스튜디오 — 지문 도시에 서버 액션 (docs/class-studio-spec.md §3.9.4)
//
// 지문 1개를 축으로 분석 상태·생성 문제·배정 현황(클래스/학생별 학습 상태)을
// 한 번에 내려준다. 공유 타입 정본은 src/lib/studio/dossier-types.ts — 우측
// 패널(passage-dossier-pane)과 이 파일이 그 형태 하나에 맞춘다.
//
// 질의 상한(§3.9.6 — payload 표현식 인덱스 부재, 전부 academyId(+createdAt)
// 커버 안에서 LIMIT): WORKSHEET 역조회 raw SQL LIMIT 30(passages.ts:685-693
// 계보 — classId 술어 제거) · QUESTIONS 역조회 = 최근 200 스캔 후 JS 교집합
// (역조회 키 부재는 v1 수용 — payload 스탬프는 v2) · 문제 슬림 select 방어 상한
// 1000(행 목록은 최신 50) · 태스크·상태 질의는 전부 「채택된 과제 id in」 한정
// · 프리미엄 판정 = 문항 tags 의 플랜 태그 우선, 플랜 태그 없는 구세대 행만
//   PREMIUM 잡 역교집합 폴백 — 폴백용 잡 역조회(result.questionIds ∩ 행 id)는
//   passageId 인덱스 커버 최근 100 take 존치(§3.10.11-e).
//
// 성능 함정:
//   · getWorksheetStudyOverview 호출 금지(§3.9.4-8) — 과제 1건당 4질의 폭발.
//     학생별 정답률은 worksheetStudyState.stageStates 를 computeStudyMastery 로
//     직접 재계산한다(첫 시도 정본 — masteryPct 스냅샷 금지, worksheet-study-spec §5.1).
//   · avgFirstTryPct 는 avgFirstTryPctByAssignment 정본 배치(deploy.ts:373-381
//     패턴). 내부적으로 worksheetStudyState 를 한 번 더 읽지만 정본 단일화 우선
//     — 값 분기 사고가 중복 질의 1회보다 비싸다.
//
// 실패 계약(§3.9.6 — 부분 실패를 빈 배열로 삼키지 않는다):
//   · data === null + error = 전체 실패(스코프 불일치는 error 없이 data null)
//   · data !== null + error = 배정 현황 파이프라인만 실패 — 패널은 배정 섹션을
//     SectionError 로 그리고 나머지 섹션은 정상 렌더한다.
// ============================================================================

import { Prisma } from "@prisma/client";
import {
  PRIME_REPORT_MARKER,
  PRIME_REPORT_MARKERS,
} from "@/actions/workbench/passage-constants";
import type { QuestionCardItem } from "@/components/workbench/question-card-types";
import { requireStaffAuth } from "@/lib/auth";
import { QUESTION_SUBTYPES, QUESTION_TYPES } from "@/lib/constants";
import { parseAnalysisReportForPreview } from "@/lib/passage-report/analysis-report/preview-parse";
import { hasWorksheetContentFields } from "@/lib/passage-report/analysis-report/worksheet-core-gate";
import { hashContent } from "@/lib/passage-utils";
import { prisma } from "@/lib/prisma";
import { getQuestionGenerationPlanFromTags } from "@/lib/question-generation-plans";
import type {
  DossierAssignment,
  DossierQuestionRow,
  DossierQuestionTypeCount,
  DossierStudentRow,
  PassageDossier,
} from "@/lib/studio/dossier-types";
import { isSectionKind, moduleSectionStates } from "@/lib/studio/module-sections";
import { isStudioModuleId, type StudioModuleId } from "@/lib/studio/modules";
import { avgFirstTryPctByAssignment } from "@/lib/studio/stats";
import { computeStudyMastery } from "@/lib/worksheet-study/grade";

// ── 유형 한글 라벨 (constants.ts 단일 소스 평탄화 — exam-scoring/boost.ts 계보) ──

const SUBTYPE_LABEL: Record<string, string> = {};
for (const list of Object.values(QUESTION_SUBTYPES)) {
  for (const item of list) SUBTYPE_LABEL[item.value] = item.label;
}
const TYPE_LABEL: Record<string, string> = {};
for (const item of QUESTION_TYPES) TYPE_LABEL[item.value] = item.label;

/** subType 우선 → type → 원문 폴백 (boost.ts:271-272 우선순위 미러). */
function questionTypeLabel(type: string, subType: string | null): string {
  return (subType ? SUBTYPE_LABEL[subType] : undefined) ?? TYPE_LABEL[type] ?? type;
}

/** 문두 1줄 절단본(~120자) — 개행·연속 공백을 접고 넘치면 말줄임. */
function truncateStem(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 120 ? `${oneLine.slice(0, 120)}…` : oneLine;
}

/**
 * Question.tags(JSON 문자열)를 string[] 로 안전 파싱 — 플랜 태그 해석 정본
 * getQuestionGenerationPlanFromTags 의 입력 재료. 라이브러리의 원문 파서
 * (readQuestionTags)는 비공개라 파일 내 최소 관용구로 구현(자유형 방어 동일).
 */
function parseTagList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

/** StudyAssignmentTask.status 방어 매핑 — 알 수 없는 값은 대기로 접는다. */
function taskStatusOf(v: string): DossierStudentRow["status"] {
  return v === "DONE" || v === "IN_PROGRESS" ? v : "ASSIGNED";
}

/**
 * QUESTIONS 학생별 정답률 — task.responses 정오 집계.
 * 판정식은 문항별 통계 정본(study-assignments/stats.ts:127) 미러:
 * status = manualStatus ?? result?.status, CORRECT 만 정답, attempted = input 존재.
 * attempted 0 이면 null(미응시). 소수 1자리.
 */
function questionsScorePct(responses: unknown): number | null {
  if (!Array.isArray(responses)) return null;
  let attempted = 0;
  let correct = 0;
  for (const entry of responses) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const r = entry as {
      input?: unknown;
      manualStatus?: unknown;
      result?: { status?: unknown } | null;
    };
    // correct ⊆ attempted 보장 — 수동 CORRECT 라도 input 없는 응답은 미응시 취급(정답률 100% 초과 방지).
    if (r.input ?? null) {
      attempted += 1;
      const status = r.manualStatus ?? r.result?.status ?? null;
      if (status === "CORRECT") correct += 1;
    }
  }
  return attempted > 0 ? Math.round((correct / attempted) * 1000) / 10 : null;
}

/** WORKSHEET 학생별 정답률 — stageStates 재계산(첫 시도 정본, 스냅샷 금지). */
function worksheetFirstTryPct(stageStates: unknown): number | null {
  const raw =
    stageStates && typeof stageStates === "object" && !Array.isArray(stageStates)
      ? (stageStates as Parameters<typeof computeStudyMastery>[0])
      : {};
  return computeStudyMastery(raw).firstTryPct;
}

// ── ① 지문 도시에 본조회 ─────────────────────────────────────────────────────

export async function getStudioPassageDossier(input: {
  passageId: string;
}): Promise<{ data: PassageDossier | null; error?: string }> {
  try {
    const staff = await requireStaffAuth();
    const passageId = typeof input.passageId === "string" ? input.passageId : "";
    if (!passageId) return { data: null, error: "지문 정보가 올바르지 않습니다." };

    // 1) 스코프 검증(academyId 불일치 = data null) + 신선도 해시 재료(content).
    const passage = await prisma.passage.findFirst({
      where: { id: passageId, academyId: staff.academyId },
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        analysis: { select: { contentHash: true } },
      },
    });
    if (!passage) return { data: null };

    // 2) 분석 상태 + 3) 문제 + 프리미엄 잡 + 4) 완성 학습지 — 독립 질의라 병렬.
    const [report, questionRows, premiumJobs, sheetRows] = await Promise.all([
      prisma.passageReport.findFirst({
        where: {
          passageId,
          academyId: staff.academyId,
          generationPlan: PRIME_REPORT_MARKER,
          deletedAt: null,
        },
        orderBy: { updatedAt: "desc" },
        select: { pages: true, updatedAt: true },
      }),
      // 슬림 select — 방어 상한 1000(행 목록은 아래에서 50으로 자른다).
      // tags 는 프리미엄 판정 정본 재료(§3.10.11-e) — 1000행 × 짧은 태그 JSON 의
      // 페이로드 증가는 플랜 태그 정본화 대가로 수용.
      prisma.question.findMany({
        where: { passageId, academyId: staff.academyId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1000,
        select: {
          id: true,
          type: true,
          subType: true,
          difficulty: true,
          approved: true,
          questionText: true,
          tags: true,
          createdAt: true,
        },
      }),
      // 프리미엄 폴백 재료 — 판정 정본은 문항 tags 의 플랜 태그, 이 PREMIUM 잡
      // result.questionIds 역교집합은 플랜 태그 없는 구세대 행 전용 폴백
      // (§3.10.11-e). 이 질의만 실패해도 도시에 본체는 살린다 — catch 빈 배열
      // 강등(구세대 행 premium=false, 배정 파이프라인의 부분 실패 방어와 같은 계열).
      prisma.workbenchAiJob
        .findMany({
          where: {
            passageId,
            academyId: staff.academyId,
            domain: "QUESTION_GENERATION",
            generationPlan: "PREMIUM",
            deletedAt: null,
          },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: { result: true },
        })
        .catch(() => []),
      // 완성 학습지 행(§3.10.19 E19-6) — PRIME 계열 마커 전량(기본·국어·파이널).
      // ⚠ pages/theme select 금지(수 MB 급 — 위 report 질의는 파싱이 필요해 pages 를
      //   들지만 이 목록 질의는 배지 재료만 든다). take 10 = 지문당 마커 3종 여유분.
      //   이 질의만 실패해도 도시에 본체는 살린다(프리미엄 잡 폴백과 같은 계열).
      prisma.passageReport
        .findMany({
          where: {
            passageId,
            academyId: staff.academyId,
            generationPlan: { in: PRIME_REPORT_MARKERS },
            deletedAt: null,
          },
          orderBy: { updatedAt: "desc" },
          take: 10,
          select: {
            id: true,
            title: true,
            status: true,
            generationPlan: true,
            updatedAt: true,
          },
        })
        .catch(() => []),
    ]);

    // 신선도 술어는 getStudioPassageSectionStates(passages.ts:761-861)와 동일:
    // parseAnalysisReportForPreview 파싱 성공 = analyzed, hasExam 은 해시 무관
    // worksheet-grade 판정, presentSections 는 analysis.contentHash ===
    // hashContent(content) 일 때만(불일치 = stale, 보유 0 취급 — §3.4 정본).
    // passages.ts 는 수정 금지 파일이고 해당 액션은 lastAnalyzedAt 을 내리지
    // 않아 재사용 시 리포트 재질의가 한 번 더 필요하다 — 술어 동일 최소 재구현.
    let analyzed = false;
    let stale = false;
    let hasExam = false;
    let presentSections: string[] = [];
    let lastAnalyzedAt: string | null = null;
    if (report) {
      const parsed = parseAnalysisReportForPreview(report.pages);
      if (parsed) {
        analyzed = true;
        lastAnalyzedAt = report.updatedAt.toISOString();
        hasExam = parsed.sections.some((s) => hasWorksheetContentFields(s));
        if (passage.analysis?.contentHash === hashContent(passage.content)) {
          presentSections = parsed.sections.map((s) => s.kind).filter(isSectionKind);
        } else {
          stale = true;
        }
      }
    }
    // 보유 섹션 → 사용 가능 모듈(섹션 기반 6종 — exam 은 hasExam 별도 축).
    const readyModules: StudioModuleId[] = moduleSectionStates(new Set(presentSections))
      .filter((m) => m.ready)
      .map((m) => m.moduleId);

    // 문제 블록 — byType 은 라벨 축 집계(카운트 desc·라벨 ko 오름차순 타이브레이크).
    const typeCounts = new Map<string, number>();
    let approvedCount = 0;
    for (const q of questionRows) {
      const label = questionTypeLabel(q.type, q.subType);
      typeCounts.set(label, (typeCounts.get(label) ?? 0) + 1);
      if (q.approved) approvedCount += 1;
    }
    const byType: DossierQuestionTypeCount[] = [...typeCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko"));
    // 프리미엄 폴백 집합 — PREMIUM 잡 result.questionIds 합집합 ∩ 행 id. result 는
    // Json 자유형이라 string[] 원소만 안전 파싱(QUESTIONS payload 파싱 관용구).
    const premiumIds = new Set<string>();
    for (const job of premiumJobs) {
      const result = (job.result ?? {}) as { questionIds?: unknown };
      if (!Array.isArray(result.questionIds)) continue;
      for (const id of result.questionIds) {
        if (typeof id === "string") premiumIds.add(id);
      }
    }
    const rows: DossierQuestionRow[] = questionRows.slice(0, 50).map((q) => {
      // 플랜 태그 우선(상세 모달 QuestionCard 배지와 동일 정본 헬퍼) — 태그 없는
      // 구세대 행만 잡 역교집합 폴백(§3.10.11-e). STANDARD 태그 행은 폴백 미진입.
      const plan = getQuestionGenerationPlanFromTags(parseTagList(q.tags));
      return {
        id: q.id,
        type: q.type,
        subType: q.subType,
        difficulty: q.difficulty,
        approved: q.approved,
        premium: plan ? plan === "PREMIUM" : premiumIds.has(q.id),
        stem: truncateStem(q.questionText),
        createdAt: q.createdAt.toISOString(),
      };
    });

    // 4)~7) 배정 현황 파이프라인 — 실패해도 위 섹션은 살린다(§3.9.6 실패 계약).
    let assignments: DossierAssignment[] = [];
    let assignmentsError: string | undefined;
    try {
      const [stamped, recentQuestionKind] = await Promise.all([
        // WORKSHEET 역조회 — 정본 raw SQL(passages.ts:685-693 계보)에서 classId
        // 술어를 제거하고 classId 를 select 에 추가. LIMIT 30.
        prisma.$queryRaw<
          {
            id: string;
            title: string;
            createdAt: Date;
            dueAt: Date | null;
            modules: unknown;
            classId: string | null;
          }[]
        >(Prisma.sql`
          SELECT id, title, "createdAt", "dueAt",
                 payload->'studio'->'modules' AS modules,
                 payload->'studio'->>'classId' AS "classId"
          FROM "study_assignments"
          WHERE "academyId" = ${staff.academyId}
            AND kind = 'WORKSHEET'
            AND payload->'studio'->>'passageId' = ${passageId}
          ORDER BY "createdAt" DESC
          LIMIT 30`),
        // QUESTIONS 역조회 — academyId+createdAt 인덱스 커버 최근 200 스캔 후
        // JS 에서 payload.questionIds ∩ 이 지문 문항 id 교집합 > 0 만 채택.
        prisma.studyAssignment.findMany({
          where: { academyId: staff.academyId, kind: "QUESTIONS" },
          orderBy: { createdAt: "desc" },
          take: 200,
          select: { id: true, title: true, createdAt: true, dueAt: true, payload: true },
        }),
      ]);

      const passageQuestionIds = new Set(questionRows.map((q) => q.id));
      const adoptedQuestionKind = recentQuestionKind
        .map((a) => {
          const payload = (a.payload ?? {}) as { questionIds?: unknown };
          const snapshotIds = Array.isArray(payload.questionIds)
            ? payload.questionIds.filter((v): v is string => typeof v === "string")
            : [];
          const overlap = new Set(snapshotIds.filter((id) => passageQuestionIds.has(id)))
            .size;
          return { row: a, overlap };
        })
        .filter((x) => x.overlap > 0);

      const worksheetIds = stamped.map((s) => s.id);
      const allIds = [...worksheetIds, ...adoptedQuestionKind.map((x) => x.row.id)];

      if (allIds.length > 0) {
        const classIds = [
          ...new Set(
            stamped
              .map((s) => s.classId)
              .filter((v): v is string => typeof v === "string" && v.length > 0),
          ),
        ];
        // 6) 상태 집계 + 평균 + 7) 학생별 재료 — 전부 배치(Promise.all).
        const [classes, taskGroups, avgMap, taskRows, studyStates] = await Promise.all([
          classIds.length > 0
            ? prisma.class.findMany({
                where: { id: { in: classIds }, academyId: staff.academyId },
                select: { id: true, name: true },
              })
            : Promise.resolve([]),
          prisma.studyAssignmentTask.groupBy({
            by: ["assignmentId", "status"],
            where: { assignmentId: { in: allIds } },
            _count: { _all: true },
          }),
          // 평균 첫 시도 정답률 = stageStates 재계산 정본(스냅샷 평균 금지).
          avgFirstTryPctByAssignment(staff.academyId, worksheetIds),
          // 학생별 행 — responses 는 QUESTIONS 정오 집계 재료(WORKSHEET 는 null).
          prisma.studyAssignmentTask.findMany({
            where: { assignmentId: { in: allIds }, academyId: staff.academyId },
            select: {
              assignmentId: true,
              studentId: true,
              status: true,
              responses: true,
            },
          }),
          worksheetIds.length > 0
            ? prisma.worksheetStudyState.findMany({
                where: { academyId: staff.academyId, assignmentId: { in: worksheetIds } },
                select: { assignmentId: true, studentId: true, stageStates: true },
              })
            : Promise.resolve([]),
        ]);

        const classNameById = new Map(classes.map((c) => [c.id, c.name]));
        const countsById = new Map<
          string,
          { total: number; done: number; inProgress: number }
        >();
        for (const g of taskGroups) {
          const cur =
            countsById.get(g.assignmentId) ?? { total: 0, done: 0, inProgress: 0 };
          cur.total += g._count._all;
          if (g.status === "DONE") cur.done += g._count._all;
          if (g.status === "IN_PROGRESS") cur.inProgress += g._count._all;
          countsById.set(g.assignmentId, cur);
        }

        // 학생 이름 배치 — studentId 는 FK 없는 soft-ref, academyId 교차검증 후
        // 스코프 밖은 "(삭제된 학생)" 폴백(study-stats.ts:203-235 정본).
        const studentIds = [...new Set(taskRows.map((t) => t.studentId))];
        const students =
          studentIds.length > 0
            ? await prisma.student.findMany({
                where: { id: { in: studentIds }, academyId: staff.academyId },
                select: { id: true, name: true },
              })
            : [];
        const studentNameById = new Map(students.map((s) => [s.id, s.name]));

        const firstTryByTaskKey = new Map<string, number | null>();
        for (const st of studyStates) {
          firstTryByTaskKey.set(
            `${st.assignmentId}:${st.studentId}`,
            worksheetFirstTryPct(st.stageStates),
          );
        }
        const tasksByAssignment = new Map<string, typeof taskRows>();
        for (const t of taskRows) {
          const list = tasksByAssignment.get(t.assignmentId);
          if (list) list.push(t);
          else tasksByAssignment.set(t.assignmentId, [t]);
        }

        const studentRowsOf = (
          assignmentId: string,
          kind: DossierAssignment["kind"],
        ): DossierStudentRow[] =>
          (tasksByAssignment.get(assignmentId) ?? [])
            .map((t) => ({
              studentId: t.studentId,
              name: studentNameById.get(t.studentId) ?? "(삭제된 학생)",
              status: taskStatusOf(t.status),
              scorePct:
                kind === "WORKSHEET"
                  ? (firstTryByTaskKey.get(`${assignmentId}:${t.studentId}`) ?? null)
                  : questionsScorePct(t.responses),
            }))
            .sort((a, b) => a.name.localeCompare(b.name, "ko"));

        const worksheetAssignments: DossierAssignment[] = stamped.map((s) => {
          const counts = countsById.get(s.id) ?? { total: 0, done: 0, inProgress: 0 };
          return {
            id: s.id,
            kind: "WORKSHEET" as const,
            title: s.title,
            createdAt: s.createdAt.toISOString(),
            dueAt: s.dueAt ? s.dueAt.toISOString() : null,
            className: s.classId ? (classNameById.get(s.classId) ?? null) : null,
            modules: Array.isArray(s.modules)
              ? (s.modules.filter(isStudioModuleId) as StudioModuleId[])
              : [],
            questionCount: null,
            taskCount: counts.total,
            doneCount: counts.done,
            inProgressCount: counts.inProgress,
            avgFirstTryPct: avgMap.get(s.id) ?? null,
            students: studentRowsOf(s.id, "WORKSHEET"),
          };
        });
        const questionAssignments: DossierAssignment[] = adoptedQuestionKind.map(
          ({ row, overlap }) => {
            const counts =
              countsById.get(row.id) ?? { total: 0, done: 0, inProgress: 0 };
            return {
              id: row.id,
              kind: "QUESTIONS" as const,
              title: row.title,
              createdAt: row.createdAt.toISOString(),
              dueAt: row.dueAt ? row.dueAt.toISOString() : null,
              className: null, // QUESTIONS payload 엔 studio 스탬프가 없다(§3.9.6 v2)
              modules: null,
              questionCount: overlap,
              taskCount: counts.total,
              doneCount: counts.done,
              inProgressCount: counts.inProgress,
              avgFirstTryPct: null,
              students: studentRowsOf(row.id, "QUESTIONS"),
            };
          },
        );
        assignments = [...worksheetAssignments, ...questionAssignments].sort(
          (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0),
        );
      }
    } catch {
      // 빈 배열로 삼키지 않는다 — error 필드로 구분해 패널이 SectionError 를 그린다.
      assignments = [];
      assignmentsError = "배정 현황을 불러오지 못했습니다.";
    }

    return {
      data: {
        passage: {
          id: passage.id,
          title: passage.title,
          createdAt: passage.createdAt.toISOString(),
          updatedAt: passage.updatedAt.toISOString(),
        },
        analysis: { analyzed, stale, readyModules, hasExam, lastAnalyzedAt },
        questions: { total: questionRows.length, approvedCount, byType, rows },
        sheets: sheetRows.map((r) => ({
          reportId: r.id,
          planMarker: r.generationPlan,
          title: r.title,
          status: r.status,
          updatedAt: r.updatedAt.toISOString(),
        })),
        assignments,
      },
      ...(assignmentsError ? { error: assignmentsError } : {}),
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error ? error.message : "지문 현황을 불러오지 못했습니다.",
    };
  }
}

// ── ② 이력 팝오버 학습자료 행 — 분석 모달 재료(§3.9.5②) ─────────────────────

/**
 * PassageAnalysisModal 이 소비하는 passage 형태(generate-page-client.tsx:2044-2057
 * 배선 정본)와 구조 호환되는 슬림 페이로드. notes·questions 는 도시에 팝오버
 * 슬림 계약(§3.9.4 — 제목·본문·analysisData)에 따라 빈 배열로 내린다.
 * ⚠ getWorkbenchPassage 재사용 금지 — academyId 미스코프(§12 금지 목록).
 */
export interface StudioPassageAnalysisData {
  passage: {
    id: string;
    title: string;
    content: string;
    grade: number | null;
    semester: string | null;
    unit: string | null;
    publisher: string | null;
    difficulty: string | null;
    tags: string | null;
    source: string | null;
    createdAt: Date;
    school: { id: string; name: string; type: string } | null;
    analysis: {
      id: string;
      analysisData: string;
      contentHash: string;
      updatedAt: Date;
    } | null;
    notes: Array<{ id: string; noteType: string; content: string; order: number }>;
    // 모달 PassageData.questions 원소와 구조 동일(항상 빈 배열로 내리는 자리).
    questions: Array<{
      id: string;
      type: string;
      subType: string | null;
      difficulty: string;
      questionText: string;
      options: string | null;
      correctAnswer: string;
      tags: string | null;
      aiGenerated: boolean;
      approved: boolean;
      createdAt: Date;
      explanation: {
        id: string;
        content: string;
        keyPoints: string | null;
        wrongOptionExplanations: string | null;
      } | null;
    }>;
  };
  /** PassageAnalysis.analysisData 원문(JSON 문자열) — null 이면 본문 모달 폴백 분기. */
  analysisData: string | null;
}

export async function getStudioPassageAnalysis(input: {
  passageId: string;
}): Promise<{ data: StudioPassageAnalysisData | null; error?: string }> {
  try {
    const staff = await requireStaffAuth();
    const passageId = typeof input.passageId === "string" ? input.passageId : "";
    if (!passageId) return { data: null, error: "지문 정보가 올바르지 않습니다." };

    const passage = await prisma.passage.findFirst({
      where: { id: passageId, academyId: staff.academyId },
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
        source: true,
        createdAt: true,
        school: { select: { id: true, name: true, type: true } },
        analysis: {
          select: { id: true, analysisData: true, contentHash: true, updatedAt: true },
        },
      },
    });
    if (!passage) return { data: null };

    return {
      data: {
        passage: { ...passage, notes: [], questions: [] },
        analysisData: passage.analysis?.analysisData ?? null,
      },
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error ? error.message : "분석 정보를 불러오지 못했습니다.",
    };
  }
}

// ── ③ 문제 상세 모달 지연 로드 — QuestionCardItem 1건 ────────────────────────

/**
 * 도시에 「생성된 문제」 행·이력 팝오버 문제 행이 여는 상세 모달용.
 * 저장 행 → QuestionCardItem 변환은 dock-question-preview-modal.tsx:31-71
 * (toQuestionCardItems) 의 필드 대응을 DB 컬럼 기준으로 옮긴 것 — DB 행은
 * options·tags 가 이미 JSON 문자열이라 재직렬화 없이 그대로 싣는다.
 */
export async function getStudioQuestionCard(input: {
  questionId: string;
}): Promise<{ data: QuestionCardItem | null; error?: string }> {
  try {
    const staff = await requireStaffAuth();
    const questionId = typeof input.questionId === "string" ? input.questionId : "";
    if (!questionId) return { data: null, error: "문항 정보가 올바르지 않습니다." };

    const q = await prisma.question.findFirst({
      where: { id: questionId, academyId: staff.academyId, deletedAt: null },
      select: {
        id: true,
        type: true,
        subType: true,
        questionText: true,
        options: true,
        correctAnswer: true,
        difficulty: true,
        tags: true,
        aiGenerated: true,
        approved: true,
        createdAt: true,
        structuredData: true,
        setId: true,
        passage: {
          select: {
            id: true,
            title: true,
            content: true,
            grade: true,
            semester: true,
            publisher: true,
            school: { select: { id: true, name: true } },
          },
        },
        explanation: {
          select: {
            id: true,
            content: true,
            keyPoints: true,
            wrongOptionExplanations: true,
          },
        },
      },
    });
    if (!q) return { data: null };

    const card: QuestionCardItem = {
      id: q.id,
      type: q.type,
      subType: q.subType,
      questionText: q.questionText,
      options: q.options,
      correctAnswer: q.correctAnswer,
      difficulty: q.difficulty,
      tags: q.tags,
      aiGenerated: q.aiGenerated,
      approved: q.approved,
      createdAt: q.createdAt,
      passage: q.passage
        ? {
            id: q.passage.id,
            title: q.passage.title,
            content: q.passage.content,
            grade: q.passage.grade,
            semester: q.passage.semester,
            publisher: q.passage.publisher,
            school: q.passage.school,
          }
        : null,
      explanation: q.explanation,
      structuredData: q.structuredData ?? undefined,
      setId: q.setId ?? null,
    };
    return { data: card };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error ? error.message : "문항 정보를 불러오지 못했습니다.",
    };
  }
}
