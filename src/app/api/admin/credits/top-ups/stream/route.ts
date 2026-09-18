import { NextRequest } from "next/server";
import { requireAdminAuth } from "@/lib/auth-admin";
import {
  getAdminCreditTopUps,
  getAdminCreditTopUpStats,
} from "@/lib/admin-credit-topups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await requireAdminAuth();

  const encoder = new TextEncoder();
  let timer: NodeJS.Timeout | null = null;
  let lastSignature = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = async () => {
        try {
          const [topUps, stats] = await Promise.all([
            getAdminCreditTopUps(50),
            // 3초 틱 — 전체 기간·최근 7일 집계는 60초 캐시로 대신한다(틱당 쿼리 4개: 목록 1 + 통계 3).
            getAdminCreditTopUpStats({ allowCache: true }),
          ]);
          // 통계 카드는 목록이 그대로여도 바뀐다(60분 경과로 진행 중→미완료, KST 자정) → 시그니처에 포함.
          const signature = `${topUps
            .map((item) => `${item.id}:${item.status}:${item.updatedAt?.toISOString()}`)
            .join("|")}#${JSON.stringify(stats)}`;
          if (signature === lastSignature) return;
          lastSignature = signature;
          controller.enqueue(
            encoder.encode(
              `event: topups\ndata: ${JSON.stringify({ topUps, stats })}\n\n`,
            ),
          );
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ message: "stream_failed" })}\n\n`,
            ),
          );
          console.error("[admin/credits/top-ups/stream] failed", err);
        }
      };

      await push();
      timer = setInterval(push, 3000);
      request.signal.addEventListener("abort", () => {
        if (timer) clearInterval(timer);
        controller.close();
      });
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
