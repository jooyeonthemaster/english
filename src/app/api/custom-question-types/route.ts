import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import { createCustomType, listCustomTypes } from "@/lib/custom-question-types/persistence";
import { parseCompiledCustomType } from "@/lib/custom-question-types/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — 학원의 커스텀 유형 목록. POST — 검토한 정의를 새 유형으로 저장.

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  spec: z.unknown(),
  source: z.unknown().optional(),
});

export async function GET() {
  const staff = await getStaffSession();
  if (!staff || staff.role !== "DIRECTOR") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const types = await listCustomTypes(staff.academyId);
  return NextResponse.json({ types });
}

export async function POST(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff || staff.role !== "DIRECTOR") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  try {
    // 클라가 보낸 spec 을 재파싱해 안전한 기본값으로 정규화(신뢰 경계).
    const spec = parseCompiledCustomType(parsed.data.spec);
    const { id } = await createCustomType({
      academyId: staff.academyId,
      createdById: staff.id,
      name: parsed.data.name,
      spec,
      source: parsed.data.source ?? null,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "유형 저장에 실패했습니다.";
    console.error(`[custom-type-create] academy=${staff.academyId} failed: ${message}`);
    return NextResponse.json({ error: "유형 저장에 실패했습니다." }, { status: 500 });
  }
}
