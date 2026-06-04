// ============================================================================
// "빠른 분석" 진입점 (v2).
//
// multipart/form-data 로 단일 페이지 이미지 1장을 받아 자료추출 풀파이프라인
// (Document AI + Gemini structured + M1 restoration) 을 그대로 1페이지 짜리
// ExtractionJob 으로 enqueue 한다. 풀파이프라인의 완료 후 처리
// (extraction-finalize) 가 metadata.fastTrackFollowUp 를 보고 자동으로
// promote + workbench-passage-analysis 잡을 fan-out 한다.
//
// 멀티페이지 reordering / clustering / 검수 단계만 우회하고, OCR + 복원은
// 풀파이프라인 그대로 사용한다.
//
// PDF 는 클라이언트가 첫 페이지를 image 로 변환해 업로드한다 (자료추출 페이지
// 의 pdf-splitter.ts 와 동일 패턴). 서버는 image 만 받는다.
// ============================================================================

import { tasks } from "@trigger.dev/sdk/v3";
import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import {
  academyConcurrencyKey,
  EXTRACTION_ORCHESTRATOR_QUEUE_NAME,
} from "@/lib/concurrency-config";
import {
  ACCEPTED_IMAGE_MIMES,
  MAX_INPUT_IMAGE_BYTES,
  STORAGE_BUCKET,
} from "@/lib/extraction/constants";
import { prisma } from "@/lib/prisma";
import { normalizeQuestionGenerationPlan } from "@/lib/question-generation-plans";
import {
  getServiceSupabase,
  pageImageKey,
} from "@/lib/supabase-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_MIMES: ReadonlySet<string> = new Set(ACCEPTED_IMAGE_MIMES);

export async function POST(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Invalid multipart form-data", details: message },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'file' field" },
      { status: 400 },
    );
  }

  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_MIMES.has(mimeType)) {
    return NextResponse.json(
      {
        error: `이미지 파일만 업로드할 수 있어요. 받은 타입: ${mimeType}. PDF는 자료 추출 페이지를 이용하거나 첫 페이지를 이미지로 변환해주세요.`,
      },
      { status: 415 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }
  if (file.size > MAX_INPUT_IMAGE_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_INPUT_IMAGE_BYTES} bytes)` },
      { status: 413 },
    );
  }

  const customPrompt = String(form.get("customPrompt") ?? "");
  const generationPlan = normalizeQuestionGenerationPlan(
    form.get("generationPlan"),
  );
  const uploadLabel = file.name || null;

  const buffer = Buffer.from(await file.arrayBuffer());

  // ── ExtractionJob + ExtractionPage + Storage upload ──────────────────
  // Mirrors POST /api/extraction/jobs and the subsequent client PUT to a
  // signed URL, but collapsed into one server-side flow. We use the same
  // path layout (pageImageKey) so extraction-page can download the bytes
  // exactly as it does for the regular bulk-extract path.
  const job = await prisma.extractionJob.create({
    data: {
      academyId: staff.academyId,
      createdById: staff.id,
      sourceType: "IMAGES",
      mode: "PASSAGE_ONLY",
      originalFileName: uploadLabel,
      totalPages: 1,
      pendingPages: 1,
      status: "PENDING",
      metadata: {
        fastTrackFollowUp: {
          flow: "PASSAGE_ANALYSIS",
          staffId: staff.id,
          generationPlan,
          customPrompt,
          uploadLabel,
        },
      },
    },
  });

  const storagePath = pageImageKey(staff.academyId, job.id, 0, "jpg");
  try {
    const supabase = getServiceSupabase();
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: true,
      });
    if (uploadError) {
      throw new Error(uploadError.message);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.extractionJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorSummary: JSON.stringify({ code: "STORAGE_UPLOAD", message }),
      },
    });
    return NextResponse.json(
      { error: "이미지 업로드에 실패했어요.", details: message },
      { status: 502 },
    );
  }

  await prisma.extractionPage.create({
    data: {
      jobId: job.id,
      pageIndex: 0,
      imageUrl: storagePath,
      imageBytes: file.size,
      sourceFileName: uploadLabel,
      idempotencyKey: `${job.id}:0`,
    },
  });

  // ── Trigger.dev orchestrator → page → finalize ───────────────────────
  try {
    const handle = await tasks.trigger(
      "extraction-orchestrator",
      { jobId: job.id },
      {
        idempotencyKey: `orchestrator:${job.id}`,
        queue: EXTRACTION_ORCHESTRATOR_QUEUE_NAME,
        concurrencyKey: academyConcurrencyKey(staff.academyId),
      },
    );
    await prisma.extractionJob.update({
      where: { id: job.id },
      data: { triggerRunId: handle.id },
    });
    return NextResponse.json({
      extractionJobId: job.id,
      triggerRunId: handle.id,
      status: "PROCESSING",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Trigger.dev enqueue failed";
    await prisma.extractionJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorSummary: JSON.stringify({ code: "ORCHESTRATOR_ENQUEUE", message }),
      },
    });
    return NextResponse.json(
      { error: "추출 시작에 실패했어요.", details: message },
      { status: 502 },
    );
  }
}
