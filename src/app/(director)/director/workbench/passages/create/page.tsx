import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import {
  getAcademySchools,
  getWorkbenchPassages,
  getPassageCollections,
  getM1DraftCollections,
  getAcademyM1DraftCollectionMembership,
} from "@/actions/workbench";
import { PassageRegistrationClient } from "@/components/workbench/passage-registration-client";
import type { PassageRegistrationProps } from "@/components/workbench/passage-registration-client";

export default async function PassageRegistrationPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const [schools, recentData, collections, draftCollections, draftMembership] =
    await Promise.all([
      getAcademySchools(staff.academyId),
      getWorkbenchPassages(staff.academyId, {
        limit: 20,
        page: 1,
        analyzedOnly: true,
      }),
      getPassageCollections(staff.academyId),
      getM1DraftCollections(staff.academyId),
      getAcademyM1DraftCollectionMembership(staff.academyId),
    ]);

  return (
    <PassageRegistrationClient
      academyId={staff.academyId}
      schools={schools}
      recentPassages={recentData.passages}
      initialCollections={
        collections as PassageRegistrationProps["initialCollections"]
      }
      draftCollections={
        draftCollections as PassageRegistrationProps["draftCollections"]
      }
      draftMembership={draftMembership}
    />
  );
}
