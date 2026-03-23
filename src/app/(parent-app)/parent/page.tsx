import { redirect } from "next/navigation";
import { getParentSession } from "@/lib/auth-parent";
import { getParentDashboard } from "@/actions/parent";
import { ParentHomeClient } from "./parent-home-client";

export default async function ParentHomePage() {
  const session = await getParentSession();
  if (!session) redirect("/parent/login");

  const data = await getParentDashboard();

  return <ParentHomeClient data={data} />;
}
