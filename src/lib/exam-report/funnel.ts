// ============================================================================
// 시험 분석 목록 행 「퍼널」 계산 — 서버 목록 API 전용 순수 함수 (v4, 26-09-02)
// 정본: docs/exam-analysis-v4-spec.md §2.1
//
// 왜 분리했는가: 목록 API(`GET /api/exam-report/analyses`)는 폴링 표면이라 한 틱에
// 최대 50행을 계산한다. 행 하나의 판정(게이트·깊이·boost 스냅샷·학생 집계)을
// DB·시각 무의존 순수 함수로 떼어 두면 ① 단위 테스트가 가능하고(tests/unit/
// exam-funnel.test.mjs) ② 라우트는 「조회 → 매핑」만 남아 egress 규칙(structure·
// reviewState·analysis·aiMeta raw 는 응답 금지)을 눈으로 검수할 수 있다.
//
// 계약:
//  - 학생 집계는 next-step.ts 의 summarizeFunnelStudents 를 그대로 쓴다(서버·클라
//    동일 산식 — 카드 힌트와 레일 다음 단계가 갈리지 않는다).
//  - 게이트는 map-gate.ts getMapGateStatus 단일 소스(승계 판정 포함).
//  - boost 스냅샷은 aiMeta.boost 원시 판독 — RUNNING 이 BOOST_STALE_MS 를 넘기면
//    FAILED 로 강등 표기한다(라우트 maxDuration 300s + 60s 여유 = 좀비 판정).
//  - now 는 호출부가 넣는다(순수성 — Date 금지).
// ============================================================================

import type {
  ExamReportBoostSnapshot,
  ExamReportFunnel,
  ExamReportFunnelStudents,
} from "@/hooks/use-exam-report-activity";
import type { ExamReviewState } from "./types";
import { getMapGateStatus } from "./map-gate";
import { summarizeFunnelStudents, type FunnelStudentInput } from "./next-step";

/** 분류 술어 입력 타입은 next-step.ts 가 정본(classifyFunnelStudent) — 여기선 재수출. */
export type { FunnelStudentInput } from "./next-step";

/**
 * RUNNING 게이트 좀비 판정 — 보강 라우트 maxDuration(300s) + 60s 여유. 이후엔
 * 재실행 허용(라우트)·FAILED 표기(목록). 라우트와 목록이 같은 값을 봐야 「목록은
 * 실패라는데 라우트는 409」 류의 모순이 없다 — 여기 하나만 정본.
 */
export const BOOST_STALE_MS = 360_000;

