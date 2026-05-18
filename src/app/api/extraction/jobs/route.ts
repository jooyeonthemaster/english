// ============================================================================
// /api/extraction/jobs — extraction job collection endpoint.
//
//   POST — create a new extraction job (see _lib/create-job.ts)
//   GET  — list jobs for the current academy (see _lib/list-jobs.ts)
//
// Handlers live in `_lib/` so this route file stays a slim entry point.
// ============================================================================

import { NextRequest } from "next/server";

import { handleCreateJob } from "./_lib/create-job";
import { handleListJobs } from "./_lib/list-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  return handleCreateJob(req);
}

export async function GET(req: NextRequest) {
  return handleListJobs(req);
}
