import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getCreditSummary } from "@/lib/credits";
import {
  getM1DraftCollections,
  getAcademyM1DraftCollectionMembership,
} from "@/actions/workbench";
import { BulkExtractClient } from "./_components/bulk-extract-client";

export const dynamic = "force-dynamic";

export default async function BulkExtractionImportPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login?callbackUrl=/director/workbench/passages/import");

  const [credit, collections, membershipRaw] = await Promise.all([
    getCreditSummary(staff.academyId),
    getM1DraftCollections(staff.academyId),
    getAcademyM1DraftCollectionMembership(staff.academyId),
  ]);

  const collectionMembership = Object.fromEntries(
    Object.entries(membershipRaw).map(([k, v]) => [k, new Set(v)]),
  );

  return (
    <BulkExtractClient
      initialCreditBalance={credit.balance}
      initialCollections={collections}
      initialCollectionMembership={collectionMembership}
    />
  );
}
