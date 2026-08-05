"use server";

// ============================================================================
// 시험지 배포·OMR — 강사 검토·대리입력·수동확정 액션 (유닛 W5, 설계문서 §4.3)
//
// V4(시험지 상세 "응시 현황" 탭)의 채점 검토 패널이 소비하는 서버 표면 4종:
//  - getSubmissionReviewDetail : 문항별 정오 그리드 + 정답 표시(강사면 — 정답 포함 가능)
//  - saveTeacherEntry          : 지면 응시분 강사 대리 OMR 입력 → 병합 후 즉시 전체 재채점
//  - resolveNeedsReview        : NEEDS_REVIEW(기계채점 불가)·미입력 문항 수동확정 ○✕△
//  - regradeSubmission         : LIVE Question 기준 전체 재채점(문항 수정 후 재채점용)
//
// 공통 계약(설계 §6 + W6 submit 라우트와 축 일치 — 파서·판정·재채점 코어는
// _submission-review-core.ts):
//  - 전 함수 requireStaffAuth + academyId 교차검증(submission→exam.academyId).
//  - 미입력(input null) = UNKNOWN — 정답 승격 절대 금지. NEEDS_REVIEW 는 사람이
//    확정할 때까지 점수 합산 제외.
//  - 채점 완료 축 = "전 문항 확정(CORRECT/WRONG/PARTIAL)" — 미입력·NEEDS_REVIEW 가
//    모두 0 이어야 'GRADED'(W6 gradeMergedSubmission.allConfirmed 와 동일 규칙).
//    미입력 잔존분은 강사가 resolveNeedsReview 로 ✕(또는 ○/△) 확정해 해소한다.
//  - 삭제(LIVE 소실) 문항은 채점·배점·카운트에서 완전 제외 — W6 submit 의
//    droppedQuestionIds·리포트 브리지(살아있는 링크 축)와 동일 축(정합 유지).
//  - 레거시 Int 점수 컬럼(score/maxScore/percent)은 확정 채점(GRADED)일 때만 채운다.
//  - version CAS(최대 3회 재시도) — 학생 자동저장↔제출↔강사입력 클로버 방지(§6-5).
//  - 저장 성공 후 syncSubmissionToReport(W2 report-bridge)로 exam-report 재동기화.
//  - KO(국어) 시험지는 할당 단계에서 차단되지만 여기서도 이중 방어(§6-7).
// ============================================================================

import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/exam-scoring/normalize";
import type {
  AnswerInputKind,
  GradeResult,
  StudentInput,
} from "@/lib/exam-scoring/types";
import type { ScoreSummary } from "@/lib/exam-report/types";
import {
  CAS_CONFLICT_MESSAGE,
  type EffectiveStatus,
  KO_BLOCK_MESSAGE,
  MANUAL_STATUSES,
  MAX_CAS_RETRY,
  NO_QUESTIONS_MESSAGE,
  NOT_FOUND_MESSAGE,
  REVIEWABLE_STATUSES,
  alignRowsToSnapshot,
  buildExplanation,
  clampBrief,
  effectiveVerdict,
  liveSnapshotEntries,
  loadExamSubject,
  loadExplanations,
  loadQuestions,
  optionsOf,
  loadScopedSubmission,
  parseResponses,
  regradeRows,
  resolveSnapshot,
  revalidateExamSurfaces,
  sanitizeStudentInput,
  scoreColumns,
  specFor,
  summarize,
  syncBridge,
  toJson,
  typeLabelOf,
} from "./_submission-review-core";

// ---------------------------------------------------------------------------
// 반환 계약 — V4 UI(정오 그리드·검토 드로어)가 그리는 데이터 전부
// ---------------------------------------------------------------------------

