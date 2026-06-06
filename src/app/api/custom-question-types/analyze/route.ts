import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import { analyzeForCustomType } from "@/lib/custom-question-types/analysis-input";
import { compileCustomType } from "@/lib/custom-question-types/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 참조 문항(이미지 1장)을 분석해 커스텀 유형 정의 초안을 컴파일해 반환(저장 X).
// 강사가 검토·명명 후 별도 POST /api/custom-question-types 로 저장한다.

const MAX_IMAGE_BASE64_LEN = 12_000_000;

const imageSchema = z.object({
  data: z.string().min(1).max(MAX_IMAGE_BASE64_LEN),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
});

const bodySchema = z.object({
  images: z.array(imageSchema).min(1).max(1),
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
    const images = parsed.data.images.map((img) => ({
      data: Buffer.from(base64Payload(img.data), "base64"),
      mediaType: img.mediaType,
    }));
    const analyzed = await analyzeForCustomType({
      images,
      gradeInfo: parsed.data.gradeInfo,
    });
    const compiled = compileCustomType(analyzed.primary);

    return NextResponse.json({
      spec: compiled.spec,
      suggestedName: compiled.suggestedName,
      // 원본 분석 — 저장 시 버전의 source 로 함께 보냄(편집/튜닝 토대).
      source: analyzed.primary,
      analysisModel: analyzed.model,
      otherQuestionCount: Math.max(0, analyzed.questions.length - 1),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "분석에 실패했습니다.";
    console.error(`[custom-type-analyze] academy=${staff.academyId} failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
