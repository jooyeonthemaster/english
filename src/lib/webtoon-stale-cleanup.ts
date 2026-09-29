// ============================================================================
// Webtoon stale-job reaper — 멈춘 웹툰 생성 행을 FAILED 로 마감하고 환불한다.
// ----------------------------------------------------------------------------
// 왜 필요한가: webtoon-generate 런(Trigger, maxDuration 900s · retry 1회)이 워커
// 교체·크래시·maxDuration 초과로 죽으면 프로세서의 catch(환불 + FAILED)가 돌지 않아
// 행이 PENDING/GENERATING 에 영원히 남고 차감된 크레딧도 묶인다. 운영에는 그 행을
// 다시 집어 가는 주체가 없다(아래 로컬 워커의 30분 재수거는 dev 전용).
// extraction-reaper(5분 주기)가 전 학원을 한 번에 훑는다.
//
// 판정 — 모두 imageUrl null 한정(이미지가 붙은 행은 절대 건드리지 않는다):
//   ① GENERATING, (startedAt ?? createdAt) < now − 25분
//      프로세서 최악 소요 ≈ 스토리보드 2×120s + 이미지 2×280s(+백오프) ≈ 14분이고
//      Trigger 는 15분에 런을 끊는다 → 25분 지난 GENERATING 은 실행 주체가 죽은 것이 확정.
//   ② PENDING 인데 triggerRunId 없음, createdAt < now − 25분
//      디스패치는 생성 요청 안에서 행 생성 직후 일어난다 — 25분째 비어 있으면 요청이
//      중간에 죽어 아무도 이 행을 실행하지 않는다.
//   ③ PENDING(디스패치됨), createdAt < now − 90분
//      Trigger 큐 대기 중인 정상 행이다. webtoon-generate 큐는 전 학원 공유
//      concurrencyLimit 4 라 20편 일괄 생성 하나만으로도 꼬리 행이 10~15분, 여러 학원이 겹치면 더 기다린다.
//      25분에 자르면 정상 대기열을 오살하므로 큐 대기에는 넉넉한 벽을 따로 둔다.
//      (늦게 시작된 런은 FAILED 행을 claim 하지 못해 NOT_CLAIMABLE 로 끝난다 — 이중 과금·무료 인도 없음.)
//
// 로컬 dev 워커(webtoon-local-worker.ts)와의 호환: 프로세서는 startedAt 이 30분 지난
// GENERATING 행을 재수거(reclaim)한다. 리퍼의 25분이 항상 먼저 FAILED 로 뒤집고, FAILED
// 는 claim 대상이 아니므로 같은 행을 리퍼와 재수거가 동시에 처리하는 일이 없다. 리퍼가
// 돌지 않는 순수 dev(trigger dev 미기동)에서는 기존 30분 재수거가 그대로 동작한다(무회귀).
// 로컬 워커도 한 행을 위 최악 소요(≈14분) 안에 끝내므로 25분 벽에 살아 있는 행은 없다.
//
// 원자성: 후보를 읽은 뒤 행마다 **같은 판정 조건 + id** 로 updateMany 한다. 그 사이
// 완료(status/imageUrl 변경)되거나 재수거(startedAt 갱신)된 행은 조건에서 빠져
// count 0 → 건드리지도 환불하지도 않는다.
//
// 환불: refundCredits 는 설명(description) 단위로 멱등이고 원 거래액을 넘겨 환불하지
// 않는다 — 설명을 상수로 고정해 재실행·재시도가 절대 이중 환불이 되지 않게 한다.
// 환불이 일시 오류로 실패한 행은 다음 패스들에서 24시간 동안 다시 시도한다
// (FAILED 로 뒤집힌 뒤라 본 판정에는 다시 걸리지 않기 때문 — 크레딧 증발 방지).
// ============================================================================

import type { Prisma } from "@prisma/client";

import { refundCredits } from "@/lib/credits";
import { prisma } from "@/lib/prisma";
import { friendlyWebtoonError } from "@/lib/webtoon-errors";
import {
  DEFAULT_WEBTOON_IMAGE_PLAN,
  WEBTOON_IMAGE_PLANS,
  planForModelId,
} from "@/lib/webtoon-models";

