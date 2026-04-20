import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getCreditSummary } from "@/lib/credits";
import { BulkExtractClient } from "./_components/bulk-extract-client";

export const dynamic = "force-dynamic";

export default async function BulkExtractionImportPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login?callbackUrl=/director/workbench/passages/import");

  const credit = await getCreditSummary(staff.academyId);

  return <BulkExtractClient initialCreditBalance={credit.balance} />;
}
