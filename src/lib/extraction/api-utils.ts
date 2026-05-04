// ============================================================================
// Small helpers that every /api/extraction/* route uses.
// ============================================================================

import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface StaffContext {
  id: string;
  academyId: string;
  role: string;
}

/** Returns the staff session OR a Response (to be returned immediately). */
export async function requireStaff(): Promise<StaffContext | NextResponse> {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json(
      { error: "인증이 필요합니다.", code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }
  return { id: staff.id, academyId: staff.academyId, role: staff.role };
}

/** Loads an ExtractionJob and verifies academy ownership. */
export async function loadJobWithAuth(
  jobId: string,
  academyId: string,
): Promise<
  | { ok: true; job: NonNullable<Awaited<ReturnType<typeof prisma.extractionJob.findUnique>>> }
  | { ok: false; response: NextResponse }
> {
  const job = await prisma.extractionJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "추출 작업을 찾을 수 없습니다.", code: "JOB_NOT_FOUND" },
        { status: 404 },
      ),
    };
  }
  if (job.academyId !== academyId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "접근 권한이 없습니다.", code: "FORBIDDEN_ACADEMY" },
        { status: 403 },
      ),
    };
  }
  return { ok: true, job };
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
  details?: unknown,
): NextResponse {
  return NextResponse.json({ error: message, code, details }, { status });
}