/** ①② 실행 중·미디스패치 행의 벽. 로컬 워커 재수거(30분)보다 짧아야 한다. */
export const WEBTOON_IN_FLIGHT_STALE_MS = 25 * 60 * 1000;
/** ③ Trigger 큐 대기 행의 벽(공유 큐 적체 허용). */
export const WEBTOON_QUEUED_STALE_MS = 90 * 60 * 1000;
/** 환불 실패 행을 다시 시도하는 기간. */
const REFUND_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
/** 환불 재시도 스윕이 한 패스에서 허용하는 환불 실패 수 — 영구 오류 무한 재시도 방지. */
const MAX_REFUND_FAILURES_PER_PASS = 5;
/** 한 패스에서 다루는 최대 행 수(리퍼 한 번이 길어지지 않게). */
const STALE_BATCH_SIZE = 200;

/** 환불 설명 — refundCredits 의 설명 단위 멱등 키. 바꾸지 말 것(금액 상한은 별도로 이중 환불을 막는다). */
const STALE_REFUND_REASON = "Webtoon stale job reaped";
/** 강사에게 보이는 마감 메시지. 재시도 스윕이 "리퍼가 마감한 행"을 알아보는 표식이기도 하다. */
const STALE_ERROR_MESSAGE = friendlyWebtoonError("stale job interrupted");

export interface WebtoonStaleCleanupResult {
  /** 이번 패스에서 FAILED 로 뒤집은 행 수. */
  reaped: number;
  /** 실제로 크레딧이 돌아간 환불 수(이번 마감분 + 재시도분). */
  refunded: number;
  /** 환불 호출이 예외로 끝난 수(다음 패스에서 재시도된다). */
  refundFailed: number;
  /** 이전 패스에서 환불이 빠진 행을 다시 시도한 수. */
  refundRetried: number;
  /** 패스 자체가 중단됐을 때의 원인(다른 리퍼 작업은 계속 돈다). */
  error?: string;
}

type StaleRow = {
  id: string;
  academyId: string;
  imageModel: string | null;
  creditTransactionId: string | null;
};

function buildStaleWhere(now: Date): Prisma.WebtoonWhereInput {
  const inFlightCutoff = new Date(now.getTime() - WEBTOON_IN_FLIGHT_STALE_MS);
  const queuedCutoff = new Date(now.getTime() - WEBTOON_QUEUED_STALE_MS);
  return {
    imageUrl: null,
    OR: [
      // ① 실행 중인데 벽을 넘김 — startedAt 기준, 레거시(startedAt 없음)는 createdAt.
      { status: "GENERATING", startedAt: { lt: inFlightCutoff } },
      { status: "GENERATING", startedAt: null, createdAt: { lt: inFlightCutoff } },
      // ② 디스패치 흔적 없는 대기 행.
      { status: "PENDING", triggerRunId: null, createdAt: { lt: inFlightCutoff } },
      // ③ 디스패치된 큐 대기 행 — 큐 적체를 감안한 긴 벽.
      { status: "PENDING", triggerRunId: { not: null }, createdAt: { lt: queuedCutoff } },
    ],
  };
}

function operationTypeFor(row: StaleRow) {
  // 프로세서와 같은 규칙: 레거시 model id 도 같은 등급으로, 등급 이전 행은 기본 등급.
  const plan =
    planForModelId(row.imageModel) ?? WEBTOON_IMAGE_PLANS[DEFAULT_WEBTOON_IMAGE_PLAN];
  return plan.operationType;
}

/** 리퍼 마감이 아닌 FAILED 행(프로세서·디스패치 환불 실패분)의 재환불 설명 — 멱등 키. */
const FAILED_REFUND_RETRY_REASON = "Webtoon failed refund retry";

/** 환불 1건. 반환 = 실제로 크레딧이 돌아갔는지. 예외는 호출부가 센다. */
async function refundStaleRow(row: StaleRow, reason: string = STALE_REFUND_REASON): Promise<boolean> {
  if (!row.creditTransactionId) return false;
  const amount = await refundCredits(
    row.academyId,
    operationTypeFor(row),
    row.creditTransactionId,
    reason,
  );
  return amount > 0;
}

/**
 * 최근 24시간 안에 FAILED 가 됐는데 환불 기록(REFUND)이 하나도 없는 행을 다시 환불한다.
 * 마감 주체를 가리지 않는다 — 리퍼 마감분뿐 아니라 프로세서·디스패치 경로가 FAILED 를
 * 쓰고 자기 환불이 일시 오류로 실패한 행도 여기서 돌려받는다(모든 실패 문구가 강사에게
 * "크레딧은 환불됐어요"라고 안내하므로, 문구로 거르면 그 약속이 깨진다).
 * FAILED 는 언제나 환불 대상이다. REFUND 가 이미 있으면 건너뛰고, refundCredits 의
 * 원 거래액 상한이 어떤 경우에도 이중 환불을 막는다.
 */
