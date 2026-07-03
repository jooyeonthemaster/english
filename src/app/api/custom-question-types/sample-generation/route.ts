import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import { generateFromCustomType } from "@/lib/custom-question-types/generator";
import { getActiveCustomTypeSpec } from "@/lib/custom-question-types/persistence";
import {
  readCustomTypeSource,
  readSourcePassage,
} from "@/lib/custom-question-types/source-payload";
import { parseCompiledCustomType } from "@/lib/custom-question-types/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

// POST — 스튜디오 '실제 샘플 생성': 작업 중 spec 으로 동기 1문항 생성(저장 안 함).
// 강사가 스펙을 만지면서 실제 AI 출력을 즉시 확인하는 실험실 경로. 지문을 안 주면
// 원본 분석의 지문으로 생성한다.

const bodySchema = z.object({
  typeId: z.string().trim().min(1),
  spec: z.unknown().optional(),
  passage: z.string().max(12000).optional(),
  gradeInfo: z.string().max(40).optional(),
});

export async function POST(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff || staff.role !== "DIRECTOR") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const active = await getActiveCustomTypeSpec(staff.academyId, parsed.data.typeId);
  if (!active) {
    return NextResponse.json({ error: "유형을 찾을 수 없습니다." }, { status: 404 });
  }

  const spec = parsed.data.spec ? parseCompiledCustomType(parsed.data.spec) : active.spec;

  let passage = parsed.data.passage?.trim() ?? "";
  if (!passage) {
    const source = readCustomTypeSource(active.source);
    passage = readSourcePassage(source.analysis);
  }
  if (!passage && spec.passageBased) {
    return NextResponse.json(
      { error: "샘플 생성에 쓸 지문이 없습니다. 지문을 붙여넣어 주세요." },
      { status: 400 },
    );
  }

  try {
    const started = Date.now();
    const result = await generateFromCustomType({
      spec,
      passage,
      gradeInfo: parsed.data.gradeInfo,
      academyId: staff.academyId,
    });
    return NextResponse.json({
      question: result.question,
      subType: result.subType,
      tier: result.tier,
      llmAttempts: result.llmAttempts,
      elapsedMs: Date.now() - started,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "샘플 생성에 실패했습니다.";
    console.error(
      `[custom-type-sample-gen] academy=${staff.academyId} type=${parsed.data.typeId} failed: ${message}`,
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
