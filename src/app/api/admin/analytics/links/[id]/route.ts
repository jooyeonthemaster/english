// 추적 링크 — PATCH 수정 · DELETE 삭제(클릭 0) 또는 비활성(클릭 있음). SUPER_ADMIN 전용.
// 계약: docs/analytics/analytics-spec.md §2.5, §10

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { validateLinkPatch } from "@/lib/analytics/tracked-links";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

type RouteContext = { params: Promise<{ id: string }> };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

async function ensureSuperAdmin(): Promise<boolean> {
  try {
    await requireAdminAuth("SUPER_ADMIN");
    return true;
  } catch {
    return false;
  }
}

export async function PATCH(req: Request, { params }: RouteContext) {
  if (!(await ensureSuperAdmin())) return json({ error: "최고 관리자 권한이 필요합니다." }, 403);
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "요청 본문(JSON)을 읽을 수 없습니다." }, 400);
  }
  const v = validateLinkPatch(body);
  if (!v.ok) return json({ error: "입력값을 확인하세요.", fieldErrors: v.errors }, 400);

  const current = await prisma.analyticsTrackedLink.findUnique({ where: { id }, select: { id: true, slug: true, clicks: true } });
  if (!current) return json({ error: "추적 링크를 찾을 수 없습니다." }, 404);

  const patch = v.value;
  const slugChanged = patch.slug !== undefined && patch.slug !== current.slug;
  if (slugChanged && current.clicks > 0) {
    // 이미 배포돼 클릭이 쌓인 주소를 바꾸면 기존 링크가 끊기고 세션 귀속(trackedLink=slug)도 갈라진다.
    return json(
      {
        error: "클릭이 쌓인 링크는 짧은 주소를 바꿀 수 없습니다. 새 링크를 만드세요.",
        fieldErrors: { slug: "클릭이 있는 링크는 주소를 바꿀 수 없습니다" },
      },
      409,
    );
  }

  try {
    const link = await prisma.$transaction(async (tx) => {
      const updated = await tx.analyticsTrackedLink.update({ where: { id }, data: patch, select: { id: true, slug: true, isActive: true } });
      if (slugChanged) {
        // 클릭 0 이어도 봇 클릭 행은 있을 수 있다 — 비정규화 slug 를 맞춘다.
        await tx.analyticsLinkClick.updateMany({ where: { linkId: id }, data: { slug: updated.slug } });
      }
      return updated;
    });
    return json({ link });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return json({ error: "이미 쓰고 있는 짧은 주소입니다.", fieldErrors: { slug: "이미 쓰고 있는 짧은 주소입니다" } }, 409);
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return json({ error: "추적 링크를 찾을 수 없습니다." }, 404);
    }
    console.error("[analytics] tracked link update failed", id, err);
    return json({ error: "추적 링크를 수정하지 못했습니다." }, 500);
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  if (!(await ensureSuperAdmin())) return json({ error: "최고 관리자 권한이 필요합니다." }, 403);
  const { id } = await params;

  const current = await prisma.analyticsTrackedLink.findUnique({ where: { id }, select: { id: true, clicks: true } });
  if (!current) return json({ error: "추적 링크를 찾을 수 없습니다." }, 404);

  try {
    if (current.clicks === 0) {
      await prisma.$transaction([
        // 봇 클릭 행(clicks 에 안 잡힘)만 남아 있을 수 있다 — 고아 행을 함께 지운다.
        prisma.analyticsLinkClick.deleteMany({ where: { linkId: id } }),
        prisma.analyticsTrackedLink.delete({ where: { id } }),
      ]);
      return json({ result: "deleted" as const });
    }
    // 클릭 기록이 있으면 통계 보존을 위해 비활성만(/go 는 "/" 로 보낸다).
    await prisma.analyticsTrackedLink.update({ where: { id }, data: { isActive: false } });
    return json({ result: "deactivated" as const });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return json({ error: "추적 링크를 찾을 수 없습니다." }, 404);
    }
    console.error("[analytics] tracked link delete failed", id, err);
    return json({ error: "추적 링크를 삭제하지 못했습니다." }, 500);
  }
}