/** 검토 그리드 문항 1행. 정답성 필드 포함 — 강사 세션면 전용, 학생면(/t) 전송 금지. */
export interface SubmissionReviewQuestion {
  questionId: string;
  orderNum: number;
  /** 배점 — orderSnapshot(할당 시점 고정)이 정본 */
  points: number;
  subType: string;
  /** 유형 한글 라벨(QUESTION_TYPE_UI) — 미등록 유형은 subType 원문 */
  typeLabel: string;
  /** 발문 1줄 요약(80자 클램프) */
  brief: string;
  inputKind: AnswerInputKind;
  optionCount?: number;
  /** 선지 라벨 원문(["①",..] | ["(a)",..]) — 순서 = 선지 순서 */
  optionLabels?: string[];
  /** 정답 — 정규화 숫자 토큰 "1".."12" */
  correctChoices?: string[];
  /** 정답 — 선지 라벨 원문("③"/"(c)") 표시용. 라벨 결손 시 숫자 토큰 폴백 */
  correctChoiceLabels?: string[];
  selectCount?: number;
  /** 서답형 필드별 정답(모범답 + 허용 변형 전개) — 강사 대조용 */
  answerFields?: { key: string; label: string; answers: string[] }[];
  manualReason?: string;
  /** 학생 입력 원문 — null = 미입력(UNKNOWN) */
  input: StudentInput | null;
  /** 기계 채점 결과 — null = 미채점 */
  result: GradeResult | null;
  manualStatus?: "CORRECT" | "WRONG" | "PARTIAL";
  manualEarnedPoints?: number;
  reviewedBy?: string;
  /** 수동확정(manualStatus) 우선 최종 판정 — UNKNOWN = 미입력/미채점 */
  effectiveStatus: EffectiveStatus;
  effectiveEarnedPoints: number | null;

  // ── 원본 문항 전문(설계 §7.4) — 시험 상세 모달·변형 문제 생성 전용 추가 필드.
  //    전부 optional 이라 기존 소비처(정오 그리드·검토 패널)는 무회귀다.
  //    brief 는 목록용 요약으로 그대로 유지한다(둘의 용도가 다르다).
  /** 발문 전문(클램프 없음) */
  questionText?: string;
  /** 선지 원문 — 라벨 축은 optionLabels(=correctChoiceLabels)와 동일 */
  options?: { label: string; text: string }[];
  /** 원본 지문 id — 변형 생성 딥링크의 passageIds 원천. 없으면 변형 불가(§8.3) */
  passageId?: string | null;
  passage?: { id: string; title: string; content: string } | null;
  /** 해설 — 본문·핵심 포인트·오답 선지별 해설. 셋 다 없으면 null */
  explanation?: {
    content: string;
    keyPoints: string[];
    wrongOptions: { label: string; text: string }[];
  } | null;
  /** "BASIC" | "INTERMEDIATE" | "KILLER" */
  difficulty?: string | null;
}

export interface SubmissionReviewDetail {
  submissionId: string;
  examId: string;
  examTitle: string;
  studentId: string;
  studentName: string;
  /** "ASSIGNED" | "IN_PROGRESS" | "SUBMITTED" | "GRADED" */
  status: string;
  /** "TABLET" | "OMR" | null(미지정) */
  mode: string | null;
  version: number;
  startedAt: string;
  submittedAt: string | null;
  gradedAt: string | null;
  /** 저장본이 아니라 현재 응답으로 재계산한 요약(스테일 캐시 방지) — exam-report 동형 */
  scoreSummary: ScoreSummary;
  /** 미해결 NEEDS_REVIEW 수 */
  needsReviewCount: number;
  /** 미입력/미채점(UNKNOWN) 문항 수 — needsReviewCount 와 합쳐 0 이면 전 문항 확정 */
  unansweredCount: number;
  /** 할당 후 삭제돼 채점·배점에서 제외된 문항 수(안내 배너용) */
  droppedQuestionCount: number;
  /** 리포트 브리지로 생성된 ExamReportStudent.id(soft-ref) — 미연결이면 null */
  reportStudentId: string | null;
  /** 위 리포트 학생이 속한 분석 id(ExamReportStudent.examAnalysisId) — 미연결/삭제 시 null.
   *  reportStudentId 와 둘 다 있어야 학생 리포트 워크스페이스로 딥링크 가능(없으면 허브 폴백) */
  reportAnalysisId: string | null;
  questions: SubmissionReviewQuestion[];
}

export type SubmissionReviewDetailResult =
  | { success: true; detail: SubmissionReviewDetail }
  | { success: false; error: string };

