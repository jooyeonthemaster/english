// ============================================================================
// 시험 분석 「다음 단계」 도출 — 순수 함수 단일 소스 (v4, 26-09-02)
// 정본: docs/exam-analysis-v4-spec.md §2.2
//
// 카드 힌트 줄(목록)·레일 「다음 단계」 블록·여정 스트립·학생 관리 뷰가 **전부 이
// 함수 하나**로 「지금 무슨 상태이고 다음에 뭘 해야 하는가」를 말한다. 계기판과
// 버튼이 서로 다른 산식을 갖는 순간 "①은 완료라는데 오른쪽은 빈 상태" 류의
// 모순(E24 수리 이력)이 재현되므로, 판정 로직을 UI 컴포넌트에 복제하지 마라.
//
// 입력 2계: ① 요약 행(row.funnel — 서버 집계, 목록 카드용) ② 상세(detail — 학생
// 행 단위, 레일용·낙관 패치 반영). detail 이 있으면 학생 집계를 detail 에서 재계산
// 해 요약 폴 지연과 무관하게 즉시 수렴한다. 후보(candidate)는 분석 행이 아직 없는
// 자체 시험지다(row null).
//
// 순수성 계약: DB·네트워크·Date·난수 금지. 크레딧 단가는 호출부가 CREDIT_COSTS 에서
// 넣는다(숫자 하드코딩 금지 — 스펙 §1-9).
// ============================================================================

import type {
  ExamCandidateRow,
  ExamReportFunnelStudents,
  ExamReportSummaryRow,
} from "@/hooks/use-exam-report-activity";
import type {
  ExamAnalysisDetail,
  ExamAnalysisStudentRow,
} from "@/components/exam-report/ui-contracts";
import { getMapGateStatus } from "./map-gate";

export type ExamJourneyStep =
  | "analyze"
  | "review"
  | "students"
  | "grading"
  | "reports";

export type ExamJourneyState = "done" | "active" | "pending";

export type ExamNextStepKind =
  | "candidate-analyze"
  | "internal-deepen"
  | "boost-running"
  | "analyzing"
  | "resume-draft"
  | "retry-failed"
  | "resume-upload"
  | "review-gate"
  | "add-students"
  | "issue-answer-links"
  | "await-answers"
  | "confirm-grading"
  | "generate-reports"
  | "reports-generating"
  | "share-reports"
  | "all-done";

export interface ExamNextStepCta {
  label: string;
  /** 과금 CTA 만 — 총액(cr). 표기·2단 확인은 UI 소관. */
  creditCost?: number;
  tone: "primary" | "secondary" | "danger";
}

export interface ExamNextStep {
  kind: ExamNextStepKind;
  /** 1줄 제목 — 카드 힌트 줄은 이것만 쓴다. */
  title: string;
  /** 1~2문장 — 왜 이 단계인지·하면 무엇이 되는지. */
  description: string;
  cta: ExamNextStepCta | null;
  /** CTA 대상 수(학생 n명 · 문항 n개). */
  count?: number;
  progress?: { completed: number; total: number } | null;
  journey: Record<ExamJourneyStep, ExamJourneyState>;
  /** 이 단계가 속한 여정 칸 — 스트립 active 판정과 동일 소스. */
  journeyStep: ExamJourneyStep;
  /**
   * internal-deepen 전용(additive) — boost DONE 인데 총평(examLevel) 합성만 실패한
   * 행. 문항 분석은 저장돼 있으므로 CTA 는 **총평만 재생성**(추가 과금 없음)이고,
   * 레일은 fireBoostRequest(examId, { synthOnly: true }) 로 발사한다.
   */
  synthOnly?: boolean;
}

export interface ExamNextStepCosts {
  /** CREDIT_COSTS.EXAM_ANALYSIS_BOOST — 문항당 */
  boostPerQuestion: number;
  /** CREDIT_COSTS.EXAM_STUDENT_REPORT — 학생당 */
  reportPerStudent: number;
}

export interface DeriveExamNextStepInput {
  row: ExamReportSummaryRow | null;
  candidate?: ExamCandidateRow | null;
  detail?: ExamAnalysisDetail | null;
  costs: ExamNextStepCosts;
}

const JOURNEY_ORDER: ExamJourneyStep[] = [
  "analyze",
  "review",
  "students",
  "grading",
  "reports",
];

