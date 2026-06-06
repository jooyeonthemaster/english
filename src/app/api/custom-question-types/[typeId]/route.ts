import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import {
  archiveCustomType,
  getActiveCustomTypeSpec,
  renameCustomType,
} from "@/lib/custom-question-types/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ typeId: string }>;
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

// GET — 유형 1개 + 활성 정의(검토/생성용). PATCH — 이름 변경. DELETE — 아카이브(소프트 삭제).

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { typeId } = await ctx.params;
  const staff = await getStaffSession();
  if (!staff || staff.role !== "DIRECTOR") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const active = await getActiveCustomTypeSpec(staff.academyId, typeId);
  if (!active) {
    return NextResponse.json({ error: "Custom type not found" }, { status: 404 });
  }
  return NextResponse.json({ type: active.type, spec: active.spec });
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { typeId } = await ctx.params;
  const staff = await getStaffSession();
  if (!staff || staff.role !== "DIRECTOR") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const ok = await renameCustomType(staff.academyId, typeId, parsed.data.name);
  if (!ok) return NextResponse.json({ error: "Custom type not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { typeId } = await ctx.params;
  const staff = await getStaffSession();
  if (!staff || staff.role !== "DIRECTOR") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const ok = await archiveCustomType(staff.academyId, typeId);
  if (!ok) return NextResponse.json({ error: "Custom type not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
