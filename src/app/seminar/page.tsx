import type { Metadata } from "next";
import { getPublicGroupSeminars } from "@/actions/public-seminar";
import { getBankDepositConfig } from "@/lib/bank-deposit";
import { PublicSeminarClient } from "@/components/help-center/public-seminar-client";

export const metadata: Metadata = {
  title: "단체 세미나 신청 | SMOAT",
  // 공개 신청 페이지지만 검색 노출은 막는다(링크·랜딩 유입 전용).
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PublicSeminarPage() {
  const seminars = await getPublicGroupSeminars();
  const bank = getBankDepositConfig();
  return (
    <PublicSeminarClient
      seminars={seminars}
      bankAccount={{
        enabled: bank.enabled,
        bankName: bank.bankName,
        accountNumber: bank.accountNumber,
        accountHolder: bank.accountHolder,
      }}
    />
  );
}
