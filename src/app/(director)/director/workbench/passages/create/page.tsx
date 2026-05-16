import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import {
  getAcademySchools,
  getWorkbenchPassages,
  getPassageCollections,
  getM1DraftCollections,
  getAcademyM1DraftCollectionMembership,
} from "@/actions/workbench";
import { PassageCreateClient } from "@/components/workbench/passage-create-client";

export default async function PassageCreatePage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const [schools, recentData, collections, draftCollections, draftMembership] =
    await Promise.all([
      getAcademySchools(staff.academyId),
      getWorkbenchPassages(staff.academyId, { limit: 20, page: 1 }),
      getPassageCollections(staff.academyId),
      getM1DraftCollections(staff.academyId),
      getAcademyM1DraftCollectionMembership(staff.academyId),
    ]);

  return (
    <PassageCreateClient
      schools={schools}
      recentPassages={recentData.passages}
      initialCollections={collections as any}
      draftCollections={draftCollections as any}
      draftMembership={draftMembership}
    />
  );
}