const KIND_STEP: Record<ExamNextStepKind, ExamJourneyStep> = {
  "candidate-analyze": "analyze",
  "internal-deepen": "analyze",
  "boost-running": "analyze",
  analyzing: "analyze",
  "resume-draft": "analyze",
  "retry-failed": "analyze",
  "resume-upload": "analyze",
  "review-gate": "review",
  "add-students": "students",
  "issue-answer-links": "grading",
  "await-answers": "grading",
  "confirm-grading": "grading",
  "generate-reports": "reports",
  "reports-generating": "reports",
  "share-reports": "reports",
  "all-done": "reports",
};

/** 학생 분류 술어 입력 — 학생 행의 스칼라 6개(목록 API 는 findMany select 로 조립). */
export type FunnelStudentInput = Pick<
  ExamAnalysisStudentRow,
  | "gradingConfirmed"
  | "reportStatus"
  | "shareEnabled"
  | "answerToken"
  | "answerEnabled"
  | "answerSubmittedAt"
  | "examSubmissionId"
>;

/**
 * 학생 1명의 퍼널 단계 — 배타 분류(스펙 §1-3 단일 함수 계약). 카드 집계
 * (summarizeFunnelStudents)·레일 대상 선별(U5)·학생 관리 뷰(U6)가 **전부 이 술어**를
 * 쓴다 — 세 곳에 복제돼 있던 판정이 갈리면 「집계는 N명인데 버튼은 M명」이 된다.
 *
 *  - needLink        미채점·미제출·링크 미발급
 *  - awaitingAnswer  미채점·미제출·링크 발급됨
 *  - needGrading     미채점·제출됨(OMR 제출 또는 앱 응시 제출)
 *  - needReport      채점 확정·리포트 NONE|FAILED
 *  - generating      채점 확정·리포트 GENERATING
 *  - needShare       리포트 GENERATED·공유 꺼짐
 *  - shared          리포트 GENERATED·공유 켜짐
 *  - done            위 어디에도 안 걸리는 잔여(채점 확정 + 미지의 reportStatus) —
 *                    집계에서 어느 need* 축도 올리지 않는다(종전 산식과 동치)
 */
export type FunnelStudentStage =
  | "needLink"
  | "awaitingAnswer"
  | "needGrading"
  | "needReport"
  | "needShare"
  | "generating"
  | "shared"
  | "done";

export function classifyFunnelStudent(s: FunnelStudentInput): FunnelStudentStage {
  const issued = Boolean(s.answerEnabled && s.answerToken);
  // 제출 증거 2계(26-09-04 §16): OMR 링크 제출(answerSubmittedAt) **또는** 앱 응시
  // 제출(examSubmissionId — 브리지는 SUBMITTED/GRADED 에만 행을 만든다).
  // 【폐기된 특례】 종전엔 INTERNAL 이면 무조건 needGrading 이었다 — "자체 시험지는
  // 행이 존재한다 = 제출했다"는 전제였는데, 이제 강사가 응시 **전에** 로스터 학생을
  // 담고 OMR 링크를 보낼 수 있어(§10·§14) 그 전제가 깨졌다. 그대로 두면 답을 낸 적
  // 없는 학생이 「채점 필요」로 집계돼 도크가 존재하지 않는 채점을 시킨다.
  const submitted = s.answerSubmittedAt != null || s.examSubmissionId != null;
  const graded = s.gradingConfirmed === true;
  if (!graded) {
    if (submitted) return "needGrading";
    if (issued) return "awaitingAnswer";
    return "needLink";
  }
  if (s.reportStatus === "NONE" || s.reportStatus === "FAILED") return "needReport";
  if (s.reportStatus === "GENERATING") return "generating";
  if (s.reportStatus === "GENERATED") return s.shareEnabled ? "shared" : "needShare";
  return "done";
}

/**
 * 학생 행 배열 → 퍼널 집계. 서버(목록 API)와 클라(detail)가 **같은 함수**를 써서
 * 카드와 레일의 숫자가 갈리지 않는다. 단계 판정은 classifyFunnelStudent 하나로만
 * 한다(여기에 술어를 다시 쓰지 마라).
 *
 * 26-09-04(§16): isInternal 인자를 없앴다 — 「자체 시험지는 답안 링크 축이 0」이라는
 * 규칙 자체가 폐기됐다(OMR 링크가 자체 시험지의 메인 배포 수단이 됐다, §15.2).
 */
