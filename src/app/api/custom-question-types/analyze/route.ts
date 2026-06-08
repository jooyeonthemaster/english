import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import { kickCustomTypeAnalysisWorker } from "@/lib/custom-question-types/analysis-job-runner";
import { createAnalysisJob } from "@/lib/custom-question-types/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 참조 문항(수동 크롭본 1장)을 분석 잡에 등록(비동기). 즉시 jobId 202 반환(논블로킹).
// 워커가 백그라운드로 분석 → 유형 정의 컴파일 → ACTIVE 커스텀 유형 자동 생성. 하단 작업 큐가 폴링.

const MAX_IMAGE_BASE64_LEN = 12_000_000;

const imageSchema = z.object({
  data: z.string().min(1).max(MAX_IMAGE_BASE64_LEN),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
});

const bodySchema = z.object({
  images: z.array(imageSchema).min(1).max(1),
  manualCrop: z.literal(true).optional().default(true),
  gradeInfo: z.string().trim().max(40).optional(),
});

function base64Payload(value: string): string {
  const commaIndex = value.indexOf(",");
  return commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
}

export async function POST(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff || staff.role !== "DIRECTOR") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  try {
    const img = parsed.data.images[0];
    const { id } = await createAnalysisJob({
      academyId: staff.academyId,
      createdById: staff.id,
      referenceImage: base64Payload(img.data),
      referenceMediaType: img.mediaType,
      gradeInfo: parsed.data.gradeInfo,
      manualCrop: parsed.data.manualCrop,
    });

    // 인-프로세스 워커 가동(논블로킹).
    kickCustomTypeAnalysisWorker();

    return NextResponse.json({ jobId: id }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "분석 등록에 실패했습니다.";
    console.error(`[custom-type-analyze] academy=${staff.academyId} enqueue failed: ${message}`);
    return NextResponse.json({ error: "분석 등록에 실패했습니다." }, { status: 500 });
  }
}
