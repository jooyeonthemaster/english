import { redirect } from "next/navigation";

// Merged into the unified "크레딧 요금제 관리" page (/admin/credit-plans).
// Lands on the subscription-plans tab. Kept as a redirect so existing links keep working.
export default function AdminPlansPage() {
  redirect("/admin/credit-plans?tab=plans");
}
