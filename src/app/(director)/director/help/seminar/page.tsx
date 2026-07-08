import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMySeminarRequests } from "@/actions/help-center";
import { SEMINAR_WEEKLY_CAPACITY } from "@/lib/help-center";
import { getSeminarHeroImageUrl } from "@/lib/platform-settings";
import { SeminarClient } from "@/components/help-center/seminar-client";

export const metadata: Metadata = {
  title: "1:1 세미나 신청",
};

export const dynamic = "force-dynamic";

export default async function SeminarPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  // 이번 주(일요일 시작) 전체 신청 건수 — 히어로의 "남은 상담 슬롯" 표시용
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [profile, requests, weeklyBooked, heroImageUrl] = await Promise.all([
    prisma.staff.findUnique({
      where: { id: staff.id },
      select: { name: true, phone: true, email: true },
    }),
    getMySeminarRequests(),
    prisma.seminarRequest.count({
      where: {
        createdAt: { gte: weekStart, lt: weekEnd },
        status: { not: "CANCELED" },
      },
    }),
    getSeminarHeroImageUrl(),
  ]);

  return (
    <SeminarClient
      prefill={{
        applicantName: profile?.name || staff.name || "",
        phone: profile?.phone || "",
        email: profile?.email || staff.email || "",
        academyName: staff.academyName || "",
      }}
      initialRequests={requests}
      weeklyBooked={weeklyBooked}
      weeklyCapacity={SEMINAR_WEEKLY_CAPACITY}
      heroImageUrl={heroImageUrl}
    />
  );
}
