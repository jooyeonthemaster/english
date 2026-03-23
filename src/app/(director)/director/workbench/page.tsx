import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getWorkbenchStats } from "@/actions/workbench";
import { WorkbenchHub } from "@/components/workbench/workbench-hub";

export default async function WorkbenchPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const stats = await getWorkbenchStats(staff.academyId);

  return <WorkbenchHub stats={stats} />;
}
