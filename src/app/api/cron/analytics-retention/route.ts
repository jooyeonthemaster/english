// ============================================================================
// GET/POST /api/cron/analytics-retention — 방문 분석 원시 기록 보유기간(1년) 집행.
// 개인정보처리방침 「방문 분석 기록은 수집일로부터 최대 1년 보관 후 파기 또는 익명화」 고지의 실제 배치.
// 계약: docs/analytics/analytics-spec.md §15 · 운영 절차: docs/analytics/ops-checklist.md
//
// 파기(삭제): analytics_events(createdAt) · analytics_sessions(lastSeenAt)
//             · analytics_link_clicks(createdAt) 365일 초과,
//             analytics_visitors 는 lastSeenAt 365일 초과 + 계정 미연결(academyId IS NULL).
// 익명화:     계정에 연결된 방문자라도 lastSeenAt 이 365일을 넘기면 유입 요약(first*)을 NULL 로
//             지우고 academyId·집계 카운트만 남긴다 — 「파기 또는 익명화」의 익명화 쪽 집행.
//             ※ 활동 중인 연결 방문자의 first* 는 계정 존속 동안 보관한다(방침 예외 문구 필요).
// 보존:       analytics_conversions(가입·결제 사실 — 매출 대조 근거),
//             analytics_tracked_links(운영 설정).
//
// 왜 배치인가: 첫 집행은 1년치를 한 문장으로 지우게 되므로 함수 상한에 걸리면 통째로 롤백되고
//   다음 날도 같은 크기라 파기가 영구히 성립하지 않는다. ctid 배치(LIMIT)로 잘라 넣고,
//   남은 건수를 응답·기록에 실어 다음 실행이 이어받는다.
//
// 인증(둘 중 하나):
//   · Authorization: Bearer <CRON_SECRET>  — Vercel Cron 이 자동 첨부.
//   · 관리자 세션 쿠키                      — 운영자가 수동 실행·드라이런 할 때.
//   CRON_SECRET 미설정이면 크론 경로는 영구 401 이므로, 그 사실을 서버 로그와 401 응답 본문
//   (cronSecretConfigured:false — 비밀값 자체는 노출하지 않는다)에 드러낸다.
//
// 드라이런: ?dry=1[&days=N] — 아무것도 지우지 않고 대상 건수만 센다(관리자 세션에서만 days 허용).
// ============================================================================

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** 첫 집행(1년치)을 감당할 수 있게 상한을 명시한다. 내부 예산은 이보다 짧다. */
export const maxDuration = 300;

const RETENTION_DAYS = 365;
/** 한 문장이 지우는 최대 행수 — 긴 잠금과 큰 롤백을 막는다. */
const BATCH_LIMIT = 20_000;
/** 함수 상한(300s)보다 짧은 자체 예산. 남으면 remaining 에 싣고 다음 실행이 이어받는다. */
const TIME_BUDGET_MS = 240_000;
/** 마지막 집행 결과 기록 위치(운영 화면이 이 키를 읽는다). */
const LAST_RUN_KEY = "analytics_retention_last_run";

interface DeleteTarget {
  key: "events" | "sessions" | "linkClicks" | "visitors";
  table: string;
  column: string;
  /** 추가 조건(코드 안 리터럴만 — 외부 입력을 붙이지 않는다) */
  extra: string | null;
}

const DELETE_TARGETS: DeleteTarget[] = [
  { key: "events", table: "analytics_events", column: "createdAt", extra: null },
  { key: "sessions", table: "analytics_sessions", column: "lastSeenAt", extra: null },
  { key: "linkClicks", table: "analytics_link_clicks", column: "createdAt", extra: null },
  // 연결된 방문자는 지우지 않고 아래에서 익명화한다.
  { key: "visitors", table: "analytics_visitors", column: "lastSeenAt", extra: '"academyId" IS NULL' },
];

/** 익명화 대상 컬럼 — 유입 요약만 지우고 집계 카운트·연결 정보는 남긴다. */
const ANON_COLUMNS = [
  "firstSessionId",
  "firstChannel",
  "firstSource",
  "firstMedium",
  "firstCampaign",
  "firstReferrerHost",
  "firstLandingPath",
  "firstTrackedLink",
];

type Counts = Record<DeleteTarget["key"], number>;
const zeroCounts = (): Counts => ({ events: 0, sessions: 0, linkClicks: 0, visitors: 0 });

function whereSql(t: DeleteTarget, cutoff: Date): Prisma.Sql {
  const extra = t.extra ? Prisma.sql` AND ${Prisma.raw(t.extra)}` : Prisma.empty;
  return Prisma.sql`${Prisma.raw(`"${t.column}"`)} < ${cutoff}${extra}`;
}

async function countPending(t: DeleteTarget, cutoff: Date): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>(
    Prisma.sql`SELECT COUNT(*)::bigint AS n FROM ${Prisma.raw(`"${t.table}"`)} WHERE ${whereSql(t, cutoff)}`,
  );
  return Number(rows[0]?.n ?? 0);
}

/** ctid 배치로 잘라 지운다. 예산을 넘기면 중단하고 남은 건수를 호출자가 싣는다. */
async function deleteBatched(
  t: DeleteTarget,
  cutoff: Date,
  deadline: number,
): Promise<{ deleted: number; truncated: boolean }> {
  let deleted = 0;
  for (;;) {
    if (Date.now() > deadline) return { deleted, truncated: true };
    const n = await prisma.$executeRaw(
      Prisma.sql`DELETE FROM ${Prisma.raw(`"${t.table}"`)}
                 WHERE ctid IN (
                   SELECT ctid FROM ${Prisma.raw(`"${t.table}"`)}
                   WHERE ${whereSql(t, cutoff)}
                   LIMIT ${BATCH_LIMIT}
                 )`,
    );
    deleted += n;
    if (n < BATCH_LIMIT) return { deleted, truncated: false };
  }
}