export function summarizeFunnelStudents(
  students: ReadonlyArray<FunnelStudentInput>,
): ExamReportFunnelStudents {
  const out: ExamReportFunnelStudents = {
    total: students.length,
    answerIssued: 0,
    answerSubmitted: 0,
    graded: 0,
    reportGenerated: 0,
    reportGenerating: 0,
    reportFailed: 0,
    shared: 0,
    needLink: 0,
    awaitingAnswer: 0,
    needGrading: 0,
    needReport: 0,
    needShare: 0,
  };
  for (const s of students) {
    // 상태 카운터(중첩 허용 — 여러 축에 동시에 올라간다)
    if (Boolean(s.answerEnabled && s.answerToken)) out.answerIssued += 1;
    if (s.answerSubmittedAt != null) out.answerSubmitted += 1;
    if (s.gradingConfirmed === true) out.graded += 1;
    if (s.reportStatus === "GENERATED") out.reportGenerated += 1;
    if (s.reportStatus === "GENERATING") out.reportGenerating += 1;
    if (s.reportStatus === "FAILED") out.reportFailed += 1;
    if (s.reportStatus === "GENERATED" && s.shareEnabled) out.shared += 1;

    // need* 축(배타 — 학생당 정확히 1단계). generating/shared 는 위 카운터가 이미
    // 셌고, done 은 어느 축도 올리지 않는다.
    switch (classifyFunnelStudent(s)) {
      case "needLink":
        out.needLink += 1;
        break;
      case "awaitingAnswer":
        out.awaitingAnswer += 1;
        break;
      case "needGrading":
        out.needGrading += 1;
        break;
      case "needReport":
        out.needReport += 1;
        break;
      case "needShare":
        out.needShare += 1;
        break;
      case "generating":
      case "shared":
      case "done":
        break;
    }
  }
  return out;
}

function emptyStudents(): ExamReportFunnelStudents {
  return summarizeFunnelStudents([]);
}

function baseJourney(): Record<ExamJourneyStep, ExamJourneyState> {
  return {
    analyze: "pending",
    review: "pending",
    students: "pending",
    grading: "pending",
    reports: "pending",
  };
}

interface Resolved {
  isInternal: boolean;
  questionCount: number;
  hasExamLevel: boolean;
  gateOpen: boolean;
  confirmedCount: number;
  students: ExamReportFunnelStudents;
}

function resolveFacts(
  row: ExamReportSummaryRow,
  detail: ExamAnalysisDetail | null | undefined,
): Resolved {
  const isInternal = row.sourceType === "INTERNAL";
  const funnel = row.funnel;
  if (detail) {
    const numbers = detail.examMap?.questions.map((q) => q.number) ?? [];
    const gate =
      numbers.length > 0
        ? getMapGateStatus({
            questionNumbers: numbers,
            reviewState: detail.reviewState,
            studentCount: detail.students.length,
          })
        : null;
    // INTERNAL 은 검수 게이트가 **구조상 열림**(스펙 §2.2 주석): 정답·배점은 시험지가
    // 이미 확정한 값이라 report-bridge 는 reviewState 를 쓰지 않는다 — 학생 0명이면
    // 승계도 안 돼 0/N 검수 화면이 배포 단계를 가렸다. funnel.ts computeFunnel 과
    // 같은 규칙(서버·클라 동일 산식).
    return {
      isInternal,
      questionCount: numbers.length,
      hasExamLevel: detail.analysis?.examLevel != null,
      gateOpen: isInternal || (gate?.open ?? false),
      confirmedCount: isInternal ? numbers.length : (gate?.confirmedCount ?? 0),
      students: summarizeFunnelStudents(detail.students),
    };
  }
  const questionCount = funnel?.questionCount ?? 0;
  return {
    isInternal,
    questionCount,
    hasExamLevel: funnel?.hasExamLevel ?? false,
    gateOpen: isInternal || (funnel?.gateOpen ?? false),
    confirmedCount: isInternal ? questionCount : (funnel?.confirmedCount ?? 0),
    students: funnel?.students ?? {
      ...emptyStudents(),
      total: row.studentCount,
    },
  };
}

