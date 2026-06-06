import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import { kickSimilarQuestionGenWorker } from "@/lib/similar-exam-generation/question-job-runner";

import { listQuestionGenerationJobs } from "./listing-service";
import {
  InvalidPassageSelectionError,
  registerQuestionGenerationJob,
} from "./registration-service";
import { questionGenerationJobBodySchema } from "./request-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** POST — 동형 문제 생성 작업을 큐에 등록(비동기). 즉시 jobId 반환, 워커가 백그라운드 처리. */
export async function POST(req: NextRequest) {
  const serverRequestId = randomUUID();
  let requestId: string = serverRequestId;

  try {
    const staff = await getStaffSession();
    if (!staff || staff.role !== "DIRECTOR") {
      return NextResponse.json({ error: "Authentication required", requestId }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    if (body && typeof body === "object" && "clientRequestId" in body) {
      const value = (body as { clientRequestId?: unknown }).clientRequestId;
      if (typeof value === "string" && value.trim()) requestId = value.trim();
    }

    const parsed = questionGenerationJobBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload", requestId },
        { status: 400 },
      );
    }
    const jobId = await registerQuestionGenerationJob({
      staff,
      body: parsed.data,
      requestId,
    });

    // 인-프로세스 워커 가동(논블로킹) — 응답을 막지 않는다.
    kickSimilarQuestionGenWorker();

    return NextResponse.json({ jobId, requestId }, { status: 202 });
  } catch (error) {
    if (error instanceof InvalidPassageSelectionError) {
      return NextResponse.json(
        { error: "선택한 지문이 올바르지 않습니다.", requestId },
        { status: 400 },
      );
    }
    console.error(
      `[similar-question-job-registration] requestId=${requestId} failed: ${errorMessage(error)}`,
    );
    return NextResponse.json(
      { error: "동형 생성 작업 등록에 실패했습니다.", requestId },
      { status: 500 },
    );
  }
}

/** GET — 현재 학원의 동형 문제 생성 작업 목록(상태/진행률). 패널 폴링용. */
export async function GET(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff || staff.role !== "DIRECTOR") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // 폴링(GET)도 워커를 깨운다 — 서버 재시작 후 enqueue 가 없어도 좀비 PROCESSING/PENDING
  // 잡이 복구·재개되도록(pump 는 멱등이라 매 호출 안전). cold-start 방지.
  kickSimilarQuestionGenWorker();

  const jobs = await listQuestionGenerationJobs({
    academyId: staff.academyId,
    limitParam: req.nextUrl.searchParams.get("limit"),
  });

  return NextResponse.json({ jobs });
}
