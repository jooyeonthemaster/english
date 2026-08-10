"use server";

// ============================================================================
// 통합 학습 과제 — 컴포저 분석 컨텍스트 서버액션 (v3 design §D2-3, 디렉터면 전용)
//
// getAssignAnalysisContext: 취약점 CTA(analysisSeed) 경유로 컴포저가 열릴 때
// 컨텍스트 스트립(composer-context-strip)이 소비하는 "배포 전 근거" 3종 조립.
//  1) 관련 개념 숙달도 — spots 에서 conceptIds 를 수집(개념 축 key ·
//     학습지 어법 코드 a~m 브리지(GRAMMAR_CODE_CONCEPTS) · GRAMMAR deploy
//     프리셋)해 grammarDrillMastery 를 조회. 점수 오름차순.
//  2) 최근 오답 3건 — 같은 conceptIds 스코프의 grammarDrillAttempt(오답만).
//  3) 이미 나간 관련 과제 — listStudentStudyTasks 재사용 후 같은 kind +
//     겹치는 범위만 남긴다: GRAMMAR=개념/유닛 교집합(빈 스펙=전 범위 편성
//     이므로 포함) · WORKSHEET=같은 학습지 refId · QUESTIONS=문항 subType
//     교집합(대상 subTypes 비면 kind 일치로 충분). 최신 배정순 최대 5건.
// academyId 스코프 필수(_shared 관용 미러 — soft-ref 교차검증 포함).
// ============================================================================

import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CONCEPT_SKELETON_BY_ID } from "@/lib/grammar-drill/curriculum";
import { GRAMMAR_CODE_CONCEPTS } from "@/lib/grammar-drill/grammar-code-map";
import type { WeakSpot } from "@/lib/student-analytics/types";
import type {
  GrammarAssignmentPayload,
  StudyAssignmentKind,
  StudyTaskStatus,
} from "@/lib/study-assignments/types";
import { listStudentStudyTasks } from "./queries";
import { isoOf, toErrorMessage, type StudyActionResult } from "./_shared";

// ── 반환 계약 (직렬화 가능 — 컨텍스트 스트립이 그대로 렌더) ─────────────────

export interface AssignContextMasteryRow {
  conceptId: string;
  /** 커리큘럼 개념 title — 미등록 id 는 원문 폴백 */
  title: string;
  /** masteryScore(EWMA) 반올림 0~100 */
  score: number;
  attempts: number;
  /** attempts - correct (0 클램프) */
  wrong: number;
  lastAttemptAt: string | null;
}

export interface AssignContextWrongAttempt {
  conceptId: string;
  conceptTitle: string;
  itemType: string;
  /** 학생 응답 원문(80자 절단 — 스트립 1행 표기용) */
  answer: string;
  createdAt: string;
}

export interface AssignContextRelatedTask {
  /** null = 고아 배포(DIRECT) — 과제 상세 모달 진입 불가 */
  assignmentId: string | null;
  taskId: string;
  kind: StudyAssignmentKind;
  title: string;
  dueAt: string | null;
  liveStatus: StudyTaskStatus;
  overdue: boolean;
}

export interface AssignAnalysisContext {
  mastery: AssignContextMasteryRow[];
  recentWrong: AssignContextWrongAttempt[];
  relatedTasks: AssignContextRelatedTask[];
}

/** 관련 과제 상한 — 스트립 1행 칩 + 과다 노출 방지 */
const RELATED_TASK_LIMIT = 5;
/** 최근 오답 노출 건수(D2-3 「최근 오답 3건」) */
const RECENT_WRONG_LIMIT = 3;
/** 오답 답안 절단 길이 — 스트립 표기용(원문은 시도 기록 탭 소관) */
const ANSWER_TRUNCATE = 80;

/** payload/spec JSON → GrammarAssignmentPayload 부분 형태 방어 파스 */
function grammarSpecOf(value: unknown): Partial<GrammarAssignmentPayload> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Partial<GrammarAssignmentPayload>;
}

/** payload JSON → questionIds 방어 파스(QUESTIONS) */
function questionIdsOf(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const ids = (value as { questionIds?: unknown }).questionIds;
  if (!Array.isArray(ids)) return [];
  return ids.filter((v): v is string => typeof v === "string");
}