function finalize(
  partial: Omit<ExamNextStep, "journey" | "journeyStep">,
  facts: {
    analyzeDone: boolean;
    gateOpen: boolean;
    students: ExamReportFunnelStudents;
  },
): ExamNextStep {
  const step = KIND_STEP[partial.kind];
  const journey = baseJourney();
  const st = facts.students;
  const done: Record<ExamJourneyStep, boolean> = {
    analyze: facts.analyzeDone,
    review: facts.gateOpen,
    students: st.total > 0,
    grading: st.total > 0 && st.graded === st.total,
    reports:
      st.total > 0 && st.reportGenerated === st.total && st.shared === st.total,
  };
  for (const key of JOURNEY_ORDER) {
    journey[key] = done[key] ? "done" : "pending";
  }
  // all-done 은 리포트 칸까지 전부 완료 — active 칸 없음(전부 done).
  if (partial.kind !== "all-done") journey[step] = "active";
  return { ...partial, journey, journeyStep: step };
}

/**
 * 「지금 안 하면 다음이 막히는」 퍼널 단계 — 여기 있는 동안은 INTERNAL 강화(AI 분석)
 * 권유가 도크를 빼앗지 못한다. 밖(add-students·await-answers·all-done)은 강사가
 * 기다리거나 끝낸 상태라, 그때 AI 분석을 권하는 것이 가장 값싸다(리포트를 만들기
 * **전**이라 재생성 재과금이 없다).
 */
const BLOCKING_FUNNEL_KINDS: ReadonlySet<ExamNextStepKind> = new Set<ExamNextStepKind>([
  "review-gate",
  "issue-answer-links",
  "confirm-grading",
  "generate-reports",
  "reports-generating",
  "share-reports",
]);

/** row.funnel.boost 의 타입(구버전 행은 funnel 자체가 없다). */
type FunnelBoost = NonNullable<ExamReportSummaryRow["funnel"]>["boost"];

/**
 * 학생 퍼널 단계 — 검수 → 학생 → 답안 → 채점 → 리포트 → 공유 → 완료.
 * INTERNAL 강화(internal-deepen) 판정과 **분리**한 이유는 26-09-04 사용자 지적이다:
 * "심층 분석은 안 했는데 왜 김연주 리포트는 완성이야?" — 자체 시험지는 출제 해설
 * 합성만으로도 채점·리포트가 되고(서버 게이트 generate/route.ts 는 status ANALYZED +
 * gradingConfirmed 만 본다. examLevel 을 요구한 적이 없다), 그래서 AI 분석은
 * **관문이 아니라 강화**다. 종전에는 이 함수 전체보다 위에서 internal-deepen 이 먼저
 * 매치돼, 채점이 밀려 있어도 도크가 영원히 「AI 분석이 아직 없습니다」만 말했다
 * (= 선행조건처럼 읽히는 거짓 계기판).
 */
