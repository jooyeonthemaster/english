// ============================================================================
// GET /api/extraction/jobs/:jobId/pages?indices=0,1,2
//
// Lightweight endpoint that returns signed image URLs for a specific subset
// of ExtractionPages within a job. Used by the draft detail modal to show
// the original source pages alongside the extracted text, without paying
// the cost of the heavy `/jobs/:jobId` GET (which loads all drafts + items).
//
// Omitting `indices` returns every page in the job, ordered by pageIndex.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  errorResponse,
  loadJobWithAuth,
  requireStaff,
} from "@/lib/extraction/api-utils";
import { createSignedDownloadUrl } from "@/lib/supabase-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { jobId } = await ctx.params;
  const staff = await requireStaff();
  if (staff instanceof NextResponse) return staff;

  const auth = await loadJobWithAuth(jobId, staff.academyId);
  if (!auth.ok) return auth.response;

  const indicesParam = req.nextUrl.searchParams.get("indices");
  const indices = indicesParam
    ? indicesParam
        .split(",")
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n >= 0)
    : null;

  if (indices && indices.length === 0) {
    return errorResponse(
      "INVALID_INDICES",
      "유효한 페이지 인덱스가 없습니다.",
      400,
    );
  }

  const pages = await prisma.extractionPage.findMany({
    where: {
      jobId,
      ...(indices ? { pageIndex: { in: indices } } : {}),
    },
    select: { pageIndex: true, imageUrl: true, sourceFileName: true },
    orderBy: { pageIndex: "asc" },
  });

  // Server-side downscale via Supabase image transform.
  // - `width: 1600` is the long-edge cap — large enough to remain crisp on
  //   2× DPR displays at full modal width (~1200px) yet drops 4K/full-res
  //   scans from multi-MB to <300KB.
  // - `resize: "contain"` preserves aspect ratio and is a no-op for images
  //   already smaller than 1600px, so low-res phone scans pass through
  //   un-degraded.
  // - `quality: 82` keeps JPEG artifacts invisible for handwritten/scanned
  //   sheets while cutting another ~30-40% off the wire payload.
  const signed = await Promise.all(
    pages.map(async (p) => {
      let signedUrl: string | null = null;
      if (p.imageUrl) {
        try {
          signedUrl = await createSignedDownloadUrl(p.imageUrl, 60 * 30, {
            transform: { width: 1600, resize: "contain", quality: 82 },
          });
        } catch {
          signedUrl = null;
        }
      }
      return {
        pageIndex: p.pageIndex,
        signedUrl,
        sourceFileName: p.sourceFileName,
      };
    }),
  );

  return NextResponse.json({ pages: signed });
}
