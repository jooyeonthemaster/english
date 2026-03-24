import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { GeneratePageClient } from "./generate-page-client";

export default async function GeneratePage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  return <GeneratePageClient academyId={staff.academyId} />;
}