function deriveFunnelStep(
  facts: Resolved,
  costs: ExamNextStepCosts,
): Omit<ExamNextStep, "journey" | "journeyStep"> {
  const st = facts.students;
  // ── 검수 게이트 ──────────────────────────────────────────────────────────
  if (!facts.gateOpen) {
    const total = facts.questionCount;
    const k = facts.confirmedCount;
    return {
      kind: "review-gate",
      title: `정답·배점을 확인하세요 (${k}/${total})`,
      description:
        "AI가 도출한 정답과 배점을 문항별로 확인해야 학생 채점을 시작할 수 있습니다.",
      cta: { label: "정답·배점 검수", tone: "primary" },
      count: Math.max(0, total - k),
      progress: { completed: k, total },
    };
  }

  // ── 학생 ─────────────────────────────────────────────────────────────────
  if (st.total === 0) {
    if (facts.isInternal) {
      return {
        kind: "add-students",
        title: "아직 응시한 학생이 없습니다",
        // 26-09-04 §16: 「수동 추가는 지원하지 않습니다」는 폐기된 자구다 — [학생] 탭
        // 로스터에서 클래스 학생에게 답안 링크를 보낼 수 있고(§10·§14), 감독이 그걸
        // 메인 경로로 확정했다(§15.2). 앱 응시(배포)는 로스터 섹션 아래 링크로 남는다.
        description:
          "[학생] 탭에서 클래스 학생에게 답안 링크를 보내세요. 시험지를 배포해 앱으로 응시하게 할 수도 있습니다.",
        cta: { label: "답안 링크 보내기", tone: "primary" },
        progress: null,
      };
    }
    return {
      kind: "add-students",
      title: "학생을 추가하세요",
      description:
        "클래스 학생을 이 시험에 등록하면 답안 링크를 보내고 채점할 수 있습니다.",
      cta: { label: "학생 추가", tone: "primary" },
      progress: null,
    };
  }

  // ── 답안·채점 ────────────────────────────────────────────────────────────
  if (st.needLink > 0) {
    return {
      kind: "issue-answer-links",
      title: `답안 링크를 보내세요 (${st.needLink}명)`,
      description:
        "학생이 링크에서 답을 입력하면 자동 채점됩니다. 발급과 동시에 이름·링크 표가 복사됩니다. 직접 채점을 입력해도 됩니다.",
      cta: { label: "답안 링크 발급·복사", tone: "primary" },
      count: st.needLink,
      progress: null,
    };
  }
  if (st.needGrading > 0) {
    // 【26-09-04 사용자 지시】 도크 버튼은 **목표**를 말한다 — "이 버튼은 그 학생
    //   리포트 생성 기능이 되어야 할 것 같은데?". 채점 확정은 리포트로 가는 길목일
    //   뿐이라, CTA 는 「학생 리포트 생성」으로 두고 누르면 **아직 채점되지 않은
    //   문항으로 데려간다**(rail-next-step-actions — focusStudent(id, number)).
    //   과금 칩은 붙이지 않는다: 이 단계의 클릭은 차감이 아니라 이동이다(칩을 달면
    //   "눌렀는데 5cr 안 나갔다"가 아니라 "안 눌렀는데 나갈 뻔했다"는 오해가 된다).
    return {
      kind: "confirm-grading",
      title: `학생 리포트를 생성하세요 (${st.needGrading}명)`,
      description:
        "자동 채점되지 않은 문항이 남아 있습니다. 정답과 대조해 정오를 정하고 채점을 확정하면 리포트를 만들 수 있습니다.",
      cta: { label: "학생 리포트 생성", tone: "primary" },
      count: st.needGrading,
      progress: { completed: st.graded, total: st.total },
    };
  }
  const reportsIdle =
    st.needReport === 0 && st.needShare === 0 && st.reportGenerating === 0;
  if (st.awaitingAnswer > 0 && reportsIdle) {
    return {
      kind: "await-answers",
      title: `학생 답안 제출을 기다리는 중 (${st.awaitingAnswer}명)`,
      description:
        "제출되면 채점 확인 단계로 넘어갑니다. 링크를 다시 보내야 하면 표를 복사하세요.",
      cta: { label: "답안 링크 표 복사", tone: "secondary" },
      count: st.awaitingAnswer,
      progress: { completed: st.answerSubmitted, total: st.total },
    };
  }

  // ── 리포트 ───────────────────────────────────────────────────────────────
  // 【26-09-03 사용자 지시 — 리포트 2관점 분리】 여기서부터의 「리포트」는 전부
  //   **학생 리포트**(학생이 시험을 치른 뒤의 채점·상담 리포트)다. 시험지 **자체**의
  //   분석 리포트(총평·난이도·유형·문항별)는 이 퍼널 밖의 별개 축 — 레일 [총평]
  //   도크의 공유 블록(rail-exam-share-block)이 담당하고 여기 kind 로 나타나지 않는다.
  //   자구에 「학생 리포트」를 박아 두 관점이 화면에서 섞이지 않게 한다.
  if (st.needReport > 0) {
    return {
      kind: "generate-reports",
      title: `학생 리포트를 생성하세요 (${st.needReport}명)`,
      description:
        st.reportFailed > 0
          ? `채점이 확정된 학생 개인별 상담 리포트를 AI가 작성합니다(실패 ${st.reportFailed}명 재시도 포함). 학생당 ${costs.reportPerStudent}cr.`
          : `채점이 확정된 학생 개인별 상담 리포트를 AI가 작성합니다. 학생당 ${costs.reportPerStudent}cr.`,
      // 【26-09-04 사용자 지시】 "무슨 학생의 리포트를 생성할지 학생 목록에서 선택
      //   하게 해야지." 종전 CTA 는 대상이 **보이지 않는 일괄 과금**이었다(두 번
      //   누르면 needReport 전원에게 5cr×N 이 나갔다). 이제 이 버튼은 [학생] 탭의
      //   목록에서 **대상을 체크**하는 동작이고, 차감은 체크가 띄우는 하단 픽바의
      //   2단 확인에서 일어난다. 그래서 creditCost 를 달지 않는다 — confirm-grading
      //   과 같은 규칙(이동에 과금 칩을 달면 "안 눌렀는데 나갈 뻔했다"는 오해가
      //   된다). 총액은 선택이 끝난 픽바 버튼이 말한다.
      cta: { label: `리포트 대상 ${st.needReport}명 체크`, tone: "primary" },
      count: st.needReport,
      progress: { completed: st.reportGenerated, total: st.total },
    };
  }
  if (st.reportGenerating > 0) {
    return {
      kind: "reports-generating",
      title: `학생 리포트 생성 중 (${st.reportGenerating}명)`,
      description: "AI가 학생별 상담 리포트를 작성하고 있습니다. 끝나면 공유 링크를 발급할 수 있습니다.",
      cta: null,
      count: st.reportGenerating,
      progress: { completed: st.reportGenerated, total: st.total },
    };
  }
  if (st.needShare > 0) {
    return {
      kind: "share-reports",
      title: `학생 리포트 공유 링크를 발급하세요 (${st.needShare}명)`,
      description:
        "리포트가 완성된 학생의 공유 링크를 한 번에 발급하고 이름·링크 표를 복사합니다.",
      cta: { label: "공유 링크 발급·복사", tone: "primary" },
      count: st.needShare,
      progress: { completed: st.shared, total: st.total },
    };
  }
  if (st.awaitingAnswer > 0) {
    return {
      kind: "await-answers",
      title: `학생 답안 제출을 기다리는 중 (${st.awaitingAnswer}명)`,
      description:
        "나머지 학생은 리포트까지 끝났습니다. 제출되면 채점 확인 단계로 넘어갑니다.",
      cta: { label: "답안 링크 표 복사", tone: "secondary" },
      count: st.awaitingAnswer,
      progress: { completed: st.answerSubmitted, total: st.total },
    };
  }
  return {
    kind: "all-done",
    title: "모든 학생 리포트를 공유했습니다",
    description: "링크 표를 다시 복사해 학부모·학생에게 전달하세요.",
    cta: { label: "공유 링크 전체 복사", tone: "secondary" },
    count: st.shared,
    progress: { completed: st.shared, total: st.total },
  };
}

