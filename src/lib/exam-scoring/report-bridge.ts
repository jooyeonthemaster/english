// ============================================================================
// 통합 시험 채점 — exam-report 리포트 브리지(DB 접근)
//
// 자체 생성 시험지의 채점 결과를 기존 exam-report 파이프라인(ExamAnalysis +
// ExamReportStudent → 5cr 리포트 생성 라우트)에 그대로 흘려보낸다.
//
// 계약(설계문서 §3.5):
//  - syncInternalAnalysisForExam: Exam→INTERNAL ExamAnalysis upsert(멱등).
//    AI 보강(W6)이 채운 perQuestion 항목은 aiMeta.boostedNumbers 로 구분해 보존 병합.
//  - syncSubmissionToReport: GRADED/SUBMITTED 제출→ExamReportStudent upsert(멱등).
//    기존 행의 report/reportStatus/share 계열은 절대 건드리지 않는다(리포트 문서 보존).
//  - 테넌트 가드: 이 모듈은 세션 컨텍스트가 없다 — 호출자(액션/라우트)가 examId/
//    submissionId 의 academyId 소유를 이미 검증했음을 전제한다. 내부 쿼리는 전부
//    로드한 exam.academyId 로 스코프해 교차 학원 오염을 막는다.
//  - 쓰기는 전부 version CAS(최대 3회 재시도) — 동시 재채점/보강과의 클로버 방지.
// ============================================================================

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeScoreSummary, round2 } from "@/lib/exam-report/grading";
import {
  parseExamAnalysisResult,
  parseExamMap,
  parseScoreSummary,
} from "@/lib/exam-report/schemas";
import type { ExamAnalysisResult, ExamMap } from "@/lib/exam-report/types";
import {
  buildInternalAnalysis,
  buildInternalStructure,
  toStudentResponses,
  type InternalExamItem,
  type OrderSnapshotEntry,
} from "./internal-analysis";
import type { SubmissionResponse } from "./types";

// 순수 변환은 internal-analysis 소유 — 교차 계약 시그니처는 여기서 재수출한다
// (다른 유닛은 report-bridge 에서 import — 테스트는 prisma 미적재 순수 모듈에서).
export { toStudentResponses } from "./internal-analysis";
export type { OrderSnapshotEntry } from "./internal-analysis";

const CAS_MAX_ATTEMPTS = 3;

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

// ── AI 보강(W6) 병합 규약 ────────────────────────────────────────────────────

/** INTERNAL 분석 aiMeta 확장 키 — W6 보강 라우트가 문항 단위 덮어쓰기 후
 *  보강 완료 number 를 이 배열에 기록한다(재동기화 시 보존 병합의 근거). */
export const INTERNAL_BOOSTED_NUMBERS_KEY = "boostedNumbers";

/** aiMeta.boostedNumbers(string[]) 방어적 판독 — W6 도 이 리더를 재사용한다. */
export function readBoostedNumbers(aiMeta: unknown): Set<string> {
  if (aiMeta == null || typeof aiMeta !== "object" || Array.isArray(aiMeta)) {
    return new Set();
  }
  const raw = (aiMeta as Record<string, unknown>)[INTERNAL_BOOSTED_NUMBERS_KEY];
  if (!Array.isArray(raw)) return new Set();
  return new Set(
    raw.map((v) => String(v ?? "").trim()).filter((v) => v.length > 0),
  );
}

/** 신선한 합성본(fresh)에 기존 저장본의 AI 보강 항목을 보존 병합한다.
 *  - boostedNumbers 에 든 number: 기존 항목 유지(보강이 합성보다 상위 정보).
 *  - fresh 에 없는 number(문항 삭제): 보강분이라도 드롭(구조가 정본).
 *  - examLevel: 합성은 항상 null — 기존(보강산) 값이 있으면 유지. */
function mergePreservingBoost(
  fresh: ExamAnalysisResult,
  existingAnalysis: unknown,
  existingAiMeta: unknown,
): ExamAnalysisResult {
  const prior = parseExamAnalysisResult(existingAnalysis);
  if (!prior) return fresh;
  const boosted = readBoostedNumbers(existingAiMeta);
  const priorByNumber = new Map(prior.perQuestion.map((p) => [p.number, p]));
  const perQuestion = fresh.perQuestion.map((f) => {
    if (!boosted.has(f.number)) return f;
    return priorByNumber.get(f.number) ?? f;
  });
  return { perQuestion, examLevel: prior.examLevel ?? null };
}

// ── syncInternalAnalysisForExam ─────────────────────────────────────────────

