import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMySeminarRequests } from "@/actions/help-center";
import { SeminarClient } from "@/components/help-center/seminar-client";

export const metadata: Metadata = {
  title: "1:1 세미나 신청",
};

export const dynamic = "force-dynamic";

export default async function SeminarPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const [profile, requests] = await Promise.all([
    prisma.staff.findUnique({
      where: { id: staff.id },
      select: { name: true, phone: true, email: true },
    }),
    getMySeminarRequests(),
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
    />
  );
}