/**
 * INTERNAL 「AI 분석 전」 강화 단계. 호출부는 학생 퍼널에 **지금 해야 할 일이 없을
 * 때만**(BLOCKING_FUNNEL_KINDS 밖) 이 단계를 띄운다 — 기다리는 중이거나 다 끝났을
 * 때가 시험지를 풍부하게 만들 시점이고, 채점·리포트가 밀려 있으면 그게 먼저다.
 */
function internalDeepenStep(
  facts: Resolved,
  boost: FunnelBoost | null,
  costs: ExamNextStepCosts,
): Omit<ExamNextStep, "journey" | "journeyStep"> {
  const n = facts.questionCount;
  // DONE + synthFailed: 문항 분석(과금 대상)은 저장됐고 총평 합성만 실패 — 전액
  // 재과금 CTA 가 아니라 총평만 다시(무과금, synthOnly).
  if (boost?.status === "DONE" && boost.synthFailed) {
    return {
      kind: "internal-deepen",
      title: "문항 분석은 끝났지만 총평 생성이 실패했습니다",
      description:
        "문항별 분석은 저장되어 있습니다. 총평만 다시 만듭니다(추가 과금 없음).",
      cta: { label: "총평 다시 생성", tone: "primary" },
      count: n,
      progress: null,
      synthOnly: true,
    };
  }
  const failedBefore = boost?.status === "FAILED";
  // FAILED 사유별 자구 — 「크레딧은 환불」은 실제로 환불된 경우에만 말한다:
  //  · CHARGE_FAILED = 차감 자체가 실패(환불할 것이 없음)
  //  · stale        = RUNNING 좀비 강등(응답이 끊겨 환불 여부 미상)
  const failedDescription =
    boost?.status === "FAILED" && boost.error === "CHARGE_FAILED"
      ? "크레딧 부족으로 AI 분석을 시작하지 못했습니다(차감 없음). 충전 후 다시 시작하세요."
      : boost?.status === "FAILED" && boost.stale
        ? "응답이 끊겨 AI 분석이 완료되지 않았습니다. 크레딧 환불 여부는 크레딧 관리에서 확인한 뒤 다시 시작하세요."
        : "지난 AI 분석이 실패했습니다(크레딧은 환불). 다시 시작하면 문항별 함정·개념·전략과 시험 총평을 만듭니다.";
  return {
    kind: "internal-deepen",
    title: failedBefore
      ? "AI 분석이 완료되지 않았습니다"
      : "AI 분석이 아직 없습니다",
    description: failedBefore
      ? failedDescription
      : "지금 보이는 문항별 내용은 출제할 때 저장한 해설입니다. AI 분석을 돌리면 문항별 함정·개념·전략과 시험 총평이 채워집니다.",
    cta: {
      label: failedBefore ? "AI 분석 다시 시작" : "AI 분석 시작",
      creditCost: n * costs.boostPerQuestion,
      tone: "primary",
    },
    count: n,
    progress: null,
  };
}

