import { redirect } from "next/navigation";
import { getParentSession } from "@/lib/auth-parent";
import { getChildGrades, getParentDashboard } from "@/actions/parent";
import { GradesClient } from "./grades-client";
import { UserResultsDisabled } from "@/components/shared/user-results-disabled";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

export default async function ParentGradesPage() {
  const session = await getParentSession();
  if (!session) redirect("/parent/login");
  if (!FEATURE_FLAGS.SHOW_USER_RESULTS) {
    return <UserResultsDisabled homeHref="/parent" />;
  }

  const dashboard = await getParentDashboard();
  const children = dashboard.children;

  // Pre-fetch grades for the first child
  const firstChildGrades =
    children.length > 0 ? await getChildGrades(children[0].id) : null;

  return (
    <GradesClient
      childSummaries={children}
      initialGrades={firstChildGrades}
    />
  );
}
