import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import { reviseCustomTypeDetailed } from "@/lib/custom-question-types/compiler";
import { getActiveCustomTypeSpec } from "@/lib/custom-question-types/persistence";
import { parseCompiledCustomType } from "@/lib/custom-question-types/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST — 스튜디오 AI 어시스턴트의 'stateless' 스펙 편집.
// 클라이언트가 들고 있는 작업 중 spec + 자연어 지시를 받아 수정된 spec 을 돌려준다.
// DB 에는 저장하지 않는다(저장은 [typeId] PATCH 의 spec 저장이 담당) — 빠른 반복 편집용.

const bodySchema = z.object({
  typeId: z.string().trim().min(1),
  instruction: z.string().trim().min(2).max(2000),
  // 작업 중 스펙(스튜디오의 미저장 상태). 없으면 활성 버전 스펙 기준.
  spec: z.unknown().optional(),
});

export async function POST(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff || staff.role !== "DIRECTOR") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "수정 요청을 입력하세요." },
      { status: 400 },
    );
  }

  const active = await getActiveCustomTypeSpec(staff.academyId, parsed.data.typeId);
  if (!active) {
    return NextResponse.json({ error: "유형을 찾을 수 없습니다." }, { status: 404 });
  }

  const currentSpec = parsed.data.spec
    ? parseCompiledCustomType(parsed.data.spec)
    : active.spec;

  try {
    const revised = await reviseCustomTypeDetailed({
      currentSpec,
      typeName: active.type.name,
      instruction: parsed.data.instruction,
    });
    return NextResponse.json({
      spec: revised.spec,
      changes: revised.changes,
      contentChanged: revised.contentChanged,
      source: revised.source,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "스펙 수정에 실패했습니다.";
    console.error(
      `[custom-type-spec-revise] academy=${staff.academyId} type=${parsed.data.typeId} failed: ${message}`,
    );
    return NextResponse.json({ error: "스펙 수정에 실패했습니다." }, { status: 500 });
  }
}
