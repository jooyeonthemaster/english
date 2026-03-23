import { redirect } from "next/navigation";
import { getParentSession } from "@/lib/auth-parent";
import { getChildBillingInfo, getParentDashboard } from "@/actions/parent";
import { BillingClient } from "./billing-client";

export default async function ParentBillingPage() {
  const session = await getParentSession();
  if (!session) redirect("/parent/login");

  const dashboard = await getParentDashboard();
  const children = dashboard.children;

  const initialBilling =
    children.length > 0 ? await getChildBillingInfo(children[0].id) : null;

  return (
    <BillingClient
      children={children}
      initialBilling={initialBilling}
    />
  );
}
