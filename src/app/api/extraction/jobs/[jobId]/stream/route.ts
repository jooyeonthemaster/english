// ============================================================================
// GET /api/extraction/jobs/:jobId/stream
// Server-Sent Events — streams job + page status updates.
//
// Design:
//   - Sends a `snapshot` event on connect (client hydrates immediately).
//   - Polls the DB every SSE_TICK_INTERVAL_MS and emits per-page and
//     per-job diffs.
//   - Closes with `done` when the job reaches a terminal state.
//   - Also closes after SSE_MAX_SESSION_MS to stay under Vercel's streaming
//     limits; the client should auto-reconnect.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireStaff,
  loadJobWithAuth,
} from "@/lib/extraction/api-utils";
import {
  SSE_MAX_SESSION_MS,
  SSE_TICK_INTERVAL_MS,
} from "@/lib/extraction/constants";
import type {
  ExtractionJobStatus,
  ExtractionMode,
  ExtractionPageStatus,
  StreamEvent,
} from "@/lib/extraction/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// This route must be long-lived — use the maximum Vercel lets us.
export const maxDuration = 300;

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

const TERMINAL_STATUSES: readonly ExtractionJobStatus[] = [
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
];

function encode(event: StreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { jobId } = await ctx.params;
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const auth = await loadJobWithAuth(jobId, staff.academyId);
  if (!auth.ok) return auth.response;

  const encoder = new TextEncoder();
  const startTs = Date.now();

  type PageSigMap = Map<number, string>; // pageIndex → signature
  type JobSig = string;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(encode(event)));
        } catch {
          // stream closed — stop scheduling
        }
      };

      // ── Initial snapshot ────────────────────────────────────────────
      const initialPages = await prisma.extractionPage.findMany({
        where: { jobId },
        orderBy: { pageIndex: "asc" },
        select: {
          pageIndex: true,
          status: true,
          attemptCount: true,
          extractedText: true,
          confidence: true,
          errorCode: true,
          errorMessage: true,
          latencyMs: true,
        },
      });

      send({
        type: "snapshot",
        job: {
          id: auth.job.id,
          academyId: auth.job.academyId,
          createdById: auth.job.createdById,
          sourceType: auth.job.sourceType as "PDF" | "IMAGES",
          mode: auth.job.mode as ExtractionMode,
          sourceMaterialId: auth.job.sourceMaterialId,
          originalFileName: auth.job.originalFileName,
          status: auth.job.status as ExtractionJobStatus,
          totalPages: auth.job.totalPages,
          successPages: auth.job.successPages,
          failedPages: auth.job.failedPages,
          pendingPages: auth.job.pendingPages,
          creditsConsumed: auth.job.creditsConsumed,
          creditsRefunded: auth.job.creditsRefunded,
          createdAt: auth.job.createdAt.toISOString(),
          startedAt: auth.job.startedAt?.toISOString() ?? null,
          completedAt: auth.job.completedAt?.toISOString() ?? null,
          pages: initialPages.map((p) => ({
            pageIndex: p.pageIndex,
            status: p.status as ExtractionPageStatus,
            attemptCount: p.attemptCount,
            extractedText: p.extractedText,
            confidence: p.confidence,
            errorCode: p.errorCode,
            errorMessage: p.errorMessage,
            latencyMs: p.latencyMs,
            imageUrl: null,
          })),
        },
      });

      // If already terminal, close immediately
      if (TERMINAL_STATUSES.includes(auth.job.status as ExtractionJobStatus)) {
        send({ type: "done", status: auth.job.status as ExtractionJobStatus });
        controller.close();
        return;
      }

      // ── Polling loop ───────────────────────────────────────────────
      const pageSigs: PageSigMap = new Map(
        initialPages.map((p) => [
          p.pageIndex,
          `${p.status}|${p.attemptCount}|${p.errorCode ?? ""}|${(p.extractedText ?? "").length}`,
        ]),
      );
      let jobSig: JobSig = `${auth.job.status}|${auth.job.successPages}|${auth.job.failedPages}|${auth.job.pendingPages}|${auth.job.creditsConsumed}`;

      let timer: ReturnType<typeof setTimeout> | null = null;
      let closed = false;

      const stop = (reason: "terminal" | "timeout" | "error") => {
        if (closed) return;
        closed = true;
        if (timer) clearTimeout(timer);
        try {
          controller.close();
        } catch {
          // already closed
        }
        // Suppress unused warnings
        void reason;
      };

      const tick = async () => {
        if (closed) return;
        if (Date.now() - startTs > SSE_MAX_SESSION_MS) {
          // Client auto-reconnects and picks up where it left off.
          send({ type: "done", status: "PROCESSING" as ExtractionJobStatus });
          stop("timeout");
          return;
        }

        try {
          const [current, pages] = await Promise.all([
            prisma.extractionJob.findUnique({
              where: { id: jobId },
              select: {
                status: true,
                successPages: true,
                failedPages: true,
                pendingPages: true,
                creditsConsumed: true,
              },
            }),
            prisma.extractionPage.findMany({
              where: { jobId },
              orderBy: { pageIndex: "asc" },
              select: {
                pageIndex: true,
                status: true,
                attemptCount: true,
                extractedText: true,
                errorCode: true,
                errorMessage: true,
                latencyMs: true,
              },
            }),
          ]);
          if (!current) {
            send({ type: "error", message: "작업이 삭제되었습니다." });
            stop("error");
            return;
          }

          // Emit per-page diffs
          for (const p of pages) {
            const sig = `${p.status}|${p.attemptCount}|${p.errorCode ?? ""}|${(p.extractedText ?? "").length}`;
            if (pageSigs.get(p.pageIndex) !== sig) {
              pageSigs.set(p.pageIndex, sig);
              send({
                type: "page-update",
                pageIndex: p.pageIndex,
                status: p.status as ExtractionPageStatus,
                attemptCount: p.attemptCount,
                extractedText: p.extractedText,
                errorCode: p.errorCode,
                errorMessage: p.errorMessage,
                latencyMs: p.latencyMs,
              });
            }
          }

          // Emit job-level diff
          const nextJobSig = `${current.status}|${current.successPages}|${current.failedPages}|${current.pendingPages}|${current.creditsConsumed}`;
          if (nextJobSig !== jobSig) {
            jobSig = nextJobSig;
            send({
              type: "job-update",
              status: current.status as ExtractionJobStatus,
              successPages: current.successPages,
              failedPages: current.failedPages,
              pendingPages: current.pendingPages,
              creditsConsumed: current.creditsConsumed,
            });
          }

          if (TERMINAL_STATUSES.includes(current.status as ExtractionJobStatus)) {
            send({ type: "done", status: current.status as ExtractionJobStatus });
            stop("terminal");
            return;
          }

          timer = setTimeout(tick, SSE_TICK_INTERVAL_MS);
        } catch (err) {
          send({ type: "error", message: (err as Error).message });
          // keep the stream alive — transient DB errors shouldn't kill it.
          timer = setTimeout(tick, SSE_TICK_INTERVAL_MS * 2);
        }
      };

      timer = setTimeout(tick, SSE_TICK_INTERVAL_MS);
    },

    cancel() {
      // client closed the stream — nothing to clean up beyond the GC.
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
