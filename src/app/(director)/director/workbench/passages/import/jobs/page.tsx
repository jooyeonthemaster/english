import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import {
  getM1DraftCollections,
  getAcademyM1DraftCollectionMembership,
} from "@/actions/workbench";
import { ExtractionManageClient } from "../_components/extraction-manage-client";

export const dynamic = "force-dynamic";

export default async function ExtractionJobsPage() {
  const staff = await getStaffSession();
  if (!staff) {
    redirect("/login?callbackUrl=/director/workbench/passages/import/jobs");
  }

  const [collections, membershipRaw] = await Promise.all([
    getM1DraftCollections(staff.academyId),
    getAcademyM1DraftCollectionMembership(staff.academyId),
  ]);

  const collectionMembership = Object.fromEntries(
    Object.entries(membershipRaw).map(([k, v]) => [k, new Set(v)]),
  );

  return (
    <ExtractionManageClient
      academyId={staff.academyId}
      initialCollections={collections}
      initialCollectionMembership={collectionMembership}
    />
  );
}
