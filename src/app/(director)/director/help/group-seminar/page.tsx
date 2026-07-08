import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOpenGroupSeminars } from "@/actions/help-center";
import { groupSeminarBrowseLink } from "@/lib/help-center";
import { getBankDepositConfig } from "@/lib/bank-deposit";
import { GroupSeminarBrowseClient } from "@/components/help-center/group-seminar-browse-client";

export const metadata: Metadata = {
  title: "단체 세미나 신청",
};

export const dynamic = "force-dynamic";

export default async function GroupSeminarPage({
  searchParams,
}: {
  searchParams: Promise<{ seminar?: string }>;
}) {
  const { seminar: focusId } = await searchParams;
  const staff = await getStaffSession();
  if (!staff) {
    // QR로 로그아웃 상태에서 진입해도 로그인 후 해당 세미나로 되돌아오게 콜백을 보존.
    const target = focusId ? groupSeminarBrowseLink(focusId) : "/director/help/group-seminar";
    redirect(`/login?callbackUrl=${encodeURIComponent(target)}`);
  }

  const [profile, seminars] = await Promise.all([
    prisma.staff.findUnique({
      where: { id: staff.id },
      select: { name: true, phone: true, email: true },
    }),
    getOpenGroupSeminars(),
  ]);

  const bank = getBankDepositConfig();

  return (
    <GroupSeminarBrowseClient
      prefill={{
        applicantName: profile?.name || staff.name || "",
        phone: profile?.phone || "",
        email: profile?.email || staff.email || "",
        academyName: staff.academyName || "",
      }}
      initialSeminars={seminars}
      focusId={focusId ?? null}
      bankAccount={{
        enabled: bank.enabled,
        bankName: bank.bankName,
        accountNumber: bank.accountNumber,
        accountHolder: bank.accountHolder,
      }}
    />
  );
}