function anonWhere(cutoff: Date): Prisma.Sql {
  const anyNotNull = ANON_COLUMNS.map((c) => `"${c}" IS NOT NULL`).join(" OR ");
  return Prisma.sql`"lastSeenAt" < ${cutoff} AND "academyId" IS NOT NULL AND (${Prisma.raw(anyNotNull)})`;
}

async function countAnonPending(cutoff: Date): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>(
    Prisma.sql`SELECT COUNT(*)::bigint AS n FROM "analytics_visitors" WHERE ${anonWhere(cutoff)}`,
  );
  return Number(rows[0]?.n ?? 0);
}

async function anonymizeLinked(
  cutoff: Date,
  deadline: number,
): Promise<{ anonymized: number; truncated: boolean }> {
  const setClause = Prisma.raw(ANON_COLUMNS.map((c) => `"${c}" = NULL`).join(", "));
  let anonymized = 0;
  for (;;) {
    if (Date.now() > deadline) return { anonymized, truncated: true };
    const n = await prisma.$executeRaw(
      Prisma.sql`UPDATE "analytics_visitors" SET ${setClause}
                 WHERE ctid IN (
                   SELECT ctid FROM "analytics_visitors"
                   WHERE ${anonWhere(cutoff)}
                   LIMIT ${BATCH_LIMIT}
                 )`,
    );
    anonymized += n;
    if (n < BATCH_LIMIT) return { anonymized, truncated: false };
  }
}

interface RunResult {
  ok: true;
  mode: "run" | "dry";
  cutoff: string;
  retentionDays: number;
  startedAt: string;
  durationMs: number;
  /** 예산 초과로 남긴 것이 있으면 true — 다음 실행이 이어받는다. */
  truncated: boolean;
  deleted: Counts;
  remaining: Counts;
  anonymized: number;
  anonymizeRemaining: number;
}

async function run(retentionDays: number, dry: boolean): Promise<RunResult> {
  const startedAt = new Date();
  const cutoff = new Date(startedAt.getTime() - retentionDays * 86_400_000);
  const deadline = startedAt.getTime() + TIME_BUDGET_MS;

  const deleted = zeroCounts();
  const remaining = zeroCounts();
  let truncated = false;
  let anonymized = 0;

  for (const t of DELETE_TARGETS) {
    if (dry) {
      remaining[t.key] = await countPending(t, cutoff);
      continue;
    }
    const r = await deleteBatched(t, cutoff, deadline);
    deleted[t.key] = r.deleted;
    truncated = truncated || r.truncated;
    remaining[t.key] = r.truncated ? await countPending(t, cutoff) : 0;
  }

  let anonymizeRemaining = 0;
  if (dry) {
    anonymizeRemaining = await countAnonPending(cutoff);
  } else {
    const a = await anonymizeLinked(cutoff, deadline);
    anonymized = a.anonymized;
    truncated = truncated || a.truncated;
    anonymizeRemaining = a.truncated ? await countAnonPending(cutoff) : 0;
  }

  const result: RunResult = {
    ok: true,
    mode: dry ? "dry" : "run",
    cutoff: cutoff.toISOString(),
    retentionDays,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    truncated,
    deleted,
    remaining,
    anonymized,
    anonymizeRemaining,
  };

  // 집행 기록 — 이게 없으면 「매일 조용히 401」과 「매일 0건 삭제」를 구분할 수 없다.
  if (!dry) {
    try {
      await prisma.platformSetting.upsert({
        where: { key: LAST_RUN_KEY },
        create: { key: LAST_RUN_KEY, value: JSON.stringify(result) },
        update: { value: JSON.stringify(result) },
      });
    } catch (err) {
      console.error("[cron/analytics-retention] 집행 기록 저장 실패", err);
    }
  }
  return result;
}

function cronSecretConfigured(): boolean {
  return Boolean(process.env.CRON_SECRET);
}

function bearerAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return token.length > 0 && token === secret;
}

async function authorize(req: Request): Promise<"cron" | "admin" | null> {
  if (bearerAuthorized(req)) return "cron";
  try {
    const session = await getAdminSession();
    if (session) return "admin";
  } catch {
    // 쿠키 파싱 실패는 비인증과 같게 취급한다.
  }
  return null;
}

function parseDays(req: Request): number {
  const raw = Number(new URL(req.url).searchParams.get("days"));
  if (!Number.isFinite(raw) || raw <= 0) return RETENTION_DAYS;
  return Math.min(Math.floor(raw), 3650);
}

async function handle(req: Request) {
  const configured = cronSecretConfigured();
  const by = await authorize(req);
  if (!by) {
    if (!configured) {
      // 운영자가 알 방법이 없던 구간 — 로그로 드러낸다(비밀값은 찍지 않는다).
      console.warn(
        "[cron/analytics-retention] CRON_SECRET 미설정 — 보유기간 집행이 비활성입니다. " +
          "Vercel 환경변수에 CRON_SECRET 을 넣어야 매일 배치가 돕니다(docs/analytics/ops-checklist.md).",
      );
    }
    return NextResponse.json(
      { ok: false, error: "unauthorized", cronSecretConfigured: configured, retentionDays: RETENTION_DAYS },
      { status: 401 },
    );
  }

  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const days = by === "admin" ? parseDays(req) : RETENTION_DAYS;

  try {
    const result = await run(days, dry);
    return NextResponse.json({ ...result, by, cronSecretConfigured: configured });
  } catch (err) {
    console.error("[cron/analytics-retention] failed", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
