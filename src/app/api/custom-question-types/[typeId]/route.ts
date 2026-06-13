import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import {
  archiveCustomType,
  editCustomTypeDefinition,
  getActiveCustomTypeSpec,
  listCustomTypeVersions,
  renameCustomType,
  reviseCustomTypeVersion,
} from "@/lib/custom-question-types/persistence";
import { parseCompiledCustomType } from "@/lib/custom-question-types/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ typeId: string }>;
}

// 이름 + 프롬프트 변경 없이 수정 가능한 구조 필드(결정형, LLM 없음).
// v2: spec(전체 스펙 저장 — 스튜디오 '버전 저장') + note(버전 노트)도 받는다.
const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  answerShape: z.enum(["MULTIPLE_CHOICE", "SHORT_ANSWER", "OTHER"]).optional(),
  optionCount: z.number().int().min(0).max(20).optional(),
  correctAnswerCount: z.number().int().min(1).max(20).optional(),
  multipleAnswers: z.boolean().optional(),
  passageBased: z.boolean().optional(),
  difficulty: z.enum(["BASIC", "INTERMEDIATE", "KILLER"]).optional(),
  spec: z.unknown().optional(),
  note: z.string().trim().max(2000).optional(),
});

// GET — 유형 1개 + 활성 정의 + 버전. PATCH — 이름/구조 필드 직접 수정. DELETE — 아카이브(소프트 삭제).

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
  const versions = await listCustomTypeVersions(staff.academyId, typeId);
  return NextResponse.json({
    type: active.type,
    spec: active.spec,
    source: active.source,
    versions,
  });
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

  const { name, spec: rawSpec, note, ...definition } = parsed.data;
  try {
    if (name) {
      const ok = await renameCustomType(staff.academyId, typeId, name);
      if (!ok) return NextResponse.json({ error: "Custom type not found" }, { status: 404 });
    }

    let version: number | undefined;
    if (rawSpec !== undefined) {
      // 스튜디오 '버전 저장': 클라이언트가 들고 있던 전체 spec 을 새 버전으로 활성화.
      // parseCompiledCustomType 의 catch 폴백이 손상 필드를 흡수한다.
      const spec = parseCompiledCustomType(rawSpec);
      const saved = await reviseCustomTypeVersion({
        academyId: staff.academyId,
        typeId,
        spec,
        instruction: note?.trim() || "스튜디오 편집",
      });
      version = saved.version;
    } else if (Object.values(definition).some((v) => v !== undefined)) {
      const result = await editCustomTypeDefinition(staff.academyId, typeId, definition);
      version = result?.version;
    }
    return NextResponse.json({ ok: true, version });
  } catch (error) {
    const message = error instanceof Error ? error.message : "유형 수정에 실패했습니다.";
    console.error(`[custom-type-edit] academy=${staff.academyId} type=${typeId} failed: ${message}`);
    return NextResponse.json({ error: "유형 수정에 실패했습니다." }, { status: 500 });
  }
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
