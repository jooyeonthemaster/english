import { redirect } from "next/navigation";
import { UserResultsDisabled } from "@/components/shared/user-results-disabled";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

export default function ReviewRedirect() {
  if (!FEATURE_FLAGS.SHOW_USER_RESULTS) {
    return <UserResultsDisabled homeHref="/student" />;
  }

  redirect("/student/learn/analytics");
}
