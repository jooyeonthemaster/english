// POST /api/dev/qgen-lab/generate — 랩 1회 실행(SSE). dev 전용: production 404 → 스태프 세션 401.
// 스트림 형식은 md-stream 과 동일(": open" 주석 프레임 → `data: {t,…}\n\n`, route.ts:1149-1173, :1782-1790).
// 클라가 끊겨도 생성은 끝까지 돌고 결과는 runs/*.jsonl 에 기록된다(이미 과금된 실행).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import { getArm } from "@/lib/qgen-lab/arms";
import type { LabEvent } from "@/lib/qgen-lab/types";
import { runLabGeneration } from "../_lib/orchestrate";
import { getLabPassage } from "../_lib/passages";
import { isSafeBatchId } from "../_lib/results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  armId: z.string().min(1).max(120),
  passageId: z.string().min(1).max(120),
  customText: z.string().max(20_000).optional(),
  rep: z.number().int().min(0).max(9_999),
  batchId: z.string().max(80).nullable().optional(),
});

function sseEncode(payload: LabEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "요청 형식 오류", issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;
  const batchId = body.batchId || null;
  if (batchId && !isSafeBatchId(batchId)) {
    return NextResponse.json({ error: `batchId 형식 오류: ${batchId}` }, { status: 400 });
  }
  const arm = getArm(body.armId);
  if (!arm) return NextResponse.json({ error: `알 수 없는 팔: ${body.armId}` }, { status: 400 });
  const passage = getLabPassage(body.passageId, body.customText);
  if (!passage) {
    return NextResponse.json({ error: `알 수 없는 지문: ${body.passageId}` }, { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const emit = (e: LabEvent) => {
        if (closed) return;
        try {
          controller.enqueue(sseEncode(e));
        } catch {
          // 클라이언트 이탈 — 이후 emit 은 무시하고 생성·기록은 계속한다.
          closed = true;
        }
      };
      const finish = () => {
        if (closed) return;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
        closed = true;
      };
      // 스트림 개통 즉시 주석 프레임 — 프록시/런타임 초기 버퍼링을 뚫는다(md-stream 동일).
      try {
        controller.enqueue(new TextEncoder().encode(": open\n\n"));
      } catch {
        closed = true;
      }
      void (async () => {
        try {
          await runLabGeneration({ arm, passage, rep: body.rep, batchId, emit });
        } catch (err) {
          // runLabGeneration 은 설계상 던지지 않는다 — 방어용.
          console.error("[qgen-lab] generate 예외", err);
          emit({ t: "error", message: err instanceof Error ? err.message : String(err) });
        } finally {
          finish();
        }
      })();
    },
    cancel() {
      // 리더 취소(클라 이탈)여도 실행은 끝까지 — emit 만 enqueue 예외로 조용히 멈춘다.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
