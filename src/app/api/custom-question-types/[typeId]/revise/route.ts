import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import { reviseCustomType } from "@/lib/custom-question-types/compiler";
import {
  getActiveCustomTypeSpec,
  reviseCustomTypeVersion,
} from "@/lib/custom-question-types/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — 자연어 수정 요청을 반영해 유형 정의를 재작성하고 새 버전으로 활성화. 편집당 LLM 1회. DIRECTOR 한정.

const bodySchema = z.object({
  instruction: z.string().trim().min(2).max(2000),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ typeId: string }> }) {
  const staff = await getStaffSession();
  if (!staff || staff.role !== "DIRECTOR") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { typeId } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "수정 요청을 입력하세요." },
      { status: 400 },
    );
  }

  const active = await getActiveCustomTypeSpec(staff.academyId, typeId);
  if (!active) {
    return NextResponse.json({ error: "유형을 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const revisedSpec = await reviseCustomType({
      currentSpec: active.spec,
      typeName: active.type.name,
      instruction: parsed.data.instruction,
      academyId: staff.academyId,
    });
    const { version } = await reviseCustomTypeVersion({
      academyId: staff.academyId,
      typeId,
      spec: revisedSpec,
      instruction: parsed.data.instruction,
    });
    return NextResponse.json({
      version,
      summary: {
        description: revisedSpec.description,
        invariants: revisedSpec.invariants,
        variableAxes: revisedSpec.variableAxes,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "유형 수정에 실패했습니다.";
    console.error(`[custom-type-revise] academy=${staff.academyId} type=${typeId} failed: ${message}`);
    return NextResponse.json({ error: "유형 수정에 실패했습니다." }, { status: 500 });
  }
}