export interface ComputeFunnelInput {
  /** reconcile 반영 후 상태 */
  status: string;
  /** "INTERNAL" | "MANUAL" | … (구버전 행은 null 가능) */
  sourceType: string | null | undefined;
  /** parseExamMap(structure)?.questions 의 number 목록(인쇄 순서). 지도 없음 = []. */
  questionNumbers: string[];
  reviewState: ExamReviewState;
  /** analysis->'examLevel' 존재(raw SQL 판정) */
  hasExamLevel: boolean;
  /** aiMeta.boost 원시값(unknown — 형태 보장 없음) */
  boostRaw: unknown;
  students: ReadonlyArray<FunnelStudentInput>;
  /** 판정 시각(epoch ms) */
  now: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * 목록용 boost 스냅샷 — 공유 계약(ExamReportBoostSnapshot) + 추가 필드 3종(additive).
 * - synthFailed: 문항 보강은 DONE 인데 examLevel 종합만 실패(라우트 boost.synthFailed).
 *   클라는 이걸 보고 「심층 분석 없음·N cr 재과금」이 아니라 synthOnly(0 cr) 재시도를
 *   권해야 한다.
 * - error: 라우트가 남긴 실패 코드(CHARGE_FAILED / ALL_BATCHES_FAILED / JOB_CREATE_FAILED …).
 * - stale: RUNNING 좀비를 FAILED 로 강등 표기한 경우 true(실제 FAILED 기록과 구분 —
 *   좀비는 환불 기록이 없다).
 */
export type BoostSnapshot = ExamReportBoostSnapshot & {
  synthFailed?: boolean;
  error?: string;
  stale?: boolean;
};

/**
 * aiMeta.boost → 목록용 스냅샷. 형태가 어긋나면 null(보강 이력 없음과 동치).
 * - completed/total: 라우트가 배치마다 쓰는 boost.progress 우선. 없으면(구 이력·
 *   첫 체크포인트 전) total = boostedCount + failedNumbers.length 로 복원하고
 *   completed 는 그 안으로 클램프한다 — 구 DONE 이력이 12/0 으로 그려지던 결함 수리.
 *   둘 다 없으면 0/0(「진행률 미상」 — 분모 0 방어는 progressPercent 관례).
 * - RUNNING 이 staleMs 를 넘기면 FAILED 로 강등(좀비 게이트 — 라우트도 이 경계에서
 *   재실행을 허용한다) + stale:true.
 */
export function readBoostSnapshot(
  boostRaw: unknown,
  now: number,
  staleMs: number = BOOST_STALE_MS,
): BoostSnapshot | null {
  const boost = asRecord(boostRaw);
  const status = boost.status;
  if (status !== "RUNNING" && status !== "DONE" && status !== "FAILED") return null;
  const startedAt = asFiniteNumber(boost.startedAt) ?? 0;
  const progress = asRecord(boost.progress);
  const progressTotal = asFiniteNumber(progress.total);
  let completed: number;
  let total: number;
  if (progressTotal != null) {
    total = progressTotal;
    completed = asFiniteNumber(progress.completed) ?? 0;
  } else {
    const boosted = asFiniteNumber(boost.boostedCount) ?? 0;
    const failed = Array.isArray(boost.failedNumbers) ? boost.failedNumbers.length : 0;
    total = boosted + failed;
    completed = Math.min(boosted, total);
  }
  const stale = status === "RUNNING" && now - startedAt >= staleMs;
  const error = typeof boost.error === "string" && boost.error.length > 0 ? boost.error : null;
  return {
    status: stale ? "FAILED" : status,
    startedAt,
    completed: Math.max(0, completed),
    total: Math.max(0, total),
    ...(boost.synthFailed === true ? { synthFailed: true } : {}),
    ...(error ? { error } : {}),
    ...(stale ? { stale: true } : {}),
  };
}

/**
 * 깊이 판정(스펙 §2.1 depth):
 *  - INTERNAL 행: examLevel 有 → DEEP, 없으면 SHALLOW(합성만). NONE 은 행이 없는
 *    후보 전용이라 행이 있는 한 나오지 않는다.
 *  - 비INTERNAL: ANALYZED && examLevel → DEEP, 그 외 SHALLOW.
 */
export function computeDepth(input: {
  status: string;
  sourceType: string | null | undefined;
  hasExamLevel: boolean;
}): ExamReportFunnel["depth"] {
  if (input.sourceType === "INTERNAL") {
    return input.hasExamLevel ? "DEEP" : "SHALLOW";
  }
  return input.status === "ANALYZED" && input.hasExamLevel ? "DEEP" : "SHALLOW";
}

/** 행 1개의 퍼널 스칼라 묶음 — 목록 API 가 행마다 호출한다. */
export function computeFunnel(input: ComputeFunnelInput): ExamReportFunnel {
  const isInternal = input.sourceType === "INTERNAL";
  const students: ExamReportFunnelStudents = summarizeFunnelStudents(input.students);
  const questionCount = input.questionNumbers.length;
  // INTERNAL 은 검수 게이트가 **구조상 열림**(스펙 §2.2 주석): 정답·배점은 시험지가
  // 확정한 값이고 report-bridge 는 reviewState 를 아예 쓰지 않는다 — 학생 0명이면
  // 승계도 안 돼 심층 분석 성공 직후 0/N 검수 화면이 배포 단계를 가렸다.
  // next-step.ts resolveFacts(detail 분기)와 같은 규칙.
  if (isInternal) {
    return {
      questionCount,
      confirmedCount: questionCount,
      gateOpen: true,
      grandfathered: true,
      hasExamLevel: input.hasExamLevel,
      depth: computeDepth(input),
      boost: readBoostSnapshot(input.boostRaw, input.now),
      students,
    };
  }
  // 문항 0(지도 없음)이면 게이트 함수는 닫힘을 돌려주지만 승계 규칙이 학생 수만으로
  // 열어 버릴 수 있다 — 검수할 문항 자체가 없으므로 닫힘·0/0 으로 고정한다.
  const gate =
    questionCount > 0
      ? getMapGateStatus({
          questionNumbers: input.questionNumbers,
          reviewState: input.reviewState,
          studentCount: students.total,
        })
      : null;
  return {
    questionCount,
    confirmedCount: gate?.confirmedCount ?? 0,
    gateOpen: gate?.open ?? false,
    grandfathered: gate?.grandfathered ?? false,
    hasExamLevel: input.hasExamLevel,
    depth: computeDepth(input),
    boost: readBoostSnapshot(input.boostRaw, input.now),
    students,
  };
}
