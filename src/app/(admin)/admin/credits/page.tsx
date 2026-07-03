import { redirect } from "next/navigation";

// Merged into the unified "크레딧 요금제 관리" page (/admin/credit-plans).
// Kept as a redirect so existing links / bookmarks keep working.
export default function AdminCreditsPage() {
  redirect("/admin/credit-plans");
}
