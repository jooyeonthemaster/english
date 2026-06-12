// ============================================================================
// POST /api/track — 클라이언트 페이지뷰 배치 수집.
//
// ActivityTracker(클라이언트)가 sendBeacon/fetch(keepalive)로 호출한다.
// 호출 빈도를 클라이언트가 배치로 묶으므로 이 라우트는 요청당 DB write 1회.
//
// 응답은 항상 204 — 추적 실패가 사용자 경험에 보여서는 안 되고,
// 비로그인/만료 세션의 비콘도 조용히 무시한다.
// ============================================================================

import { getStaffSession } from "@/lib/auth";
import { logAppEvents, normalizeClientPath } from "@/lib/app-events";
import type { AppEventInput } from "@/lib/app-events";

export const dynamic = "force-dynamic";

const MAX_EVENTS_PER_BATCH = 50;
const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_SESSION_ID_LENGTH = 64;

interface TrackBody {
  sessionId?: unknown;
  events?: unknown;
}

export async function POST(req: Request) {
  const noContent = new Response(null, { status: 204 });

  const session = await getStaffSession().catch(() => null);
  if (!session) return noContent;

  // sendBeacon은 Content-Type을 text/plain으로 보낼 수 있어 req.json() 대신
  // text → parse로 받는다.
  let body: TrackBody;
  try {
    body = JSON.parse(await req.text()) as TrackBody;
  } catch {
    return noContent;
  }

  const rawEvents = Array.isArray(body.events)
    ? body.events.slice(0, MAX_EVENTS_PER_BATCH)
    : [];
  const sessionId =
    typeof body.sessionId === "string"
      ? body.sessionId.slice(0, MAX_SESSION_ID_LENGTH)
      : null;

  const now = Date.now();
  const inputs: AppEventInput[] = [];
  let lastPath: string | null = null;

  for (const raw of rawEvents) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as { path?: unknown; ts?: unknown };
    const path = normalizeClientPath(e.path);
    if (!path) continue;
    // 연속 중복(같은 경로 재렌더)은 한 건으로
    if (path === lastPath) continue;
    lastPath = path;

    const ts = typeof e.ts === "number" ? e.ts : now;
    const clamped = Math.min(Math.max(ts, now - MAX_EVENT_AGE_MS), now);

    inputs.push({
      academyId: session.academyId,
      actorType: "STAFF",
      actorId: session.id,
      eventType: "PAGE_VIEW",
      metadata: { path },
      correlationId: sessionId,
      createdAt: new Date(clamped),
    });
  }

  await logAppEvents(inputs);
  return noContent;
}