/**
 * 다음 단계 도출 — 스펙 §2.2 판정 순서(위에서 첫 매치).
 * 26-09-04 개정: 상태 계열(후보·ANALYZING·boost·FAILED·DRAFT) 뒤는 **학생 퍼널이
 * 기본**이고, INTERNAL 강화(AI 분석)는 퍼널이 차단 단계가 아닐 때만 그 자리를
 * 가져간다(BLOCKING_FUNNEL_KINDS 주석 참조).
 */
export function deriveExamNextStep(input: DeriveExamNextStepInput): ExamNextStep {
  const { row, candidate, detail, costs } = input;

  // ── 후보(분석 행 없음) ────────────────────────────────────────────────────
  if (!row) {
    const n = candidate?.questionCount ?? 0;
    return finalize(
      {
        kind: "candidate-analyze",
        title: "AI 분석을 시작하세요",
        description: `스모트 시험지 문항 ${n}개를 AI가 문항별로 분석하고 시험 총평을 만듭니다.`,
        cta: {
          label: "AI 분석 시작",
          creditCost: n * costs.boostPerQuestion,
          tone: "primary",
        },
        count: n,
        progress: null,
      },
      { analyzeDone: false, gateOpen: false, students: emptyStudents() },
    );
  }

  const facts = resolveFacts(row, detail);
  const st = facts.students;
  const boost = row.funnel?.boost ?? null;
  // 【26-09-04】 여정 「분석」 칸은 status ANALYZED 하나로 판정한다. 종전에는 INTERNAL
  // 에 한해 examLevel(AI 총평)까지 요구해서, 검수·학생이 ✓인데 분석만 영영 미완인
  // 「✓가 뒤에만 붙는」 모순된 스트립이 나왔다(사용자 지적). 자체 시험지는 출제
  // 해설 합성으로 분석 단계를 이미 통과한 상태이고, AI 분석 여부는 **깊이 배지**
  // (SHALLOW/DEEP · funnel.depth)가 따로 말한다 — 두 축을 한 칸에 겹쳐 놓지 않는다.
  const analyzeDone = row.status === "ANALYZED";
  const fin = (partial: Omit<ExamNextStep, "journey" | "journeyStep">) =>
    finalize(partial, { analyzeDone, gateOpen: facts.gateOpen, students: st });

  // ── 분석 진행·실패·중단 ──────────────────────────────────────────────────
  if (row.status === "ANALYZING") {
    const p = row.progress ?? null;
    const has = !!p && p.total > 0;
    return fin({
      kind: "analyzing",
      title: "시험지 분석 중",
      description: has
        ? `${p.completed}/${p.total} 문항 분석 중 · 끝나면 정답·배점 검수로 넘어갑니다.`
        : "문항을 인식하는 중입니다. 끝나면 정답·배점 검수로 넘어갑니다.",
      cta: null,
      progress: has ? { completed: p.completed, total: p.total } : null,
    });
  }
  if (boost?.status === "RUNNING") {
    return fin({
      kind: "boost-running",
      title: "AI 분석 중",
      description: `${boost.completed}/${boost.total} 문항 · 끝나면 총평과 문항별 분석이 자동으로 채워집니다.`,
      cta: null,
      progress: { completed: boost.completed, total: boost.total },
    });
  }
  if (row.status === "FAILED") {
    return fin({
      kind: "retry-failed",
      title: "분석이 실패했습니다",
      description:
        "다시 분석을 요청하면 실패한 문항만 이어서 분석합니다(이미 성공한 문항은 과금하지 않습니다).",
      cta: { label: "다시 분석", tone: "danger" },
      progress: null,
    });
  }
  if (row.status === "DRAFT") {
    const orphan =
      !facts.isInternal && row.hasSourceFiles === false && row.studentCount === 0;
    if (!orphan && row.hasSourceFiles === true) {
      return fin({
        kind: "resume-draft",
        title: "분석이 중단되었습니다",
        description: "이어서 분석하면 남은 문항부터 다시 진행합니다.",
        cta: { label: "이어서 분석", tone: "primary" },
        progress: null,
      });
    }
    return fin({
      kind: "resume-upload",
      title: "시험지 사진이 없습니다",
      description: "사진·PDF를 올려 등록을 마치면 분석이 시작됩니다.",
      cta: { label: "이어서 등록", tone: "primary" },
      progress: null,
    });
  }

  // ── 학생 퍼널 vs INTERNAL 강화 ───────────────────────────────────────────
  // 두 갈래를 **각각 끝까지 낸 뒤** 고른다: 퍼널에 차단 단계가 있으면 그것이 이기고,
  // 없을 때(학생 대기·전원 완료)만 「AI 분석」 강화를 권한다. 순서를 바꾼 것이지
  // 단계를 없앤 게 아니다 — 깊이 배지(SHALLOW/DEEP)와 과금 CTA 는 그대로다.
  const funnel = deriveFunnelStep(facts, costs);
  if (
    facts.isInternal &&
    !facts.hasExamLevel &&
    !BLOCKING_FUNNEL_KINDS.has(funnel.kind)
  ) {
    return fin(internalDeepenStep(facts, boost, costs));
  }
  return fin(funnel);
}

