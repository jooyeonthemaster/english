// ============================================================================
// GET/POST /api/cron/free-forecast-purge — 무료 적중 예측 팩 신청 버킷의 보관기한 집행(매일, vercel.json crons).
// 동의문(ff-upload.tsx) 「이메일과 올린 파일은 … 접수 6개월 뒤 모두 지웁니다」와 업로드 칸 아래 안내
// 「접수하지 않은 파일은 7일 뒤 자동으로 지웁니다」를 사람 손 없이 지키는 배치. 판정·삭제는 lib/free-forecast/retention.ts.
//
// 인증(analytics-retention 과 같다 — 둘 중 하나):
//   · Authorization: Bearer <CRON_SECRET>  — Vercel Cron 이 자동 첨부.
//   · 관리자 세션 쿠키                      — 운영자가 수동 실행·드라이런 할 때.
//   CRON_SECRET 미설정이면 크론 경로는 영구 401 이므로, 그 사실을 서버 로그와 401 응답 본문
//   (cronSecretConfigured:false — 비밀값 자체는 노출하지 않는다)에 드러낸다.
//
// 드라이런: ?dry=1 — 아무것도 지우지 않고 대상 수만 센다. 보관 기간은 바꿀 수 없다(동의문에 묶인 값 — days 인자 없음).
// 집행 기록: 버킷 _ops/purge-last-run.json — /admin/free-forecast 가 마지막 실행을 보여 준다(드라이런은 기록하지 않는다).
// ============================================================================

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth-admin";
import { sweepFfBucket, writeFfSweepRecord } from "@/lib/free-forecast/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** 폴더가 많이 쌓인 날을 감당할 수 있게 상한을 명시한다. 내부 예산은 이보다 짧다. */
export const maxDuration = 300;

/** 함수 상한(300s)보다 짧은 자체 예산. 넘으면 새 폴더를 잡지 않고 truncated 로 알린다(다음 실행이 이어받는다). */
const TIME_BUDGET_MS = 240_000;

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

async function handle(req: Request) {
  const configured = cronSecretConfigured();
  const by = await authorize(req);
  if (!by) {
    if (!configured) {
      // 운영자가 알 방법이 없던 구간 — 로그로 드러낸다(비밀값은 찍지 않는다).
      console.warn(
        "[cron/free-forecast-purge] CRON_SECRET 미설정 — 무료 신청 6개월 파기·7일 정리가 비활성입니다. " +
          "Vercel 환경변수에 CRON_SECRET 을 넣어야 매일 배치가 돕니다(docs/analytics/ops-checklist.md B-1).",
      );
    }
    return NextResponse.json({ ok: false, error: "unauthorized", cronSecretConfigured: configured }, { status: 401 });
  }

  const dry = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const result = await sweepFfBucket({ dry, deadline: Date.now() + TIME_BUDGET_MS });
    if (!dry) {
      try {
        await writeFfSweepRecord(result);
      } catch (err) {
        console.error("[cron/free-forecast-purge] 집행 기록 저장 실패", err);
      }
    }
    return NextResponse.json({ ...result, by, cronSecretConfigured: configured });
  } catch (err) {
    console.error("[cron/free-forecast-purge] failed", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
