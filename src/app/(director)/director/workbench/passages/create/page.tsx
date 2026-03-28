import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getAcademySchools, getWorkbenchPassages, getPassageCollections } from "@/actions/workbench";
import { PassageCreateClient } from "@/components/workbench/passage-create-client";

export default async function PassageCreatePage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const [schools, recentData, collections] = await Promise.all([
    getAcademySchools(staff.academyId),
    getWorkbenchPassages(staff.academyId, { limit: 20, page: 1 }),
    getPassageCollections(staff.academyId),
  ]);

  return (
    <PassageCreateClient
      schools={schools}
      recentPassages={recentData.passages}
      initialCollections={collections as any}
    />
  );
}