/**
 * **분석 계열 단계만** 뽑는다 — 중앙 판 하단 도크(analysis-dock) 전용(26-09-04).
 *
 * 「다음 단계」는 강사가 지금 할 일 **하나**를 말하지만, 도크의 [AI 분석 시작]은
 * 그 시험지에 언제나 걸 수 있는 **분석 요청**이다. 강화(internal-deepen)를 학생
 * 퍼널 뒤로 미루면서, 그 둘을 같은 함수 하나로 읽으면 「채점이 밀려 있는 동안
 * AI 분석 버튼이 통째로 사라지는」 진입점 소실이 생긴다 — 그래서 도크는 이 함수를,
 * 레일·카드 힌트는 deriveExamNextStep 을 본다. 판정 로직은 여전히 이 파일 하나다.
 *
 * null = 이 대상에 걸 분석이 없다(도크는 비활성 + 카드 글로우 안내).
 */
export function deriveExamAnalyzeStep(
  input: DeriveExamNextStepInput,
): ExamNextStep | null {
  const step = deriveExamNextStep(input);
  if (step.journeyStep === "analyze") return step;
  const { row, detail, costs } = input;
  if (!row) return null;
  const facts = resolveFacts(row, detail);
  if (!facts.isInternal || facts.hasExamLevel) return null;
  return finalize(
    internalDeepenStep(facts, row.funnel?.boost ?? null, costs),
    {
      analyzeDone: row.status === "ANALYZED",
      gateOpen: facts.gateOpen,
      students: facts.students,
    },
  );
}

// ── 레일 하단 도크 관점(26-09-03 리포트 2관점 분리) ──────────────────────────
//
// 리포트는 두 관점이다: ① 시험지 **자체**를 분석한 「시험지 분석 리포트」(공유 축만
// 있고 과금·생성 단계가 없다 — 분석이 곧 리포트) ② 학생이 그 시험을 치른 뒤의
// 「학생 리포트」(위 퍼널: 학생→답안→채점→생성→공유). 레일 하단 도크는 한 블록만
// 드므로 **활성 탭**이 관점을 고른다 — [학생] 탭 = 학생 리포트 퍼널 블록, 그 외
// 탭([총평]·[원본]) = 시험지 분석 리포트 공유 블록. (26-09-04 레일은 3탭 —
// 구 [문항]은 [총평] 안으로 합류, [정보]는 폐기.)
// 단, 분석·검수 단계(journeyStep analyze·review)는 시험지 자체가 아직 공개할 상태가
// 아니므로 탭과 무관하게 퍼널 블록(진행률·검수 CTA)이 도크를 든다.
// 이 판정도 UI 에 복제하지 않는다 — 여기 한 함수만 쓴다(§1-3 단일 소스 규약).

export type RailDockPerspective = "exam" | "students";

export function resolveRailDockPerspective(
  step: Pick<ExamNextStep, "journeyStep">,
  activeTab: string,
): RailDockPerspective {
  if (step.journeyStep === "analyze" || step.journeyStep === "review")
    return "students";
  return activeTab === "students" ? "students" : "exam";
}
