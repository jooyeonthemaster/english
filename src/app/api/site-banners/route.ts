// ============================================================================
// GET /api/site-banners — 현재 로그인한 뷰어(원장/강사/학생)에게 노출할
// 활성 배너 목록을 우선순위 순으로 반환한다. 클라이언트 SiteBannerHost가 큐로
// 소비한다(하나 닫으면 다음).
//
// 저크레딧 자동노출: autoOpenOnLowCredit 배너는 원장 뷰어의 잔액이 임계값 이하일
// 때 forceShow=true 로 내려 이전 닫힘 여부와 무관하게 다시 뜨게 한다.
// ============================================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/auth";
import { getStudentSession } from "@/lib/auth-student";
import { getSpecialAccount } from "@/lib/special-accounts";
import { LOW_CREDIT_THRESHOLD } from "@/lib/feedback-program";
import {
  parseAudiences,
  withTemplateDefaults,
  type BannerAudience,
  type BannerDismissMode,
  type BannerType,
} from "@/lib/site-banners/templates";
import type { SiteBannerView, SiteBannersResponse } from "@/lib/site-banners/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Viewer {
  role: BannerAudience;
  academyId: string | null;
  isSpecial: boolean;
}

async function resolveViewer(): Promise<Viewer | null> {
  const staff = await getStaffSession().catch(() => null);
  if (staff && (staff.role === "DIRECTOR" || staff.role === "TEACHER")) {
    return {
      role: staff.role as BannerAudience,
      academyId: staff.academyId ?? null,
      isSpecial: Boolean(getSpecialAccount(staff.email)),
    };
  }
  const student = await getStudentSession().catch(() => null);
  if (student) {
    return { role: "STUDENT", academyId: student.academyId ?? null, isSpecial: false };
  }
  return null;
}

export async function GET() {
  const viewer = await resolveViewer();
  if (!viewer) {
    return NextResponse.json<SiteBannersResponse>({ banners: [] });
  }

  const now = new Date();
  const rows = await prisma.siteBanner.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  // Filter to this viewer's audience. Special accounts skip the feedback-invite
  // banner (they have a bespoke welcome flow), preserving prior behavior.
  const visible = rows.filter((b) => {
    if (!parseAudiences(b.audiences).includes(viewer.role)) return false;
    if (viewer.isSpecial && b.templateKey === "feedback-invite") return false;
    return true;
  });

  // Low-credit override — only for DIRECTOR viewers with a low balance.
  let lowCredit = false;
  if (viewer.role === "DIRECTOR" && viewer.academyId && visible.some((b) => b.autoOpenOnLowCredit)) {
    const bal = await prisma.creditBalance
      .findUnique({ where: { academyId: viewer.academyId }, select: { balance: true } })
      .catch(() => null);
    lowCredit = bal !== null && bal.balance <= LOW_CREDIT_THRESHOLD;
  }

  const banners: SiteBannerView[] = visible.map((b) => ({
    id: b.id,
    type: b.type as BannerType,
    templateKey: b.templateKey,
    content:
      b.type === "TEMPLATE"
        ? withTemplateDefaults(b.templateKey, b.content as Record<string, unknown>)
        : {},
    imageUrl: b.imageUrl,
    imageAlt: b.imageAlt,
    linkUrl: b.linkUrl,
    dismissMode: b.dismissMode as BannerDismissMode,
    showDismissButton: b.showDismissButton,
    priority: b.priority,
    version: b.updatedAt.toISOString(),
    forceShow: lowCredit && b.autoOpenOnLowCredit,
  }));

  return NextResponse.json<SiteBannersResponse>({ banners });
}
