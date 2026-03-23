import { redirect } from "next/navigation";
import { getParentSession } from "@/lib/auth-parent";
import { getChildGrades, getParentDashboard } from "@/actions/parent";
import { GradesClient } from "./grades-client";

export default async function ParentGradesPage() {
  const session = await getParentSession();
  if (!session) redirect("/parent/login");

  const dashboard = await getParentDashboard();
  const children = dashboard.children;

  // Pre-fetch grades for the first child
  const firstChildGrades =
    children.length > 0 ? await getChildGrades(children[0].id) : null;

  return (
    <GradesClient
      children={children}
      initialGrades={firstChildGrades}
    />
  );
}