async function retryMissingRefunds(now: Date) {
  // "REFUND 없음" 조건을 SQL 에서 먼저 건다(NOT EXISTS). 예전처럼 200건을 먼저 자른 뒤
  // 메모리에서 거르면, 장애로 FAILED 가 200건을 넘는 날엔 이미 환불된 옛 행이 창을 채워
  // 새 미환불 행이 몇 시간씩 밀린다(26-09-30 새 눈 검수).
  const since = new Date(now.getTime() - REFUND_RETRY_WINDOW_MS);
  const rows = await prisma.$queryRaw<Array<StaleRow & { errorMessage: string | null }>>`
    SELECT w.id, w."academyId", w."imageModel", w."creditTransactionId", w."errorMessage"
    FROM webtoons w
    WHERE w.status = 'FAILED'
      AND w."creditTransactionId" IS NOT NULL
      AND w."completedAt" >= ${since}
      AND NOT EXISTS (
        SELECT 1 FROM credit_transactions t
        WHERE t."referenceId" = w."creditTransactionId"
          AND t."referenceType" = 'CREDIT_TRANSACTION'
          AND t.type = 'REFUND'
      )
    ORDER BY w."completedAt" ASC
    LIMIT ${STALE_BATCH_SIZE}
  `;
  let retried = 0;
  let refunded = 0;
  let refundFailed = 0;

  for (const row of rows) {
    if (!row.creditTransactionId) continue;
    // 영구 오류(예: 원 거래가 CONSUMPTION 이 아님)가 5분마다 무한 재시도되지 않게,
    // 한 패스에서 연속 실패가 쌓이면 멈추고 다음 패스로 넘긴다.
    if (refundFailed >= MAX_REFUND_FAILURES_PER_PASS) break;
    retried += 1;
    try {
      const reason =
        row.errorMessage === STALE_ERROR_MESSAGE ? STALE_REFUND_REASON : FAILED_REFUND_RETRY_REASON;
      if (await refundStaleRow(row, reason)) refunded += 1;
    } catch (error) {
      refundFailed += 1;
      console.warn("[webtoon-stale-cleanup] refund retry failed", {
        webtoonId: row.id,
        creditTransactionId: row.creditTransactionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { retried, refunded, refundFailed };
}

/**
 * 전 학원의 멈춘 웹툰 행을 FAILED + 환불로 마감한다. 멱등 — 연달아 두 번 돌아도 안전.
 * 예외를 던지지 않는다: 실패는 result.error 로 돌려 같은 리퍼의 다른 정리 작업을 막지 않는다.
 */
export async function cleanupStaleWebtoons({
  now = new Date(),
}: { now?: Date } = {}): Promise<WebtoonStaleCleanupResult> {
  const result: WebtoonStaleCleanupResult = {
    reaped: 0,
    refunded: 0,
    refundFailed: 0,
    refundRetried: 0,
  };

  try {
    // 먼저 지난 패스의 환불 누락분 — 이번 패스에서 막 마감한 행을 같은 패스에서 두 번 세지 않도록.
    const retry = await retryMissingRefunds(now);
    result.refundRetried = retry.retried;
    result.refunded += retry.refunded;
    result.refundFailed += retry.refundFailed;

    const staleWhere = buildStaleWhere(now);
    const candidates: StaleRow[] = await prisma.webtoon.findMany({
      where: staleWhere,
      select: { id: true, academyId: true, imageModel: true, creditTransactionId: true },
      orderBy: { createdAt: "asc" },
      take: STALE_BATCH_SIZE,
    });

    for (const row of candidates) {
      // 같은 판정 조건으로 원자적 전환 — 그 사이 완료·재수거된 행은 count 0.
      const flipped = await prisma.webtoon.updateMany({
        where: { ...staleWhere, id: row.id },
        data: { status: "FAILED", errorMessage: STALE_ERROR_MESSAGE, completedAt: now },
      });
      if (flipped.count === 0) continue;
      result.reaped += 1;

      if (!row.creditTransactionId) continue;
      try {
        if (await refundStaleRow(row)) result.refunded += 1;
      } catch (error) {
        result.refundFailed += 1;
        console.error("[webtoon-stale-cleanup] refund failed (will retry next pass)", {
          webtoonId: row.id,
          creditTransactionId: row.creditTransactionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.error("[webtoon-stale-cleanup] pass aborted", result);
  }

  return result;
}