export interface SubmissionMutationResult {
  success: boolean;
  error?: string;
  /** 저장 후 제출 상태 */
  status?: string;
  needsReviewCount?: number;
  /** 미입력(UNKNOWN) 잔존 수 — needsReviewCount 와 합쳐 0 이어야 GRADED */
  unansweredCount?: number;
  scoreSummary?: ScoreSummary;
  /** LIVE 소실로 채점·배점에서 제외된 문항 수 */
  droppedQuestionCount?: number;
  /** 저장은 성공했지만 리포트 브리지 동기화가 실패한 경우의 경고 */
  syncWarning?: string;
}

export interface ManualVerdictInput {
  status: "CORRECT" | "WRONG" | "PARTIAL";
  /** PARTIAL 필수 — [0, points] 클램프 저장 */
  earnedPoints?: number;
}

// ---------------------------------------------------------------------------
// 액션 1 — 검토 상세(강사면: 정답 포함)
// ---------------------------------------------------------------------------

export async function getSubmissionReviewDetail(
  submissionId: string,
): Promise<SubmissionReviewDetailResult> {
  try {
    const staff = await requireStaffAuth();
    const sub = await loadScopedSubmission(staff.academyId, submissionId);
    if (!sub) return { success: false, error: NOT_FOUND_MESSAGE };
    if ((await loadExamSubject(sub.examId)) === "KOREAN") {
      return { success: false, error: KO_BLOCK_MESSAGE };
    }

    const snapshot = await resolveSnapshot(sub);
    if (snapshot.length === 0) return { success: false, error: NO_QUESTIONS_MESSAGE };
    const liveById = await loadQuestions(
      staff.academyId,
      snapshot.map((s) => s.questionId),
    );
    const { live, droppedQuestionCount } = liveSnapshotEntries(snapshot, liveById);
    if (live.length === 0) return { success: false, error: NO_QUESTIONS_MESSAGE };

    const rows = alignRowsToSnapshot(live, parseResponses(sub.responses));
    const pointsByQuestion = new Map(live.map((s) => [s.questionId, s.points]));
    // 저장된 판정을 그대로 요약(여기서 재채점하지 않음 — 재채점은 regradeSubmission 전용)
    const { summary, needsReviewCount, unansweredCount } = summarize(rows, pointsByQuestion);

    // 리포트 딥링크용 analysisId 해소 — examReportStudentId 는 soft-ref(FK 미설정)라
    // ExamReportStudent 를 별도 조회. 테넌트 스코프 + 미삭제만(삭제분은 링크 깨짐 → 허브 폴백).
    let reportAnalysisId: string | null = null;
    if (sub.examReportStudentId) {
      const reportStudent = await prisma.examReportStudent.findFirst({
        where: {
          id: sub.examReportStudentId,
          academyId: staff.academyId,
          deletedAt: null,
        },
        select: { examAnalysisId: true },
      });
      reportAnalysisId = reportStudent?.examAnalysisId ?? null;
    }

    // 해설은 문항당 최대 1행 — LIVE 문항 id 전체로 배치 1회만 조회(N+1 금지, §7.4 성능)
    const explanationById = await loadExplanations(live.map((s) => s.questionId));

    const questions: SubmissionReviewQuestion[] = rows.map((row) => {
      const points = pointsByQuestion.get(row.questionId) ?? 0;
      // live 스냅샷 행이므로 문항은 반드시 존재 — 방어적으로만 옵셔널 처리
      const question = liveById.get(row.questionId);
      const verdict = effectiveVerdict(row, points);
      const item: SubmissionReviewQuestion = {
        questionId: row.questionId,
        orderNum: row.orderNum,
        points,
        subType: question?.subType ?? "",
        typeLabel: typeLabelOf(question?.subType),
        brief: clampBrief(question?.questionText),
        inputKind: "MANUAL_ONLY",
        input: row.input,
        result: row.result ?? null,
        effectiveStatus: verdict.status,
        effectiveEarnedPoints: verdict.earned,
      };
      if (row.manualStatus) {
        item.manualStatus = row.manualStatus;
        if (row.manualEarnedPoints != null) item.manualEarnedPoints = row.manualEarnedPoints;
        if (row.reviewedBy) item.reviewedBy = row.reviewedBy;
      }
      if (question) {
        const spec = specFor(question, points);
        item.inputKind = spec.inputKind;
        if (spec.optionCount != null) item.optionCount = spec.optionCount;
        if (spec.optionLabels) item.optionLabels = [...spec.optionLabels];
        if (spec.correctChoices) {
          item.correctChoices = [...spec.correctChoices];
          item.correctChoiceLabels = spec.correctChoices.map(
            (token) => spec.optionLabels?.[Number(token) - 1] ?? token,
          );
        }
        if (spec.selectCount != null) item.selectCount = spec.selectCount;
        if (spec.fields) {
          item.answerFields = spec.fields.map((f) => ({
            key: f.key,
            label: f.label,
            answers: [...f.answers],
          }));
        }
        if (spec.manualReason) item.manualReason = spec.manualReason;

        // ── §7.4 원본 전문 — 상세 모달이 지문·선지·해설까지 그린다.
        // 라벨 축을 spec.optionLabels 로 통일해야 정답 선지 강조(correctChoiceLabels)와
        // 학생 선택 표시가 같은 키로 맞물린다.
        item.questionText = question.questionText;
        item.difficulty = question.difficulty ?? null;
        item.passageId = question.passageId ?? null;
        item.passage = question.passage
          ? {
              id: question.passage.id,
              title: question.passage.title,
              content: question.passage.content,
            }
          : null;
        const options = optionsOf(question, item.optionLabels);
        if (options.length > 0) item.options = options;
        item.explanation = buildExplanation(
          explanationById.get(row.questionId),
          item.optionLabels,
        );
      }
      return item;
    });

    return {
      success: true,
      detail: {
        submissionId: sub.id,
        examId: sub.examId,
        examTitle: sub.exam.title,
        studentId: sub.studentId,
        studentName: sub.student.name,
        status: sub.status,
        mode: sub.mode ?? null,
        version: sub.version,
        startedAt: sub.startedAt.toISOString(),
        submittedAt: sub.submittedAt?.toISOString() ?? null,
        gradedAt: sub.gradedAt?.toISOString() ?? null,
        scoreSummary: summary,
        needsReviewCount,
        unansweredCount,
        droppedQuestionCount,
        reportStudentId: sub.examReportStudentId ?? null,
        reportAnalysisId,
        questions,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "제출 상세 조회 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// 액션 2 — 강사 대리 OMR 입력(지면 응시분) → 병합 후 즉시 전체 재채점
// ---------------------------------------------------------------------------

export async function saveTeacherEntry(
  submissionId: string,
  entries: Record<string, StudentInput | null>,
): Promise<SubmissionMutationResult> {
  try {
    const staff = await requireStaffAuth();

    for (let attempt = 0; attempt < MAX_CAS_RETRY; attempt++) {
      const sub = await loadScopedSubmission(staff.academyId, submissionId);
      if (!sub) return { success: false, error: NOT_FOUND_MESSAGE };
      if ((await loadExamSubject(sub.examId)) === "KOREAN") {
        return { success: false, error: KO_BLOCK_MESSAGE };
      }

      const snapshot = await resolveSnapshot(sub);
      if (snapshot.length === 0) return { success: false, error: NO_QUESTIONS_MESSAGE };
      const liveById = await loadQuestions(
        staff.academyId,
        snapshot.map((s) => s.questionId),
      );
      const { live, droppedQuestionCount } = liveSnapshotEntries(snapshot, liveById);
      if (live.length === 0) return { success: false, error: NO_QUESTIONS_MESSAGE };
      const prior = parseResponses(sub.responses);

      // 대리 입력 화이트리스트 — LIVE 스냅샷에 없는 questionId 는 폐기(스냅샷이 정본).
      // 미입력(전부 빈 입력)은 null 로 저장돼 UNKNOWN 유지(§6-2).
      const allowed = new Set(live.map((s) => s.questionId));
      const overrides = new Map<string, StudentInput | null>();
      for (const [questionId, raw] of Object.entries(entries ?? {})) {
        if (!allowed.has(questionId)) continue;
        overrides.set(questionId, sanitizeStudentInput(raw));
      }
      if (overrides.size === 0 && prior.length === 0) {
        return { success: false, error: "입력된 답안이 없습니다." };
      }

      const outcome = regradeRows(live, prior, liveById, droppedQuestionCount, overrides);
      const complete = outcome.allConfirmed; // 전 문항 확정 축(W6 allConfirmed 동일)
      const columns = scoreColumns(outcome.summary, complete);
      const now = new Date();

      const updated = await prisma.examSubmission.updateMany({
        where: { id: submissionId, version: sub.version }, // CAS
        data: {
          responses: toJson(outcome.rows),
          scoreSummary: toJson(outcome.summary),
          score: columns.score,
          maxScore: columns.maxScore,
          percent: columns.percent,
          status: complete ? "GRADED" : "SUBMITTED",
          submittedAt: sub.submittedAt ?? now,
          gradedAt: complete ? (sub.gradedAt ?? now) : null,
          gradedBy: complete ? (sub.gradedBy ?? staff.id) : sub.gradedBy,
          version: sub.version + 1,
        },
      });
      if (updated.count !== 1) continue; // 버전 충돌 — 최신본 재적재 후 재시도

      const syncWarning = await syncBridge(submissionId);
      revalidateExamSurfaces(sub.examId);
      return {
        success: true,
        status: complete ? "GRADED" : "SUBMITTED",
        needsReviewCount: outcome.needsReviewCount,
        unansweredCount: outcome.unansweredCount,
        scoreSummary: outcome.summary,
        droppedQuestionCount: outcome.droppedQuestionCount,
        ...(syncWarning ? { syncWarning } : {}),
      };
    }
    return { success: false, error: CAS_CONFLICT_MESSAGE };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "답안 저장 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// 액션 3 — NEEDS_REVIEW·미입력 수동확정(○✕△). manualStatus 는 기계 판정보다 항상 우선.
// ---------------------------------------------------------------------------

export async function resolveNeedsReview(
  submissionId: string,
  questionId: string,
  verdict: ManualVerdictInput,
): Promise<SubmissionMutationResult> {
  try {
    const staff = await requireStaffAuth();
    if (!verdict || !MANUAL_STATUSES.has(verdict.status)) {
      return { success: false, error: "판정 값이 올바르지 않습니다." };
    }
    if (
      verdict.status === "PARTIAL" &&
      (typeof verdict.earnedPoints !== "number" || !Number.isFinite(verdict.earnedPoints))
    ) {
      return { success: false, error: "부분점수 판정에는 획득 점수 입력이 필요합니다." };
    }

    for (let attempt = 0; attempt < MAX_CAS_RETRY; attempt++) {
      const sub = await loadScopedSubmission(staff.academyId, submissionId);
      if (!sub) return { success: false, error: NOT_FOUND_MESSAGE };
      if ((await loadExamSubject(sub.examId)) === "KOREAN") {
        return { success: false, error: KO_BLOCK_MESSAGE };
      }
      if (!REVIEWABLE_STATUSES.has(sub.status)) {
        return { success: false, error: "답안이 제출(입력)된 뒤에 판정할 수 있습니다." };
      }

      const snapshot = await resolveSnapshot(sub);
      if (snapshot.length === 0) return { success: false, error: NO_QUESTIONS_MESSAGE };
      const liveById = await loadQuestions(
        staff.academyId,
        snapshot.map((s) => s.questionId),
      );
      const { live } = liveSnapshotEntries(snapshot, liveById);
      const snapEntry = live.find((s) => s.questionId === questionId);
      if (!snapEntry) {
        // 스냅샷 밖이거나 삭제된 문항 — 삭제분은 채점 대상 자체가 아니다.
        return {
          success: false,
          error: "이 제출에서 해당 문항을 찾을 수 없습니다. (삭제된 문항은 채점에서 제외됩니다)",
        };
      }

      const rows = alignRowsToSnapshot(live, parseResponses(sub.responses));
      const target = rows.find((r) => r.questionId === questionId);
      if (!target) {
        return { success: false, error: "이 제출에서 해당 문항을 찾을 수 없습니다." };
      }
      target.manualStatus = verdict.status;
      target.reviewedBy = staff.id;
      // 기록 명료성을 위해 세 판정 모두 확정 점수를 저장(PARTIAL 은 [0,points] 클램프)
      target.manualEarnedPoints =
        verdict.status === "CORRECT"
          ? snapEntry.points
          : verdict.status === "WRONG"
            ? 0
            : round2(Math.max(0, Math.min(snapEntry.points, verdict.earnedPoints ?? 0)));

      const pointsByQuestion = new Map(live.map((s) => [s.questionId, s.points]));
      const { summary, needsReviewCount, unansweredCount, allConfirmed } = summarize(
        rows,
        pointsByQuestion,
      );
      const columns = scoreColumns(summary, allConfirmed);
      const now = new Date();

      const updated = await prisma.examSubmission.updateMany({
        where: { id: submissionId, version: sub.version }, // CAS
        data: {
          responses: toJson(rows),
          scoreSummary: toJson(summary),
          score: columns.score,
          maxScore: columns.maxScore,
          percent: columns.percent,
          status: allConfirmed ? "GRADED" : "SUBMITTED",
          gradedAt: allConfirmed ? (sub.gradedAt ?? now) : null,
          gradedBy: allConfirmed ? staff.id : sub.gradedBy, // 전 문항 확정자 = 수동확정 staff
          version: sub.version + 1,
        },
      });
      if (updated.count !== 1) continue;

      const syncWarning = await syncBridge(submissionId);
      revalidateExamSurfaces(sub.examId);
      return {
        success: true,
        status: allConfirmed ? "GRADED" : "SUBMITTED",
        needsReviewCount,
        unansweredCount,
        scoreSummary: summary,
        ...(syncWarning ? { syncWarning } : {}),
      };
    }
    return { success: false, error: CAS_CONFLICT_MESSAGE };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "수동 판정 저장 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// 액션 4 — LIVE Question 기준 전체 재채점(문항 수정 후). manualStatus 보존.
// ---------------------------------------------------------------------------

export async function regradeSubmission(
  submissionId: string,
): Promise<SubmissionMutationResult> {
  try {
    const staff = await requireStaffAuth();

    for (let attempt = 0; attempt < MAX_CAS_RETRY; attempt++) {
      const sub = await loadScopedSubmission(staff.academyId, submissionId);
      if (!sub) return { success: false, error: NOT_FOUND_MESSAGE };
      if ((await loadExamSubject(sub.examId)) === "KOREAN") {
        return { success: false, error: KO_BLOCK_MESSAGE };
      }
      if (!REVIEWABLE_STATUSES.has(sub.status)) {
        return { success: false, error: "제출된 답안이 있어야 재채점할 수 있습니다." };
      }

      const snapshot = await resolveSnapshot(sub);
      if (snapshot.length === 0) return { success: false, error: NO_QUESTIONS_MESSAGE };
      const liveById = await loadQuestions(
        staff.academyId,
        snapshot.map((s) => s.questionId),
      );
      const { live, droppedQuestionCount } = liveSnapshotEntries(snapshot, liveById);
      if (live.length === 0) return { success: false, error: NO_QUESTIONS_MESSAGE };

      // overrides 없음 — 입력·manualStatus 전량 보존, result 만 LIVE 문항으로 재계산
      const outcome = regradeRows(
        live,
        parseResponses(sub.responses),
        liveById,
        droppedQuestionCount,
      );
      const complete = outcome.allConfirmed;
      const columns = scoreColumns(outcome.summary, complete);
      const now = new Date();

      const updated = await prisma.examSubmission.updateMany({
        where: { id: submissionId, version: sub.version }, // CAS
        data: {
          responses: toJson(outcome.rows),
          scoreSummary: toJson(outcome.summary),
          score: columns.score,
          maxScore: columns.maxScore,
          percent: columns.percent,
          // 재채점으로 NEEDS_REVIEW 가 새로 생기면 GRADED→SUBMITTED 로 되돌린다
          status: complete ? "GRADED" : "SUBMITTED",
          gradedAt: complete ? (sub.gradedAt ?? now) : null,
          gradedBy: complete ? (sub.gradedBy ?? staff.id) : sub.gradedBy,
          version: sub.version + 1,
        },
      });
      if (updated.count !== 1) continue;

      const syncWarning = await syncBridge(submissionId);
      revalidateExamSurfaces(sub.examId);
      return {
        success: true,
        status: complete ? "GRADED" : "SUBMITTED",
        needsReviewCount: outcome.needsReviewCount,
        unansweredCount: outcome.unansweredCount,
        scoreSummary: outcome.summary,
        droppedQuestionCount: outcome.droppedQuestionCount,
        ...(syncWarning ? { syncWarning } : {}),
      };
    }
    return { success: false, error: CAS_CONFLICT_MESSAGE };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "재채점 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}