/** Exam.examType("MIDTERM"|"FINAL"|"QUIZ"|"MOCK"|null) → ExamAnalysis.examType. */
function toAnalysisExamType(value: string | null): string {
  return value === "MIDTERM" || value === "FINAL" || value === "MOCK" ? value : "OTHER";
}

/**
 * 자체 시험지의 INTERNAL ExamAnalysis 를 upsert 한다(멱등 — 몇 번을 불러도 살아있는
 * 문항 기준 최신 합성으로 수렴). 리포트 생성 게이트(status ANALYZED + structure +
 * analysis)를 vision E1 없이 충족시키는 것이 목적.
 * 살아있는 문항만(question.deletedAt null) 합성 대상 — 휴지통 문항은 지도에서 제외.
 */
export async function syncInternalAnalysisForExam(
  examId: string,
): Promise<{ analysisId: string }> {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      id: true,
      academyId: true,
      title: true,
      subject: true,
      totalPoints: true,
      year: true,
      examType: true,
      school: { select: { name: true } },
      questions: {
        orderBy: { orderNum: "asc" },
        select: {
          questionId: true,
          orderNum: true,
          points: true,
          question: {
            select: {
              id: true,
              type: true,
              subType: true,
              questionText: true,
              options: true,
              correctAnswer: true,
              structuredData: true,
              difficulty: true,
              tags: true,
              deletedAt: true,
              explanation: {
                select: {
                  content: true,
                  keyPoints: true,
                  wrongOptionExplanations: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!exam) throw new Error("시험지를 찾을 수 없습니다.");
  // KO 시험지는 배포 차단(설계 §6-7) — 브리지까지 도달하면 상류 가드 버그다.
  if (exam.subject === "KOREAN") {
    throw new Error("국어 시험지는 아직 리포트 브리지를 지원하지 않습니다.");
  }

  const items: InternalExamItem[] = exam.questions
    .filter((link) => link.question.deletedAt == null)
    .map((link) => ({
      questionId: link.questionId,
      orderNum: link.orderNum,
      points: link.points,
      question: {
        id: link.question.id,
        type: link.question.type,
        subType: link.question.subType,
        questionText: link.question.questionText,
        options: link.question.options,
        correctAnswer: link.question.correctAnswer,
        structuredData: link.question.structuredData,
        difficulty: link.question.difficulty,
        tags: link.question.tags,
        explanation: link.question.explanation,
      },
    }));

  const structure = buildInternalStructure({
    exam: { title: exam.title, totalPoints: exam.totalPoints },
    items,
  });
  const fresh = buildInternalAnalysis({ items });

  for (let attempt = 0; attempt < CAS_MAX_ATTEMPTS; attempt++) {
    const existing = await prisma.examAnalysis.findFirst({
      where: {
        sourceExamId: examId,
        sourceType: "INTERNAL",
        academyId: exam.academyId,
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" }, // 중복 생성 사고 시에도 항상 같은 행으로 수렴
      select: { id: true, version: true, analysis: true, aiMeta: true },
    });

    if (!existing) {
      const created = await prisma.examAnalysis.create({
        data: {
          academyId: exam.academyId,
          title: exam.title,
          schoolName: exam.school?.name ?? null,
          examType: toAnalysisExamType(exam.examType),
          examYear: exam.year ?? null,
          sourceType: "INTERNAL",
          sourceExamId: examId,
          status: "ANALYZED",
          structure: toJson(structure),
          analysis: toJson(fresh),
        },
        select: { id: true },
      });
      return { analysisId: created.id };
    }

    // AI 보강 항목 보존 병합 후 CAS 갱신(보강/재동기화 동시 실행 클로버 방지).
    const merged = mergePreservingBoost(fresh, existing.analysis, existing.aiMeta);
    const updated = await prisma.examAnalysis.updateMany({
      where: { id: existing.id, academyId: exam.academyId, version: existing.version },
      data: {
        title: exam.title,
        structure: toJson(structure),
        analysis: toJson(merged),
        status: "ANALYZED",
        version: { increment: 1 },
      },
    });
    if (updated.count === 1) return { analysisId: existing.id };
    // version 경합 — 최신 행을 다시 읽어 재병합.
  }
  throw new Error("내부 분석 동기화가 경합으로 실패했습니다. 다시 시도해주세요.");
}

// ── syncSubmissionToReport ──────────────────────────────────────────────────

/** exam_submissions.responses jsonb 방어적 파스 — 문항 단위 격리(불량 원소 드롭). */
function parseSubmissionResponses(value: unknown): SubmissionResponse[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (r): r is SubmissionResponse =>
      r != null && typeof r === "object" && typeof (r as SubmissionResponse).questionId === "string",
  );
}

const SYNCABLE_STATUSES = new Set(["GRADED", "SUBMITTED"]);

/**
 * orderSnapshot(jsonb) → 학생에게 실제 할당된 questionId 집합.
 * 브리지는 이 집합으로 live 링크를 교집합해 "할당 후 빌더에서 추가된 문항"(링크는
 * 살아있지만 이 학생은 응시하지 않은 문항)이 리포트에 유령 UNKNOWN 으로 섞여 제출
 * 채점(GRADED)과 gradingConfirmed 판정이 어긋나는 것을 막는다. 순서·배점은 무관하다
 * (축의 정본은 현 live 링크의 orderNum). 파손·결손(레거시 행)이면 빈 집합 → 호출부가
 * 교집합을 걷어 전 live 링크로 폴백(무회귀).
 */
function assignedQuestionIds(orderSnapshot: unknown): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(orderSnapshot)) return ids;
  for (const raw of orderSnapshot) {
    if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
      const qid = (raw as Record<string, unknown>).questionId;
      if (typeof qid === "string" && qid.length > 0) ids.add(qid);
    }
  }
  return ids;
}

/**
 * ExamMap 을 허용 number 집합으로 축소한다(점수·확정 축 교집합용). 배점 합도 다시
 * 계산해 maxScore 가 축소 문항만 반영하게 한다. 전 exam 구조(ExamAnalysis.structure)는
 * 불변 — 이 축소본은 이 학생 scoreSummary/gradingConfirmed 계산에만 쓰인다.
 */
function restrictExamMap(structure: ExamMap, allowedNumbers: Set<string>): ExamMap {
  const questions = structure.questions.filter((q) => allowedNumbers.has(q.number));
  const allHavePoints = questions.length > 0 && questions.every((q) => q.points != null);
  return {
    ...structure,
    questions,
    totalPoints: allHavePoints
      ? round2(questions.reduce((sum, q) => sum + (q.points ?? 0), 0))
      : structure.totalPoints,
  };
}

/**
 * 채점(또는 제출) 완료된 ExamSubmission 을 ExamReportStudent 로 동기화한다(멱등).
 * 재채점·수동확정 때마다 다시 불러도 responses/scoreSummary/gradingConfirmed 만
 * 갱신되고, 강사가 만든 리포트 문서(report/reportStatus)·공유 상태는 불변이다.
 *
 * 번호 축 주의: 응답 매핑은 살아있는 ExamQuestion 링크(=structure 와 동일 축, 현
 * orderNum)로 하되 학생의 할당 orderSnapshot 과 **교집합**한다. 제출 orderSnapshot 의
 * orderNum 을 그대로 축으로 쓰면 빌더 재저장으로 순서가 바뀐 경우 정오가 엉뚱한
 * 문항에 붙지만(그래서 현 링크의 orderNum 을 축으로 삼는다), 반대로 할당 이후 추가된
 * 링크까지 축에 넣으면 학생이 본 적 없는 문항이 유령 UNKNOWN 으로 섞여 exam_submissions
 * (GRADED)와 ExamReportStudent(gradingConfirmed) 판정이 모순된다. 그래서 "현 링크의
 * orderNum" × "할당된 questionId" 교집합이 정본이다(orderSnapshot 결손 시 전 링크 폴백).
 *
 * @returns 동기화된 리포트 학생 id. 동기화 불가(미채점·국어·문항 0개 등)는 null.
 */
export async function syncSubmissionToReport(
  submissionId: string,
): Promise<{ reportStudentId: string } | null> {
  const submission = await prisma.examSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      examId: true,
      status: true,
      responses: true,
      orderSnapshot: true,
      examReportStudentId: true,
      exam: { select: { id: true, academyId: true, subject: true } },
      student: { select: { id: true, name: true } },
    },
  });
  if (!submission) return null;
  if (!SYNCABLE_STATUSES.has(submission.status)) return null;
  if (submission.exam.subject === "KOREAN") return null;

  // 1) INTERNAL 분석 보장(structure/analysis 최신화) — 리포트 생성 게이트 충족.
  const { analysisId } = await syncInternalAnalysisForExam(submission.examId);

  // 2) 응답 변환 — 살아있는 링크 축(현 orderNum) × 할당 orderSnapshot 교집합(위 주석).
  const liveLinks = await prisma.examQuestion.findMany({
    where: { examId: submission.examId, question: { deletedAt: null } },
    orderBy: { orderNum: "asc" },
    select: { questionId: true, orderNum: true, points: true },
  });
  if (liveLinks.length === 0) return null; // 문항 0개 — 합성할 리포트가 없다
  const assignedIds = assignedQuestionIds(submission.orderSnapshot);
  const effectiveLinks =
    assignedIds.size > 0
      ? liveLinks.filter((l) => assignedIds.has(l.questionId))
      : liveLinks; // orderSnapshot 결손(레거시) — 전 live 링크로 폴백(무회귀)
  if (effectiveLinks.length === 0) return null; // 할당 문항이 전부 삭제/링크 해제됨
  const snapshot: OrderSnapshotEntry[] = effectiveLinks.map((l) => ({
    questionId: l.questionId,
    orderNum: l.orderNum,
    points: l.points,
  }));
  const responses = toStudentResponses(
    parseSubmissionResponses(submission.responses),
    snapshot,
  );

  // 3) 구조 기준 점수 재계산 — 방금 동기화한 분석 행의 structure 가 정본.
  const analysisRow = await prisma.examAnalysis.findUnique({
    where: { id: analysisId },
    select: { structure: true },
  });
  // 저장본을 다시 파스해서 쓴다 — 리포트 생성 라우트가 보게 될 것과 동일한
  // 렌즈(examMapSchema transform 포함)로 점수를 계산해 축 어긋남을 없앤다.
  const fullStructure = parseExamMap(analysisRow?.structure);
  if (!fullStructure) return null; // 방어 — 직전에 쓴 구조가 파스 불가면 동기화 중단
  // 점수·gradingConfirmed 축도 할당 교집합으로 제한한다 — 전 exam 구조(ExamAnalysis)는
  // 불변이되, 이 학생의 확정 판정은 실제 할당·응시한 문항만 근거로 삼아 제출(GRADED)과
  // 어긋나지 않게 한다. 교집합이 전 구조와 같으면(편집 없음) 원본을 그대로 써 무회귀.
  const allowedNumbers = new Set(snapshot.map((s) => String(s.orderNum)));
  const structure = fullStructure.questions.some((q) => !allowedNumbers.has(q.number))
    ? restrictExamMap(fullStructure, allowedNumbers)
    : fullStructure;

  const academyId = submission.exam.academyId;

  for (let attempt = 0; attempt < CAS_MAX_ATTEMPTS; attempt++) {
    const existing = await prisma.examReportStudent.findFirst({
      where: {
        academyId,
        deletedAt: null,
        OR: [
          ...(submission.examReportStudentId ? [{ id: submission.examReportStudentId }] : []),
          { examSubmissionId: submissionId },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, version: true, scoreSummary: true },
    });

    // 강사가 정오표에 입력한 반평균/등급대는 재동기화에서 보존한다.
    const priorSummary = parseScoreSummary(existing?.scoreSummary);
    const scoreSummary = computeScoreSummary(structure, responses, {
      classAverage: priorSummary?.classAverage ?? null,
      gradeBand: priorSummary?.gradeBand ?? null,
    });
    // UNKNOWN 0개(전 문항 확정) = 정오표 자동 확정 → 5cr 리포트 생성 게이트 통과.
    const gradingConfirmed = scoreSummary.unknownCount === 0;

    let reportStudentId: string;
    if (!existing) {
      const created = await prisma.examReportStudent.create({
        data: {
          examAnalysisId: analysisId,
          academyId,
          studentName: submission.student.name,
          studentId: submission.student.id,
          examSubmissionId: submissionId,
          responses: toJson(responses),
          scoreSummary: toJson(scoreSummary),
          gradingConfirmed,
        },
        select: { id: true },
      });
      reportStudentId = created.id;
    } else {
      // report/reportStatus/share·answer 계열은 절대 건드리지 않는다(계약).
      const updated = await prisma.examReportStudent.updateMany({
        where: { id: existing.id, academyId, version: existing.version, deletedAt: null },
        data: {
          examAnalysisId: analysisId,
          studentName: submission.student.name, // 로스터 개명 반영
          studentId: submission.student.id,
          examSubmissionId: submissionId,
          responses: toJson(responses),
          scoreSummary: toJson(scoreSummary),
          gradingConfirmed,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) continue; // version 경합 — 재시도
      reportStudentId = existing.id;
    }

    // 4) 역기록 — 제출→리포트 학생 soft-ref(멱등, version 무관 메타 백필).
    if (submission.examReportStudentId !== reportStudentId) {
      await prisma.examSubmission.updateMany({
        where: { id: submissionId },
        data: { examReportStudentId: reportStudentId },
      });
    }
    return { reportStudentId };
  }
  throw new Error("리포트 동기화가 경합으로 실패했습니다. 다시 시도해주세요.");
}
