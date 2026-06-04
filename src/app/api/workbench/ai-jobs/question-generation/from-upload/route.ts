// ============================================================================
// "빠른 생성" 진입점 (v2).
//
// 단일 페이지 이미지를 받아 자료추출 풀파이프라인을 1페이지짜리
// ExtractionJob 으로 enqueue 한다. metadata.fastTrackFollowUp 에 후속 잡
// 설정 (mode, count, difficulty, questionType, generationPlan, customPrompt)
// 을 담아두면 extraction-finalize 가 추출+복원 완료 후 자동 promote +
// workbench-question-generation 잡을 지문 수만큼 fan-out 한다.
//
// PDF 는 클라이언트가 첫 페이지를 image 로 변환해 업로드한다.
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

type GenerationMode = "AUTO" | "MANUAL";

function parseMode(value: FormDataEntryValue | null): GenerationMode {
  return value === "MANUAL" ? "MANUAL" : "AUTO";
}

function parsePositiveInt(
  value: FormDataEntryValue | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "string") return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseQuestionTypeSettings(
  value: FormDataEntryValue | null,
): Record<string, unknown> | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

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

  const mode = parseMode(form.get("mode"));
  const count = parsePositiveInt(form.get("count"), 1, 1, 50);
  const questionType =
    typeof form.get("questionType") === "string"
      ? String(form.get("questionType")).trim() || null
      : null;
  if (mode === "MANUAL" && !questionType) {
    return NextResponse.json(
      { error: "questionType is required for manual generation" },
      { status: 400 },
    );
  }

  const difficulty =
    typeof form.get("difficulty") === "string"
      ? String(form.get("difficulty")) || "INTERMEDIATE"
      : "INTERMEDIATE";
  const customPrompt = String(form.get("customPrompt") ?? "");
  const generationPlan = normalizeQuestionGenerationPlan(
    form.get("generationPlan"),
  );
  const questionTypeSettings = parseQuestionTypeSettings(
    form.get("questionTypeSettings"),
  );
  const uploadLabel = file.name || null;

  const buffer = Buffer.from(await file.arrayBuffer());

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
          flow: "QUESTION_GENERATION",
          staffId: staff.id,
          generationPlan,
          customPrompt,
          uploadLabel,
          questionGeneration: {
            mode,
            count,
            questionType,
            // Prisma JSON rejects `unknown` value props; this has already been
            // validated as a plain object inside `parseQuestionTypeSettings`.
            questionTypeSettings: questionTypeSettings as any,
            difficulty,
          },
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
