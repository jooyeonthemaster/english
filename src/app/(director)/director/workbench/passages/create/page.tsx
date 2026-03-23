import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getAcademySchools } from "@/actions/workbench";
import { PassageCreateClient } from "@/components/workbench/passage-create-client";

export default async function PassageCreatePage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const schools = await getAcademySchools(staff.academyId);

  return <PassageCreateClient schools={schools} />;
}