export async function getAssignAnalysisContext(
  studentId: string,
  spots: WeakSpot[],
): Promise<StudyActionResult<AssignAnalysisContext>> {
  try {
    const staff = await requireStaffAuth();
    const student = await prisma.student.findFirst({
      where: { id: studentId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!student) return { success: false, error: "학생을 찾을 수 없습니다." };

    // ── spots → 관련 범위 수집 ──────────────────────────────────────────────
    const conceptIds = new Set<string>();
    const targetKinds = new Set<StudyAssignmentKind>();
    const targetSubTypes = new Set<string>();
    const targetWorksheetRefIds = new Set<string>();
    for (const spot of spots) {
      if (spot.axis === "concept") conceptIds.add(spot.key);
      if (spot.axis === "grammar-code") {
        const mapped =
          (GRAMMAR_CODE_CONCEPTS as Record<string, string[] | undefined>)[spot.key] ?? [];
        for (const id of mapped) conceptIds.add(id);
      }
      const deploy = spot.deploy;
      if (!deploy) continue;
      targetKinds.add(deploy.kind);
      if (deploy.kind === "GRAMMAR") {
        for (const id of deploy.grammarSpec.conceptIds ?? []) conceptIds.add(id);
        for (const preset of deploy.weakConcepts) conceptIds.add(preset.conceptId);
      } else if (deploy.kind === "QUESTIONS") {
        for (const subType of deploy.questionFilter.subTypes) targetSubTypes.add(subType);
      } else {
        targetWorksheetRefIds.add(deploy.content.refId);
      }
    }
    const conceptIdList = [...conceptIds];
    // 개념 → 유닛 스코프(유닛 단위 편성 과제와의 겹침 판정용)
    const targetUnitIds = new Set(
      conceptIdList
        .map((id) => CONCEPT_SKELETON_BY_ID.get(id)?.unitId)
        .filter((v): v is string => Boolean(v)),
    );

    // ── 숙달도·최근 오답·학생 과제 목록 병렬 조회 ───────────────────────────
    const [masteryRows, wrongAttempts, tasksRes] = await Promise.all([
      conceptIdList.length > 0
        ? prisma.grammarDrillMastery.findMany({
            where: {
              studentId,
              academyId: staff.academyId,
              conceptId: { in: conceptIdList },
            },
          })
        : Promise.resolve([]),
      conceptIdList.length > 0
        ? prisma.grammarDrillAttempt.findMany({
            where: {
              studentId,
              academyId: staff.academyId,
              correct: false,
              conceptId: { in: conceptIdList },
            },
            orderBy: { createdAt: "desc" },
            take: RECENT_WRONG_LIMIT,
          })
        : Promise.resolve([]),
      listStudentStudyTasks(studentId),
    ]);

    const mastery: AssignContextMasteryRow[] = masteryRows
      .map((m) => ({
        conceptId: m.conceptId,
        title: CONCEPT_SKELETON_BY_ID.get(m.conceptId)?.title ?? m.conceptId,
        score: Math.round(m.masteryScore),
        attempts: m.attempts,
        wrong: Math.max(0, m.attempts - m.correct),
        lastAttemptAt: isoOf(m.lastAttemptAt),
      }))
      .sort((a, b) => a.score - b.score);

    const recentWrong: AssignContextWrongAttempt[] = wrongAttempts.map((a) => ({
      conceptId: a.conceptId,
      conceptTitle: CONCEPT_SKELETON_BY_ID.get(a.conceptId)?.title ?? a.conceptId,
      itemType: a.itemType,
      answer: a.answer.slice(0, ANSWER_TRUNCATE),
      createdAt: a.createdAt.toISOString(),
    }));

    // ── 같은 kind + 겹치는 범위 기존 과제 ───────────────────────────────────
    const relatedTasks: AssignContextRelatedTask[] = [];
    if (tasksRes.success && tasksRes.data && targetKinds.size > 0) {
      const rows = tasksRes.data
        .filter((r) => targetKinds.has(r.kind))
        .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt));

      // 범위 대조 재료 — 과제 payload(GRAMMAR spec·WORKSHEET refId·QUESTIONS 문항)
      const assignmentIds = [
        ...new Set(
          rows.map((r) => r.assignmentId).filter((v): v is string => Boolean(v)),
        ),
      ];
      // 고아(DIRECT) 어법 배포는 GrammarDrillAssignment.spec 이 범위 정본
      const directGrammarIds = rows
        .filter((r) => r.kind === "GRAMMAR" && !r.assignmentId && r.grammarAssignmentId)
        .map((r) => r.grammarAssignmentId as string);
      // 상호 독립 2조회 병렬(N-24 — 반환 계약 불변). 문항 subType 조회는
      // assignments payload 의존이라 아래에서 후속 수행.
      const [assignments, directSpecs] = await Promise.all([
        assignmentIds.length > 0
          ? prisma.studyAssignment.findMany({
              where: { id: { in: assignmentIds }, academyId: staff.academyId },
              select: { id: true, refId: true, payload: true },
            })
          : Promise.resolve([]),
        directGrammarIds.length > 0
          ? prisma.grammarDrillAssignment.findMany({
              where: { id: { in: directGrammarIds }, academyId: staff.academyId },
              select: { id: true, spec: true },
            })
          : Promise.resolve([]),
      ]);
      const assignmentById = new Map(assignments.map((a) => [a.id, a]));
      const directSpecById = new Map(directSpecs.map((d) => [d.id, d.spec]));

      // QUESTIONS 후보의 문항 subType 인덱스(대상 subTypes 있을 때만 조회)
      const candidateQuestionIds = new Set<string>();
      if (targetSubTypes.size > 0) {
        for (const row of rows) {
          if (row.kind !== "QUESTIONS" || !row.assignmentId) continue;
          for (const id of questionIdsOf(assignmentById.get(row.assignmentId)?.payload)) {
            candidateQuestionIds.add(id);
          }
        }
      }
      const questionRows =
        candidateQuestionIds.size > 0
          ? await prisma.question.findMany({
              where: { id: { in: [...candidateQuestionIds] }, academyId: staff.academyId },
              select: { id: true, subType: true },
            })
          : [];
      const subTypeByQuestionId = new Map(questionRows.map((q) => [q.id, q.subType]));

      const overlapsGrammar = (spec: Partial<GrammarAssignmentPayload>): boolean => {
        const cIds = spec.conceptIds ?? [];
        const uIds = spec.unitIds ?? [];
        // 개념·유닛 무지정 = 전 범위 편성 — 대상 개념을 포함한다(정직 포함)
        if (cIds.length === 0 && uIds.length === 0) return true;
        if (cIds.some((id) => conceptIds.has(id))) return true;
        return uIds.some((id) => targetUnitIds.has(id));
      };

      for (const row of rows) {
        let overlap = false;
        if (row.kind === "GRAMMAR") {
          if (conceptIds.size === 0) {
            overlap = true; // 대상 개념 미상 — kind 일치로 충분
          } else if (row.assignmentId) {
            overlap = overlapsGrammar(
              grammarSpecOf(assignmentById.get(row.assignmentId)?.payload),
            );
          } else if (row.grammarAssignmentId) {
            overlap = overlapsGrammar(
              grammarSpecOf(directSpecById.get(row.grammarAssignmentId)),
            );
          }
        } else if (row.kind === "WORKSHEET") {
          const refId = row.assignmentId
            ? (assignmentById.get(row.assignmentId)?.refId ?? null)
            : null;
          overlap = refId !== null && targetWorksheetRefIds.has(refId);
        } else if (row.kind === "QUESTIONS") {
          if (targetSubTypes.size === 0) {
            overlap = true; // 프리필터 없는 시드 — kind 일치로 충분
          } else if (row.assignmentId) {
            overlap = questionIdsOf(assignmentById.get(row.assignmentId)?.payload).some(
              (id) => {
                const subType = subTypeByQuestionId.get(id);
                return typeof subType === "string" && targetSubTypes.has(subType);
              },
            );
          }
        }
        if (!overlap) continue;
        relatedTasks.push({
          assignmentId: row.assignmentId,
          taskId: row.taskId,
          kind: row.kind,
          title: row.title,
          dueAt: row.dueAt,
          liveStatus: row.liveStatus,
          overdue: row.overdue,
        });
        if (relatedTasks.length >= RELATED_TASK_LIMIT) break;
      }
    }

    return { success: true, data: { mastery, recentWrong, relatedTasks } };
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, "분석 컨텍스트 조회 중 오류가 발생했습니다."),
    };
  }
}
